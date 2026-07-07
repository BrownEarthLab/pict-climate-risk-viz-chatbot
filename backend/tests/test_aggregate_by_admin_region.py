from pathlib import Path
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import aggregate_by_admin_region


def make_input_artifact(values, value_column="extreme_heat_days_mean"):
    """
    Create a tiny gridded climate layer artifact.
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
        "bbox": [177.0, -18.0, 177.9, -17.9],
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


def make_admin_boundaries_artifact(include_empty_region=False):
    """
    Create two admin polygons:
    - West District contains first three grid cells
    - East District contains the fourth grid cell

    Optionally add a third admin region with no matched data.
    """
    features = [
        {
            "type": "Feature",
            "properties": {
                "admin_id": "ADM_1",
                "admin_name": "West District",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [176.9, -18.2],
                        [177.55, -18.2],
                        [177.55, -17.8],
                        [176.9, -17.8],
                        [176.9, -18.2],
                    ]
                ],
            },
        },
        {
            "type": "Feature",
            "properties": {
                "admin_id": "ADM_2",
                "admin_name": "East District",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [177.55, -18.2],
                        [178.2, -18.2],
                        [178.2, -17.8],
                        [177.55, -17.8],
                        [177.55, -18.2],
                    ]
                ],
            },
        },
    ]

    if include_empty_region:
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "admin_id": "ADM_3",
                    "admin_name": "No Data District",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [180.0, -18.2],
                            [180.5, -18.2],
                            [180.5, -17.8],
                            [180.0, -17.8],
                            [180.0, -18.2],
                        ]
                    ],
                },
            }
        )

    return {
        "artifact_type": "admin_boundaries",
        "layer_id": "fiji_test_admin_boundaries",
        "geojson": {
            "type": "FeatureCollection",
            "features": features,
        },
        "feature_count": len(features),
        "bbox": [176.9, -18.2, 178.2, -17.8],
        "crs": "EPSG:4326",
        "warnings": [],
        "suggestions": [],
        "provenance": {
            "source": "test",
        },
    }


def assert_valid_admin_aggregation_artifact(result):
    assert result["artifact_type"] == "admin_region_aggregation_layer"
    assert result["input_artifact_type"] == "climate_layer"
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
    assert result["admin_name_column"] == "admin_name"
    assert result["admin_id_column"] == "admin_id"
    assert result["source_value_column"] == "extreme_heat_days_mean"
    assert result["units"] == "days/year"
    assert result["geojson"] is not None
    assert result["geojson"]["type"] == "FeatureCollection"
    assert result["feature_count"] > 0
    assert result["input_feature_count"] > 0
    assert result["admin_region_count"] > 0
    assert result["matched_feature_count"] > 0
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


def test_aggregate_by_admin_region_default_methods():
    input_artifact = make_input_artifact(values=[10, 20, 30, 40])
    admin_artifact = make_admin_boundaries_artifact()

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        admin_level="district",
    )

    assert_valid_admin_aggregation_artifact(result)

    assert result["admin_level"] == "district"
    assert result["value_column"] == "extreme_heat_days_mean_mean"
    assert result["aggregation_methods"] == [
        "count",
        "mean",
        "median",
        "min",
        "max",
        "std",
        "sum",
        "p90",
        "p95",
    ]

    assert result["feature_count"] == 2
    assert result["input_feature_count"] == 4
    assert result["admin_region_count"] == 2
    assert result["matched_feature_count"] == 4
    assert result["unmatched_feature_count"] == 0

    features = result["geojson"]["features"]
    props_by_name = {
        feature["properties"]["admin_name"]: feature["properties"]
        for feature in features
    }

    west = props_by_name["West District"]
    east = props_by_name["East District"]

    assert west["extreme_heat_days_mean_count"] == 3
    assert west["extreme_heat_days_mean_mean"] == pytest.approx(20.0)
    assert west["extreme_heat_days_mean_median"] == pytest.approx(20.0)
    assert west["extreme_heat_days_mean_min"] == pytest.approx(10.0)
    assert west["extreme_heat_days_mean_max"] == pytest.approx(30.0)
    assert west["extreme_heat_days_mean_sum"] == pytest.approx(60.0)
    assert west["extreme_heat_days_mean_p90"] == pytest.approx(28.0)
    assert west["extreme_heat_days_mean_p95"] == pytest.approx(29.0)

    assert east["extreme_heat_days_mean_count"] == 1
    assert east["extreme_heat_days_mean_mean"] == pytest.approx(40.0)
    assert east["extreme_heat_days_mean_median"] == pytest.approx(40.0)
    assert east["extreme_heat_days_mean_min"] == pytest.approx(40.0)
    assert east["extreme_heat_days_mean_max"] == pytest.approx(40.0)
    assert east["extreme_heat_days_mean_sum"] == pytest.approx(40.0)

    summary = result["summary"]

    assert summary["input_feature_count"] == 4
    assert summary["admin_region_count"] == 2
    assert summary["matched_feature_count"] == 4
    assert summary["unmatched_feature_count"] == 0
    assert summary["valid_count"] == 4
    assert summary["missing_count"] == 0
    assert summary["source_value_column"] == "extreme_heat_days_mean"
    assert summary["output_value_column"] == "extreme_heat_days_mean_mean"
    assert summary["input_min"] == pytest.approx(10.0)
    assert summary["input_max"] == pytest.approx(40.0)
    assert summary["input_mean"] == pytest.approx(25.0)


def test_custom_aggregation_methods_and_aliases():
    input_artifact = make_input_artifact(values=[10, 20, 30, 40])
    admin_artifact = make_admin_boundaries_artifact()

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        aggregation_methods=["n", "average", "maximum", "sum", "variance"],
    )

    assert_valid_admin_aggregation_artifact(result)

    assert result["aggregation_methods"] == [
        "count",
        "mean",
        "max",
        "sum",
        "variance",
    ]

    features = result["geojson"]["features"]
    props_by_name = {
        feature["properties"]["admin_name"]: feature["properties"]
        for feature in features
    }

    west = props_by_name["West District"]

    assert west["extreme_heat_days_mean_count"] == 3
    assert west["extreme_heat_days_mean_mean"] == pytest.approx(20.0)
    assert west["extreme_heat_days_mean_max"] == pytest.approx(30.0)
    assert west["extreme_heat_days_mean_sum"] == pytest.approx(60.0)
    assert west["extreme_heat_days_mean_variance"] == pytest.approx(100.0)


def test_table_output_contains_admin_names_ids_and_stats():
    input_artifact = make_input_artifact(values=[10, 20, 30, 40])
    admin_artifact = make_admin_boundaries_artifact()

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        aggregation_methods=["mean", "max"],
    )

    assert_valid_admin_aggregation_artifact(result)

    table = result["table"]

    assert len(table) == 2

    names = [row["admin_name"] for row in table]
    ids = [row["admin_id"] for row in table]

    assert names == ["West District", "East District"]
    assert ids == ["ADM_1", "ADM_2"]

    west_row = table[0]
    east_row = table[1]

    assert west_row["source_value_column"] == "extreme_heat_days_mean"
    assert west_row["extreme_heat_days_mean_mean"] == pytest.approx(20.0)
    assert west_row["extreme_heat_days_mean_max"] == pytest.approx(30.0)

    assert east_row["source_value_column"] == "extreme_heat_days_mean"
    assert east_row["extreme_heat_days_mean_mean"] == pytest.approx(40.0)
    assert east_row["extreme_heat_days_mean_max"] == pytest.approx(40.0)


def test_keep_admin_regions_without_data_true():
    input_artifact = make_input_artifact(values=[10, 20, 30, 40])
    admin_artifact = make_admin_boundaries_artifact(include_empty_region=True)

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        aggregation_methods=["mean", "count"],
        keep_admin_regions_without_data=True,
    )

    assert_valid_admin_aggregation_artifact(result)

    assert result["feature_count"] == 3
    assert result["admin_region_count"] == 3
    assert result["matched_feature_count"] == 4

    features = result["geojson"]["features"]
    props_by_name = {
        feature["properties"]["admin_name"]: feature["properties"]
        for feature in features
    }

    assert "No Data District" in props_by_name

    no_data = props_by_name["No Data District"]

    assert no_data["extreme_heat_days_mean_mean"] is None
    assert no_data["extreme_heat_days_mean_count"] is None


def test_keep_admin_regions_without_data_false():
    input_artifact = make_input_artifact(values=[10, 20, 30, 40])
    admin_artifact = make_admin_boundaries_artifact(include_empty_region=True)

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        aggregation_methods=["mean", "count"],
        keep_admin_regions_without_data=False,
    )

    assert_valid_admin_aggregation_artifact(result)

    assert result["feature_count"] == 2
    assert result["admin_region_count"] == 2

    names = [
        feature["properties"]["admin_name"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["West District", "East District"]


def test_missing_and_non_numeric_values_are_ignored_with_warning():
    input_artifact = make_input_artifact(values=[10, None, "bad", 40])
    admin_artifact = make_admin_boundaries_artifact()

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        aggregation_methods=["count", "mean", "max"],
    )

    assert_valid_admin_aggregation_artifact(result)

    assert result["warnings"]

    features = result["geojson"]["features"]
    props_by_name = {
        feature["properties"]["admin_name"]: feature["properties"]
        for feature in features
    }

    west = props_by_name["West District"]
    east = props_by_name["East District"]

    assert west["extreme_heat_days_mean_count"] == 1
    assert west["extreme_heat_days_mean_mean"] == pytest.approx(10.0)
    assert west["extreme_heat_days_mean_max"] == pytest.approx(10.0)

    assert east["extreme_heat_days_mean_count"] == 1
    assert east["extreme_heat_days_mean_mean"] == pytest.approx(40.0)
    assert east["extreme_heat_days_mean_max"] == pytest.approx(40.0)

    assert result["summary"]["valid_count"] == 2
    assert result["summary"]["missing_count"] == 2


def test_explicit_value_column():
    input_artifact = make_input_artifact(
        values=[1.5, 2.5, 3.5, 4.5],
        value_column="custom_heat_score",
    )
    admin_artifact = make_admin_boundaries_artifact()

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        value_column="custom_heat_score",
        aggregation_methods=["mean", "max"],
    )

    assert result["artifact_type"] == "admin_region_aggregation_layer"
    assert result["source_value_column"] == "custom_heat_score"
    assert result["value_column"] == "custom_heat_score_mean"

    features = result["geojson"]["features"]
    props_by_name = {
        feature["properties"]["admin_name"]: feature["properties"]
        for feature in features
    }

    assert props_by_name["West District"]["custom_heat_score_mean"] == pytest.approx(2.5)
    assert props_by_name["East District"]["custom_heat_score_mean"] == pytest.approx(4.5)


def test_intersects_join_method():
    input_artifact = make_input_artifact(values=[10, 20, 30, 40])
    admin_artifact = make_admin_boundaries_artifact()

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        join_method="intersects",
        aggregation_methods=["count", "mean"],
    )

    assert_valid_admin_aggregation_artifact(result)

    assert result["provenance"]["join_method"] == "intersects"
    assert result["matched_feature_count"] >= 4


def test_admin_name_column_inferred_when_missing():
    input_artifact = make_input_artifact(values=[10, 20, 30, 40])
    admin_artifact = make_admin_boundaries_artifact()

    for feature in admin_artifact["geojson"]["features"]:
        feature["properties"]["name"] = feature["properties"].pop("admin_name")

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        aggregation_methods=["mean"],
    )

    assert result["artifact_type"] == "admin_region_aggregation_layer"
    assert result["admin_name_column"] == "name"

    names = [
        feature["properties"]["name"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["West District", "East District"]


def test_missing_admin_name_column_creates_fallback_names():
    input_artifact = make_input_artifact(values=[10, 20, 30, 40])
    admin_artifact = make_admin_boundaries_artifact()

    for feature in admin_artifact["geojson"]["features"]:
        del feature["properties"]["admin_name"]

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        aggregation_methods=["mean"],
    )

    assert result["artifact_type"] == "admin_region_aggregation_layer"
    assert result["admin_name_column"] == "admin_name"

    names = [
        feature["properties"]["admin_name"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["admin_region_1", "admin_region_2"]


def test_missing_value_column_fails_cleanly():
    input_artifact = make_input_artifact(values=[10, 20])
    admin_artifact = make_admin_boundaries_artifact()

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        value_column="not_a_real_column",
    )

    assert result["artifact_type"] == "admin_region_aggregation_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["table"] == []
    assert result["warnings"]


def test_missing_input_geojson_fails_cleanly():
    input_artifact = make_input_artifact(values=[10, 20])
    admin_artifact = make_admin_boundaries_artifact()

    del input_artifact["geojson"]

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
    )

    assert result["artifact_type"] == "admin_region_aggregation_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_missing_admin_boundaries_fails_cleanly():
    input_artifact = make_input_artifact(values=[10, 20])

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
    )

    assert result["artifact_type"] == "admin_region_aggregation_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_empty_input_artifact_fails_cleanly():
    input_artifact = make_input_artifact(values=[])
    admin_artifact = make_admin_boundaries_artifact()

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
    )

    assert result["artifact_type"] == "admin_region_aggregation_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_empty_admin_boundaries_fails_cleanly():
    input_artifact = make_input_artifact(values=[10, 20])

    admin_artifact = {
        "artifact_type": "admin_boundaries",
        "geojson": {
            "type": "FeatureCollection",
            "features": [],
        },
    }

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
    )

    assert result["artifact_type"] == "admin_region_aggregation_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_no_spatial_matches_fails_cleanly():
    input_artifact = make_input_artifact(values=[10, 20])

    admin_artifact = {
        "artifact_type": "admin_boundaries",
        "geojson": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "admin_id": "FAR",
                        "admin_name": "Far Away",
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [150.0, -18.2],
                                [151.0, -18.2],
                                [151.0, -17.8],
                                [150.0, -17.8],
                                [150.0, -18.2],
                            ]
                        ],
                    },
                }
            ],
        },
    }

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
    )

    assert result["artifact_type"] == "admin_region_aggregation_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_unsupported_aggregation_method_fails_cleanly():
    input_artifact = make_input_artifact(values=[10, 20])
    admin_artifact = make_admin_boundaries_artifact()

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        aggregation_methods=["mean", "not_a_real_method"],
    )

    assert result["artifact_type"] == "admin_region_aggregation_failed"
    assert result["geojson"] is None
    assert result["summary"] is None
    assert result["warnings"]


def test_unsupported_join_method_fails_cleanly():
    input_artifact = make_input_artifact(values=[10, 20])
    admin_artifact = make_admin_boundaries_artifact()

    result = aggregate_by_admin_region(
        input_artifact=input_artifact,
        admin_boundaries_artifact=admin_artifact,
        join_method="nearest",
    )

    assert result["artifact_type"] == "admin_region_aggregation_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_geometry_format_raises_error():
    input_artifact = make_input_artifact(values=[10, 20])
    admin_artifact = make_admin_boundaries_artifact()

    with pytest.raises(ValueError):
        aggregate_by_admin_region(
            input_artifact=input_artifact,
            admin_boundaries_artifact=admin_artifact,
            return_geometry_format="wkt",
        )