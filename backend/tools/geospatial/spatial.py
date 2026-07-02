from __future__ import annotations

import json
from typing import Any, Dict, Optional

import geopandas as gpd
from shapely.geometry import shape

from .region import resolve_region


def _make_failure_artifact(
    warning: str,
    input_artifact: Optional[Dict[str, Any]] = None,
    region_name: Optional[str] = None,
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "clip_to_region_failed",
        "input_artifact_type": (
            input_artifact.get("artifact_type") if input_artifact else None
        ),
        "input_layer_id": (
            input_artifact.get("layer_id") if input_artifact else None
        ),
        "region_name": region_name,
        "geojson": None,
        "feature_count": 0,
        "bbox": None,
        "crs": "EPSG:4326",
        "warnings": [warning],
        "suggestions": suggestions or [],
        "provenance": {
            "method": "geopandas_clip",
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
    Convert a spatial artifact into a GeoDataFrame.

    Expected input artifact shape:
        {
            "artifact_type": "climate_layer",
            "geojson": {...}
        }
    """
    if not isinstance(input_artifact, dict):
        raise ValueError("input_artifact must be a dictionary.")

    geojson = input_artifact.get("geojson")

    if geojson is None:
        raise ValueError("input_artifact must contain a 'geojson' field.")

    return _geojson_to_gdf(geojson)


def _region_artifact_to_gdf(region_artifact: Dict[str, Any]) -> gpd.GeoDataFrame:
    """
    Convert a region artifact from resolve_region into a GeoDataFrame.
    """
    if not isinstance(region_artifact, dict):
        raise ValueError("region_artifact must be a dictionary.")

    if region_artifact.get("artifact_type") != "region":
        raise ValueError(
            "region_artifact must have artifact_type='region'. "
            f"Got {region_artifact.get('artifact_type')!r}."
        )

    geometry = region_artifact.get("geometry")

    if geometry is None:
        raise ValueError("region_artifact must contain a geometry.")

    region_gdf = gpd.GeoDataFrame(
        [
            {
                "resolved_name": region_artifact.get("resolved_name"),
                "admin_level": region_artifact.get("admin_level"),
                "geometry": shape(geometry),
            }
        ],
        geometry="geometry",
        crs=region_artifact.get("crs", "EPSG:4326"),
    )

    if region_gdf.crs is None:
        region_gdf = region_gdf.set_crs("EPSG:4326")
    else:
        region_gdf = region_gdf.to_crs("EPSG:4326")

    return region_gdf


def _clean_total_bounds(gdf: gpd.GeoDataFrame) -> Optional[list[float]]:
    """
    Return bbox as [minx, miny, maxx, maxy], or None for empty outputs.
    """
    if gdf.empty:
        return None

    return [float(x) for x in gdf.total_bounds]


def clip_to_region(
    input_artifact: Dict[str, Any],
    region_name: Optional[str] = None,
    region_artifact: Optional[Dict[str, Any]] = None,
    keep_empty: bool = False,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Clip a spatial artifact to a selected region.

    This is the third core chatbot wrapper.

    Typical chain:
        resolve_region("Fiji")
        -> load_climate_projection(...)
        -> clip_to_region(input_artifact=climate_layer, region_artifact=fiji_region)

    Parameters:
        input_artifact:
            A spatial artifact containing a GeoJSON FeatureCollection.
            Usually returned by load_climate_projection.

        region_name:
            Optional human-readable region name. If region_artifact is not supplied,
            this function will call resolve_region(region_name).

        region_artifact:
            Optional region artifact returned by resolve_region.

        keep_empty:
            If False, return a failure artifact when the clipped result is empty.
            If True, return a valid clipped artifact with zero features.

        return_geometry_format:
            Currently only 'geojson' is supported.

    Returns:
        {
            "artifact_type": "clipped_layer",
            "input_artifact_type": "...",
            "input_layer_id": "...",
            "region_name": "Fiji",
            "geojson": {...},
            "feature_count": 12,
            "bbox": [...],
            "crs": "EPSG:4326",
            "value_column": "...",
            "units": "...",
            "warnings": [],
            "provenance": {...}
        }
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    if region_artifact is None and not region_name:
        raise ValueError("Either region_name or region_artifact must be provided.")

    warnings: list[str] = []

    if region_artifact is None:
        region_artifact = resolve_region(region_name=region_name)

    if region_artifact.get("artifact_type") != "region":
        return _make_failure_artifact(
            warning=(
                "Could not clip because the region could not be resolved. "
                f"Region artifact type: {region_artifact.get('artifact_type')}"
            ),
            input_artifact=input_artifact,
            region_name=region_name,
            suggestions=region_artifact.get("suggestions", []),
        )

    resolved_region_name = region_artifact.get("resolved_name") or region_name

    try:
        input_gdf = _artifact_to_gdf(input_artifact)
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not convert input artifact to GeoDataFrame: {exc}",
            input_artifact=input_artifact,
            region_name=resolved_region_name,
        )

    try:
        region_gdf = _region_artifact_to_gdf(region_artifact)
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Could not convert region artifact to GeoDataFrame: {exc}",
            input_artifact=input_artifact,
            region_name=resolved_region_name,
        )

    if input_gdf.empty:
        return _make_failure_artifact(
            warning="Input artifact contains no spatial features.",
            input_artifact=input_artifact,
            region_name=resolved_region_name,
        )

    if region_gdf.empty:
        return _make_failure_artifact(
            warning="Region artifact contains no geometry.",
            input_artifact=input_artifact,
            region_name=resolved_region_name,
        )

    input_gdf = input_gdf.to_crs("EPSG:4326")
    region_gdf = region_gdf.to_crs("EPSG:4326")

    try:
        clipped_gdf = gpd.clip(input_gdf, region_gdf)
    except Exception as exc:
        return _make_failure_artifact(
            warning=f"Geospatial clipping failed: {exc}",
            input_artifact=input_artifact,
            region_name=resolved_region_name,
        )

    clipped_gdf = clipped_gdf.reset_index(drop=True)

    if clipped_gdf.empty and not keep_empty:
        return _make_failure_artifact(
            warning=(
                "Clipping produced no features. The input layer may not overlap "
                f"the requested region '{resolved_region_name}'."
            ),
            input_artifact=input_artifact,
            region_name=resolved_region_name,
        )

    if clipped_gdf.empty:
        warnings.append(
            f"Clipping produced no features for region '{resolved_region_name}'."
        )

    geojson = json.loads(clipped_gdf.to_json())

    parent_provenance = input_artifact.get("provenance", {})

    return {
        "artifact_type": "clipped_layer",
        "input_artifact_type": input_artifact.get("artifact_type"),
        "input_layer_id": input_artifact.get("layer_id"),
        "variable": input_artifact.get("variable"),
        "source_variable": input_artifact.get("source_variable"),
        "region_name": resolved_region_name,
        "admin_level": region_artifact.get("admin_level"),
        "period": input_artifact.get("period"),
        "start_year": input_artifact.get("start_year"),
        "end_year": input_artifact.get("end_year"),
        "scenario": input_artifact.get("scenario"),
        "scenario_code": input_artifact.get("scenario_code"),
        "model": input_artifact.get("model"),
        "variant": input_artifact.get("variant"),
        "geojson": geojson,
        "feature_count": int(len(clipped_gdf)),
        "bbox": _clean_total_bounds(clipped_gdf),
        "crs": "EPSG:4326",
        "value_column": input_artifact.get("value_column"),
        "units": input_artifact.get("units"),
        "uncertainty_columns": input_artifact.get("uncertainty_columns", []),
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "method": "geopandas_clip",
            "region_resolution": region_artifact.get("provenance"),
            "parent_artifact_provenance": parent_provenance,
        },
    }