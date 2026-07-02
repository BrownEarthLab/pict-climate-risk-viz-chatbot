from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional
from difflib import get_close_matches

import geopandas as gpd
from shapely.geometry import mapping

REPO_ROOT = Path(__file__).resolve().parents[3]

REFERENCE_DIR = REPO_ROOT / "data" / "reference"
PICT_REGIONS_PATH = REFERENCE_DIR / "pict_regions.geojson"
REGION_ALIASES_PATH = REFERENCE_DIR / "region_aliases.json"


def _normalize_text(value: str) -> str:
    """
    Normalize text for matching user-provided place names.
    """
    return value.lower().strip()


def _load_region_aliases() -> Dict[str, str]:
    """
    Load user-facing aliases and map them to canonical region names.

    Example:
        "png" -> "Papua New Guinea"
        "the solomons" -> "Solomon Islands"
    """
    if not REGION_ALIASES_PATH.exists():
        return {}

    with open(REGION_ALIASES_PATH, "r", encoding="utf-8") as f:
        aliases = json.load(f)

    return {
        _normalize_text(alias): canonical_name
        for alias, canonical_name in aliases.items()
    }


def _load_reference_regions() -> gpd.GeoDataFrame:
    """
    Load the reference PICT geography file.
    """
    if not PICT_REGIONS_PATH.exists():
        raise FileNotFoundError(
            f"Missing reference geography file: {PICT_REGIONS_PATH}"
        )

    regions = gpd.read_file(PICT_REGIONS_PATH)

    required_columns = {"name", "admin_level", "geometry"}
    missing_columns = required_columns - set(regions.columns)

    if missing_columns:
        raise ValueError(
            "pict_regions.geojson is missing required columns: "
            f"{sorted(missing_columns)}"
        )

    if regions.crs is None:
        regions = regions.set_crs("EPSG:4326")
    else:
        regions = regions.to_crs("EPSG:4326")

    return regions


def _make_failure_artifact(
    region_name: str,
    warning: str,
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    """
    Return a standardized failure artifact.

    This is better than throwing an error because the chatbot can use
    the suggestions to ask a clarifying question.
    """
    return {
        "artifact_type": "region_resolution_failed",
        "input_region_name": region_name,
        "resolved_name": None,
        "admin_level": None,
        "geometry": None,
        "bbox": None,
        "crs": "EPSG:4326",
        "warnings": [warning],
        "suggestions": suggestions or [],
        "provenance": {
            "source": str(PICT_REGIONS_PATH),
            "method": "alias_match_then_exact_match_then_partial_match",
        },
    }


def resolve_region(
    region_name: str,
    admin_level: Optional[str] = None,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Resolve a human-readable place name into a spatial region artifact.

    This function is the first step in most chatbot workflows.

    Example:
        resolve_region("Fiji")

    Returns:
        {
            "artifact_type": "region",
            "input_region_name": "Fiji",
            "resolved_name": "Fiji",
            "admin_level": "country",
            "geometry": {...},
            "bbox": [minx, miny, maxx, maxy],
            "crs": "EPSG:4326",
            "warnings": [],
            "suggestions": [],
            "provenance": {...}
        }
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    if not region_name or not region_name.strip():
        raise ValueError("region_name must be a non-empty string.")

    warnings: list[str] = []

    aliases = _load_region_aliases()
    regions = _load_reference_regions()

    input_name_normalized = _normalize_text(region_name)
    canonical_name = aliases.get(input_name_normalized, region_name)
    canonical_name_normalized = _normalize_text(canonical_name)

    candidate_regions = regions.copy()

    if admin_level is not None:
        candidate_regions = candidate_regions[
            candidate_regions["admin_level"]
            .astype(str)
            .str.lower()
            .str.strip()
            == _normalize_text(admin_level)
        ]

        if candidate_regions.empty:
            return _make_failure_artifact(
                region_name=region_name,
                warning=(
                    f"No regions found with admin_level='{admin_level}'. "
                    "Try removing the admin_level constraint."
                ),
            )

    # 1. Exact match after alias resolution
    exact_matches = candidate_regions[
        candidate_regions["name"]
        .astype(str)
        .str.lower()
        .str.strip()
        == canonical_name_normalized
    ]

    # 2. Partial match fallback
    if exact_matches.empty:
        partial_matches = candidate_regions[
            candidate_regions["name"]
            .astype(str)
            .str.lower()
            .str.contains(canonical_name_normalized, na=False)
        ]

        if not partial_matches.empty:
            suggestions = partial_matches["name"].dropna().unique().tolist()

            return {
                "artifact_type": "region_resolution_ambiguous",
                "input_region_name": region_name,
                "resolved_name": None,
                "admin_level": admin_level,
                "geometry": None,
                "bbox": None,
                "crs": "EPSG:4326",
                "warnings": [
                    f"Region '{region_name}' was ambiguous. "
                    "The chatbot should ask the user to choose one of the suggestions."
                ],
                "suggestions": suggestions,
                "provenance": {
                    "source": str(PICT_REGIONS_PATH),
                    "method": "partial_name_match",
                    "alias_used": canonical_name if canonical_name != region_name else None,
                },
            }

    # 3. Fuzzy suggestions if no exact or partial match
    if exact_matches.empty:
        all_names = candidate_regions["name"].dropna().astype(str).unique().tolist()
        suggestions = get_close_matches(canonical_name, all_names, n=5, cutoff=0.5)

        return _make_failure_artifact(
            region_name=region_name,
            warning=f"Could not resolve region '{region_name}' in PICT reference geography.",
            suggestions=suggestions,
        )

    # If multiple exact rows match, dissolve into one region artifact.
    if len(exact_matches) > 1:
        warnings.append(
            f"Multiple geometries matched '{canonical_name}'. "
            "They were dissolved into a single geometry."
        )

    dissolved = exact_matches.dissolve()

    geometry = mapping(dissolved.geometry.iloc[0])
    bbox = [float(x) for x in dissolved.total_bounds]

    resolved_names = exact_matches["name"].dropna().astype(str).unique().tolist()
    resolved_admin_levels = (
        exact_matches["admin_level"].dropna().astype(str).unique().tolist()
    )

    resolved_name = resolved_names[0] if len(resolved_names) == 1 else canonical_name
    resolved_admin_level = (
        resolved_admin_levels[0]
        if len(resolved_admin_levels) == 1
        else "mixed"
    )

    return {
        "artifact_type": "region",
        "input_region_name": region_name,
        "resolved_name": resolved_name,
        "admin_level": resolved_admin_level,
        "geometry": geometry,
        "bbox": bbox,
        "crs": "EPSG:4326",
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "source": str(PICT_REGIONS_PATH),
            "method": "alias_match_then_exact_match",
            "alias_used": canonical_name if canonical_name != region_name else None,
        },
    }