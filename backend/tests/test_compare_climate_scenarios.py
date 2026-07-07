from pathlib import Path
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import compare_climate_scenarios


def make_climate_artifact(
    scenario,
    scenario_code,
    values,
    layer_id=None,
    period="2050s",
):
    """
    Create a tiny climate layer artifact with matching cell_ids.
    """
    features = []

    for i, value in enumerate(values):
        lon = 177.0 + i * 0.2
        lat = -18.0

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "cell_id": f"cell_{i + 1}",
                    "extreme_heat_days_mean": value,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [lon, lat],
                            [lon + 0.1, lat],
                            [lon + 0.1, lat + 0.1],
                            [lon, lat + 0.1],
                            [lon, lat],
                        ]
                    ],
                },
            }
        )

    return {
        "artifact_type": "climate_layer",
        "layer_id": layer_id or f"fiji_extreme_heat_days_{period}_{scenario_code}",
        "variable": "extreme_heat_days",
        "region_name": "Fiji",
        "period": period,
        "scenario": scenario,
        "scenario_code": scenario_code,
        "model": "ACCESS-CM2",
        "variant": "r1i1p1f1",
        "geojson": {
            "type": "FeatureCollection",
            "features": features,
        },
        "feature_count": len(features),
        "bbox": [177.0, -18.0, 177.5, -17.9],
        "crs": "EPSG:4326",
        "value_column": "extreme_heat_days_mean",
        "units": "days/year",
        "uncertainty_columns": [],
        "warnings": [],
        "suggestions": [],
        "provenance": {
            "source": "test",
        },
    }


def assert_valid_scenario_comparison_artifact(result):
    assert result["artifact_type"] == "climate_scenario_comparison"
    assert result["layer_id"] is not None
    assert result["variable"] == "extreme_heat_days"
    assert result["region_name"] == "Fiji"
    assert result["period"] == "2050s"
    assert result["geojson"] is not None
    assert result["geojson"]["type"] == "FeatureCollection"
    assert result["feature_count"] > 0
    assert result["bbox"] is not None
    assert result["crs"] == "EPSG:4326"
    assert result["value_column"] == "scenario_range"
    assert result["units"] == "days/year"
    assert isinstance(result["scenarios"], list)
    assert isinstance(result["comparison_columns"], dict)
    assert isinstance(result["summary"], dict)
    assert isinstance(result["warnings"], list)
    assert isinstance(result["suggestions"], list)
    assert isinstance(result["provenance"], dict)

    bbox = result["bbox"]
    assert len(bbox) == 4
    assert all(isinstance(x, float) for x in bbox)


def test_compare_climate_scenarios_with_artifacts():
    layer_ssp245 = make_climate_artifact(
        scenario="SSP2-4.5",
        scenario_code="ssp245",
        values=[10, 20, 30],
        layer_id="heat_ssp245",
    )

    layer_ssp585 = make_climate_artifact(
        scenario="SSP5-8.5",
        scenario_code="ssp585",
        values=[15, 30, 50],
        layer_id="heat_ssp585",
    )

    result = compare_climate_scenarios(
        climate_artifacts=[layer_ssp245, layer_ssp585],
    )

    assert_valid_scenario_comparison_artifact(result)

    assert result["scenarios"] == ["SSP2-4.5", "SSP5-8.5"]
    assert result["model"] == "ACCESS-CM2"

    columns = result["comparison_columns"]

    assert "scenario_value_columns" in columns
    assert columns["scenario_min_column"] == "scenario_min"
    assert columns["scenario_max_column"] == "scenario_max"
    assert columns["scenario_mean_column"] == "scenario_mean"
    assert columns["scenario_range_column"] == "scenario_range"
    assert columns["highest_scenario_column"] == "highest_scenario"
    assert columns["lowest_scenario_column"] == "lowest_scenario"

    scenario_columns = columns["scenario_value_columns"]

    assert scenario_columns["SSP2-4.5"] == "extreme_heat_days_mean_ssp245"
    assert scenario_columns["SSP5-8.5"] == "extreme_heat_days_mean_ssp585"

    summary = result["summary"]

    assert summary["feature_count"] == 3
    assert summary["scenario_means"]["SSP2-4.5"] == pytest.approx(20.0)
    assert summary["scenario_means"]["SSP5-8.5"] == pytest.approx(31.6666666667)
    assert summary["scenario_range_mean"] == pytest.approx(11.6666666667)
    assert summary["scenario_range_min"] == pytest.approx(5.0)
    assert summary["scenario_range_max"] == pytest.approx(20.0)


