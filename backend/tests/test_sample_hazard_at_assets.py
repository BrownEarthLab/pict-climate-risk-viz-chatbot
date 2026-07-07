from pathlib import Path
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import sample_hazard_at_assets


def make_hazard_artifact(values=None, value_column="extreme_heat_days_mean"):
    """
    Create a tiny hazard layer with two polygon cells.
    """
    if values is None:
        values = [10, 30]

    features = []

    polygons = [
        [
            [177.0, -18.0],
            [177.5, -18.0],
            [177.5, -17.5],
            [177.0, -17.5],
            [177.0, -18.0],
        ],
        [
            [177.5, -18.0],
            [178.0, -18.0],
            [178.0, -17.5],
            [177.5, -17.5],
            [177.5, -18.0],
        ],
    ]

    for i, value in enumerate(values):
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "cell_id": f"cell_{i + 1}",
                    value_column: value,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [polygons[i]],
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
        "bbox": [177.0, -18.0, 178.0, -17.5],
        "crs": "EPSG:4326",
        "value_column": value_column,
        "units": "days/year",
        "warnings": [],
        "suggestions": [],
        "provenance": {
            "source": "test",
        },
    }


def make_assets_artifact(include_unmatched=True):
    """
    Create three point assets:
    - Hospital A inside hazard cell 1
    - Hospital B inside hazard cell 2
    - Hospital C outside all hazard cells
    """
    features = [
        {
            "type": "Feature",
            "properties": {
                "asset_id": "HOSP_1",
                "asset_name": "Hospital A",
                "asset_type": "hospital",
            },
            "geometry": {
                "type": "Point",
                "coordinates": [177.2, -17.8],
            },
        },
        {
            "type": "Feature",
            "properties": {
                "asset_id": "HOSP_2",
                "asset_name": "Hospital B",
                "asset_type": "hospital",
            },
            "geometry": {
                "type": "Point",
                "coordinates": [177.7, -17.8],
            },
        },
    ]

    if include_unmatched:
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "asset_id": "HOSP_3",
                    "asset_name": "Hospital C",
                    "asset_type": "hospital",
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [179.0, -17.8],
                },
            }
        )

    return {
        "artifact_type": "asset_layer",
        "layer_id": "fiji_hospitals",
        "asset_type": "hospital",
        "geojson": {
            "type": "FeatureCollection",
            "features": features,
        },
        "feature_count": len(features),
        "bbox": [177.2, -17.8, 179.0, -17.8],
        "crs": "EPSG:4326",
        "warnings": [],
        "suggestions": [],
        "provenance": {
            "source": "test",
        },
    }


def make_polygon_assets_artifact():
    """
    Create polygon assets to test representative-point sampling.
    """
    return {
        "artifact_type": "asset_layer",
        "layer_id": "fiji_school_polygons",
        "asset_type": "school",
        "geojson": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "asset_id": "SCH_1",
                        "asset_name": "School A",
                        "asset_type": "school",
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [177.1, -17.9],
                                [177.3, -17.9],
                                [177.3, -17.7],
                                [177.1, -17.7],
                                [177.1, -17.9],
                            ]
                        ],
                    },
                }
            ],
        },
        "feature_count": 1,
        "bbox": [177.1, -17.9, 177.3, -17.7],
        "crs": "EPSG:4326",
        "warnings": [],
        "suggestions": [],
        "provenance": {
            "source": "test",
        },
    }


def assert_valid_asset_sample_artifact(result):
    assert result["artifact_type"] == "asset_hazard_sample_layer"
    assert result["input_hazard_artifact_type"] == "climate_layer"
    assert result["input_hazard_layer_id"] is not None
    assert result["input_assets_artifact_type"] == "asset_layer"
    assert result["input_assets_layer_id"] is not None
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
    assert result["value_column"] == "sampled_hazard_value"
    assert result["source_value_column"] == "extreme_heat_days_mean"
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


