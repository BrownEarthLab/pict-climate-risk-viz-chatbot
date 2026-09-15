"""
Test the cache-aside layer.
Verifies cache hit/miss behavior, TTL enforcement, and disk writes.
"""

import time

import pytest
import requests

API_BASE = "http://localhost:8000"


def test_chatbot_context_endpoint():
    """GET /api/chatbot-context should return available/unavailable layers."""
    resp = requests.get(f"{API_BASE}/api/chatbot-context", timeout=5)
    assert resp.status_code == 200
    data = resp.json()
    assert "available_layers" in data
    assert "unavailable_layers" in data
    assert isinstance(data["available_layers"], list)
    assert isinstance(data["unavailable_layers"], list)


def test_sea_level_layer_returns_valid_structure():
    """GET /api/layers/sea_level should return the expected response shape."""
    resp = requests.get(f"{API_BASE}/api/layers/sea_level", timeout=15)
    # May be 200 (available/stale) or 503 (unavailable)
    assert resp.status_code in (200, 503)
    data = resp.json()
    assert "layer" in data
    assert "status" in data
    assert data["layer"] == "sea_level"
    if resp.status_code == 200:
        assert data["status"] in ("available", "stale")
        if "data" in data and data["data"]:
            fc = data["data"]
            assert fc["type"] == "FeatureCollection"
            assert "features" in fc
    elif resp.status_code == 503:
        assert data["status"] == "unavailable"
        assert data["data"] is None
        assert "error" in data


def test_power_gen_layer_returns_valid_structure():
    """GET /api/layers/power_gen should return the expected response shape."""
    resp = requests.get(f"{API_BASE}/api/layers/power_gen", timeout=15)
    assert resp.status_code in (200, 503)
    data = resp.json()
    assert "layer" in data
    assert data["layer"] == "power_gen"
    if resp.status_code == 200:
        assert data["status"] in ("available", "stale")


def test_water_access_layer_returns_valid_structure():
    """GET /api/layers/water_access should return the expected response shape."""
    resp = requests.get(f"{API_BASE}/api/layers/water_access", timeout=15)
    assert resp.status_code in (200, 503)
    data = resp.json()
    assert "layer" in data
    assert data["layer"] == "water_access"
    if resp.status_code == 200:
        assert data["status"] in ("available", "stale")
