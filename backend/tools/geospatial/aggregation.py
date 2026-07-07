from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import geopandas as gpd
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[3]
ADMIN_BOUNDARIES_DIR = REPO_ROOT / "data" / "reference" / "admin_boundaries"


DEFAULT_AGGREGATION_METHODS = [
    "count",
    "mean",
    "median",
    "min",
    "max",
    "std",
    "sum",
    "p90",
    "p95",
]


AGGREGATION_ALIASES = {
    "average": "mean",
    "avg": "mean",
    "maximum": "max",
    "minimum": "min",
    "standard_deviation": "std",
    "stdev": "std",
    "sd": "std",
    "n": "count",
}


ADMIN_NAME_CANDIDATES = [
    "admin_name",
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


ADMIN_ID_CANDIDATES = [
    "admin_id",
    "id",
    "ID",
    "gid",
    "GID",
    "adm_id",
    "ADM_ID",
    "iso_code",
    "ISO_CODE",
]


def _make_failure_artifact(
    warning: str,
    value_column: Optional[str] = None,
    admin_level: Optional[str] = None,
    admin_name_column: Optional[str] = None,
    admin_id_column: Optional[str] = None,
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "admin_region_aggregation_failed",
        "value_column": value_column,
        "source_value_column": value_column,
        "admin_level": admin_level,
        "admin_name_column": admin_name_column,
        "admin_id_column": admin_id_column,
        "geojson": None,
        "feature_count": 0,
        "input_feature_count": 0,
        "admin_region_count": 0,
        "matched_feature_count": 0,
        "unmatched_feature_count": 0,
        "bbox": None,
        "crs": "EPSG:4326",
        "summary": None,
        "table": [],
        "warnings": [warning],
        "suggestions": suggestions or [],
        "provenance": {
            "method": "aggregate_by_admin_region",
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


def _load_admin_boundaries_from_path(admin_boundaries_path: str) -> gpd.GeoDataFrame:
    """
    Load admin boundaries from a GeoJSON file path.

    Relative paths are resolved from data/reference/admin_boundaries/.
    """
    path = Path(admin_boundaries_path)

    if not path.is_absolute():
        path = ADMIN_BOUNDARIES_DIR / path

    if not path.exists():
        raise FileNotFoundError(f"Admin boundary file not found: {path}")

    gdf = gpd.read_file(path)

    if gdf.empty:
        raise ValueError(f"Admin boundary file is empty: {path}")

    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    return gdf


def _load_or_use_admin_boundaries(
    admin_boundaries_artifact: Optional[Dict[str, Any]],
    admin_boundaries_path: Optional[str],
) -> gpd.GeoDataFrame:
    if admin_boundaries_artifact is not None:
        return _artifact_to_gdf(
            input_artifact=admin_boundaries_artifact,
            artifact_name="admin_boundaries_artifact",
        )

    if admin_boundaries_path:
        return _load_admin_boundaries_from_path(admin_boundaries_path)

    raise ValueError(
        "Either admin_boundaries_artifact or admin_boundaries_path is required."
    )


def _choose_value_column(
    input_artifact: Dict[str, Any],
    input_gdf: gpd.GeoDataFrame,
    value_column: Optional[str],
) -> str:
    if value_column:
        chosen = value_column
    else:
        chosen = input_artifact.get("value_column")

    if not chosen:
        raise ValueError(
            "Could not infer value_column. Provide value_column explicitly."
        )

    if chosen not in input_gdf.columns:
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
            raise ValueError(
                f"{column_role} column '{explicit_column}' not found in admin boundaries."
            )

        return explicit_column

    for candidate in candidates:
        if candidate in gdf.columns:
            return candidate

    return None


def _normalize_aggregation_methods(
    aggregation_methods: Optional[list[str]],
) -> list[str]:
    if aggregation_methods is None:
        aggregation_methods = DEFAULT_AGGREGATION_METHODS

    normalized = []

    for method in aggregation_methods:
        cleaned = str(method).lower().strip()
        cleaned = AGGREGATION_ALIASES.get(cleaned, cleaned)
        normalized.append(cleaned)

    return normalized


def _is_percentile_method(method: str) -> bool:
    if not method.startswith("p"):
        return False

    try:
        percentile = int(method[1:])
    except Exception:
        return False

    return 0 <= percentile <= 100


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None

    if pd.isna(value):
        return None

    return float(value)


def _compute_group_statistics(
    grouped: pd.core.groupby.SeriesGroupBy,
    aggregation_methods: list[str],
    output_prefix: str,
) -> pd.DataFrame:
    """
    Compute group statistics and return a DataFrame indexed by admin key.
    """
    pieces = []

    for method in aggregation_methods:
        output_column = f"{output_prefix}_{method}"

        if method == "count":
            piece = grouped.count().rename(output_column)

        elif method == "mean":
            piece = grouped.mean().rename(output_column)

        elif method == "median":
            piece = grouped.median().rename(output_column)

        elif method == "min":
            piece = grouped.min().rename(output_column)

        elif method == "max":
            piece = grouped.max().rename(output_column)

        elif method == "std":
            piece = grouped.std().rename(output_column)

        elif method == "sum":
            piece = grouped.sum().rename(output_column)

        elif method == "variance":
            piece = grouped.var().rename(output_column)

        elif _is_percentile_method(method):
            q = int(method[1:]) / 100.0
            piece = grouped.quantile(q).rename(output_column)

        else:
            raise ValueError(
                f"Unsupported aggregation method '{method}'. "
                "Supported examples: count, mean, median, min, max, std, sum, "
                "variance, p10, p25, p75, p90, p95."
            )

        pieces.append(piece)

    return pd.concat(pieces, axis=1)


def _prepare_admin_boundaries(
    admin_gdf: gpd.GeoDataFrame,
    admin_name_column: Optional[str],
    admin_id_column: Optional[str],
) -> tuple[gpd.GeoDataFrame, str, Optional[str]]:
    """
    Add a stable internal admin key and infer admin name/id columns.
    """
    if admin_gdf.empty:
        raise ValueError("Admin boundaries contain no features.")

    if admin_gdf.geometry.is_empty.any():
        admin_gdf = admin_gdf[~admin_gdf.geometry.is_empty].copy()

    if admin_gdf.empty:
        raise ValueError("Admin boundaries contain no non-empty geometries.")

    resolved_name_column = _infer_column(
        gdf=admin_gdf,
        explicit_column=admin_name_column,
        candidates=ADMIN_NAME_CANDIDATES,
        column_role="admin_name",
    )

    resolved_id_column = _infer_column(
        gdf=admin_gdf,
        explicit_column=admin_id_column,
        candidates=ADMIN_ID_CANDIDATES,
        column_role="admin_id",
    )

    admin_gdf = admin_gdf.copy()
    admin_gdf["_admin_join_key"] = range(len(admin_gdf))

    if resolved_name_column is None:
        admin_gdf["admin_name"] = admin_gdf["_admin_join_key"].apply(
            lambda idx: f"admin_region_{idx + 1}"
        )
        resolved_name_column = "admin_name"

    return admin_gdf, resolved_name_column, resolved_id_column


def _spatial_join_to_admin_regions(
    input_gdf: gpd.GeoDataFrame,
    admin_gdf: gpd.GeoDataFrame,
    join_method: str,
) -> gpd.GeoDataFrame:
    """
    Attach each input feature to an admin region.

    Supported methods:
    - centroid_within: use each input feature centroid and find the admin polygon containing it
    - intersects: assign each input feature to the admin polygon with the largest overlap
    """
    normalized_join_method = str(join_method or "centroid_within").lower().strip()

    if normalized_join_method not in {"centroid_within", "intersects"}:
        raise ValueError(
            "join_method must be either 'centroid_within' or 'intersects'."
        )

    if normalized_join_method == "centroid_within":
        projected_crs = input_gdf.estimate_utm_crs()

        if projected_crs is None:
            projected_crs = "EPSG:3857"

        input_projected = input_gdf.to_crs(projected_crs)

        centroid_gdf = input_projected.copy()
        centroid_gdf["geometry"] = input_projected.geometry.centroid

        centroid_gdf = centroid_gdf.to_crs("EPSG:4326")

        joined = gpd.sjoin(
            centroid_gdf,
            admin_gdf[["_admin_join_key", "geometry"]],
            how="left",
            predicate="within",
        )

        return joined

    # For intersects, do not keep duplicate matches.
    # Assign each input feature to the admin polygon with the largest overlap.
    input_with_key = input_gdf.copy()
    input_with_key["_input_join_key"] = range(len(input_with_key))

    projected_crs = input_with_key.estimate_utm_crs()

    if projected_crs is None:
        projected_crs = "EPSG:3857"

    input_projected = input_with_key.to_crs(projected_crs)
    admin_projected = admin_gdf[["_admin_join_key", "geometry"]].to_crs(projected_crs)

    candidates = gpd.sjoin(
        input_projected,
        admin_projected,
        how="left",
        predicate="intersects",
    )

    matched = candidates[candidates["_admin_join_key"].notna()].copy()
    unmatched = candidates[candidates["_admin_join_key"].isna()].copy()

    if matched.empty:
        return candidates.to_crs("EPSG:4326")

    admin_geometries = admin_projected[["_admin_join_key", "geometry"]].copy()
    admin_geometries = admin_geometries.rename(
        columns={
            "geometry": "_admin_geometry",
        }
    )

    matched = matched.merge(
        admin_geometries,
        on="_admin_join_key",
        how="left",
    )

    matched["_intersection_area"] = matched.geometry.intersection(
        matched["_admin_geometry"]
    ).area

    matched = matched.sort_values(
        by=["_input_join_key", "_intersection_area"],
        ascending=[True, False],
    )

    best_matches = matched.drop_duplicates(
        subset=["_input_join_key"],
        keep="first",
    ).copy()

    best_matches = best_matches.drop(
        columns=["_admin_geometry", "_intersection_area"],
        errors="ignore",
    )

    joined = pd.concat(
        [best_matches, unmatched],
        ignore_index=True,
    )

    joined = joined.sort_values("_input_join_key").drop(
        columns=["_input_join_key"],
        errors="ignore",
    )

    joined = joined.to_crs("EPSG:4326")

    return joined

def _make_table(
    aggregated_gdf: gpd.GeoDataFrame,
    admin_name_column: str,
    admin_id_column: Optional[str],
    value_column: str,
    max_rows: int = 200,
) -> list[Dict[str, Any]]:
    table = []

    for _, row in aggregated_gdf.head(max_rows).iterrows():
        item = {
            "admin_name": row.get(admin_name_column),
            "source_value_column": value_column,
        }

        if admin_id_column:
            item["admin_id"] = row.get(admin_id_column)

        for column in aggregated_gdf.columns:
            if column.startswith(f"{value_column}_"):
                item[column] = _safe_float(row.get(column))

        table.append(item)

    return table


def _summarize_aggregation(
    input_gdf: gpd.GeoDataFrame,
    joined_gdf: gpd.GeoDataFrame,
    aggregated_gdf: gpd.GeoDataFrame,
    value_column: str,
    output_value_column: str,
) -> Dict[str, Any]:
    numeric_values = pd.to_numeric(input_gdf[value_column], errors="coerce")
    valid_values = numeric_values.dropna()

    matched_feature_count = int(joined_gdf["_admin_join_key"].notna().sum())
    unmatched_feature_count = int(joined_gdf["_admin_join_key"].isna().sum())

    output_values = pd.to_numeric(
        aggregated_gdf[output_value_column],
        errors="coerce",
    )

    return {
        "input_feature_count": int(len(input_gdf)),
        "admin_region_count": int(len(aggregated_gdf)),
        "matched_feature_count": matched_feature_count,
        "unmatched_feature_count": unmatched_feature_count,
        "valid_count": int(valid_values.count()),
        "missing_count": int(numeric_values.isna().sum()),
        "source_value_column": value_column,
        "output_value_column": output_value_column,
        "input_min": _safe_float(valid_values.min()),
        "input_max": _safe_float(valid_values.max()),
        "input_mean": _safe_float(valid_values.mean()),
        "admin_output_min": _safe_float(output_values.min()),
        "admin_output_max": _safe_float(output_values.max()),
        "admin_output_mean": _safe_float(output_values.mean()),
    }


def aggregate_by_admin_region(
    input_artifact: Dict[str, Any],
    admin_boundaries_artifact: Optional[Dict[str, Any]] = None,
    admin_boundaries_path: Optional[str] = None,
    value_column: Optional[str] = None,
    aggregation_methods: Optional[list[str]] = None,
    admin_level: Optional[str] = None,
    admin_name_column: Optional[str] = None,
    admin_id_column: Optional[str] = None,
    join_method: str = "centroid_within",
    keep_admin_regions_without_data: bool = True,
    include_unmatched_warning: bool = True,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Aggregate a gridded climate, hazard, exposure, or risk layer into admin regions.

    Typical chain:
        load_climate_projection(...)
        -> clip_to_region(...)
        -> aggregate_by_admin_region(...)

    Main use:
        aggregate_by_admin_region(
            input_artifact=clipped_heat_layer,
            admin_boundaries_artifact=district_boundaries,
            value_column="extreme_heat_days_mean",
            aggregation_methods=["mean", "max", "p90"]
        )

    Returns:
        {
            "artifact_type": "admin_region_aggregation_layer",
            "geojson": {...},
            "value_column": "extreme_heat_days_mean_mean",
            "summary": {...},
            "table": [...],
            "warnings": [],
            "provenance": {...}
        }
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    warnings: list[str] = []

    try:
        input_gdf = _artifact_to_gdf(
            input_artifact=input_artifact,
            artifact_name="input_artifact",
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not convert input artifact to GeoDataFrame: {exc}",
            value_column=value_column,
            admin_level=admin_level,
            admin_name_column=admin_name_column,
            admin_id_column=admin_id_column,
        )

    if input_gdf.empty:
        return _make_failure_artifact(
            warning="Input artifact contains no features to aggregate.",
            value_column=value_column or input_artifact.get("value_column"),
            admin_level=admin_level,
            admin_name_column=admin_name_column,
            admin_id_column=admin_id_column,
        )

    try:
        admin_gdf = _load_or_use_admin_boundaries(
            admin_boundaries_artifact=admin_boundaries_artifact,
            admin_boundaries_path=admin_boundaries_path,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not load admin boundaries: {exc}",
            value_column=value_column or input_artifact.get("value_column"),
            admin_level=admin_level,
            admin_name_column=admin_name_column,
            admin_id_column=admin_id_column,
        )

    try:
        chosen_value_column = _choose_value_column(
            input_artifact=input_artifact,
            input_gdf=input_gdf,
            value_column=value_column,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=str(exc),
            value_column=value_column,
            admin_level=admin_level,
            admin_name_column=admin_name_column,
            admin_id_column=admin_id_column,
        )

    try:
        aggregation_methods_normalized = _normalize_aggregation_methods(
            aggregation_methods=aggregation_methods,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not normalize aggregation methods: {exc}",
            value_column=chosen_value_column,
            admin_level=admin_level,
            admin_name_column=admin_name_column,
            admin_id_column=admin_id_column,
        )

    try:
        admin_gdf, resolved_admin_name_column, resolved_admin_id_column = (
            _prepare_admin_boundaries(
                admin_gdf=admin_gdf,
                admin_name_column=admin_name_column,
                admin_id_column=admin_id_column,
            )
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not prepare admin boundaries: {exc}",
            value_column=chosen_value_column,
            admin_level=admin_level,
            admin_name_column=admin_name_column,
            admin_id_column=admin_id_column,
        )

    input_gdf = input_gdf.copy()

    if input_gdf.crs is None:
        input_gdf = input_gdf.set_crs("EPSG:4326")
    else:
        input_gdf = input_gdf.to_crs("EPSG:4326")

    if admin_gdf.crs is None:
        admin_gdf = admin_gdf.set_crs("EPSG:4326")
    else:
        admin_gdf = admin_gdf.to_crs("EPSG:4326")

    input_gdf[chosen_value_column] = pd.to_numeric(
        input_gdf[chosen_value_column],
        errors="coerce",
    )

    missing_count = int(input_gdf[chosen_value_column].isna().sum())

    if missing_count > 0:
        warnings.append(
            f"{missing_count} features had missing or non-numeric values in "
            f"'{chosen_value_column}' and were ignored in numeric aggregation."
        )

    try:
        joined_gdf = _spatial_join_to_admin_regions(
            input_gdf=input_gdf,
            admin_gdf=admin_gdf,
            join_method=join_method,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not spatially join input features to admin regions: {exc}",
            value_column=chosen_value_column,
            admin_level=admin_level,
            admin_name_column=resolved_admin_name_column,
            admin_id_column=resolved_admin_id_column,
        )

    unmatched_feature_count = int(joined_gdf["_admin_join_key"].isna().sum())

    if include_unmatched_warning and unmatched_feature_count > 0:
        warnings.append(
            f"{unmatched_feature_count} input features did not match any admin region."
        )

    matched_gdf = joined_gdf[joined_gdf["_admin_join_key"].notna()].copy()

    if matched_gdf.empty:
        return _make_failure_artifact(
            warning="No input features matched the admin boundaries.",
            value_column=chosen_value_column,
            admin_level=admin_level,
            admin_name_column=resolved_admin_name_column,
            admin_id_column=resolved_admin_id_column,
        )

    try:
        grouped = matched_gdf.groupby("_admin_join_key")[chosen_value_column]
        stats_df = _compute_group_statistics(
            grouped=grouped,
            aggregation_methods=aggregation_methods_normalized,
            output_prefix=chosen_value_column,
        )
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not compute admin aggregation: {exc}",
            value_column=chosen_value_column,
            admin_level=admin_level,
            admin_name_column=resolved_admin_name_column,
            admin_id_column=resolved_admin_id_column,
        )

    if keep_admin_regions_without_data:
        aggregated_gdf = admin_gdf.merge(
            stats_df,
            left_on="_admin_join_key",
            right_index=True,
            how="left",
        )
    else:
        aggregated_gdf = admin_gdf.merge(
            stats_df,
            left_on="_admin_join_key",
            right_index=True,
            how="inner",
        )

    if aggregated_gdf.empty:
        return _make_failure_artifact(
            warning="Aggregation produced no admin-region outputs.",
            value_column=chosen_value_column,
            admin_level=admin_level,
            admin_name_column=resolved_admin_name_column,
            admin_id_column=resolved_admin_id_column,
        )

    if "mean" in aggregation_methods_normalized:
        output_value_column = f"{chosen_value_column}_mean"
    else:
        output_value_column = f"{chosen_value_column}_{aggregation_methods_normalized[0]}"

    summary = _summarize_aggregation(
        input_gdf=input_gdf,
        joined_gdf=joined_gdf,
        aggregated_gdf=aggregated_gdf,
        value_column=chosen_value_column,
        output_value_column=output_value_column,
    )

    output_gdf = aggregated_gdf.drop(columns=["_admin_join_key"]).copy()

    geojson = json.loads(output_gdf.to_json())

    return {
        "artifact_type": "admin_region_aggregation_layer",
        "input_artifact_type": input_artifact.get("artifact_type"),
        "input_layer_id": input_artifact.get("layer_id"),
        "layer_id": (
            f"{input_artifact.get('layer_id', 'layer')}_"
            f"aggregated_by_admin"
        ),
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
        "admin_level": admin_level,
        "admin_name_column": resolved_admin_name_column,
        "admin_id_column": resolved_admin_id_column,
        "value_column": output_value_column,
        "source_value_column": chosen_value_column,
        "aggregation_methods": aggregation_methods_normalized,
        "units": input_artifact.get("units"),
        "geojson": geojson,
        "feature_count": int(len(output_gdf)),
        "input_feature_count": int(len(input_gdf)),
        "admin_region_count": int(len(output_gdf)),
        "matched_feature_count": summary["matched_feature_count"],
        "unmatched_feature_count": summary["unmatched_feature_count"],
        "bbox": [float(x) for x in output_gdf.total_bounds],
        "crs": "EPSG:4326",
        "summary": summary,
        "table": _make_table(
            aggregated_gdf=output_gdf,
            admin_name_column=resolved_admin_name_column,
            admin_id_column=resolved_admin_id_column,
            value_column=chosen_value_column,
        ),
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "method": "spatial_join_then_groupby_aggregation",
            "join_method": join_method,
            "keep_admin_regions_without_data": keep_admin_regions_without_data,
            "admin_boundaries_source": (
                "artifact" if admin_boundaries_artifact is not None else admin_boundaries_path
            ),
            "parent_artifact_provenance": input_artifact.get("provenance", {}),
        },
    }