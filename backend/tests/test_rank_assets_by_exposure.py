from pathlib import Path
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import rank_assets_by_exposure


def make_infrastructure_exposure_artifact(
    exposure_differences=None,
    sampled_values=None,
    value_column="exposure_score",
):
    """
    Create a tiny infrastructure exposure layer.

    Default ranking by exposure_difference should rank:
    1. School A: 10
    2. Hospital A: 5
    3. Hospital B: -10
    Port A has missing value.
    """
    if exposure_differences is None:
        exposure_differences = [5, -10, 10, None]

    if sampled_values is None:
        sampled_values = [35, 20, 40, None]

    exposure_scores = [
        1.0 if value is not None and value >= 0 else 0.0
        for value in exposure_differences
    ]

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

    features = []

    for asset, exposure_difference, sampled_value, exposure_score in zip(
        assets,
        exposure_differences,
        sampled_values,
        exposure_scores,
    ):
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "asset_id": asset["asset_id"],
                    "asset_name": asset["asset_name"],
                    "asset_type": asset["asset_type"],
                    "sampled_hazard_value": sampled_value,
                    "exposed_to_hazard": bool(exposure_score),
                    "exposure_score": exposure_score,
                    "exposure_difference": exposure_difference,
                    "exposure_threshold": 30.0,
                    "exposure_operator": ">=",
                    "exposure_value_column": "sampled_hazard_value",
                    "has_exposure_value": exposure_difference is not None,
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": asset["coordinates"],
                },
            }
        )

    return {
        "artifact_type": "infrastructure_exposure_layer",
        "input_artifact_type": "asset_hazard_sample_layer",
        "input_layer_id": "fiji_assets_sampled_at_heat",
        "layer_id": "fiji_assets_heat_exposure",
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
        "group_by_column": "asset_type",
        "value_column": value_column,
        "source_value_column": "sampled_hazard_value",
        "units": "days/year",
        "threshold": 30.0,
        "comparison_operator": ">=",
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
            "method": "test_infrastructure_exposure",
        },
    }


def make_asset_hazard_sample_artifact():
    """
    Create an asset-hazard sample layer without exposure_difference.
    This should make rank_assets_by_exposure fall back to sampled_hazard_value.
    """
    artifact = make_infrastructure_exposure_artifact()
    artifact["artifact_type"] = "asset_hazard_sample_layer"
    artifact["layer_id"] = "fiji_assets_sampled_at_heat"
    artifact["value_column"] = "sampled_hazard_value"

    for feature in artifact["geojson"]["features"]:
        feature["properties"].pop("exposure_difference", None)
        feature["properties"].pop("exposure_score", None)

    return artifact


def assert_valid_asset_ranking_artifact(result):
    assert result["artifact_type"] == "asset_exposure_ranking_layer"
    assert result["input_artifact_type"] in {
        "infrastructure_exposure_layer",
        "asset_hazard_sample_layer",
    }
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
    assert result["asset_name_column"] == "asset_name"
    assert result["asset_id_column"] == "asset_id"
    assert result["asset_type_column"] == "asset_type"
    assert result["value_column"] == "asset_rank_score"
    assert result["units"] == "days/year"
    assert result["geojson"] is not None
    assert result["geojson"]["type"] == "FeatureCollection"
    assert result["feature_count"] > 0
    assert result["asset_count"] > 0
    assert result["bbox"] is not None
    assert result["crs"] == "EPSG:4326"
    assert isinstance(result["summary"], dict)
    assert isinstance(result["table"], list)
    assert isinstance(result["warnings"], list)
    assert isinstance(result["suggestions"], list)
    assert isinstance(result["provenance"], dict)

    bbox = result["bbox"]
    assert len(bbox) == 4
    assert all(isinstance(x, float) for x in bbox)


