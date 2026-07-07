from pathlib import Path
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import get_threshold_exceedance


def make_climate_artifact(values, value_column="extreme_heat_days_mean"):
    """
    Create a tiny climate layer artifact for threshold tests.
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
                    value_column: value,
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
        "layer_id": "fiji_extreme_heat_days_2050s_ssp245_access_cm2",
        "variable": "extreme_heat_days",
        "source_variable": "tasmax",
        "region_name": "Fiji",
        "period": "2050s",
        "start_year": 2041,
        "end_year": 2060,
        "scenario": "SSP2-4.5",
        "scenario_code": "ssp245",
        "model": "ACCESS-CM2",
        "variant": "r1i1p1f1",
        "geojson": {
            "type": "FeatureCollection",
            "features": features,
        },
        "feature_count": len(features),
        "bbox": [177.0, -18.0, 177.5, -17.9],
        "crs": "EPSG:4326",
        "value_column": value_column,
        "units": "days/year",
        "uncertainty_columns": [],
        "warnings": [],
        "suggestions": [],
        "provenance": {
            "source": "test",
        },
    }


def assert_valid_threshold_artifact(result):
    assert result["artifact_type"] == "threshold_exceedance_layer"
    assert result["input_artifact_type"] is not None
    assert result["input_layer_id"] is not None
    assert result["layer_id"] is not None
    assert result["variable"] == "extreme_heat_days"
    assert result["source_variable"] == "tasmax"
    assert result["region_name"] == "Fiji"
    assert result["period"] == "2050s"
    assert result["start_year"] == 2041
    assert result["end_year"] == 2060
    assert result["scenario"] == "SSP2-4.5"
    assert result["scenario_code"] == "ssp245"
    assert result["model"] == "ACCESS-CM2"
    assert result["variant"] == "r1i1p1f1"
    assert result["value_column"] == "threshold_difference"
    assert result["source_value_column"] == "extreme_heat_days_mean"
    assert result["units"] == "days/year"
    assert result["geojson"] is not None
    assert result["geojson"]["type"] == "FeatureCollection"
    assert result["crs"] == "EPSG:4326"
    assert isinstance(result["summary"], dict)
    assert isinstance(result["warnings"], list)
    assert isinstance(result["suggestions"], list)
    assert isinstance(result["provenance"], dict)


def test_get_threshold_exceedance_with_artifact():
    artifact = make_climate_artifact(values=[10, 20, 30])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=20,
        comparison_operator=">=",
        clip_to_region=False,
    )

    assert_valid_threshold_artifact(result)

    assert result["threshold"] == pytest.approx(20.0)
    assert result["comparison_operator"] == ">="
    assert result["feature_count"] == 2
    assert result["input_feature_count"] == 3
    assert result["exceedance_count"] == 2
    assert result["non_exceedance_count"] == 1
    assert result["valid_count"] == 3
    assert result["missing_count"] == 0
    assert result["bbox"] is not None

    summary = result["summary"]

    assert summary["input_feature_count"] == 3
    assert summary["output_feature_count"] == 2
    assert summary["valid_count"] == 3
    assert summary["missing_count"] == 0
    assert summary["exceedance_count"] == 2
    assert summary["non_exceedance_count"] == 1
    assert summary["exceedance_fraction"] == pytest.approx(2 / 3)
    assert summary["input_min"] == pytest.approx(10.0)
    assert summary["input_max"] == pytest.approx(30.0)
    assert summary["input_mean"] == pytest.approx(20.0)
    assert summary["exceeding_min"] == pytest.approx(20.0)
    assert summary["exceeding_max"] == pytest.approx(30.0)
    assert summary["exceeding_mean"] == pytest.approx(25.0)


def test_threshold_geojson_contains_expected_columns():
    artifact = make_climate_artifact(values=[10, 20, 30])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=20,
        comparison_operator=">=",
        clip_to_region=False,
    )

    assert_valid_threshold_artifact(result)

    features = result["geojson"]["features"]

    assert len(features) == 2

    for feature in features:
        props = feature["properties"]

        assert "cell_id" in props
        assert "extreme_heat_days_mean" in props
        assert "exceeds_threshold" in props
        assert "threshold" in props
        assert "comparison_operator" in props
        assert "threshold_difference" in props
        assert "threshold_abs_difference" in props
        assert "threshold_class" in props

        assert props["exceeds_threshold"] is True
        assert props["threshold"] == pytest.approx(20.0)
        assert props["comparison_operator"] == ">="
        assert props["threshold_class"] == "exceeds_threshold"

    values = [feature["properties"]["extreme_heat_days_mean"] for feature in features]
    differences = [feature["properties"]["threshold_difference"] for feature in features]

    assert values == [20, 30]
    assert differences == [0, 10]


def test_return_all_features_with_classification():
    artifact = make_climate_artifact(values=[10, 20, 30])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=20,
        comparison_operator=">=",
        return_only_exceeding=False,
        clip_to_region=False,
    )

    assert_valid_threshold_artifact(result)

    assert result["feature_count"] == 3
    assert result["exceedance_count"] == 2
    assert result["non_exceedance_count"] == 1
    assert result["return_only_exceeding"] is False

    features = result["geojson"]["features"]

    classes = [feature["properties"]["threshold_class"] for feature in features]
    exceeds = [feature["properties"]["exceeds_threshold"] for feature in features]
    differences = [feature["properties"]["threshold_difference"] for feature in features]

    assert classes == [
        "does_not_exceed_threshold",
        "exceeds_threshold",
        "exceeds_threshold",
    ]
    assert exceeds == [False, True, True]
    assert differences == [-10, 0, 10]


def test_operator_alias_at_least():
    artifact = make_climate_artifact(values=[10, 20, 30])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=20,
        comparison_operator="at_least",
        clip_to_region=False,
    )

    assert_valid_threshold_artifact(result)

    assert result["comparison_operator"] == ">="
    assert result["feature_count"] == 2
    assert result["exceedance_count"] == 2


def test_less_than_operator():
    artifact = make_climate_artifact(values=[10, 20, 30])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=20,
        comparison_operator="<",
        clip_to_region=False,
    )

    assert_valid_threshold_artifact(result)

    assert result["comparison_operator"] == "<"
    assert result["feature_count"] == 1
    assert result["exceedance_count"] == 1

    features = result["geojson"]["features"]
    assert features[0]["properties"]["extreme_heat_days_mean"] == 10


def test_equal_operator():
    artifact = make_climate_artifact(values=[10, 20, 30])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=20,
        comparison_operator="==",
        clip_to_region=False,
    )

    assert_valid_threshold_artifact(result)

    assert result["comparison_operator"] == "=="
    assert result["feature_count"] == 1
    assert result["exceedance_count"] == 1

    features = result["geojson"]["features"]
    assert features[0]["properties"]["extreme_heat_days_mean"] == 20


def test_missing_and_non_numeric_values_are_handled_with_warning():
    artifact = make_climate_artifact(values=[10, None, "bad", 30])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=20,
        comparison_operator=">=",
        return_only_exceeding=False,
        clip_to_region=False,
    )

    assert_valid_threshold_artifact(result)

    assert result["input_feature_count"] == 4
    assert result["valid_count"] == 2
    assert result["missing_count"] == 2
    assert result["exceedance_count"] == 1
    assert result["non_exceedance_count"] == 1
    assert result["feature_count"] == 2
    assert result["warnings"]

    values = [
        feature["properties"]["extreme_heat_days_mean"]
        for feature in result["geojson"]["features"]
    ]

    assert values == [10, 30]


def test_include_missing_features_when_returning_all_features():
    artifact = make_climate_artifact(values=[10, None, "bad", 30])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=20,
        comparison_operator=">=",
        return_only_exceeding=False,
        include_missing_features=True,
        clip_to_region=False,
    )

    assert_valid_threshold_artifact(result)

    assert result["input_feature_count"] == 4
    assert result["valid_count"] == 2
    assert result["missing_count"] == 2
    assert result["feature_count"] == 4

    classes = [
        feature["properties"]["threshold_class"]
        for feature in result["geojson"]["features"]
    ]

    assert classes == [
        "does_not_exceed_threshold",
        None,
        None,
        "exceeds_threshold",
    ]


def test_no_features_match_threshold_returns_empty_geojson_with_warning():
    artifact = make_climate_artifact(values=[10, 20, 30])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=100,
        comparison_operator=">=",
        clip_to_region=False,
    )

    assert result["artifact_type"] == "threshold_exceedance_layer"
    assert result["geojson"]["type"] == "FeatureCollection"
    assert result["geojson"]["features"] == []
    assert result["feature_count"] == 0
    assert result["bbox"] is None
    assert result["exceedance_count"] == 0
    assert result["non_exceedance_count"] == 3
    assert result["warnings"]


def test_explicit_value_column():
    artifact = make_climate_artifact(
        values=[1.5, 2.5, 3.5],
        value_column="custom_heat_score",
    )

    result = get_threshold_exceedance(
        input_artifact=artifact,
        value_column="custom_heat_score",
        threshold=2.0,
        comparison_operator=">",
        clip_to_region=False,
    )

    assert result["artifact_type"] == "threshold_exceedance_layer"
    assert result["source_value_column"] == "custom_heat_score"
    assert result["feature_count"] == 2
    assert result["exceedance_count"] == 2


def test_missing_threshold_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "threshold_exceedance_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_non_numeric_threshold_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold="not_a_number",
        clip_to_region=False,
    )

    assert result["artifact_type"] == "threshold_exceedance_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_unsupported_operator_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=20,
        comparison_operator="approximately",
        clip_to_region=False,
    )

    assert result["artifact_type"] == "threshold_exceedance_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_missing_value_column_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        value_column="not_a_real_column",
        threshold=20,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "threshold_exceedance_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_missing_geojson_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    del artifact["geojson"]

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=20,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "threshold_exceedance_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_empty_artifact_fails_cleanly():
    artifact = make_climate_artifact(values=[])

    result = get_threshold_exceedance(
        input_artifact=artifact,
        threshold=20,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "threshold_exceedance_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_invalid_geometry_format_raises_error():
    artifact = make_climate_artifact(values=[10, 20])

    with pytest.raises(ValueError):
        get_threshold_exceedance(
            input_artifact=artifact,
            threshold=20,
            return_geometry_format="wkt",
            clip_to_region=False,
        )


def test_missing_variable_when_loading_internally_fails_cleanly():
    result = get_threshold_exceedance(
        region_name="Fiji",
        period="2050s",
        scenario="SSP2-4.5",
        model="ACCESS-CM2",
        threshold=20,
    )

    assert result["artifact_type"] == "threshold_exceedance_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_missing_registered_layer_fails_cleanly():
    result = get_threshold_exceedance(
        variable="definitely_not_a_real_variable",
        region_name="Fiji",
        period="2050s",
        scenario="SSP2-4.5",
        model="ACCESS-CM2",
        threshold=20,
    )

    assert result["artifact_type"] == "threshold_exceedance_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]