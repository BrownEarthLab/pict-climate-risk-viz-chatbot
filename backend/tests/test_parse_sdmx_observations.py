"""
Unit tests for parseSdmxObservations (JS function -> Python adapter).

Tests the SDMX-JSON -> observation list derivation that lives temporarily
inside backend/services/sdmxPipeline.js (later to be extracted from server.js).

Uses inline mock SDMX-JSON payloads as Python dicts, matching the inline-fixture
convention of main's existing backend/tests/test_*.py modules.
"""

from pathlib import Path
import sys

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# This import will fail until backend/tests/helpers/sdmx_parser_adapter.py
# and backend/services/sdmxPipeline.js are both created (Sections 3-4).
from tests.helpers.sdmx_parser_adapter import parse_sdmx_observations  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures — inline mock SDMX-JSON payloads
# ---------------------------------------------------------------------------

def _sdmx_structure(obs_dim_ids, values_by_dim=None):
    """
    Build a minimal SDMX-JSON structure block with the given observation dimension ids
    and optionally populated dimension value arrays.
    """
    if values_by_dim is None:
        values_by_dim = {}
    return {
        "dimensions": {
            "observation": [
                {
                    "id": dim_id,
                    "values": values_by_dim.get(dim_id, []),
                }
                for dim_id in obs_dim_ids
            ]
        }
    }


def _make_sea_level_payload():
    """
    Mock SDMX-JSON for sea_level with FJ observations across 2010-2023.
    Dimensions: [GEO_PICT, TIME_PERIOD]
    Observation keys: "geoIdx:timeIdx"
    """
    geo_values = [{"id": "FJ"}]
    time_values = [{"id": str(y)} for y in range(2010, 2024)]

    # Observations: geoIdx:timeIdx -> [value]
    observations = {}
    for ti, tv in enumerate(time_values):
        year = int(tv["id"])
        # Arbitrary sea-level anomaly values that slowly increase
        val = 0.1 + (year - 2010) * 0.03
        observations[f"0:{ti}"] = [val]

    return {
        "data": {
            "dataSets": [{"observations": observations}],
            "structure": _sdmx_structure(
                ["GEO_PICT", "TIME_PERIOD"],
                {"GEO_PICT": geo_values, "TIME_PERIOD": time_values},
            ),
        }
    }


def _make_power_gen_payload():
    """
    Mock SDMX-JSON for power_gen with FJ observations for 2022 and 2023
    across ENERGY_SOURCE x GRID_CONN sub-dimensions.
    Dimensions: [GEO_PICT, TIME_PERIOD, ENERGY_SOURCE, GRID_CONN]
    """
    geo_values = [{"id": "FJ"}]
    time_values = [{"id": "2022"}, {"id": "2023"}]
    src_values = [{"id": "HYDRO"}, {"id": "THERMAL"}, {"id": "SOLAR"}]
    grid_values = [{"id": "ON_GRID"}, {"id": "OFF_GRID"}]

    observations = {}
    for ti in range(2):  # 2022, 2023
        for si in range(3):  # HYDRO, THERMAL, SOLAR
            for gi in range(2):  # ON_GRID, OFF_GRID
                # Key format: "geo:time:source:grid"
                key = f"0:{ti}:{si}:{gi}"
                # Arbitrary values in GWh
                val = 100.0 + (ti * 50) + (si * 20) + (gi * 10)
                observations[key] = [val]

    return {
        "data": {
            "dataSets": [{"observations": observations}],
            "structure": _sdmx_structure(
                ["GEO_PICT", "TIME_PERIOD", "ENERGY_SOURCE", "GRID_CONN"],
                {
                    "GEO_PICT": geo_values,
                    "TIME_PERIOD": time_values,
                    "ENERGY_SOURCE": src_values,
                    "GRID_CONN": grid_values,
                },
            ),
        }
    }


def _make_water_access_payload():
    """
    Mock SDMX-JSON for water_access with FJ observations for three descending years.
    Dimensions: [GEO_PICT, TIME_PERIOD]
    """
    geo_values = [{"id": "FJ"}]
    time_values = [{"id": "2023"}, {"id": "2022"}, {"id": "2021"}]

    observations = {
        "0:0": [72.5],  # 2023
        "0:1": [68.3],  # 2022
        "0:2": [65.1],  # 2021
    }

    return {
        "data": {
            "dataSets": [{"observations": observations}],
            "structure": _sdmx_structure(
                ["GEO_PICT", "TIME_PERIOD"],
                {"GEO_PICT": geo_values, "TIME_PERIOD": time_values},
            ),
        }
    }


def _make_payload_missing_dimension(missing_dim):
    """Create a payload that lacks the given dimension id."""
    geo_values = [{"id": "FJ"}]
    time_values = [{"id": "2023"}]

    dims = ["GEO_PICT", "TIME_PERIOD"]
    vals = {"GEO_PICT": geo_values, "TIME_PERIOD": time_values}
    if missing_dim in dims:
        dims.remove(missing_dim)
        del vals[missing_dim]

    return {
        "data": {
            "dataSets": [{"observations": {"0:0": [1.0]}}],
            "structure": _sdmx_structure(dims, vals),
        }
    }


def _make_empty_observations_payload():
    """Create a payload with an empty observations dict."""
    geo_values = [{"id": "FJ"}]
    time_values = [{"id": "2023"}]
    return {
        "data": {
            "dataSets": [{"observations": {}}],
            "structure": _sdmx_structure(
                ["GEO_PICT", "TIME_PERIOD"],
                {"GEO_PICT": geo_values, "TIME_PERIOD": time_values},
            ),
        }
    }