def test_rank_assets_by_exposure_default_highest():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["direction"] == "highest"
    assert result["top_n"] == 10
    assert result["source_value_column"] == "exposure_difference"
    assert result["feature_count"] == 3
    assert result["asset_count"] == 4
    assert result["ranked_asset_count"] == 3
    assert result["missing_value_count"] == 1
    assert result["warnings"]

    names = [
        feature["properties"]["asset_name"]
        for feature in result["geojson"]["features"]
    ]

    ranks = [
        feature["properties"]["asset_rank"]
        for feature in result["geojson"]["features"]
    ]

    scores = [
        feature["properties"]["asset_rank_score"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["School A", "Hospital A", "Hospital B"]
    assert ranks == [1, 2, 3]
    assert scores == [10, 5, -10]


def test_geojson_contains_expected_rank_columns():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
    )

    assert_valid_asset_ranking_artifact(result)

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
        "asset_rank",
        "asset_rank_score",
        "rank_direction",
        "rank_percentile",
        "rank_category",
    ]

    for column in expected_columns:
        assert column in props

    assert props["asset_name"] == "School A"
    assert props["asset_rank"] == 1
    assert props["asset_rank_score"] == pytest.approx(10.0)
    assert props["rank_direction"] == "highest"
    assert props["rank_percentile"] == pytest.approx(100.0)
    assert props["rank_category"] == "top_50_percent"


def test_summary_values_are_correct():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
    )

    assert_valid_asset_ranking_artifact(result)

    summary = result["summary"]

    assert summary["asset_count"] == 4
    assert summary["ranked_asset_count"] == 3
    assert summary["missing_value_count"] == 1
    assert summary["direction"] == "highest"
    assert summary["top_n"] == 10
    assert summary["source_value_column"] == "exposure_difference"
    assert summary["value_min"] == pytest.approx(-10.0)
    assert summary["value_max"] == pytest.approx(10.0)
    assert summary["value_mean"] == pytest.approx((5 - 10 + 10) / 3)
    assert summary["value_median"] == pytest.approx(5.0)
    assert summary["returned_value_min"] == pytest.approx(-10.0)
    assert summary["returned_value_max"] == pytest.approx(10.0)

    assert summary["top_asset"]["asset_name"] == "School A"
    assert summary["top_asset"]["asset_id"] == "SCH_1"
    assert summary["top_asset"]["asset_type"] == "school"
    assert summary["top_asset"]["asset_rank"] == 1
    assert summary["top_asset"]["asset_rank_score"] == pytest.approx(10.0)


def test_table_output_contains_ranked_asset_details():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
    )

    assert_valid_asset_ranking_artifact(result)

    table = result["table"]

    assert len(table) == 3

    assert table[0]["asset_name"] == "School A"
    assert table[0]["asset_id"] == "SCH_1"
    assert table[0]["asset_type"] == "school"
    assert table[0]["asset_rank"] == 1
    assert table[0]["asset_rank_score"] == pytest.approx(10.0)
    assert table[0]["rank_percentile"] == pytest.approx(100.0)
    assert table[0]["rank_category"] == "top_50_percent"
    assert table[0]["source_value_column"] == "exposure_difference"
    assert table[0]["source_value"] == pytest.approx(10.0)
    assert table[0]["exposed_to_hazard"] is True
    assert table[0]["exposure_score"] == pytest.approx(1.0)
    assert table[0]["exposure_difference"] == pytest.approx(10.0)
    assert table[0]["sampled_hazard_value"] == pytest.approx(40.0)
    assert table[0]["longitude"] == pytest.approx(177.3)
    assert table[0]["latitude"] == pytest.approx(-17.7)

    assert table[1]["asset_name"] == "Hospital A"
    assert table[1]["asset_rank"] == 2
    assert table[1]["asset_rank_score"] == pytest.approx(5.0)


