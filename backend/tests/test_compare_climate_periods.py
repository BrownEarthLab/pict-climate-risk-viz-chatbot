from pathlib import Path
import sys

import pytest


# Makes this test work whether you run pytest from repo root or from backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import compare_climate_periods


def make_climate_artifact(period, values, layer_id=None):
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
        "layer_id": layer_id or f"fiji_extreme_heat_days_{period}",
        "variable": "extreme_heat_days",
        "region_name": "Fiji",
        "period": period,
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
        "value_column": "extreme_heat_days_mean",
        "units": "days/year",
        "uncertainty_columns": [],
        "warnings": [],
        "suggestions": [],
        "provenance": {
            "source": "test",
        },
    }


def assert_valid_comparison_artifact(result):
    assert result["artifact_type"] == "climate_period_comparison"
    assert result["layer_id"] is not None
    assert result["variable"] == "extreme_heat_days"
    assert result["region_name"] == "Fiji"
    assert result["period_a"] is not None
    assert result["period_b"] is not None
    assert result["geojson"] is not None
    assert result["geojson"]["type"] == "FeatureCollection"
    assert result["feature_count"] > 0
    assert result["bbox"] is not None
    assert result["crs"] == "EPSG:4326"
    assert result["value_column"] == "absolute_change"
    assert result["units"] == "days/year"
    assert isinstance(result["comparison_columns"], dict)
    assert isinstance(result["summary"], dict)
    assert isinstance(result["warnings"], list)
    assert isinstance(result["suggestions"], list)
    assert isinstance(result["provenance"], dict)

    bbox = result["bbox"]
    assert len(bbox) == 4
    assert all(isinstance(x, float) for x in bbox)


def test_compare_climate_periods_with_artifacts():
    layer_2050s = make_climate_artifact(
        period="2050s",
        values=[10, 20, 30],
        layer_id="heat_2050s",
    )

    layer_2060s = make_climate_artifact(
        period="2060s",
        values=[15, 25, 45],
        layer_id="heat_2060s",
    )

    result = compare_climate_periods(
        climate_artifact_a=layer_2050s,
        climate_artifact_b=layer_2060s,
    )

    assert_valid_comparison_artifact(result)

    assert result["period_a"] == "2050s"
    assert result["period_b"] == "2060s"
    assert result["scenario"] == "SSP2-4.5"
    assert result["model"] == "ACCESS-CM2"

    columns = result["comparison_columns"]
    assert columns["period_a_value_column"] == "extreme_heat_days_mean_2050s"
    assert columns["period_b_value_column"] == "extreme_heat_days_mean_2060s"
    assert columns["absolute_change_column"] == "absolute_change"
    assert columns["percent_change_column"] == "percent_change"
    assert columns["change_direction_column"] == "change_direction"

    summary = result["summary"]
    assert summary["feature_count"] == 3
    assert summary["period_a_mean"] == pytest.approx(20.0)
    assert summary["period_b_mean"] == pytest.approx(28.3333333333)
    assert summary["absolute_change_mean"] == pytest.approx(8.3333333333)
    assert summary["absolute_change_min"] == pytest.approx(5.0)
    assert summary["absolute_change_max"] == pytest.approx(15.0)


def test_comparison_geojson_contains_change_columns():
    layer_2050s = make_climate_artifact("2050s", [10, 20])
    layer_2060s = make_climate_artifact("2060s", [15, 10])

    result = compare_climate_periods(
        climate_artifact_a=layer_2050s,
        climate_artifact_b=layer_2060s,
    )

    assert_valid_comparison_artifact(result)

    features = result["geojson"]["features"]
    assert len(features) == 2

    props_1 = features[0]["properties"]
    props_2 = features[1]["properties"]

    assert "absolute_change" in props_1
    assert "percent_change" in props_1
    assert "change_direction" in props_1

    changes = [feature["properties"]["absolute_change"] for feature in features]
    directions = [feature["properties"]["change_direction"] for feature in features]

    assert changes == [5, -10]
    assert directions == ["increase", "decrease"]


