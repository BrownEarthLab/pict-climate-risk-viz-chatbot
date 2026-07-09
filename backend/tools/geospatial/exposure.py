from __future__ import annotations

import json
from typing import Any, Dict, Optional

import geopandas as gpd
import pandas as pd


ASSET_NAME_CANDIDATES = [
    "asset_name",
    "name",
    "NAME",
    "Name",
    "facility_name",
    "FacilityName",
    "school_name",
    "hospital_name",
    "port_name",
    "substation_name",
]

ASSET_ID_CANDIDATES = [
    "asset_id",
    "id",
    "ID",
    "facility_id",
    "school_id",
    "hospital_id",
    "port_id",
    "substation_id",
    "osm_id",
]

ASSET_TYPE_CANDIDATES = [
    "asset_type",
    "type",
    "TYPE",
    "category",
    "sector",
    "class",
]

SUPPORTED_OPERATORS = {
    ">",
    ">=",
    "<",
    "<=",
    "==",
    "!=",
}


OPERATOR_ALIASES = {
    "above": ">",
    "greater_than": ">",
    "more_than": ">",
    "gt": ">",
    "over": ">",
    "at_least": ">=",
    "greater_than_or_equal": ">=",
    "gte": ">=",
    "minimum": ">=",
    "below": "<",
    "less_than": "<",
    "under": "<",
    "lt": "<",
    "at_most": "<=",
    "less_than_or_equal": "<=",
    "lte": "<=",
    "maximum": "<=",
    "equal": "==",
    "equals": "==",
    "eq": "==",
    "not_equal": "!=",
    "not_equals": "!=",
    "neq": "!=",
}


def _make_failure_artifact(
    warning: str,
    value_column: Optional[str] = None,
    threshold: Optional[float] = None,
    comparison_operator: str = ">=",
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "infrastructure_exposure_failed",
        "value_column": value_column,
        "source_value_column": value_column,
        "threshold": threshold,
        "comparison_operator": comparison_operator,
        "geojson": None,
        "feature_count": 0,
        "asset_count": 0,
        "evaluated_asset_count": 0,
        "exposed_asset_count": 0,
        "unexposed_asset_count": 0,
        "missing_value_count": 0,
        "exposure_fraction": None,
        "exposure_percent": None,
        "bbox": None,
        "crs": "EPSG:4326",
        "summary": None,
        "group_summary": [],
        "table": [],
        "warnings": [warning],
        "suggestions": suggestions or [],
        "provenance": {
            "method": "calculate_infrastructure_exposure",
        },
    }


def _geojson_to_gdf(geojson: Dict[str, Any]) -> gpd.GeoDataFrame:
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
    if not isinstance(input_artifact, dict):
        raise ValueError("input_artifact must be a dictionary.")

    geojson = input_artifact.get("geojson")

    if geojson is None:
        raise ValueError("input_artifact must contain a 'geojson' field.")

    return _geojson_to_gdf(geojson)


def _choose_value_column(
    input_artifact: Dict[str, Any],
    gdf: gpd.GeoDataFrame,
    value_column: Optional[str],
) -> str:
    if value_column:
        chosen = value_column
    else:
        chosen = input_artifact.get("value_column") or "sampled_hazard_value"

    if not chosen:
        raise ValueError(
            "Could not infer value_column. Provide value_column explicitly."
        )

    if chosen not in gdf.columns:
        raise ValueError(f"value_column '{chosen}' not found in input artifact.")

    return chosen


def _infer_column(
    gdf: gpd.GeoDataFrame,
    explicit_column: Optional[str],
    candidates: list[str],
    column_role: str,
) -> Optional[str]:
    if explicit_column:
        if explicit_column not in gdf.columns:
            raise ValueError(f"{column_role} column '{explicit_column}' not found.")

        return explicit_column

    for candidate in candidates:
        if candidate in gdf.columns:
            return candidate

    return None


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None

    if pd.isna(value):
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_bool(value: Any) -> Optional[bool]:
    if value is None:
        return None

    if pd.isna(value):
        return None

    return bool(value)


