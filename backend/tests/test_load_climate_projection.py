from pathlib import Path
import json
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[2]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import load_climate_projection


REGISTRY_PATH = REPO_ROOT / "data" / "layers" / "climate_layer_registry.json"


def load_registry():
    if not REGISTRY_PATH.exists():
        return []

    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_first_available_layer():
    registry = load_registry()

    for entry in registry:
        layer_path = REPO_ROOT / entry["path"]

        if layer_path.exists():
            return entry

    return None


def assert_valid_climate_layer_artifact(result):
    assert result["artifact_type"] == "climate_layer"
    assert result["layer_id"] is not None
    assert result["variable"] is not None
    assert result["region_name"] is not None
    assert result["period"] is not None
    assert result["geojson"] is not None
    assert result["feature_count"] > 0
    assert result["bbox"] is not None
    assert result["crs"] == "EPSG:4326"
    assert result["value_column"] is not None
    assert result["units"] is not None
    assert isinstance(result["warnings"], list)
    assert isinstance(result["suggestions"], list)
    assert isinstance(result["provenance"], dict)

    assert result["geojson"]["type"] == "FeatureCollection"
    assert len(result["geojson"]["features"]) > 0

    bbox = result["bbox"]
    assert len(bbox) == 4
    assert all(isinstance(x, float) for x in bbox)


def test_load_first_available_registered_layer():
    entry = get_first_available_layer()

    if entry is None:
        pytest.skip(
            "No processed climate layer exists yet. "
            "Run backend/scripts/build_climate_layer_from_nex.py first."
        )

    result = load_climate_projection(
        variable=entry["variable"],
        region_name=entry["region_name"],
        period=entry["period"],
        scenario=entry.get("scenario"),
        model=entry.get("model"),
    )

    assert_valid_climate_layer_artifact(result)

    assert result["layer_id"] == entry["layer_id"]
    assert result["variable"] == entry["variable"]
    assert result["region_name"] == entry["region_name"]
    assert result["period"] == entry["period"]
    assert result["scenario"] == entry.get("scenario")
    assert result["model"] == entry.get("model")


def test_load_fiji_extreme_heat_layer_if_available():
    registry = load_registry()

    matching_entries = [
        entry
        for entry in registry
        if entry.get("variable") == "extreme_heat_days"
        and entry.get("region_name") == "Fiji"
        and entry.get("period") == "2050s"
        and (REPO_ROOT / entry["path"]).exists()
    ]

    if not matching_entries:
        pytest.skip(
            "Fiji extreme_heat_days 2050s layer not available yet. "
            "Run backend/scripts/build_climate_layer_from_nex.py first."
        )

    entry = matching_entries[0]

    result = load_climate_projection(
        variable="extreme_heat_days",
        region_name="Fiji",
        period="2050s",
        scenario=entry.get("scenario"),
        model=entry.get("model"),
    )

    assert_valid_climate_layer_artifact(result)

    assert result["variable"] == "extreme_heat_days"
    assert result["region_name"] == "Fiji"
    assert result["period"] == "2050s"
    assert result["value_column"] == "extreme_heat_days_mean"


def test_period_normalization_if_2050s_layer_available():
    registry = load_registry()

    matching_entries = [
        entry
        for entry in registry
        if entry.get("variable") == "extreme_heat_days"
        and entry.get("region_name") == "Fiji"
        and entry.get("period") == "2050s"
        and (REPO_ROOT / entry["path"]).exists()
    ]

    if not matching_entries:
        pytest.skip(
            "Fiji extreme_heat_days 2050s layer not available yet. "
            "Run backend/scripts/build_climate_layer_from_nex.py first."
        )

    entry = matching_entries[0]

    result = load_climate_projection(
        variable="extreme_heat_days",
        region_name="Fiji",
        period="2050",
        scenario=entry.get("scenario"),
        model=entry.get("model"),
    )

    assert_valid_climate_layer_artifact(result)

    assert result["period"] == "2050s"


def test_scenario_code_normalization_if_layer_available():
    registry = load_registry()

    matching_entries = [
        entry
        for entry in registry
        if entry.get("variable") == "extreme_heat_days"
        and entry.get("region_name") == "Fiji"
        and entry.get("period") == "2050s"
        and entry.get("scenario_code") == "ssp245"
        and (REPO_ROOT / entry["path"]).exists()
    ]

    if not matching_entries:
        pytest.skip(
            "Fiji SSP2-4.5 / ssp245 layer not available yet. "
            "Run backend/scripts/build_climate_layer_from_nex.py first."
        )

    entry = matching_entries[0]

    result = load_climate_projection(
        variable="extreme_heat_days",
        region_name="Fiji",
        period="2050s",
        scenario="ssp245",
        model=entry.get("model"),
    )

    assert_valid_climate_layer_artifact(result)

    assert result["scenario"] == "SSP2-4.5"
    assert result["scenario_code"] == "ssp245"


def test_missing_layer_fails_cleanly():
    result = load_climate_projection(
        variable="definitely_not_a_real_variable",
        region_name="Fiji",
        period="2099s",
        scenario="SSP2-4.5",
    )

    assert result["artifact_type"] == "climate_layer_load_failed"
    assert result["layer_id"] is None
    assert result["geojson"] is None
    assert result["value_column"] is None
    assert result["warnings"]


def test_invalid_geometry_format_raises_error():
    with pytest.raises(ValueError):
        load_climate_projection(
            variable="extreme_heat_days",
            region_name="Fiji",
            period="2050s",
            return_geometry_format="wkt",
        )


def test_empty_variable_raises_error():
    with pytest.raises(ValueError):
        load_climate_projection(
            variable="",
            region_name="Fiji",
            period="2050s",
        )


def test_empty_region_name_raises_error():
    with pytest.raises(ValueError):
        load_climate_projection(
            variable="extreme_heat_days",
            region_name="",
            period="2050s",
        )


def test_empty_period_raises_error():
    with pytest.raises(ValueError):
        load_climate_projection(
            variable="extreme_heat_days",
            region_name="Fiji",
            period="",
        )