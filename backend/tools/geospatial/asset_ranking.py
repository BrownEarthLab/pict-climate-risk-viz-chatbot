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

DEFAULT_RANKING_COLUMN_CANDIDATES = [
    "exposure_difference",
    "sampled_hazard_value",
    "hazard_value",
    "risk_score",
    "exposure_score",
]


DIRECTION_ALIASES = {
    "highest": "highest",
    "top": "highest",
    "max": "highest",
    "maximum": "highest",
    "most": "highest",
    "worst": "highest",
    "greatest": "highest",
    "descending": "highest",
    "lowest": "lowest",
    "bottom": "lowest",
    "min": "lowest",
    "minimum": "lowest",
    "least": "lowest",
    "best": "lowest",
    "smallest": "lowest",
    "ascending": "lowest",
}


def _make_failure_artifact(
    warning: str,
    value_column: Optional[str] = None,
    direction: str = "highest",
    top_n: Optional[int] = 10,
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "asset_exposure_ranking_failed",
        "value_column": value_column,
        "source_value_column": value_column,
        "direction": direction,
        "top_n": top_n,
        "geojson": None,
        "feature_count": 0,
        "asset_count": 0,
        "ranked_asset_count": 0,
        "missing_value_count": 0,
        "bbox": None,
        "crs": "EPSG:4326",
        "summary": None,
        "table": [],
        "warnings": [warning],
        "suggestions": suggestions or [],
        "provenance": {
            "method": "rank_assets_by_exposure",
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


def _choose_value_column(
    input_artifact: Dict[str, Any],
    gdf: gpd.GeoDataFrame,
    value_column: Optional[str],
) -> str:
    if value_column:
        chosen = value_column
    else:
        chosen = None

        for candidate in DEFAULT_RANKING_COLUMN_CANDIDATES:
            if candidate in gdf.columns:
                chosen = candidate
                break

        if chosen is None:
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

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> Optional[int]:
    if value is None:
        return None

    if pd.isna(value):
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_bool(value: Any) -> Optional[bool]:
    if value is None:
        return None

    if pd.isna(value):
        return None

    return bool(value)


def _normalize_direction(direction: str) -> str:
    cleaned = str(direction or "highest").lower().strip()

    if cleaned not in DIRECTION_ALIASES:
        raise ValueError(
            f"Unsupported direction '{direction}'. "
            "Supported values include highest, lowest, top, bottom, worst, best."
        )

    return DIRECTION_ALIASES[cleaned]


def _normalize_top_n(top_n: Optional[int]) -> Optional[int]:
    if top_n is None:
        return None

    try:
        normalized = int(top_n)
    except (TypeError, ValueError):
        raise ValueError("top_n must be an integer or null.")

    if normalized <= 0:
        raise ValueError("top_n must be positive.")

    return normalized


def _rank_category(
    rank: Optional[int],
    ranked_count: int,
) -> str:
    if rank is None:
        return "unranked_missing_value"

    if ranked_count <= 0:
        return "unranked_missing_value"

    percentile_position = rank / ranked_count

    if percentile_position <= 0.1:
        return "top_10_percent"

    if percentile_position <= 0.25:
        return "top_25_percent"

    if percentile_position <= 0.5:
        return "top_50_percent"

    return "lower_50_percent"


def _prepare_ranked_assets(
    asset_gdf: gpd.GeoDataFrame,
    value_column: str,
    direction: str,
    top_n: Optional[int],
    include_all_assets: bool,
    include_missing_assets: bool,
) -> gpd.GeoDataFrame:
    if asset_gdf.empty:
        raise ValueError("Input artifact contains no asset features.")

    asset_gdf = asset_gdf.copy()

    if asset_gdf.geometry.is_empty.any():
        asset_gdf = asset_gdf[~asset_gdf.geometry.is_empty].copy()

    if asset_gdf.empty:
        raise ValueError("Input artifact contains no non-empty asset geometries.")

    asset_gdf["_numeric_rank_value"] = pd.to_numeric(
        asset_gdf[value_column],
        errors="coerce",
    )

    valid_gdf = asset_gdf[asset_gdf["_numeric_rank_value"].notna()].copy()
    missing_gdf = asset_gdf[asset_gdf["_numeric_rank_value"].isna()].copy()

    if valid_gdf.empty:
        raise ValueError(f"No numeric values found in value_column '{value_column}'.")

    ascending = direction == "lowest"

    valid_gdf = valid_gdf.sort_values(
        by="_numeric_rank_value",
        ascending=ascending,
    ).copy()

    valid_gdf["asset_rank"] = range(1, len(valid_gdf) + 1)
    valid_gdf["asset_rank_score"] = valid_gdf["_numeric_rank_value"]
    valid_gdf["rank_direction"] = direction

    if len(valid_gdf) == 1:
        valid_gdf["rank_percentile"] = 100.0
    else:
        valid_gdf["rank_percentile"] = (
            1.0 - ((valid_gdf["asset_rank"] - 1) / (len(valid_gdf) - 1))
        ) * 100.0

    valid_gdf["rank_category"] = valid_gdf["asset_rank"].apply(
        lambda rank: _rank_category(
            rank=_safe_int(rank),
            ranked_count=len(valid_gdf),
        )
    )

    if include_all_assets:
        output_gdf = valid_gdf.copy()
    else:
        if top_n is None:
            output_gdf = valid_gdf.copy()
        else:
            output_gdf = valid_gdf.head(top_n).copy()

    if include_missing_assets and not missing_gdf.empty:
        missing_gdf = missing_gdf.copy()
        missing_gdf["asset_rank"] = pd.NA
        missing_gdf["asset_rank_score"] = pd.NA
        missing_gdf["rank_direction"] = direction
        missing_gdf["rank_percentile"] = pd.NA
        missing_gdf["rank_category"] = "unranked_missing_value"

        missing_gdf = missing_gdf.reindex(columns=output_gdf.columns)

        output_gdf = pd.concat(
            [output_gdf, missing_gdf],
            ignore_index=True,
        )

    output_gdf = output_gdf.drop(
        columns=["_numeric_rank_value"],
        errors="ignore",
    ).copy()

    return output_gdf


def _summarize_asset_ranking(
    ranked_gdf: gpd.GeoDataFrame,
    original_gdf: gpd.GeoDataFrame,
    value_column: str,
    direction: str,
    top_n: Optional[int],
) -> Dict[str, Any]:
    original_values = pd.to_numeric(original_gdf[value_column], errors="coerce")
    ranked_values = pd.to_numeric(ranked_gdf["asset_rank_score"], errors="coerce")

    asset_count = int(len(original_gdf))
    ranked_asset_count = int(ranked_values.notna().sum())
    missing_value_count = int(original_values.isna().sum())

    top_asset = None

    ranked_only = ranked_gdf[ranked_gdf["asset_rank"].notna()].copy()

    if not ranked_only.empty:
        top_row = ranked_only.sort_values("asset_rank").iloc[0]
        top_asset = {
            "asset_rank": _safe_int(top_row.get("asset_rank")),
            "asset_rank_score": _safe_float(top_row.get("asset_rank_score")),
        }

        for column in ASSET_NAME_CANDIDATES:
            if column in ranked_only.columns:
                top_asset["asset_name"] = top_row.get(column)
                break

        for column in ASSET_ID_CANDIDATES:
            if column in ranked_only.columns:
                top_asset["asset_id"] = top_row.get(column)
                break

        for column in ASSET_TYPE_CANDIDATES:
            if column in ranked_only.columns:
                top_asset["asset_type"] = top_row.get(column)
                break

    return {
        "asset_count": asset_count,
        "ranked_asset_count": ranked_asset_count,
        "missing_value_count": missing_value_count,
        "direction": direction,
        "top_n": top_n,
        "source_value_column": value_column,
        "value_min": _safe_float(original_values.min()),
        "value_max": _safe_float(original_values.max()),
        "value_mean": _safe_float(original_values.mean()),
        "value_median": _safe_float(original_values.median()),
        "returned_value_min": _safe_float(ranked_values.min()),
        "returned_value_max": _safe_float(ranked_values.max()),
        "top_asset": top_asset,
    }


def _make_asset_rank_table(
    ranked_gdf: gpd.GeoDataFrame,
    value_column: str,
    asset_name_column: Optional[str],
    asset_id_column: Optional[str],
    asset_type_column: Optional[str],
    max_rows: int = 300,
) -> list[Dict[str, Any]]:
    table = []

    ranked_gdf = ranked_gdf.sort_values(
        by=["asset_rank"],
        na_position="last",
    ).copy()

    for _, row in ranked_gdf.head(max_rows).iterrows():
        item = {
            "asset_rank": _safe_int(row.get("asset_rank")),
            "asset_rank_score": _safe_float(row.get("asset_rank_score")),
            "rank_percentile": _safe_float(row.get("rank_percentile")),
            "rank_category": row.get("rank_category"),
            "source_value_column": value_column,
            "source_value": _safe_float(row.get(value_column)),
        }

        if "exposed_to_hazard" in ranked_gdf.columns:
            item["exposed_to_hazard"] = _safe_bool(row.get("exposed_to_hazard"))

        if "exposure_score" in ranked_gdf.columns:
            item["exposure_score"] = _safe_float(row.get("exposure_score"))

        if "exposure_difference" in ranked_gdf.columns:
            item["exposure_difference"] = _safe_float(row.get("exposure_difference"))

        if "sampled_hazard_value" in ranked_gdf.columns:
            item["sampled_hazard_value"] = _safe_float(
                row.get("sampled_hazard_value")
            )

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


def rank_assets_by_exposure(
    input_artifact: Dict[str, Any],
    value_column: Optional[str] = None,
    asset_name_column: Optional[str] = None,
    asset_id_column: Optional[str] = None,
    asset_type_column: Optional[str] = None,
    direction: str = "highest",
    top_n: Optional[int] = 10,
    include_all_assets: bool = False,
    include_missing_assets: bool = False,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Rank infrastructure assets by exposure severity.

    Typical chain:
        load_climate_projection(...)
        -> sample_hazard_at_assets(...)
        -> calculate_infrastructure_exposure(...)
        -> rank_assets_by_exposure(...)

    Example:
        rank_assets_by_exposure(
            input_artifact=exposed_hospitals,
            value_column="exposure_difference",
            direction="highest",
            top_n=10
        )
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    warnings: list[str] = []

    try:
        normalized_direction = _normalize_direction(direction)
        normalized_top_n = _normalize_top_n(top_n)
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            value_column=value_column,
            direction=direction,
            top_n=top_n,
        )

    try:
        asset_gdf = _artifact_to_gdf(input_artifact)
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not convert input artifact to GeoDataFrame: {exc}",
            value_column=value_column,
            direction=normalized_direction,
            top_n=normalized_top_n,
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
            direction=normalized_direction,
            top_n=normalized_top_n,
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
            direction=normalized_direction,
            top_n=normalized_top_n,
        )

    try:
        ranked_gdf = _prepare_ranked_assets(
            asset_gdf=asset_gdf,
            value_column=chosen_value_column,
            direction=normalized_direction,
            top_n=normalized_top_n,
            include_all_assets=include_all_assets,
            include_missing_assets=include_missing_assets,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not rank assets by exposure: {exc}",
            value_column=chosen_value_column,
            direction=normalized_direction,
            top_n=normalized_top_n,
        )

    summary = _summarize_asset_ranking(
        ranked_gdf=ranked_gdf,
        original_gdf=asset_gdf,
        value_column=chosen_value_column,
        direction=normalized_direction,
        top_n=normalized_top_n,
    )

    if summary["missing_value_count"] > 0:
        warnings.append(
            f"{summary['missing_value_count']} assets have missing ranking values."
        )

    if normalized_top_n is not None and not include_all_assets:
        if summary["ranked_asset_count"] < normalized_top_n:
            warnings.append(
                f"Only {summary['ranked_asset_count']} assets had numeric values to rank."
            )

    geojson = json.loads(ranked_gdf.to_json())

    layer_id = (
        f"{input_artifact.get('layer_id', 'infrastructure_assets')}_"
        f"ranked_by_{chosen_value_column}_{normalized_direction}"
    )

    return {
        "artifact_type": "asset_exposure_ranking_layer",
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
        "value_column": "asset_rank_score",
        "source_value_column": chosen_value_column,
        "units": input_artifact.get("units"),
        "direction": normalized_direction,
        "top_n": normalized_top_n,
        "include_all_assets": include_all_assets,
        "include_missing_assets": include_missing_assets,
        "geojson": geojson,
        "feature_count": int(len(ranked_gdf)),
        "asset_count": summary["asset_count"],
        "ranked_asset_count": summary["ranked_asset_count"],
        "missing_value_count": summary["missing_value_count"],
        "bbox": [float(x) for x in ranked_gdf.total_bounds],
        "crs": "EPSG:4326",
        "summary": summary,
        "table": _make_asset_rank_table(
            ranked_gdf=ranked_gdf,
            value_column=chosen_value_column,
            asset_name_column=resolved_asset_name_column,
            asset_id_column=resolved_asset_id_column,
            asset_type_column=resolved_asset_type_column,
        ),
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "method": "rank_assets_by_exposure",
            "ranking_column": chosen_value_column,
            "direction": normalized_direction,
            "top_n": normalized_top_n,
            "parent_artifact_provenance": input_artifact.get("provenance", {}),
        },
    }