def _normalize_operator(comparison_operator: str) -> str:
    cleaned = str(comparison_operator or ">=").strip().lower()

    normalized = OPERATOR_ALIASES.get(cleaned, cleaned)

    if normalized not in SUPPORTED_OPERATORS:
        raise ValueError(
            f"Unsupported comparison_operator '{comparison_operator}'. "
            "Supported values: >, >=, <, <=, ==, !=."
        )

    return normalized


def _validate_threshold(threshold: Any) -> float:
    if threshold is None:
        raise ValueError("threshold is required.")

    try:
        numeric_threshold = float(threshold)
    except (TypeError, ValueError):
        raise ValueError("threshold must be numeric.")

    if pd.isna(numeric_threshold):
        raise ValueError("threshold must be numeric.")

    return numeric_threshold


def _apply_operator(
    values: pd.Series,
    threshold: float,
    comparison_operator: str,
) -> pd.Series:
    if comparison_operator == ">":
        return values > threshold

    if comparison_operator == ">=":
        return values >= threshold

    if comparison_operator == "<":
        return values < threshold

    if comparison_operator == "<=":
        return values <= threshold

    if comparison_operator == "==":
        return values == threshold

    if comparison_operator == "!=":
        return values != threshold

    raise ValueError(f"Unsupported comparison_operator '{comparison_operator}'.")


def _calculate_exposure_difference(
    values: pd.Series,
    threshold: float,
    comparison_operator: str,
) -> pd.Series:
    """
    Positive values mean the asset is deeper into the exposed side
    of the threshold. Negative values mean below the exposure condition.
    """
    if comparison_operator in {">", ">="}:
        return values - threshold

    if comparison_operator in {"<", "<="}:
        return threshold - values

    if comparison_operator == "==":
        return -(values - threshold).abs()

    if comparison_operator == "!=":
        return (values - threshold).abs()

    raise ValueError(f"Unsupported comparison_operator '{comparison_operator}'.")


def _prepare_asset_exposure_gdf(
    asset_gdf: gpd.GeoDataFrame,
    value_column: str,
    threshold: float,
    comparison_operator: str,
) -> gpd.GeoDataFrame:
    if asset_gdf.empty:
        raise ValueError("Input artifact contains no asset features.")

    asset_gdf = asset_gdf.copy()

    if asset_gdf.geometry.is_empty.any():
        asset_gdf = asset_gdf[~asset_gdf.geometry.is_empty].copy()

    if asset_gdf.empty:
        raise ValueError("Input artifact contains no non-empty asset geometries.")

    asset_gdf[value_column] = pd.to_numeric(asset_gdf[value_column], errors="coerce")

    valid_mask = asset_gdf[value_column].notna()
    exposed_mask = pd.Series(False, index=asset_gdf.index)

    exposed_mask.loc[valid_mask] = _apply_operator(
        values=asset_gdf.loc[valid_mask, value_column],
        threshold=threshold,
        comparison_operator=comparison_operator,
    )

    asset_gdf["exposed_to_hazard"] = exposed_mask.astype(bool)
    asset_gdf["exposure_score"] = asset_gdf["exposed_to_hazard"].astype(float)
    asset_gdf["exposure_difference"] = _calculate_exposure_difference(
        values=asset_gdf[value_column],
        threshold=threshold,
        comparison_operator=comparison_operator,
    )
    asset_gdf["exposure_threshold"] = threshold
    asset_gdf["exposure_operator"] = comparison_operator
    asset_gdf["exposure_value_column"] = value_column
    asset_gdf["has_exposure_value"] = valid_mask.astype(bool)

    return asset_gdf


