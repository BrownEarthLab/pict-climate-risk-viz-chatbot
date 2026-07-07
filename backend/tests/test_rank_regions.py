from pathlib import Path
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import rank_regions


def make_region_artifact(values, value_column="extreme_heat_days_mean_mean"):
    """
    Create a tiny region-level artifact like the output of aggregate_by_admin_region.
    """
    region_names = [
        "West District",
        "East District",
        "North District",
        "South District",
        "Central District",
    ]

    features = []

    for i, value in enumerate(values):
        lon = 177.0 + i * 0.3
        lat = -18.0

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "admin_id": f"ADM_{i + 1}",
                    "admin_name": region_names[i],
                    value_column: value,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [lon, lat],
                            [lon + 0.2, lat],
                            [lon + 0.2, lat + 0.2],
                            [lon, lat + 0.2],
                            [lon, lat],
                        ]
                    ],
                },
            }
        )

    return {
        "artifact_type": "admin_region_aggregation_layer",
        "layer_id": "fiji_extreme_heat_days_aggregated_by_admin",
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
        "admin_level": "district",
        "admin_name_column": "admin_name",
        "admin_id_column": "admin_id",
        "geojson": {
            "type": "FeatureCollection",
            "features": features,
        },
        "feature_count": len(features),
        "bbox": [177.0, -18.0, 178.5, -17.8],
        "crs": "EPSG:4326",
        "value_column": value_column,
        "source_value_column": "extreme_heat_days_mean",
        "units": "days/year",
        "warnings": [],
        "suggestions": [],
        "provenance": {
            "source": "test",
        },
    }


def assert_valid_ranked_regions_artifact(result):
    assert result["artifact_type"] == "ranked_regions_layer"
    assert result["input_artifact_type"] == "admin_region_aggregation_layer"
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
    assert result["admin_level"] == "district"
    assert result["region_name_column"] == "admin_name"
    assert result["region_id_column"] == "admin_id"
    assert result["value_column"] == "rank_score"
    assert result["source_value_column"] == "extreme_heat_days_mean_mean"
    assert result["rank_column"] == "region_rank"
    assert result["rank_percentile_column"] == "rank_percentile"
    assert result["rank_category_column"] == "rank_category"
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


def test_rank_regions_highest_top_n():
    artifact = make_region_artifact(values=[20, 50, 30, 10])

    result = rank_regions(
        input_artifact=artifact,
        direction="highest",
        top_n=2,
    )

    assert_valid_ranked_regions_artifact(result)

    assert result["direction"] == "highest"
    assert result["top_n"] == 2
    assert result["include_all_regions"] is False
    assert result["include_missing_regions"] is False
    assert result["feature_count"] == 2
    assert result["input_feature_count"] == 4
    assert result["valid_count"] == 4
    assert result["missing_count"] == 0

    features = result["geojson"]["features"]

    names = [feature["properties"]["admin_name"] for feature in features]
    values = [
        feature["properties"]["extreme_heat_days_mean_mean"]
        for feature in features
    ]
    ranks = [feature["properties"]["region_rank"] for feature in features]
    scores = [feature["properties"]["rank_score"] for feature in features]

    assert names == ["East District", "North District"]
    assert values == [50, 30]
    assert ranks == [1, 2]
    assert scores == [50, 30]

    summary = result["summary"]

    assert summary["input_feature_count"] == 4
    assert summary["output_feature_count"] == 2
    assert summary["valid_count"] == 4
    assert summary["missing_count"] == 0
    assert summary["direction"] == "highest"
    assert summary["top_n"] == 2
    assert summary["include_all_regions"] is False
    assert summary["input_min"] == pytest.approx(10.0)
    assert summary["input_max"] == pytest.approx(50.0)
    assert summary["input_mean"] == pytest.approx(27.5)
    assert summary["output_min"] == pytest.approx(30.0)
    assert summary["output_max"] == pytest.approx(50.0)
    assert summary["output_mean"] == pytest.approx(40.0)


def test_rank_regions_lowest_top_n():
    artifact = make_region_artifact(values=[20, 50, 30, 10])

    result = rank_regions(
        input_artifact=artifact,
        direction="lowest",
        top_n=2,
    )

    assert_valid_ranked_regions_artifact(result)

    assert result["direction"] == "lowest"
    assert result["top_n"] == 2
    assert result["feature_count"] == 2

    features = result["geojson"]["features"]

    names = [feature["properties"]["admin_name"] for feature in features]
    values = [
        feature["properties"]["extreme_heat_days_mean_mean"]
        for feature in features
    ]
    ranks = [feature["properties"]["region_rank"] for feature in features]
    scores = [feature["properties"]["rank_score"] for feature in features]

    assert names == ["South District", "West District"]
    assert values == [10, 20]
    assert ranks == [1, 2]
    assert scores == [-10, -20]


