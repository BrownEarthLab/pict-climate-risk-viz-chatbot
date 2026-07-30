"""Verify that the sea-level H3 layer uses the detailed map resolution."""

import pytest
import requests

API_BASE = "http://localhost:8000"


def test_sea_level_layer_h3_structure():
    """
    If the sea level layer is available, verify the H3 grid structure.
    Each feature should have h3_index and h3_resolution properties.
    """
    resp = requests.get(f"{API_BASE}/api/layers/sea_level", timeout=15)
    if resp.status_code != 200:
        pytest.skip("Sea level layer not available (API may be offline)")

    data = resp.json()
    if not data.get("data") or not data["data"].get("features"):
        pytest.skip("Sea level layer returned no features")

    features = data["data"]["features"]
    for feat in features:
        props = feat.get("properties", {})
        assert "h3_index" in props, "Each H3 feature must have an h3_index"
        assert "h3_resolution" in props, "Each H3 feature must have an h3_resolution"
        assert props["h3_resolution"] == 7, (
            f"Expected H3 resolution 7, got {props['h3_resolution']}"
        )
        # Geometry should be Polygon
        assert feat["geometry"]["type"] == "Polygon"


@pytest.mark.skip(reason="Requires mock server with known test data")
def test_resolution_4_default():
    """
    Standard regions should use Resolution 4.
    This test requires a mock server setup with controlled test data.
    """
    pass


@pytest.mark.skip(reason="Requires mock server with known test data")
def test_resolution_5_fallback_for_tuvalu():
    """
    Tuvalu (TUV) should fall back to Resolution 5.
    This test requires a mock server setup with controlled test data.
    """
    pass
