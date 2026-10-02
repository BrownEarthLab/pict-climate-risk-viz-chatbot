#!/usr/bin/env python3
"""
Build 5-year and decade NEX-GDDP-CMIP6 TX90p bivariate layers for Fiji.

This version keeps the same simplified 3 x 3 bivariate classification used by
build_nex_tx90p_bivariate_fiji.py.

Input yearly ensemble cache:
  backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble/yearly/ssp585_2030.geojson

Outputs:
  backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble/5_year/ssp585_2030.geojson
  backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble/decade/ssp585_2030.geojson

Window convention:
  time_window=5_year&year=2030 -> 2030-2034
  time_window=decade&year=2050 -> 2050-2059

Formulas:
  model_window_TX90p = mean yearly TX90p for one model inside the window
  risk value = mean(model_window_TX90p across models)
  inter-model spread = max(model_window_TX90p) - min(model_window_TX90p)
  reliability_score = 1 - min(1, inter_model_spread / global_window_spread_p95)
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any

import numpy as np

DEFAULT_YEARLY_DIR = Path("backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble/yearly")
DEFAULT_OUT_ROOT = Path("backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble")
DEFAULT_CATALOG_PATH = Path("backend/cache/climate_indices/tasmax/fji/tx90p_nex_time_windows_catalog.json")

BIVARIATE_COLOR_MATRIX_3X3: dict[str, dict[str, str]] = {
    "low": {"low": "#3b2c66", "medium": "#6d55b3", "high": "#a78bfa"},
    "medium": {"low": "#6b3f35", "medium": "#a66a43", "high": "#f1b866"},
    "high": {"low": "#8a2d13", "medium": "#c2410c", "high": "#ff7a00"},
}

RISK_CLASS_BINS = {
    "low": "TX90p < 33%",
    "medium": "33% <= TX90p < 66%",
    "high": "TX90p >= 66%",
}

RELIABILITY_CLASS_BINS = {
    "low": "reliability_score < 0.33",
    "medium": "0.33 <= reliability_score < 0.66",
    "high": "reliability_score >= 0.66",
}

RISK_FORMULA = "ensemble_mean_TX90p = mean of model-specific window-mean TX90p values"
UNCERTAINTY_FORMULA = "inter_model_spread = max(model_window_TX90p) - min(model_window_TX90p), in percentage points"
RELIABILITY_FORMULA = "reliability_score = 1 - min(1, inter_model_spread / global_window_spread_p95)"
TX90P_FORMULA = "TX90p_m = percent of days with tasmax_m > model/grid-cell 1981-2010 local 90th-percentile tasmax baseline"


def safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except Exception:
        return None
    if not np.isfinite(number):
        return None
    return number


def risk_class_from_value(value: float) -> str:
    if value < 33.0:
        return "low"
    if value < 66.0:
        return "medium"
    return "high"


def reliability_class_from_score(score: float) -> str:
    if score < 0.33:
        return "low"
    if score < 0.66:
        return "medium"
    return "high"


def bivariate_color(risk_class: str, reliability_class: str) -> str:
    return BIVARIATE_COLOR_MATRIX_3X3.get(risk_class, BIVARIATE_COLOR_MATRIX_3X3["medium"]).get(
        reliability_class, BIVARIATE_COLOR_MATRIX_3X3["medium"]["medium"]
    )


def read_geojson(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_geojson(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def available_years(yearly_dir: Path, scenario: str) -> list[int]:
    years = []
    for path in yearly_dir.glob(f"{scenario}_*.geojson"):
        try:
            years.append(int(path.stem.split("_")[-1]))
        except Exception:
            continue
    return sorted(set(years))


def build_windows(*, available: list[int], window_kind: str, start_year: int, end_year: int) -> list[tuple[int, int, list[int]]]:
    available_set = set(available)
    if window_kind == "5_year":
        starts = list(range(start_year, end_year + 1, 5))
        width = 5
    elif window_kind == "decade":
        first_decade_start = ((start_year + 9) // 10) * 10
        starts = list(range(first_decade_start, end_year + 1, 10))
        width = 10
    else:
        raise ValueError(f"Unsupported window kind: {window_kind}")
    windows = []
    for start in starts:
        end = min(start + width - 1, end_year)
        years = [year for year in range(start, end + 1) if year in available_set]
        if years:
            windows.append((start, end, years))
    return windows


def collect_feature_payloads(*, yearly_dir: Path, scenario: str, years: list[int]) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    by_h3: dict[str, list[dict[str, Any]]] = defaultdict(list)
    first_metadata: dict[str, Any] = {}
    for year in years:
        path = yearly_dir / f"{scenario}_{year}.geojson"
        if not path.exists():
            print(f"  WARNING: missing yearly input {path}")
            continue
        payload = read_geojson(path)
        if not first_metadata:
            first_metadata = dict(payload.get("metadata") or {})
        for feature in payload.get("features") or []:
            props = feature.get("properties") or {}
            h3_id = props.get("h3_id") or props.get("h3_index")
            if h3_id:
                by_h3[str(h3_id)].append(feature)
    return by_h3, first_metadata


def aggregate_model_values(features: list[dict[str, Any]]) -> dict[str, float]:
    values_by_model: dict[str, list[float]] = defaultdict(list)
    for feature in features:
        props = feature.get("properties") or {}
        model_values = props.get("model_values") or {}
        if isinstance(model_values, dict):
            for model, value in model_values.items():
                numeric = safe_float(value)
                if numeric is not None:
                    values_by_model[str(model)].append(numeric)
    return {model: float(np.nanmean(values)) for model, values in values_by_model.items() if values}


def aggregate_window_features(*, by_h3: dict[str, list[dict[str, Any]]], scenario: str, window_kind: str, start: int, end: int, years: list[int]) -> tuple[list[dict[str, Any]], list[float]]:
    intermediate: list[dict[str, Any]] = []
    spreads: list[float] = []
    for h3_id, features in sorted(by_h3.items()):
        model_values = aggregate_model_values(features)
        if len(model_values) < 2:
            continue
        model_array = np.array(list(model_values.values()), dtype="float32")
        value = float(np.nanmean(model_array))
        spread = float(np.nanmax(model_array) - np.nanmin(model_array))
        std = float(np.nanstd(model_array))
        spreads.append(spread)
        template = deepcopy(features[0])
        props = dict(template.get("properties") or {})
        template["properties"] = {
            **props,
            "country_id": "fji",
            "source_dataset": "NEX-GDDP-CMIP6",
            "variable": "tasmax",
            "metric": "tx90p",
            "time_window": window_kind,
            "year": start,
            "start_year": start,
            "end_year": end,
            "years_in_window": years,
            "year_label": f"{start}-{end}",
            "value": safe_float(value),
            "tx90p": safe_float(value),
            "ensemble_mean_tx90p": safe_float(value),
            "unit": "percent_days",
            "experiment": scenario,
            "scenario": scenario,
            "h3_id": h3_id,
            "model_count": len(model_values),
            "models": sorted(model_values.keys()),
            "model_values": {model: safe_float(v) for model, v in sorted(model_values.items())},
            "model_min_tx90p": safe_float(float(np.nanmin(model_array))),
            "model_max_tx90p": safe_float(float(np.nanmax(model_array))),
            "uncertainty_available": True,
            "uncertainty_spread": safe_float(spread),
            "inter_model_spread": safe_float(spread),
            "uncertainty_std": safe_float(std),
            "uncertainty_unit": "percentage_points",
            "uncertainty_method": "inter_model_max_minus_min_tx90p_after_window_mean",
            "risk_formula": RISK_FORMULA,
            "tx90p_formula": TX90P_FORMULA,
            "uncertainty_formula": UNCERTAINTY_FORMULA,
            "reliability_formula": RELIABILITY_FORMULA,
        }
        intermediate.append(template)
    return intermediate, spreads


def apply_bivariate_properties(*, features: list[dict[str, Any]], spread_p95: float) -> list[dict[str, Any]]:
    output = []
    for feature in features:
        props = dict(feature.get("properties") or {})
        value = float(props.get("value") or 0)
        spread = float(props.get("inter_model_spread") or props.get("uncertainty_spread") or 0)
        normalized_spread = 0.0 if spread_p95 <= 0 else min(1.0, max(0.0, spread / spread_p95))
        reliability_score = 1.0 - normalized_spread
        risk_class = risk_class_from_value(value)
        reliability_class = reliability_class_from_score(reliability_score)
        color = bivariate_color(risk_class, reliability_class)
        props.update(
            {
                "spread_p95": safe_float(spread_p95),
                "normalized_uncertainty": safe_float(normalized_spread),
                "normalized_inter_model_spread": safe_float(normalized_spread),
                "reliability_score": safe_float(reliability_score),
                "reliability_unit": "0_to_1",
                "reliability_method": "1_minus_normalized_inter_model_spread",
                "risk_class": risk_class,
                "reliability_class": reliability_class,
                "bivariate_class": f"{risk_class}_risk_{reliability_class}_reliability",
                "bivariate_color": color,
                "bivariate_matrix_size": "3x3",
                "risk_class_bins": RISK_CLASS_BINS,
                "reliability_class_bins": RELIABILITY_CLASS_BINS,
                "normalization_reference": "global_window_spread_p95 across generated time-window layers",
            }
        )
        feature["properties"] = props
        output.append(feature)
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yearly-dir", type=Path, default=DEFAULT_YEARLY_DIR)
    parser.add_argument("--out-root", type=Path, default=DEFAULT_OUT_ROOT)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG_PATH)
    parser.add_argument("--scenarios", nargs="+", default=["ssp585"])
    parser.add_argument("--windows", nargs="+", default=["5_year", "decade"])
    parser.add_argument("--start-year", type=int, default=2015)
    parser.add_argument("--end-year", type=int, default=2100)
    args = parser.parse_args()

    print("NEX TX90p 3x3 time-window aggregation")
    print("-------------------------------------")
    print(f"Yearly dir: {args.yearly_dir}")
    print(f"Output root: {args.out_root}")
    print(f"Scenarios: {args.scenarios}")
    print(f"Windows: {args.windows}")

    all_window_payloads: list[tuple[Path, dict[str, Any], list[dict[str, Any]], list[float]]] = []
    catalog_outputs = []
    all_spreads: list[float] = []

    for scenario in args.scenarios:
        available = available_years(args.yearly_dir, scenario)
        print(f"\nScenario {scenario}: {len(available)} yearly files available")
        for window_kind in args.windows:
            windows = build_windows(available=available, window_kind=window_kind, start_year=args.start_year, end_year=args.end_year)
            print(f"  {window_kind}: {len(windows)} windows")
            for start, end, years in windows:
                by_h3, first_metadata = collect_feature_payloads(yearly_dir=args.yearly_dir, scenario=scenario, years=years)
                features, spreads = aggregate_window_features(by_h3=by_h3, scenario=scenario, window_kind=window_kind, start=start, end=end, years=years)
                all_spreads.extend(spreads)
                out_path = args.out_root / window_kind / f"{scenario}_{start}.geojson"
                metadata = {
                    **first_metadata,
                    "country_id": "fji",
                    "source_dataset": "NEX-GDDP-CMIP6",
                    "variable": "tasmax",
                    "metric": "tx90p",
                    "scenario": scenario,
                    "experiment": scenario,
                    "time_window": window_kind,
                    "year": start,
                    "start_year": start,
                    "end_year": end,
                    "year_label": f"{start}-{end}",
                    "years_in_window": years,
                    "feature_count": len(features),
                    "value_method": "mean_of_model_mean_tx90p_over_window",
                    "risk_formula": RISK_FORMULA,
                    "tx90p_formula": TX90P_FORMULA,
                    "uncertainty_formula": UNCERTAINTY_FORMULA,
                    "reliability_formula": RELIABILITY_FORMULA,
                    "uncertainty_name": "inter_model_spread",
                    "uncertainty_label": "Inter-model spread / model disagreement",
                    "uncertainty_method": "inter_model_max_minus_min_tx90p_after_window_mean",
                    "uncertainty_unit": "percentage_points",
                    "risk_class_bins": RISK_CLASS_BINS,
                    "reliability_class_bins": RELIABILITY_CLASS_BINS,
                    "bivariate_matrix_size": "3x3",
                    "bivariate_color_matrix": BIVARIATE_COLOR_MATRIX_3X3,
                }
                all_window_payloads.append((out_path, metadata, features, spreads))

    spread_p95 = float(np.nanpercentile(np.array(all_spreads, dtype="float32"), 95)) if all_spreads else 0.0
    print(f"\nGlobal time-window inter-model spread p95: {spread_p95:.3f} percentage points")

    for out_path, metadata, features, _spreads in all_window_payloads:
        final_features = apply_bivariate_properties(features=features, spread_p95=spread_p95)
        metadata = {
            **metadata,
            "spread_p95": spread_p95,
            "normalization_reference": "global_window_spread_p95 across generated time-window layers",
            "display": {
                "value_property": "value",
                "risk_property": "risk_class",
                "reliability_property": "reliability_score",
                "reliability_class_property": "reliability_class",
                "color_property": "bivariate_color",
                "color_meaning": "3x3 bivariate TX90p risk x model reliability",
                "bivariate_color_matrix": BIVARIATE_COLOR_MATRIX_3X3,
                "legend_axes": {
                    "x_axis": "Model reliability / agreement, low to high",
                    "y_axis": "TX90p heat risk, low to high",
                },
            },
        }
        payload = {"type": "FeatureCollection", "metadata": metadata, "features": final_features}
        write_geojson(out_path, payload)
        catalog_outputs.append(
            {
                "time_window": metadata["time_window"],
                "scenario": metadata["scenario"],
                "year": metadata["year"],
                "start_year": metadata["start_year"],
                "end_year": metadata["end_year"],
                "path": str(out_path),
                "feature_count": len(final_features),
            }
        )
        print(f"  wrote {metadata['time_window']} {metadata['scenario']} {metadata['year']}: {len(final_features)} H3 cells ({metadata['year_label']})")

    catalog = {
        "catalog_type": "nex_gddp_cmip6_tx90p_3x3_time_window_cache",
        "version": "0.2.0",
        "country_id": "fji",
        "source_dataset": "NEX-GDDP-CMIP6",
        "variable": "tasmax",
        "metric": "tx90p",
        "baseline_period": "1981-2010",
        "windows": args.windows,
        "scenarios": args.scenarios,
        "spread_p95": spread_p95,
        "risk_formula": RISK_FORMULA,
        "tx90p_formula": TX90P_FORMULA,
        "uncertainty_formula": UNCERTAINTY_FORMULA,
        "reliability_formula": RELIABILITY_FORMULA,
        "risk_class_bins": RISK_CLASS_BINS,
        "reliability_class_bins": RELIABILITY_CLASS_BINS,
        "bivariate_matrix_size": "3x3",
        "bivariate_color_matrix": BIVARIATE_COLOR_MATRIX_3X3,
        "outputs": catalog_outputs,
    }
    args.catalog.parent.mkdir(parents=True, exist_ok=True)
    args.catalog.write_text(json.dumps(catalog, indent=2), encoding="utf-8")
    print("\nDone.")
    print(f"Wrote catalog: {args.catalog}")
    print(f"Window files written: {len(catalog_outputs)}")


if __name__ == "__main__":
    main()
