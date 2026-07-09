from pathlib import Path
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import calculate_infrastructure_exposure


def make_asset_hazard_sample_artifact(values=None, value_column="sampled_hazard_value"):
    """
    Create a tiny asset-hazard sample layer.

    Threshold >= 30 should expose:
    - Hospital A: 35 exposed
    - Hospital B: 20 not exposed
    - School A: 40 exposed
    - Port A: missing
    """
    if values is None:
        values = [35, 20, 40, None]

    features = []

    assets = [
        {
            "asset_id": "HOSP_1",
            "asset_name": "Hospital A",
            "asset_type": "hospital",
            "coordinates": [177.2, -17.8],
        },
        {
            "asset_id": "HOSP_2",
            "asset_name": "Hospital B",
            "asset_type": "hospital",
            "coordinates": [177.7, -17.8],
        },
        {
            "asset_id": "SCH_1",
            "asset_name": "School A",
            "asset_type": "school",
            "coordinates": [177.3, -17.7],
        },
        {
            "asset_id": "PORT_1",
            "asset_name": "Port A",
            "asset_type": "port",
            "coordinates": [177.8, -17.7],
        },
    ]

    for asset, value in zip(assets, values):
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "asset_id": asset["asset_id"],
                    "asset_name": asset["asset_name"],
                    "asset_type": asset["asset_type"],
                    value_column: value,
                    "matched_hazard": value is not None,
                    "sampled_value_column": "extreme_heat_days_mean",
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": asset["coordinates"],
                },
            }
        )

    return {
        "artifact_type": "asset_hazard_sample_layer",
        "input_hazard_artifact_type": "climate_layer",
        "input_hazard_layer_id": "fiji_extreme_heat_days_2050s_ssp245_access_cm2",
        "input_assets_artifact_type": "asset_layer",
        "input_assets_layer_id": "fiji_hospitals_schools_ports",
        "layer_id": "fiji_assets_sampled_at_heat",
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
        "asset_name_column": "asset_name",
        "asset_id_column": "asset_id",
        "asset_type_column": "asset_type",
        "value_column": value_column,
        "source_value_column": "extreme_heat_days_mean",
        "units": "days/year",
        "geojson": {
            "type": "FeatureCollection",
            "features": features,
        },
        "feature_count": len(features),
        "asset_count": len(features),
        "bbox": [177.2, -17.8, 177.8, -17.7],
        "crs": "EPSG:4326",
        "warnings": [],
        "suggestions": [],
        "provenance": {
            "method": "test_asset_hazard_sampling",
        },
    }


def assert_valid_infrastructure_exposure_artifact(result):
    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["input_artifact_type"] == "asset_hazard_sample_layer"
    assert result["input_layer_id"] == "fiji_assets_sampled_at_heat"
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
    assert result["asset_name_column"] == "asset_name"
    assert result["asset_id_column"] == "asset_id"
    assert result["asset_type_column"] == "asset_type"
    assert result["group_by_column"] == "asset_type"
    assert result["value_column"] == "exposure_score"
    assert result["source_value_column"] == "sampled_hazard_value"
    assert result["units"] == "days/year"
    assert result["geojson"] is not None
    assert result["geojson"]["type"] == "FeatureCollection"
    assert result["feature_count"] > 0
    assert result["asset_count"] > 0
    assert result["bbox"] is not None
    assert result["crs"] == "EPSG:4326"
    assert isinstance(result["summary"], dict)
    assert isinstance(result["group_summary"], list)
    assert isinstance(result["table"], list)
    assert isinstance(result["warnings"], list)
    assert isinstance(result["suggestions"], list)
    assert isinstance(result["provenance"], dict)

    bbox = result["bbox"]
    assert len(bbox) == 4
    assert all(isinstance(x, float) for x in bbox)


def test_calculate_infrastructure_exposure_basic():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        comparison_operator=">=",
    )

    assert_valid_infrastructure_exposure_artifact(result)

    assert result["threshold"] == pytest.approx(30.0)
    assert result["comparison_operator"] == ">="
    assert result["feature_count"] == 4
    assert result["asset_count"] == 4
    assert result["evaluated_asset_count"] == 3
    assert result["exposed_asset_count"] == 2
    assert result["unexposed_asset_count"] == 1
    assert result["missing_value_count"] == 1
    assert result["exposure_fraction"] == pytest.approx(2 / 3)
    assert result["exposure_percent"] == pytest.approx(66.6666666667)
    assert result["warnings"]