def test_scenario_comparison_geojson_contains_expected_columns():
    layer_ssp245 = make_climate_artifact(
        scenario="SSP2-4.5",
        scenario_code="ssp245",
        values=[10, 20],
    )

    layer_ssp585 = make_climate_artifact(
        scenario="SSP5-8.5",
        scenario_code="ssp585",
        values=[15, 10],
    )

    result = compare_climate_scenarios(
        climate_artifacts=[layer_ssp245, layer_ssp585],
    )

    assert_valid_scenario_comparison_artifact(result)

    features = result["geojson"]["features"]

    assert len(features) == 2

    props_1 = features[0]["properties"]
    props_2 = features[1]["properties"]

    expected_columns = [
        "extreme_heat_days_mean_ssp245",
        "extreme_heat_days_mean_ssp585",
        "scenario_min",
        "scenario_max",
        "scenario_mean",
        "scenario_range",
        "highest_scenario",
        "lowest_scenario",
    ]

    for column in expected_columns:
        assert column in props_1
        assert column in props_2

    ranges = [feature["properties"]["scenario_range"] for feature in features]
    highest = [feature["properties"]["highest_scenario"] for feature in features]
    lowest = [feature["properties"]["lowest_scenario"] for feature in features]

    assert ranges == [5, 10]
    assert highest == ["SSP5-8.5", "SSP2-4.5"]
    assert lowest == ["SSP2-4.5", "SSP5-8.5"]


def test_compare_three_scenarios():
    layer_ssp126 = make_climate_artifact(
        scenario="SSP1-2.6",
        scenario_code="ssp126",
        values=[5, 10],
    )

    layer_ssp245 = make_climate_artifact(
        scenario="SSP2-4.5",
        scenario_code="ssp245",
        values=[10, 20],
    )

    layer_ssp585 = make_climate_artifact(
        scenario="SSP5-8.5",
        scenario_code="ssp585",
        values=[20, 40],
    )

    result = compare_climate_scenarios(
        climate_artifacts=[layer_ssp126, layer_ssp245, layer_ssp585],
    )

    assert_valid_scenario_comparison_artifact(result)

    assert result["scenarios"] == ["SSP1-2.6", "SSP2-4.5", "SSP5-8.5"]

    features = result["geojson"]["features"]
    ranges = [feature["properties"]["scenario_range"] for feature in features]

    assert ranges == [15, 30]
    assert result["summary"]["scenario_range_mean"] == pytest.approx(22.5)


def test_compare_with_explicit_value_column():
    layer_ssp245 = make_climate_artifact(
        scenario="SSP2-4.5",
        scenario_code="ssp245",
        values=[10, 20],
    )

    layer_ssp585 = make_climate_artifact(
        scenario="SSP5-8.5",
        scenario_code="ssp585",
        values=[30, 50],
    )

    result = compare_climate_scenarios(
        climate_artifacts=[layer_ssp245, layer_ssp585],
        value_column="extreme_heat_days_mean",
    )

    assert_valid_scenario_comparison_artifact(result)

    assert result["summary"]["scenario_range_mean"] == pytest.approx(25.0)


