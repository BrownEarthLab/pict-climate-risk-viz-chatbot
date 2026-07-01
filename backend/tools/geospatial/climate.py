from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional
from difflib import get_close_matches

import geopandas as gpd


# climate.py lives at:
# backend/tools/geospatial/climate.py
#
# parents[0] = geospatial
# parents[1] = tools
# parents[2] = backend
# parents[3] = repo root
REPO_ROOT = Path(__file__).resolve().parents[3]

REGISTRY_PATH = REPO_ROOT / "data" / "layers" / "climate_layer_registry.json"


def _normalize_text(value: Any) -> str:
    return str(value).lower().strip()


def _normalize_period(period: Any) -> str:
    """
    Normalize common user-facing period inputs.

    Examples:
        "2050"  -> "2050s"
        2050    -> "2050s"
        "2050s" -> "2050s"
    """
    period_str = str(period).strip()

    if period_str.isdigit() and len(period_str) == 4:
        return f"{period_str}s"

    return period_str


def _normalize_scenario(scenario: Optional[str]) -> Optional[str]:
    """
    Normalize scenario names so users/LLMs can pass either SSP2-4.5 or ssp245.
    """
    if scenario is None:
        return None

    scenario_clean = scenario.strip()

    mapping = {
        "ssp245": "SSP2-4.5",
        "ssp2-4.5": "SSP2-4.5",
        "ssp2_4_5": "SSP2-4.5",
        "SSP2-4.5": "SSP2-4.5",

        "ssp585": "SSP5-8.5",
        "ssp5-8.5": "SSP5-8.5",
        "ssp5_8_5": "SSP5-8.5",
        "SSP5-8.5": "SSP5-8.5"
    }

    return mapping.get(scenario_clean, scenario_clean)


def _load_registry() -> list[Dict[str, Any]]:
    """
    Load the climate layer registry.

    The registry is a list of layer metadata objects. Each entry should point
    to a processed climate layer on disk.
    """
    if not REGISTRY_PATH.exists():
        raise FileNotFoundError(
            f"Missing climate layer registry: {REGISTRY_PATH}"
        )

    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        registry = json.load(f)

    if not isinstance(registry, list):
        raise ValueError("climate_layer_registry.json must contain a JSON list.")

    return registry


def _make_failure_artifact(
    variable: str,
    region_name: str,
    period: str,
    scenario: Optional[str],
    warning: str,
    suggestions: Optional[list[str]] = None,
) -> Dict[str, Any]:
    return {
        "artifact_type": "climate_layer_load_failed",
        "layer_id": None,
        "variable": variable,
        "region_name": region_name,
        "period": period,
        "scenario": scenario,
        "geojson": None,
        "value_column": None,
        "units": None,
        "warnings": [warning],
        "suggestions": suggestions or [],
        "provenance": {
            "registry": str(REGISTRY_PATH),
            "method": "registry_lookup",
        },
    }


def _entry_matches(
    entry: Dict[str, Any],
    variable: str,
    region_name: str,
    period: str,
    scenario: Optional[str],
    model: Optional[str],
) -> bool:
    variable_matches = (
        _normalize_text(entry.get("variable")) == _normalize_text(variable)
    )

    region_matches = (
        _normalize_text(entry.get("region_name")) == _normalize_text(region_name)
    )

    period_matches = (
        _normalize_text(entry.get("period")) == _normalize_text(period)
    )

    if scenario is None:
        scenario_matches = True
    else:
        scenario_matches = (
            _normalize_text(entry.get("scenario")) == _normalize_text(scenario)
            or _normalize_text(entry.get("scenario_code")) == _normalize_text(scenario)
        )

    if model is None:
        model_matches = True
    else:
        model_matches = (
            _normalize_text(entry.get("model")) == _normalize_text(model)
        )

    return (
        variable_matches
        and region_matches
        and period_matches
        and scenario_matches
        and model_matches
    )


def _get_layer_suggestions(
    registry: list[Dict[str, Any]],
    variable: str,
    region_name: str,
    period: str,
) -> list[str]:
    """
    Return helpful suggestions if the exact layer is not found.
    """
    layer_descriptions = []

    for entry in registry:
        description = (
            f"{entry.get('variable')} | "
            f"{entry.get('region_name')} | "
            f"{entry.get('period')} | "
            f"{entry.get('scenario')} | "
            f"{entry.get('model')}"
        )
        layer_descriptions.append(description)

    query = f"{variable} | {region_name} | {period}"

    return get_close_matches(
        query,
        layer_descriptions,
        n=5,
        cutoff=0.2,
    )


def _resolve_layer_path(path_value: str) -> Path:
    """
    Convert a registry path into an absolute path.

    Registry paths should usually be relative to the repo root, e.g.
        data/climate/processed/fiji_extreme_heat_days_2050s_ssp245_access_cm2.geojson
    """
    path = Path(path_value)

    if path.is_absolute():
        return path

    return REPO_ROOT / path