def test_top_n_returns_requested_number_of_assets():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        top_n=2,
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["feature_count"] == 2
    assert result["asset_count"] == 4
    assert result["ranked_asset_count"] == 2
    assert result["missing_value_count"] == 1

    names = [
        feature["properties"]["asset_name"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["School A", "Hospital A"]


def test_top_n_none_returns_all_ranked_assets():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        top_n=None,
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["top_n"] is None
    assert result["feature_count"] == 3
    assert result["ranked_asset_count"] == 3


def test_include_all_assets_ignores_top_n_for_numeric_assets():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        top_n=1,
        include_all_assets=True,
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["include_all_assets"] is True
    assert result["feature_count"] == 3
    assert result["ranked_asset_count"] == 3

    names = [
        feature["properties"]["asset_name"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["School A", "Hospital A", "Hospital B"]


def test_include_missing_assets_adds_unranked_assets():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        include_missing_assets=True,
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["include_missing_assets"] is True
    assert result["feature_count"] == 4
    assert result["ranked_asset_count"] == 3
    assert result["missing_value_count"] == 1

    features = result["geojson"]["features"]

    port_feature = [
        feature
        for feature in features
        if feature["properties"]["asset_name"] == "Port A"
    ][0]

    assert port_feature["properties"]["asset_rank"] is None
    assert port_feature["properties"]["asset_rank_score"] is None
    assert port_feature["properties"]["rank_percentile"] is None
    assert port_feature["properties"]["rank_category"] == "unranked_missing_value"


def test_lowest_direction_ranks_smallest_values_first():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        direction="lowest",
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["direction"] == "lowest"

    names = [
        feature["properties"]["asset_name"]
        for feature in result["geojson"]["features"]
    ]

    scores = [
        feature["properties"]["asset_rank_score"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["Hospital B", "Hospital A", "School A"]
    assert scores == [-10, 5, 10]


def test_direction_alias_top_maps_to_highest():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        direction="top",
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["direction"] == "highest"
    assert result["summary"]["top_asset"]["asset_name"] == "School A"


def test_direction_alias_best_maps_to_lowest():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        direction="best",
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["direction"] == "lowest"
    assert result["summary"]["top_asset"]["asset_name"] == "Hospital B"


def test_explicit_value_column_sampled_hazard_value():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        value_column="sampled_hazard_value",
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["source_value_column"] == "sampled_hazard_value"

    names = [
        feature["properties"]["asset_name"]
        for feature in result["geojson"]["features"]
    ]

    scores = [
        feature["properties"]["asset_rank_score"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["School A", "Hospital A", "Hospital B"]
    assert scores == [40, 35, 20]


def test_asset_hazard_sample_artifact_falls_back_to_sampled_hazard_value():
    input_artifact = make_asset_hazard_sample_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["input_artifact_type"] == "asset_hazard_sample_layer"
    assert result["source_value_column"] == "sampled_hazard_value"

    names = [
        feature["properties"]["asset_name"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["School A", "Hospital A", "Hospital B"]


def test_explicit_value_column_risk_score():
    input_artifact = make_infrastructure_exposure_artifact()

    risk_scores = {
        "Hospital A": 0.4,
        "Hospital B": 0.9,
        "School A": 0.6,
        "Port A": None,
    }

    for feature in input_artifact["geojson"]["features"]:
        asset_name = feature["properties"]["asset_name"]
        feature["properties"]["risk_score"] = risk_scores[asset_name]

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        value_column="risk_score",
        top_n=2,
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["source_value_column"] == "risk_score"
    assert result["feature_count"] == 2

    names = [
        feature["properties"]["asset_name"]
        for feature in result["geojson"]["features"]
    ]

    scores = [
        feature["properties"]["asset_rank_score"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["Hospital B", "School A"]
    assert scores == [0.9, 0.6]


def test_asset_column_inference_with_aliases():
    input_artifact = make_infrastructure_exposure_artifact()

    for feature in input_artifact["geojson"]["features"]:
        feature["properties"]["name"] = feature["properties"].pop("asset_name")
        feature["properties"]["id"] = feature["properties"].pop("asset_id")
        feature["properties"]["category"] = feature["properties"].pop("asset_type")

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
    )

    assert result["artifact_type"] == "asset_exposure_ranking_layer"
    assert result["asset_name_column"] == "name"
    assert result["asset_id_column"] == "id"
    assert result["asset_type_column"] == "category"

    table = result["table"]

    assert table[0]["asset_name"] == "School A"
    assert table[0]["asset_id"] == "SCH_1"
    assert table[0]["asset_type"] == "school"


def test_explicit_asset_columns():
    input_artifact = make_infrastructure_exposure_artifact()

    for feature in input_artifact["geojson"]["features"]:
        feature["properties"]["facility_label"] = feature["properties"].pop("asset_name")
        feature["properties"]["facility_code"] = feature["properties"].pop("asset_id")
        feature["properties"]["facility_class"] = feature["properties"].pop("asset_type")

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        asset_name_column="facility_label",
        asset_id_column="facility_code",
        asset_type_column="facility_class",
    )

    assert result["artifact_type"] == "asset_exposure_ranking_layer"
    assert result["asset_name_column"] == "facility_label"
    assert result["asset_id_column"] == "facility_code"
    assert result["asset_type_column"] == "facility_class"

    table = result["table"]

    assert table[0]["asset_name"] == "School A"
    assert table[0]["asset_id"] == "SCH_1"
    assert table[0]["asset_type"] == "school"


def test_single_ranked_asset_percentile_is_100():
    input_artifact = make_infrastructure_exposure_artifact(
        exposure_differences=[5, None, None, None],
        sampled_values=[35, None, None, None],
    )

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
    )

    assert_valid_asset_ranking_artifact(result)

    assert result["feature_count"] == 1
    assert result["ranked_asset_count"] == 1

    feature = result["geojson"]["features"][0]

    assert feature["properties"]["asset_name"] == "Hospital A"
    assert feature["properties"]["asset_rank"] == 1
    assert feature["properties"]["rank_percentile"] == pytest.approx(100.0)


def test_missing_geojson_fails_cleanly():
    input_artifact = make_infrastructure_exposure_artifact()
    del input_artifact["geojson"]

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
    )

    assert result["artifact_type"] == "asset_exposure_ranking_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["table"] == []
    assert result["warnings"]


def test_missing_value_column_fails_cleanly():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        value_column="not_a_real_column",
    )

    assert result["artifact_type"] == "asset_exposure_ranking_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_no_numeric_values_fails_cleanly():
    input_artifact = make_infrastructure_exposure_artifact(
        exposure_differences=[None, None, None, None],
        sampled_values=[None, None, None, None],
    )

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
    )

    assert result["artifact_type"] == "asset_exposure_ranking_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_asset_name_column_fails_cleanly():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        asset_name_column="not_a_real_column",
    )

    assert result["artifact_type"] == "asset_exposure_ranking_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_direction_fails_cleanly():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        direction="sideways",
    )

    assert result["artifact_type"] == "asset_exposure_ranking_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_top_n_fails_cleanly():
    input_artifact = make_infrastructure_exposure_artifact()

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
        top_n=0,
    )

    assert result["artifact_type"] == "asset_exposure_ranking_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_empty_input_layer_fails_cleanly():
    input_artifact = make_infrastructure_exposure_artifact()
    input_artifact["geojson"]["features"] = []
    input_artifact["feature_count"] = 0

    result = rank_assets_by_exposure(
        input_artifact=input_artifact,
    )

    assert result["artifact_type"] == "asset_exposure_ranking_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_geometry_format_raises_error():
    input_artifact = make_infrastructure_exposure_artifact()

    with pytest.raises(ValueError):
        rank_assets_by_exposure(
            input_artifact=input_artifact,
            return_geometry_format="wkt",
        )