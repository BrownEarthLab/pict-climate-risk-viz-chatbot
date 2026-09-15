#!/usr/bin/env python3
"""
Build precomputed CORDEX Tmax climate-index cache.

First version:
  - Fiji only
  - CORDEX daily tasmax
  - yearly only
  - days_above_threshold only
  - thresholds: 30, 32, 35, 38, 40 °C
  - output as H3 GeoJSON cache files

Input:
  data/climate/raw/cordex/aus-44_cclm4-8-17-clm3-5_mpi-m-mpi-esm-lr_r1i1p1/**/*.nc

Output:
  backend/cache/climate_indices/tasmax/fji/h3_res6/days_above_threshold/threshold_30/historical_1951.geojson
  backend/cache/climate_indices/tasmax/fji/catalog.json

Install if needed:
  conda install -c conda-forge geopandas shapely
  python -m pip install h3

Run sample first:
  python scripts/build_tasmax_climate_indices.py --max-files 1

Run full selected CORDEX run:
  python scripts/build_tasmax_climate_indices.py
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
import pandas as pd
import xarray as xr
from shapely.geometry import Point, Polygon, mapping
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
DEFAULT_THRESHOLDS = [30.0, 32.0, 35.0, 38.0, 40.0]
DEFAULT_H3_RESOLUTION = 6

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
        # h3 v4 returns [(lat, lon), ...]
        coords = [[float(lon), float(lat)] for lat, lon in boundary]
    elif hasattr(h3, "h3_to_geo_boundary"):
        boundary = h3.h3_to_geo_boundary(cell, geo_json=True)
        # geo_json=True returns [(lon, lat), ...]
        coords = [[float(lon), float(lat)] for lon, lat in boundary]
    else:
        raise RuntimeError("Unsupported h3 Python API: no boundary function")

    if coords[0] != coords[-1]:
        coords.append(coords[0])

    return coords


def normalize_lon_180(lon: float) -> float:
    value = ((lon + 180.0) % 360.0) - 180.0
    # Keep 180 instead of turning it into -180 when appropriate.
    if math.isclose(value, -180.0) and lon > 0:
        return 180.0
    return value


def shift_negative_lon_to_360(x: float, y: float, z: float | None = None):
    shifted_x = x + 360.0 if x < 0 else x
    if z is None:
        return shifted_x, y
    return shifted_x, y, z


def load_country_geometry(country_id: str = "fji"):
    if country_id.lower() != "fji":
        raise ValueError("This first version only supports country_id='fji'.")

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


def point_inside_country(
    lat: float,
    lon: float,
    geometry,
    shifted_geometry,
) -> bool:
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
    expected_dims = ("time", *spatial_dims)

    missing_dims = [dim for dim in expected_dims if dim not in arr.dims]
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
            "Check the Fiji boundary and CORDEX lat/lon convention."
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

    if units_clean in {"c", "degc", "degree_celsius", "degrees_celsius", "celsius", "°c"}:
        return values

    print(
        f"WARNING: Unknown temperature units {units!r}; assuming Celsius.",
    )
    return values


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
    threshold_c: float,
    grid_point_count: int,
    source_files: list[str],
    run_metadata: dict[str, Any],
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
            "metric": "days_above_threshold",
            "value": value,
            "days_above_threshold": value,
            "unit": "days/year",
            "threshold_c": threshold_c,
            "experiment": experiment,
            "scenario": experiment,
            "year": year,
            "h3_id": h3_id,
            "h3_resolution": run_metadata["h3_resolution"],
            "grid_point_count": grid_point_count,
            "source_files": source_files,
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


def process_file(
    path: Path,
    *,
    variable: str,
    thresholds_c: list[float],
    spatial_index: dict[str, Any],
    out_dir: Path,
    run_metadata: dict[str, Any],
) -> list[dict[str, Any]]:
    print(f"\nProcessing: {path}")

    ds = xr.open_dataset(path, decode_times=True)

    experiment = get_experiment_from_file(path, ds)
    years = get_years_from_time(ds)
    unique_years = sorted(set(int(year) for year in years))

    arr = ds[variable]
    spatial_dims = tuple(spatial_index["spatial_dims"])
    arr = arr.transpose("time", *spatial_dims)

    units = str(arr.attrs.get("units", ""))
    data = arr.values.astype("float32")
    data_c = convert_temperature_to_celsius(data, units)

    point_records = spatial_index["point_records"]
    y_indexes = np.array([record["y"] for record in point_records], dtype=int)
    x_indexes = np.array([record["x"] for record in point_records], dtype=int)

    selected = data_c[:, y_indexes, x_indexes]

    file_outputs: list[dict[str, Any]] = []

    for year in unique_years:
        year_mask = years == year
        year_values = selected[year_mask, :]

        if year_values.size == 0:
            continue

        for threshold_c in thresholds_c:
            point_days = np.sum(year_values >= threshold_c, axis=0).astype("float32")

            features: list[dict[str, Any]] = []

            for h3_id, point_indexes in spatial_index["h3_to_point_indexes"].items():
                values = point_days[point_indexes]
                value = safe_float(np.nanmean(values))

                features.append(
                    make_h3_feature(
                        h3_id=h3_id,
                        value=value,
                        experiment=experiment,
                        year=year,
                        threshold_c=threshold_c,
                        grid_point_count=len(point_indexes),
                        source_files=[path.name],
                        run_metadata=run_metadata,
                    )
                )

            threshold_label = str(int(threshold_c)) if threshold_c.is_integer() else str(threshold_c)
            out_path = (
                out_dir
                / "tasmax"
                / "fji"
                / f"h3_res{run_metadata['h3_resolution']}"
                / "days_above_threshold"
                / f"threshold_{threshold_label}"
                / f"{experiment}_{year}.geojson"
            )

            metadata = {
                "country_id": "fji",
                "variable": "tasmax",
                "metric": "days_above_threshold",
                "unit": "days/year",
                "threshold_c": threshold_c,
                "experiment": experiment,
                "scenario": experiment,
                "year": year,
                "h3_resolution": run_metadata["h3_resolution"],
                "feature_count": len(features),
                "source_file": str(path),
                "source_units": units,
                "temperature_conversion": "K_to_C" if units.strip().lower() in {"k", "kelvin"} else "none_or_assumed_celsius",
                "aggregation": "mean of CORDEX grid-point annual exceedance days inside each H3 cell",
                "run_metadata": run_metadata,
            }

            write_geojson(out_path=out_path, features=features, metadata=metadata)

            file_outputs.append(
                {
                    "experiment": experiment,
                    "year": year,
                    "threshold_c": threshold_c,
                    "path": str(out_path),
                    "feature_count": len(features),
                }
            )

            print(
                f"  wrote {experiment} {year} threshold {threshold_label}: "
                f"{out_path}"
            )

    ds.close()
    return file_outputs


def infer_run_metadata(run_dir: Path, h3_resolution: int) -> dict[str, Any]:
    return {
        "domain": "AUS-44",
        "model": "CCLM4-8-17-CLM3-5",
        "driving_model": "MPI-M-MPI-ESM-LR",
        "ensemble": "r1i1p1",
        "variable": "tasmax",
        "frequency": "day",
        "source_family": "CORDEX",
        "run_dir": str(run_dir),
        "h3_resolution": h3_resolution,
    }


def find_netcdf_files(run_dir: Path, experiments: list[str] | None = None) -> list[Path]:
    files = sorted(run_dir.glob("*/*.nc"))

    if experiments:
        allowed = set(experiments)
        files = [path for path in files if path.parent.name in allowed]

    return files


def write_catalog(
    *,
    out_dir: Path,
    outputs: list[dict[str, Any]],
    run_metadata: dict[str, Any],
    thresholds_c: list[float],
    boundary_path: str,
) -> None:
    by_experiment: dict[str, list[int]] = defaultdict(list)

    for item in outputs:
        by_experiment[str(item["experiment"])].append(int(item["year"]))

    catalog = {
        "catalog_type": "tasmax_climate_indices_cache",
        "version": "0.1.0",
        "country_id": "fji",
        "variable": "tasmax",
        "metrics": ["days_above_threshold"],
        "thresholds_c": thresholds_c,
        "time_windows": ["yearly"],
        "spatial_resolution": {
            "type": "h3",
            "h3_resolution": run_metadata["h3_resolution"],
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

    catalog_path = out_dir / "tasmax" / "fji" / "catalog.json"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(json.dumps(catalog, indent=2), encoding="utf-8")

    print(f"\nWrote catalog: {catalog_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", type=Path, default=DEFAULT_RUN_DIR)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--variable", default=DEFAULT_VARIABLE)
    parser.add_argument("--thresholds", nargs="+", type=float, default=DEFAULT_THRESHOLDS)
    parser.add_argument("--h3-resolution", type=int, default=DEFAULT_H3_RESOLUTION)
    parser.add_argument("--country-id", default="fji")
    parser.add_argument("--experiments", nargs="+", default=None)
    parser.add_argument("--max-files", type=int, default=None)
    args = parser.parse_args()

    if not args.run_dir.exists():
        raise FileNotFoundError(f"Run directory not found: {args.run_dir}")

    files = find_netcdf_files(args.run_dir, args.experiments)

    if args.max_files is not None:
        files = files[: args.max_files]

    if not files:
        raise FileNotFoundError(f"No NetCDF files found under: {args.run_dir}")

    print("Tmax climate-index build")
    print("------------------------")
    print(f"Run dir: {args.run_dir}")
    print(f"Output dir: {args.out_dir}")
    print(f"Files: {len(files)}")
    print(f"Thresholds: {args.thresholds}")
    print(f"H3 resolution: {args.h3_resolution}")

    run_metadata = infer_run_metadata(args.run_dir, args.h3_resolution)

    spatial_index = build_spatial_index(
        files[0],
        variable=args.variable,
        country_id=args.country_id,
        h3_resolution=args.h3_resolution,
    )

    all_outputs: list[dict[str, Any]] = []

    for path in files:
        outputs = process_file(
            path,
            variable=args.variable,
            thresholds_c=args.thresholds,
            spatial_index=spatial_index,
            out_dir=args.out_dir,
            run_metadata=run_metadata,
        )
        all_outputs.extend(outputs)

    write_catalog(
        out_dir=args.out_dir,
        outputs=all_outputs,
        run_metadata=run_metadata,
        thresholds_c=args.thresholds,
        boundary_path=spatial_index["boundary_path"],
    )

    print("\nDone.")
    print(f"GeoJSON files written: {len(all_outputs)}")


if __name__ == "__main__":
    main()