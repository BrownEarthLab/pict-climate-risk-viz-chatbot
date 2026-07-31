## Automated Tests

- `pytest backend/tests/test_spc_api_client.py`: Verifies that the API client sends queries to `https://stats-nsi-stable.pacificdata.org/rest/data/{flow}/{key}/SPC` with headers (`Accept: application/vnd.sdmx.data+json;version=2.1`) and query parameters (`dimensionAtObservation=AllDimensions`, `detail=dataonly`). It checks correct parsing of the resulting flat SDMX-JSON.
- `pytest backend/tests/test_spc_caching.py`: Verifies cache hit/miss behavior under key `flow` + `key`, TTL of 24 hours, disk writes to `data/cache/sdmx/<url-safe-cache-key>.json`, memory cache lookups, and triggering cache refresh via `POST /api/refresh`.
- `pytest backend/tests/test_h3_resolution_fallback.py`: Verifies that Uber H3 Resolution 4 is generated for standard regions, and Resolution 5 is generated as a fallback for small atolls (such as Tuvalu, Nauru, Kiribati) whose bounding box fits inside a single Res 4 cell, confirming no islands are dropped.
- `pytest backend/tests/test_spc_api_error_handling.py`: Verifies that if the API is offline and uncached, a request triggers a timeout (≥10s) or 503 response returning the contract: `{ "layer": "<name>", "status": "unavailable", "data": null, "error": "<reason>" }`.
- `npx playwright test e2e/test_dynamic_map_layers.spec.ts`: Verifies that the frontend requests dynamic layers, renders choropleths for Water Access, point icons for Power Generation, and H3 tiles for Sea Level rise.

## Manual Verification

- **Visual Hexagonal Grid at Resolution 4 & 5**:
  - **WHEN** the user enables the "Sea Level Rise" H3 layer on Mapbox
  - **THEN** the map displays H3 Resolution 4 hexagons for Fiji, and falls back to Resolution 5 hexagons for Tuvalu, Nauru, and Kiribati atolls.
- **Power Generation Point Layer**:
  - **WHEN** the user displays the "Power Generation" layer
  - **THEN** point assets are rendered correctly aligned with their country/island boundaries.
- **Water Access Vulnerability Choropleths**:
  - **WHEN** the user displays the "Drinking Water Access" layer
  - **THEN** the atoll polygons are styled with choropleth colors corresponding to safely managed water percentages, and regions without data are shaded grey.
- **Chatbot Quantitative Reasoning Fallback**:
  - **WHEN** the user queries the chatbot for Sea Level anomalies, and the backend returns `status: "unavailable"` due to API failure and no cache
  - **THEN** the chatbot conversation bubble warns the user that live climate data is offline, avoiding any quantitative claims about that layer.
- **Admin Cache Refresh**:
  - **WHEN** the developer triggers a `POST /api/refresh?layer=sea_level`
  - **THEN** the cache-aside layer forces an API call to PDH, updates the local disk JSON cache, and returns HTTP 200.
