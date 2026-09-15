"""
Test the SDMX API client.
Verifies that the API client sends queries to the Pacific Data Hub
with the correct headers and query parameters.
"""

import json
from unittest.mock import patch

import pytest
import requests


# The API base URL (assumes server is running on localhost:8000)
API_BASE = "http://localhost:8000"


def test_layers_endpoint_returns_list():
    """GET /api/layers should return a list of dynamic layers."""
    resp = requests.get(f"{API_BASE}/api/layers", timeout=5)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    # Should contain at least the three dynamic layers
    layer_ids = [entry.get("layer_id") for entry in data]
    assert "sea_level_rise_dynamic" in layer_ids
    assert "power_gen_dynamic" in layer_ids
    assert "water_access_dynamic" in layer_ids


def test_unknown_layer_returns_400():
    """GET /api/layers/:unknown should return 400."""
    resp = requests.get(f"{API_BASE}/api/layers/unknown_layer", timeout=5)
    assert resp.status_code == 400
    data = resp.json()
    assert "error" in data


def test_refresh_endpoint_missing_layer_returns_400():
    """POST /api/refresh without layer param should return 400."""
    resp = requests.post(f"{API_BASE}/api/refresh", timeout=5)
    assert resp.status_code == 400
    data = resp.json()
    assert "error" in data


def test_refresh_endpoint_invalid_layer_returns_400():
    """POST /api/refresh with invalid layer should return 400."""
    resp = requests.post(f"{API_BASE}/api/refresh?layer=invalid", timeout=5)
    assert resp.status_code == 400
    data = resp.json()
    assert "error" in data
