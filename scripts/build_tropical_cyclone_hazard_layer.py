#!/usr/bin/env python3
"""
Convert one EMPIRIC_TC/STORM-style tropical-cyclone ASC matrix into
country-level and all-PICT GeoJSON hazard layers.

Input expected today:
  data/hazards/tropical_cyclone/raw/TC_200_year.asc

The uploaded 200-year and 500-year ASC files were byte-identical, so this script
creates one neutral TC hazard layer now. When the corrected second file arrives,
run the same script with a different --layer-id / --input.

Default outputs:
  backend/cache/tropical_cyclone/pict/tc_hazard.geojson
  backend/cache/tropical_cyclone/fji/tc_hazard.geojson
  backend/cache/tropical_cyclone/wsm/tc_hazard.geojson
  ... one folder per available PICT country boundary

Notes:
  - The paper describes 0.5 x 0.5 degree output grids over the South Pacific,
    shape 110 x 210, latitude 5S-60S, longitude 135E-240E.
  - This script displays native 0.5-degree TC grid cells, not H3, because the
    paper argues sub-grid interpolation would redistribute rather than reduce
    uncertainty for high-intensity TC wind-fields.
  - Small negative values are clipped to zero by default and flagged as numerical artifacts.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
from shapely.geometry import Polygon, mapping
from shapely.ops import transform, unary_union

DEFAULT_INPUT = Path("data/hazards/tropical_cyclone/raw/TC_200_year.asc")
DEFAULT_OUTPUT_DIR = Path("backend/cache/tropical_cyclone")

PICT_REFERENCE_DIR = Path("data/reference/pict")

KNOWN_PICT_COUNTRIES = [
    {"country_id": "asm", "country_iso3": "ASM", "country_name": "American Samoa"},
    {"country_id": "cok", "country_iso3": "COK", "country_name": "Cook Islands"},
    {"country_id": "fji", "country_iso3": "FJI", "country_name": "Fiji"},
    {"country_id": "fsm", "country_iso3": "FSM", "country_name": "Micronesia (Federated States of)"},
    {"country_id": "gum", "country_iso3": "GUM", "country_name": "Guam"},
    {"country_id": "kir", "country_iso3": "KIR", "country_name": "Kiribati"},
    {"country_id": "mhl", "country_iso3": "MHL", "country_name": "Marshall Islands"},
    {"country_id": "mnp", "country_iso3": "MNP", "country_name": "Northern Mariana Islands"},
    {"country_id": "nru", "country_iso3": "NRU", "country_name": "Nauru"},
    {"country_id": "ncl", "country_iso3": "NCL", "country_name": "New Caledonia"},
    {"country_id": "niu", "country_iso3": "NIU", "country_name": "Niue"},
    {"country_id": "plw", "country_iso3": "PLW", "country_name": "Palau"},
    {"country_id": "png", "country_iso3": "PNG", "country_name": "Papua New Guinea"},
    {"country_id": "pyf", "country_iso3": "PYF", "country_name": "French Polynesia"},
    {"country_id": "slb", "country_iso3": "SLB", "country_name": "Solomon Islands"},
    {"country_id": "tkl", "country_iso3": "TKL", "country_name": "Tokelau"},
    {"country_id": "ton", "country_iso3": "TON", "country_name": "Tonga"},
    {"country_id": "tuv", "country_iso3": "TUV", "country_name": "Tuvalu"},
    {"country_id": "vut", "country_iso3": "VUT", "country_name": "Vanuatu"},
    {"country_id": "wlf", "country_iso3": "WLF", "country_name": "Wallis and Futuna"},
    {"country_id": "wsm", "country_iso3": "WSM", "country_name": "Samoa"},
]

FIJI_GEOMETRY_CANDIDATES = [
    Path("data/reference/pict/fji/adm0.geojson"),
    Path("data/reference/fiji_admin_adm0.geojson"),
    Path("data/reference/fiji_admin_adm1.geojson"),
    Path("data/reference/fiji_admin_adm2.geojson"),
    Path("data/reference/fiji_tikina.geojson"),
]


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


def normalize_output_lon(x: float, y: float, z: float | None = None):
    shifted_x = normalize_lon_180(x)
    if z is None:
        return shifted_x, y
    return shifted_x, y, z


def load_country_geometry(country_id: str) -> dict[str, Any] | None:
    country_id = country_id.lower()

    if country_id == "fji":
        candidates = FIJI_GEOMETRY_CANDIDATES
    else:
        candidates = [PICT_REFERENCE_DIR / country_id / "adm0.geojson"]

    existing = [path for path in candidates if path.exists()]
    if not existing:
        return None

    path = existing[0]
    gdf = gpd.read_file(path)
    if gdf.empty:
        return None
    if gdf.crs is not None:
        gdf = gdf.to_crs("EPSG:4326")

    geometry = unary_union(gdf.geometry)
    shifted_geometry = transform(shift_negative_lon_to_360, geometry)

    known = next(
        (country for country in KNOWN_PICT_COUNTRIES if country["country_id"] == country_id),
        {"country_id": country_id, "country_iso3": country_id.upper(), "country_name": country_id.upper()},
    )

    return {
        "country_id": country_id,
        "country_iso3": known["country_iso3"],
        "country_name": known["country_name"],
        "boundary_path": str(path),
        "geometry": geometry,
        "shifted_geometry": shifted_geometry,
    }


def make_cell_polygon_360(west_360: float, east_360: float, north: float, south: float) -> Polygon:
    return Polygon(
        [
            (west_360, north),
            (east_360, north),
            (east_360, south),
            (west_360, south),
            (west_360, north),
        ]
    )


def geometry_to_output_mapping(geometry_360) -> dict[str, Any]:
    return mapping(transform(normalize_output_lon, geometry_360))


def classify_hazard(value: float) -> str:
    if value >= 0.4:
        return "very_high"
    if value >= 0.2:
        return "high"
    if value >= 0.1:
        return "medium"
    if value >= 0.05:
        return "low"
    return "very_low"


def build_source_cells(
    arr: np.ndarray,
    *,
    grid_resolution_degrees: float,
    lon_west: float,
    lat_north: float,
    row_orientation: str,
    clip_negative: bool,
) -> list[dict[str, Any]]:
    rows, cols = arr.shape
    cells: list[dict[str, Any]] = []

    for row in range(rows):
        if row_orientation == "north_to_south":
            north = lat_north - row * grid_resolution_degrees
            south = north - grid_resolution_degrees
        else:
            # Used only if future validation shows the ASC is vertically flipped.
            # The caller is responsible for passing lat_south-derived metadata.
            raise ValueError("south_to_north is not implemented for all-country build yet.")

        lat_center = (north + south) / 2.0

        for col in range(cols):
            raw_value = float(arr[row, col])
            if not np.isfinite(raw_value):
                continue

            west_360 = lon_west + col * grid_resolution_degrees
            east_360 = west_360 + grid_resolution_degrees
            lon_center_360 = (west_360 + east_360) / 2.0
            lon_center = normalize_lon_180(lon_center_360)

            polygon_360 = make_cell_polygon_360(west_360, east_360, north, south)
            if polygon_360.is_empty or not polygon_360.is_valid:
                continue

            clipped_negative = bool(clip_negative and raw_value < 0)
            value = max(0.0, raw_value) if clip_negative else raw_value
            hazard_class = classify_hazard(value)
            cell_id = f"tc_0p5_r{row:03d}_c{col:03d}"

            cells.append(
                {
                    "polygon_360": polygon_360,
                    "output_geometry": geometry_to_output_mapping(polygon_360),
                    "properties": {
                        "metric": "tc_hazard",
                        "value": value,
                        "hazard_value": value,
                        "raw_value": raw_value,
                        "hazard_class": hazard_class,
                        "clipped_negative": clipped_negative,
                        "grid_resolution_degrees": grid_resolution_degrees,
                        "spatial_unit": "0.5_degree_grid_cell",
                        "row": row,
                        "col": col,
                        "cell_id": cell_id,
                        "lat_center": lat_center,
                        "lon_center": lon_center,
                        "lon_center_360": lon_center_360,
                        "lat_north": north,
                        "lat_south": south,
                        "lon_west": normalize_lon_180(west_360),
                        "lon_east": normalize_lon_180(east_360),
                        "lon_west_360": west_360,
                        "lon_east_360": east_360,
                    },
                }
            )

    return cells


def make_feature(
    *,
    cell: dict[str, Any],
    country: dict[str, Any],
    layer_id: str,
    layer_label: str,
    source_dataset: str,
    unit: str,
) -> dict[str, Any]:
    return {
        "type": "Feature",
        "geometry": cell["output_geometry"],
        "properties": {
            "layer_name": layer_label,
            "hazard_family": "tropical_cyclone",
            "source_dataset": source_dataset,
            "country_id": country["country_id"],
            "country_iso3": country["country_iso3"],
            "country_name": country["country_name"],
            "layer_id": layer_id,
            "unit": unit,
            **cell["properties"],
        },
    }


def build_layer_for_country(
    *,
    country: dict[str, Any],
    source_cells: list[dict[str, Any]],
    arr: np.ndarray,
    args: argparse.Namespace,
    raw_min: float,
    raw_mean: float,
    raw_max: float,
    negative_count: int,
    output_path: Path,
) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    values_kept: list[float] = []

    shifted_geometry = country["shifted_geometry"]

    for cell in source_cells:
        if not cell["polygon_360"].intersects(shifted_geometry):
            continue

        value = float(cell["properties"]["value"])
        values_kept.append(value)
        features.append(
            make_feature(
                cell=cell,
                country=country,
                layer_id=args.layer_id,
                layer_label=args.layer_label,
                source_dataset=args.source_dataset,
                unit=args.unit,
            )
        )

    if values_kept:
        values = np.array(values_kept, dtype="float64")
        display_value_min = float(np.nanmin(values))
        display_value_mean = float(np.nanmean(values))
        display_value_max = float(np.nanmax(values))
    else:
        display_value_min = None
        display_value_mean = None
        display_value_max = None

    metadata = {
        "country_id": country["country_id"],
        "country_iso3": country["country_iso3"],
        "country_name": country["country_name"],
        "layer_id": args.layer_id,
        "layer_label": args.layer_label,
        "hazard_family": "tropical_cyclone",
        "source_dataset": args.source_dataset,
        "source_file": str(args.input),
        "source_boundary": country["boundary_path"],
        "metric": "tc_hazard",
        "unit": args.unit,
        "shape": list(arr.shape),
        "domain": {
            "lat_north": args.lat_north,
            "lat_south": args.lat_south,
            "lon_west": args.lon_west,
            "lon_east": args.lon_east,
            "longitude_convention": "source_0_to_360_output_minus180_to_180",
            "grid_resolution_degrees": args.grid_resolution_degrees,
            "row_orientation": args.row_orientation,
        },
        "feature_count": len(features),
        "raw_value_min": raw_min,
        "raw_value_mean": raw_mean,
        "raw_value_max": raw_max,
        "negative_value_count_in_source": negative_count,
        "negative_values_clipped_to_zero": bool(args.clip_negative),
        "display_value_min": display_value_min,
        "display_value_mean": display_value_mean,
        "display_value_max": display_value_max,
        "hazard_class_breaks": {
            "very_low": "value < 0.05",
            "low": "0.05 <= value < 0.10",
            "medium": "0.10 <= value < 0.20",
            "high": "0.20 <= value < 0.40",
            "very_high": "value >= 0.40",
        },
        "method_note": (
            "ASC values were converted to native 0.5-degree grid-cell polygons and "
            "filtered to cells intersecting the requested PICT country/region. "
            "Units/return-period semantics should be confirmed before final labeling."
        ),
    }

    payload = {
        "type": "FeatureCollection",
        "metadata": metadata,
        "features": features,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload), encoding="utf-8")

    return {
        "country_id": country["country_id"],
        "country_name": country["country_name"],
        "output_path": str(output_path),
        "feature_count": len(features),
        "display_value_min": display_value_min,
        "display_value_mean": display_value_mean,
        "display_value_max": display_value_max,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--country-id",
        default="all",
        help="Use 'all' to build all available PICT country files plus a combined pict layer, or one country id like fji/wsm/ton.",
    )
    parser.add_argument("--layer-id", default="tc_hazard")
    parser.add_argument("--layer-label", default="Tropical Cyclone Hazard")
    parser.add_argument("--source-dataset", default="EMPIRIC_TC")
    parser.add_argument("--grid-resolution-degrees", type=float, default=0.5)
    parser.add_argument("--lon-west", type=float, default=135.0)
    parser.add_argument("--lon-east", type=float, default=240.0)
    parser.add_argument("--lat-north", type=float, default=-5.0)
    parser.add_argument("--lat-south", type=float, default=-60.0)
    parser.add_argument(
        "--row-orientation",
        choices=["north_to_south"],
        default="north_to_south",
    )
    parser.add_argument("--clip-negative", action="store_true", default=True)
    parser.add_argument(
        "--unit",
        default="unconfirmed_tc_hazard_value",
        help="Use a cautious unit until the ASC export meaning is confirmed.",
    )
    args = parser.parse_args()

    print("EMPIRIC_TC tropical cyclone ASC -> PICT GeoJSON layers")
    print("------------------------------------------------------")
    print(f"Input: {args.input}")
    print(f"Output dir: {args.output_dir}")
    print(f"Country id: {args.country_id}")

    if not args.input.exists():
        raise FileNotFoundError(
            f"Input ASC not found: {args.input}. Copy TC_200_year.asc there first."
        )

    arr = np.loadtxt(args.input)
    if arr.ndim != 2:
        raise ValueError(f"Expected 2D ASC matrix, got shape {arr.shape}")

    rows, cols = arr.shape
    expected_rows = int(round((args.lat_north - args.lat_south) / args.grid_resolution_degrees))
    expected_cols = int(round((args.lon_east - args.lon_west) / args.grid_resolution_degrees))

    print(f"Matrix shape: {rows} x {cols}")
    print(f"Expected from metadata: {expected_rows} x {expected_cols}")

    if (rows, cols) != (expected_rows, expected_cols):
        raise ValueError(
            "ASC shape does not match supplied South Pacific grid metadata: "
            f"matrix={(rows, cols)} expected={(expected_rows, expected_cols)}"
        )

    raw_min = float(np.nanmin(arr))
    raw_mean = float(np.nanmean(arr))
    raw_max = float(np.nanmax(arr))
    negative_count = int(np.sum(np.isfinite(arr) & (arr < 0)))

    source_cells = build_source_cells(
        arr,
        grid_resolution_degrees=args.grid_resolution_degrees,
        lon_west=args.lon_west,
        lat_north=args.lat_north,
        row_orientation=args.row_orientation,
        clip_negative=args.clip_negative,
    )

    print(f"Source grid cells: {len(source_cells)}")

    requested_country_id = args.country_id.lower().strip()
    if requested_country_id == "all":
        country_ids = [country["country_id"] for country in KNOWN_PICT_COUNTRIES]
    elif requested_country_id == "pict":
        country_ids = [country["country_id"] for country in KNOWN_PICT_COUNTRIES]
    else:
        country_ids = [requested_country_id]

    loaded_countries = []
    skipped_countries = []

    for country_id in country_ids:
        country = load_country_geometry(country_id)
        if country is None:
            skipped_countries.append(country_id)
            print(f"WARNING: missing ADM0 boundary for {country_id}; skipping.")
            continue
        loaded_countries.append(country)
        print(f"Loaded boundary: {country['country_id']} ({country['country_name']})")

    if not loaded_countries:
        raise RuntimeError("No country boundaries were loaded. Check data/reference/pict/<country_id>/adm0.geojson.")

    outputs = []

    if requested_country_id in {"all", "pict"}:
        pict_union = unary_union([country["shifted_geometry"] for country in loaded_countries])
        pict_country = {
            "country_id": "pict",
            "country_iso3": "PICT",
            "country_name": "PICT region",
            "boundary_path": "union_of_available_pict_adm0_boundaries",
            "shifted_geometry": pict_union,
        }

        output_path = args.output_dir / "pict" / f"{args.layer_id}.geojson"
        outputs.append(
            build_layer_for_country(
                country=pict_country,
                source_cells=source_cells,
                arr=arr,
                args=args,
                raw_min=raw_min,
                raw_mean=raw_mean,
                raw_max=raw_max,
                negative_count=negative_count,
                output_path=output_path,
            )
        )

    for country in loaded_countries:
        output_path = args.output_dir / country["country_id"] / f"{args.layer_id}.geojson"
        outputs.append(
            build_layer_for_country(
                country=country,
                source_cells=source_cells,
                arr=arr,
                args=args,
                raw_min=raw_min,
                raw_mean=raw_mean,
                raw_max=raw_max,
                negative_count=negative_count,
                output_path=output_path,
            )
        )

    manifest = {
        "layer_id": args.layer_id,
        "layer_label": args.layer_label,
        "hazard_family": "tropical_cyclone",
        "source_dataset": args.source_dataset,
        "source_file": str(args.input),
        "unit": args.unit,
        "shape": [rows, cols],
        "domain": {
            "lat_north": args.lat_north,
            "lat_south": args.lat_south,
            "lon_west": args.lon_west,
            "lon_east": args.lon_east,
            "grid_resolution_degrees": args.grid_resolution_degrees,
            "row_orientation": args.row_orientation,
        },
        "skipped_countries_missing_boundary": skipped_countries,
        "outputs": outputs,
    }

    manifest_path = args.output_dir / f"{args.layer_id}_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("\nDone.")
    print(f"Wrote manifest: {manifest_path}")
    for output in outputs:
        print(
            f"  {output['country_id']}: {output['feature_count']} cells -> {output['output_path']}"
        )
    if skipped_countries:
        print(f"Skipped missing boundaries: {', '.join(skipped_countries)}")


if __name__ == "__main__":
    main()