def test_geojson_contains_expected_exposure_columns():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
    )

    assert_valid_infrastructure_exposure_artifact(result)

    feature = result["geojson"]["features"][0]
    props = feature["properties"]

    expected_columns = [
        "asset_id",
        "asset_name",
        "asset_type",
        "sampled_hazard_value",
        "exposed_to_hazard",
        "exposure_score",
        "exposure_difference",
        "exposure_threshold",
        "exposure_operator",
        "exposure_value_column",
        "has_exposure_value",
    ]

    for column in expected_columns:
        assert column in props

    assert props["asset_name"] == "Hospital A"
    assert props["sampled_hazard_value"] == 35
    assert props["exposed_to_hazard"] is True
    assert props["exposure_score"] == 1.0
    assert props["exposure_difference"] == pytest.approx(5.0)
    assert props["exposure_threshold"] == pytest.approx(30.0)
    assert props["exposure_operator"] == ">="
    assert props["exposure_value_column"] == "sampled_hazard_value"
    assert props["has_exposure_value"] is True


def test_summary_values_are_correct():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
    )

    assert_valid_infrastructure_exposure_artifact(result)

    summary = result["summary"]

    assert summary["asset_count"] == 4
    assert summary["evaluated_asset_count"] == 3
    assert summary["exposed_asset_count"] == 2
    assert summary["unexposed_asset_count"] == 1
    assert summary["missing_value_count"] == 1
    assert summary["exposure_fraction"] == pytest.approx(2 / 3)
    assert summary["exposure_percent"] == pytest.approx(66.6666666667)
    assert summary["threshold"] == pytest.approx(30.0)
    assert summary["comparison_operator"] == ">="
    assert summary["source_value_column"] == "sampled_hazard_value"
    assert summary["value_min"] == pytest.approx(20.0)
    assert summary["value_max"] == pytest.approx(40.0)
    assert summary["value_mean"] == pytest.approx((35 + 20 + 40) / 3)
    assert summary["value_median"] == pytest.approx(35.0)


def test_table_output_contains_asset_exposure_details():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
    )

    assert_valid_infrastructure_exposure_artifact(result)

    table = result["table"]

    assert len(table) == 4

    assert table[0]["asset_name"] == "Hospital A"
    assert table[0]["asset_id"] == "HOSP_1"
    assert table[0]["asset_type"] == "hospital"
    assert table[0]["source_value_column"] == "sampled_hazard_value"
    assert table[0]["hazard_value"] == pytest.approx(35.0)
    assert table[0]["exposed_to_hazard"] is True
    assert table[0]["exposure_score"] == pytest.approx(1.0)
    assert table[0]["exposure_difference"] == pytest.approx(5.0)
    assert table[0]["has_exposure_value"] is True
    assert table[0]["longitude"] == pytest.approx(177.2)
    assert table[0]["latitude"] == pytest.approx(-17.8)

    assert table[1]["asset_name"] == "Hospital B"
    assert table[1]["hazard_value"] == pytest.approx(20.0)
    assert table[1]["exposed_to_hazard"] is False
    assert table[1]["exposure_score"] == pytest.approx(0.0)
    assert table[1]["exposure_difference"] == pytest.approx(-10.0)


def test_missing_value_asset_is_kept_by_default():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
    )

    assert_valid_infrastructure_exposure_artifact(result)

    features = result["geojson"]["features"]

    port_feature = [
        feature
        for feature in features
        if feature["properties"]["asset_name"] == "Port A"
    ][0]

    assert port_feature["properties"]["sampled_hazard_value"] is None
    assert port_feature["properties"]["exposed_to_hazard"] is False
    assert port_feature["properties"]["exposure_score"] == 0.0
    assert port_feature["properties"]["exposure_difference"] is None
    assert port_feature["properties"]["has_exposure_value"] is False


def test_group_summary_defaults_to_asset_type():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
    )

    assert_valid_infrastructure_exposure_artifact(result)

    group_summary = result["group_summary"]

    assert len(group_summary) == 3

    by_group = {item["group"]: item for item in group_summary}

    assert by_group["school"]["asset_count"] == 1
    assert by_group["school"]["evaluated_asset_count"] == 1
    assert by_group["school"]["exposed_asset_count"] == 1
    assert by_group["school"]["exposure_percent"] == pytest.approx(100.0)

    assert by_group["hospital"]["asset_count"] == 2
    assert by_group["hospital"]["evaluated_asset_count"] == 2
    assert by_group["hospital"]["exposed_asset_count"] == 1
    assert by_group["hospital"]["exposure_percent"] == pytest.approx(50.0)

    assert by_group["port"]["asset_count"] == 1
    assert by_group["port"]["evaluated_asset_count"] == 0
    assert by_group["port"]["exposed_asset_count"] == 0
    assert by_group["port"]["exposure_percent"] is None


