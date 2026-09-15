#!/usr/bin/env python3
"""
Build full-coverage Fiji TX90p bivariate climate-index layers from NEX-GDDP-CMIP6.

Why this replaces the earlier TX90p processor:
  Earlier processor used NEX source grid points as the display units:
      NEX grid point -> one H3 cell
  That produced sparse maps because Fiji only had ~23 NEX grid points inside the
  country polygon.

This processor uses the intended logic:
      Fiji boundary -> full H3 coverage -> nearest NEX grid value per H3 cell

Climate math remains the same:
  - For each model, compute local T90 baseline from historical daily tasmax.
  - Baseline default: 1981-2010.
  - For each future year, compute TX90p: percent of days where tasmax > local T90.
  - Ensemble value: mean TX90p across models.
  - Uncertainty: inter-model max-min spread.
  - Reliability score: 1 - normalized uncertainty.
  - Bivariate color: risk class x reliability class.

Outputs are endpoint-compatible with the current backend:
  backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble/yearly/ssp585_2030.geojson

Run small test:
  python scripts/build_nex_tx90p_bivariate_fiji.py \
    --models ACCESS-CM2 CanESM5 GFDL-ESM4 \
    --experiments historical ssp585 \
    --future-start 2015 \
    --future-end 2016

Run full layer:
  python scripts/build_nex_tx90p_bivariate_fiji.py \
    --models ACCESS-CM2 CanESM5 GFDL-ESM4 MPI-ESM1-2-HR NorESM2-MM \
    --experiments historical ssp585
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import xarray as xr
from shapely.geometry import Point, Polygon
from shapely.ops import transform, unary_union
from shapely.prepared import prep

try:
    import h3
except ImportError as exc:
    raise SystemExit(
        "Missing dependency: h3\n"
        "Install with:\n"
        "  python -m pip install h3"
    ) from exc


DEFAULT_IN_DIR = Path("data/climate/raw/nex_gddp_cmip6/fiji_subset")
DEFAULT_OUT_DIR = Path("backend/cache/climate_indices")

DEFAULT_MODELS = [
    "ACCESS-CM2",
    "CanESM5",
    "GFDL-ESM4",
    "MPI-ESM1-2-HR",
    "NorESM2-MM",
]

FIJI_GEOMETRY_CANDIDATES = [
    Path("data/reference/pict/fji/adm0.geojson"),
    Path("data/reference/fiji_admin_adm0.geojson"),
    Path("data/reference/fiji_admin_adm1.geojson"),
    Path("data/reference/fiji_admin_adm2.geojson"),
    Path("data/reference/fiji_tikina.geojson"),
]

# Rows: risk low -> high. Columns: reliability low -> high.
# The left column is deliberately muted/dark because it means less reliable.
# The right column is more saturated because it means stronger model agreement.
BIVARIATE_COLOR_MATRIX: dict[str, dict[str, str]] = {
    "very_low": {
        "low": "#21164f",
        "medium": "#46328c",
        "high": "#7c6bd6",
    },
    "low": {
        "low": "#302354",
        "medium": "#6750a4",
        "high": "#a58af0",
    },
    "medium": {
        "low": "#553642",
        "medium": "#94705c",
        "high": "#ddb579",
    },
    "high": {
        "low": "#763d1f",
        "medium": "#b56825",
        "high": "#f59e0b",
    },
    "very_high": {
        "low": "#84280f",
        "medium": "#c2410c",
        "high": "#ff6b00",
    },
}


class H3CompatError(RuntimeError):
    pass


def slugify(value: str) -> str:
    return value.lower().replace("_", "-").replace(" ", "-").replace("/", "-")


def normalize_lon_180(lon: float) -> float:
    value = ((float(lon) + 180.0) % 360.0) - 180.0
    if math.isclose(value, -180.0) and lon > 0:
        return 180.0
    return value


def shift_lon_to_360(lon: float) -> float:
    lon_180 = normalize_lon_180(lon)
    return lon_180 + 360.0 if lon_180 < 0 else lon_180


def shift_negative_lon_to_360(x: float, y: float, z: float | None = None):
    shifted_x = x + 360.0 if x < 0 else x
    if z is None:
        return shifted_x, y
    return shifted_x, y, z


def h3_latlng_to_cell(lat: float, lon: float, resolution: int) -> str:
    if hasattr(h3, "latlng_to_cell"):
        return h3.latlng_to_cell(lat, lon, resolution)
    if hasattr(h3, "geo_to_h3"):
        return h3.geo_to_h3(lat, lon, resolution)
    if hasattr(h3, "latLngToCell"):
        return h3.latLngToCell(lat, lon, resolution)
    raise H3CompatError("Unsupported h3 Python API: no lat/lng to cell function.")


def h3_cell_to_latlng(cell: str) -> tuple[float, float]:
    if hasattr(h3, "cell_to_latlng"):
        lat, lon = h3.cell_to_latlng(cell)
        return float(lat), float(lon)
    if hasattr(h3, "h3_to_geo"):
        lat, lon = h3.h3_to_geo(cell)
        return float(lat), float(lon)
    if hasattr(h3, "cellToLatLng"):
        lat, lon = h3.cellToLatLng(cell)
        return float(lat), float(lon)
    raise H3CompatError("Unsupported h3 Python API: no cell to lat/lng function.")


def h3_grid_disk(cell: str, ring_size: int) -> set[str]:
    if ring_size <= 0:
        return {cell}
    if hasattr(h3, "grid_disk"):
        return set(h3.grid_disk(cell, ring_size))
    if hasattr(h3, "k_ring"):
        return set(h3.k_ring(cell, ring_size))
    if hasattr(h3, "gridDisk"):
        return set(h3.gridDisk(cell, ring_size))
    raise H3CompatError("Unsupported h3 Python API: no grid disk/k-ring function.")


def h3_cell_to_boundary_lonlat(cell: str) -> list[list[float]]:
    if hasattr(h3, "cell_to_boundary"):
        boundary = h3.cell_to_boundary(cell)
        coords = [[float(lon), float(lat)] for lat, lon in boundary]
    elif hasattr(h3, "h3_to_geo_boundary"):
        boundary = h3.h3_to_geo_boundary(cell, geo_json=True)
        coords = [[float(lon), float(lat)] for lon, lat in boundary]
    elif hasattr(h3, "cellToBoundary"):
        boundary = h3.cellToBoundary(cell)
        coords = [[float(lon), float(lat)] for lat, lon in boundary]
    else:
        raise H3CompatError("Unsupported h3 Python API: no cell boundary function.")

    coords = [[normalize_lon_180(lon), lat] for lon, lat in coords]

    if coords[0] != coords[-1]:
        coords.append(coords[0])

    return coords


def h3_cell_to_shifted_polygon(cell: str) -> Polygon | None:
    try:
        boundary = h3_cell_to_boundary_lonlat(cell)
        shifted = [[shift_lon_to_360(lon), lat] for lon, lat in boundary]
        polygon = Polygon(shifted)
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
        if polygon.is_empty:
            return None
        return polygon
    except Exception:
        return None


def load_fiji_geometry() -> dict[str, Any]:
    existing = [path for path in FIJI_GEOMETRY_CANDIDATES if path.exists()]

    if not existing:
        tried = "\n".join(f"  - {path}" for path in FIJI_GEOMETRY_CANDIDATES)
        raise FileNotFoundError("Could not find Fiji boundary. Tried:\n" + tried)

    path = existing[0]
    gdf = gpd.read_file(path)

    if gdf.empty:
        raise ValueError(f"Boundary file is empty: {path}")

    if gdf.crs is not None:
        gdf = gdf.to_crs("EPSG:4326")

    geometry = unary_union(gdf.geometry)
    if not geometry.is_valid:
        geometry = geometry.buffer(0)

    shifted_geometry = transform(shift_negative_lon_to_360, geometry)
    if not shifted_geometry.is_valid:
        shifted_geometry = shifted_geometry.buffer(0)

    return {
        "path": str(path),
        "geometry": geometry,
        "shifted_geometry": shifted_geometry,
        "prepared_shifted_geometry": prep(shifted_geometry),
    }


def iter_polygon_parts(geometry):
    if geometry.geom_type == "Polygon":
        yield geometry
    elif geometry.geom_type == "MultiPolygon":
        yield from geometry.geoms
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from iter_polygon_parts(part)


def generate_full_h3_coverage(
    *,
    fiji: dict[str, Any],
    h3_resolution: int,
    sample_step_degrees: float,
    neighbor_ring: int,
) -> list[str]:
    shifted_geometry = fiji["shifted_geometry"]
    prepared = fiji["prepared_shifted_geometry"]
    minx, miny, maxx, maxy = shifted_geometry.bounds

    seed_cells: set[str] = set()

    # Seed one cell from every polygon part, so small islands are not completely
    # missed by the regular sample grid.
    for polygon in iter_polygon_parts(shifted_geometry):
        point = polygon.representative_point()
        seed_lon_360 = float(point.x)
        seed_lon_180 = normalize_lon_180(seed_lon_360)
        seed_cells.add(h3_latlng_to_cell(float(point.y), seed_lon_180, h3_resolution))

    lat = miny
    while lat <= maxy + 1e-9:
        lon_360 = minx
        while lon_360 <= maxx + 1e-9:
            point = Point(lon_360, lat)
            if prepared.contains(point) or prepared.touches(point):
                lon_180 = normalize_lon_180(lon_360)
                seed_cells.add(h3_latlng_to_cell(lat, lon_180, h3_resolution))
            lon_360 += sample_step_degrees
        lat += sample_step_degrees

    candidate_cells: set[str] = set()
    for cell in seed_cells:
        candidate_cells.update(h3_grid_disk(cell, neighbor_ring))

    coverage_cells: list[str] = []
    for cell in candidate_cells:
        polygon = h3_cell_to_shifted_polygon(cell)
        if polygon is None:
            continue
        if polygon.intersects(shifted_geometry):
            coverage_cells.append(cell)

    return sorted(set(coverage_cells))


def convert_temperature_to_celsius(values: np.ndarray, units: str) -> np.ndarray:
    units_clean = units.strip().lower()

    if units_clean in {"k", "kelvin"}:
        return values - 273.15

    if units_clean in {
        "c",
        "degc",
        "degree_celsius",
        "degrees_celsius",
        "celsius",
        "°c",
    }:
        return values

    print(f"WARNING: unknown temperature units {units!r}; assuming Celsius.")
    return values


def safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)
    except Exception:
        return None
    if np.isnan(result) or np.isinf(result):
        return None
    return result


def risk_class_from_value(value: float) -> str:
    if value < 20:
        return "very_low"
    if value < 40:
        return "low"
    if value < 60:
        return "medium"
    if value < 80:
        return "high"
    return "very_high"


def reliability_class_from_score(score: float) -> str:
    if score < 1 / 3:
        return "low"
    if score < 2 / 3:
        return "medium"
    return "high"


def bivariate_color(risk_class: str, reliability_class: str) -> str:
    return BIVARIATE_COLOR_MATRIX.get(risk_class, BIVARIATE_COLOR_MATRIX["medium"]).get(
        reliability_class,
        BIVARIATE_COLOR_MATRIX["medium"]["medium"],
    )


def find_year_files(in_dir: Path, *, model: str, experiment: str, year: int) -> list[Path]:
    year_dir = in_dir / model / experiment / str(year)
    if not year_dir.exists():
        return []
    return sorted(year_dir.glob("*.nc"))


def find_first_available_files(
    in_dir: Path,
    *,
    model: str,
    experiment: str,
    start_year: int,
    end_year: int,
) -> list[Path]:
    for year in range(start_year, end_year + 1):
        files = find_year_files(in_dir, model=model, experiment=experiment, year=year)
        if files:
            return files
    return []


def box_name_from_path(path: Path) -> str:
    name = path.stem
    if "fiji_east_176_180" in name:
        return "fiji_east_176_180"
    if "fiji_west_minus180_minus178" in name:
        return "fiji_west_minus180_minus178"
    return "unknown_box"


def build_model_source_grid_index(
    *,
    in_dir: Path,
    model: str,
    variable: str,
    baseline_start: int,
    baseline_end: int,
) -> dict[str, Any]:
    sample_files = find_first_available_files(
        in_dir,
        model=model,
        experiment="historical",
        start_year=baseline_start,
        end_year=baseline_end,
    )

    if not sample_files:
        raise FileNotFoundError(
            f"No historical sample files found for {model} between {baseline_start}-{baseline_end}"
        )

    records: list[dict[str, Any]] = []

    for sample_file in sample_files:
        box_name = box_name_from_path(sample_file)
        ds = xr.open_dataset(sample_file, decode_times=True)

        if variable not in ds:
            ds.close()
            raise KeyError(f"{variable!r} not found in {sample_file}")

        lat_values = ds["lat"].values
        lon_values = ds["lon"].values

        # NEX subset files currently have 1D lat/lon, but support a defensive
        # path in case xarray returns them in another shape.
        if lat_values.ndim != 1 or lon_values.ndim != 1:
            ds.close()
            raise ValueError(
                f"Expected 1D lat/lon coordinates in {sample_file}; "
                f"got lat ndim={lat_values.ndim}, lon ndim={lon_values.ndim}"
            )

        for lat_index, lat_value in enumerate(lat_values):
            for lon_index, lon_value in enumerate(lon_values):
                lat_f = float(lat_value)
                lon_raw = float(lon_value)
                lon_180 = normalize_lon_180(lon_raw)
                lon_360 = shift_lon_to_360(lon_raw)

                point_id = f"{box_name}:{lat_f:.6f}:{lon_180:.6f}"

                records.append(
                    {
                        "point_id": point_id,
                        "box_name": box_name,
                        "lat_index": int(lat_index),
                        "lon_index": int(lon_index),
                        "lat": lat_f,
                        "lon": lon_180,
                        "lon_360": lon_360,
                    }
                )

        ds.close()

    if not records:
        raise RuntimeError(f"No source grid points found for {model}")

    records_by_box: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        records_by_box[record["box_name"]].append(record)

    print(f"  NEX source grid points in downloaded Fiji boxes: {len(records)}")

    return {
        "model": model,
        "records": records,
        "records_by_box": dict(records_by_box),
    }


def build_h3_to_nearest_source_map(
    *,
    h3_cells: list[str],
    source_index: dict[str, Any],
) -> dict[str, str]:
    source_records = source_index["records"]
    source_lats = np.array([record["lat"] for record in source_records], dtype="float64")
    source_lons_360 = np.array([record["lon_360"] for record in source_records], dtype="float64")

    mapping: dict[str, str] = {}

    for cell in h3_cells:
        cell_lat, cell_lon = h3_cell_to_latlng(cell)
        cell_lon_360 = shift_lon_to_360(cell_lon)

        mean_lat_rad = np.deg2rad((source_lats + cell_lat) / 2.0)
        dx = (source_lons_360 - cell_lon_360) * np.cos(mean_lat_rad)
        dy = source_lats - cell_lat
        distances = dx * dx + dy * dy
        nearest_index = int(np.nanargmin(distances))
        mapping[cell] = source_records[nearest_index]["point_id"]

    return mapping


def read_selected_points(
    path: Path,
    *,
    variable: str,
    records_for_box: list[dict[str, Any]],
) -> np.ndarray:
    ds = xr.open_dataset(path, decode_times=True)

    arr = ds[variable]
    values = arr.values.astype("float32")
    units = str(arr.attrs.get("units", ""))
    values_c = convert_temperature_to_celsius(values, units)

    lat_indexes = np.array([record["lat_index"] for record in records_for_box], dtype=int)
    lon_indexes = np.array([record["lon_index"] for record in records_for_box], dtype=int)

    selected = values_c[:, lat_indexes, lon_indexes]
    ds.close()
    return selected


def compute_model_t90_baseline(
    *,
    in_dir: Path,
    model: str,
    variable: str,
    source_index: dict[str, Any],
    baseline_start: int,
    baseline_end: int,
) -> dict[str, Any]:
    print(f"\nComputing T90 baseline for {model}")
    print("--------------------------------")

    values_by_point: dict[str, list[np.ndarray]] = defaultdict(list)
    source_files: list[str] = []

    for year in range(baseline_start, baseline_end + 1):
        files = find_year_files(in_dir, model=model, experiment="historical", year=year)

        if not files:
            print(f"  WARNING: missing historical year {year}")
            continue

        for path in files:
            box_name = box_name_from_path(path)
            records_for_box = source_index["records_by_box"].get(box_name, [])
            if not records_for_box:
                continue

            selected = read_selected_points(
                path,
                variable=variable,
                records_for_box=records_for_box,
            )

            for point_col, record in enumerate(records_for_box):
                values_by_point[record["point_id"]].append(selected[:, point_col])

            source_files.append(str(path))

    if not values_by_point:
        raise RuntimeError(f"No baseline values found for {model}")

    t90_by_point: dict[str, float] = {}
    for point_id, chunks in values_by_point.items():
        all_values = np.concatenate(chunks)
        t90_by_point[point_id] = float(np.nanpercentile(all_values, 90))

    t90_values = np.array(list(t90_by_point.values()), dtype="float32")

    print(f"  baseline files: {len(source_files)}")
    print(f"  baseline source points: {len(t90_by_point)}")
    print(f"  T90 min °C: {np.nanmin(t90_values):.2f}")
    print(f"  T90 mean °C: {np.nanmean(t90_values):.2f}")
    print(f"  T90 max °C: {np.nanmax(t90_values):.2f}")

    return {
        "model": model,
        "baseline_start": baseline_start,
        "baseline_end": baseline_end,
        "baseline_period": f"{baseline_start}-{baseline_end}",
        "source_file_count": len(source_files),
        "source_files": source_files,
        "t90_by_point": t90_by_point,
        "t90_min_c": float(np.nanmin(t90_values)),
        "t90_mean_c": float(np.nanmean(t90_values)),
        "t90_max_c": float(np.nanmax(t90_values)),
    }


def compute_model_source_year_tx90p(
    *,
    in_dir: Path,
    model: str,
    experiment: str,
    year: int,
    variable: str,
    source_index: dict[str, Any],
    baseline: dict[str, Any],
) -> dict[str, float]:
    files = find_year_files(in_dir, model=model, experiment=experiment, year=year)
    if not files:
        return {}

    tx90p_by_point: dict[str, float] = {}
    t90_by_point = baseline["t90_by_point"]

    for path in files:
        box_name = box_name_from_path(path)
        records_for_box = source_index["records_by_box"].get(box_name, [])
        if not records_for_box:
            continue

        selected = read_selected_points(
            path,
            variable=variable,
            records_for_box=records_for_box,
        )

        for point_col, record in enumerate(records_for_box):
            point_id = record["point_id"]
            if point_id not in t90_by_point:
                continue

            series = selected[:, point_col]
            valid = np.isfinite(series)
            if not np.any(valid):
                continue

            t90 = float(t90_by_point[point_id])
            tx90p = float(np.mean(series[valid] > t90) * 100.0)
            tx90p_by_point[point_id] = tx90p

    return tx90p_by_point


def compute_model_h3_year_tx90p(
    *,
    h3_cells: list[str],
    h3_to_source_point: dict[str, str],
    source_tx90p: dict[str, float],
) -> dict[str, float]:
    output: dict[str, float] = {}

    for h3_cell in h3_cells:
        point_id = h3_to_source_point.get(h3_cell)
        if point_id is None:
            continue
        value = source_tx90p.get(point_id)
        if value is None or not np.isfinite(value):
            continue
        output[h3_cell] = float(value)

    return output


def make_model_feature(
    *,
    h3_id: str,
    value: float,
    model: str,
    experiment: str,
    year: int,
    h3_resolution: int,
    baseline: dict[str, Any],
    source_point_id: str | None,
) -> dict[str, Any]:
    risk_class = risk_class_from_value(value)
    reliability_class = "high"
    color = bivariate_color(risk_class, reliability_class)

    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [h3_cell_to_boundary_lonlat(h3_id)],
        },
        "properties": {
            "country_id": "fji",
            "source_dataset": "NEX-GDDP-CMIP6",
            "source_resolution": "0.25 degree",
            "display_resolution": f"H3 res {h3_resolution}",
            "layer_name": "Climate TX90p",
            "feature_role": "climate_index_h3_hexagon",
            "variable": "tasmax",
            "metric": "tx90p",
            "value": safe_float(value),
            "tx90p": safe_float(value),
            "unit": "percent_days",
            "experiment": experiment,
            "scenario": experiment,
            "year": year,
            "h3_id": h3_id,
            "h3_index": h3_id,
            "h3_resolution": h3_resolution,
            "nearest_nex_point_id": source_point_id,
            "spatial_assignment_method": "nearest_nex_grid_point_to_h3_centroid",
            "model": model,
            "model_count": 1,
            "baseline_period": baseline["baseline_period"],
            "baseline_start_year": baseline["baseline_start"],
            "baseline_end_year": baseline["baseline_end"],
            "uncertainty_available": False,
            "uncertainty_spread": None,
            "normalized_uncertainty": 0,
            "reliability_score": 1,
            "risk_class": risk_class,
            "reliability_class": reliability_class,
            "bivariate_class": f"{risk_class}_risk_{reliability_class}_reliability",
            "bivariate_color": color,
            "alpha": 0.86,
            "alpha_method": "fixed_for_bivariate_layer",
        },
    }


def make_ensemble_feature(
    *,
    h3_id: str,
    model_values: dict[str, float],
    source_point_ids: dict[str, str | None],
    experiment: str,
    year: int,
    h3_resolution: int,
    baseline_period: str,
    spread_p95: float,
) -> dict[str, Any]:
    values = np.array(list(model_values.values()), dtype="float32")

    mean_value = float(np.nanmean(values))
    min_value = float(np.nanmin(values))
    max_value = float(np.nanmax(values))
    spread = max_value - min_value
    std = float(np.nanstd(values))

    if spread_p95 <= 0:
        normalized_uncertainty = 0.0
    else:
        normalized_uncertainty = max(0.0, min(1.0, spread / spread_p95))

    reliability_score = 1.0 - normalized_uncertainty
    risk_class = risk_class_from_value(mean_value)
    reliability_class = reliability_class_from_score(reliability_score)
    color = bivariate_color(risk_class, reliability_class)

    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [h3_cell_to_boundary_lonlat(h3_id)],
        },
        "properties": {
            "country_id": "fji",
            "source_dataset": "NEX-GDDP-CMIP6",
            "source_resolution": "0.25 degree",
            "display_resolution": f"H3 res {h3_resolution}",
            "layer_name": "Climate TX90p",
            "feature_role": "climate_index_h3_hexagon",
            "variable": "tasmax",
            "metric": "tx90p",
            "value": safe_float(mean_value),
            "tx90p": safe_float(mean_value),
            "ensemble_mean_tx90p": safe_float(mean_value),
            "unit": "percent_days",
            "experiment": experiment,
            "scenario": experiment,
            "year": year,
            "h3_id": h3_id,
            "h3_index": h3_id,
            "h3_resolution": h3_resolution,
            "model_count": len(model_values),
            "models": sorted(model_values.keys()),
            "model_values": {
                model: safe_float(value) for model, value in sorted(model_values.items())
            },
            "nearest_nex_point_ids": {
                model: source_point_ids.get(model) for model in sorted(model_values.keys())
            },
            "spatial_assignment_method": "nearest_nex_grid_point_to_h3_centroid",
            "model_min_tx90p": safe_float(min_value),
            "model_max_tx90p": safe_float(max_value),
            "uncertainty_available": len(model_values) >= 2,
            "uncertainty_spread": safe_float(spread),
            "uncertainty_std": safe_float(std),
            "uncertainty_unit": "percentage_points",
            "uncertainty_method": "inter_model_max_minus_min_tx90p",
            "normalized_uncertainty": safe_float(normalized_uncertainty),
            "reliability_score": safe_float(reliability_score),
            "reliability_method": "1_minus_normalized_inter_model_spread",
            "risk_class": risk_class,
            "reliability_class": reliability_class,
            "bivariate_class": f"{risk_class}_risk_{reliability_class}_reliability",
            "bivariate_color": color,
            "alpha": 0.86,
            "alpha_method": "fixed_for_bivariate_layer",
            "baseline_period": baseline_period,
            "description": (
                "TX90p climate index displayed on full H3 coverage. Color encodes "
                "risk class and reliability class. Underlying NEX-GDDP-CMIP6 "
                "source grid is 0.25 degree; H3 values are assigned from the "
                "nearest NEX grid point to each H3 centroid."
            ),
        },
    }


def write_geojson(path: Path, features: list[dict[str, Any]], metadata: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "type": "FeatureCollection",
        "metadata": metadata,
        "features": features,
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in-dir", type=Path, default=DEFAULT_IN_DIR)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    parser.add_argument("--variable", default="tasmax")
    parser.add_argument("--experiments", nargs="+", default=["historical", "ssp585"])
    parser.add_argument("--baseline-start", type=int, default=1981)
    parser.add_argument("--baseline-end", type=int, default=2010)
    parser.add_argument("--historical-start", type=int, default=1981)
    parser.add_argument("--historical-end", type=int, default=2010)
    parser.add_argument("--future-start", type=int, default=2015)
    parser.add_argument("--future-end", type=int, default=2100)
    parser.add_argument("--h3-resolution", type=int, default=6)
    parser.add_argument(
        "--sample-step-degrees",
        type=float,
        default=0.05,
        help="Sampling step used to seed full H3 coverage before k-ring expansion.",
    )
    parser.add_argument(
        "--neighbor-ring",
        type=int,
        default=2,
        help="H3 k-ring expansion around seed cells before polygon intersection filtering.",
    )
    args = parser.parse_args()

    print("NEX-GDDP-CMIP6 TX90p bivariate full-coverage build")
    print("---------------------------------------------------")
    print(f"Input dir: {args.in_dir}")
    print(f"Output dir: {args.out_dir}")
    print(f"Models: {args.models}")
    print(f"Experiments: {args.experiments}")
    print(f"Baseline: {args.baseline_start}-{args.baseline_end}")
    print(f"H3 resolution: {args.h3_resolution}")
    print(f"H3 seed sample step: {args.sample_step_degrees}")
    print(f"H3 neighbor ring: {args.neighbor_ring}")

    fiji = load_fiji_geometry()
    print(f"Fiji boundary: {fiji['path']}")

    h3_cells = generate_full_h3_coverage(
        fiji=fiji,
        h3_resolution=args.h3_resolution,
        sample_step_degrees=args.sample_step_degrees,
        neighbor_ring=args.neighbor_ring,
    )

    if not h3_cells:
        raise RuntimeError("Full H3 coverage generation returned zero cells.")

    print(f"Full Fiji H3 coverage cells: {len(h3_cells)}")

    model_h3_values: dict[tuple[str, int, str], dict[str, float]] = defaultdict(dict)
    model_h3_source_points: dict[tuple[str, int, str], dict[str, str | None]] = defaultdict(dict)
    model_catalogs: dict[str, Any] = {}
    baseline_period = f"{args.baseline_start}-{args.baseline_end}"

    for model in args.models:
        print(f"\n{'=' * 80}")
        print(f"MODEL: {model}")
        print(f"{'=' * 80}")

        source_index = build_model_source_grid_index(
            in_dir=args.in_dir,
            model=model,
            variable=args.variable,
            baseline_start=args.baseline_start,
            baseline_end=args.baseline_end,
        )

        h3_to_source_point = build_h3_to_nearest_source_map(
            h3_cells=h3_cells,
            source_index=source_index,
        )

        baseline = compute_model_t90_baseline(
            in_dir=args.in_dir,
            model=model,
            variable=args.variable,
            source_index=source_index,
            baseline_start=args.baseline_start,
            baseline_end=args.baseline_end,
        )

        model_outputs = []

        for experiment in args.experiments:
            if experiment == "historical":
                years = range(args.historical_start, args.historical_end + 1)
            else:
                years = range(args.future_start, args.future_end + 1)

            for year in years:
                source_tx90p = compute_model_source_year_tx90p(
                    in_dir=args.in_dir,
                    model=model,
                    experiment=experiment,
                    year=year,
                    variable=args.variable,
                    source_index=source_index,
                    baseline=baseline,
                )

                if not source_tx90p:
                    print(f"  WARNING: no source values for {model} {experiment} {year}")
                    continue

                h3_values = compute_model_h3_year_tx90p(
                    h3_cells=h3_cells,
                    h3_to_source_point=h3_to_source_point,
                    source_tx90p=source_tx90p,
                )

                if not h3_values:
                    print(f"  WARNING: no H3 values for {model} {experiment} {year}")
                    continue

                features = [
                    make_model_feature(
                        h3_id=h3_id,
                        value=value,
                        model=model,
                        experiment=experiment,
                        year=year,
                        h3_resolution=args.h3_resolution,
                        baseline=baseline,
                        source_point_id=h3_to_source_point.get(h3_id),
                    )
                    for h3_id, value in sorted(h3_values.items())
                ]

                model_slug = slugify(model)
                out_path = (
                    args.out_dir
                    / "tasmax"
                    / "fji"
                    / f"h3_res{args.h3_resolution}"
                    / "tx90p"
                    / "models"
                    / model_slug
                    / "yearly"
                    / f"{experiment}_{year}.geojson"
                )

                metadata = {
                    "country_id": "fji",
                    "source_dataset": "NEX-GDDP-CMIP6",
                    "source_resolution": "0.25 degree",
                    "display_resolution": f"H3 res {args.h3_resolution}",
                    "variable": "tasmax",
                    "metric": "tx90p",
                    "model": model,
                    "experiment": experiment,
                    "scenario": experiment,
                    "year": year,
                    "h3_resolution": args.h3_resolution,
                    "baseline_period": baseline_period,
                    "feature_count": len(features),
                    "model_count": 1,
                    "uncertainty_available": False,
                    "spatial_assignment_method": "nearest_nex_grid_point_to_h3_centroid",
                    "method": (
                        "TX90p is percent of days in the year where daily tasmax "
                        "exceeds that model/grid point's 1981-2010 historical "
                        "90th percentile. Values are assigned to full H3 coverage "
                        "using the nearest NEX grid point to each H3 centroid."
                    ),
                    "bivariate_color_matrix": BIVARIATE_COLOR_MATRIX,
                }

                write_geojson(out_path, features, metadata)

                model_outputs.append(
                    {
                        "experiment": experiment,
                        "year": year,
                        "path": str(out_path),
                        "feature_count": len(features),
                    }
                )

                for h3_id, value in h3_values.items():
                    key = (experiment, year, h3_id)
                    model_h3_values[key][model] = value
                    model_h3_source_points[key][model] = h3_to_source_point.get(h3_id)

                mean_year_value = float(np.nanmean(list(h3_values.values())))
                print(
                    f"  wrote {model} {experiment} {year}: "
                    f"{len(features)} full-cover H3 cells, mean TX90p={mean_year_value:.2f}%"
                )

        model_catalogs[model] = {
            "baseline": {
                "period": baseline_period,
                "t90_min_c": baseline["t90_min_c"],
                "t90_mean_c": baseline["t90_mean_c"],
                "t90_max_c": baseline["t90_max_c"],
                "source_file_count": baseline["source_file_count"],
            },
            "nex_source_point_count": len(source_index["records"]),
            "h3_coverage_cell_count": len(h3_cells),
            "outputs": model_outputs,
        }

    print(f"\n{'=' * 80}")
    print("ENSEMBLE")
    print(f"{'=' * 80}")

    all_spreads = []
    for model_values in model_h3_values.values():
        if len(model_values) < 2:
            continue
        values = list(model_values.values())
        all_spreads.append(max(values) - min(values))

    spread_p95 = float(np.nanpercentile(np.array(all_spreads), 95)) if all_spreads else 0.0
    print(f"Global uncertainty spread p95: {spread_p95:.3f} percentage points")

    grouped: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)

    for (experiment, year, h3_id), model_values in model_h3_values.items():
        if len(model_values) < 2:
            continue

        feature = make_ensemble_feature(
            h3_id=h3_id,
            model_values=model_values,
            source_point_ids=model_h3_source_points.get((experiment, year, h3_id), {}),
            experiment=experiment,
            year=year,
            h3_resolution=args.h3_resolution,
            baseline_period=baseline_period,
            spread_p95=spread_p95,
        )
        grouped[(experiment, year)].append(feature)

    ensemble_outputs = []

    for (experiment, year), features in sorted(grouped.items()):
        out_path = (
            args.out_dir
            / "tasmax"
            / "fji"
            / f"h3_res{args.h3_resolution}"
            / "tx90p"
            / "ensemble"
            / "yearly"
            / f"{experiment}_{year}.geojson"
        )

        metadata = {
            "country_id": "fji",
            "source_dataset": "NEX-GDDP-CMIP6",
            "source_resolution": "0.25 degree",
            "display_resolution": f"H3 res {args.h3_resolution}",
            "variable": "tasmax",
            "metric": "tx90p",
            "experiment": experiment,
            "scenario": experiment,
            "year": year,
            "h3_resolution": args.h3_resolution,
            "baseline_period": baseline_period,
            "feature_count": len(features),
            "model_count_requested": len(args.models),
            "models_requested": args.models,
            "value_method": "ensemble_mean_tx90p",
            "uncertainty_method": "inter_model_max_minus_min_tx90p",
            "uncertainty_unit": "percentage_points",
            "reliability_method": "1_minus_normalized_inter_model_spread",
            "spatial_assignment_method": "nearest_nex_grid_point_to_h3_centroid",
            "spread_p95": spread_p95,
            "risk_bins": {
                "very_low": "0 <= TX90p < 20",
                "low": "20 <= TX90p < 40",
                "medium": "40 <= TX90p < 60",
                "high": "60 <= TX90p < 80",
                "very_high": "80 <= TX90p <= 100",
            },
            "reliability_bins": {
                "low": "0 <= reliability_score < 0.333",
                "medium": "0.333 <= reliability_score < 0.667",
                "high": "0.667 <= reliability_score <= 1",
            },
            "bivariate_color_matrix": BIVARIATE_COLOR_MATRIX,
        }

        write_geojson(out_path, features, metadata)

        ensemble_outputs.append(
            {
                "experiment": experiment,
                "year": year,
                "path": str(out_path),
                "feature_count": len(features),
            }
        )

        mean_value = float(np.nanmean([feature["properties"]["value"] for feature in features]))
        mean_spread = float(
            np.nanmean([feature["properties"]["uncertainty_spread"] for feature in features])
        )
        mean_reliability = float(
            np.nanmean([feature["properties"]["reliability_score"] for feature in features])
        )

        print(
            f"  wrote ensemble {experiment} {year}: "
            f"{len(features)} full-cover H3 cells, mean TX90p={mean_value:.2f}%, "
            f"mean spread={mean_spread:.2f} pp, mean reliability={mean_reliability:.2f}"
        )

    catalog = {
        "catalog_type": "nex_gddp_cmip6_tx90p_bivariate_full_coverage_cache",
        "version": "0.2.0",
        "country_id": "fji",
        "source_dataset": "NEX-GDDP-CMIP6",
        "source_resolution": "0.25 degree",
        "display_resolution": f"H3 res {args.h3_resolution}",
        "variable": "tasmax",
        "metric": "tx90p",
        "unit": "percent_days",
        "baseline_period": baseline_period,
        "h3_resolution": args.h3_resolution,
        "h3_coverage_cell_count": len(h3_cells),
        "models": args.models,
        "experiments": args.experiments,
        "display": {
            "value_property": "value",
            "risk_property": "risk_class",
            "reliability_property": "reliability_score",
            "reliability_class_property": "reliability_class",
            "color_property": "bivariate_color",
            "color_meaning": "bivariate TX90p risk class x model reliability class",
            "uncertainty_property": "uncertainty_spread",
            "uncertainty_unit": "percentage_points",
            "bivariate_color_matrix": BIVARIATE_COLOR_MATRIX,
            "legend_axes": {
                "x_axis": "Reliability score, unreliable to reliable",
                "y_axis": "TX90p risk value, low to high",
            },
            "spread_p95": spread_p95,
        },
        "model_catalogs": model_catalogs,
        "ensemble_outputs": ensemble_outputs,
    }

    catalog_path = args.out_dir / "tasmax" / "fji" / "tx90p_nex_bivariate_catalog.json"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(json.dumps(catalog, indent=2), encoding="utf-8")

    # Also overwrite the old catalog name for compatibility with any frontend or
    # backend code that is already looking for it.
    compatibility_catalog_path = args.out_dir / "tasmax" / "fji" / "tx90p_nex_ensemble_catalog.json"
    compatibility_catalog_path.write_text(json.dumps(catalog, indent=2), encoding="utf-8")

    print("\nDone.")
    print(f"Wrote catalog: {catalog_path}")
    print(f"Wrote compatibility catalog: {compatibility_catalog_path}")
    print(f"Ensemble files written: {len(ensemble_outputs)}")
    print(f"Full Fiji H3 coverage cells per layer: {len(h3_cells)}")


if __name__ == "__main__":
    main()