def _summarize_exposure(
    exposure_gdf: gpd.GeoDataFrame,
    value_column: str,
    threshold: float,
    comparison_operator: str,
) -> Dict[str, Any]:
    values = pd.to_numeric(exposure_gdf[value_column], errors="coerce")
    valid_mask = values.notna()

    asset_count = int(len(exposure_gdf))
    evaluated_asset_count = int(valid_mask.sum())
    missing_value_count = int((~valid_mask).sum())

    exposed_asset_count = int(
        exposure_gdf.loc[valid_mask, "exposed_to_hazard"].sum()
    )
    unexposed_asset_count = int(evaluated_asset_count - exposed_asset_count)

    if evaluated_asset_count > 0:
        exposure_fraction = exposed_asset_count / evaluated_asset_count
        exposure_percent = exposure_fraction * 100.0
    else:
        exposure_fraction = None
        exposure_percent = None

    return {
        "asset_count": asset_count,
        "evaluated_asset_count": evaluated_asset_count,
        "exposed_asset_count": exposed_asset_count,
        "unexposed_asset_count": unexposed_asset_count,
        "missing_value_count": missing_value_count,
        "exposure_fraction": _safe_float(exposure_fraction),
        "exposure_percent": _safe_float(exposure_percent),
        "threshold": threshold,
        "comparison_operator": comparison_operator,
        "source_value_column": value_column,
        "value_min": _safe_float(values.min()),
        "value_max": _safe_float(values.max()),
        "value_mean": _safe_float(values.mean()),
        "value_median": _safe_float(values.median()),
    }


def _make_group_summary(
    exposure_gdf: gpd.GeoDataFrame,
    value_column: str,
    group_by_column: Optional[str],
) -> list[Dict[str, Any]]:
    if not group_by_column:
        return []

    if group_by_column not in exposure_gdf.columns:
        return []

    table = []

    grouped = exposure_gdf.groupby(group_by_column, dropna=False)

    for group_value, group in grouped:
        values = pd.to_numeric(group[value_column], errors="coerce")
        valid_mask = values.notna()

        asset_count = int(len(group))
        evaluated_asset_count = int(valid_mask.sum())
        missing_value_count = int((~valid_mask).sum())

        exposed_asset_count = int(group.loc[valid_mask, "exposed_to_hazard"].sum())
        unexposed_asset_count = int(evaluated_asset_count - exposed_asset_count)

        if evaluated_asset_count > 0:
            exposure_fraction = exposed_asset_count / evaluated_asset_count
            exposure_percent = exposure_fraction * 100.0
        else:
            exposure_fraction = None
            exposure_percent = None

        table.append(
            {
                "group": None if pd.isna(group_value) else group_value,
                "group_by_column": group_by_column,
                "asset_count": asset_count,
                "evaluated_asset_count": evaluated_asset_count,
                "exposed_asset_count": exposed_asset_count,
                "unexposed_asset_count": unexposed_asset_count,
                "missing_value_count": missing_value_count,
                "exposure_fraction": _safe_float(exposure_fraction),
                "exposure_percent": _safe_float(exposure_percent),
                "value_min": _safe_float(values.min()),
                "value_max": _safe_float(values.max()),
                "value_mean": _safe_float(values.mean()),
                "value_median": _safe_float(values.median()),
            }
        )

    table = sorted(
        table,
        key=lambda item: (
            item["exposure_percent"] is None,
            -(item["exposure_percent"] or 0),
            str(item["group"]),
        ),
    )

    return table


