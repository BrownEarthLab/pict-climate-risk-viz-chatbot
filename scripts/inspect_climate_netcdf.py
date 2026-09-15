#!/usr/bin/env python3
"""
Inspect a CORDEX / climate NetCDF file before building climate-index caches.

Usage:
  python scripts/inspect_climate_netcdf.py data/climate/raw/cordex/example.nc --variable tasmax
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import xarray as xr


def json_safe(value: Any) -> Any:
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return None if np.isnan(value) else float(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    return value


def summarize_coord(ds: xr.Dataset, name: str) -> dict[str, Any] | None:
    if name not in ds.coords and name not in ds.variables:
        return None
    arr = ds[name]
    values = arr.values
    out: dict[str, Any] = {
        "dims": list(arr.dims),
        "shape": list(arr.shape),
        "attrs": dict(arr.attrs),
    }
    try:
        if np.issubdtype(values.dtype, np.number):
            out["min"] = json_safe(np.nanmin(values))
            out["max"] = json_safe(np.nanmax(values))
        else:
            flat = values.ravel()
            out["first"] = str(flat[0]) if flat.size else None
            out["last"] = str(flat[-1]) if flat.size else None
    except Exception as exc:
        out["summary_error"] = str(exc)
    return out


def summarize_variable(ds: xr.Dataset, variable: str) -> dict[str, Any]:
    arr = ds[variable]
    sample = arr
    for dim in sample.dims:
        if sample.sizes.get(dim, 0) > 20:
            sample = sample.isel({dim: slice(0, 20)})
    out: dict[str, Any] = {
        "dims": list(arr.dims),
        "shape": list(arr.shape),
        "dtype": str(arr.dtype),
        "attrs": dict(arr.attrs),
    }
    try:
        values = sample.values
        out["sample_min"] = json_safe(np.nanmin(values))
        out["sample_max"] = json_safe(np.nanmax(values))
        out["sample_mean"] = json_safe(np.nanmean(values))
    except Exception as exc:
        out["sample_summary_error"] = str(exc)
    return out


def inspect_file(path: Path, variable: str | None) -> dict[str, Any]:
    ds = xr.open_dataset(path, decode_times=True)
    data_vars = list(ds.data_vars)
    selected = variable or ("tasmax" if "tasmax" in data_vars else data_vars[0])
    if selected not in ds.data_vars:
        raise KeyError(f"Variable {selected!r} not found. Available: {data_vars}")

    result: dict[str, Any] = {
        "file": str(path),
        "file_size_mb": round(path.stat().st_size / (1024 * 1024), 2),
        "global_attrs": dict(ds.attrs),
        "dims": {key: int(value) for key, value in ds.sizes.items()},
        "data_variables": data_vars,
        "selected_variable": selected,
        "selected_variable_summary": summarize_variable(ds, selected),
        "coords": {},
        "checks": {},
    }

    for name in ["time", "lat", "latitude", "lon", "longitude", "x", "y", "rlat", "rlon"]:
        summary = summarize_coord(ds, name)
        if summary is not None:
            result["coords"][name] = summary

    for lon_name in ["lon", "longitude"]:
        if lon_name in ds.coords or lon_name in ds.variables:
            lon_values = ds[lon_name].values
            try:
                lon_min = float(np.nanmin(lon_values))
                lon_max = float(np.nanmax(lon_values))
                result["checks"]["longitude_min"] = lon_min
                result["checks"]["longitude_max"] = lon_max
                result["checks"]["longitude_convention"] = "0_to_360" if lon_min >= 0 and lon_max > 180 else "-180_to_180_or_projected"
            except Exception as exc:
                result["checks"]["longitude_error"] = str(exc)
            break

    if "time" in ds.coords or "time" in ds.variables:
        t = ds["time"]
        values = t.values
        if len(values) > 0:
            result["checks"]["time_start"] = str(values[0])
            result["checks"]["time_end"] = str(values[-1])
            result["checks"]["time_count"] = int(len(values))
            result["checks"]["calendar"] = t.attrs.get("calendar")
            result["checks"]["time_units"] = t.attrs.get("units")

    units = ds[selected].attrs.get("units", "")
    result["checks"]["selected_variable_units"] = units
    result["checks"]["temperature_units_guess"] = "kelvin" if str(units).lower() in {"k", "kelvin"} else "celsius_or_unknown"
    ds.close()
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--variable", default=None)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()
    result = inspect_file(args.path, args.variable)
    text = json.dumps(result, indent=2, default=json_safe)
    print(text)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