def test_mismatched_cell_ids_inner_join():
    layer_ssp245 = make_climate_artifact(
        scenario="SSP2-4.5",
        scenario_code="ssp245",
        values=[10, 20, 30],
    )

    layer_ssp585 = make_climate_artifact(
        scenario="SSP5-8.5",
        scenario_code="ssp585",
        values=[15, 25, 35],
    )

    # Remove one matching cell from SSP5-8.5.
    layer_ssp585["geojson"]["features"] = layer_ssp585["geojson"]["features"][:2]

    result = compare_climate_scenarios(
        climate_artifacts=[layer_ssp245, layer_ssp585],
    )

    assert_valid_scenario_comparison_artifact(result)

    assert result["feature_count"] == 2
    assert result["summary"]["feature_count"] == 2


def test_missing_value_column_fails_cleanly():
    layer_ssp245 = make_climate_artifact(
        scenario="SSP2-4.5",
        scenario_code="ssp245",
        values=[10, 20],
    )

    layer_ssp585 = make_climate_artifact(
        scenario="SSP5-8.5",
        scenario_code="ssp585",
        values=[15, 25],
    )

    result = compare_climate_scenarios(
        climate_artifacts=[layer_ssp245, layer_ssp585],
        value_column="not_a_real_column",
    )

    assert result["artifact_type"] == "climate_scenario_comparison_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_missing_geojson_fails_cleanly():
    layer_ssp245 = make_climate_artifact(
        scenario="SSP2-4.5",
        scenario_code="ssp245",
        values=[10, 20],
    )

    layer_ssp585 = make_climate_artifact(
        scenario="SSP5-8.5",
        scenario_code="ssp585",
        values=[15, 25],
    )

    del layer_ssp245["geojson"]

    result = compare_climate_scenarios(
        climate_artifacts=[layer_ssp245, layer_ssp585],
    )

    assert result["artifact_type"] == "climate_scenario_comparison_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_empty_artifact_fails_cleanly():
    layer_ssp245 = make_climate_artifact(
        scenario="SSP2-4.5",
        scenario_code="ssp245",
        values=[],
    )

    layer_ssp585 = make_climate_artifact(
        scenario="SSP5-8.5",
        scenario_code="ssp585",
        values=[],
    )

    result = compare_climate_scenarios(
        climate_artifacts=[layer_ssp245, layer_ssp585],
    )

    assert result["artifact_type"] == "climate_scenario_comparison_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_requires_at_least_two_artifacts():
    layer_ssp245 = make_climate_artifact(
        scenario="SSP2-4.5",
        scenario_code="ssp245",
        values=[10, 20],
    )

    result = compare_climate_scenarios(
        climate_artifacts=[layer_ssp245],
    )

    assert result["artifact_type"] == "climate_scenario_comparison_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_invalid_geometry_format_raises_error():
    layer_ssp245 = make_climate_artifact(
        scenario="SSP2-4.5",
        scenario_code="ssp245",
        values=[10, 20],
    )

    layer_ssp585 = make_climate_artifact(
        scenario="SSP5-8.5",
        scenario_code="ssp585",
        values=[15, 25],
    )

    with pytest.raises(ValueError):
        compare_climate_scenarios(
            climate_artifacts=[layer_ssp245, layer_ssp585],
            return_geometry_format="wkt",
        )


def test_missing_variable_when_loading_internally_fails_cleanly():
    result = compare_climate_scenarios(
        region_name="Fiji",
        period="2050s",
        scenarios=["SSP2-4.5", "SSP5-8.5"],
        model="ACCESS-CM2",
    )

    assert result["artifact_type"] == "climate_scenario_comparison_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_missing_scenarios_when_loading_internally_fails_cleanly():
    result = compare_climate_scenarios(
        variable="extreme_heat_days",
        region_name="Fiji",
        period="2050s",
        scenarios=["SSP2-4.5"],
        model="ACCESS-CM2",
    )

    assert result["artifact_type"] == "climate_scenario_comparison_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_missing_registered_layer_fails_cleanly():
    result = compare_climate_scenarios(
        variable="definitely_not_a_real_variable",
        region_name="Fiji",
        period="2050s",
        scenarios=["SSP2-4.5", "SSP5-8.5"],
        model="ACCESS-CM2",
    )

    assert result["artifact_type"] == "climate_scenario_comparison_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]