def test_explicit_group_by_column():
    input_artifact = make_asset_hazard_sample_artifact()

    for feature in input_artifact["geojson"]["features"]:
        asset_type = feature["properties"]["asset_type"]

        if asset_type in {"hospital", "school"}:
            feature["properties"]["criticality"] = "high"
        else:
            feature["properties"]["criticality"] = "medium"

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        group_by_column="criticality",
    )

    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["group_by_column"] == "criticality"

    by_group = {item["group"]: item for item in result["group_summary"]}

    assert by_group["high"]["asset_count"] == 3
    assert by_group["high"]["evaluated_asset_count"] == 3
    assert by_group["high"]["exposed_asset_count"] == 2
    assert by_group["high"]["exposure_percent"] == pytest.approx(66.6666666667)

    assert by_group["medium"]["asset_count"] == 1
    assert by_group["medium"]["evaluated_asset_count"] == 0
    assert by_group["medium"]["exposed_asset_count"] == 0
    assert by_group["medium"]["exposure_percent"] is None


def test_include_unexposed_assets_false_returns_only_exposed_assets():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        include_unexposed_assets=False,
    )

    assert_valid_infrastructure_exposure_artifact(result)

    assert result["feature_count"] == 2
    assert result["asset_count"] == 2
    assert result["evaluated_asset_count"] == 2
    assert result["exposed_asset_count"] == 2
    assert result["unexposed_asset_count"] == 0
    assert result["missing_value_count"] == 0
    assert result["exposure_percent"] == pytest.approx(100.0)

    names = [
        feature["properties"]["asset_name"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["Hospital A", "School A"]


def test_include_missing_value_assets_false_drops_missing_assets():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        include_missing_value_assets=False,
    )

    assert_valid_infrastructure_exposure_artifact(result)

    assert result["feature_count"] == 3
    assert result["asset_count"] == 3
    assert result["evaluated_asset_count"] == 3
    assert result["exposed_asset_count"] == 2
    assert result["unexposed_asset_count"] == 1
    assert result["missing_value_count"] == 0

    names = [
        feature["properties"]["asset_name"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["Hospital A", "Hospital B", "School A"]


def test_operator_above_alias_maps_to_greater_than():
    input_artifact = make_asset_hazard_sample_artifact(values=[30, 31, 29, None])

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        comparison_operator="above",
    )

    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["comparison_operator"] == ">"
    assert result["evaluated_asset_count"] == 3
    assert result["exposed_asset_count"] == 1
    assert result["unexposed_asset_count"] == 2


def test_operator_at_least_alias_maps_to_greater_equal():
    input_artifact = make_asset_hazard_sample_artifact(values=[30, 31, 29, None])

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        comparison_operator="at_least",
    )

    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["comparison_operator"] == ">="
    assert result["evaluated_asset_count"] == 3
    assert result["exposed_asset_count"] == 2
    assert result["unexposed_asset_count"] == 1


def test_less_than_operator():
    input_artifact = make_asset_hazard_sample_artifact(values=[10, 20, 40, None])

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        comparison_operator="<",
    )

    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["comparison_operator"] == "<"
    assert result["evaluated_asset_count"] == 3
    assert result["exposed_asset_count"] == 2
    assert result["unexposed_asset_count"] == 1

    differences = [
        feature["properties"]["exposure_difference"]
        for feature in result["geojson"]["features"]
    ]

    assert differences == [20, 10, -10, None]


def test_less_than_or_equal_operator():
    input_artifact = make_asset_hazard_sample_artifact(values=[30, 31, 29, None])

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        comparison_operator="<=",
    )

    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["comparison_operator"] == "<="
    assert result["evaluated_asset_count"] == 3
    assert result["exposed_asset_count"] == 2
    assert result["unexposed_asset_count"] == 1


def test_equal_operator():
    input_artifact = make_asset_hazard_sample_artifact(values=[30, 31, 30, None])

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        comparison_operator="==",
    )

    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["comparison_operator"] == "=="
    assert result["evaluated_asset_count"] == 3
    assert result["exposed_asset_count"] == 2
    assert result["unexposed_asset_count"] == 1


def test_not_equal_operator():
    input_artifact = make_asset_hazard_sample_artifact(values=[30, 31, 29, None])

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        comparison_operator="!=",
    )

    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["comparison_operator"] == "!="
    assert result["evaluated_asset_count"] == 3
    assert result["exposed_asset_count"] == 2
    assert result["unexposed_asset_count"] == 1


