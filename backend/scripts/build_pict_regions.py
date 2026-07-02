from __future__ import annotations

from pathlib import Path
from urllib.request import urlretrieve
import re

import geopandas as gpd
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[1]

SOURCE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_10m_admin_0_map_units.geojson"
)

OUT_PATH = REPO_ROOT / "data" / "reference" / "pict_regions.geojson"
TMP_PATH = REPO_ROOT / "data" / "reference" / "_ne_10m_admin_0_map_units.geojson"


PICTS = {
    "American Samoa": {
        "iso3": "ASM",
        "subregion": "Polynesia",
        "aliases": ["American Samoa", "Amer. Samoa"],
    },
    "Cook Islands": {
        "iso3": "COK",
        "subregion": "Polynesia",
        "aliases": ["Cook Islands", "Cook Is."],
    },
    "Federated States of Micronesia": {
        "iso3": "FSM",
        "subregion": "Micronesia",
        "aliases": [
            "Federated States of Micronesia",
            "Micronesia",
            "F.S. Micronesia",
        ],
    },
    "Fiji": {
        "iso3": "FJI",
        "subregion": "Melanesia",
        "aliases": ["Fiji"],
    },
    "French Polynesia": {
        "iso3": "PYF",
        "subregion": "Polynesia",
        "aliases": ["French Polynesia", "Fr. Polynesia"],
    },
    "Guam": {
        "iso3": "GUM",
        "subregion": "Micronesia",
        "aliases": ["Guam"],
    },
    "Kiribati": {
        "iso3": "KIR",
        "subregion": "Micronesia",
        "aliases": ["Kiribati"],
    },
    "Marshall Islands": {
        "iso3": "MHL",
        "subregion": "Micronesia",
        "aliases": ["Marshall Islands", "Marshall Is."],
    },
    "Nauru": {
        "iso3": "NRU",
        "subregion": "Micronesia",
        "aliases": ["Nauru"],
    },
    "New Caledonia": {
        "iso3": "NCL",
        "subregion": "Melanesia",
        "aliases": ["New Caledonia"],
    },
    "Niue": {
        "iso3": "NIU",
        "subregion": "Polynesia",
        "aliases": ["Niue"],
    },
    "Northern Mariana Islands": {
        "iso3": "MNP",
        "subregion": "Micronesia",
        "aliases": [
            "Northern Mariana Islands",
            "Northern Marianas",
            "N. Mariana Is.",
        ],
    },
    "Palau": {
        "iso3": "PLW",
        "subregion": "Micronesia",
        "aliases": ["Palau"],
    },
    "Papua New Guinea": {
        "iso3": "PNG",
        "subregion": "Melanesia",
        "aliases": ["Papua New Guinea", "PNG"],
    },
    "Pitcairn Islands": {
        "iso3": "PCN",
        "subregion": "Polynesia",
        "aliases": ["Pitcairn Islands", "Pitcairn Is.", "Pitcairn"],
    },
    "Samoa": {
        "iso3": "WSM",
        "subregion": "Polynesia",
        "aliases": ["Samoa"],
    },
    "Solomon Islands": {
        "iso3": "SLB",
        "subregion": "Melanesia",
        "aliases": ["Solomon Islands", "Solomon Is."],
    },
    "Tokelau": {
        "iso3": "TKL",
        "subregion": "Polynesia",
        "aliases": ["Tokelau"],
    },
    "Tonga": {
        "iso3": "TON",
        "subregion": "Polynesia",
        "aliases": ["Tonga"],
    },
    "Tuvalu": {
        "iso3": "TUV",
        "subregion": "Polynesia",
        "aliases": ["Tuvalu"],
    },
    "Vanuatu": {
        "iso3": "VUT",
        "subregion": "Melanesia",
        "aliases": ["Vanuatu"],
    },
    "Wallis and Futuna": {
        "iso3": "WLF",
        "subregion": "Polynesia",
        "aliases": [
            "Wallis and Futuna",
            "Wallis & Futuna",
            "Wallis and Futuna Is.",
        ],
    },
}


NAME_COLUMNS = [
    "NAME",
    "NAME_LONG",
    "ADMIN",
    "GEOUNIT",
    "SOVEREIGNT",
    "BRK_NAME",
    "FORMAL_EN",
]


