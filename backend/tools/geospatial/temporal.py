from __future__ import annotations

import json
from typing import Any, Dict, Optional

import geopandas as gpd
import numpy as np
import pandas as pd

from .climate import load_climate_projection


def _make_failure_artifact(
    warning: str,
    variable: Optional[str] = None,
    region_name: Optional[str] = None,
    period_a: Optional[str] = None,
    period_b: Optional[str] = None,
    scenario: Optional[str] = None,
    model: Optional[str] = None,
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "climate_period_comparison_failed",
        "variable": variable,
        "region_name": region_name,
        "period_a": period_a,
        "period_b": period_b,
        "scenario": scenario,
        "model": model,
        "geojson": None,
        "feature_count": 0,
        "bbox": None,
        "crs": "EPSG:4326",
        "value_column": None,
        "units": None,
        "warnings": [warning],
        "suggestions": suggestions or [],
        "provenance": {
            "method": "compare_climate_periods",
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
    Convert a climate/spatial artifact into a GeoDataFrame.
    """
    if not isinstance(input_artifact, dict):
        raise ValueError("input_artifact must be a dictionary.")

    geojson = input_artifact.get("geojson")

    if geojson is None:
        raise ValueError("input_artifact must contain a 'geojson' field.")

    return _geojson_to_gdf(geojson)


def _load_or_use_artifact(
    artifact: Optional[Dict[str, Any]],
    variable: Optional[str],
    region_name: Optional[str],
    period: Optional[str],
    scenario: Optional[str],
    model: Optional[str],
) -> Dict[str, Any]:
    """
    Use a provided artifact if available. Otherwise load it from the registry.
    """
    if artifact is not None:
        return artifact

    if not variable:
        raise ValueError("variable is required when climate artifact is not provided.")

    if not region_name:
        raise ValueError("region_name is required when climate artifact is not provided.")

    if not period:
        raise ValueError("period is required when climate artifact is not provided.")

    return load_climate_projection(
        variable=variable,
        region_name=region_name,
        period=period,
        scenario=scenario,
        model=model,
    )


def _choose_value_column(
    artifact_a: Dict[str, Any],
    artifact_b: Dict[str, Any],
    value_column: Optional[str],
) -> str:
    """
    Choose the numeric value column to compare.
    """
    if value_column:
        return value_column

    value_column_a = artifact_a.get("value_column")
    value_column_b = artifact_b.get("value_column")

    if value_column_a and value_column_b and value_column_a == value_column_b:
        return value_column_a

    if value_column_a and not value_column_b:
        return value_column_a

    if value_column_b and not value_column_a:
        return value_column_b

    raise ValueError(
        "Could not infer value_column. Provide value_column explicitly."
    )


def _choose_join_column(gdf_a: gpd.GeoDataFrame, gdf_b: gpd.GeoDataFrame) -> Optional[str]:
    """
    Choose the best column for matching cells across periods.

    Most processed climate layers should have cell_id. If not, we fall back
    to index-based comparison only when the two layers have the same length.
    """
    candidate_columns = [
        "cell_id",
        "h3_id",
        "grid_id",
        "feature_id",
    ]

    for column in candidate_columns:
        if column in gdf_a.columns and column in gdf_b.columns:
            return column

    return None


def _prepare_comparison_frame(
    gdf_a: gpd.GeoDataFrame,
    gdf_b: gpd.GeoDataFrame,
    value_column: str,
    period_a: str,
    period_b: str,
) -> gpd.GeoDataFrame:
    """
    Join two period layers and calculate change columns.
    """
    if value_column not in gdf_a.columns:
        raise ValueError(f"value_column '{value_column}' not found in period_a layer.")

    if value_column not in gdf_b.columns:
        raise ValueError(f"value_column '{value_column}' not found in period_b layer.")

    join_column = _choose_join_column(gdf_a, gdf_b)

    value_a_column = f"{value_column}_{period_a}"
    value_b_column = f"{value_column}_{period_b}"

    if join_column is not None:
        keep_a = [join_column, value_column, "geometry"]
        keep_b = [join_column, value_column]

        left = gdf_a[keep_a].copy()
        right = gdf_b[keep_b].copy()

        left = left.rename(columns={value_column: value_a_column})
        right = right.rename(columns={value_column: value_b_column})

        merged = left.merge(right, on=join_column, how="inner")

    else:
        if len(gdf_a) != len(gdf_b):
            raise ValueError(
                "Could not compare layers because no shared join column was found "
                "and the layers have different feature counts."
            )

        left = gdf_a[[value_column, "geometry"]].copy()
        right = gdf_b[[value_column]].copy()

        left = left.rename(columns={value_column: value_a_column})
        right = right.rename(columns={value_column: value_b_column})

        left["_comparison_index"] = range(len(left))
        right["_comparison_index"] = range(len(right))

        merged = left.merge(right, on="_comparison_index", how="inner")

    result = gpd.GeoDataFrame(
        merged,
        geometry="geometry",
        crs=gdf_a.crs or "EPSG:4326",
    )

    result[value_a_column] = pd.to_numeric(result[value_a_column], errors="coerce")
    result[value_b_column] = pd.to_numeric(result[value_b_column], errors="coerce")

    result["absolute_change"] = result[value_b_column] - result[value_a_column]

    denominator = result[value_a_column].replace(0, np.nan)
    result["percent_change"] = (result["absolute_change"] / denominator) * 100

    result["change_direction"] = np.select(
        [
            result["absolute_change"] > 0,
            result["absolute_change"] < 0,
            result["absolute_change"] == 0,
        ],
        [
            "increase",
            "decrease",
            "no_change",
        ],
        default="unknown",
    )

    return result


def _summarize_change(
    gdf: gpd.GeoDataFrame,
    value_a_column: str,
    value_b_column: str,
) -> Dict[str, Any]:
    """
    Produce summary statistics for the comparison artifact.
    """
    if gdf.empty:
        return {}

    return {
        "feature_count": int(len(gdf)),
        "period_a_mean": float(gdf[value_a_column].mean(skipna=True)),
        "period_b_mean": float(gdf[value_b_column].mean(skipna=True)),
        "absolute_change_mean": float(gdf["absolute_change"].mean(skipna=True)),
        "absolute_change_min": float(gdf["absolute_change"].min(skipna=True)),
        "absolute_change_max": float(gdf["absolute_change"].max(skipna=True)),
        "absolute_change_p90": float(gdf["absolute_change"].quantile(0.9)),
        "percent_change_mean": (
            None
            if gdf["percent_change"].dropna().empty
            else float(gdf["percent_change"].mean(skipna=True))
        ),
    }


def compare_climate_periods(
    variable: Optional[str] = None,
    region_name: Optional[str] = None,
    period_a: Optional[str] = None,
    period_b: Optional[str] = None,
    scenario: Optional[str] = None,
    model: Optional[str] = None,
    climate_artifact_a: Optional[Dict[str, Any]] = None,
    climate_artifact_b: Optional[Dict[str, Any]] = None,
    value_column: Optional[str] = None,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Compare the same climate variable between two time periods.

    This is the fourth core chatbot wrapper.

    It can be used in two ways:

    1. Load layers internally:
        compare_climate_periods(
            variable="extreme_heat_days",
            region_name="Fiji",
            period_a="2050s",
            period_b="2060s",
            scenario="SSP2-4.5",
            model="ACCESS-CM2"
        )

    2. Compare already-loaded artifacts:
        compare_climate_periods(
            climate_artifact_a=layer_2050s,
            climate_artifact_b=layer_2060s
        )

    Returns:
        {
            "artifact_type": "climate_period_comparison",
            "geojson": {...},
            "value_column": "absolute_change",
            "comparison_columns": {...},
            "summary": {...},
            "warnings": [],
            "provenance": {...}
        }
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    warnings: list[str] = []

    try:
        artifact_a = _load_or_use_artifact(
            artifact=climate_artifact_a,
            variable=variable,
            region_name=region_name,
            period=period_a,
            scenario=scenario,
            model=model,
        )

        artifact_b = _load_or_use_artifact(
            artifact=climate_artifact_b,
            variable=variable,
            region_name=region_name,
            period=period_b,
            scenario=scenario,
            model=model,
        )

    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not load climate layers for comparison: {exc}",
            variable=variable,
            region_name=region_name,
            period_a=period_a,
            period_b=period_b,
            scenario=scenario,
            model=model,
        )

    if artifact_a.get("artifact_type") == "climate_layer_load_failed":
        return _make_failure_artifact(
            warning="Could not load period_a climate layer.",
            variable=variable,
            region_name=region_name,
            period_a=period_a,
            period_b=period_b,
            scenario=scenario,
            model=model,
            suggestions=artifact_a.get("suggestions", []),
        )

    if artifact_b.get("artifact_type") == "climate_layer_load_failed":
        return _make_failure_artifact(
            warning="Could not load period_b climate layer.",
            variable=variable,
            region_name=region_name,
            period_a=period_a,
            period_b=period_b,
            scenario=scenario,
            model=model,
            suggestions=artifact_b.get("suggestions", []),
        )

    resolved_variable = variable or artifact_a.get("variable") or artifact_b.get("variable")
    resolved_region_name = region_name or artifact_a.get("region_name") or artifact_b.get("region_name")
    resolved_period_a = period_a or artifact_a.get("period")
    resolved_period_b = period_b or artifact_b.get("period")
    resolved_scenario = scenario or artifact_a.get("scenario") or artifact_b.get("scenario")
    resolved_model = model or artifact_a.get("model") or artifact_b.get("model")

    if not resolved_period_a or not resolved_period_b:
        return _make_failure_artifact(
            warning="Both period_a and period_b must be known for comparison.",
            variable=resolved_variable,
            region_name=resolved_region_name,
            period_a=resolved_period_a,
            period_b=resolved_period_b,
            scenario=resolved_scenario,
            model=resolved_model,
        )

    try:
        comparison_value_column = _choose_value_column(
            artifact_a=artifact_a,
            artifact_b=artifact_b,
            value_column=value_column,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            variable=resolved_variable,
            region_name=resolved_region_name,
            period_a=resolved_period_a,
            period_b=resolved_period_b,
            scenario=resolved_scenario,
            model=resolved_model,
        )

    try:
        gdf_a = _artifact_to_gdf(artifact_a)
        gdf_b = _artifact_to_gdf(artifact_b)
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not convert climate artifacts to GeoDataFrames: {exc}",
            variable=resolved_variable,
            region_name=resolved_region_name,
            period_a=resolved_period_a,
            period_b=resolved_period_b,
            scenario=resolved_scenario,
            model=resolved_model,
        )

    if gdf_a.empty:
        return _make_failure_artifact(
            warning="period_a climate artifact contains no features.",
            variable=resolved_variable,
            region_name=resolved_region_name,
            period_a=resolved_period_a,
            period_b=resolved_period_b,
            scenario=resolved_scenario,
            model=resolved_model,
        )

    if gdf_b.empty:
        return _make_failure_artifact(
            warning="period_b climate artifact contains no features.",
            variable=resolved_variable,
            region_name=resolved_region_name,
            period_a=resolved_period_a,
            period_b=resolved_period_b,
            scenario=resolved_scenario,
            model=resolved_model,
        )

    gdf_a = gdf_a.to_crs("EPSG:4326")
    gdf_b = gdf_b.to_crs("EPSG:4326")

    try:
        result_gdf = _prepare_comparison_frame(
            gdf_a=gdf_a,
            gdf_b=gdf_b,
            value_column=comparison_value_column,
            period_a=str(resolved_period_a),
            period_b=str(resolved_period_b),
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not compare climate periods: {exc}",
            variable=resolved_variable,
            region_name=resolved_region_name,
            period_a=resolved_period_a,
            period_b=resolved_period_b,
            scenario=resolved_scenario,
            model=resolved_model,
        )

    if result_gdf.empty:
        return _make_failure_artifact(
            warning="Climate period comparison produced no matched features.",
            variable=resolved_variable,
            region_name=resolved_region_name,
            period_a=resolved_period_a,
            period_b=resolved_period_b,
            scenario=resolved_scenario,
            model=resolved_model,
        )

    value_a_column = f"{comparison_value_column}_{resolved_period_a}"
    value_b_column = f"{comparison_value_column}_{resolved_period_b}"

    summary = _summarize_change(
        gdf=result_gdf,
        value_a_column=value_a_column,
        value_b_column=value_b_column,
    )

    geojson = json.loads(result_gdf.to_json())

    layer_id = (
        f"{artifact_a.get('layer_id', 'period_a')}"
        f"_vs_"
        f"{artifact_b.get('layer_id', 'period_b')}"
    )

    return {
        "artifact_type": "climate_period_comparison",
        "layer_id": layer_id,
        "variable": resolved_variable,
        "region_name": resolved_region_name,
        "period_a": resolved_period_a,
        "period_b": resolved_period_b,
        "scenario": resolved_scenario,
        "scenario_code": artifact_a.get("scenario_code") or artifact_b.get("scenario_code"),
        "model": resolved_model,
        "variant": artifact_a.get("variant") or artifact_b.get("variant"),
        "geojson": geojson,
        "feature_count": int(len(result_gdf)),
        "bbox": [float(x) for x in result_gdf.total_bounds],
        "crs": "EPSG:4326",
        "value_column": "absolute_change",
        "units": artifact_a.get("units") or artifact_b.get("units"),
        "comparison_columns": {
            "period_a_value_column": value_a_column,
            "period_b_value_column": value_b_column,
            "absolute_change_column": "absolute_change",
            "percent_change_column": "percent_change",
            "change_direction_column": "change_direction",
        },
        "summary": summary,
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "method": "attribute_join_then_period_difference",
            "period_a_artifact": artifact_a.get("provenance", {}),
            "period_b_artifact": artifact_b.get("provenance", {}),
            "period_a_layer_id": artifact_a.get("layer_id"),
            "period_b_layer_id": artifact_b.get("layer_id"),
            "formula": "absolute_change = period_b_value - period_a_value",
        },
    }