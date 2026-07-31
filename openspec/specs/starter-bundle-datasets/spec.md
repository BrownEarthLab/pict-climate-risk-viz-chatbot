# Purpose
TBD - Integrates the three new dynamic indicators (Sea Level Rise, Power Generation, and Drinking Water Access) from the Pacific Data Hub SDMX REST API into the Climate Risk chatbot and Mapbox visualization panel.

# Requirements

## SDMX REST API Client Fetching
The system SHALL dynamically fetch dataset indicators from the Pacific Data Hub SDMX REST API using the following request queries:
- **Sea Level Anomalies**: Flow `SPC,DF_CLIMATE_CHANGE,1.0` and Key `A.SEA_LVL.`
- **Power Generation**: Flow `SPC,DF_POWER_GEN,1.0` and Key `A...`
- **Safely Managed Water**: Flow `SPC,DF_SDG_06,3.0` and Key `A.SH_H2O_SAFE...._T.....`

Requests MUST include the following headers and query parameters:
- Header: `Accept: application/vnd.sdmx.data+json;version=2.1`
- Query Param: `dimensionAtObservation=AllDimensions`
- Query Param: `detail=dataonly`

### Scenario: Successful API query
- **WHEN** the backend queries the SDMX API for any of the three indicators
- **THEN** the API returns a status 200 with the flat SDMX-JSON observation list

## Cache-Aside Layer
The system SHALL cache SDMX-JSON payloads to disk under `data/cache/sdmx/<url-safe-cache-key>.json` and maintain the latest payload in memory.
- The cache key MUST consist of `flow` and `key` dimensions.
- The TTL (Time To Live) SHALL be 24 hours.
- The cache MUST refresh on TTL expiry, admin trigger `POST /api/refresh?layer=...`, or on-disk fallback when the API fails or times out (≥10s).

### Scenario: Cache hit within TTL
- **WHEN** a request is made for a cached layer within 24 hours of its last retrieval
- **THEN** the system serves the data from memory or disk without calling the external API

## Atoll-Aware H3 Grid Processing
The system SHALL bin country geometries into Uber H3 cells.
- It MUST use **Resolution 4** by default.
- It MUST fall back to **Resolution 5** for atolls and small islands (including Tuvalu, Nauru, Kiribati) whose bounding box is smaller than one Resolution 4 cell.

### Scenario: Grid generation on small atoll
- **WHEN** generating H3 grids for Tuvalu
- **THEN** the system falls back to Resolution 5 cells to prevent the island from being dropped

## Geospatial Attribute Joining
The system SHALL join the `GEO_PICT` ISO country code dimension from the API observations with the `iso_3166_2` property of the geometries in `data/reference/pict_regions.geojson`.
- If matching atoll-specific datasets, the system MUST normalize region names using `data/reference/region_aliases.json`.

### Scenario: Joining Fiji data
- **WHEN** joining an observation where `GEO_PICT` is `FJ`
- **THEN** the system merges the indicator value into the properties of the Fiji geometry in the output GeoJSON

## Error-Handling Contract
The system SHALL return a standardized JSON error payload and status code when the API is unreachable and no cache exists:
- Payload: `{ "layer": "<layer_name>", "status": "unavailable", "data": null, "error": "<reason>" }`
- Status Code: HTTP `503` if uncached and unreachable; HTTP `200` with stale payload if cached.

### Scenario: Uncached API failure
- **WHEN** the Pacific Data Hub API is offline and no on-disk cache exists
- **THEN** the server returns HTTP `503` and the status `unavailable` payload
