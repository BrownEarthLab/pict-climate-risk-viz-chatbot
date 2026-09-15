#!/usr/bin/env python3
"""
Build NEX-GDDP-CMIP6 Fiji TX90p ensemble climate-index cache.

Input:
  data/climate/raw/nex_gddp_cmip6/fiji_subset/<model>/<experiment>/<year>/*.nc

Default:
  - Fiji only
  - variable: tasmax
  - baseline: 1981-2010 historical
  - future scenario: ssp585
  - H3 resolution: 6
  - models:
      ACCESS-CM2
      CanESM5
      GFDL-ESM4
      MPI-ESM1-2-HR
      NorESM2-MM

Output:
  backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/models/<model>/yearly/ssp585_2030.geojson
  backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble/yearly/ssp585_2030.geojson
  backend/cache/climate_indices/tasmax/fji/tx90p_nex_ensemble_catalog.json

Meaning:
  value = ensemble mean TX90p
  uncertainty_spread = max(model TX90p) - min(model TX90p)
  alpha = lower opacity when uncertainty_spread is higher
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
from shapely.geometry import Point
from shapely.ops import transform, unary_union

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


def slugify(value: str) -> str:
    return (
        value.lower()
        .replace("_", "-")
        .replace(" ", "-")
        .replace("/", "-")
    )


def normalize_lon_180(lon: float) -> float:
    value = ((lon + 180.0) % 360.0) - 180.0
    if math.isclose(value, -180.0) and lon > 0:
        return 180.0
    return value


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
    raise RuntimeError("Unsupported h3 Python API.")


def h3_cell_to_boundary_lonlat(cell: str) -> list[list[float]]:
    if hasattr(h3, "cell_to_boundary"):
        boundary = h3.cell_to_boundary(cell)
        coords = [[float(lon), float(lat)] for lat, lon in boundary]
    elif hasattr(h3, "h3_to_geo_boundary"):
        boundary = h3.h3_to_geo_boundary(cell, geo_json=True)
        coords = [[float(lon), float(lat)] for lon, lat in boundary]
    else:
        raise RuntimeError("Unsupported h3 Python API.")

    if coords[0] != coords[-1]:
        coords.append(coords[0])

    return coords


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
    shifted_geometry = transform(shift_negative_lon_to_360, geometry)

    return {
        "path": str(path),
        "geometry": geometry,
        "shifted_geometry": shifted_geometry,
    }


def point_inside_fiji(lat: float, lon: float, geometry, shifted_geometry) -> bool:
    lon_180 = normalize_lon_180(lon)
    point = Point(lon_180, lat)

    if geometry.contains(point) or geometry.touches(point):
        return True

    shifted_lon = lon_180 + 360.0 if lon_180 < 0 else lon_180
    shifted_point = Point(shifted_lon, lat)

    return shifted_geometry.contains(shifted_point) or shifted_geometry.touches(
        shifted_point
    )


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


def find_year_files(
    in_dir: Path,
    *,
    model: str,
    experiment: str,
    year: int,
) -> list[Path]:
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


def build_model_spatial_index(
    *,
    in_dir: Path,
    model: str,
    variable: str,
    h3_resolution: int,
    baseline_start: int,
    baseline_end: int,
    fiji: dict[str, Any],
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
            f"No historical sample files found for {model} "
            f"between {baseline_start}-{baseline_end}"
        )

    records: list[dict[str, Any]] = []

    for sample_file in sample_files:
        box_name = box_name_from_path(sample_file)
        ds = xr.open_dataset(sample_file, decode_times=True)

        if variable not in ds:
            raise KeyError(f"{variable!r} not found in {sample_file}")

        lat = ds["lat"].values
        lon = ds["lon"].values

        for lat_index, lat_value in enumerate(lat):
            for lon_index, lon_value in enumerate(lon):
                lat_f = float(lat_value)
                lon_f = normalize_lon_180(float(lon_value))

                if not point_inside_fiji(
                    lat_f,
                    lon_f,
                    fiji["geometry"],
                    fiji["shifted_geometry"],
                ):
                    continue

                h3_id = h3_latlng_to_cell(lat_f, lon_f, h3_resolution)
                point_id = f"{box_name}:{lat_f:.6f}:{lon_f:.6f}"

                records.append(
                    {
                        "point_id": point_id,
                        "box_name": box_name,
                        "lat_index": int(lat_index),
                        "lon_index": int(lon_index),
                        "lat": lat_f,
                        "lon": lon_f,
                        "h3_id": h3_id,
                    }
                )

        ds.close()

    if not records:
        raise RuntimeError(f"No NEX grid points found inside Fiji for {model}")

    records_by_box: dict[str, list[dict[str, Any]]] = defaultdict(list)
    records_by_h3: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for record in records:
        records_by_box[record["box_name"]].append(record)
        records_by_h3[record["h3_id"]].append(record)

    print(f"  spatial points inside Fiji: {len(records)}")
    print(f"  H3 cells: {len(records_by_h3)}")

    return {
        "model": model,
        "records": records,
        "records_by_box": dict(records_by_box),
        "records_by_h3": dict(records_by_h3),
        "h3_resolution": h3_resolution,
    }


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
    spatial_index: dict[str, Any],
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
            records_for_box = spatial_index["records_by_box"].get(box_name, [])

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
    print(f"  baseline points: {len(t90_by_point)}")
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


def compute_model_year_tx90p(
    *,
    in_dir: Path,
    model: str,
    experiment: str,
    year: int,
    variable: str,
    spatial_index: dict[str, Any],
    baseline: dict[str, Any],
) -> dict[str, float]:
    files = find_year_files(in_dir, model=model, experiment=experiment, year=year)

    if not files:
        return {}

    tx90p_by_point: dict[str, float] = {}
    t90_by_point = baseline["t90_by_point"]

    for path in files:
        box_name = box_name_from_path(path)
        records_for_box = spatial_index["records_by_box"].get(box_name, [])

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

    h3_values: dict[str, list[float]] = defaultdict(list)

    for record in spatial_index["records"]:
        point_id = record["point_id"]

        if point_id in tx90p_by_point:
            h3_values[record["h3_id"]].append(tx90p_by_point[point_id])

    return {
        h3_id: float(np.nanmean(values))
        for h3_id, values in h3_values.items()
        if values
    }


def make_model_feature(
    *,
    h3_id: str,
    value: float,
    model: str,
    experiment: str,
    year: int,
    h3_resolution: int,
    baseline: dict[str, Any],
) -> dict[str, Any]:
    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [h3_cell_to_boundary_lonlat(h3_id)],
        },
        "properties": {
            "country_id": "fji",
            "source_dataset": "NEX-GDDP-CMIP6",
            "variable": "tasmax",
            "metric": "tx90p",
            "value": safe_float(value),
            "tx90p": safe_float(value),
            "unit": "percent_days",
            "experiment": experiment,
            "scenario": experiment,
            "year": year,
            "h3_id": h3_id,
            "h3_resolution": h3_resolution,
            "model": model,
            "model_count": 1,
            "baseline_period": baseline["baseline_period"],
            "baseline_start_year": baseline["baseline_start"],
            "baseline_end_year": baseline["baseline_end"],
            "uncertainty_available": False,
            "uncertainty_spread": None,
            "normalized_uncertainty": None,
            "alpha": 0.85,
            "alpha_method": "fixed_single_model_alpha",
        },
    }


def make_ensemble_feature(
    *,
    h3_id: str,
    model_values: dict[str, float],
    experiment: str,
    year: int,
    h3_resolution: int,
    baseline_period: str,
    spread_p95: float,
    min_alpha: float,
    max_alpha: float,
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

    alpha = max_alpha - normalized_uncertainty * (max_alpha - min_alpha)
    alpha = max(min_alpha, min(max_alpha, alpha))

    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [h3_cell_to_boundary_lonlat(h3_id)],
        },
        "properties": {
            "country_id": "fji",
            "source_dataset": "NEX-GDDP-CMIP6",
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
            "h3_resolution": h3_resolution,
            "model_count": len(model_values),
            "models": sorted(model_values.keys()),
            "model_values": {
                model: safe_float(value)
                for model, value in sorted(model_values.items())
            },
            "model_min_tx90p": safe_float(min_value),
            "model_max_tx90p": safe_float(max_value),
            "uncertainty_available": len(model_values) >= 2,
            "uncertainty_spread": safe_float(spread),
            "uncertainty_std": safe_float(std),
            "uncertainty_unit": "percentage_points",
            "uncertainty_method": "inter_model_max_minus_min_tx90p",
            "normalized_uncertainty": safe_float(normalized_uncertainty),
            "alpha": safe_float(alpha),
            "alpha_method": "inverse_inter_model_spread_p95_global",
            "baseline_period": baseline_period,
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
    parser.add_argument("--min-alpha", type=float, default=0.25)
    parser.add_argument("--max-alpha", type=float, default=0.90)
    args = parser.parse_args()

    print("NEX-GDDP-CMIP6 TX90p ensemble build")
    print("-----------------------------------")
    print(f"Input dir: {args.in_dir}")
    print(f"Output dir: {args.out_dir}")
    print(f"Models: {args.models}")
    print(f"Experiments: {args.experiments}")
    print(f"Baseline: {args.baseline_start}-{args.baseline_end}")
    print(f"H3 resolution: {args.h3_resolution}")

    fiji = load_fiji_geometry()
    print(f"Fiji boundary: {fiji['path']}")

    model_h3_values: dict[tuple[str, int, str], dict[str, float]] = defaultdict(dict)
    model_catalogs: dict[str, Any] = {}
    baseline_period = f"{args.baseline_start}-{args.baseline_end}"

    for model in args.models:
        print(f"\n{'=' * 80}")
        print(f"MODEL: {model}")
        print(f"{'=' * 80}")

        spatial_index = build_model_spatial_index(
            in_dir=args.in_dir,
            model=model,
            variable=args.variable,
            h3_resolution=args.h3_resolution,
            baseline_start=args.baseline_start,
            baseline_end=args.baseline_end,
            fiji=fiji,
        )

        baseline = compute_model_t90_baseline(
            in_dir=args.in_dir,
            model=model,
            variable=args.variable,
            spatial_index=spatial_index,
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
                h3_values = compute_model_year_tx90p(
                    in_dir=args.in_dir,
                    model=model,
                    experiment=experiment,
                    year=year,
                    variable=args.variable,
                    spatial_index=spatial_index,
                    baseline=baseline,
                )

                if not h3_values:
                    print(f"  WARNING: no values for {model} {experiment} {year}")
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
                    "method": (
                        "TX90p is percent of days in the year where daily tasmax "
                        "exceeds that model/grid point's 1981-2010 historical "
                        "90th percentile."
                    ),
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
                    model_h3_values[(experiment, year, h3_id)][model] = value

                mean_year_value = float(np.nanmean(list(h3_values.values())))
                print(
                    f"  wrote {model} {experiment} {year}: "
                    f"{len(features)} H3 cells, mean TX90p={mean_year_value:.2f}%"
                )

        model_catalogs[model] = {
            "baseline": {
                "period": baseline_period,
                "t90_min_c": baseline["t90_min_c"],
                "t90_mean_c": baseline["t90_mean_c"],
                "t90_max_c": baseline["t90_max_c"],
                "source_file_count": baseline["source_file_count"],
            },
            "spatial_point_count": len(spatial_index["records"]),
            "h3_cell_count": len(spatial_index["records_by_h3"]),
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

    if all_spreads:
        spread_p95 = float(np.nanpercentile(np.array(all_spreads), 95))
    else:
        spread_p95 = 0.0

    print(f"Global uncertainty spread p95: {spread_p95:.3f} percentage points")

    ensemble_outputs = []

    grouped: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)

    for (experiment, year, h3_id), model_values in model_h3_values.items():
        if len(model_values) < 2:
            continue

        feature = make_ensemble_feature(
            h3_id=h3_id,
            model_values=model_values,
            experiment=experiment,
            year=year,
            h3_resolution=args.h3_resolution,
            baseline_period=baseline_period,
            spread_p95=spread_p95,
            min_alpha=args.min_alpha,
            max_alpha=args.max_alpha,
        )

        grouped[(experiment, year)].append(feature)

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
            "alpha_method": "inverse_inter_model_spread_p95_global",
            "spread_p95": spread_p95,
            "min_alpha": args.min_alpha,
            "max_alpha": args.max_alpha,
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

        mean_value = float(
            np.nanmean([feature["properties"]["value"] for feature in features])
        )
        mean_spread = float(
            np.nanmean(
                [feature["properties"]["uncertainty_spread"] for feature in features]
            )
        )

        print(
            f"  wrote ensemble {experiment} {year}: "
            f"{len(features)} H3 cells, mean TX90p={mean_value:.2f}%, "
            f"mean spread={mean_spread:.2f} pp"
        )

    catalog = {
        "catalog_type": "nex_gddp_cmip6_tx90p_ensemble_cache",
        "version": "0.1.0",
        "country_id": "fji",
        "source_dataset": "NEX-GDDP-CMIP6",
        "variable": "tasmax",
        "metric": "tx90p",
        "unit": "percent_days",
        "baseline_period": baseline_period,
        "h3_resolution": args.h3_resolution,
        "models": args.models,
        "experiments": args.experiments,
        "display": {
            "value_property": "value",
            "alpha_property": "alpha",
            "color_meaning": "ensemble mean TX90p",
            "alpha_meaning": "inverse model uncertainty; lower opacity means higher model spread",
            "uncertainty_property": "uncertainty_spread",
            "uncertainty_unit": "percentage_points",
            "min_alpha": args.min_alpha,
            "max_alpha": args.max_alpha,
            "spread_p95": spread_p95,
        },
        "model_catalogs": model_catalogs,
        "ensemble_outputs": ensemble_outputs,
    }

    catalog_path = args.out_dir / "tasmax" / "fji" / "tx90p_nex_ensemble_catalog.json"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(json.dumps(catalog, indent=2), encoding="utf-8")

    print("\nDone.")
    print(f"Wrote catalog: {catalog_path}")
    print(f"Ensemble files written: {len(ensemble_outputs)}")


if __name__ == "__main__":
    main()
