from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
import xarray as xr
from shapely.geometry import box


# This file lives at:
# backend/scripts/build_climate_layer_from_nex.py
#
# parents[0] = scripts
# parents[1] = backend
# parents[2] = repo root
REPO_ROOT = Path(__file__).resolve().parents[2]

PICT_REGIONS_PATH = REPO_ROOT / "data" / "reference" / "pict_regions.geojson"
RAW_DIR = REPO_ROOT / "data" / "climate" / "raw" / "nex_gddp_cmip6"
PROCESSED_DIR = REPO_ROOT / "data" / "climate" / "processed"
REGISTRY_PATH = REPO_ROOT / "data" / "layers" / "climate_layer_registry.json"

THREDDS_BASE_URL = "https://ds.nccs.nasa.gov/thredds/ncss/grid/AMES/NEX/GDDP-CMIP6"


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = value.replace(".", "")
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


def normalize_scenario(scenario: str) -> str:
    mapping = {
        "SSP2-4.5": "ssp245",
        "ssp245": "ssp245",
        "SSP5-8.5": "ssp585",
        "ssp585": "ssp585",
    }

    if scenario not in mapping:
        raise ValueError(
            f"Unsupported scenario '{scenario}'. Supported: SSP2-4.5, ssp245, SSP5-8.5, ssp585."
        )

    return mapping[scenario]


def scenario_label_from_code(scenario_code: str) -> str:
    mapping = {
        "ssp245": "SSP2-4.5",
        "ssp585": "SSP5-8.5",
    }
    return mapping.get(scenario_code, scenario_code)


def load_region(region_name: str) -> gpd.GeoDataFrame:
    if not PICT_REGIONS_PATH.exists():
        raise FileNotFoundError(f"Missing region file: {PICT_REGIONS_PATH}")

    regions = gpd.read_file(PICT_REGIONS_PATH)

    if regions.crs is None:
        regions = regions.set_crs("EPSG:4326")
    else:
        regions = regions.to_crs("EPSG:4326")

    match = regions[
        regions["name"].astype(str).str.lower().str.strip()
        == region_name.lower().strip()
    ]

    if match.empty:
        available = sorted(regions["name"].dropna().astype(str).unique().tolist())
        raise ValueError(
            f"Could not find region '{region_name}' in pict_regions.geojson. "
            f"Available examples: {available[:10]}"
        )

    return match.dissolve().reset_index(drop=True)


def collect_coordinates(geometry: Any) -> list[tuple[float, float]]:
    coords: list[tuple[float, float]] = []

    def walk(obj: Any) -> None:
        if isinstance(obj, (list, tuple)):
            if (
                len(obj) >= 2
                and isinstance(obj[0], (int, float))
                and isinstance(obj[1], (int, float))
            ):
                coords.append((float(obj[0]), float(obj[1])))
            else:
                for item in obj:
                    walk(item)

    walk(geometry.__geo_interface__["coordinates"])
    return coords


def get_lonlat_windows(region_gdf: gpd.GeoDataFrame, padding_degrees: float = 0.5) -> list[dict[str, float]]:
    """
    Return one or two lon/lat query windows.

    Fiji crosses the antimeridian. A naive bbox can become almost global:
    [-180, south, 180, north].

    To avoid downloading the whole world, we split positive and negative
    longitudes into separate THREDDS requests when needed.
    """
    geom = region_gdf.geometry.iloc[0]
    coords = collect_coordinates(geom)

    lons = np.array([lon for lon, _ in coords])
    lats = np.array([lat for _, lat in coords])

    south = float(lats.min() - padding_degrees)
    north = float(lats.max() + padding_degrees)

    negative_lons = lons[lons < 0]
    positive_lons = lons[lons >= 0]

    windows: list[dict[str, float]] = []

    if len(negative_lons) > 0 and len(positive_lons) > 0:
        windows.append(
            {
                "west": float(negative_lons.min() - padding_degrees),
                "east": float(negative_lons.max() + padding_degrees),
                "south": south,
                "north": north,
            }
        )
        windows.append(
            {
                "west": float(positive_lons.min() - padding_degrees),
                "east": float(positive_lons.max() + padding_degrees),
                "south": south,
                "north": north,
            }
        )
    else:
        windows.append(
            {
                "west": float(lons.min() - padding_degrees),
                "east": float(lons.max() + padding_degrees),
                "south": south,
                "north": north,
            }
        )

    return windows


def build_ncss_url(
    model: str,
    scenario_code: str,
    variant: str,
    variable: str,
    year: int,
    window: dict[str, float],
) -> str:
    filename = f"{variable}_day_{model}_{scenario_code}_{variant}_gn_{year}_v2.0.nc"

    return (
        f"{THREDDS_BASE_URL}/{model}/{scenario_code}/{variant}/{variable}/{filename}"
        f"?var={variable}"
        f"&north={window['north']}"
        f"&west={window['west']}"
        f"&east={window['east']}"
        f"&south={window['south']}"
        f"&horizStride=1"
        f"&time_start={year}-01-01T12:00:00Z"
        f"&time_end={year}-12-31T12:00:00Z"
        f"&accept=netcdf3"
        f"&addLatLon=true"
    )


