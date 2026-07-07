from pathlib import Path
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import find_extreme_locations


def make_climate_artifact(values, value_column="extreme_heat_days_mean"):
    """
    Create a tiny climate layer artifact for extreme-location tests.
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
        "bbox": [177.0, -18.0, 177.8, -17.9],
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


def assert_valid_extreme_locations_artifact(result):
    assert result["artifact_type"] == "extreme_locations_layer"
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
    assert result["value_column"] == "extreme_score"
    assert result["source_value_column"] == "extreme_heat_days_mean"
    assert result["units"] == "days/year"
    assert result["geojson"] is not None
    assert result["geojson"]["type"] == "FeatureCollection"
    assert result["feature_count"] > 0
    assert result["input_feature_count"] > 0
    assert result["valid_count"] > 0
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


def test_find_highest_top_n_locations():
    artifact = make_climate_artifact(values=[10, 40, 20, 50, 30])

    result = find_extreme_locations(
        input_artifact=artifact,
        direction="highest",
        selection_method="top_n",
        top_n=3,
        clip_to_region=False,
    )

    assert_valid_extreme_locations_artifact(result)

    assert result["direction"] == "highest"
    assert result["selection_method"] == "top_n"
    assert result["top_n"] == 3
    assert result["percentile"] is None
    assert result["percentile_threshold"] is None
    assert result["feature_count"] == 3
    assert result["input_feature_count"] == 5
    assert result["valid_count"] == 5
    assert result["missing_count"] == 0

    features = result["geojson"]["features"]
    values = [feature["properties"]["extreme_heat_days_mean"] for feature in features]
    ranks = [feature["properties"]["extreme_rank"] for feature in features]
    scores = [feature["properties"]["extreme_score"] for feature in features]

    assert values == [50, 40, 30]
    assert ranks == [1, 2, 3]
    assert scores == [50, 40, 30]

    summary = result["summary"]

    assert summary["input_feature_count"] == 5
    assert summary["output_feature_count"] == 3
    assert summary["valid_count"] == 5
    assert summary["missing_count"] == 0
    assert summary["direction"] == "highest"
    assert summary["selection_method"] == "top_n"
    assert summary["top_n"] == 3
    assert summary["input_min"] == pytest.approx(10.0)
    assert summary["input_max"] == pytest.approx(50.0)
    assert summary["input_mean"] == pytest.approx(30.0)
    assert summary["selected_min"] == pytest.approx(30.0)
    assert summary["selected_max"] == pytest.approx(50.0)
    assert summary["selected_mean"] == pytest.approx(40.0)


def test_find_lowest_top_n_locations():
    artifact = make_climate_artifact(values=[10, 40, 20, 50, 30])

    result = find_extreme_locations(
        input_artifact=artifact,
        direction="lowest",
        selection_method="top_n",
        top_n=2,
        clip_to_region=False,
    )

    assert_valid_extreme_locations_artifact(result)

    assert result["direction"] == "lowest"
    assert result["selection_method"] == "top_n"
    assert result["top_n"] == 2
    assert result["feature_count"] == 2

    features = result["geojson"]["features"]

    values = [feature["properties"]["extreme_heat_days_mean"] for feature in features]
    ranks = [feature["properties"]["extreme_rank"] for feature in features]
    scores = [feature["properties"]["extreme_score"] for feature in features]

    assert values == [10, 20]
    assert ranks == [1, 2]
    assert scores == [-10, -20]


def test_direction_aliases_work():
    artifact = make_climate_artifact(values=[10, 40, 20, 50, 30])

    result = find_extreme_locations(
        input_artifact=artifact,
        direction="hottest",
        top_n=1,
        clip_to_region=False,
    )

    assert_valid_extreme_locations_artifact(result)

    assert result["direction"] == "highest"
    assert result["feature_count"] == 1

    feature = result["geojson"]["features"][0]
    assert feature["properties"]["extreme_heat_days_mean"] == 50


def test_selection_method_defaults_to_top_n():
    artifact = make_climate_artifact(values=[10, 40, 20, 50, 30])

    result = find_extreme_locations(
        input_artifact=artifact,
        direction="highest",
        top_n=2,
        clip_to_region=False,
    )

    assert_valid_extreme_locations_artifact(result)

    assert result["selection_method"] == "top_n"
    assert result["feature_count"] == 2


def test_percentile_selection_highest():
    artifact = make_climate_artifact(values=[10, 20, 30, 40, 50])

    result = find_extreme_locations(
        input_artifact=artifact,
        direction="highest",
        selection_method="percentile",
        percentile=80,
        clip_to_region=False,
    )

    assert_valid_extreme_locations_artifact(result)

    assert result["direction"] == "highest"
    assert result["selection_method"] == "percentile"
    assert result["top_n"] is None
    assert result["percentile"] == pytest.approx(80.0)
    assert result["percentile_threshold"] == pytest.approx(42.0)
    assert result["feature_count"] == 1

    features = result["geojson"]["features"]
    values = [feature["properties"]["extreme_heat_days_mean"] for feature in features]

    assert values == [50]


def test_percentile_selection_lowest():
    artifact = make_climate_artifact(values=[10, 20, 30, 40, 50])

    result = find_extreme_locations(
        input_artifact=artifact,
        direction="lowest",
        selection_method="percentile",
        percentile=80,
        clip_to_region=False,
    )

    assert_valid_extreme_locations_artifact(result)

    assert result["direction"] == "lowest"
    assert result["selection_method"] == "percentile"
    assert result["percentile"] == pytest.approx(80.0)
    assert result["percentile_threshold"] == pytest.approx(18.0)
    assert result["feature_count"] == 1

    features = result["geojson"]["features"]
    values = [feature["properties"]["extreme_heat_days_mean"] for feature in features]

    assert values == [10]


def test_percentile_can_be_probability():
    artifact = make_climate_artifact(values=[10, 20, 30, 40, 50])

    result = find_extreme_locations(
        input_artifact=artifact,
        direction="highest",
        percentile=0.8,
        clip_to_region=False,
    )

    assert_valid_extreme_locations_artifact(result)

    assert result["selection_method"] == "percentile"
    assert result["percentile"] == pytest.approx(80.0)
    assert result["percentile_threshold"] == pytest.approx(42.0)
    assert result["feature_count"] == 1


def test_table_output_contains_rank_value_and_centroid():
    artifact = make_climate_artifact(values=[10, 40, 20, 50, 30])

    result = find_extreme_locations(
        input_artifact=artifact,
        top_n=2,
        clip_to_region=False,
    )

    assert_valid_extreme_locations_artifact(result)

    table = result["table"]

    assert len(table) == 2

    assert table[0]["rank"] == 1
    assert table[0]["value"] == pytest.approx(50.0)
    assert table[0]["extreme_score"] == pytest.approx(50.0)
    assert table[0]["longitude"] is not None
    assert table[0]["latitude"] is not None

    assert table[1]["rank"] == 2
    assert table[1]["value"] == pytest.approx(40.0)
    assert table[1]["extreme_score"] == pytest.approx(40.0)
    assert table[1]["longitude"] is not None
    assert table[1]["latitude"] is not None


def test_include_full_input_returns_ranked_full_layer():
    artifact = make_climate_artifact(values=[10, 40, 20, 50, 30])

    result = find_extreme_locations(
        input_artifact=artifact,
        top_n=2,
        include_full_input=True,
        clip_to_region=False,
    )

    assert_valid_extreme_locations_artifact(result)

    assert result["full_input_geojson"] is not None
    assert result["full_input_geojson"]["type"] == "FeatureCollection"
    assert len(result["full_input_geojson"]["features"]) == 5

    full_values = [
        feature["properties"]["extreme_heat_days_mean"]
        for feature in result["full_input_geojson"]["features"]
    ]

    assert full_values == [50, 40, 30, 20, 10]


def test_missing_and_non_numeric_values_are_excluded_with_warning():
    artifact = make_climate_artifact(values=[10, None, "bad", 50, 30])

    result = find_extreme_locations(
        input_artifact=artifact,
        direction="highest",
        top_n=2,
        clip_to_region=False,
    )

    assert_valid_extreme_locations_artifact(result)

    assert result["input_feature_count"] == 5
    assert result["valid_count"] == 3
    assert result["missing_count"] == 2
    assert result["feature_count"] == 2
    assert result["warnings"]

    features = result["geojson"]["features"]
    values = [feature["properties"]["extreme_heat_days_mean"] for feature in features]

    assert values == [50, 30]


def test_top_n_larger_than_valid_count_is_capped():
    artifact = make_climate_artifact(values=[10, 20, 30])

    result = find_extreme_locations(
        input_artifact=artifact,
        top_n=10,
        clip_to_region=False,
    )

    assert_valid_extreme_locations_artifact(result)

    assert result["top_n"] == 3
    assert result["feature_count"] == 3


def test_explicit_value_column():
    artifact = make_climate_artifact(
        values=[1.5, 3.5, 2.5],
        value_column="custom_heat_score",
    )

    result = find_extreme_locations(
        input_artifact=artifact,
        value_column="custom_heat_score",
        top_n=2,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "extreme_locations_layer"
    assert result["source_value_column"] == "custom_heat_score"
    assert result["feature_count"] == 2

    features = result["geojson"]["features"]
    values = [feature["properties"]["custom_heat_score"] for feature in features]

    assert values == [3.5, 2.5]


def test_missing_value_column_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    result = find_extreme_locations(
        input_artifact=artifact,
        value_column="not_a_real_column",
        clip_to_region=False,
    )

    assert result["artifact_type"] == "extreme_locations_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["table"] == []
    assert result["warnings"]


def test_missing_geojson_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    del artifact["geojson"]

    result = find_extreme_locations(
        input_artifact=artifact,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "extreme_locations_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_empty_artifact_fails_cleanly():
    artifact = make_climate_artifact(values=[])

    result = find_extreme_locations(
        input_artifact=artifact,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "extreme_locations_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_all_non_numeric_values_fail_cleanly():
    artifact = make_climate_artifact(values=["bad", None, "worse"])

    result = find_extreme_locations(
        input_artifact=artifact,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "extreme_locations_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_invalid_direction_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    result = find_extreme_locations(
        input_artifact=artifact,
        direction="sideways",
        clip_to_region=False,
    )

    assert result["artifact_type"] == "extreme_locations_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_selection_method_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    result = find_extreme_locations(
        input_artifact=artifact,
        selection_method="random",
        clip_to_region=False,
    )

    assert result["artifact_type"] == "extreme_locations_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_top_n_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    result = find_extreme_locations(
        input_artifact=artifact,
        selection_method="top_n",
        top_n=0,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "extreme_locations_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_percentile_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    result = find_extreme_locations(
        input_artifact=artifact,
        selection_method="percentile",
        percentile=100,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "extreme_locations_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_geometry_format_raises_error():
    artifact = make_climate_artifact(values=[10, 20])

    with pytest.raises(ValueError):
        find_extreme_locations(
            input_artifact=artifact,
            return_geometry_format="wkt",
            clip_to_region=False,
        )


def test_missing_variable_when_loading_internally_fails_cleanly():
    result = find_extreme_locations(
        region_name="Fiji",
        period="2050s",
        scenario="SSP2-4.5",
        model="ACCESS-CM2",
    )

    assert result["artifact_type"] == "extreme_locations_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_missing_registered_layer_fails_cleanly():
    result = find_extreme_locations(
        variable="definitely_not_a_real_variable",
        region_name="Fiji",
        period="2050s",
        scenario="SSP2-4.5",
        model="ACCESS-CM2",
    )

    assert result["artifact_type"] == "extreme_locations_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]