def test_sample_hazard_at_assets_within():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        sampling_method="within",
    )

    assert_valid_asset_sample_artifact(result)

    assert result["sampling_method"] == "within"
    assert result["feature_count"] == 2
    assert result["asset_count"] == 2
    assert result["matched_asset_count"] == 2
    assert result["unmatched_asset_count"] == 0
    assert result["valid_sample_count"] == 2
    assert result["missing_sample_count"] == 0

    features = result["geojson"]["features"]

    names = [feature["properties"]["asset_name"] for feature in features]
    sampled_values = [
        feature["properties"]["sampled_hazard_value"]
        for feature in features
    ]

    assert names == ["Hospital A", "Hospital B"]
    assert sampled_values == [10, 30]

    summary = result["summary"]

    assert summary["asset_count"] == 2
    assert summary["matched_asset_count"] == 2
    assert summary["unmatched_asset_count"] == 0
    assert summary["valid_sample_count"] == 2
    assert summary["missing_sample_count"] == 0
    assert summary["sampled_min"] == pytest.approx(10.0)
    assert summary["sampled_max"] == pytest.approx(30.0)
    assert summary["sampled_mean"] == pytest.approx(20.0)
    assert summary["sampled_median"] == pytest.approx(20.0)


def test_sample_geojson_contains_expected_columns():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
    )

    assert_valid_asset_sample_artifact(result)

    feature = result["geojson"]["features"][0]
    props = feature["properties"]

    expected_columns = [
        "asset_id",
        "asset_name",
        "asset_type",
        "extreme_heat_days_mean",
        "sampled_hazard_value",
        "matched_hazard",
        "sampled_value_column",
    ]

    for column in expected_columns:
        assert column in props

    assert props["asset_name"] == "Hospital A"
    assert props["sampled_hazard_value"] == 10
    assert props["matched_hazard"] is True
    assert props["sampled_value_column"] == "extreme_heat_days_mean"


def test_table_output_contains_assets_values_and_coordinates():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
    )

    assert_valid_asset_sample_artifact(result)

    table = result["table"]

    assert len(table) == 2

    assert table[0]["asset_name"] == "Hospital A"
    assert table[0]["asset_id"] == "HOSP_1"
    assert table[0]["asset_type"] == "hospital"
    assert table[0]["sampled_value"] == pytest.approx(10.0)
    assert table[0]["source_value_column"] == "sampled_hazard_value"
    assert table[0]["matched_hazard"] is True
    assert table[0]["longitude"] == pytest.approx(177.2)
    assert table[0]["latitude"] == pytest.approx(-17.8)

    assert table[1]["asset_name"] == "Hospital B"
    assert table[1]["asset_id"] == "HOSP_2"
    assert table[1]["sampled_value"] == pytest.approx(30.0)


def test_include_unmatched_assets_true():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=True)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        include_unmatched_assets=True,
    )

    assert_valid_asset_sample_artifact(result)

    assert result["feature_count"] == 3
    assert result["asset_count"] == 3
    assert result["matched_asset_count"] == 2
    assert result["unmatched_asset_count"] == 1
    assert result["valid_sample_count"] == 2
    assert result["missing_sample_count"] == 1
    assert result["warnings"]

    features = result["geojson"]["features"]

    names = [feature["properties"]["asset_name"] for feature in features]
    sampled_values = [
        feature["properties"]["sampled_hazard_value"]
        for feature in features
    ]
    matched = [feature["properties"]["matched_hazard"] for feature in features]

    assert names == ["Hospital A", "Hospital B", "Hospital C"]
    assert sampled_values == [10, 30, None]
    assert matched == [True, True, False]


