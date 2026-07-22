import json
import re
import shutil
import urllib.request
from pathlib import Path

LEVELS = ["ADM1", "ADM2"]
BASE_API = "https://www.geoboundaries.org/api/current/gbOpen/FJI"

OUT_REFERENCE = Path("data/reference")
OUT_FRONTEND = Path("frontend/public")


def slugify(value):
    value = str(value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_") or "unknown"


def fetch_json(url):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "pict-climate-risk-prototype/0.1"},
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def normalize_feature_properties(feature, level, index):
    properties = feature.setdefault("properties", {})

    raw_name = (
        properties.get("shapeName")
        or properties.get("NAME_2")
        or properties.get("NAME_1")
        or properties.get("name")
        or properties.get("Name")
        or f"{level} {index + 1}"
    )

    raw_id = (
        properties.get("shapeID")
        or properties.get("shapeISO")
        or properties.get("ID_2")
        or properties.get("ID_1")
        or slugify(raw_name)
    )

    properties["admin_level"] = level.lower()
    properties["admin_id"] = slugify(raw_id)
    properties["admin_name"] = str(raw_name)
    properties["source"] = f"geoBoundaries gbOpen FJI {level}"
    properties["source_api"] = f"{BASE_API}/{level}/"


def download_level(level):
    api_url = f"{BASE_API}/{level}/"

    print(f"\nFetching {level} metadata:")
    print(api_url)

    metadata = fetch_json(api_url)

    geojson_url = (
        metadata.get("gjDownloadURL")
        or metadata.get("downloadURL")
        or metadata.get("staticDownloadLink")
    )

    if not geojson_url:
        raise RuntimeError(f"Could not find GeoJSON URL for {level}.")

    print(f"Downloading {level} GeoJSON:")
    print(geojson_url)

    geojson = fetch_json(geojson_url)
    features = geojson.get("features", [])

    if not features:
        raise RuntimeError(f"{level} GeoJSON has no features.")

    for index, feature in enumerate(features):
        normalize_feature_properties(feature, level, index)

    reference_path = OUT_REFERENCE / f"fiji_admin_{level.lower()}.geojson"
    frontend_path = OUT_FRONTEND / f"fiji_admin_{level.lower()}.geojson"

    reference_path.parent.mkdir(parents=True, exist_ok=True)
    frontend_path.parent.mkdir(parents=True, exist_ok=True)

    with reference_path.open("w", encoding="utf-8") as f:
        json.dump(geojson, f)

    shutil.copyfile(reference_path, frontend_path)

    names = sorted(
        {
            feature.get("properties", {}).get("admin_name", "Unknown")
            for feature in features
        }
    )

    print(f"\nSaved {len(features)} {level} features:")
    for name in names:
        print(f"  - {name}")

    print(f"Reference: {reference_path}")
    print(f"Frontend:  {frontend_path}")


def main():
    for level in LEVELS:
        download_level(level)


if __name__ == "__main__":
    main()
