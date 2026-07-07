from __future__ import annotations

import json
import operator
from typing import Any, Dict, Optional

import geopandas as gpd
import pandas as pd

from .climate import load_climate_projection
from .spatial import clip_to_region as clip_artifact_to_region


SUPPORTED_OPERATORS = {
    ">": operator.gt,
    ">=": operator.ge,
    "<": operator.lt,
    "<=": operator.le,
    "==": operator.eq,
    "!=": operator.ne,
}


OPERATOR_ALIASES = {
    "above": ">",
    "greater_than": ">",
    "more_than": ">",
    "exceeds": ">",
    "exceeding": ">",
    "at_or_above": ">=",
    "greater_than_or_equal": ">=",
    "at_least": ">=",
    "below": "<",
    "less_than": "<",
    "under": "<",
    "at_or_below": "<=",
    "less_than_or_equal": "<=",
    "at_most": "<=",
    "equal": "==",
    "equals": "==",
    "not_equal": "!=",
}


def _make_failure_artifact(
    warning: str,
    variable: Optional[str] = None,
    region_name: Optional[str] = None,
    period: Optional[str] = None,
    scenario: Optional[str] = None,
    model: Optional[str] = None,
    value_column: Optional[str] = None,
    threshold: Optional[float] = None,
    comparison_operator: str = ">=",
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "threshold_exceedance_failed",
        "variable": variable,
        "region_name": region_name,
        "period": period,
        "scenario": scenario,
        "model": model,
        "value_column": value_column,
        "threshold": threshold,
        "comparison_operator": comparison_operator,
        "units": None,
        "geojson": None,
        "feature_count": 0,
        "input_feature_count": 0,
        "exceedance_count": 0,
        "non_exceedance_count": 0,
        "valid_count": 0,
        "missing_count": 0,
        "bbox": None,
        "crs": "EPSG:4326",
        "summary": None,
        "warnings": [warning],
        "suggestions": suggestions or [],
        "provenance": {
            "method": "get_threshold_exceedance",
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


def _normalize_operator(comparison_operator: str) -> str:
    """
    Normalize operator aliases like 'at_least' into standard symbols like '>='.
    """
    if comparison_operator is None:
        return ">="

    cleaned = str(comparison_operator).lower().strip()

    return OPERATOR_ALIASES.get(cleaned, cleaned)


def _validate_operator(comparison_operator: str) -> str:
    normalized_operator = _normalize_operator(comparison_operator)

    if normalized_operator not in SUPPORTED_OPERATORS:
        supported = sorted(set(SUPPORTED_OPERATORS.keys()) | set(OPERATOR_ALIASES.keys()))
        raise ValueError(
            f"Unsupported comparison_operator '{comparison_operator}'. "
            f"Supported operators include: {supported}"
        )

    return normalized_operator


def _choose_value_column(
    input_artifact: Dict[str, Any],
    gdf: gpd.GeoDataFrame,
    value_column: Optional[str],
) -> str:
    """
    Choose the numeric column to test against the threshold.
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


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None

    if pd.isna(value):
        return None

    return float(value)


def _apply_threshold(
    gdf: gpd.GeoDataFrame,
    value_column: str,
    threshold: float,
    comparison_operator: str,
) -> gpd.GeoDataFrame:
    """
    Add threshold-exceedance columns to the GeoDataFrame.
    """
    result = gdf.copy()

    numeric_values = pd.to_numeric(result[value_column], errors="coerce")
    comparison_function = SUPPORTED_OPERATORS[comparison_operator]

    result["_numeric_threshold_value"] = numeric_values
    result["exceeds_threshold"] = comparison_function(numeric_values, threshold)
    result["exceeds_threshold"] = result["exceeds_threshold"].fillna(False).astype(bool)

    result["threshold"] = float(threshold)
    result["comparison_operator"] = comparison_operator
    result["threshold_difference"] = numeric_values - float(threshold)
    result["threshold_abs_difference"] = result["threshold_difference"].abs()

    def classify(row: pd.Series) -> Optional[str]:
        value = row["_numeric_threshold_value"]

        if pd.isna(value):
            return None

        if bool(row["exceeds_threshold"]):
            return "exceeds_threshold"

        return "does_not_exceed_threshold"

    result["threshold_class"] = result.apply(classify, axis=1)

    return result


def _summarize_threshold_result(
    gdf: gpd.GeoDataFrame,
    value_column: str,
    threshold: float,
    comparison_operator: str,
    output_gdf: gpd.GeoDataFrame,
) -> Dict[str, Any]:
    numeric_values = pd.to_numeric(gdf[value_column], errors="coerce")

    input_feature_count = int(len(gdf))
    valid_count = int(numeric_values.notna().sum())
    missing_count = int(numeric_values.isna().sum())
    exceedance_count = int(gdf["exceeds_threshold"].sum())
    non_exceedance_count = int(valid_count - exceedance_count)

    if valid_count > 0:
        exceedance_fraction = exceedance_count / valid_count
    else:
        exceedance_fraction = None

    exceeding_values = numeric_values[gdf["exceeds_threshold"]]

    return {
        "input_feature_count": input_feature_count,
        "output_feature_count": int(len(output_gdf)),
        "valid_count": valid_count,
        "missing_count": missing_count,
        "exceedance_count": exceedance_count,
        "non_exceedance_count": non_exceedance_count,
        "exceedance_fraction": _safe_float(exceedance_fraction),
        "threshold": float(threshold),
        "comparison_operator": comparison_operator,
        "value_column": value_column,
        "input_min": _safe_float(numeric_values.min()),
        "input_max": _safe_float(numeric_values.max()),
        "input_mean": _safe_float(numeric_values.mean()),
        "exceeding_min": _safe_float(exceeding_values.min()),
        "exceeding_max": _safe_float(exceeding_values.max()),
        "exceeding_mean": _safe_float(exceeding_values.mean()),
    }


def get_threshold_exceedance(
    input_artifact: Optional[Dict[str, Any]] = None,
    variable: Optional[str] = None,
    region_name: Optional[str] = None,
    period: Optional[str] = None,
    scenario: Optional[str] = None,
    model: Optional[str] = None,
    value_column: Optional[str] = None,
    threshold: Optional[float] = None,
    comparison_operator: str = ">=",
    clip_to_region: bool = True,
    region_artifact: Optional[Dict[str, Any]] = None,
    return_only_exceeding: bool = True,
    include_missing_features: bool = False,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Identify features where a climate value crosses a threshold.

    This wrapper can be used in two ways:

    1. Threshold an already-loaded or clipped artifact:
        get_threshold_exceedance(
            input_artifact=clipped_heat_layer,
            value_column="extreme_heat_days_mean",
            threshold=30,
            comparison_operator=">="
        )

    2. Load and threshold internally:
        get_threshold_exceedance(
            variable="extreme_heat_days",
            region_name="Fiji",
            period="2050s",
            scenario="SSP2-4.5",
            model="ACCESS-CM2",
            threshold=30
        )

    Typical chain:
        resolve_region("Fiji")
        -> load_climate_projection(...)
        -> clip_to_region(...)
        -> get_threshold_exceedance(...)

    Returns:
        {
            "artifact_type": "threshold_exceedance_layer",
            "geojson": {...},
            "value_column": "threshold_difference",
            "summary": {
                "exceedance_count": ...,
                "exceedance_fraction": ...
            },
            "warnings": [],
            "provenance": {...}
        }
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    if threshold is None:
        return _make_failure_artifact(
            warning="threshold is required.",
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
            value_column=value_column,
            threshold=threshold,
            comparison_operator=comparison_operator,
        )

    try:
        numeric_threshold = float(threshold)
    except Exception:
        return _make_failure_artifact(
            warning=f"threshold must be numeric. Received: {threshold}",
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
            value_column=value_column,
            threshold=None,
            comparison_operator=comparison_operator,
        )

    try:
        normalized_operator = _validate_operator(comparison_operator)
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
            value_column=value_column,
            threshold=numeric_threshold,
            comparison_operator=comparison_operator,
        )

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
            warning=f"Could not load climate layer for threshold exceedance: {exc}",
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
            value_column=value_column,
            threshold=numeric_threshold,
            comparison_operator=normalized_operator,
        )

    if artifact.get("artifact_type") == "climate_layer_load_failed":
        return _make_failure_artifact(
            warning="Could not load climate layer for threshold exceedance.",
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
            value_column=value_column,
            threshold=numeric_threshold,
            comparison_operator=normalized_operator,
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
                warning="Could not clip climate layer before threshold exceedance.",
                variable=variable or artifact.get("variable"),
                region_name=resolved_region_name,
                period=period or artifact.get("period"),
                scenario=scenario or artifact.get("scenario"),
                model=model or artifact.get("model"),
                value_column=value_column or artifact.get("value_column"),
                threshold=numeric_threshold,
                comparison_operator=normalized_operator,
                suggestions=clipped.get("suggestions", []),
            )

        artifact_to_threshold = clipped
    else:
        artifact_to_threshold = artifact

    try:
        gdf = _artifact_to_gdf(artifact_to_threshold)
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not convert input artifact to GeoDataFrame: {exc}",
            variable=variable or artifact.get("variable"),
            region_name=resolved_region_name,
            period=period or artifact.get("period"),
            scenario=scenario or artifact.get("scenario"),
            model=model or artifact.get("model"),
            value_column=value_column or artifact.get("value_column"),
            threshold=numeric_threshold,
            comparison_operator=normalized_operator,
        )

    if gdf.empty:
        return _make_failure_artifact(
            warning="Input artifact contains no features to threshold.",
            variable=variable or artifact.get("variable"),
            region_name=resolved_region_name,
            period=period or artifact.get("period"),
            scenario=scenario or artifact.get("scenario"),
            model=model or artifact.get("model"),
            value_column=value_column or artifact.get("value_column"),
            threshold=numeric_threshold,
            comparison_operator=normalized_operator,
        )

    try:
        chosen_value_column = _choose_value_column(
            input_artifact=artifact_to_threshold,
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
            threshold=numeric_threshold,
            comparison_operator=normalized_operator,
        )

    thresholded_gdf = _apply_threshold(
        gdf=gdf,
        value_column=chosen_value_column,
        threshold=numeric_threshold,
        comparison_operator=normalized_operator,
    )

    numeric_values = thresholded_gdf["_numeric_threshold_value"]
    missing_count = int(numeric_values.isna().sum())

    if missing_count > 0:
        warnings.append(
            f"{missing_count} features had missing or non-numeric values in "
            f"'{chosen_value_column}'."
        )

    if return_only_exceeding:
        output_gdf = thresholded_gdf[thresholded_gdf["exceeds_threshold"]].copy()
    else:
        output_gdf = thresholded_gdf.copy()

    if not include_missing_features:
        output_gdf = output_gdf[output_gdf["_numeric_threshold_value"].notna()].copy()

    summary = _summarize_threshold_result(
        gdf=thresholded_gdf,
        value_column=chosen_value_column,
        threshold=numeric_threshold,
        comparison_operator=normalized_operator,
        output_gdf=output_gdf,
    )

    if output_gdf.empty:
        warnings.append(
            "No features matched the requested threshold condition."
        )

        bbox = None
        geojson = {
            "type": "FeatureCollection",
            "features": [],
        }
    else:
        bbox = [float(x) for x in output_gdf.total_bounds]
        geojson = json.loads(output_gdf.drop(columns=["_numeric_threshold_value"]).to_json())

    return {
        "artifact_type": "threshold_exceedance_layer",
        "input_artifact_type": artifact_to_threshold.get("artifact_type"),
        "input_layer_id": artifact_to_threshold.get("layer_id"),
        "layer_id": (
            f"{artifact_to_threshold.get('layer_id', 'layer')}_"
            f"threshold_{normalized_operator}_{numeric_threshold}"
            .replace(">", "gt")
            .replace("<", "lt")
            .replace("=", "eq")
            .replace("!", "not")
            .replace(".", "_")
        ),
        "variable": variable or artifact_to_threshold.get("variable"),
        "source_variable": artifact_to_threshold.get("source_variable"),
        "region_name": resolved_region_name or artifact_to_threshold.get("region_name"),
        "period": period or artifact_to_threshold.get("period"),
        "start_year": artifact_to_threshold.get("start_year"),
        "end_year": artifact_to_threshold.get("end_year"),
        "scenario": scenario or artifact_to_threshold.get("scenario"),
        "scenario_code": artifact_to_threshold.get("scenario_code"),
        "model": model or artifact_to_threshold.get("model"),
        "variant": artifact_to_threshold.get("variant"),
        "value_column": "threshold_difference",
        "source_value_column": chosen_value_column,
        "units": artifact_to_threshold.get("units"),
        "threshold": numeric_threshold,
        "comparison_operator": normalized_operator,
        "return_only_exceeding": return_only_exceeding,
        "geojson": geojson,
        "feature_count": int(len(output_gdf)),
        "input_feature_count": summary["input_feature_count"],
        "exceedance_count": summary["exceedance_count"],
        "non_exceedance_count": summary["non_exceedance_count"],
        "valid_count": summary["valid_count"],
        "missing_count": summary["missing_count"],
        "bbox": bbox,
        "crs": "EPSG:4326",
        "summary": summary,
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "method": "numeric_threshold_filter",
            "clip_to_region": clip_to_region,
            "formula": (
                f"exceeds_threshold = {chosen_value_column} "
                f"{normalized_operator} {numeric_threshold}"
            ),
            "parent_artifact_provenance": artifact_to_threshold.get("provenance", {}),
        },
    }