def _make_asset_table(
    exposure_gdf: gpd.GeoDataFrame,
    value_column: str,
    asset_name_column: Optional[str],
    asset_id_column: Optional[str],
    asset_type_column: Optional[str],
    max_rows: int = 300,
) -> list[Dict[str, Any]]:
    table = []

    for _, row in exposure_gdf.head(max_rows).iterrows():
        item = {
            "source_value_column": value_column,
            "hazard_value": _safe_float(row.get(value_column)),
            "exposed_to_hazard": _safe_bool(row.get("exposed_to_hazard")),
            "exposure_score": _safe_float(row.get("exposure_score")),
            "exposure_difference": _safe_float(row.get("exposure_difference")),
            "has_exposure_value": _safe_bool(row.get("has_exposure_value")),
        }

        if asset_name_column:
            item["asset_name"] = row.get(asset_name_column)

        if asset_id_column:
            item["asset_id"] = row.get(asset_id_column)

        if asset_type_column:
            item["asset_type"] = row.get(asset_type_column)

        if row.geometry is not None and row.geometry.geom_type == "Point":
            item["longitude"] = _safe_float(row.geometry.x)
            item["latitude"] = _safe_float(row.geometry.y)

        table.append(item)

    return table


def calculate_infrastructure_exposure(
    input_artifact: Dict[str, Any],
    value_column: Optional[str] = None,
    threshold: Optional[float] = None,
    comparison_operator: str = ">=",
    asset_name_column: Optional[str] = None,
    asset_id_column: Optional[str] = None,
    asset_type_column: Optional[str] = None,
    group_by_column: Optional[str] = None,
    include_unexposed_assets: bool = True,
    include_missing_value_assets: bool = True,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Calculate infrastructure exposure from an asset-hazard sample layer.

    Typical chain:
        load_climate_projection(...)
        -> sample_hazard_at_assets(...)
        -> calculate_infrastructure_exposure(...)

    Example:
        calculate_infrastructure_exposure(
            input_artifact=sampled_hospitals,
            value_column="sampled_hazard_value",
            threshold=30,
            comparison_operator=">="
        )

    Returns one asset-level GeoJSON layer with exposure columns plus summary
    statistics and optional group summaries by infrastructure type.
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    warnings: list[str] = []

    try:
        normalized_operator = _normalize_operator(comparison_operator)
        numeric_threshold = _validate_threshold(threshold)
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            value_column=value_column,
            threshold=threshold,
            comparison_operator=comparison_operator,
        )

    try:
        asset_gdf = _artifact_to_gdf(input_artifact)
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not convert input artifact to GeoDataFrame: {exc}",
            value_column=value_column,
            threshold=numeric_threshold,
            comparison_operator=normalized_operator,
        )

    try:
        chosen_value_column = _choose_value_column(
            input_artifact=input_artifact,
            gdf=asset_gdf,
            value_column=value_column,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            value_column=value_column,
            threshold=numeric_threshold,
            comparison_operator=normalized_operator,
        )

    try:
        resolved_asset_name_column = _infer_column(
            gdf=asset_gdf,
            explicit_column=asset_name_column,
            candidates=ASSET_NAME_CANDIDATES,
            column_role="asset_name",
        )

        resolved_asset_id_column = _infer_column(
            gdf=asset_gdf,
            explicit_column=asset_id_column,
            candidates=ASSET_ID_CANDIDATES,
            column_role="asset_id",
        )

        resolved_asset_type_column = _infer_column(
            gdf=asset_gdf,
            explicit_column=asset_type_column,
            candidates=ASSET_TYPE_CANDIDATES,
            column_role="asset_type",
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            value_column=chosen_value_column,
            threshold=numeric_threshold,
            comparison_operator=normalized_operator,
        )

    if group_by_column:
        if group_by_column not in asset_gdf.columns:
            return _make_failure_artifact(
                warning=f"group_by_column '{group_by_column}' not found.",
                value_column=chosen_value_column,
                threshold=numeric_threshold,
                comparison_operator=normalized_operator,
            )
        resolved_group_by_column = group_by_column
    else:
        resolved_group_by_column = resolved_asset_type_column

    try:
        exposure_gdf = _prepare_asset_exposure_gdf(
            asset_gdf=asset_gdf,
            value_column=chosen_value_column,
            threshold=numeric_threshold,
            comparison_operator=normalized_operator,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not calculate infrastructure exposure: {exc}",
            value_column=chosen_value_column,
            threshold=numeric_threshold,
            comparison_operator=normalized_operator,
        )

    if not include_unexposed_assets:
        exposure_gdf = exposure_gdf[exposure_gdf["exposed_to_hazard"]].copy()

    if not include_missing_value_assets:
        exposure_gdf = exposure_gdf[exposure_gdf["has_exposure_value"]].copy()

    if exposure_gdf.empty:
        return _make_failure_artifact(
            warning="Exposure calculation produced no output assets.",
            value_column=chosen_value_column,
            threshold=numeric_threshold,
            comparison_operator=normalized_operator,
        )

    summary = _summarize_exposure(
        exposure_gdf=exposure_gdf,
        value_column=chosen_value_column,
        threshold=numeric_threshold,
        comparison_operator=normalized_operator,
    )

    if summary["missing_value_count"] > 0:
        warnings.append(
            f"{summary['missing_value_count']} assets have missing exposure values."
        )

    if summary["exposed_asset_count"] == 0:
        warnings.append("No assets meet the exposure threshold.")

    group_summary = _make_group_summary(
        exposure_gdf=exposure_gdf,
        value_column=chosen_value_column,
        group_by_column=resolved_group_by_column,
    )

    geojson = json.loads(exposure_gdf.to_json())

    layer_id = (
        f"{input_artifact.get('layer_id', 'infrastructure_assets')}_"
        f"exposure_{normalized_operator.replace('>', 'gt').replace('<', 'lt').replace('=', 'eq')}_"
        f"{str(numeric_threshold).replace('.', '_')}"
    )

    return {
        "artifact_type": "infrastructure_exposure_layer",
        "input_artifact_type": input_artifact.get("artifact_type"),
        "input_layer_id": input_artifact.get("layer_id"),
        "layer_id": layer_id,
        "variable": input_artifact.get("variable"),
        "source_variable": input_artifact.get("source_variable"),
        "region_name": input_artifact.get("region_name"),
        "period": input_artifact.get("period"),
        "start_year": input_artifact.get("start_year"),
        "end_year": input_artifact.get("end_year"),
        "scenario": input_artifact.get("scenario"),
        "scenario_code": input_artifact.get("scenario_code"),
        "model": input_artifact.get("model"),
        "variant": input_artifact.get("variant"),
        "asset_name_column": resolved_asset_name_column,
        "asset_id_column": resolved_asset_id_column,
        "asset_type_column": resolved_asset_type_column,
        "group_by_column": resolved_group_by_column,
        "value_column": "exposure_score",
        "source_value_column": chosen_value_column,
        "units": input_artifact.get("units"),
        "threshold": numeric_threshold,
        "comparison_operator": normalized_operator,
        "include_unexposed_assets": include_unexposed_assets,
        "include_missing_value_assets": include_missing_value_assets,
        "geojson": geojson,
        "feature_count": int(len(exposure_gdf)),
        "asset_count": summary["asset_count"],
        "evaluated_asset_count": summary["evaluated_asset_count"],
        "exposed_asset_count": summary["exposed_asset_count"],
        "unexposed_asset_count": summary["unexposed_asset_count"],
        "missing_value_count": summary["missing_value_count"],
        "exposure_fraction": summary["exposure_fraction"],
        "exposure_percent": summary["exposure_percent"],
        "bbox": [float(x) for x in exposure_gdf.total_bounds],
        "crs": "EPSG:4326",
        "summary": summary,
        "group_summary": group_summary,
        "table": _make_asset_table(
            exposure_gdf=exposure_gdf,
            value_column=chosen_value_column,
            asset_name_column=resolved_asset_name_column,
            asset_id_column=resolved_asset_id_column,
            asset_type_column=resolved_asset_type_column,
        ),
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "method": "threshold_based_infrastructure_exposure",
            "threshold": numeric_threshold,
            "comparison_operator": normalized_operator,
            "parent_artifact_provenance": input_artifact.get("provenance", {}),
        },
    }