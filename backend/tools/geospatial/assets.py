from __future__ import annotations

import warnings
import json
from pathlib import Path
from typing import Any, Dict, Optional

import geopandas as gpd
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[3]
ASSETS_DIR = REPO_ROOT / "data" / "assets"


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


def _make_failure_artifact(
    warning: str,
    value_column: Optional[str] = None,
    asset_name_column: Optional[str] = None,
    asset_id_column: Optional[str] = None,
    sampling_method: str = "within",
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "asset_hazard_sample_failed",
        "value_column": value_column,
        "source_value_column": value_column,
        "asset_name_column": asset_name_column,
        "asset_id_column": asset_id_column,
        "sampling_method": sampling_method,
        "geojson": None,
        "feature_count": 0,
        "asset_count": 0,
        "matched_asset_count": 0,
        "unmatched_asset_count": 0,
        "valid_sample_count": 0,
        "missing_sample_count": 0,
        "bbox": None,
        "crs": "EPSG:4326",
        "summary": None,
        "table": [],
        "warnings": [warning],
        "suggestions": suggestions or [],
        "provenance": {
            "method": "sample_hazard_at_assets",
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


def _artifact_to_gdf(input_artifact: Dict[str, Any], artifact_name: str) -> gpd.GeoDataFrame:
    """
    Convert an artifact with GeoJSON into a GeoDataFrame.
    """
    if not isinstance(input_artifact, dict):
        raise ValueError(f"{artifact_name} must be a dictionary.")

    geojson = input_artifact.get("geojson")

    if geojson is None:
        raise ValueError(f"{artifact_name} must contain a 'geojson' field.")

    return _geojson_to_gdf(geojson)


def _load_assets_from_path(assets_path: str) -> gpd.GeoDataFrame:
    """
    Load assets from a GeoJSON file path.

    Relative paths are resolved from data/assets/.
    """
    path = Path(assets_path)

    if not path.is_absolute():
        path = ASSETS_DIR / path

    if not path.exists():
        raise FileNotFoundError(f"Asset file not found: {path}")

    gdf = gpd.read_file(path)

    if gdf.empty:
        raise ValueError(f"Asset file is empty: {path}")

    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    return gdf


def _load_or_use_assets(
    assets_artifact: Optional[Dict[str, Any]],
    assets_path: Optional[str],
) -> gpd.GeoDataFrame:
    if assets_artifact is not None:
        return _artifact_to_gdf(
            input_artifact=assets_artifact,
            artifact_name="assets_artifact",
        )

    if assets_path:
        return _load_assets_from_path(assets_path)

    raise ValueError("Either assets_artifact or assets_path is required.")


def _choose_value_column(
    hazard_artifact: Dict[str, Any],
    hazard_gdf: gpd.GeoDataFrame,
    value_column: Optional[str],
) -> str:
    if value_column:
        chosen = value_column
    else:
        chosen = hazard_artifact.get("value_column")

    if not chosen:
        raise ValueError(
            "Could not infer value_column. Provide value_column explicitly."
        )

    if chosen not in hazard_gdf.columns:
        raise ValueError(f"value_column '{chosen}' not found in hazard artifact.")

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


def _safe_int(value: Any) -> Optional[int]:
    if value is None:
        return None

    if pd.isna(value):
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None

def _to_crs_without_pyproj_warning(
    gdf: gpd.GeoDataFrame,
    crs: str,
) -> gpd.GeoDataFrame:
    """
    Reproject a GeoDataFrame while suppressing a pyproj/numpy deprecation warning
    that appears on some Python 3.13 / NumPy / pyproj combinations.
    """
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="Conversion of an array with ndim > 0 to a scalar is deprecated.*",
            category=DeprecationWarning,
        )
        return gdf.to_crs(crs)


def _normalize_sampling_method(sampling_method: str) -> str:
    cleaned = str(sampling_method or "within").lower().strip()

    aliases = {
        "within": "within",
        "contains": "within",
        "point_within_polygon": "within",
        "intersects": "intersects",
        "intersection": "intersects",
        "nearest": "nearest",
        "nearest_polygon": "nearest",
    }

    if cleaned not in aliases:
        raise ValueError(
            f"Unsupported sampling_method '{sampling_method}'. "
            "Supported values: within, intersects, nearest."
        )

    return aliases[cleaned]


def _prepare_assets_for_sampling(assets_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Use point geometries for sampling.

    If assets are already points, they are used directly.
    If assets are polygons or lines, representative points are used.
    """
    assets_gdf = assets_gdf.copy()

    if assets_gdf.empty:
        raise ValueError("Asset layer contains no features.")

    if assets_gdf.geometry.is_empty.any():
        assets_gdf = assets_gdf[~assets_gdf.geometry.is_empty].copy()

    if assets_gdf.empty:
        raise ValueError("Asset layer contains no non-empty geometries.")

    geom_types = set(assets_gdf.geometry.geom_type)

    if geom_types.issubset({"Point", "MultiPoint"}):
        return assets_gdf

    projected_crs = "EPSG:3857"

    projected_assets = _to_crs_without_pyproj_warning(
        gdf=assets_gdf,
        crs=projected_crs,
    )

    sampled_assets = projected_assets.copy()

    sampled_assets["geometry"] = projected_assets.geometry.representative_point()

    sampled_assets = _to_crs_without_pyproj_warning(
        gdf=sampled_assets,
        crs="EPSG:4326",
    )

    return sampled_assets


def _prepare_hazard_layer(
    hazard_gdf: gpd.GeoDataFrame,
    value_column: str,
) -> gpd.GeoDataFrame:
    if hazard_gdf.empty:
        raise ValueError("Hazard layer contains no features.")

    if hazard_gdf.geometry.is_empty.any():
        hazard_gdf = hazard_gdf[~hazard_gdf.geometry.is_empty].copy()

    if hazard_gdf.empty:
        raise ValueError("Hazard layer contains no non-empty geometries.")

    hazard_gdf = hazard_gdf.copy()
    hazard_gdf[value_column] = pd.to_numeric(hazard_gdf[value_column], errors="coerce")
    hazard_gdf["_hazard_join_key"] = range(len(hazard_gdf))

    return hazard_gdf


def _sample_by_spatial_join(
    assets_gdf: gpd.GeoDataFrame,
    hazard_gdf: gpd.GeoDataFrame,
    value_column: str,
    sampling_method: str,
) -> gpd.GeoDataFrame:
    """
    Sample hazard values at asset locations using within/intersects.

    If a point matches multiple hazard polygons, keep the first match after sorting
    by hazard join key. In normal gridded layers, there should be one match.
    """
    predicate = "within" if sampling_method == "within" else "intersects"

    assets = assets_gdf.copy()
    assets["_asset_join_key"] = range(len(assets))

    hazard_columns = ["_hazard_join_key", value_column, "geometry"]

    sampled = gpd.sjoin(
        assets,
        hazard_gdf[hazard_columns],
        how="left",
        predicate=predicate,
    )

    sampled = sampled.sort_values(
        by=["_asset_join_key", "_hazard_join_key"],
        na_position="last",
    )

    sampled = sampled.drop_duplicates(
        subset=["_asset_join_key"],
        keep="first",
    ).copy()

    sampled = sampled.sort_values("_asset_join_key").copy()

    return sampled


def _sample_by_nearest(
    assets_gdf: gpd.GeoDataFrame,
    hazard_gdf: gpd.GeoDataFrame,
    value_column: str,
    max_nearest_distance_m: Optional[float],
) -> gpd.GeoDataFrame:
    """
    Sample nearest hazard polygon when no direct spatial containment is available.
    """
    assets = assets_gdf.copy()
    assets["_asset_join_key"] = range(len(assets))

    projected_crs = "EPSG:3857"

    assets_projected = _to_crs_without_pyproj_warning(
        gdf=assets,
        crs=projected_crs,
    )

    hazard_projected = _to_crs_without_pyproj_warning(
        gdf=hazard_gdf[["_hazard_join_key", value_column, "geometry"]],
        crs=projected_crs,
    )

    sampled = gpd.sjoin_nearest(
        assets_projected,
        hazard_projected,
        how="left",
        max_distance=max_nearest_distance_m,
        distance_col="nearest_hazard_distance_m",
    )

    sampled = sampled.sort_values(
        by=["_asset_join_key", "nearest_hazard_distance_m"],
        na_position="last",
    )

    sampled = sampled.drop_duplicates(
        subset=["_asset_join_key"],
        keep="first",
    ).copy()

    sampled = sampled.sort_values("_asset_join_key").copy()
    sampled = _to_crs_without_pyproj_warning(
        gdf=sampled,
        crs="EPSG:4326",
    )

    return sampled


def _sample_hazard_values(
    assets_gdf: gpd.GeoDataFrame,
    hazard_gdf: gpd.GeoDataFrame,
    value_column: str,
    sampling_method: str,
    nearest_if_unmatched: bool,
    max_nearest_distance_m: Optional[float],
) -> gpd.GeoDataFrame:
    if sampling_method == "nearest":
        sampled = _sample_by_nearest(
            assets_gdf=assets_gdf,
            hazard_gdf=hazard_gdf,
            value_column=value_column,
            max_nearest_distance_m=max_nearest_distance_m,
        )
    else:
        sampled = _sample_by_spatial_join(
            assets_gdf=assets_gdf,
            hazard_gdf=hazard_gdf,
            value_column=value_column,
            sampling_method=sampling_method,
        )

    if nearest_if_unmatched and sampling_method != "nearest":
        unmatched_mask = sampled["_hazard_join_key"].isna()

        if unmatched_mask.any():
            unmatched_assets = assets_gdf.loc[unmatched_mask.values].copy()

            nearest_sampled = _sample_by_nearest(
                assets_gdf=unmatched_assets,
                hazard_gdf=hazard_gdf,
                value_column=value_column,
                max_nearest_distance_m=max_nearest_distance_m,
            )

            sampled.loc[unmatched_mask, value_column] = nearest_sampled[value_column].values
            sampled.loc[unmatched_mask, "_hazard_join_key"] = nearest_sampled[
                "_hazard_join_key"
            ].values

            if "nearest_hazard_distance_m" in nearest_sampled.columns:
                sampled.loc[unmatched_mask, "nearest_hazard_distance_m"] = (
                    nearest_sampled["nearest_hazard_distance_m"].values
                )

    return sampled


def _make_table(
    sampled_gdf: gpd.GeoDataFrame,
    value_column: str,
    asset_name_column: Optional[str],
    asset_id_column: Optional[str],
    asset_type_column: Optional[str],
    max_rows: int = 300,
) -> list[Dict[str, Any]]:
    table = []

    for _, row in sampled_gdf.head(max_rows).iterrows():
        if "matched_hazard" in sampled_gdf.columns:
            matched_hazard = bool(row.get("matched_hazard"))
        else:
            matched_hazard = bool(pd.notna(row.get("_hazard_join_key")))

        item = {
            "sampled_value": _safe_float(row.get(value_column)),
            "source_value_column": value_column,
            "matched_hazard": matched_hazard,
        }

        if asset_name_column:
            item["asset_name"] = row.get(asset_name_column)

        if asset_id_column:
            item["asset_id"] = row.get(asset_id_column)

        if asset_type_column:
            item["asset_type"] = row.get(asset_type_column)

        if "nearest_hazard_distance_m" in sampled_gdf.columns:
            item["nearest_hazard_distance_m"] = _safe_float(
                row.get("nearest_hazard_distance_m")
            )

        if row.geometry is not None:
            item["longitude"] = _safe_float(row.geometry.x)
            item["latitude"] = _safe_float(row.geometry.y)

        table.append(item)

    return table


def _summarize_sampled_assets(
    sampled_gdf: gpd.GeoDataFrame,
    value_column: str,
) -> Dict[str, Any]:
    sampled_values = pd.to_numeric(sampled_gdf[value_column], errors="coerce")

    matched_asset_count = int(sampled_gdf["_hazard_join_key"].notna().sum())
    unmatched_asset_count = int(sampled_gdf["_hazard_join_key"].isna().sum())

    valid_sample_count = int(sampled_values.notna().sum())
    missing_sample_count = int(sampled_values.isna().sum())

    return {
        "asset_count": int(len(sampled_gdf)),
        "matched_asset_count": matched_asset_count,
        "unmatched_asset_count": unmatched_asset_count,
        "valid_sample_count": valid_sample_count,
        "missing_sample_count": missing_sample_count,
        "source_value_column": value_column,
        "sampled_min": _safe_float(sampled_values.min()),
        "sampled_max": _safe_float(sampled_values.max()),
        "sampled_mean": _safe_float(sampled_values.mean()),
        "sampled_median": _safe_float(sampled_values.median()),
    }


def sample_hazard_at_assets(
    hazard_artifact: Dict[str, Any],
    assets_artifact: Optional[Dict[str, Any]] = None,
    assets_path: Optional[str] = None,
    value_column: Optional[str] = None,
    asset_name_column: Optional[str] = None,
    asset_id_column: Optional[str] = None,
    asset_type_column: Optional[str] = None,
    sampling_method: str = "within",
    include_unmatched_assets: bool = True,
    nearest_if_unmatched: bool = False,
    max_nearest_distance_m: Optional[float] = None,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Sample hazard/climate/risk values at asset locations.

    Typical chain:
        load_climate_projection(...)
        -> sample_hazard_at_assets(...)

    Example:
        sample_hazard_at_assets(
            hazard_artifact=heat_layer,
            assets_artifact=hospitals_layer,
            value_column="extreme_heat_days_mean",
            asset_name_column="hospital_name"
        )

    Returns:
        {
            "artifact_type": "asset_hazard_sample_layer",
            "geojson": {...},
            "value_column": "sampled_hazard_value",
            "summary": {...},
            "table": [...]
        }
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    warnings: list[str] = []

    try:
        normalized_sampling_method = _normalize_sampling_method(sampling_method)
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            value_column=value_column,
            asset_name_column=asset_name_column,
            asset_id_column=asset_id_column,
            sampling_method=sampling_method,
        )

    try:
        hazard_gdf = _artifact_to_gdf(
            input_artifact=hazard_artifact,
            artifact_name="hazard_artifact",
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not convert hazard artifact to GeoDataFrame: {exc}",
            value_column=value_column,
            asset_name_column=asset_name_column,
            asset_id_column=asset_id_column,
            sampling_method=normalized_sampling_method,
        )

    try:
        chosen_value_column = _choose_value_column(
            hazard_artifact=hazard_artifact,
            hazard_gdf=hazard_gdf,
            value_column=value_column,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            value_column=value_column,
            asset_name_column=asset_name_column,
            asset_id_column=asset_id_column,
            sampling_method=normalized_sampling_method,
        )

    try:
        assets_gdf = _load_or_use_assets(
            assets_artifact=assets_artifact,
            assets_path=assets_path,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not load assets: {exc}",
            value_column=chosen_value_column,
            asset_name_column=asset_name_column,
            asset_id_column=asset_id_column,
            sampling_method=normalized_sampling_method,
        )

    try:
        hazard_gdf = _prepare_hazard_layer(
            hazard_gdf=hazard_gdf,
            value_column=chosen_value_column,
        )

        assets_gdf = _prepare_assets_for_sampling(
            assets_gdf=assets_gdf,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not prepare hazard/assets for sampling: {exc}",
            value_column=chosen_value_column,
            asset_name_column=asset_name_column,
            asset_id_column=asset_id_column,
            sampling_method=normalized_sampling_method,
        )

    try:
        resolved_asset_name_column = _infer_column(
            gdf=assets_gdf,
            explicit_column=asset_name_column,
            candidates=ASSET_NAME_CANDIDATES,
            column_role="asset_name",
        )

        resolved_asset_id_column = _infer_column(
            gdf=assets_gdf,
            explicit_column=asset_id_column,
            candidates=ASSET_ID_CANDIDATES,
            column_role="asset_id",
        )

        resolved_asset_type_column = _infer_column(
            gdf=assets_gdf,
            explicit_column=asset_type_column,
            candidates=ASSET_TYPE_CANDIDATES,
            column_role="asset_type",
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            value_column=chosen_value_column,
            asset_name_column=asset_name_column,
            asset_id_column=asset_id_column,
            sampling_method=normalized_sampling_method,
        )

    try:
        sampled_gdf = _sample_hazard_values(
            assets_gdf=assets_gdf,
            hazard_gdf=hazard_gdf,
            value_column=chosen_value_column,
            sampling_method=normalized_sampling_method,
            nearest_if_unmatched=nearest_if_unmatched,
            max_nearest_distance_m=max_nearest_distance_m,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not sample hazard values at assets: {exc}",
            value_column=chosen_value_column,
            asset_name_column=resolved_asset_name_column,
            asset_id_column=resolved_asset_id_column,
            sampling_method=normalized_sampling_method,
        )

    sampled_gdf["sampled_hazard_value"] = pd.to_numeric(
        sampled_gdf[chosen_value_column],
        errors="coerce",
    )

    sampled_gdf["matched_hazard"] = sampled_gdf["_hazard_join_key"].notna()
    sampled_gdf["sampled_value_column"] = chosen_value_column

    if not include_unmatched_assets:
        sampled_gdf = sampled_gdf[sampled_gdf["matched_hazard"]].copy()

    if sampled_gdf.empty:
        return _make_failure_artifact(
            warning="Sampling produced no output assets.",
            value_column=chosen_value_column,
            asset_name_column=resolved_asset_name_column,
            asset_id_column=resolved_asset_id_column,
            sampling_method=normalized_sampling_method,
        )

    summary = _summarize_sampled_assets(
        sampled_gdf=sampled_gdf,
        value_column="sampled_hazard_value",
    )

    if summary["unmatched_asset_count"] > 0:
        warnings.append(
            f"{summary['unmatched_asset_count']} assets did not match a hazard feature."
        )

    if summary["missing_sample_count"] > 0:
        warnings.append(
            f"{summary['missing_sample_count']} assets have missing sampled hazard values."
        )

    output_gdf = sampled_gdf.drop(
        columns=[
            "index_right",
            "_asset_join_key",
            "_hazard_join_key",
        ],
        errors="ignore",
    ).copy()

    geojson = json.loads(output_gdf.to_json())

    return {
        "artifact_type": "asset_hazard_sample_layer",
        "input_hazard_artifact_type": hazard_artifact.get("artifact_type"),
        "input_hazard_layer_id": hazard_artifact.get("layer_id"),
        "input_assets_artifact_type": assets_artifact.get("artifact_type")
        if assets_artifact
        else None,
        "input_assets_layer_id": assets_artifact.get("layer_id")
        if assets_artifact
        else assets_path,
        "layer_id": (
            f"{hazard_artifact.get('layer_id', 'hazard_layer')}_"
            f"sampled_at_assets"
        ),
        "variable": hazard_artifact.get("variable"),
        "source_variable": hazard_artifact.get("source_variable"),
        "region_name": hazard_artifact.get("region_name"),
        "period": hazard_artifact.get("period"),
        "start_year": hazard_artifact.get("start_year"),
        "end_year": hazard_artifact.get("end_year"),
        "scenario": hazard_artifact.get("scenario"),
        "scenario_code": hazard_artifact.get("scenario_code"),
        "model": hazard_artifact.get("model"),
        "variant": hazard_artifact.get("variant"),
        "asset_name_column": resolved_asset_name_column,
        "asset_id_column": resolved_asset_id_column,
        "asset_type_column": resolved_asset_type_column,
        "value_column": "sampled_hazard_value",
        "source_value_column": chosen_value_column,
        "units": hazard_artifact.get("units"),
        "sampling_method": normalized_sampling_method,
        "include_unmatched_assets": include_unmatched_assets,
        "nearest_if_unmatched": nearest_if_unmatched,
        "max_nearest_distance_m": max_nearest_distance_m,
        "geojson": geojson,
        "feature_count": int(len(output_gdf)),
        "asset_count": summary["asset_count"],
        "matched_asset_count": summary["matched_asset_count"],
        "unmatched_asset_count": summary["unmatched_asset_count"],
        "valid_sample_count": summary["valid_sample_count"],
        "missing_sample_count": summary["missing_sample_count"],
        "bbox": [float(x) for x in output_gdf.total_bounds],
        "crs": "EPSG:4326",
        "summary": summary,
        "table": _make_table(
            sampled_gdf=output_gdf,
            value_column="sampled_hazard_value",
            asset_name_column=resolved_asset_name_column,
            asset_id_column=resolved_asset_id_column,
            asset_type_column=resolved_asset_type_column,
        ),
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "method": "spatial_join_asset_points_to_hazard_polygons",
            "sampling_method": normalized_sampling_method,
            "parent_hazard_artifact_provenance": hazard_artifact.get("provenance", {}),
            "assets_source": "artifact" if assets_artifact is not None else assets_path,
        },
    }