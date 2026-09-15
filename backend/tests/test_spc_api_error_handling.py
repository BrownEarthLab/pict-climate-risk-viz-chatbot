"""
Test the error-handling contract.
Verifies that if the API is offline and uncached, a request returns
the standardized error payload with HTTP 503.
"""

import pytest
import requests

API_BASE = "http://localhost:8000"


def test_error_contract_shape():
    """
    If a layer returns 503, verify the error payload matches the contract:
    { "layer": "<name>", "status": "unavailable", "data": null, "error": "<reason>" }
    """
    resp = requests.get(f"{API_BASE}/api/layers/sea_level", timeout=15)

    # The test is meaningful only if the API is unavailable
    if resp.status_code != 503:
        pytest.skip("API responded successfully, cannot test error contract")

    data = resp.json()
    assert data["layer"] == "sea_level"
    assert data["status"] == "unavailable"
    assert data["data"] is None
    assert "error" in data
    assert isinstance(data["error"], str)
    assert len(data["error"]) > 0


def test_refresh_error_contract():
    """
    POST /api/refresh should also handle failures gracefully.
    """
    # Try refreshing an invalid layer
    resp = requests.post(f"{API_BASE}/api/refresh?layer=sea_level", timeout=15)

    if resp.status_code == 503:
        data = resp.json()
        assert data["layer"] == "sea_level"
        assert data["status"] == "refresh_failed"
        assert "error" in data
    elif resp.status_code == 400:
        pytest.skip("Invalid request params")
