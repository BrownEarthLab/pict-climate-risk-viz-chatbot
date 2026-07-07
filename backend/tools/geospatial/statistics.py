from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional

import geopandas as gpd
import numpy as np
import pandas as pd

from .climate import load_climate_projection
from .spatial import clip_to_region as clip_artifact_to_region


DEFAULT_STATISTICS = [
    "count",
    "mean",
    "median",
    "min",
    "max",
    "std",
    "p10",
    "p25",
    "p75",
    "p90",
    "p95",
]


def _make_failure_artifact(
    warning: str,
    variable: Optional[str] = None,
    region_name: Optional[str] = None,
    period: Optional[str] = None,
    scenario: Optional[str] = None,
    model: Optional[str] = None,
    value_column: Optional[str] = None,
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "climate_region_summary_failed",
        "variable": variable,
        "region_name": region_name,
        "period": period,
        "scenario": scenario,
        "model": model,
        "value_column": value_column,
        "units": None,
        "summary": None,
        "table": [],
        "feature_count": 0,
        "valid_count": 0,
        "missing_count": 0,
        "bbox": None,
        "crs": "EPSG:4326",
        "geojson": None,
        "warnings": [warning],
        "suggestions": suggestions or [],
        "provenance": {
            "method": "summarize_climate_by_region",
        },
    }


def _geojson_to_gdf(geojson: Dict[str, Any]) -> gpd.GeoDataFrame:
    """
    Convert a GeoJSON FeatureCollection into a GeoDataFrame.
    """
    if not isinstance(geojson, dict):
        raise ValueError("geojson must be a dictionary.")

    if geojson.get("type") != "FeatureCollection":
        raise ValueError("geojson must be a GeoJSON FeatureCollection.")

    features = geojson.get("features", [])

    if not isinstance(features, list):
        raise ValueError("geojson['features'] must be a list.")

    if len(features) == 0:
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")

    gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")

    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    return gdf


def _artifact_to_gdf(input_artifact: Dict[str, Any]) -> gpd.GeoDataFrame:
    """
    Convert a spatial/climate artifact into a GeoDataFrame.
    """
    if not isinstance(input_artifact, dict):
        raise ValueError("input_artifact must be a dictionary.")

    geojson = input_artifact.get("geojson")

    if geojson is None:
        raise ValueError("input_artifact must contain a 'geojson' field.")

    return _geojson_to_gdf(geojson)


def _load_or_use_artifact(
    input_artifact: Optional[Dict[str, Any]],
    variable: Optional[str],
    region_name: Optional[str],
    period: Optional[str],
    scenario: Optional[str],
    model: Optional[str],
) -> Dict[str, Any]:
    """
    Use a provided climate/spatial artifact if available.
    Otherwise load a climate layer from the registry.
    """
    if input_artifact is not None:
        return input_artifact

    if not variable:
        raise ValueError("variable is required when input_artifact is not provided.")

    if not region_name:
        raise ValueError("region_name is required when input_artifact is not provided.")

    if not period:
        raise ValueError("period is required when input_artifact is not provided.")

    return load_climate_projection(
        variable=variable,
        region_name=region_name,
        period=period,
        scenario=scenario,
        model=model,
    )


def _choose_value_column(
    input_artifact: Dict[str, Any],
    gdf: gpd.GeoDataFrame,
    value_column: Optional[str],
) -> str:
    """
    Choose the numeric column to summarize.
    """
    if value_column:
        chosen = value_column
    else:
        chosen = input_artifact.get("value_column")

    if not chosen:
        raise ValueError(
            "Could not infer value_column. Provide value_column explicitly."
        )

    if chosen not in gdf.columns:
        raise ValueError(f"value_column '{chosen}' not found in input artifact.")

    return chosen


def _normalize_statistics(statistics: Optional[list[str]]) -> list[str]:
    """
    Normalize requested statistic names.
    """
    if statistics is None:
        return DEFAULT_STATISTICS

    normalized = []

    aliases = {
        "average": "mean",
        "avg": "mean",
        "maximum": "max",
        "minimum": "min",
        "standard_deviation": "std",
        "stdev": "std",
        "sd": "std",
        "n": "count",
    }

    for stat in statistics:
        stat_clean = str(stat).lower().strip()
        stat_clean = aliases.get(stat_clean, stat_clean)
        normalized.append(stat_clean)

    return normalized