def test_direction_aliases_work():
    artifact = make_region_artifact(values=[20, 50, 30, 10])

    result = rank_regions(
        input_artifact=artifact,
        direction="worst",
        top_n=1,
    )

    assert_valid_ranked_regions_artifact(result)

    assert result["direction"] == "highest"
    assert result["feature_count"] == 1

    feature = result["geojson"]["features"][0]

    assert feature["properties"]["admin_name"] == "East District"
    assert feature["properties"]["extreme_heat_days_mean_mean"] == 50


def test_include_all_regions_ignores_top_n_filtering():
    artifact = make_region_artifact(values=[20, 50, 30, 10])

    result = rank_regions(
        input_artifact=artifact,
        direction="highest",
        top_n=2,
        include_all_regions=True,
    )

    assert_valid_ranked_regions_artifact(result)

    assert result["include_all_regions"] is True
    assert result["top_n"] == 2
    assert result["feature_count"] == 4

    features = result["geojson"]["features"]

    names = [feature["properties"]["admin_name"] for feature in features]
    ranks = [feature["properties"]["region_rank"] for feature in features]
    percentiles = [feature["properties"]["rank_percentile"] for feature in features]
    categories = [feature["properties"]["rank_category"] for feature in features]

    assert names == [
        "East District",
        "North District",
        "West District",
        "South District",
    ]
    assert ranks == [1, 2, 3, 4]
    assert percentiles == [
        pytest.approx(1.0),
        pytest.approx(2 / 3),
        pytest.approx(1 / 3),
        pytest.approx(0.0),
    ]
    assert categories == [
        "top_25_percent",
        "top_50_percent",
        "lower_50_percent",
        "lower_50_percent",
    ]


def test_top_n_none_returns_all_valid_regions():
    artifact = make_region_artifact(values=[20, 50, 30, 10])

    result = rank_regions(
        input_artifact=artifact,
        direction="highest",
        top_n=None,
    )

    assert_valid_ranked_regions_artifact(result)

    assert result["top_n"] is None
    assert result["feature_count"] == 4

    features = result["geojson"]["features"]
    names = [feature["properties"]["admin_name"] for feature in features]

    assert names == [
        "East District",
        "North District",
        "West District",
        "South District",
    ]


def test_top_n_larger_than_valid_count_is_capped():
    artifact = make_region_artifact(values=[20, 50, 30])

    result = rank_regions(
        input_artifact=artifact,
        top_n=10,
    )

    assert_valid_ranked_regions_artifact(result)

    assert result["top_n"] == 3
    assert result["feature_count"] == 3


def test_table_output_contains_region_names_ids_and_ranks():
    artifact = make_region_artifact(values=[20, 50, 30, 10])

    result = rank_regions(
        input_artifact=artifact,
        top_n=2,
    )

    assert_valid_ranked_regions_artifact(result)

    table = result["table"]

    assert len(table) == 2

    assert table[0]["rank"] == 1
    assert table[0]["region_name"] == "East District"
    assert table[0]["region_id"] == "ADM_2"
    assert table[0]["value"] == pytest.approx(50.0)
    assert table[0]["rank_score"] == pytest.approx(50.0)
    assert table[0]["rank_percentile"] == pytest.approx(1.0)
    assert table[0]["rank_category"] == "top_25_percent"
    assert table[0]["source_value_column"] == "extreme_heat_days_mean_mean"

    assert table[1]["rank"] == 2
    assert table[1]["region_name"] == "North District"
    assert table[1]["region_id"] == "ADM_3"
    assert table[1]["value"] == pytest.approx(30.0)
    assert table[1]["rank_score"] == pytest.approx(30.0)
    assert table[1]["rank_percentile"] == pytest.approx(2 / 3)
    assert table[1]["rank_category"] == "top_50_percent"


def test_missing_values_are_excluded_with_warning():
    artifact = make_region_artifact(values=[20, None, "bad", 10])

    result = rank_regions(
        input_artifact=artifact,
        direction="highest",
        top_n=10,
    )

    assert_valid_ranked_regions_artifact(result)

    assert result["input_feature_count"] == 4
    assert result["valid_count"] == 2
    assert result["missing_count"] == 2
    assert result["feature_count"] == 2
    assert result["warnings"]

    features = result["geojson"]["features"]

    names = [feature["properties"]["admin_name"] for feature in features]
    values = [
        feature["properties"]["extreme_heat_days_mean_mean"]
        for feature in features
    ]

    assert names == ["West District", "South District"]
    assert values == [20, 10]