def normalize_name(value: object) -> str:
    text = str(value).lower().strip()
    text = text.replace("&", "and")
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def find_pict_rows(ne: gpd.GeoDataFrame, canonical_name: str, info: dict) -> gpd.GeoDataFrame:
    available_name_columns = [col for col in NAME_COLUMNS if col in ne.columns]

    if not available_name_columns:
        raise ValueError(
            f"None of the expected Natural Earth name columns exist: {NAME_COLUMNS}"
        )

    accepted_names = {canonical_name, *info["aliases"]}
    accepted_normalized = {normalize_name(name) for name in accepted_names}

    mask = pd.Series(False, index=ne.index)

    for col in available_name_columns:
        mask = mask | ne[col].map(normalize_name).isin(accepted_normalized)

    matched = ne[mask].copy()

    if matched.empty:
        return matched

    matched["name"] = canonical_name
    matched["admin_level"] = "country_or_territory"
    matched["country"] = canonical_name
    matched["iso3"] = info["iso3"]
    matched["subregion"] = info["subregion"]
    matched["region_group"] = "PICT"
    matched["source"] = "Natural Earth"
    matched["source_dataset"] = "ne_10m_admin_0_map_units"
    matched["source_url"] = SOURCE_URL

    if "NAME" in matched.columns:
        matched["source_name"] = matched["NAME"]
    else:
        matched["source_name"] = canonical_name

    if "SOVEREIGNT" in matched.columns:
        matched["sovereignty"] = matched["SOVEREIGNT"]
    else:
        matched["sovereignty"] = None

    return matched


def add_group_regions(picts: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    group_rows = []

    for subregion in ["Melanesia", "Micronesia", "Polynesia"]:
        subset = picts[picts["subregion"] == subregion]

        if subset.empty:
            continue

        dissolved = subset.dissolve()
        dissolved["name"] = subregion
        dissolved["admin_level"] = "subregion"
        dissolved["country"] = None
        dissolved["iso3"] = None
        dissolved["subregion"] = subregion
        dissolved["region_group"] = "PICT"
        dissolved["source"] = "Natural Earth"
        dissolved["source_dataset"] = "ne_10m_admin_0_map_units"
        dissolved["source_url"] = SOURCE_URL
        dissolved["source_name"] = subregion
        dissolved["sovereignty"] = None

        group_rows.append(dissolved)

    all_picts = picts.dissolve()
    all_picts["name"] = "Pacific Island Countries and Territories"
    all_picts["admin_level"] = "region_group"
    all_picts["country"] = None
    all_picts["iso3"] = None
    all_picts["subregion"] = None
    all_picts["region_group"] = "PICT"
    all_picts["source"] = "Natural Earth"
    all_picts["source_dataset"] = "ne_10m_admin_0_map_units"
    all_picts["source_url"] = SOURCE_URL
    all_picts["source_name"] = "Pacific Island Countries and Territories"
    all_picts["sovereignty"] = None

    group_rows.append(all_picts)

    if not group_rows:
        return picts

    groups = pd.concat(group_rows, ignore_index=True)
    groups = gpd.GeoDataFrame(groups, geometry="geometry", crs=picts.crs)

    return pd.concat([picts, groups], ignore_index=True)


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    print("Downloading Natural Earth Admin 0 Map Units...")
    urlretrieve(SOURCE_URL, TMP_PATH)

    print("Reading Natural Earth GeoJSON...")
    ne = gpd.read_file(TMP_PATH)

    if ne.crs is None:
        ne = ne.set_crs("EPSG:4326")
    else:
        ne = ne.to_crs("EPSG:4326")

    matched_layers = []
    missing = []

    for canonical_name, info in PICTS.items():
        rows = find_pict_rows(ne, canonical_name, info)

        if rows.empty:
            missing.append(canonical_name)
            continue

        matched_layers.append(rows)

    if missing:
        raise ValueError(
            "Could not find these PICTs in Natural Earth. "
            "Check aliases or source names:\n"
            + "\n".join(f"- {name}" for name in missing)
        )

    picts = pd.concat(matched_layers, ignore_index=True)
    picts = gpd.GeoDataFrame(picts, geometry="geometry", crs="EPSG:4326")

    keep_columns = [
        "name",
        "admin_level",
        "country",
        "iso3",
        "subregion",
        "region_group",
        "source",
        "source_dataset",
        "source_url",
        "source_name",
        "sovereignty",
        "geometry",
    ]

    picts = picts[keep_columns]

    # Dissolve duplicate/multipart matches into one feature per PICT.
    picts = picts.dissolve(
        by="name",
        as_index=False,
        aggfunc="first",
    )

    picts = add_group_regions(picts)
    picts = gpd.GeoDataFrame(picts, geometry="geometry", crs="EPSG:4326")

    picts = picts[
        [
            "name",
            "admin_level",
            "country",
            "iso3",
            "subregion",
            "region_group",
            "source",
            "source_dataset",
            "source_url",
            "source_name",
            "sovereignty",
            "geometry",
        ]
    ]

    picts.to_file(OUT_PATH, driver="GeoJSON")

    print(f"Saved: {OUT_PATH}")
    print(f"Feature count: {len(picts)}")
    print()
    print("Features:")
    for name in sorted(picts["name"].tolist()):
        print(f"- {name}")


if __name__ == "__main__":
    main()