def _is_percentile_stat(statistic: str) -> bool:
    return bool(re.fullmatch(r"p\d{1,2}", statistic))


def _percentile_value(statistic: str) -> float:
    percentile = int(statistic[1:])

    if percentile < 0 or percentile > 100:
        raise ValueError(f"Invalid percentile statistic '{statistic}'.")

    return percentile / 100.0


def _safe_float(value: Any) -> Optional[float]:
    """
    Convert numpy/pandas numeric values to JSON-safe floats.
    """
    if value is None:
        return None

    if pd.isna(value):
        return None

    return float(value)


def _compute_statistics(
    series: pd.Series,
    statistics: list[str],
) -> Dict[str, Optional[float]]:
    """
    Compute requested statistics for a numeric series.
    """
    numeric = pd.to_numeric(series, errors="coerce")
    valid = numeric.dropna()

    results: Dict[str, Optional[float]] = {}

    for statistic in statistics:
        if statistic == "count":
            results["count"] = int(valid.count())

        elif statistic == "missing_count":
            results["missing_count"] = int(numeric.isna().sum())

        elif statistic == "mean":
            results["mean"] = _safe_float(valid.mean())

        elif statistic == "median":
            results["median"] = _safe_float(valid.median())

        elif statistic == "min":
            results["min"] = _safe_float(valid.min())

        elif statistic == "max":
            results["max"] = _safe_float(valid.max())

        elif statistic == "std":
            results["std"] = _safe_float(valid.std())

        elif statistic == "sum":
            results["sum"] = _safe_float(valid.sum())

        elif statistic == "variance":
            results["variance"] = _safe_float(valid.var())

        elif _is_percentile_stat(statistic):
            q = _percentile_value(statistic)
            results[statistic] = _safe_float(valid.quantile(q))

        else:
            raise ValueError(
                f"Unsupported statistic '{statistic}'. "
                "Supported examples: count, mean, median, min, max, std, sum, "
                "variance, p10, p25, p75, p90, p95."
            )

    return results


def _summary_to_table(summary: Dict[str, Any]) -> list[Dict[str, Any]]:
    return [
        {
            "statistic": statistic,
            "value": value,
        }
        for statistic, value in summary.items()
    ]