def test_include_missing_regions_adds_unranked_regions():
    artifact = make_region_artifact(values=[20, None, "bad", 10])

    result = rank_regions(
        input_artifact=artifact,
        direction="highest",
        top_n=1,
        include_missing_regions=True,
    )

    assert_valid_ranked_regions_artifact(result)

    assert result["include_missing_regions"] is True
    assert result["valid_count"] == 2
    assert result["missing_count"] == 2
    assert result["feature_count"] == 3

    features = result["geojson"]["features"]

    names = [feature["properties"]["admin_name"] for feature in features]
    ranks = [feature["properties"]["region_rank"] for feature in features]
    categories = [feature["properties"]["rank_category"] for feature in features]

    assert names == ["West District", "East District", "North District"]
    assert ranks == [1, None, None]
    assert categories == [
        "top_50_percent",
        "unranked_missing_value",
        "unranked_missing_value",
    ]


def test_explicit_value_column():
    artifact = make_region_artifact(
        values=[1.5, 3.5, 2.5],
        value_column="custom_risk_score",
    )

    result = rank_regions(
        input_artifact=artifact,
        value_column="custom_risk_score",
        top_n=2,
    )

    assert result["artifact_type"] == "ranked_regions_layer"
    assert result["source_value_column"] == "custom_risk_score"
    assert result["value_column"] == "rank_score"
    assert result["feature_count"] == 2

    features = result["geojson"]["features"]
    values = [feature["properties"]["custom_risk_score"] for feature in features]

    assert values == [3.5, 2.5]


def test_region_name_column_inferred_when_using_name():
    artifact = make_region_artifact(values=[20, 50, 30])

    for feature in artifact["geojson"]["features"]:
        feature["properties"]["name"] = feature["properties"].pop("admin_name")

    result = rank_regions(
        input_artifact=artifact,
        top_n=2,
    )

    assert result["artifact_type"] == "ranked_regions_layer"
    assert result["region_name_column"] == "name"

    names = [
        feature["properties"]["name"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["East District", "North District"]


def test_explicit_region_name_and_id_columns():
    artifact = make_region_artifact(values=[20, 50, 30])

    for feature in artifact["geojson"]["features"]:
        feature["properties"]["district_label"] = feature["properties"].pop("admin_name")
        feature["properties"]["district_code"] = feature["properties"].pop("admin_id")

    result = rank_regions(
        input_artifact=artifact,
        region_name_column="district_label",
        region_id_column="district_code",
        top_n=2,
    )

    assert result["artifact_type"] == "ranked_regions_layer"
    assert result["region_name_column"] == "district_label"
    assert result["region_id_column"] == "district_code"

    table = result["table"]

    assert table[0]["region_name"] == "East District"
    assert table[0]["region_id"] == "ADM_2"


def test_single_valid_region_percentile_is_one():
    artifact = make_region_artifact(values=[20])

    result = rank_regions(
        input_artifact=artifact,
        top_n=1,
    )

    assert_valid_ranked_regions_artifact(result)

    feature = result["geojson"]["features"][0]

    assert feature["properties"]["region_rank"] == 1
    assert feature["properties"]["rank_percentile"] == pytest.approx(1.0)
    assert feature["properties"]["rank_category"] == "lower_50_percent"


def test_missing_value_column_fails_cleanly():
    artifact = make_region_artifact(values=[20, 50])

    result = rank_regions(
        input_artifact=artifact,
        value_column="not_a_real_column",
    )

    assert result["artifact_type"] == "rank_regions_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["table"] == []
    assert result["warnings"]


def test_missing_geojson_fails_cleanly():
    artifact = make_region_artifact(values=[20, 50])

    del artifact["geojson"]

    result = rank_regions(
        input_artifact=artifact,
    )

    assert result["artifact_type"] == "rank_regions_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_empty_artifact_fails_cleanly():
    artifact = make_region_artifact(values=[])

    result = rank_regions(
        input_artifact=artifact,
    )

    assert result["artifact_type"] == "rank_regions_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_all_non_numeric_values_fail_cleanly():
    artifact = make_region_artifact(values=["bad", None, "worse"])

    result = rank_regions(
        input_artifact=artifact,
    )

    assert result["artifact_type"] == "rank_regions_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_invalid_direction_fails_cleanly():
    artifact = make_region_artifact(values=[20, 50])

    result = rank_regions(
        input_artifact=artifact,
        direction="sideways",
    )

    assert result["artifact_type"] == "rank_regions_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_top_n_fails_cleanly():
    artifact = make_region_artifact(values=[20, 50])

    result = rank_regions(
        input_artifact=artifact,
        top_n=0,
    )

    assert result["artifact_type"] == "rank_regions_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_region_name_column_fails_cleanly():
    artifact = make_region_artifact(values=[20, 50])

    result = rank_regions(
        input_artifact=artifact,
        region_name_column="not_a_real_column",
    )

    assert result["artifact_type"] == "rank_regions_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_geometry_format_raises_error():
    artifact = make_region_artifact(values=[20, 50])

    with pytest.raises(ValueError):
        rank_regions(
            input_artifact=artifact,
            return_geometry_format="wkt",
        )