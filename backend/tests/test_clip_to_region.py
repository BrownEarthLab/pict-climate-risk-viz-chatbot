from pathlib import Path
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import resolve_region, clip_to_region


def make_test_spatial_artifact_from_region(region_artifact):
    """
    Create a simple spatial artifact using the region geometry itself.
    This guarantees the artifact overlaps the clipping region.
    """
    return {
        "artifact_type": "test_layer",
        "layer_id": "test_layer_fiji",
        "variable": "test_variable",
        "period": "2050s",
        "scenario": "SSP2-4.5",
        "model": "test_model",
        "value_column": "test_value",
        "units": "test_units",
        "uncertainty_columns": [],
        "geojson": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "cell_id": "cell_001",
                        "test_value": 10.0
                    },
                    "geometry": region_artifact["geometry"]
                }
            ]
        },
        "provenance": {
            "source": "test"
        }
    }


def make_non_overlapping_artifact():
    """
    Creates a tiny polygon near 0,0, which should not overlap Fiji.
    """
    return {
        "artifact_type": "test_layer",
        "layer_id": "test_non_overlapping_layer",
        "variable": "test_variable",
        "period": "2050s",
        "scenario": "SSP2-4.5",
        "model": "test_model",
        "value_column": "test_value",
        "units": "test_units",
        "uncertainty_columns": [],
        "geojson": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "cell_id": "cell_001",
                        "test_value": 10.0
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [0.0, 0.0],
                                [1.0, 0.0],
                                [1.0, 1.0],
                                [0.0, 1.0],
                                [0.0, 0.0]
                            ]
                        ]
                    }
                }
            ]
        },
        "provenance": {
            "source": "test"
        }
    }


def assert_valid_clipped_artifact(result):
    assert result["artifact_type"] == "clipped_layer"
    assert result["geojson"] is not None
    assert result["geojson"]["type"] == "FeatureCollection"
    assert result["feature_count"] > 0
    assert result["bbox"] is not None
    assert result["crs"] == "EPSG:4326"
    assert isinstance(result["warnings"], list)
    assert isinstance(result["suggestions"], list)
    assert isinstance(result["provenance"], dict)

    bbox = result["bbox"]
    assert len(bbox) == 4
    assert all(isinstance(x, float) for x in bbox)


def test_clip_to_region_with_region_artifact():
    fiji_region = resolve_region("Fiji")
    input_artifact = make_test_spatial_artifact_from_region(fiji_region)

    result = clip_to_region(
        input_artifact=input_artifact,
        region_artifact=fiji_region,
    )

    assert_valid_clipped_artifact(result)

    assert result["input_artifact_type"] == "test_layer"
    assert result["input_layer_id"] == "test_layer_fiji"
    assert result["region_name"] == "Fiji"
    assert result["admin_level"] == "country_or_territory"
    assert result["value_column"] == "test_value"
    assert result["units"] == "test_units"


def test_clip_to_region_with_region_name():
    fiji_region = resolve_region("Fiji")
    input_artifact = make_test_spatial_artifact_from_region(fiji_region)

    result = clip_to_region(
        input_artifact=input_artifact,
        region_name="Fiji",
    )

    assert_valid_clipped_artifact(result)

    assert result["region_name"] == "Fiji"
    assert result["admin_level"] == "country_or_territory"


def test_clip_to_region_preserves_metadata():
    fiji_region = resolve_region("Fiji")
    input_artifact = make_test_spatial_artifact_from_region(fiji_region)

    result = clip_to_region(
        input_artifact=input_artifact,
        region_artifact=fiji_region,
    )

    assert_valid_clipped_artifact(result)

    assert result["variable"] == "test_variable"
    assert result["period"] == "2050s"
    assert result["scenario"] == "SSP2-4.5"
    assert result["model"] == "test_model"
    assert result["value_column"] == "test_value"
    assert result["units"] == "test_units"


def test_clip_to_unresolved_region_fails_cleanly():
    fiji_region = resolve_region("Fiji")
    input_artifact = make_test_spatial_artifact_from_region(fiji_region)

    result = clip_to_region(
        input_artifact=input_artifact,
        region_name="Definitely Not A Real Region",
    )

    assert result["artifact_type"] == "clip_to_region_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_non_overlapping_layer_fails_by_default():
    input_artifact = make_non_overlapping_artifact()

    result = clip_to_region(
        input_artifact=input_artifact,
        region_name="Fiji",
    )

    assert result["artifact_type"] == "clip_to_region_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_non_overlapping_layer_can_keep_empty():
    input_artifact = make_non_overlapping_artifact()

    result = clip_to_region(
        input_artifact=input_artifact,
        region_name="Fiji",
        keep_empty=True,
    )

    assert result["artifact_type"] == "clipped_layer"
    assert result["geojson"] is not None
    assert result["geojson"]["type"] == "FeatureCollection"
    assert result["feature_count"] == 0
    assert result["bbox"] is None
    assert result["warnings"]


def test_invalid_input_artifact_fails_cleanly():
    bad_artifact = {
        "artifact_type": "bad_layer",
        "layer_id": "bad_layer"
    }

    result = clip_to_region(
        input_artifact=bad_artifact,
        region_name="Fiji",
    )

    assert result["artifact_type"] == "clip_to_region_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_missing_region_argument_raises_error():
    fiji_region = resolve_region("Fiji")
    input_artifact = make_test_spatial_artifact_from_region(fiji_region)

    with pytest.raises(ValueError):
        clip_to_region(input_artifact=input_artifact)


def test_invalid_geometry_format_raises_error():
    fiji_region = resolve_region("Fiji")
    input_artifact = make_test_spatial_artifact_from_region(fiji_region)

    with pytest.raises(ValueError):
        clip_to_region(
            input_artifact=input_artifact,
            region_name="Fiji",
            return_geometry_format="wkt",
        )