def summarize_climate_by_region(
    input_artifact: Optional[Dict[str, Any]] = None,
    variable: Optional[str] = None,
    region_name: Optional[str] = None,
    period: Optional[str] = None,
    scenario: Optional[str] = None,
    model: Optional[str] = None,
    value_column: Optional[str] = None,
    statistics: Optional[list[str]] = None,
    clip_to_region: bool = True,
    region_artifact: Optional[Dict[str, Any]] = None,
    include_geometry: bool = False,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Summarize a climate layer over a region.

    This wrapper can be used in two ways:

    1. Summarize an already-loaded or clipped artifact:
        summarize_climate_by_region(
            input_artifact=clipped_heat_layer,
            value_column="extreme_heat_days_mean"
        )

    2. Load and summarize internally:
        summarize_climate_by_region(
            variable="extreme_heat_days",
            region_name="Fiji",
            period="2050s",
            scenario="SSP2-4.5",
            model="ACCESS-CM2"
        )

    Typical chain:
        resolve_region("Fiji")
        -> load_climate_projection(...)
        -> clip_to_region(...)
        -> summarize_climate_by_region(...)

    Returns:
        {
            "artifact_type": "climate_region_summary",
            "summary": {
                "mean": ...,
                "max": ...,
                "p90": ...
            },
            "table": [
                {"statistic": "mean", "value": ...}
            ],
            "warnings": [],
            "provenance": {...}
        }
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    warnings: list[str] = []

    try:
        artifact = _load_or_use_artifact(
            input_artifact=input_artifact,
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not load climate layer for summary: {exc}",
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
            value_column=value_column,
        )

    if artifact.get("artifact_type") == "climate_layer_load_failed":
        return _make_failure_artifact(
            warning="Could not load climate layer for summary.",
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
            value_column=value_column,
            suggestions=artifact.get("suggestions", []),
        )

    resolved_region_name = region_name or artifact.get("region_name")

    if clip_to_region and resolved_region_name:
        clipped = clip_artifact_to_region(
            input_artifact=artifact,
            region_name=resolved_region_name,
            region_artifact=region_artifact,
            keep_empty=False,
        )

        if clipped.get("artifact_type") == "clip_to_region_failed":
            return _make_failure_artifact(
                warning="Could not clip climate layer before summarizing.",
                variable=variable or artifact.get("variable"),
                region_name=resolved_region_name,
                period=period or artifact.get("period"),
                scenario=scenario or artifact.get("scenario"),
                model=model or artifact.get("model"),
                value_column=value_column or artifact.get("value_column"),
                suggestions=clipped.get("suggestions", []),
            )

        artifact_to_summarize = clipped
    else:
        artifact_to_summarize = artifact

    try:
        gdf = _artifact_to_gdf(artifact_to_summarize)
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not convert input artifact to GeoDataFrame: {exc}",
            variable=variable or artifact.get("variable"),
            region_name=resolved_region_name,
            period=period or artifact.get("period"),
            scenario=scenario or artifact.get("scenario"),
            model=model or artifact.get("model"),
            value_column=value_column or artifact.get("value_column"),
        )

    if gdf.empty:
        return _make_failure_artifact(
            warning="Input artifact contains no features to summarize.",
            variable=variable or artifact.get("variable"),
            region_name=resolved_region_name,
            period=period or artifact.get("period"),
            scenario=scenario or artifact.get("scenario"),
            model=model or artifact.get("model"),
            value_column=value_column or artifact.get("value_column"),
        )

    try:
        chosen_value_column = _choose_value_column(
            input_artifact=artifact_to_summarize,
            gdf=gdf,
            value_column=value_column,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            variable=variable or artifact.get("variable"),
            region_name=resolved_region_name,
            period=period or artifact.get("period"),
            scenario=scenario or artifact.get("scenario"),
            model=model or artifact.get("model"),
            value_column=value_column,
        )

    requested_statistics = _normalize_statistics(statistics)

    series = pd.to_numeric(gdf[chosen_value_column], errors="coerce")
    valid_count = int(series.notna().sum())
    missing_count = int(series.isna().sum())

    if valid_count == 0:
        return _make_failure_artifact(
            warning=(
                f"value_column '{chosen_value_column}' contains no valid numeric values."
            ),
            variable=variable or artifact.get("variable"),
            region_name=resolved_region_name,
            period=period or artifact.get("period"),
            scenario=scenario or artifact.get("scenario"),
            model=model or artifact.get("model"),
            value_column=chosen_value_column,
        )

    if missing_count > 0:
        warnings.append(
            f"{missing_count} features had missing or non-numeric values in "
            f"'{chosen_value_column}' and were ignored in numeric statistics."
        )

    try:
        summary = _compute_statistics(
            series=series,
            statistics=requested_statistics,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not compute requested statistics: {exc}",
            variable=variable or artifact.get("variable"),
            region_name=resolved_region_name,
            period=period or artifact.get("period"),
            scenario=scenario or artifact.get("scenario"),
            model=model or artifact.get("model"),
            value_column=chosen_value_column,
        )

    geojson = json.loads(gdf.to_json()) if include_geometry else None

    return {
        "artifact_type": "climate_region_summary",
        "input_artifact_type": artifact_to_summarize.get("artifact_type"),
        "input_layer_id": artifact_to_summarize.get("layer_id"),
        "variable": variable or artifact_to_summarize.get("variable"),
        "source_variable": artifact_to_summarize.get("source_variable"),
        "region_name": resolved_region_name or artifact_to_summarize.get("region_name"),
        "period": period or artifact_to_summarize.get("period"),
        "start_year": artifact_to_summarize.get("start_year"),
        "end_year": artifact_to_summarize.get("end_year"),
        "scenario": scenario or artifact_to_summarize.get("scenario"),
        "scenario_code": artifact_to_summarize.get("scenario_code"),
        "model": model or artifact_to_summarize.get("model"),
        "variant": artifact_to_summarize.get("variant"),
        "value_column": chosen_value_column,
        "units": artifact_to_summarize.get("units"),
        "statistics_requested": requested_statistics,
        "summary": summary,
        "table": _summary_to_table(summary),
        "feature_count": int(len(gdf)),
        "valid_count": valid_count,
        "missing_count": missing_count,
        "bbox": [float(x) for x in gdf.total_bounds],
        "crs": "EPSG:4326",
        "geojson": geojson,
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "method": "numeric_summary_over_region",
            "clip_to_region": clip_to_region,
            "parent_artifact_provenance": artifact_to_summarize.get("provenance", {}),
        },
    }