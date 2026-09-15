#!/usr/bin/env python3
"""
Build yearly TX90p-style climate-index cache from CORDEX daily tasmax.

First version:
  - Fiji only
  - one CORDEX model run only
  - yearly TX90p only
  - simplified local T90 baseline:
      T90 = 90th percentile of daily tasmax over 1961-1990 at each CORDEX grid point
  - TX90p:
      percent of days in each year where daily tasmax > local T90
  - uncertainty is not available yet because only one model run is used
  - alpha is fixed at 0.85 so the frontend can already support value-by-alpha styling

Input:
  data/climate/raw/cordex/aus-44_cclm4-8-17-clm3-5_mpi-m-mpi-esm-lr_r1i1p1/**/*.nc

Output:
  backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/yearly/historical_1961.geojson
  backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/yearly/rcp45_2030.geojson
  backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/yearly/rcp85_2030.geojson
  backend/cache/climate_indices/tasmax/fji/tx90p_catalog.json

Run sample:
  python scripts/build_tasmax_tx90p_indices.py --max-files 3

Run full:
  python scripts/build_tasmax_tx90p_indices.py
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
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


DEFAULT_RUN_DIR = Path(
    "data/climate/raw/cordex/"
    "aus-44_cclm4-8-17-clm3-5_mpi-m-mpi-esm-lr_r1i1p1"
)

DEFAULT_OUT_DIR = Path("backend/cache/climate_indices")
DEFAULT_VARIABLE = "tasmax"
DEFAULT_H3_RESOLUTION = 6
DEFAULT_BASELINE_START = 1961
DEFAULT_BASELINE_END = 1990
DEFAULT_FIXED_ALPHA = 0.85

FIJI_GEOMETRY_CANDIDATES = [
    Path("data/reference/pict/fji/adm0.geojson"),
    Path("data/reference/fiji_admin_adm0.geojson"),
    Path("data/reference/fiji_admin_adm1.geojson"),
    Path("data/reference/fiji_admin_adm2.geojson"),
    Path("data/reference/fiji_tikina.geojson"),
]


def h3_latlng_to_cell(lat: float, lon: float, resolution: int) -> str:
    if hasattr(h3, "latlng_to_cell"):
        return h3.latlng_to_cell(lat, lon, resolution)
    if hasattr(h3, "geo_to_h3"):
        return h3.geo_to_h3(lat, lon, resolution)
    raise RuntimeError("Unsupported h3 Python API: no latlng_to_cell or geo_to_h3")


def h3_cell_to_boundary_lonlat(cell: str) -> list[list[float]]:
    if hasattr(h3, "cell_to_boundary"):
        boundary = h3.cell_to_boundary(cell)
        coords = [[float(lon), float(lat)] for lat, lon in boundary]
    elif hasattr(h3, "h3_to_geo_boundary"):
        boundary = h3.h3_to_geo_boundary(cell, geo_json=True)
        coords = [[float(lon), float(lat)] for lon, lat in boundary]
    else:
        raise RuntimeError("Unsupported h3 Python API: no boundary function")

    if coords[0] != coords[-1]:
        coords.append(coords[0])

    return coords


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


def load_country_geometry(country_id: str = "fji") -> dict[str, Any]:
    if country_id.lower() != "fji":
        raise ValueError("This first TX90p version only supports country_id='fji'.")

    existing = [path for path in FIJI_GEOMETRY_CANDIDATES if path.exists()]

    if not existing:
        candidates = "\n".join(f"  - {path}" for path in FIJI_GEOMETRY_CANDIDATES)
        raise FileNotFoundError(
            "Could not find Fiji boundary GeoJSON. Tried:\n" + candidates
        )

    boundary_path = existing[0]
    gdf = gpd.read_file(boundary_path)

    if gdf.empty:
        raise ValueError(f"Boundary file is empty: {boundary_path}")

    if gdf.crs is not None and str(gdf.crs).lower() not in {
        "epsg:4326",
        "wgs84",
        "urn:ogc:def:crs:ogc:1.3:crs84",
    }:
        gdf = gdf.to_crs("EPSG:4326")

    geometry = unary_union(gdf.geometry)
    shifted_geometry = transform(shift_negative_lon_to_360, geometry)

    return {
        "path": str(boundary_path),
        "geometry": geometry,
        "shifted_geometry": shifted_geometry,
    }


def point_inside_country(lat: float, lon: float, geometry, shifted_geometry) -> bool:
    lon_180 = normalize_lon_180(lon)
    point = Point(lon_180, lat)

    if geometry.contains(point) or geometry.touches(point):
        return True

    shifted_lon = lon_180 + 360.0 if lon_180 < 0 else lon_180
    shifted_point = Point(shifted_lon, lat)

    return shifted_geometry.contains(shifted_point) or shifted_geometry.touches(
        shifted_point
    )


def find_lat_lon_names(ds: xr.Dataset) -> tuple[str, str]:
    lat_candidates = ["lat", "latitude"]
    lon_candidates = ["lon", "longitude"]

    lat_name = next((name for name in lat_candidates if name in ds.variables), None)
    lon_name = next((name for name in lon_candidates if name in ds.variables), None)

    if lat_name is None or lon_name is None:
        raise KeyError(
            "Could not find latitude/longitude variables. "
            f"Available variables: {list(ds.variables)}"
        )

    return lat_name, lon_name


def get_2d_lat_lon(ds: xr.Dataset) -> tuple[np.ndarray, np.ndarray, tuple[str, ...]]:
    lat_name, lon_name = find_lat_lon_names(ds)

    lat = ds[lat_name]
    lon = ds[lon_name]

    if lat.ndim == 2 and lon.ndim == 2:
        if lat.dims != lon.dims:
            raise ValueError(f"lat dims {lat.dims} != lon dims {lon.dims}")
        return lat.values, lon.values, tuple(lat.dims)

    if lat.ndim == 1 and lon.ndim == 1:
        lon2d, lat2d = np.meshgrid(lon.values, lat.values)
        return lat2d, lon2d, tuple(lat.dims + lon.dims)

    raise ValueError(
        f"Unsupported lat/lon shapes: lat={lat.shape}, lon={lon.shape}"
    )


def build_spatial_index(
    sample_file: Path,
    *,
    variable: str,
    country_id: str,
    h3_resolution: int,
) -> dict[str, Any]:
    print(f"Building spatial index from: {sample_file}")

    country = load_country_geometry(country_id)

    ds = xr.open_dataset(sample_file, decode_times=True)
    lat2d, lon2d, spatial_dims = get_2d_lat_lon(ds)

    if variable not in ds.data_vars:
        raise KeyError(f"Variable {variable!r} not found in {sample_file}")

    arr = ds[variable]

    missing_dims = [dim for dim in ("time", *spatial_dims) if dim not in arr.dims]
    if missing_dims:
        raise ValueError(
            f"Variable {variable} is missing expected dims {missing_dims}. "
            f"Actual dims: {arr.dims}"
        )

    point_records: list[dict[str, Any]] = []
    h3_to_point_indexes: dict[str, list[int]] = defaultdict(list)

    rows, cols = lat2d.shape

    for y in range(rows):
        for x in range(cols):
            lat = float(lat2d[y, x])
            lon = float(lon2d[y, x])

            if np.isnan(lat) or np.isnan(lon):
                continue

            if not point_inside_country(
                lat,
                lon,
                country["geometry"],
                country["shifted_geometry"],
            ):
                continue

            lon_180 = normalize_lon_180(lon)
            h3_id = h3_latlng_to_cell(lat, lon_180, h3_resolution)

            point_index = len(point_records)

            point_records.append(
                {
                    "y": y,
                    "x": x,
                    "lat": lat,
                    "lon": lon_180,
                    "h3_id": h3_id,
                }
            )

            h3_to_point_indexes[h3_id].append(point_index)

    ds.close()

    if not point_records:
        raise RuntimeError(
            "No CORDEX grid cells intersect Fiji. "
            "Check Fiji boundary and CORDEX lat/lon convention."
        )

    print(f"Selected CORDEX grid points inside Fiji: {len(point_records)}")
    print(f"H3 cells at resolution {h3_resolution}: {len(h3_to_point_indexes)}")
    print(f"Boundary source: {country['path']}")

    return {
        "boundary_path": country["path"],
        "spatial_dims": spatial_dims,
        "point_records": point_records,
        "h3_to_point_indexes": dict(h3_to_point_indexes),
        "h3_resolution": h3_resolution,
    }


def get_years_from_time(ds: xr.Dataset) -> np.ndarray:
    if "time" not in ds:
        raise KeyError("Dataset has no time coordinate")

    time_values = ds["time"].values

    try:
        return pd.to_datetime(time_values).year.to_numpy()
    except Exception:
        return np.array([int(value.year) for value in time_values], dtype=int)


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

    print(f"WARNING: Unknown temperature units {units!r}; assuming Celsius.")
    return values


def get_experiment_from_file(path: Path, ds: xr.Dataset) -> str:
    for attr_name in ["experiment_id", "experiment"]:
        value = ds.attrs.get(attr_name)
        if value:
            return str(value)

    parts = set(path.parts)

    for experiment in ["historical", "rcp45", "rcp85"]:
        if experiment in parts:
            return experiment

    return "unknown"


def find_netcdf_files(run_dir: Path, experiments: list[str] | None = None) -> list[Path]:
    files = sorted(run_dir.glob("*/*.nc"))

    if experiments:
        allowed = set(experiments)
        files = [path for path in files if path.parent.name in allowed]

    return files


def extract_year_range_from_filename(path: Path) -> tuple[int | None, int | None]:
    match = re.search(r"_(\d{8})-(\d{8})\.nc$", path.name)

    if not match:
        return None, None

    start_year = int(match.group(1)[:4])
    end_year = int(match.group(2)[:4])

    return start_year, end_year


def file_overlaps_year_range(path: Path, start_year: int, end_year: int) -> bool:
    file_start, file_end = extract_year_range_from_filename(path)

    if file_start is None or file_end is None:
        return True

    return file_start <= end_year and file_end >= start_year


def selected_grid_values_celsius(
    ds: xr.Dataset,
    *,
    variable: str,
    spatial_index: dict[str, Any],
) -> np.ndarray:
    spatial_dims = tuple(spatial_index["spatial_dims"])
    arr = ds[variable].transpose("time", *spatial_dims)

    data = arr.values.astype("float32")
    units = str(arr.attrs.get("units", ""))
    data_c = convert_temperature_to_celsius(data, units)

    point_records = spatial_index["point_records"]
    y_indexes = np.array([record["y"] for record in point_records], dtype=int)
    x_indexes = np.array([record["x"] for record in point_records], dtype=int)

    return data_c[:, y_indexes, x_indexes]


def compute_t90_baseline(
    files: list[Path],
    *,
    variable: str,
    spatial_index: dict[str, Any],
    baseline_start: int,
    baseline_end: int,
) -> dict[str, Any]:
    baseline_chunks: list[np.ndarray] = []
    baseline_source_files: list[str] = []

    candidate_files = [
        path
        for path in files
        if "historical" in path.parts
        and file_overlaps_year_range(path, baseline_start, baseline_end)
    ]

    if not candidate_files:
        raise FileNotFoundError(
            f"No historical files overlap baseline {baseline_start}-{baseline_end}."
        )

    print("\nComputing T90 baseline")
    print("----------------------")
    print(f"Baseline period: {baseline_start}-{baseline_end}")
    print(f"Candidate files: {len(candidate_files)}")

    for path in candidate_files:
        print(f"  reading baseline file: {path.name}")

        ds = xr.open_dataset(path, decode_times=True)
        years = get_years_from_time(ds)

        mask = (years >= baseline_start) & (years <= baseline_end)

        if not np.any(mask):
            ds.close()
            continue

        values = selected_grid_values_celsius(
            ds,
            variable=variable,
            spatial_index=spatial_index,
        )

        baseline_chunks.append(values[mask, :])
        baseline_source_files.append(path.name)

        ds.close()

    if not baseline_chunks:
        raise RuntimeError(
            f"No baseline daily values found for {baseline_start}-{baseline_end}."
        )

    baseline_values = np.concatenate(baseline_chunks, axis=0)
    t90_by_point = np.nanpercentile(baseline_values, 90, axis=0)

    if np.all(np.isnan(t90_by_point)):
        raise RuntimeError("Computed T90 baseline is all NaN.")

    print(f"Baseline day count: {baseline_values.shape[0]}")
    print(f"Point count: {baseline_values.shape[1]}")
    print(f"T90 min °C: {np.nanmin(t90_by_point):.2f}")
    print(f"T90 mean °C: {np.nanmean(t90_by_point):.2f}")
    print(f"T90 max °C: {np.nanmax(t90_by_point):.2f}")

    return {
        "baseline_start": baseline_start,
        "baseline_end": baseline_end,
        "baseline_day_count": int(baseline_values.shape[0]),
        "baseline_source_files": baseline_source_files,
        "t90_by_point": t90_by_point.astype("float32"),
        "t90_min_c": float(np.nanmin(t90_by_point)),
        "t90_mean_c": float(np.nanmean(t90_by_point)),
        "t90_max_c": float(np.nanmax(t90_by_point)),
    }


def safe_float(value: Any) -> float | None:
    if value is None:
        return None

    try:
        result = float(value)
    except Exception:
        return None

    if np.isnan(result):
        return None

    return result


def make_h3_feature(
    *,
    h3_id: str,
    value: float | None,
    experiment: str,
    year: int,
    grid_point_count: int,
    source_files: list[str],
    mean_t90_c: float | None,
    run_metadata: dict[str, Any],
    baseline_metadata: dict[str, Any],
    fixed_alpha: float,
) -> dict[str, Any]:
    boundary = h3_cell_to_boundary_lonlat(h3_id)

    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [boundary],
        },
        "properties": {
            "country_id": "fji",
            "variable": "tasmax",
            "metric": "tx90p",
            "value": value,
            "tx90p": value,
            "unit": "percent_days",
            "baseline_period": (
                f"{baseline_metadata['baseline_start']}-"
                f"{baseline_metadata['baseline_end']}"
            ),
            "baseline_start_year": baseline_metadata["baseline_start"],
            "baseline_end_year": baseline_metadata["baseline_end"],
            "mean_t90_c": mean_t90_c,
            "experiment": experiment,
            "scenario": experiment,
            "year": year,
            "h3_id": h3_id,
            "h3_resolution": run_metadata["h3_resolution"],
            "grid_point_count": grid_point_count,
            "source_files": source_files,
            "model_count": 1,
            "uncertainty_available": False,
            "uncertainty": None,
            "uncertainty_unit": None,
            "alpha": fixed_alpha,
            "alpha_method": "fixed_single_model_alpha",
            "run_domain": run_metadata.get("domain"),
            "run_model": run_metadata.get("model"),
            "run_driving_model": run_metadata.get("driving_model"),
            "run_ensemble": run_metadata.get("ensemble"),
        },
    }


def write_geojson(
    *,
    out_path: Path,
    features: list[dict[str, Any]],
    metadata: dict[str, Any],
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    collection = {
        "type": "FeatureCollection",
        "metadata": metadata,
        "features": features,
    }

    out_path.write_text(json.dumps(collection), encoding="utf-8")


def process_file_tx90p(
    path: Path,
    *,
    variable: str,
    spatial_index: dict[str, Any],
    baseline: dict[str, Any],
    out_dir: Path,
    run_metadata: dict[str, Any],
    fixed_alpha: float,
) -> list[dict[str, Any]]:
    print(f"\nProcessing TX90p: {path}")

    ds = xr.open_dataset(path, decode_times=True)

    experiment = get_experiment_from_file(path, ds)
    years = get_years_from_time(ds)
    unique_years = sorted(set(int(year) for year in years))

    values_c = selected_grid_values_celsius(
        ds,
        variable=variable,
        spatial_index=spatial_index,
    )

    t90_by_point = baseline["t90_by_point"]

    if values_c.shape[1] != t90_by_point.shape[0]:
        raise ValueError(
            f"Selected point count mismatch: values has {values_c.shape[1]} points, "
            f"baseline has {t90_by_point.shape[0]} points."
        )

    file_outputs: list[dict[str, Any]] = []

    for year in unique_years:
        year_mask = years == year

        if not np.any(year_mask):
            continue

        year_values = values_c[year_mask, :]

        exceedances = year_values > t90_by_point[None, :]
        valid = np.isfinite(year_values) & np.isfinite(t90_by_point[None, :])

        valid_day_counts = np.sum(valid, axis=0)
        exceedance_counts = np.sum(exceedances & valid, axis=0)

        tx90p_by_point = np.full(year_values.shape[1], np.nan, dtype="float32")
        usable = valid_day_counts > 0
        tx90p_by_point[usable] = (
            exceedance_counts[usable] / valid_day_counts[usable] * 100.0
        ).astype("float32")

        features: list[dict[str, Any]] = []

        for h3_id, point_indexes in spatial_index["h3_to_point_indexes"].items():
            point_tx90p_values = tx90p_by_point[point_indexes]
            point_t90_values = t90_by_point[point_indexes]

            value = safe_float(np.nanmean(point_tx90p_values))
            mean_t90_c = safe_float(np.nanmean(point_t90_values))

            features.append(
                make_h3_feature(
                    h3_id=h3_id,
                    value=value,
                    experiment=experiment,
                    year=year,
                    grid_point_count=len(point_indexes),
                    source_files=[path.name],
                    mean_t90_c=mean_t90_c,
                    run_metadata=run_metadata,
                    baseline_metadata=baseline,
                    fixed_alpha=fixed_alpha,
                )
            )

        out_path = (
            out_dir
            / "tasmax"
            / "fji"
            / f"h3_res{run_metadata['h3_resolution']}"
            / "tx90p"
            / "yearly"
            / f"{experiment}_{year}.geojson"
        )

        metadata = {
            "country_id": "fji",
            "variable": "tasmax",
            "metric": "tx90p",
            "unit": "percent_days",
            "experiment": experiment,
            "scenario": experiment,
            "year": year,
            "h3_resolution": run_metadata["h3_resolution"],
            "feature_count": len(features),
            "source_file": str(path),
            "baseline_period": f"{baseline['baseline_start']}-{baseline['baseline_end']}",
            "baseline_start_year": baseline["baseline_start"],
            "baseline_end_year": baseline["baseline_end"],
            "baseline_day_count": baseline["baseline_day_count"],
            "baseline_source_files": baseline["baseline_source_files"],
            "t90_min_c": baseline["t90_min_c"],
            "t90_mean_c": baseline["t90_mean_c"],
            "t90_max_c": baseline["t90_max_c"],
            "method": (
                "Simplified TX90p: percent of valid days in the target year "
                "where daily tasmax exceeds the local 1961-1990 all-day "
                "90th percentile at each CORDEX grid point. This is not yet "
                "the full ETCCDI calendar-day/bootstrap TX90p implementation."
            ),
            "aggregation": (
                "Mean of CORDEX grid-point TX90p values inside each H3 cell."
            ),
            "model_count": 1,
            "uncertainty_available": False,
            "uncertainty_method": None,
            "alpha_method": "fixed_single_model_alpha",
            "fixed_alpha": fixed_alpha,
            "run_metadata": run_metadata,
        }

        write_geojson(out_path=out_path, features=features, metadata=metadata)

        file_outputs.append(
            {
                "experiment": experiment,
                "year": year,
                "path": str(out_path),
                "feature_count": len(features),
                "value_min": safe_float(
                    np.nanmin([feature["properties"]["value"] for feature in features])
                ),
                "value_mean": safe_float(
                    np.nanmean([feature["properties"]["value"] for feature in features])
                ),
                "value_max": safe_float(
                    np.nanmax([feature["properties"]["value"] for feature in features])
                ),
            }
        )

        print(
            f"  wrote {experiment} {year}: {out_path} "
            f"(mean TX90p={file_outputs[-1]['value_mean']:.2f}%)"
        )

    ds.close()
    return file_outputs


def infer_run_metadata(run_dir: Path, h3_resolution: int) -> dict[str, Any]:
    return {
        "domain": "AUS-44",
        "model": "CCLM4-8-17-CLM3-5",
        "rcm_name": "CCLM4-8-17-CLM3-5",
        "driving_model": "MPI-M-MPI-ESM-LR",
        "ensemble": "r1i1p1",
        "variable": "tasmax",
        "frequency": "day",
        "source_family": "CORDEX",
        "run_dir": str(run_dir),
        "h3_resolution": h3_resolution,
    }


def write_catalog(
    *,
    out_dir: Path,
    outputs: list[dict[str, Any]],
    run_metadata: dict[str, Any],
    baseline: dict[str, Any],
    boundary_path: str,
    fixed_alpha: float,
) -> None:
    by_experiment: dict[str, list[int]] = defaultdict(list)

    for item in outputs:
        by_experiment[str(item["experiment"])].append(int(item["year"]))

    catalog = {
        "catalog_type": "tasmax_tx90p_climate_index_cache",
        "version": "0.1.0",
        "country_id": "fji",
        "variable": "tasmax",
        "metrics": ["tx90p"],
        "time_windows": ["yearly"],
        "spatial_resolution": {
            "type": "h3",
            "h3_resolution": run_metadata["h3_resolution"],
        },
        "baseline": {
            "start_year": baseline["baseline_start"],
            "end_year": baseline["baseline_end"],
            "period": f"{baseline['baseline_start']}-{baseline['baseline_end']}",
            "day_count": baseline["baseline_day_count"],
            "source_files": baseline["baseline_source_files"],
            "t90_min_c": baseline["t90_min_c"],
            "t90_mean_c": baseline["t90_mean_c"],
            "t90_max_c": baseline["t90_max_c"],
        },
        "method": (
            "Simplified yearly TX90p using a fixed local all-day 90th percentile "
            "baseline, not yet full ETCCDI calendar-day/bootstrap TX90p."
        ),
        "display": {
            "value_property": "value",
            "alpha_property": "alpha",
            "alpha_method": "fixed_single_model_alpha",
            "fixed_alpha": fixed_alpha,
            "uncertainty_available": False,
        },
        "run_metadata": run_metadata,
        "boundary_path": boundary_path,
        "experiments": {
            experiment: {
                "years": sorted(set(years)),
                "start_year": min(years),
                "end_year": max(years),
            }
            for experiment, years in sorted(by_experiment.items())
            if years
        },
        "file_count": len(outputs),
        "files": outputs,
    }

    catalog_path = out_dir / "tasmax" / "fji" / "tx90p_catalog.json"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(json.dumps(catalog, indent=2), encoding="utf-8")

    print(f"\nWrote catalog: {catalog_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", type=Path, default=DEFAULT_RUN_DIR)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--variable", default=DEFAULT_VARIABLE)
    parser.add_argument("--h3-resolution", type=int, default=DEFAULT_H3_RESOLUTION)
    parser.add_argument("--country-id", default="fji")
    parser.add_argument("--baseline-start", type=int, default=DEFAULT_BASELINE_START)
    parser.add_argument("--baseline-end", type=int, default=DEFAULT_BASELINE_END)
    parser.add_argument("--fixed-alpha", type=float, default=DEFAULT_FIXED_ALPHA)
    parser.add_argument("--experiments", nargs="+", default=None)
    parser.add_argument("--max-files", type=int, default=None)

    args = parser.parse_args()

    if not args.run_dir.exists():
        raise FileNotFoundError(f"Run directory not found: {args.run_dir}")

    files = find_netcdf_files(args.run_dir, args.experiments)

    if not files:
        raise FileNotFoundError(f"No NetCDF files found under: {args.run_dir}")

    processing_files = files
    if args.max_files is not None:
        processing_files = files[: args.max_files]

    print("TX90p climate-index build")
    print("-------------------------")
    print(f"Run dir: {args.run_dir}")
    print(f"Output dir: {args.out_dir}")
    print(f"All NetCDF files found: {len(files)}")
    print(f"Files to process: {len(processing_files)}")
    print(f"Baseline: {args.baseline_start}-{args.baseline_end}")
    print(f"H3 resolution: {args.h3_resolution}")
    print(f"Fixed alpha: {args.fixed_alpha}")

    run_metadata = infer_run_metadata(args.run_dir, args.h3_resolution)

    spatial_index = build_spatial_index(
        files[0],
        variable=args.variable,
        country_id=args.country_id,
        h3_resolution=args.h3_resolution,
    )

    baseline = compute_t90_baseline(
        files,
        variable=args.variable,
        spatial_index=spatial_index,
        baseline_start=args.baseline_start,
        baseline_end=args.baseline_end,
    )

    all_outputs: list[dict[str, Any]] = []

    for path in processing_files:
        outputs = process_file_tx90p(
            path,
            variable=args.variable,
            spatial_index=spatial_index,
            baseline=baseline,
            out_dir=args.out_dir,
            run_metadata=run_metadata,
            fixed_alpha=args.fixed_alpha,
        )
        all_outputs.extend(outputs)

    write_catalog(
        out_dir=args.out_dir,
        outputs=all_outputs,
        run_metadata=run_metadata,
        baseline=baseline,
        boundary_path=spatial_index["boundary_path"],
        fixed_alpha=args.fixed_alpha,
    )

    print("\nDone.")
    print(f"TX90p GeoJSON files written: {len(all_outputs)}")


if __name__ == "__main__":
    main()