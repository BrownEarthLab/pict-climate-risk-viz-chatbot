from __future__ import annotations

import json
from typing import Any, Dict, Optional

import geopandas as gpd
import pandas as pd


REGION_NAME_CANDIDATES = [
    "admin_name",
    "region_name",
    "name",
    "NAME",
    "Name",
    "district",
    "District",
    "province",
    "Province",
    "island",
    "Island",
    "municipality",
    "Municipality",
]

REGION_ID_CANDIDATES = [
    "admin_id",
    "region_id",
    "id",
    "ID",
    "gid",
    "GID",
    "adm_id",
    "ADM_ID",
    "iso_code",
    "ISO_CODE",
]

DIRECTION_ALIASES = {
    "highest": "highest",
    "high": "highest",
    "top": "highest",
    "maximum": "highest",
    "max": "highest",
    "largest": "highest",
    "worst": "highest",
    "most": "highest",
    "lowest": "lowest",
    "low": "lowest",
    "bottom": "lowest",
    "minimum": "lowest",
    "min": "lowest",
    "smallest": "lowest",
    "best": "lowest",
    "least": "lowest",
}


def _make_failure_artifact(
    warning: str,
    value_column: Optional[str] = None,
    source_value_column: Optional[str] = None,
    region_name_column: Optional[str] = None,
    region_id_column: Optional[str] = None,
    direction: str = "highest",
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "rank_regions_failed",
        "value_column": value_column,
        "source_value_column": source_value_column or value_column,
        "region_name_column": region_name_column,
        "region_id_column": region_id_column,
        "direction": direction,
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
            "method": "rank_regions",
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
    Convert a region-level spatial artifact into a GeoDataFrame.
    """
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
    """
    Choose the numeric column used for ranking.
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


def _normalize_direction(direction: str) -> str:
    cleaned = str(direction or "highest").lower().strip()

    if cleaned not in DIRECTION_ALIASES:
        raise ValueError(
            f"Unsupported direction '{direction}'. "
            "Supported examples: highest, lowest, top, bottom, max, min."
        )

    return DIRECTION_ALIASES[cleaned]


def _normalize_top_n(top_n: Optional[int], valid_count: int) -> Optional[int]:
    if top_n is None:
        return None

    try:
        top_n_int = int(top_n)
    except Exception:
        raise ValueError(f"top_n must be an integer. Received: {top_n}")

    if top_n_int <= 0:
        raise ValueError("top_n must be greater than 0.")

    return min(top_n_int, valid_count)


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None

    if pd.isna(value):
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> Optional[int]:
    if value is None:
        return None

    if pd.isna(value):
        return None

    return int(value)


def _add_rank_columns(
    gdf: gpd.GeoDataFrame,
    value_column: str,
    direction: str,
) -> gpd.GeoDataFrame:
    """
    Add rank columns to a valid numeric GeoDataFrame.
    """
    result = gdf.copy()

    result["_numeric_rank_value"] = pd.to_numeric(
        result[value_column],
        errors="coerce",
    )

    ascending = direction == "lowest"

    result = result.sort_values(
        by=["_numeric_rank_value"],
        ascending=ascending,
        na_position="last",
    ).copy()

    result["region_rank"] = range(1, len(result) + 1)

    if len(result) == 1:
        result["rank_percentile"] = 1.0
    else:
        result["rank_percentile"] = 1.0 - (
            (result["region_rank"] - 1) / (len(result) - 1)
        )

    if direction == "highest":
        result["rank_score"] = result["_numeric_rank_value"]
    else:
        result["rank_score"] = -result["_numeric_rank_value"]

    result["rank_direction"] = direction

    return result


def _make_rank_category(rank: int, valid_count: int) -> str:
    if valid_count <= 0:
        return "unranked"

    fraction = rank / valid_count

    if fraction <= 0.1:
        return "top_10_percent"

    if fraction <= 0.25:
        return "top_25_percent"

    if fraction <= 0.5:
        return "top_50_percent"

    return "lower_50_percent"


def _rank_regions_gdf(
    gdf: gpd.GeoDataFrame,
    value_column: str,
    direction: str,
    top_n: Optional[int],
    include_all_regions: bool,
    include_missing_regions: bool,
) -> tuple[gpd.GeoDataFrame, int, int, Optional[int]]:
    """
    Rank regions and optionally return only the top N.
    """
    numeric_values = pd.to_numeric(gdf[value_column], errors="coerce")

    valid_gdf = gdf[numeric_values.notna()].copy()
    missing_gdf = gdf[numeric_values.isna()].copy()

    valid_count = int(len(valid_gdf))
    missing_count = int(len(missing_gdf))

    if valid_gdf.empty:
        raise ValueError(f"value_column '{value_column}' contains no valid numeric values.")

    ranked_valid = _add_rank_columns(
        gdf=valid_gdf,
        value_column=value_column,
        direction=direction,
    )

    ranked_valid["rank_category"] = ranked_valid["region_rank"].apply(
        lambda rank: _make_rank_category(int(rank), valid_count)
    )

    selected_top_n = _normalize_top_n(
        top_n=top_n,
        valid_count=valid_count,
    )

    if include_all_regions:
        output_gdf = ranked_valid.copy()
    elif selected_top_n is not None:
        output_gdf = ranked_valid.head(selected_top_n).copy()
    else:
        output_gdf = ranked_valid.copy()

    if include_missing_regions and not missing_gdf.empty:
        missing_gdf = missing_gdf.copy()

        # Use pandas nullable dtypes before concatenation to avoid FutureWarning.
        output_gdf["_numeric_rank_value"] = output_gdf["_numeric_rank_value"].astype("Float64")
        output_gdf["region_rank"] = output_gdf["region_rank"].astype("Int64")
        output_gdf["rank_percentile"] = output_gdf["rank_percentile"].astype("Float64")
        output_gdf["rank_score"] = output_gdf["rank_score"].astype("Float64")

        missing_gdf["_numeric_rank_value"] = pd.Series(
            pd.NA,
            index=missing_gdf.index,
            dtype="Float64",
        )
        missing_gdf["region_rank"] = pd.Series(
            pd.NA,
            index=missing_gdf.index,
            dtype="Int64",
        )
        missing_gdf["rank_percentile"] = pd.Series(
            pd.NA,
            index=missing_gdf.index,
            dtype="Float64",
        )
        missing_gdf["rank_score"] = pd.Series(
            pd.NA,
            index=missing_gdf.index,
            dtype="Float64",
        )
        missing_gdf["rank_direction"] = direction
        missing_gdf["rank_category"] = "unranked_missing_value"

        missing_gdf = missing_gdf.reindex(columns=output_gdf.columns)

        output_gdf = pd.concat(
            [output_gdf, missing_gdf],
            ignore_index=True,
        )

    return output_gdf, valid_count, missing_count, selected_top_n


def _make_table(
    ranked_gdf: gpd.GeoDataFrame,
    value_column: str,
    region_name_column: Optional[str],
    region_id_column: Optional[str],
    max_rows: int = 200,
) -> list[Dict[str, Any]]:
    table = []

    for _, row in ranked_gdf.head(max_rows).iterrows():
        item = {
            "rank": _safe_int(row.get("region_rank")),
            "value": _safe_float(row.get(value_column)),
            "rank_score": _safe_float(row.get("rank_score")),
            "rank_percentile": _safe_float(row.get("rank_percentile")),
            "rank_category": row.get("rank_category"),
            "source_value_column": value_column,
        }

        if region_name_column:
            item["region_name"] = row.get(region_name_column)

        if region_id_column:
            item["region_id"] = row.get(region_id_column)

        table.append(item)

    return table


def _summarize_ranking(
    input_gdf: gpd.GeoDataFrame,
    output_gdf: gpd.GeoDataFrame,
    value_column: str,
    direction: str,
    valid_count: int,
    missing_count: int,
    top_n: Optional[int],
    include_all_regions: bool,
) -> Dict[str, Any]:
    numeric_values = pd.to_numeric(input_gdf[value_column], errors="coerce")
    valid_values = numeric_values.dropna()
    output_values = pd.to_numeric(output_gdf[value_column], errors="coerce")

    return {
        "input_feature_count": int(len(input_gdf)),
        "output_feature_count": int(len(output_gdf)),
        "valid_count": valid_count,
        "missing_count": missing_count,
        "direction": direction,
        "top_n": top_n,
        "include_all_regions": include_all_regions,
        "source_value_column": value_column,
        "input_min": _safe_float(valid_values.min()),
        "input_max": _safe_float(valid_values.max()),
        "input_mean": _safe_float(valid_values.mean()),
        "output_min": _safe_float(output_values.min()),
        "output_max": _safe_float(output_values.max()),
        "output_mean": _safe_float(output_values.mean()),
    }


def rank_regions(
    input_artifact: Dict[str, Any],
    value_column: Optional[str] = None,
    region_name_column: Optional[str] = None,
    region_id_column: Optional[str] = None,
    direction: str = "highest",
    top_n: Optional[int] = 10,
    include_all_regions: bool = False,
    include_missing_regions: bool = False,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Rank administrative regions by a numeric value.

    Typical chain:
        aggregate_by_admin_region(...)
        -> rank_regions(...)

    Example:
        rank_regions(
            input_artifact=admin_aggregation_layer,
            value_column="extreme_heat_days_mean_mean",
            region_name_column="admin_name",
            direction="highest",
            top_n=10
        )

    Returns:
        {
            "artifact_type": "ranked_regions_layer",
            "geojson": {...},
            "value_column": "rank_score",
            "table": [
                {
                    "rank": 1,
                    "region_name": "...",
                    "value": ...
                }
            ],
            "summary": {...}
        }
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    try:
        normalized_direction = _normalize_direction(direction)
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            value_column=value_column,
            source_value_column=value_column,
            region_name_column=region_name_column,
            region_id_column=region_id_column,
            direction=direction,
        )

    warnings: list[str] = []

    try:
        gdf = _artifact_to_gdf(input_artifact)
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not convert input artifact to GeoDataFrame: {exc}",
            value_column=value_column,
            source_value_column=value_column,
            region_name_column=region_name_column,
            region_id_column=region_id_column,
            direction=normalized_direction,
        )

    if gdf.empty:
        return _make_failure_artifact(
            warning="Input artifact contains no regions to rank.",
            value_column=value_column or input_artifact.get("value_column"),
            source_value_column=value_column or input_artifact.get("value_column"),
            region_name_column=region_name_column,
            region_id_column=region_id_column,
            direction=normalized_direction,
        )

    try:
        chosen_value_column = _choose_value_column(
            input_artifact=input_artifact,
            gdf=gdf,
            value_column=value_column,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            value_column=value_column,
            source_value_column=value_column,
            region_name_column=region_name_column,
            region_id_column=region_id_column,
            direction=normalized_direction,
        )

    try:
        resolved_region_name_column = _infer_column(
            gdf=gdf,
            explicit_column=region_name_column,
            candidates=REGION_NAME_CANDIDATES,
            column_role="region_name",
        )

        resolved_region_id_column = _infer_column(
            gdf=gdf,
            explicit_column=region_id_column,
            candidates=REGION_ID_CANDIDATES,
            column_role="region_id",
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            value_column="rank_score",
            source_value_column=chosen_value_column,
            region_name_column=region_name_column,
            region_id_column=region_id_column,
            direction=normalized_direction,
        )

    numeric_values = pd.to_numeric(gdf[chosen_value_column], errors="coerce")
    missing_count = int(numeric_values.isna().sum())

    if missing_count > 0:
        warnings.append(
            f"{missing_count} regions had missing or non-numeric values in "
            f"'{chosen_value_column}' and were excluded from ranking."
        )

    try:
        output_gdf, valid_count, missing_count, selected_top_n = _rank_regions_gdf(
            gdf=gdf,
            value_column=chosen_value_column,
            direction=normalized_direction,
            top_n=top_n,
            include_all_regions=include_all_regions,
            include_missing_regions=include_missing_regions,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not rank regions: {exc}",
            value_column="rank_score",
            source_value_column=chosen_value_column,
            region_name_column=resolved_region_name_column,
            region_id_column=resolved_region_id_column,
            direction=normalized_direction,
        )

    if output_gdf.empty:
        return _make_failure_artifact(
            warning="Ranking produced no output regions.",
            value_column="rank_score",
            source_value_column=chosen_value_column,
            region_name_column=resolved_region_name_column,
            region_id_column=resolved_region_id_column,
            direction=normalized_direction,
        )

    output_gdf = output_gdf.drop(columns=["_numeric_rank_value"], errors="ignore")

    summary = _summarize_ranking(
        input_gdf=gdf,
        output_gdf=output_gdf,
        value_column=chosen_value_column,
        direction=normalized_direction,
        valid_count=valid_count,
        missing_count=missing_count,
        top_n=selected_top_n,
        include_all_regions=include_all_regions,
    )

    geojson = json.loads(output_gdf.to_json())

    return {
        "artifact_type": "ranked_regions_layer",
        "input_artifact_type": input_artifact.get("artifact_type"),
        "input_layer_id": input_artifact.get("layer_id"),
        "layer_id": f"{input_artifact.get('layer_id', 'layer')}_ranked_regions",
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
        "admin_level": input_artifact.get("admin_level"),
        "region_name_column": resolved_region_name_column,
        "region_id_column": resolved_region_id_column,
        "value_column": "rank_score",
        "source_value_column": chosen_value_column,
        "rank_column": "region_rank",
        "rank_percentile_column": "rank_percentile",
        "rank_category_column": "rank_category",
        "units": input_artifact.get("units"),
        "direction": normalized_direction,
        "top_n": selected_top_n,
        "include_all_regions": include_all_regions,
        "include_missing_regions": include_missing_regions,
        "geojson": geojson,
        "feature_count": int(len(output_gdf)),
        "input_feature_count": int(len(gdf)),
        "valid_count": valid_count,
        "missing_count": missing_count,
        "bbox": [float(x) for x in output_gdf.total_bounds],
        "crs": "EPSG:4326",
        "summary": summary,
        "table": _make_table(
            ranked_gdf=output_gdf,
            value_column=chosen_value_column,
            region_name_column=resolved_region_name_column,
            region_id_column=resolved_region_id_column,
        ),
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "method": "sort_regions_by_numeric_value",
            "parent_artifact_provenance": input_artifact.get("provenance", {}),
        },
    }