def download_subset(url: str, out_path: Path, overwrite: bool = False) -> Path:
    if out_path.exists() and not overwrite:
        return out_path

    out_path.parent.mkdir(parents=True, exist_ok=True)

    response = requests.get(url, timeout=120)

    if response.status_code != 200:
        raise RuntimeError(
            f"Failed to download NetCDF subset.\n"
            f"Status code: {response.status_code}\n"
            f"URL: {url}\n"
            f"Response preview: {response.text[:500]}"
        )

    out_path.write_bytes(response.content)
    return out_path


def get_coordinate_names(ds: xr.Dataset) -> tuple[str, str, str]:
    possible_lat_names = ["lat", "latitude", "y"]
    possible_lon_names = ["lon", "longitude", "x"]
    possible_time_names = ["time"]

    lat_name = next((name for name in possible_lat_names if name in ds.coords), None)
    lon_name = next((name for name in possible_lon_names if name in ds.coords), None)
    time_name = next((name for name in possible_time_names if name in ds.coords), None)

    if lat_name is None or lon_name is None or time_name is None:
        raise ValueError(
            f"Could not infer coordinate names. Dataset coords: {list(ds.coords)}"
        )

    return lat_name, lon_name, time_name


def kelvin_to_celsius_if_needed(values: xr.DataArray) -> xr.DataArray:
    """
    NEX temperature variables are typically Kelvin.
    If values look Kelvin-like, convert to Celsius.
    """
    sample_mean = float(values.mean(skipna=True).compute())

    if sample_mean > 100:
        return values - 273.15

    return values


def process_one_subset(
    nc_path: Path,
    variable: str,
    threshold_c: float,
    year: int,
) -> pd.DataFrame:
    ds = xr.open_dataset(nc_path)
    lat_name, lon_name, time_name = get_coordinate_names(ds)

    if variable not in ds:
        raise ValueError(f"Variable '{variable}' not found in {nc_path}. Variables: {list(ds.data_vars)}")

    da = ds[variable]

    if time_name not in da.dims:
        raise ValueError(f"Expected '{time_name}' to be a dimension of variable '{variable}'.")

    da_c = kelvin_to_celsius_if_needed(da)

    annual_extreme_day_count = (da_c >= threshold_c).sum(dim=time_name, skipna=True)
    annual_mean_tasmax_c = da_c.mean(dim=time_name, skipna=True)

    extreme_df = annual_extreme_day_count.to_dataframe(name="extreme_heat_days").reset_index()
    mean_df = annual_mean_tasmax_c.to_dataframe(name="mean_tasmax_c").reset_index()

    df = extreme_df.merge(mean_df, on=[lat_name, lon_name], how="left")

    df = df.rename(columns={lat_name: "lat", lon_name: "lon"})
    df["year"] = year

    df = df[["lat", "lon", "year", "extreme_heat_days", "mean_tasmax_c"]]
    df = df.dropna(subset=["lat", "lon"])

    return df


def normalize_longitude(lon: float) -> float:
    """
    Convert 0..360 longitude to -180..180 if needed.
    """
    if lon > 180:
        return lon - 360
    return lon


def dataframe_to_geodataframe(
    df: pd.DataFrame,
    region_gdf: gpd.GeoDataFrame,
    cell_size_degrees: float = 0.25,
) -> gpd.GeoDataFrame:
    grouped = (
        df.assign(lon=df["lon"].map(normalize_longitude))
        .groupby(["lat", "lon"], as_index=False)
        .agg(
            extreme_heat_days_mean=("extreme_heat_days", "mean"),
            extreme_heat_days_min=("extreme_heat_days", "min"),
            extreme_heat_days_max=("extreme_heat_days", "max"),
            mean_tasmax_c_mean=("mean_tasmax_c", "mean"),
            model_year_count=("year", "nunique"),
        )
    )

    half = cell_size_degrees / 2

    grouped["geometry"] = grouped.apply(
        lambda row: box(
            row["lon"] - half,
            row["lat"] - half,
            row["lon"] + half,
            row["lat"] + half,
        ),
        axis=1,
    )

    gdf = gpd.GeoDataFrame(grouped, geometry="geometry", crs="EPSG:4326")

    clipped = gpd.clip(gdf, region_gdf)

    clipped = clipped.reset_index(drop=True)
    clipped["cell_id"] = [
        f"cell_{i:05d}" for i in range(len(clipped))
    ]

    return clipped


def update_registry(entry: dict[str, Any]) -> None:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)

    if REGISTRY_PATH.exists():
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            registry = json.load(f)
    else:
        registry = []

    registry = [
        existing for existing in registry
        if existing.get("layer_id") != entry["layer_id"]
    ]

    registry.append(entry)

    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2)