def test_compare_with_explicit_value_column():
    layer_2050s = make_climate_artifact("2050s", [10, 20])
    layer_2060s = make_climate_artifact("2060s", [20, 40])

    result = compare_climate_periods(
        climate_artifact_a=layer_2050s,
        climate_artifact_b=layer_2060s,
        value_column="extreme_heat_days_mean",
    )

    assert_valid_comparison_artifact(result)

    assert result["summary"]["absolute_change_mean"] == pytest.approx(15.0)


def test_percent_change_handles_zero_denominator():
    layer_2050s = make_climate_artifact("2050s", [0, 20])
    layer_2060s = make_climate_artifact("2060s", [10, 30])

    result = compare_climate_periods(
        climate_artifact_a=layer_2050s,
        climate_artifact_b=layer_2060s,
    )

    assert_valid_comparison_artifact(result)

    features = result["geojson"]["features"]

    first_percent_change = features[0]["properties"]["percent_change"]
    second_percent_change = features[1]["properties"]["percent_change"]

    assert first_percent_change is None
    assert second_percent_change == pytest.approx(50.0)


def test_mismatched_cell_ids_inner_join():
    layer_2050s = make_climate_artifact("2050s", [10, 20, 30])
    layer_2060s = make_climate_artifact("2060s", [15, 25, 35])

    # Remove one matching cell from period_b.
    layer_2060s["geojson"]["features"] = layer_2060s["geojson"]["features"][:2]

    result = compare_climate_periods(
        climate_artifact_a=layer_2050s,
        climate_artifact_b=layer_2060s,
    )

    assert_valid_comparison_artifact(result)

    assert result["feature_count"] == 2
    assert result["summary"]["feature_count"] == 2


def test_missing_value_column_fails_cleanly():
    layer_2050s = make_climate_artifact("2050s", [10, 20])
    layer_2060s = make_climate_artifact("2060s", [20, 30])

    result = compare_climate_periods(
        climate_artifact_a=layer_2050s,
        climate_artifact_b=layer_2060s,
        value_column="not_a_real_column",
    )

    assert result["artifact_type"] == "climate_period_comparison_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_missing_geojson_fails_cleanly():
    layer_2050s = make_climate_artifact("2050s", [10, 20])
    layer_2060s = make_climate_artifact("2060s", [20, 30])

    del layer_2050s["geojson"]

    result = compare_climate_periods(
        climate_artifact_a=layer_2050s,
        climate_artifact_b=layer_2060s,
    )

    assert result["artifact_type"] == "climate_period_comparison_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_empty_artifact_fails_cleanly():
    layer_2050s = make_climate_artifact("2050s", [])
    layer_2060s = make_climate_artifact("2060s", [])

    result = compare_climate_periods(
        climate_artifact_a=layer_2050s,
        climate_artifact_b=layer_2060s,
    )

    assert result["artifact_type"] == "climate_period_comparison_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]


def test_invalid_geometry_format_raises_error():
    layer_2050s = make_climate_artifact("2050s", [10, 20])
    layer_2060s = make_climate_artifact("2060s", [20, 30])

    with pytest.raises(ValueError):
        compare_climate_periods(
            climate_artifact_a=layer_2050s,
            climate_artifact_b=layer_2060s,
            return_geometry_format="wkt",
        )


def test_missing_variable_when_loading_internally_fails_cleanly():
    result = compare_climate_periods(
        region_name="Fiji",
        period_a="2050s",
        period_b="2060s",
        scenario="SSP2-4.5",
    )

    assert result["artifact_type"] == "climate_period_comparison_failed"
    assert result["geojson"] is None
    assert result["warnings"]


def test_missing_registered_layer_fails_cleanly():
    result = compare_climate_periods(
        variable="definitely_not_a_real_variable",
        region_name="Fiji",
        period_a="2050s",
        period_b="2060s",
        scenario="SSP2-4.5",
    )

    assert result["artifact_type"] == "climate_period_comparison_failed"
    assert result["geojson"] is None
    assert result["feature_count"] == 0
    assert result["warnings"]