from pathlib import Path
import sys

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.geospatial import resolve_region


PICT_COUNTRIES_AND_TERRITORIES = [
    "American Samoa",
    "Cook Islands",
    "Federated States of Micronesia",
    "Fiji",
    "French Polynesia",
    "Guam",
    "Kiribati",
    "Marshall Islands",
    "Nauru",
    "New Caledonia",
    "Niue",
    "Northern Mariana Islands",
    "Palau",
    "Papua New Guinea",
    "Pitcairn Islands",
    "Samoa",
    "Solomon Islands",
    "Tokelau",
    "Tonga",
    "Tuvalu",
    "Vanuatu",
    "Wallis and Futuna",
]


def assert_valid_region_artifact(result):
    assert result["artifact_type"] == "region"
    assert result["resolved_name"] is not None
    assert result["geometry"] is not None
    assert result["bbox"] is not None
    assert result["crs"] == "EPSG:4326"
    assert isinstance(result["warnings"], list)
    assert isinstance(result["suggestions"], list)
    assert isinstance(result["provenance"], dict)

    assert "type" in result["geometry"]
    assert "coordinates" in result["geometry"]

    bbox = result["bbox"]
    assert len(bbox) == 4
    assert all(isinstance(x, float) for x in bbox)


def test_resolve_fiji():
    result = resolve_region("Fiji")

    assert_valid_region_artifact(result)
    assert result["resolved_name"] == "Fiji"
    assert result["admin_level"] == "country_or_territory"


def test_resolve_png_alias():
    result = resolve_region("PNG")

    assert_valid_region_artifact(result)
    assert result["resolved_name"] == "Papua New Guinea"
    assert result["provenance"]["alias_used"] == "Papua New Guinea"


def test_resolve_solomons_alias():
    result = resolve_region("the solomons")

    assert_valid_region_artifact(result)
    assert result["resolved_name"] == "Solomon Islands"
    assert result["provenance"]["alias_used"] == "Solomon Islands"


def test_resolve_picts_alias():
    result = resolve_region("picts")

    assert_valid_region_artifact(result)
    assert result["resolved_name"] == "Pacific Island Countries and Territories"
    assert result["admin_level"] == "region_group"


def test_resolve_subregion_melanesia():
    result = resolve_region("Melanesia")

    assert_valid_region_artifact(result)
    assert result["resolved_name"] == "Melanesia"
    assert result["admin_level"] == "subregion"


def test_admin_level_filter_success():
    result = resolve_region("Fiji", admin_level="country_or_territory")

    assert_valid_region_artifact(result)
    assert result["resolved_name"] == "Fiji"
    assert result["admin_level"] == "country_or_territory"


def test_admin_level_filter_failure():
    result = resolve_region("Fiji", admin_level="city")

    assert result["artifact_type"] == "region_resolution_failed"
    assert result["resolved_name"] is None
    assert result["geometry"] is None
    assert result["bbox"] is None
    assert result["warnings"]


def test_unknown_region_fails_cleanly():
    result = resolve_region("Definitely Not A Real Region")

    assert result["artifact_type"] == "region_resolution_failed"
    assert result["resolved_name"] is None
    assert result["geometry"] is None
    assert result["bbox"] is None
    assert result["warnings"]


@pytest.mark.parametrize("region_name", PICT_COUNTRIES_AND_TERRITORIES)
def test_all_pict_countries_and_territories_resolve(region_name):
    result = resolve_region(region_name)

    assert_valid_region_artifact(result)
    assert result["resolved_name"] == region_name
    assert result["admin_level"] == "country_or_territory"


@pytest.mark.parametrize(
    "subregion",
    ["Melanesia", "Micronesia", "Polynesia"],
)
def test_all_pict_subregions_resolve(subregion):
    result = resolve_region(subregion)

    assert_valid_region_artifact(result)
    assert result["resolved_name"] == subregion
    assert result["admin_level"] == "subregion"


def test_invalid_geometry_format_raises_error():
    with pytest.raises(ValueError):
        resolve_region("Fiji", return_geometry_format="wkt")


def test_empty_region_name_raises_error():
    with pytest.raises(ValueError):
        resolve_region("")