def test_include_unmatched_assets_false():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=True)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        include_unmatched_assets=False,
    )

    assert_valid_asset_sample_artifact(result)

    assert result["feature_count"] == 2
    assert result["asset_count"] == 2
    assert result["matched_asset_count"] == 2
    assert result["unmatched_asset_count"] == 0

    names = [
        feature["properties"]["asset_name"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["Hospital A", "Hospital B"]


def test_intersects_sampling_method():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        sampling_method="intersects",
    )

    assert_valid_asset_sample_artifact(result)

    assert result["sampling_method"] == "intersects"
    assert result["matched_asset_count"] == 2
    assert result["valid_sample_count"] == 2


def test_sampling_method_alias_contains_maps_to_within():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        sampling_method="contains",
    )

    assert_valid_asset_sample_artifact(result)

    assert result["sampling_method"] == "within"
    assert result["matched_asset_count"] == 2


def test_nearest_sampling_method():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=True)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        sampling_method="nearest",
    )

    assert_valid_asset_sample_artifact(result)

    assert result["sampling_method"] == "nearest"
    assert result["feature_count"] == 3
    assert result["matched_asset_count"] == 3
    assert result["unmatched_asset_count"] == 0
    assert result["valid_sample_count"] == 3

    names = [
        feature["properties"]["asset_name"]
        for feature in result["geojson"]["features"]
    ]
    sampled_values = [
        feature["properties"]["sampled_hazard_value"]
        for feature in result["geojson"]["features"]
    ]

    assert names == ["Hospital A", "Hospital B", "Hospital C"]
    assert sampled_values == [10, 30, 30]


def test_nearest_if_unmatched():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=True)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        sampling_method="within",
        nearest_if_unmatched=True,
    )

    assert_valid_asset_sample_artifact(result)

    assert result["sampling_method"] == "within"
    assert result["nearest_if_unmatched"] is True
    assert result["feature_count"] == 3
    assert result["matched_asset_count"] == 3
    assert result["unmatched_asset_count"] == 0
    assert result["valid_sample_count"] == 3

    sampled_values = [
        feature["properties"]["sampled_hazard_value"]
        for feature in result["geojson"]["features"]
    ]

    assert sampled_values == [10, 30, 30]


def test_max_nearest_distance_can_leave_asset_unmatched():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=True)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        sampling_method="nearest",
        max_nearest_distance_m=1,
        include_unmatched_assets=True,
    )

    assert_valid_asset_sample_artifact(result)

    assert result["feature_count"] == 3
    assert result["matched_asset_count"] == 2
    assert result["unmatched_asset_count"] == 1
    assert result["valid_sample_count"] == 2
    assert result["missing_sample_count"] == 1
    assert result["warnings"]


def test_missing_hazard_values_are_sampled_as_missing_with_warning():
    hazard_artifact = make_hazard_artifact(values=[10, None])
    assets_artifact = make_assets_artifact(include_unmatched=False)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
    )

    assert_valid_asset_sample_artifact(result)

    assert result["feature_count"] == 2
    assert result["matched_asset_count"] == 2
    assert result["valid_sample_count"] == 1
    assert result["missing_sample_count"] == 1
    assert result["warnings"]

    sampled_values = [
        feature["properties"]["sampled_hazard_value"]
        for feature in result["geojson"]["features"]
    ]

    assert sampled_values == [10, None]


def test_explicit_value_column():
    hazard_artifact = make_hazard_artifact(
        values=[1.5, 3.5],
        value_column="custom_risk_score",
    )
    assets_artifact = make_assets_artifact(include_unmatched=False)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        value_column="custom_risk_score",
    )

    assert result["artifact_type"] == "asset_hazard_sample_layer"
    assert result["source_value_column"] == "custom_risk_score"
    assert result["value_column"] == "sampled_hazard_value"

    sampled_values = [
        feature["properties"]["sampled_hazard_value"]
        for feature in result["geojson"]["features"]
    ]

    assert sampled_values == [1.5, 3.5]