def _make_null_nan_payload():
    """
    Payload where one observation is null and another is effectively null (simulated NaN).
    Dimensions: [GEO_PICT, TIME_PERIOD]
    Note: NaN is not representable in JSON, so we use null for both cases.
    The JS function skips both null and NaN observation values.
    """
    geo_values = [{"id": "FJ"}]
    time_values = [{"id": "2023"}, {"id": "2022"}, {"id": "2021"}]

    observations = {
        "0:0": [42.0],   # valid
        "0:1": [None],   # null — should be skipped
        "0:2": [None],   # effectively NaN/null — should be skipped
    }

    return {
        "data": {
            "dataSets": [{"observations": observations}],
            "structure": _sdmx_structure(
                ["GEO_PICT", "TIME_PERIOD"],
                {"GEO_PICT": geo_values, "TIME_PERIOD": time_values},
            ),
        }
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestParseSdmxObservations:
    """Pure-function tests of parseSdmxObservations (via Python -> Node adapter)."""

    def test_sea_level_averages_last_10_years(self):
        """
        sea_level: averages the most recent 10 years of observations per region.

        Payload has FJ values for 2010-2023. Expected: value = mean(2014..2023),
        year = "2014-2023".
        """
        payload = _make_sea_level_payload()
        result = parse_sdmx_observations(payload, "sea_level")

        assert isinstance(result, list)
        assert len(result) > 0

        fj_entry = next((e for e in result if e.get("geoPictCode") == "FJ"), None)
        assert fj_entry is not None, "Expected an entry for FJ"

        # Compute expected: mean of values for 2014..2023
        expected_values = [0.1 + (y - 2010) * 0.03 for y in range(2014, 2024)]
        expected_mean = round(sum(expected_values) / len(expected_values), 4)

        assert fj_entry["value"] == expected_mean, (
            f"Expected mean {expected_mean}, got {fj_entry['value']}"
        )
        assert fj_entry["year"] == "2014-2023", (
            f"Expected year range '2014-2023', got '{fj_entry['year']}'"
        )

    def test_power_gen_sums_across_sub_dims_latest_year(self):
        """
        power_gen: sums observations across all sub-dimensions per region/year,
        keeps only the latest year per region.
        """
        payload = _make_power_gen_payload()
        result = parse_sdmx_observations(payload, "power_gen")

        assert isinstance(result, list)
        assert len(result) > 0

        fj_entry = next((e for e in result if e.get("geoPictCode") == "FJ"), None)
        assert fj_entry is not None, "Expected an entry for FJ"

        # Expected sum for 2023 (ti=1): all ENERGY_SOURCE (3) x GRID_CONN (2) values
        # Each value = 100 + 50*ti + 20*si + 10*gi
        # For ti=1 (2023): sum over si={0,1,2}, gi={0,1}
        expected_sum = sum(
            100.0 + 50 * 1 + 20 * si + 10 * gi
            for si in range(3)
            for gi in range(2)
        )
        assert fj_entry["value"] == expected_sum, (
            f"Expected sum {expected_sum}, got {fj_entry['value']}"
        )
        assert fj_entry["year"] == "2023", (
            f"Expected year '2023', got '{fj_entry['year']}'"
        )

    def test_water_access_returns_latest_year_percentage(self):
        """
        water_access: returns the latest-year percentage value per region.
        """
        payload = _make_water_access_payload()
        result = parse_sdmx_observations(payload, "water_access")

        assert isinstance(result, list)
        assert len(result) > 0

        fj_entry = next((e for e in result if e.get("geoPictCode") == "FJ"), None)
        assert fj_entry is not None, "Expected an entry for FJ"

        # Latest year is 2023, value is 72.5
        assert fj_entry["value"] == 72.5, (
            f"Expected value 72.5, got {fj_entry['value']}"
        )
        assert fj_entry["year"] == "2023", (
            f"Expected year '2023', got '{fj_entry['year']}'"
        )

    def test_missing_geo_pict_dim_returns_empty_list(self):
        """
        When the payload's structure.dimensions.observation lacks a
        dimension with id="GEO_PICT", the function returns [] without throwing.
        """
        payload = _make_payload_missing_dimension("GEO_PICT")
        result = parse_sdmx_observations(payload, "sea_level")

        assert result == [], f"Expected empty list, got {result}"

    def test_missing_time_period_dim_returns_empty_list(self):
        """
        When the payload's structure.dimensions.observation lacks a
        dimension with id="TIME_PERIOD", the function returns [] without throwing.
        """
        payload = _make_payload_missing_dimension("TIME_PERIOD")
        result = parse_sdmx_observations(payload, "sea_level")

        assert result == [], f"Expected empty list, got {result}"

    def test_empty_observations_returns_empty_list(self):
        """
        When data.dataSets[0].observations is {}, the function returns []
        without throwing.
        """
        payload = _make_empty_observations_payload()
        result = parse_sdmx_observations(payload, "sea_level")

        assert result == [], f"Expected empty list, got {result}"

    def test_null_nan_values_are_skipped(self):
        """
        Observations with null/NaN values are skipped; only valid numeric
        observations appear in the result.
        """
        payload = _make_null_nan_payload()
        result = parse_sdmx_observations(payload, "sea_level")

        assert isinstance(result, list)
        # Only the valid observation (42.0) should be included
        assert len(result) == 1, f"Expected 1 entry, got {len(result)}: {result}"
        assert result[0]["value"] == 42.0, (
            f"Expected value 42.0, got {result[0]['value']}"
        )
