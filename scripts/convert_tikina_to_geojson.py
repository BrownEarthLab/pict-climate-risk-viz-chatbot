import json
import re
import shutil
from pathlib import Path

import geopandas as gpd

IN_PATH = Path("data/reference/tikina/fiji_tikinaV2.shp")
OUT_REFERENCE = Path("data/reference/fiji_tikina.geojson")
OUT_FRONTEND = Path("frontend/public/fiji_tikina.geojson")


def slugify(value):
    value = str(value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_") or "unknown"


def find_name_column(gdf):
    candidates = [
        "tikina",
        "Tikina",
        "TIKINA",
        "name",
        "Name",
        "NAME",
        "admin_name",
        "shapeName",
    ]

    for candidate in candidates:
        if candidate in gdf.columns:
            return candidate

    non_geometry_columns = [c for c in gdf.columns if c != "geometry"]
    return non_geometry_columns[0] if non_geometry_columns else None


def main():
    if not IN_PATH.exists():
        raise FileNotFoundError(f"Missing shapefile: {IN_PATH}")

    gdf = gpd.read_file(IN_PATH)

    if gdf.crs is None:
        print("Warning: Tikina shapefile has no CRS. Assuming EPSG:4326.")
        gdf = gdf.set_crs("EPSG:4326")

    gdf = gdf.to_crs("EPSG:4326")

    name_column = find_name_column(gdf)

    if name_column is None:
        raise RuntimeError("Could not find any attribute column for Tikina names.")

    gdf["admin_level"] = "tikina"
    gdf["admin_name"] = gdf[name_column].astype(str)
    gdf["admin_id"] = gdf["admin_name"].apply(slugify)
    gdf["source"] = "Uploaded Fiji Tikina shapefile"

    OUT_REFERENCE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FRONTEND.parent.mkdir(parents=True, exist_ok=True)

    gdf.to_file(OUT_REFERENCE, driver="GeoJSON")
    shutil.copyfile(OUT_REFERENCE, OUT_FRONTEND)

    print("Tikina conversion complete.")
    print(f"Feature count: {len(gdf)}")
    print(f"Name column used: {name_column}")
    print("Columns:")
    print(list(gdf.columns))
    print("Bounds:")
    print(gdf.total_bounds)
    print("First 20 Tikina names:")
    for name in sorted(gdf["admin_name"].dropna().unique())[:20]:
        print(f"  - {name}")
    print(f"Reference: {OUT_REFERENCE}")
    print(f"Frontend:  {OUT_FRONTEND}")


if __name__ == "__main__":
    main()