def test_asset_column_inference_with_name_id_type_aliases():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    for feature in assets_artifact["geojson"]["features"]:
        feature["properties"]["name"] = feature["properties"].pop("asset_name")
        feature["properties"]["id"] = feature["properties"].pop("asset_id")
        feature["properties"]["category"] = feature["properties"].pop("asset_type")

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
    )

    assert result["artifact_type"] == "asset_hazard_sample_layer"
    assert result["asset_name_column"] == "name"
    assert result["asset_id_column"] == "id"
    assert result["asset_type_column"] == "category"

    table = result["table"]

    assert table[0]["asset_name"] == "Hospital A"
    assert table[0]["asset_id"] == "HOSP_1"
    assert table[0]["asset_type"] == "hospital"


def test_explicit_asset_columns():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    for feature in assets_artifact["geojson"]["features"]:
        feature["properties"]["facility_label"] = feature["properties"].pop("asset_name")
        feature["properties"]["facility_code"] = feature["properties"].pop("asset_id")
        feature["properties"]["facility_class"] = feature["properties"].pop("asset_type")

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        asset_name_column="facility_label",
        asset_id_column="facility_code",
        asset_type_column="facility_class",
    )

    assert result["artifact_type"] == "asset_hazard_sample_layer"
    assert result["asset_name_column"] == "facility_label"
    assert result["asset_id_column"] == "facility_code"
    assert result["asset_type_column"] == "facility_class"

    table = result["table"]

    assert table[0]["asset_name"] == "Hospital A"
    assert table[0]["asset_id"] == "HOSP_1"
    assert table[0]["asset_type"] == "hospital"


def test_polygon_assets_use_representative_points():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_polygon_assets_artifact()

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
    )

    assert result["artifact_type"] == "asset_hazard_sample_layer"
    assert result["feature_count"] == 1
    assert result["matched_asset_count"] == 1
    assert result["valid_sample_count"] == 1

    feature = result["geojson"]["features"][0]

    assert feature["geometry"]["type"] == "Point"
    assert feature["properties"]["sampled_hazard_value"] == 10


def test_missing_hazard_geojson_fails_cleanly():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    del hazard_artifact["geojson"]

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
    )

    assert result["artifact_type"] == "asset_hazard_sample_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["table"] == []
    assert result["warnings"]


def test_missing_assets_fails_cleanly():
    hazard_artifact = make_hazard_artifact()

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
    )

    assert result["artifact_type"] == "asset_hazard_sample_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["summary"] is None
    assert result["warnings"]


def test_missing_value_column_fails_cleanly():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        value_column="not_a_real_column",
    )

    assert result["artifact_type"] == "asset_hazard_sample_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_invalid_asset_name_column_fails_cleanly():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        asset_name_column="not_a_real_column",
    )

    assert result["artifact_type"] == "asset_hazard_sample_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_unsupported_sampling_method_fails_cleanly():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
        sampling_method="random",
    )

    assert result["artifact_type"] == "asset_hazard_sample_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_empty_hazard_layer_fails_cleanly():
    hazard_artifact = make_hazard_artifact()
    hazard_artifact["geojson"]["features"] = []
    hazard_artifact["feature_count"] = 0

    assets_artifact = make_assets_artifact(include_unmatched=False)

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
    )

    assert result["artifact_type"] == "asset_hazard_sample_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_empty_asset_layer_fails_cleanly():
    hazard_artifact = make_hazard_artifact()

    assets_artifact = {
        "artifact_type": "asset_layer",
        "layer_id": "empty_assets",
        "geojson": {
            "type": "FeatureCollection",
            "features": [],
        },
    }

    result = sample_hazard_at_assets(
        hazard_artifact=hazard_artifact,
        assets_artifact=assets_artifact,
    )

    assert result["artifact_type"] == "asset_hazard_sample_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_invalid_geometry_format_raises_error():
    hazard_artifact = make_hazard_artifact()
    assets_artifact = make_assets_artifact(include_unmatched=False)

    with pytest.raises(ValueError):
        sample_hazard_at_assets(
            hazard_artifact=hazard_artifact,
            assets_artifact=assets_artifact,
            return_geometry_format="wkt",
        )