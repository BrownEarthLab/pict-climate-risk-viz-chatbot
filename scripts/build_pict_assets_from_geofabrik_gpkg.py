#!/usr/bin/env python3
"""
Build PICT infrastructure asset caches from Geofabrik GeoPackage extracts.

This avoids Overpass entirely.

Suggested location:
  scripts/build_pict_assets_from_geofabrik_gpkg.py

Install deps if needed:
  python -m pip install geopandas requests pyogrio fiona shapely

Run from repo root:
  python scripts/build_pict_assets_from_geofabrik_gpkg.py

Target a few:
  python scripts/build_pict_assets_from_geofabrik_gpkg.py --countries NCL,PNG,PYF,TON,TUV,VUT,WLF,TKL,NIU

Force rebuild caches:
  python scripts/build_pict_assets_from_geofabrik_gpkg.py --force-cache

Outputs backend-compatible files:
  backend/cache/admin_assets/adm0_<country>_critical_facility_hospital_port_power_substation_school.json
  backend/cache/admin_assets/adm1_*.json
  backend/cache/admin_assets/adm2_*.json
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

try:
    import geopandas as gpd
    import pandas as pd
except Exception as exc:  # pragma: no cover
    print("Missing Python GIS dependencies.", file=sys.stderr)
    print("Install with:", file=sys.stderr)
    print("  python -m pip install geopandas requests pyogrio fiona shapely", file=sys.stderr)
    raise

CACHE_SCHEMA_VERSION = 1
ASSET_LAYER_NAME = "Manual Heat Risk Assets"

DEFAULT_ASSET_TYPES = [
    "critical_facility",
    "hospital",
    "port",
    "power_substation",
    "school",
]

PICT_COUNTRIES = {
    "ASM": {"name": "American Samoa", "slug": "american-oceania"},
    "COK": {"name": "Cook Islands", "slug": "cook-islands"},
    "FJI": {"name": "Fiji", "slug": "fiji"},
    "FSM": {"name": "Micronesia (Federated States of)", "slug": "micronesia"},
    "GUM": {"name": "Guam", "slug": "american-oceania"},
    "KIR": {"name": "Kiribati", "slug": "kiribati"},
    "MHL": {"name": "Marshall Islands", "slug": "marshall-islands"},
    "MNP": {"name": "Northern Mariana Islands", "slug": "american-oceania"},
    "NRU": {"name": "Nauru", "slug": "nauru"},
    "NCL": {"name": "New Caledonia", "slug": "new-caledonia"},
    "NIU": {"name": "Niue", "slug": "niue"},
    "PLW": {"name": "Palau", "slug": "palau"},
    "PNG": {"name": "Papua New Guinea", "slug": "papua-new-guinea"},
    "PYF": {"name": "French Polynesia", "slug": "polynesie-francaise"},
    "SLB": {"name": "Solomon Islands", "slug": "solomon-islands"},
    "TKL": {"name": "Tokelau", "slug": "tokelau"},
    "TON": {"name": "Tonga", "slug": "tonga"},
    "TUV": {"name": "Tuvalu", "slug": "tuvalu"},
    "VUT": {"name": "Vanuatu", "slug": "vanuatu"},
    "WLF": {"name": "Wallis and Futuna", "slug": "wallis-et-futuna"},
    "WSM": {"name": "Samoa", "slug": "samoa"},
}

# Geofabrik free GPKG layers usually expose a fclass column.
FCLASS_TO_ASSET_TYPE = {
    "hospital": "hospital",
    "clinic": "hospital",
    "doctors": "hospital",
    "school": "school",
    "college": "school",
    "university": "school",
    "kindergarten": "school",
    "ferry_terminal": "port",
    "harbour": "port",
    "marina": "port",
    "pier": "port",
    "substation": "power_substation",
    "police": "critical_facility",
    "fire_station": "critical_facility",
    "ambulance_station": "critical_facility",
}

# Some layers may carry OSM-style columns instead of just fclass.
TAG_COLUMNS = [
    "fclass",
    "amenity",
    "healthcare",
    "power",
    "harbour",
    "man_made",
    "emergency",
]

GE0FABRIK_BASE = "https://download.geofabrik.de/australia-oceania"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def repo_root() -> Path:
    here = Path.cwd()
    for candidate in [here, *here.parents]:
        if (candidate / "data").exists() or (candidate / "backend").exists():
            return candidate
    return here


def sanitize_token(value: Any) -> str:
    token = re.sub(r"[^a-z0-9_-]+", "_", str(value or "unknown").lower()).strip("_")
    return token or "unknown"


def normalized_asset_types(asset_types: list[str]) -> list[str]:
    return sorted({sanitize_token(x) for x in (asset_types or DEFAULT_ASSET_TYPES)})


def asset_cache_path(cache_dir: Path, admin_level: str, admin_id: str, asset_types: list[str]) -> Path:
    suffix = "_".join(normalized_asset_types(asset_types))
    return cache_dir / f"{sanitize_token(admin_level)}_{sanitize_token(admin_id)}_{suffix}.json"


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))


def cache_valid(path: Path) -> bool:
    payload = read_json(path)
    return bool(
        payload
        and payload.get("schema_version") == CACHE_SCHEMA_VERSION
        and isinstance(payload.get("features"), list)
    )


def geofabrik_gpkg_url(slug: str) -> str:
    return f"{GE0FABRIK_BASE}/{slug}-latest-free.gpkg.zip"


def download_file(url: str, out_path: Path, force: bool = False) -> Path:
    if out_path.exists() and out_path.stat().st_size > 0 and not force:
        return out_path

    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(out_path.suffix + ".part")

    print(f"    download: {url}")
    with requests.get(url, stream=True, timeout=120) as response:
        if response.status_code >= 400:
            raise RuntimeError(f"HTTP {response.status_code} for {url}")

        with tmp_path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)

    tmp_path.replace(out_path)
    return out_path


def extract_gpkg(zip_path: Path, extract_dir: Path) -> Path:
    extract_dir.mkdir(parents=True, exist_ok=True)

    existing = list(extract_dir.glob("*.gpkg"))
    if existing:
        return existing[0]

    with zipfile.ZipFile(zip_path) as zf:
        gpkg_members = [name for name in zf.namelist() if name.lower().endswith(".gpkg")]
        if not gpkg_members:
            raise RuntimeError(f"No .gpkg found in {zip_path}")

        member = gpkg_members[0]
        zf.extract(member, extract_dir)
        extracted = extract_dir / member

        if extracted.parent != extract_dir:
            final_path = extract_dir / Path(member).name
            shutil.move(str(extracted), str(final_path))
            extracted = final_path

        return extracted


def list_layers(gpkg_path: Path) -> list[str]:
    try:
        return list(gpd.list_layers(gpkg_path)["name"])
    except Exception:
        try:
            import fiona
            return list(fiona.listlayers(gpkg_path))
        except Exception as exc:
            raise RuntimeError(f"Could not list layers for {gpkg_path}: {exc}") from exc


def infer_asset_type_from_row(row: Any) -> str | None:
    values = []

    for column in TAG_COLUMNS:
        if column in row and row[column] is not None and not (isinstance(row[column], float) and math.isnan(row[column])):
            values.append(str(row[column]).lower())

    # Direct fclass match.
    for value in values:
        if value in FCLASS_TO_ASSET_TYPE:
            return FCLASS_TO_ASSET_TYPE[value]

    # OSM-ish fallback checks.
    amenity = str(row.get("amenity", "")).lower() if "amenity" in row else ""
    healthcare = str(row.get("healthcare", "")).lower() if "healthcare" in row else ""
    power = str(row.get("power", "")).lower() if "power" in row else ""
    harbour = str(row.get("harbour", "")).lower() if "harbour" in row else ""
    man_made = str(row.get("man_made", "")).lower() if "man_made" in row else ""
    emergency = str(row.get("emergency", "")).lower() if "emergency" in row else ""

    if amenity in {"hospital", "clinic"} or healthcare in {"hospital", "clinic"}:
        return "hospital"
    if amenity in {"school", "college", "university", "kindergarten"}:
        return "school"
    if amenity == "ferry_terminal" or harbour == "yes" or man_made == "pier":
        return "port"
    if power == "substation":
        return "power_substation"
    if amenity in {"fire_station", "police"} or emergency == "ambulance_station":
        return "critical_facility"

    return None


def load_assets_from_gpkg(gpkg_path: Path, country_iso3: str, country_name: str) -> gpd.GeoDataFrame:
    frames: list[gpd.GeoDataFrame] = []

    for layer in list_layers(gpkg_path):
        lower_layer = layer.lower()

        # Read only likely OSM feature layers; still broad enough for polygons/points.
        if not any(word in lower_layer for word in ["poi", "point", "building", "traffic", "transport", "places"]):
            continue

        try:
            gdf = gpd.read_file(gpkg_path, layer=layer)
        except Exception as exc:
            print(f"      layer {layer}: skipped ({exc})")
            continue

        if gdf.empty or "geometry" not in gdf:
            continue

        candidate_columns = [column for column in TAG_COLUMNS if column in gdf.columns]
        if not candidate_columns:
            continue

        asset_types = []
        keep_mask = []

        for _, row in gdf.iterrows():
            asset_type = infer_asset_type_from_row(row)
            asset_types.append(asset_type)
            keep_mask.append(asset_type is not None)

        if not any(keep_mask):
            continue

        selected = gdf.loc[keep_mask].copy()
        selected["asset_type"] = [asset_type for asset_type in asset_types if asset_type is not None]
        selected["source_layer"] = layer
        frames.append(selected)

    if not frames:
        return gpd.GeoDataFrame(columns=["geometry", "asset_type"], geometry="geometry", crs="EPSG:4326")

    assets = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), geometry="geometry")
    if assets.crs is None:
        assets = assets.set_crs("EPSG:4326")
    else:
        assets = assets.to_crs("EPSG:4326")

    # Convert polygons/lines to representative points for the app's current asset format.
    assets["geometry"] = assets.geometry.representative_point()
    assets["country_iso3"] = country_iso3
    assets["country_id"] = country_iso3.lower()
    assets["country_name"] = country_name

    return assets


def load_boundary(reference_dir: Path, iso3: str, level: str) -> gpd.GeoDataFrame | None:
    path = reference_dir / iso3.lower() / f"{level.lower()}.geojson"
    if not path.exists():
        return None

    gdf = gpd.read_file(path)

    if gdf.empty:
        return None

    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    if "admin_id" not in gdf.columns:
        gdf["admin_id"] = [
            sanitize_token(f"{iso3}_{level}_{idx}_{row.get('shapeName', row.get('name', 'admin'))}")
            for idx, row in gdf.iterrows()
        ]

    if "admin_name" not in gdf.columns:
        if "shapeName" in gdf.columns:
            gdf["admin_name"] = gdf["shapeName"].astype(str)
        elif "name" in gdf.columns:
            gdf["admin_name"] = gdf["name"].astype(str)
        else:
            gdf["admin_name"] = gdf["admin_id"].astype(str)

    if "admin_level" not in gdf.columns:
        gdf["admin_level"] = level.lower()

    return gdf


def clip_assets_to_boundary(assets: gpd.GeoDataFrame, boundary: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if assets.empty or boundary is None or boundary.empty:
        return assets.iloc[0:0].copy()

    # unary_union handles multi-island boundaries and antimeridian-normalized files already downloaded.
    geom = boundary.unary_union
    mask = assets.geometry.within(geom) | assets.geometry.touches(geom)
    return assets.loc[mask].copy()


def asset_feature_from_row(row: Any, iso3: str, country_name: str, admin_extra: dict[str, Any] | None = None) -> dict[str, Any]:
    geom = row.geometry
    lon = float(geom.x)
    lat = float(geom.y)

    osm_id = row.get("osm_id", row.get("id", ""))
    asset_type = str(row.get("asset_type", "critical_facility"))
    name = row.get("name", None)
    if name is None or str(name).strip() == "" or str(name).lower() == "nan":
        name = f"{asset_type} {osm_id}".strip()

    base_id = f"{iso3.lower()}-{row.get('source_layer', 'gpkg')}-{osm_id}-{asset_type}-{round(lon, 7)}-{round(lat, 7)}"
    props = {
        "layer_name": ASSET_LAYER_NAME,
        "feature_role": "raw_asset",
        "country_id": iso3.lower(),
        "country_iso3": iso3,
        "country_name": country_name,
        "asset_id": sanitize_token(base_id),
        "asset_name": str(name),
        "asset_type": asset_type,
        "osm_id": str(osm_id),
        "source": "geofabrik_gpkg",
        "source_layer": str(row.get("source_layer", "")),
        "description": "Infrastructure asset extracted from Geofabrik OpenStreetMap GeoPackage.",
    }

    if admin_extra:
        props.update(admin_extra)

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }


def dedupe_features(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    out = []

    for feature in features:
        key = feature.get("properties", {}).get("asset_id")
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(feature)

    return out


def write_asset_cache(
    cache_path: Path,
    metadata: dict[str, Any],
    features: list[dict[str, Any]],
) -> None:
    payload = {
        "schema_version": CACHE_SCHEMA_VERSION,
        "created_at": utc_now(),
        "metadata": {**metadata, "asset_count": len(features)},
        "features": dedupe_features(features),
    }
    write_json(cache_path, payload)


def assign_assets_to_admin(
    assets: gpd.GeoDataFrame,
    admin_gdf: gpd.GeoDataFrame,
    iso3: str,
    country_name: str,
    cache_dir: Path,
    asset_types: list[str],
    force_cache: bool,
) -> dict[str, Any]:
    summary = {
        "admin_count": int(len(admin_gdf)),
        "written_count": 0,
        "skipped_count": 0,
        "zero_asset_count": 0,
        "total_asset_assignments": 0,
    }

    if admin_gdf is None or admin_gdf.empty:
        return summary

    for _, admin in admin_gdf.iterrows():
        admin_id = str(admin.get("admin_id"))
        admin_name = str(admin.get("admin_name", admin_id))
        admin_level = str(admin.get("admin_level", "admin")).lower()

        cache_path = asset_cache_path(cache_dir, admin_level, admin_id, asset_types)

        if cache_valid(cache_path) and not force_cache:
            payload = read_json(cache_path) or {}
            count = len(payload.get("features", []))
            summary["skipped_count"] += 1
            summary["total_asset_assignments"] += count
            if count == 0:
                summary["zero_asset_count"] += 1
            continue

        mask = assets.geometry.within(admin.geometry) | assets.geometry.touches(admin.geometry)
        matched = assets.loc[mask].copy()

        features = [
            asset_feature_from_row(
                row,
                iso3,
                country_name,
                {
                    "source_admin_id": admin_id,
                    "source_admin_name": admin_name,
                    "source_admin_level": admin_level,
                },
            )
            for _, row in matched.iterrows()
        ]
        features = dedupe_features(features)

        write_asset_cache(
            cache_path,
            {
                "country_id": iso3.lower(),
                "country_iso3": iso3,
                "country_name": country_name,
                "admin_level": admin_level,
                "admin_id": admin_id,
                "admin_name": admin_name,
                "asset_types": normalized_asset_types(asset_types),
                "source": "geofabrik_gpkg_admin_cache",
            },
            features,
        )

        summary["written_count"] += 1
        summary["total_asset_assignments"] += len(features)
        if len(features) == 0:
            summary["zero_asset_count"] += 1

    return summary


def process_country(
    iso3: str,
    info: dict[str, str],
    args: argparse.Namespace,
    paths: dict[str, Path],
) -> dict[str, Any]:
    country_name = info["name"]
    slug = info["slug"]
    iso_lower = iso3.lower()

    result = {
        "country_iso3": iso3,
        "country_name": country_name,
        "slug": slug,
        "status": "started",
        "errors": [],
    }

    adm0 = load_boundary(paths["reference_dir"], iso3, "adm0")
    if adm0 is None or adm0.empty:
        result["status"] = "failed_missing_adm0"
        result["errors"].append(f"Missing data/reference/pict/{iso_lower}/adm0.geojson")
        return result

    gpkg_zip = paths["osm_dir"] / f"{slug}-latest-free.gpkg.zip"
    gpkg_dir = paths["osm_dir"] / slug

    try:
        if not args.skip_download:
            download_file(geofabrik_gpkg_url(slug), gpkg_zip, force=args.force_download)
        gpkg_path = extract_gpkg(gpkg_zip, gpkg_dir)
        result["gpkg_path"] = str(gpkg_path)
    except Exception as exc:
        result["status"] = "failed_download_or_extract"
        result["errors"].append(str(exc))
        return result

    try:
        all_assets = load_assets_from_gpkg(gpkg_path, iso3, country_name)
        country_assets = clip_assets_to_boundary(all_assets, adm0)
        result["raw_asset_count"] = int(len(all_assets))
        result["country_asset_count"] = int(len(country_assets))
    except Exception as exc:
        result["status"] = "failed_extract_assets"
        result["errors"].append(str(exc))
        return result

    country_admin_id = f"{iso_lower}_adm0_country"
    country_cache = asset_cache_path(paths["cache_dir"], "adm0", country_admin_id, args.asset_types)

    if not cache_valid(country_cache) or args.force_cache:
        country_features = [
            asset_feature_from_row(row, iso3, country_name)
            for _, row in country_assets.iterrows()
        ]
        write_asset_cache(
            country_cache,
            {
                "country_id": iso_lower,
                "country_iso3": iso3,
                "country_name": country_name,
                "admin_level": "adm0",
                "admin_id": country_admin_id,
                "admin_name": country_name,
                "asset_types": normalized_asset_types(args.asset_types),
                "source": "geofabrik_gpkg_country_cache",
                "geofabrik_slug": slug,
            },
            country_features,
        )
        result["country_cache_status"] = "written"
    else:
        result["country_cache_status"] = "skipped_existing"

    result["country_cache_path"] = str(country_cache)

    admin_summaries = {}

    for level in args.admin_levels:
        level_lower = level.lower()
        if level_lower == "adm0":
            continue

        admin_gdf = load_boundary(paths["reference_dir"], iso3, level_lower)
        if admin_gdf is None or admin_gdf.empty:
            admin_summaries[level_lower] = {"status": "missing"}
            continue

        admin_summaries[level_lower] = assign_assets_to_admin(
            country_assets,
            admin_gdf,
            iso3,
            country_name,
            paths["cache_dir"],
            args.asset_types,
            args.force_cache,
        )
        admin_summaries[level_lower]["status"] = "ready"

    result["admin_summaries"] = admin_summaries
    result["status"] = "ready"
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--countries", default="ALL", help="CSV ISO3 list or ALL.")
    parser.add_argument("--reference-dir", default=None)
    parser.add_argument("--cache-dir", default=None)
    parser.add_argument("--osm-dir", default=None)
    parser.add_argument("--admin-levels", default="adm1,adm2")
    parser.add_argument("--asset-types", default=",".join(DEFAULT_ASSET_TYPES))
    parser.add_argument("--force-download", action="store_true")
    parser.add_argument("--force-cache", action="store_true")
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument("--sleep-seconds", type=float, default=0.5)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = repo_root()

    args.asset_types = normalized_asset_types(
        [part.strip() for part in args.asset_types.split(",") if part.strip()]
    )
    args.admin_levels = [
        part.strip().lower()
        for part in args.admin_levels.split(",")
        if part.strip()
    ]

    paths = {
        "reference_dir": Path(args.reference_dir) if args.reference_dir else root / "data" / "reference" / "pict",
        "cache_dir": Path(args.cache_dir) if args.cache_dir else root / "backend" / "cache" / "admin_assets",
        "osm_dir": Path(args.osm_dir) if args.osm_dir else root / "data" / "osm" / "geofabrik",
    }

    if args.countries.strip().upper() == "ALL":
        selected = list(PICT_COUNTRIES.keys())
    else:
        selected = [part.strip().upper() for part in args.countries.split(",") if part.strip()]

    print("Build PICT assets from Geofabrik GPKG")
    print({
        "countries": selected,
        "reference_dir": str(paths["reference_dir"]),
        "cache_dir": str(paths["cache_dir"]),
        "osm_dir": str(paths["osm_dir"]),
        "asset_types": args.asset_types,
        "admin_levels": args.admin_levels,
    })

    paths["cache_dir"].mkdir(parents=True, exist_ok=True)
    paths["osm_dir"].mkdir(parents=True, exist_ok=True)

    results = []

    for index, iso3 in enumerate(selected, start=1):
        info = PICT_COUNTRIES.get(iso3)
        if not info:
            results.append({"country_iso3": iso3, "status": "unknown_country"})
            continue

        print(f"\n[{index}/{len(selected)}] {info['name']} ({iso3})")
        result = process_country(iso3, info, args, paths)
        results.append(result)

        print({
            "status": result.get("status"),
            "country_asset_count": result.get("country_asset_count"),
            "country_cache_status": result.get("country_cache_status"),
            "errors": result.get("errors"),
        })

        if args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)

    manifest = {
        "created_at": utc_now(),
        "method": "geofabrik_gpkg_offline_assets",
        "paths": {key: str(value) for key, value in paths.items()},
        "results": results,
    }

    manifest_path = paths["reference_dir"].parent / "pict_geofabrik_asset_manifest.json"
    write_json(manifest_path, manifest)

    summary = {
        "country_count": len(results),
        "ready_count": sum(1 for item in results if item.get("status") == "ready"),
        "failed_count": sum(1 for item in results if item.get("status", "").startswith("failed")),
        "total_country_assets": sum(int(item.get("country_asset_count") or 0) for item in results),
    }

    print("\nDone.")
    print(summary)
    print(f"Manifest written to: {manifest_path}")


if __name__ == "__main__":
    main()
