from __future__ import annotations

import json
from typing import Any, Dict, Optional

import geopandas as gpd
import pandas as pd

from .climate import load_climate_projection
from .spatial import clip_to_region as clip_artifact_to_region


DIRECTION_ALIASES = {
    "highest": "highest",
    "high": "highest",
    "top": "highest",
    "maximum": "highest",
    "max": "highest",
    "largest": "highest",
    "hottest": "highest",
    "worst": "highest",
    "most": "highest",
    "lowest": "lowest",
    "low": "lowest",
    "bottom": "lowest",
    "minimum": "lowest",
    "min": "lowest",
    "smallest": "lowest",
    "least": "lowest",
}

SELECTION_METHOD_ALIASES = {
    "top_n": "top_n",
    "rank": "top_n",
    "ranked": "top_n",
    "largest_n": "top_n",
    "smallest_n": "top_n",
    "n": "top_n",
    "percentile": "percentile",
    "quantile": "percentile",
    "top_percentile": "percentile",
    "bottom_percentile": "percentile",
    "above_percentile": "percentile",
    "below_percentile": "percentile",
}


def _make_failure_artifact(
    warning: str,
    variable: Optional[str] = None,
    region_name: Optional[str] = None,
    period: Optional[str] = None,
    scenario: Optional[str] = None,
    model: Optional[str] = None,
    value_column: Optional[str] = None,
    direction: str = "highest",
    selection_method: str = "top_n",
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "extreme_locations_failed",
        "variable": variable,
        "region_name": region_name,
        "period": period,
        "scenario": scenario,
        "model": model,
        "value_column": value_column,
        "direction": direction,
        "selection_method": selection_method,
        "geojson": None,
        "feature_count": 0,
        "input_feature_count": 0,
        "valid_count": 0,
        "missing_count": 0,
        "bbox": None,
        "crs": "EPSG:4326",
        "summary": None,
        "table": [],
        "warnings": [warning],
        "suggestions": suggestions or [],
        "provenance": {
            "method": "find_extreme_locations",
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
    Convert a spatial/climate/risk artifact into a GeoDataFrame.
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
    Use a provided artifact if available.
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


def _normalize_direction(direction: str) -> str:
    cleaned = str(direction or "highest").lower().strip()

    if cleaned not in DIRECTION_ALIASES:
        raise ValueError(
            f"Unsupported direction '{direction}'. "
            "Supported examples: highest, lowest, top, bottom, max, min."
        )

    return DIRECTION_ALIASES[cleaned]


def _normalize_selection_method(selection_method: Optional[str], percentile: Optional[float]) -> str:
    if selection_method is None:
        return "percentile" if percentile is not None else "top_n"

    cleaned = str(selection_method).lower().strip()

    if cleaned not in SELECTION_METHOD_ALIASES:
        raise ValueError(
            f"Unsupported selection_method '{selection_method}'. "
            "Supported examples: top_n, percentile."
        )

    return SELECTION_METHOD_ALIASES[cleaned]


def _choose_value_column(
    input_artifact: Dict[str, Any],
    gdf: gpd.GeoDataFrame,
    value_column: Optional[str],
) -> str:
    """
    Choose the numeric column used to rank extreme locations.
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


def _normalize_top_n(top_n: Optional[int], valid_count: int) -> int:
    if top_n is None:
        top_n = 10

    try:
        top_n_int = int(top_n)
    except Exception:
        raise ValueError(f"top_n must be an integer. Received: {top_n}")

    if top_n_int <= 0:
        raise ValueError("top_n must be greater than 0.")

    return min(top_n_int, valid_count)


def _normalize_percentile(percentile: Optional[float]) -> tuple[float, float]:
    """
    Return both display percentile and probability.

    Accepts either:
    - 95
    - 0.95
    """
    if percentile is None:
        percentile = 95.0

    try:
        percentile_float = float(percentile)
    except Exception:
        raise ValueError(f"percentile must be numeric. Received: {percentile}")

    if 0 < percentile_float <= 1:
        probability = percentile_float
        display_percentile = percentile_float * 100.0
    elif 1 < percentile_float < 100:
        probability = percentile_float / 100.0
        display_percentile = percentile_float
    else:
        raise ValueError(
            "percentile must be between 0 and 100, excluding 0 and 100. "
            "Examples: 95 or 0.95."
        )

    return display_percentile, probability


def _add_rank_columns(
    gdf: gpd.GeoDataFrame,
    value_column: str,
    direction: str,
) -> gpd.GeoDataFrame:
    result = gdf.copy()

    numeric_values = pd.to_numeric(result[value_column], errors="coerce")
    result["_numeric_extreme_value"] = numeric_values

    ascending = direction == "lowest"

    result = result.sort_values(
        by=["_numeric_extreme_value"],
        ascending=ascending,
        na_position="last",
    ).copy()

    result["extreme_rank"] = range(1, len(result) + 1)

    if direction == "highest":
        result["extreme_score"] = result["_numeric_extreme_value"]
    else:
        result["extreme_score"] = -result["_numeric_extreme_value"]

    result["extreme_direction"] = direction

    return result


def _select_extreme_locations(
    gdf: gpd.GeoDataFrame,
    value_column: str,
    direction: str,
    selection_method: str,
    top_n: Optional[int],
    percentile: Optional[float],
) -> tuple[gpd.GeoDataFrame, Dict[str, Any]]:
    """
    Select extreme features using either top_n ranking or percentile filtering.
    """
    numeric_values = pd.to_numeric(gdf[value_column], errors="coerce")
    valid_gdf = gdf[numeric_values.notna()].copy()

    if valid_gdf.empty:
        raise ValueError(
            f"value_column '{value_column}' contains no valid numeric values."
        )

    ranked_gdf = _add_rank_columns(
        gdf=valid_gdf,
        value_column=value_column,
        direction=direction,
    )

    metadata: Dict[str, Any] = {
        "selection_method": selection_method,
    }

    if selection_method == "top_n":
        selected_n = _normalize_top_n(top_n=top_n, valid_count=len(ranked_gdf))
        selected = ranked_gdf.head(selected_n).copy()

        metadata.update(
            {
                "top_n": selected_n,
                "percentile": None,
                "percentile_threshold": None,
            }
        )

        return selected, metadata

    if selection_method == "percentile":
        display_percentile, probability = _normalize_percentile(percentile)

        if direction == "highest":
            percentile_threshold = valid_gdf[value_column].quantile(probability)
            selected = ranked_gdf[
                ranked_gdf["_numeric_extreme_value"] >= percentile_threshold
            ].copy()
        else:
            lower_probability = 1.0 - probability
            percentile_threshold = valid_gdf[value_column].quantile(lower_probability)
            selected = ranked_gdf[
                ranked_gdf["_numeric_extreme_value"] <= percentile_threshold
            ].copy()

        metadata.update(
            {
                "top_n": None,
                "percentile": display_percentile,
                "percentile_threshold": _safe_float(percentile_threshold),
            }
        )

        return selected, metadata

    raise ValueError(f"Unsupported selection_method '{selection_method}'.")


def _make_extreme_table(
    output_gdf: gpd.GeoDataFrame,
    value_column: str,
    max_rows: int = 50,
) -> list[Dict[str, Any]]:
    table = []

    for _, row in output_gdf.head(max_rows).iterrows():
        centroid = row.geometry.centroid if row.geometry is not None else None

        table.append(
            {
                "rank": int(row["extreme_rank"]),
                "value": _safe_float(row[value_column]),
                "extreme_score": _safe_float(row["extreme_score"]),
                "longitude": _safe_float(centroid.x) if centroid is not None else None,
                "latitude": _safe_float(centroid.y) if centroid is not None else None,
            }
        )

    return table


def _summarize_extremes(
    input_gdf: gpd.GeoDataFrame,
    output_gdf: gpd.GeoDataFrame,
    value_column: str,
    direction: str,
    selection_metadata: Dict[str, Any],
) -> Dict[str, Any]:
    numeric_values = pd.to_numeric(input_gdf[value_column], errors="coerce")
    valid_values = numeric_values.dropna()
    selected_values = pd.to_numeric(output_gdf[value_column], errors="coerce")

    return {
        "input_feature_count": int(len(input_gdf)),
        "output_feature_count": int(len(output_gdf)),
        "valid_count": int(valid_values.count()),
        "missing_count": int(numeric_values.isna().sum()),
        "direction": direction,
        "selection_method": selection_metadata.get("selection_method"),
        "top_n": selection_metadata.get("top_n"),
        "percentile": selection_metadata.get("percentile"),
        "percentile_threshold": selection_metadata.get("percentile_threshold"),
        "input_min": _safe_float(valid_values.min()),
        "input_max": _safe_float(valid_values.max()),
        "input_mean": _safe_float(valid_values.mean()),
        "selected_min": _safe_float(selected_values.min()),
        "selected_max": _safe_float(selected_values.max()),
        "selected_mean": _safe_float(selected_values.mean()),
    }


def find_extreme_locations(
    input_artifact: Optional[Dict[str, Any]] = None,
    variable: Optional[str] = None,
    region_name: Optional[str] = None,
    period: Optional[str] = None,
    scenario: Optional[str] = None,
    model: Optional[str] = None,
    value_column: Optional[str] = None,
    direction: str = "highest",
    selection_method: Optional[str] = None,
    top_n: Optional[int] = 10,
    percentile: Optional[float] = None,
    clip_to_region: bool = True,
    region_artifact: Optional[Dict[str, Any]] = None,
    include_full_input: bool = False,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Find the most extreme locations in a climate, hazard, or risk layer.

    This wrapper can be used in two ways:

    1. Use an already-loaded or clipped artifact:
        find_extreme_locations(
            input_artifact=clipped_heat_layer,
            value_column="extreme_heat_days_mean",
            direction="highest",
            top_n=10
        )

    2. Load and analyze internally:
        find_extreme_locations(
            variable="extreme_heat_days",
            region_name="Fiji",
            period="2050s",
            scenario="SSP2-4.5",
            model="ACCESS-CM2",
            direction="highest",
            selection_method="percentile",
            percentile=95
        )

    Typical chain:
        resolve_region("Fiji")
        -> load_climate_projection(...)
        -> clip_to_region(...)
        -> find_extreme_locations(...)

    Returns:
        {
            "artifact_type": "extreme_locations_layer",
            "geojson": {...},
            "value_column": "extreme_score",
            "summary": {...},
            "table": [
                {"rank": 1, "value": ..., "longitude": ..., "latitude": ...}
            ],
            "warnings": [],
            "provenance": {...}
        }
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    try:
        normalized_direction = _normalize_direction(direction)
        normalized_selection_method = _normalize_selection_method(
            selection_method=selection_method,
            percentile=percentile,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
            value_column=value_column,
            direction=direction,
            selection_method=selection_method or "top_n",
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
            warning=f"Could not load layer for extreme-location search: {exc}",
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
            value_column=value_column,
            direction=normalized_direction,
            selection_method=normalized_selection_method,
        )

    if artifact.get("artifact_type") == "climate_layer_load_failed":
        return _make_failure_artifact(
            warning="Could not load layer for extreme-location search.",
            variable=variable,
            region_name=region_name,
            period=period,
            scenario=scenario,
            model=model,
            value_column=value_column,
            direction=normalized_direction,
            selection_method=normalized_selection_method,
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
                warning="Could not clip layer before extreme-location search.",
                variable=variable or artifact.get("variable"),
                region_name=resolved_region_name,
                period=period or artifact.get("period"),
                scenario=scenario or artifact.get("scenario"),
                model=model or artifact.get("model"),
                value_column=value_column or artifact.get("value_column"),
                direction=normalized_direction,
                selection_method=normalized_selection_method,
                suggestions=clipped.get("suggestions", []),
            )

        artifact_to_analyze = clipped
    else:
        artifact_to_analyze = artifact

    try:
        gdf = _artifact_to_gdf(artifact_to_analyze)
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not convert input artifact to GeoDataFrame: {exc}",
            variable=variable or artifact.get("variable"),
            region_name=resolved_region_name,
            period=period or artifact.get("period"),
            scenario=scenario or artifact.get("scenario"),
            model=model or artifact.get("model"),
            value_column=value_column or artifact.get("value_column"),
            direction=normalized_direction,
            selection_method=normalized_selection_method,
        )

    if gdf.empty:
        return _make_failure_artifact(
            warning="Input artifact contains no features to rank.",
            variable=variable or artifact.get("variable"),
            region_name=resolved_region_name,
            period=period or artifact.get("period"),
            scenario=scenario or artifact.get("scenario"),
            model=model or artifact.get("model"),
            value_column=value_column or artifact.get("value_column"),
            direction=normalized_direction,
            selection_method=normalized_selection_method,
        )

    try:
        chosen_value_column = _choose_value_column(
            input_artifact=artifact_to_analyze,
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
            direction=normalized_direction,
            selection_method=normalized_selection_method,
        )

    numeric_values = pd.to_numeric(gdf[chosen_value_column], errors="coerce")
    missing_count = int(numeric_values.isna().sum())

    if missing_count > 0:
        warnings.append(
            f"{missing_count} features had missing or non-numeric values in "
            f"'{chosen_value_column}' and were excluded from extreme-location ranking."
        )

    try:
        output_gdf, selection_metadata = _select_extreme_locations(
            gdf=gdf,
            value_column=chosen_value_column,
            direction=normalized_direction,
            selection_method=normalized_selection_method,
            top_n=top_n,
            percentile=percentile,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not find extreme locations: {exc}",
            variable=variable or artifact.get("variable"),
            region_name=resolved_region_name,
            period=period or artifact.get("period"),
            scenario=scenario or artifact.get("scenario"),
            model=model or artifact.get("model"),
            value_column=chosen_value_column,
            direction=normalized_direction,
            selection_method=normalized_selection_method,
        )

    if output_gdf.empty:
        warnings.append("No extreme locations matched the requested criteria.")

        bbox = None
        geojson = {
            "type": "FeatureCollection",
            "features": [],
        }
    else:
        bbox = [float(x) for x in output_gdf.total_bounds]
        geojson = json.loads(
            output_gdf.drop(columns=["_numeric_extreme_value"]).to_json()
        )

    summary = _summarize_extremes(
        input_gdf=gdf,
        output_gdf=output_gdf,
        value_column=chosen_value_column,
        direction=normalized_direction,
        selection_metadata=selection_metadata,
    )

    table = _make_extreme_table(
        output_gdf=output_gdf,
        value_column=chosen_value_column,
    )

    full_input_geojson = None

    if include_full_input:
        full_ranked_input = _add_rank_columns(
            gdf=gdf[pd.to_numeric(gdf[chosen_value_column], errors="coerce").notna()].copy(),
            value_column=chosen_value_column,
            direction=normalized_direction,
        )

        full_input_geojson = json.loads(
            full_ranked_input.drop(columns=["_numeric_extreme_value"]).to_json()
        )

    return {
        "artifact_type": "extreme_locations_layer",
        "input_artifact_type": artifact_to_analyze.get("artifact_type"),
        "input_layer_id": artifact_to_analyze.get("layer_id"),
        "layer_id": (
            f"{artifact_to_analyze.get('layer_id', 'layer')}_"
            f"{normalized_direction}_{selection_metadata.get('selection_method')}"
        ),
        "variable": variable or artifact_to_analyze.get("variable"),
        "source_variable": artifact_to_analyze.get("source_variable"),
        "region_name": resolved_region_name or artifact_to_analyze.get("region_name"),
        "period": period or artifact_to_analyze.get("period"),
        "start_year": artifact_to_analyze.get("start_year"),
        "end_year": artifact_to_analyze.get("end_year"),
        "scenario": scenario or artifact_to_analyze.get("scenario"),
        "scenario_code": artifact_to_analyze.get("scenario_code"),
        "model": model or artifact_to_analyze.get("model"),
        "variant": artifact_to_analyze.get("variant"),
        "value_column": "extreme_score",
        "source_value_column": chosen_value_column,
        "units": artifact_to_analyze.get("units"),
        "direction": normalized_direction,
        "selection_method": selection_metadata.get("selection_method"),
        "top_n": selection_metadata.get("top_n"),
        "percentile": selection_metadata.get("percentile"),
        "percentile_threshold": selection_metadata.get("percentile_threshold"),
        "geojson": geojson,
        "full_input_geojson": full_input_geojson,
        "feature_count": int(len(output_gdf)),
        "input_feature_count": int(len(gdf)),
        "valid_count": int(pd.to_numeric(gdf[chosen_value_column], errors="coerce").notna().sum()),
        "missing_count": missing_count,
        "bbox": bbox,
        "crs": "EPSG:4326",
        "summary": summary,
        "table": table,
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "method": "sort_or_percentile_filter",
            "clip_to_region": clip_to_region,
            "parent_artifact_provenance": artifact_to_analyze.get("provenance", {}),
        },
    }