from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional

import geopandas as gpd
import numpy as np
import pandas as pd

from .climate import load_climate_projection


def _make_failure_artifact(
    warning: str,
    variable: Optional[str] = None,
    region_name: Optional[str] = None,
    period: Optional[str] = None,
    scenarios: Optional[list[str]] = None,
    model: Optional[str] = None,
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "climate_scenario_comparison_failed",
        "variable": variable,
        "region_name": region_name,
        "period": period,
        "scenarios": scenarios or [],
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
            "method": "compare_climate_scenarios",
        },
    }


def _slugify(value: Any) -> str:
    value = str(value).lower().strip()
    value = value.replace(".", "_")
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


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
    Convert a climate artifact into a GeoDataFrame.
    """
    if not isinstance(input_artifact, dict):
        raise ValueError("input_artifact must be a dictionary.")

    geojson = input_artifact.get("geojson")

    if geojson is None:
        raise ValueError("input_artifact must contain a 'geojson' field.")

    return _geojson_to_gdf(geojson)


def _choose_value_column(
    artifacts: list[Dict[str, Any]],
    value_column: Optional[str],
) -> str:
    """
    Choose the numeric value column to compare across scenarios.
    """
    if value_column:
        return value_column

    artifact_value_columns = [
        artifact.get("value_column")
        for artifact in artifacts
        if artifact.get("value_column")
    ]

    unique_columns = sorted(set(artifact_value_columns))

    if len(unique_columns) == 1:
        return unique_columns[0]

    raise ValueError(
        "Could not infer value_column. Provide value_column explicitly."
    )


def _choose_join_column(gdfs: list[gpd.GeoDataFrame]) -> Optional[str]:
    """
    Choose the best column for matching cells across scenario layers.
    """
    candidate_columns = [
        "cell_id",
        "h3_id",
        "grid_id",
        "feature_id",
    ]

    for column in candidate_columns:
        if all(column in gdf.columns for gdf in gdfs):
            return column

    return None


def _load_scenario_artifacts(
    variable: str,
    region_name: str,
    period: str,
    scenarios: list[str],
    model: Optional[str],
) -> list[Dict[str, Any]]:
    artifacts = []

    for scenario in scenarios:
        artifact = load_climate_projection(
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
        )

        artifacts.append(artifact)

    return artifacts


def _validate_artifacts_loaded(
    artifacts: list[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    for artifact in artifacts:
        if artifact.get("artifact_type") == "climate_layer_load_failed":
            return artifact

    return None


def _scenario_column_name(
    value_column: str,
    artifact: Dict[str, Any],
    fallback_index: int,
) -> str:
    scenario_code = artifact.get("scenario_code")
    scenario = artifact.get("scenario")

    if scenario_code:
        scenario_suffix = _slugify(scenario_code)
    elif scenario:
        scenario_suffix = _slugify(scenario)
    else:
        scenario_suffix = f"scenario_{fallback_index}"

    return f"{value_column}_{scenario_suffix}"


def _prepare_scenario_comparison_frame(
    artifacts: list[Dict[str, Any]],
    value_column: str,
) -> tuple[gpd.GeoDataFrame, dict[str, str]]:
    """
    Join scenario layers and calculate scenario-spread columns.
    """
    gdfs = [_artifact_to_gdf(artifact) for artifact in artifacts]

    for idx, gdf in enumerate(gdfs):
        if gdf.empty:
            raise ValueError(f"Scenario artifact at index {idx} contains no features.")

        if value_column not in gdf.columns:
            scenario = artifacts[idx].get("scenario")
            raise ValueError(
                f"value_column '{value_column}' not found in scenario layer '{scenario}'."
            )

    for gdf in gdfs:
        if gdf.crs is None:
            gdf.set_crs("EPSG:4326", inplace=True)
        else:
            gdf.to_crs("EPSG:4326", inplace=True)

    join_column = _choose_join_column(gdfs)

    scenario_value_columns: dict[str, str] = {}

    if join_column is not None:
        base_artifact = artifacts[0]
        base_gdf = gdfs[0]

        base_scenario_column = _scenario_column_name(
            value_column=value_column,
            artifact=base_artifact,
            fallback_index=0,
        )

        result = base_gdf[[join_column, value_column, "geometry"]].copy()
        result = result.rename(columns={value_column: base_scenario_column})

        scenario_key = (
            base_artifact.get("scenario")
            or base_artifact.get("scenario_code")
            or "scenario_0"
        )
        scenario_value_columns[scenario_key] = base_scenario_column

        for idx, artifact in enumerate(artifacts[1:], start=1):
            gdf = gdfs[idx]

            scenario_column = _scenario_column_name(
                value_column=value_column,
                artifact=artifact,
                fallback_index=idx,
            )

            right = gdf[[join_column, value_column]].copy()
            right = right.rename(columns={value_column: scenario_column})

            result = result.merge(right, on=join_column, how="inner")

            scenario_key = (
                artifact.get("scenario")
                or artifact.get("scenario_code")
                or f"scenario_{idx}"
            )
            scenario_value_columns[scenario_key] = scenario_column

    else:
        lengths = [len(gdf) for gdf in gdfs]

        if len(set(lengths)) != 1:
            raise ValueError(
                "Could not compare scenario layers because no shared join column was found "
                "and the layers have different feature counts."
            )

        result = gdfs[0][["geometry"]].copy()
        result["_comparison_index"] = range(len(result))

        for idx, artifact in enumerate(artifacts):
            gdf = gdfs[idx]

            scenario_column = _scenario_column_name(
                value_column=value_column,
                artifact=artifact,
                fallback_index=idx,
            )

            right = gdf[[value_column]].copy()
            right = right.rename(columns={value_column: scenario_column})
            right["_comparison_index"] = range(len(right))

            result = result.merge(right, on="_comparison_index", how="inner")

            scenario_key = (
                artifact.get("scenario")
                or artifact.get("scenario_code")
                or f"scenario_{idx}"
            )
            scenario_value_columns[scenario_key] = scenario_column

    result_gdf = gpd.GeoDataFrame(
        result,
        geometry="geometry",
        crs="EPSG:4326",
    )

    value_columns = list(scenario_value_columns.values())

    for column in value_columns:
        result_gdf[column] = pd.to_numeric(result_gdf[column], errors="coerce")

    result_gdf["scenario_min"] = result_gdf[value_columns].min(axis=1, skipna=True)
    result_gdf["scenario_max"] = result_gdf[value_columns].max(axis=1, skipna=True)
    result_gdf["scenario_mean"] = result_gdf[value_columns].mean(axis=1, skipna=True)
    result_gdf["scenario_range"] = (
        result_gdf["scenario_max"] - result_gdf["scenario_min"]
    )

    def highest_scenario(row: pd.Series) -> Optional[str]:
        valid_values = row[value_columns].dropna()

        if valid_values.empty:
            return None

        max_column = valid_values.idxmax()

        for scenario_name, column_name in scenario_value_columns.items():
            if column_name == max_column:
                return scenario_name

        return None

    def lowest_scenario(row: pd.Series) -> Optional[str]:
        valid_values = row[value_columns].dropna()

        if valid_values.empty:
            return None

        min_column = valid_values.idxmin()

        for scenario_name, column_name in scenario_value_columns.items():
            if column_name == min_column:
                return scenario_name

        return None

    result_gdf["highest_scenario"] = result_gdf.apply(highest_scenario, axis=1)
    result_gdf["lowest_scenario"] = result_gdf.apply(lowest_scenario, axis=1)

    return result_gdf, scenario_value_columns


def _summarize_scenario_comparison(
    gdf: gpd.GeoDataFrame,
    scenario_value_columns: dict[str, str],
) -> Dict[str, Any]:
    if gdf.empty:
        return {}

    scenario_means = {}

    for scenario_name, column_name in scenario_value_columns.items():
        scenario_means[scenario_name] = float(gdf[column_name].mean(skipna=True))

    return {
        "feature_count": int(len(gdf)),
        "scenario_means": scenario_means,
        "scenario_range_mean": float(gdf["scenario_range"].mean(skipna=True)),
        "scenario_range_min": float(gdf["scenario_range"].min(skipna=True)),
        "scenario_range_max": float(gdf["scenario_range"].max(skipna=True)),
        "scenario_range_p90": float(gdf["scenario_range"].quantile(0.9)),
        "scenario_mean_mean": float(gdf["scenario_mean"].mean(skipna=True)),
    }


def compare_climate_scenarios(
    variable: Optional[str] = None,
    region_name: Optional[str] = None,
    period: Optional[str] = None,
    scenarios: Optional[list[str]] = None,
    model: Optional[str] = None,
    climate_artifacts: Optional[list[Dict[str, Any]]] = None,
    value_column: Optional[str] = None,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Compare the same climate variable across multiple scenarios.

    This wrapper can be used in two ways:

    1. Load layers internally:
        compare_climate_scenarios(
            variable="extreme_heat_days",
            region_name="Fiji",
            period="2050s",
            scenarios=["SSP2-4.5", "SSP5-8.5"],
            model="ACCESS-CM2"
        )

    2. Compare already-loaded artifacts:
        compare_climate_scenarios(
            climate_artifacts=[layer_ssp245, layer_ssp585]
        )

    Returns:
        {
            "artifact_type": "climate_scenario_comparison",
            "geojson": {...},
            "value_column": "scenario_range",
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
        if climate_artifacts is not None:
            artifacts = climate_artifacts
        else:
            if not variable:
                raise ValueError(
                    "variable is required when climate_artifacts are not provided."
                )

            if not region_name:
                raise ValueError(
                    "region_name is required when climate_artifacts are not provided."
                )

            if not period:
                raise ValueError(
                    "period is required when climate_artifacts are not provided."
                )

            if not scenarios or len(scenarios) < 2:
                raise ValueError(
                    "At least two scenarios are required when climate_artifacts are not provided."
                )

            artifacts = _load_scenario_artifacts(
                variable=variable,
                region_name=region_name,
                period=period,
                scenarios=scenarios,
                model=model,
            )

    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not load climate scenario layers: {exc}",
            variable=variable,
            region_name=region_name,
            period=period,
            scenarios=scenarios,
            model=model,
        )

    if not artifacts or len(artifacts) < 2:
        return _make_failure_artifact(
            warning="At least two climate artifacts are required for scenario comparison.",
            variable=variable,
            region_name=region_name,
            period=period,
            scenarios=scenarios,
            model=model,
        )

    failed_artifact = _validate_artifacts_loaded(artifacts)

    if failed_artifact is not None:
        return _make_failure_artifact(
            warning="Could not load one of the scenario climate layers.",
            variable=variable,
            region_name=region_name,
            period=period,
            scenarios=scenarios,
            model=model,
            suggestions=failed_artifact.get("suggestions", []),
        )

    resolved_variable = variable or artifacts[0].get("variable")
    resolved_region_name = region_name or artifacts[0].get("region_name")
    resolved_period = period or artifacts[0].get("period")
    resolved_model = model or artifacts[0].get("model")

    resolved_scenarios = [
        artifact.get("scenario")
        or artifact.get("scenario_code")
        or f"scenario_{idx}"
        for idx, artifact in enumerate(artifacts)
    ]

    try:
        comparison_value_column = _choose_value_column(
            artifacts=artifacts,
            value_column=value_column,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            variable=resolved_variable,
            region_name=resolved_region_name,
            period=resolved_period,
            scenarios=resolved_scenarios,
            model=resolved_model,
        )

    try:
        result_gdf, scenario_value_columns = _prepare_scenario_comparison_frame(
            artifacts=artifacts,
            value_column=comparison_value_column,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not compare climate scenarios: {exc}",
            variable=resolved_variable,
            region_name=resolved_region_name,
            period=resolved_period,
            scenarios=resolved_scenarios,
            model=resolved_model,
        )

    if result_gdf.empty:
        return _make_failure_artifact(
            warning="Climate scenario comparison produced no matched features.",
            variable=resolved_variable,
            region_name=resolved_region_name,
            period=resolved_period,
            scenarios=resolved_scenarios,
            model=resolved_model,
        )

    summary = _summarize_scenario_comparison(
        gdf=result_gdf,
        scenario_value_columns=scenario_value_columns,
    )

    geojson = json.loads(result_gdf.to_json())

    layer_ids = [
        artifact.get("layer_id", f"scenario_{idx}")
        for idx, artifact in enumerate(artifacts)
    ]

    return {
        "artifact_type": "climate_scenario_comparison",
        "layer_id": "_vs_".join(layer_ids),
        "variable": resolved_variable,
        "region_name": resolved_region_name,
        "period": resolved_period,
        "scenarios": resolved_scenarios,
        "model": resolved_model,
        "variant": artifacts[0].get("variant"),
        "geojson": geojson,
        "feature_count": int(len(result_gdf)),
        "bbox": [float(x) for x in result_gdf.total_bounds],
        "crs": "EPSG:4326",
        "value_column": "scenario_range",
        "units": artifacts[0].get("units"),
        "comparison_columns": {
            "scenario_value_columns": scenario_value_columns,
            "scenario_min_column": "scenario_min",
            "scenario_max_column": "scenario_max",
            "scenario_mean_column": "scenario_mean",
            "scenario_range_column": "scenario_range",
            "highest_scenario_column": "highest_scenario",
            "lowest_scenario_column": "lowest_scenario",
        },
        "summary": summary,
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "method": "attribute_join_then_scenario_spread",
            "scenario_layer_ids": layer_ids,
            "scenario_artifacts": [
                artifact.get("provenance", {}) for artifact in artifacts
            ],
            "formula": "scenario_range = max(scenario_values) - min(scenario_values)",
        },
    }