def test_explicit_value_column():
    input_artifact = make_asset_hazard_sample_artifact(
        values=[0.8, 0.2, 0.9, None],
        value_column="custom_risk_score",
    )

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        value_column="custom_risk_score",
        threshold=0.5,
        comparison_operator=">=",
    )

    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["source_value_column"] == "custom_risk_score"
    assert result["value_column"] == "exposure_score"
    assert result["exposed_asset_count"] == 2
    assert result["unexposed_asset_count"] == 1
    assert result["missing_value_count"] == 1


def test_asset_column_inference_with_aliases():
    input_artifact = make_asset_hazard_sample_artifact()

    for feature in input_artifact["geojson"]["features"]:
        feature["properties"]["name"] = feature["properties"].pop("asset_name")
        feature["properties"]["id"] = feature["properties"].pop("asset_id")
        feature["properties"]["category"] = feature["properties"].pop("asset_type")

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
    )

    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["asset_name_column"] == "name"
    assert result["asset_id_column"] == "id"
    assert result["asset_type_column"] == "category"
    assert result["group_by_column"] == "category"

    table = result["table"]

    assert table[0]["asset_name"] == "Hospital A"
    assert table[0]["asset_id"] == "HOSP_1"
    assert table[0]["asset_type"] == "hospital"


def test_explicit_asset_columns():
    input_artifact = make_asset_hazard_sample_artifact()

    for feature in input_artifact["geojson"]["features"]:
        feature["properties"]["facility_label"] = feature["properties"].pop("asset_name")
        feature["properties"]["facility_code"] = feature["properties"].pop("asset_id")
        feature["properties"]["facility_class"] = feature["properties"].pop("asset_type")

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        asset_name_column="facility_label",
        asset_id_column="facility_code",
        asset_type_column="facility_class",
    )

    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["asset_name_column"] == "facility_label"
    assert result["asset_id_column"] == "facility_code"
    assert result["asset_type_column"] == "facility_class"
    assert result["group_by_column"] == "facility_class"

    table = result["table"]

    assert table[0]["asset_name"] == "Hospital A"
    assert table[0]["asset_id"] == "HOSP_1"
    assert table[0]["asset_type"] == "hospital"


def test_no_assets_meet_threshold_returns_warning():
    input_artifact = make_asset_hazard_sample_artifact(values=[10, 20, 25, None])

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
    )

    assert result["artifact_type"] == "infrastructure_exposure_layer"
    assert result["exposed_asset_count"] == 0
    assert result["unexposed_asset_count"] == 3
    assert result["warnings"]
    assert any("No assets meet" in warning for warning in result["warnings"])


def test_missing_geojson_fails_cleanly():
    input_artifact = make_asset_hazard_sample_artifact()
    del input_artifact["geojson"]

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
    )

    assert result["artifact_type"] == "infrastructure_exposure_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["group_summary"] == []
    assert result["table"] == []
    assert result["warnings"]


def test_missing_threshold_fails_cleanly():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=None,
    )

    assert result["artifact_type"] == "infrastructure_exposure_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_non_numeric_threshold_fails_cleanly():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold="hot",
    )

    assert result["artifact_type"] == "infrastructure_exposure_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_missing_value_column_fails_cleanly():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        value_column="not_a_real_column",
        threshold=30,
    )

    assert result["artifact_type"] == "infrastructure_exposure_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_asset_name_column_fails_cleanly():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        asset_name_column="not_a_real_column",
    )

    assert result["artifact_type"] == "infrastructure_exposure_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_group_by_column_fails_cleanly():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        group_by_column="not_a_real_column",
    )

    assert result["artifact_type"] == "infrastructure_exposure_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_unsupported_operator_fails_cleanly():
    input_artifact = make_asset_hazard_sample_artifact()

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        comparison_operator="approximately",
    )

    assert result["artifact_type"] == "infrastructure_exposure_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_empty_input_layer_fails_cleanly():
    input_artifact = make_asset_hazard_sample_artifact()
    input_artifact["geojson"]["features"] = []
    input_artifact["feature_count"] = 0

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
    )

    assert result["artifact_type"] == "infrastructure_exposure_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_filtering_can_produce_empty_output_fails_cleanly():
    input_artifact = make_asset_hazard_sample_artifact(values=[10, 20, 25, None])

    result = calculate_infrastructure_exposure(
        input_artifact=input_artifact,
        threshold=30,
        include_unexposed_assets=False,
    )

    assert result["artifact_type"] == "infrastructure_exposure_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_geometry_format_raises_error():
    input_artifact = make_asset_hazard_sample_artifact()

    with pytest.raises(ValueError):
        calculate_infrastructure_exposure(
            input_artifact=input_artifact,
            threshold=30,
            return_geometry_format="wkt",
        )