def build_extreme_heat_layer(
    region_name: str = "Fiji",
    model: str = "ACCESS-CM2",
    scenario: str = "SSP2-4.5",
    variant: str = "r1i1p1f1",
    variable: str = "tasmax",
    output_variable: str = "extreme_heat_days",
    period_label: str = "2050s",
    start_year: int = 2041,
    end_year: int = 2060,
    threshold_c: float = 35.0,
    overwrite_downloads: bool = False,
) -> Path:
    scenario_code = normalize_scenario(scenario)
    scenario_label = scenario_label_from_code(scenario_code)

    region_gdf = load_region(region_name)
    windows = get_lonlat_windows(region_gdf)

    all_rows: list[pd.DataFrame] = []

    for year in range(start_year, end_year + 1):
        for window_index, window in enumerate(windows):
            url = build_ncss_url(
                model=model,
                scenario_code=scenario_code,
                variant=variant,
                variable=variable,
                year=year,
                window=window,
            )

            raw_path = (
                RAW_DIR
                / model
                / scenario_code
                / variable
                / f"{variable}_{model}_{scenario_code}_{year}_window{window_index}.nc"
            )

            print(f"Downloading/using {year}, window {window_index}: {raw_path.name}")
            nc_path = download_subset(url, raw_path, overwrite=overwrite_downloads)

            print(f"Processing {nc_path.name}")
            rows = process_one_subset(
                nc_path=nc_path,
                variable=variable,
                threshold_c=threshold_c,
                year=year,
            )

            all_rows.append(rows)

    combined_df = pd.concat(all_rows, ignore_index=True)

    result_gdf = dataframe_to_geodataframe(
        df=combined_df,
        region_gdf=region_gdf,
        cell_size_degrees=0.25,
    )

    layer_id = (
        f"{slugify(region_name)}_"
        f"{output_variable}_"
        f"{period_label}_"
        f"{scenario_code}_"
        f"{slugify(model)}"
    )

    result_gdf["layer_id"] = layer_id
    result_gdf["region_name"] = region_name
    result_gdf["variable"] = output_variable
    result_gdf["source_variable"] = variable
    result_gdf["period"] = period_label
    result_gdf["start_year"] = start_year
    result_gdf["end_year"] = end_year
    result_gdf["scenario"] = scenario_label
    result_gdf["scenario_code"] = scenario_code
    result_gdf["model"] = model
    result_gdf["variant"] = variant
    result_gdf["threshold_c"] = threshold_c
    result_gdf["units"] = "days/year"
    result_gdf["source_dataset"] = "NASA NEX-GDDP-CMIP6"
    result_gdf["processing_method"] = (
        f"Mean annual count of days with daily tasmax >= {threshold_c}°C "
        f"over {start_year}-{end_year}."
    )

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = PROCESSED_DIR / f"{layer_id}.geojson"

    result_gdf.to_file(out_path, driver="GeoJSON")

    registry_entry = {
        "layer_id": layer_id,
        "artifact_type": "climate_layer",
        "variable": output_variable,
        "source_variable": variable,
        "region_name": region_name,
        "period": period_label,
        "start_year": start_year,
        "end_year": end_year,
        "scenario": scenario_label,
        "scenario_code": scenario_code,
        "model": model,
        "variant": variant,
        "threshold_c": threshold_c,
        "units": "days/year",
        "value_column": "extreme_heat_days_mean",
        "uncertainty_columns": [
            "extreme_heat_days_min",
            "extreme_heat_days_max",
        ],
        "path": str(out_path.relative_to(REPO_ROOT)),
        "file_format": "geojson",
        "geometry_type": "polygon_grid",
        "source_dataset": "NASA NEX-GDDP-CMIP6",
        "source_access_method": "NASA NCCS THREDDS NetcdfSubset",
        "source_url_base": THREDDS_BASE_URL,
        "description": (
            f"Derived {output_variable} for {region_name}, {period_label}, "
            f"{scenario_label}, model {model}. Values represent mean annual "
            f"number of days with tasmax >= {threshold_c}°C."
        ),
    }

    update_registry(registry_entry)

    print()
    print(f"Saved processed layer: {out_path}")
    print(f"Updated registry: {REGISTRY_PATH}")
    print(f"Layer ID: {layer_id}")
    print(f"Feature count: {len(result_gdf)}")

    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a real climate layer from NASA NEX-GDDP-CMIP6."
    )

    parser.add_argument("--region", default="Fiji")
    parser.add_argument("--model", default="ACCESS-CM2")
    parser.add_argument("--scenario", default="SSP2-4.5")
    parser.add_argument("--variant", default="r1i1p1f1")
    parser.add_argument("--period-label", default="2050s")
    parser.add_argument("--start-year", type=int, default=2041)
    parser.add_argument("--end-year", type=int, default=2060)
    parser.add_argument("--threshold-c", type=float, default=35.0)
    parser.add_argument("--overwrite-downloads", action="store_true")

    args = parser.parse_args()

    build_extreme_heat_layer(
        region_name=args.region,
        model=args.model,
        scenario=args.scenario,
        variant=args.variant,
        period_label=args.period_label,
        start_year=args.start_year,
        end_year=args.end_year,
        threshold_c=args.threshold_c,
        overwrite_downloads=args.overwrite_downloads,
    )


if __name__ == "__main__":
    main()