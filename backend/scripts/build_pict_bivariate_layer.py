#!/usr/bin/env python3
"""
Build the derived PICT country-level bivariate indicator layer.

Consumes (all already on disk, verified in docs/v2-direction-research.md §3a):
  - data/reference/pict_regions.geojson          (26 features, country + aggregate)
  - data/cache/sdmx/SPC%2CDF_CLIMATE_CHANGE...json (sea level anomaly, mm)
  - data/cache/sdmx/SPC%2CDF_SDG_06...json        (safe water access, %)
  - data/reference/_ne_10m_admin_0_map_units.geojson (POP_EST / POP_YEAR, 2019)

Emits data/reference/pict_bivariate.geojson — the country features of
pict_regions with the indicator values attached, joined on ISO3 (with a
name-based fallback for entries whose NE record carries ISO_A3 = -99).

Run from the repo root: python3 backend/scripts/build_pict_bivariate_layer.py
"""

import json
import pathlib
import statistics

ROOT = pathlib.Path(__file__).resolve().parents[2]

PICT_REGIONS = ROOT / "data/reference/pict_regions.geojson"
SEA_LEVEL_CACHE = ROOT / "data/cache/sdmx/SPC%2CDF_CLIMATE_CHANGE%2C1.0%7CA.SEA_LVL..json"
WATER_ACCESS_CACHE = ROOT / "data/cache/sdmx/SPC%2CDF_SDG_06%2C3.0%7CA.SH_H2O_SAFE...._T......json"
NE_MAP_UNITS = ROOT / "data/reference/_ne_10m_admin_0_map_units.geojson"
OUT = ROOT / "data/reference/pict_bivariate.geojson"

# GEO_PICT dimension codes (SDMX) -> ISO3 (iso3 in pict_regions.geojson)
GEO_PICT_TO_ISO3 = {
    "AS": "ASM", "CK": "COK", "FJ": "FJI", "FM": "FSM", "GU": "GUM",
    "KI": "KIR", "MH": "MHL", "MP": "MNP", "NC": "NCL", "NR": "NRU",
    "NU": "NIU", "PF": "PYF", "PG": "PNG", "PW": "PLW", "SB": "SLB",
    "TK": "TKL", "TO": "TON", "TV": "TUV", "VU": "VUT", "WF": "WLF",
    "WS": "WSM",
}


def sdmx_series_latest(cache_path, geo_dim_pos, time_dim_pos):
    """Return {geo_code: {value, year}} taking the latest TIME_PERIOD.

    geo_dim_pos is the position of the GEO_PICT dimension and time_dim_pos the
    position of the TIME_PERIOD dimension in the observation key.
    """
    with open(cache_path, encoding="utf-8") as fh:
        doc = json.load(fh)
    data = doc["data"]
    obs = data["dataSets"][0]["observations"]
    dims = data["structure"]["dimensions"]["observation"]
    geo_values = [d["id"] for d in dims[geo_dim_pos]["values"]]
    time_values = [d["id"] for d in dims[time_dim_pos]["values"]]
    latest = {}
    for key, row in obs.items():
        parts = key.split(":")
        geo = geo_values[int(parts[geo_dim_pos])]
        time_idx = int(parts[time_dim_pos])
        val = row[0]
        if val is None:
            continue
        prev = latest.get(geo)
        if prev is None or time_idx > prev["time_idx"]:
            latest[geo] = {"value": val, "time_idx": time_idx, "year": time_values[time_idx]}
    return latest


def load_ne_population():
    with open(NE_MAP_UNITS, encoding="utf-8") as fh:
        doc = json.load(fh)
    by_iso3 = {}
    by_name = {}  # name -> {pop_est, pop_year} preferring the latest POP_YEAR
    for feat in doc["features"]:
        p = feat["properties"]
        iso3 = p.get("ISO_A3")
        name = p.get("ADMIN")
        record = {"pop_est": p.get("POP_EST"), "pop_year": p.get("POP_YEAR")}
        if iso3 and iso3 != "-99":
            by_iso3[iso3] = record
        if name:
            prev = by_name.get(name)
            if prev is None or (record.get("pop_year") or 0) > (prev.get("pop_year") or 0):
                by_name[name] = record
    return by_iso3, by_name


def main():
    with open(PICT_REGIONS, encoding="utf-8") as fh:
        pict = json.load(fh)

    sea_level = sdmx_series_latest(SEA_LEVEL_CACHE, geo_dim_pos=2, time_dim_pos=3)
    water_access = sdmx_series_latest(WATER_ACCESS_CACHE, geo_dim_pos=2, time_dim_pos=-1)

    ne_iso3, ne_name = load_ne_population()

    # Regional median of safe-water access across countries with data.
    water_median = statistics.median(
        entry["value"] for entry in water_access.values()
    )
    # Regional median of latest-year sea level anomalies.
    sea_level_median = statistics.median(
        entry["value"] for entry in sea_level.values()
    )

    features_out = []
    for feat in pict["features"]:
        props = feat["properties"]
        iso3 = props.get("iso3")
        # Only country-level features participate in the PICT-country pairs.
        if not iso3 or props.get("admin_level") != "country_or_territory":
            continue

        sl = sea_level.get(next((k for k, v in GEO_PICT_TO_ISO3.items() if v == iso3), ""))
        wa = water_access.get(next((k for k, v in GEO_PICT_TO_ISO3.items() if v == iso3), ""))
        sl_value = sl["value"] if sl else None
        wa_value = wa["value"] if wa else None
        wa_year = wa["year"] if wa else None

        pop = ne_iso3.get(iso3)
        if pop is None:
            pop = ne_name.get(props.get("name"))

        out_props = {
            "id": f"iso3-{iso3}",
            "name": props.get("name"),
            "iso3": iso3,
            "subregion": props.get("subregion"),
            "sea_level_anomaly_m": sl_value,
            "sea_level_deviation_m": (
                round(sl_value - sea_level_median, 3) if sl_value is not None else None
            ),
            "water_access_pct": wa_value,
            "water_access_year": wa_year,
            "water_access_deviation_pp": (
                round(wa_value - water_median, 2) if wa_value is not None else None
            ),
            "pop_est": pop["pop_est"] if pop else None,
            "pop_year": pop["pop_year"] if pop else None,
            "source": "PICT bivariate layer: SPC Pacific Data Hub SDMX (sea level anomaly, safe water access) + Natural Earth 10m admin-0 POP_EST 2019",
        }
        features_out.append(
            {
                "type": "Feature",
                "geometry": feat["geometry"],
                "properties": out_props,
            }
        )

    features_out.sort(key=lambda f: f["properties"]["name"] or "")

    out = {
        "type": "FeatureCollection",
        "features": features_out,
        "properties": {
            "water_access_regional_median_pct": round(water_median, 2),
            "generated_by": "backend/scripts/build_pict_bivariate_layer.py",
        },
    }

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh)

    print(f"Wrote {len(features_out)} country features to {OUT}")
    print(f"  regional water-access median: {round(water_median, 2)}%")


if __name__ == "__main__":
    main()
