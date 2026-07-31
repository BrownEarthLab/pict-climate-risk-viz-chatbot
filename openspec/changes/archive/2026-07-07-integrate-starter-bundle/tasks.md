## 1. Backend SDMX REST API Client

- [x] 1.1 Create the API fetch service that constructs queries using composite flow IDs and keys:
  - Sea Level Anomalies: `SPC,DF_CLIMATE_CHANGE,1.0` with key `A.SEA_LVL.`
  - Power Generation: `SPC,DF_POWER_GEN,1.0` with key `A...`
  - Safely Managed Water: `SPC,DF_SDG_06,3.0` with key `A.SH_H2O_SAFE...._T.....`
- [x] 1.2 Configure HTTP requests with the required headers (`Accept: application/vnd.sdmx.data+json;version=2.1`) and parameters (`dimensionAtObservation=AllDimensions`, `detail=dataonly`).
- [x] 1.3 Implement the error-handling contract returning a `503` status and `{ "layer", "status": "unavailable", "data": null, "error" }` when the API is down/times out (>10s) and there is no cache on disk.

## 2. Cache-Aside Implementation

- [x] 2.1 Develop the cache-aside manager storing JSON payloads to disk under `data/cache/sdmx/` and in memory.
- [x] 2.2 Define cache keys as `flow` + `key` and enforce the 24-hour expiration (TTL).
- [x] 2.3 Create the admin endpoint `POST /api/refresh?layer=...` to trigger manual cache refreshes.
- [x] 2.4 Set up the fallback mechanism to serve stale payloads with HTTP `200` if the API call fails but a cached file exists.

## 3. Boundary Joining & H3 Binning

- [x] 3.1 Write a coordinator to map `GEO_PICT` ISO country codes to geometry shapes inside `data/reference/pict_regions.geojson` using `iso_3166_2`.
- [x] 3.2 Implement atoll and island name normalization via `data/reference/region_aliases.json` for atoll-specific datasets.
- [x] 3.3 Build the H3 binning pipeline using H3 Resolution 4 by default and falling back to Resolution 5 for Tuvalu, Nauru, and Kiribati atolls whose bounding box is smaller than a single Resolution 4 cell.

## 4. Layer Registry & Chatbot Integration

- [x] 4.1 Update `data/layers/climate_layer_registry.json` to register the new Sea Level Rise dynamic hazard layer.
- [x] 4.2 Expose backend endpoint routes that serve the processed dynamic layers to the frontend.
- [x] 4.3 Update the chatbot's system prompt instructions to handle `status: "unavailable"` and warn users when a layer is offline, disabling quantitative claims.

## 5. Mapbox UI & Starter Prompts

- [x] 5.1 Update Mapbox layer config in the frontend to load and render Sea Level Rise (H3 Resolution 4/5), Power Assets (points), and Water Access (choropleth).
- [x] 5.2 Add map legend controls and hover tooltips for each of the three new layers.
- [x] 5.3 Edit `MainChat.jsx` to display starter prompts prompting users to ask about these new datasets.

## 6. Testing & Validation

- [x] 6.1 Implement `pytest` unit tests in `backend/tests/` to verify the API client, caching layer, Resolution 4/5 fallback, and error-handling contract.
- [x] 6.2 Write Playwright tests in `frontend/e2e/` to verify layers render correctly and chatbot queries pull from backend API.
- [x] 6.3 Manually verify cache-aside functionality, network failure scenarios, and visual correctness on the map.