def load_climate_projection(
    variable: str,
    region_name: str,
    period: str,
    scenario: Optional[str] = None,
    model: Optional[str] = None,
    return_geometry_format: str = "geojson",
) -> Dict[str, Any]:
    """
    Load a processed climate projection layer from the climate layer registry.

    This is the second core chatbot wrapper.

    Example:
        load_climate_projection(
            variable="extreme_heat_days",
            region_name="Fiji",
            period="2050s",
            scenario="SSP2-4.5"
        )

    Returns:
        {
            "artifact_type": "climate_layer",
            "layer_id": "...",
            "variable": "extreme_heat_days",
            "region_name": "Fiji",
            "period": "2050s",
            "scenario": "SSP2-4.5",
            "geojson": {...},
            "value_column": "extreme_heat_days_mean",
            "units": "days/year",
            "warnings": [],
            "provenance": {...}
        }
    """

    if return_geometry_format != "geojson":
        raise ValueError("Only return_geometry_format='geojson' is currently supported.")

    if not variable or not variable.strip():
        raise ValueError("variable must be a non-empty string.")

    if not region_name or not region_name.strip():
        raise ValueError("region_name must be a non-empty string.")

    if not period or not str(period).strip():
        raise ValueError("period must be a non-empty string.")

    normalized_period = _normalize_period(period)
    normalized_scenario = _normalize_scenario(scenario)

    registry = _load_registry()

    matches = [
        entry for entry in registry
        if _entry_matches(
            entry=entry,
            variable=variable,
            region_name=region_name,
            period=normalized_period,
            scenario=normalized_scenario,
            model=model,
        )
    ]

    if not matches:
        suggestions = _get_layer_suggestions(
            registry=registry,
            variable=variable,
            region_name=region_name,
            period=normalized_period,
        )

        return _make_failure_artifact(
            variable=variable,
            region_name=region_name,
            period=normalized_period,
            scenario=normalized_scenario,
            warning=(
                "Could not find a matching climate layer in the registry for "
                f"variable='{variable}', region_name='{region_name}', "
                f"period='{normalized_period}', scenario='{normalized_scenario}', "
                f"model='{model}'."
            ),
            suggestions=suggestions,
        )

    warnings: list[str] = []

    if len(matches) > 1:
        warnings.append(
            "Multiple matching climate layers were found. "
            "Using the first match. Consider specifying a model."
        )

    layer_entry = matches[0]

    if "path" not in layer_entry:
        return _make_failure_artifact(
            variable=variable,
            region_name=region_name,
            period=normalized_period,
            scenario=normalized_scenario,
            warning=f"Matched layer '{layer_entry.get('layer_id')}' has no path field.",
        )

    layer_path = _resolve_layer_path(layer_entry["path"])

    if not layer_path.exists():
        return _make_failure_artifact(
            variable=variable,
            region_name=region_name,
            period=normalized_period,
            scenario=normalized_scenario,
            warning=f"Matched layer file does not exist: {layer_path}",
        )

    gdf = gpd.read_file(layer_path)

    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
        warnings.append(
            "Loaded layer had no CRS. Assumed EPSG:4326."
        )
    else:
        gdf = gdf.to_crs("EPSG:4326")

    if gdf.empty:
        warnings.append("Loaded climate layer contains no features.")

    value_column = layer_entry.get("value_column")

    if value_column and value_column not in gdf.columns:
        warnings.append(
            f"Registry value_column '{value_column}' was not found in the loaded layer."
        )

    geojson = json.loads(gdf.to_json())

    return {
        "artifact_type": "climate_layer",
        "layer_id": layer_entry.get("layer_id"),
        "variable": layer_entry.get("variable", variable),
        "source_variable": layer_entry.get("source_variable"),
        "region_name": layer_entry.get("region_name", region_name),
        "period": layer_entry.get("period", normalized_period),
        "start_year": layer_entry.get("start_year"),
        "end_year": layer_entry.get("end_year"),
        "scenario": layer_entry.get("scenario", normalized_scenario),
        "scenario_code": layer_entry.get("scenario_code"),
        "model": layer_entry.get("model"),
        "variant": layer_entry.get("variant"),
        "geojson": geojson,
        "feature_count": int(len(gdf)),
        "bbox": [float(x) for x in gdf.total_bounds],
        "crs": "EPSG:4326",
        "value_column": value_column,
        "units": layer_entry.get("units"),
        "uncertainty_columns": layer_entry.get("uncertainty_columns", []),
        "warnings": warnings,
        "suggestions": [],
        "provenance": {
            "registry": str(REGISTRY_PATH),
            "layer_path": str(layer_path),
            "source_dataset": layer_entry.get("source_dataset"),
            "source_access_method": layer_entry.get("source_access_method"),
            "source_url_base": layer_entry.get("source_url_base"),
            "description": layer_entry.get("description"),
            "method": "registry_lookup_then_geojson_load",
        },
    }