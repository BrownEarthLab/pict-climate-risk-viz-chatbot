from pathlib import Path
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import summarize_climate_by_region


def make_climate_artifact(values, value_column="extreme_heat_days_mean"):
    """
    Create a tiny climate layer artifact for summary tests.
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


def assert_valid_summary_artifact(result):
    assert result["artifact_type"] == "climate_region_summary"
    assert result["input_artifact_type"] is not None
    assert result["input_layer_id"] is not None
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
    assert result["value_column"] == "extreme_heat_days_mean"
    assert result["units"] == "days/year"
    assert isinstance(result["statistics_requested"], list)
    assert isinstance(result["summary"], dict)
    assert isinstance(result["table"], list)
    assert result["feature_count"] > 0
    assert result["valid_count"] > 0
    assert result["bbox"] is not None
    assert result["crs"] == "EPSG:4326"
    assert isinstance(result["warnings"], list)
    assert isinstance(result["suggestions"], list)
    assert isinstance(result["provenance"], dict)

    bbox = result["bbox"]
    assert len(bbox) == 4
    assert all(isinstance(x, float) for x in bbox)


def test_summarize_climate_by_region_with_artifact():
    artifact = make_climate_artifact(values=[10, 20, 30])

    result = summarize_climate_by_region(
        input_artifact=artifact,
        clip_to_region=False,
    )

    assert_valid_summary_artifact(result)

    summary = result["summary"]

    assert summary["count"] == 3
    assert summary["mean"] == pytest.approx(20.0)
    assert summary["median"] == pytest.approx(20.0)
    assert summary["min"] == pytest.approx(10.0)
    assert summary["max"] == pytest.approx(30.0)
    assert summary["std"] == pytest.approx(10.0)
    assert summary["p10"] == pytest.approx(12.0)
    assert summary["p25"] == pytest.approx(15.0)
    assert summary["p75"] == pytest.approx(25.0)
    assert summary["p90"] == pytest.approx(28.0)
    assert summary["p95"] == pytest.approx(29.0)

    assert result["feature_count"] == 3
    assert result["valid_count"] == 3
    assert result["missing_count"] == 0
    assert result["geojson"] is None


def test_summary_table_output():
    artifact = make_climate_artifact(values=[10, 20, 30])

    result = summarize_climate_by_region(
        input_artifact=artifact,
        statistics=["mean", "max", "p90"],
        clip_to_region=False,
    )

    assert_valid_summary_artifact(result)

    table = result["table"]

    assert table == [
        {
            "statistic": "mean",
            "value": pytest.approx(20.0),
        },
        {
            "statistic": "max",
            "value": pytest.approx(30.0),
        },
        {
            "statistic": "p90",
            "value": pytest.approx(28.0),
        },
    ]


def test_custom_statistics_and_aliases():
    artifact = make_climate_artifact(values=[10, 20, 30, 40])

    result = summarize_climate_by_region(
        input_artifact=artifact,
        statistics=["n", "average", "minimum", "maximum", "sd", "sum", "variance"],
        clip_to_region=False,
    )

    assert_valid_summary_artifact(result)

    summary = result["summary"]

    assert result["statistics_requested"] == [
        "count",
        "mean",
        "min",
        "max",
        "std",
        "sum",
        "variance",
    ]

    assert summary["count"] == 4
    assert summary["mean"] == pytest.approx(25.0)
    assert summary["min"] == pytest.approx(10.0)
    assert summary["max"] == pytest.approx(40.0)
    assert summary["std"] == pytest.approx(12.9099444874)
    assert summary["sum"] == pytest.approx(100.0)
    assert summary["variance"] == pytest.approx(166.6666666667)


def test_missing_and_non_numeric_values_are_ignored_with_warning():
    artifact = make_climate_artifact(values=[10, None, "bad", 20])

    result = summarize_climate_by_region(
        input_artifact=artifact,
        statistics=["count", "missing_count", "mean", "max"],
        clip_to_region=False,
    )

    assert_valid_summary_artifact(result)

    summary = result["summary"]

    assert summary["count"] == 2
    assert summary["missing_count"] == 2
    assert summary["mean"] == pytest.approx(15.0)
    assert summary["max"] == pytest.approx(20.0)

    assert result["feature_count"] == 4
    assert result["valid_count"] == 2
    assert result["missing_count"] == 2
    assert result["warnings"]


def test_include_geometry_true_returns_geojson():
    artifact = make_climate_artifact(values=[10, 20])

    result = summarize_climate_by_region(
        input_artifact=artifact,
        clip_to_region=False,
        include_geometry=True,
    )

    assert_valid_summary_artifact(result)

    assert result["geojson"] is not None
    assert result["geojson"]["type"] == "FeatureCollection"
    assert len(result["geojson"]["features"]) == 2


def test_explicit_value_column():
    artifact = make_climate_artifact(
        values=[1.5, 2.5, 3.5],
        value_column="custom_heat_score",
    )

    result = summarize_climate_by_region(
        input_artifact=artifact,
        value_column="custom_heat_score",
        statistics=["mean", "max"],
        clip_to_region=False,
    )

    assert result["artifact_type"] == "climate_region_summary"
    assert result["value_column"] == "custom_heat_score"
    assert result["summary"]["mean"] == pytest.approx(2.5)
    assert result["summary"]["max"] == pytest.approx(3.5)


def test_missing_value_column_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    result = summarize_climate_by_region(
        input_artifact=artifact,
        value_column="not_a_real_column",
        clip_to_region=False,
    )

    assert result["artifact_type"] == "climate_region_summary_failed"
    assert result["summary"] is None
    assert result["feature_count"] == 0
    assert result["geojson"] is None
    assert result["warnings"]


def test_missing_geojson_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20])

    del artifact["geojson"]

    result = summarize_climate_by_region(
        input_artifact=artifact,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "climate_region_summary_failed"
    assert result["summary"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_empty_artifact_fails_cleanly():
    artifact = make_climate_artifact(values=[])

    result = summarize_climate_by_region(
        input_artifact=artifact,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "climate_region_summary_failed"
    assert result["summary"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_all_non_numeric_values_fail_cleanly():
    artifact = make_climate_artifact(values=["bad", None, "worse"])

    result = summarize_climate_by_region(
        input_artifact=artifact,
        clip_to_region=False,
    )

    assert result["artifact_type"] == "climate_region_summary_failed"
    assert result["summary"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_unsupported_statistic_fails_cleanly():
    artifact = make_climate_artifact(values=[10, 20, 30])

    result = summarize_climate_by_region(
        input_artifact=artifact,
        statistics=["mean", "not_a_real_statistic"],
        clip_to_region=False,
    )

    assert result["artifact_type"] == "climate_region_summary_failed"
    assert result["summary"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_invalid_geometry_format_raises_error():
    artifact = make_climate_artifact(values=[10, 20])

    with pytest.raises(ValueError):
        summarize_climate_by_region(
            input_artifact=artifact,
            return_geometry_format="wkt",
            clip_to_region=False,
        )


def test_missing_variable_when_loading_internally_fails_cleanly():
    result = summarize_climate_by_region(
        region_name="Fiji",
        period="2050s",
        scenario="SSP2-4.5",
        model="ACCESS-CM2",
    )

    assert result["artifact_type"] == "climate_region_summary_failed"
    assert result["summary"] is None
    assert result["warnings"]


def test_missing_registered_layer_fails_cleanly():
    result = summarize_climate_by_region(
        variable="definitely_not_a_real_variable",
        region_name="Fiji",
        period="2050s",
        scenario="SSP2-4.5",
        model="ACCESS-CM2",
    )

    assert result["artifact_type"] == "climate_region_summary_failed"
    assert result["summary"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]