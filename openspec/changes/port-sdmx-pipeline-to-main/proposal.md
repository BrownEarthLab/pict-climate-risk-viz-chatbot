## Why

The `feature/integrate-starter-bundle` branch diverged from `main` while my co-developer was rewriting the backend and frontend around PICT admin boundaries and heat-risk workflows. `origin/main` (6e0eb81) is now the source of truth. The feature branch carried an SDMX-to-Mapbox pipeline that fetches three Pacific Data Hub indicator datasets (sea level rise, power generation, safely managed water access), joins them to PICT region geometries, bins the sea level layer into H3 hexagons, and renders all three as live map layers with hover tooltips and legends.

That pipeline is the highest-value artifact on the feature branch — it's wired end-to-end and produces real polygons on the map. Its chat counterpart (mock responses, "Dev Preset" workflow demo) is mock debt tracked by gh issue #3 and is explicitly out of scope here. The workflow viewer demo belongs to the `visual-workflow-programmer` openspec change and is also out of scope.

This change re-integrates the SDMX pipeline onto the current `main`, using the feature branch's JS-services architecture, with pytest unit tests added to match main's testing conventions.

## What Changes

### Backend

- Port 4 service modules verbatim from `feature/integrate-starter-bundle`:
  - `backend/services/sdmxApiClient.js` — `node:https` SDMX REST client for Pacific Data Hub
  - `backend/services/cacheManager.js` — disk + memory cache-aside, 24h TTL, stale-on-error fallback
  - `backend/services/coordinator.js` — GEO_PICT alpha-2 → ISO3 → region geometry join
  - `backend/services/h3Binner.js` — H3 binning, res 4 default / res 5 atoll fallback
- Add 4 endpoints to main's `backend/server.js` via surgical injection (no other changes to `server.js`; broader refactor tracked by gh issue #2):
  - `GET  /api/layers` — list registered dynamic layers
  - `GET  /api/layers/:layer` — serve GeoJSON for `sea_level` / `power_gen` / `water_access`
  - `POST /api/refresh` — admin cache-bust
  - `GET  /api/chatbot-context` — layer availability report
- Add 2 helper functions to `server.js` (interim home; issue #2 will extract):
  - `parseSdmxObservations(sdmxData, layerName)` — SDMX-JSON → observation list (with sea_level 10-year-average derivation)
  - `handleLayerRequest(layerName, res)` — fetch/cache/parse/join/bin pipeline
- Register 3 dynamic layer entries in `data/layers/climate_layer_registry.json`:
  - `sea_level_rise_dynamic` (H3 hex feature type, res 4 / 5 fallback)
  - `power_gen_dynamic` (choropleth, latest-year sum across sub-dimensions)
  - `water_access_dynamic` (choropleth, latest-year percentage)

### Frontend

- Replace `frontend/src/hooks/useMapbox.ts` with the feature branch version (adds 3 dynamic Mapbox sources + layers, fetch-on-load via `Promise.all`, visibility-toggle tied to `activeLayer`).
- Surgically add the "Dynamic Datasets" layer panel section to main's `frontend/src/components/map/MapCanvas.tsx`:
  - 3 layer toggle buttons (Sea Level Rise / Power Gen / Water Access)
  - 3 conditional legend gradient blocks
  - Hover tooltip `mousemove` handler querying the 3 dynamic layer IDs
  - `workflow-complete` flyTo event listener (preserved for forward-compat with the `visual-workflow-programmer` change)
- Apply additive config changes:
  - `frontend/src/config/api.ts` — `API_BASE_URL` hostname-aware
  - `frontend/vite.config.js` — `server.host: '0.0.0.0'`

### Tests

- Add `backend/tests/test_parse_sdmx_observations.py` — pure-function unit tests of `parseSdmxObservations` using mock SDMX-JSON payloads as fixtures. Follows main's `backend/tests/*.py` pytest pattern. Coverage:
  - Power gen sums across `ENERGY_SOURCE × GRID_CONN` sub-dimensions
  - Water access returns latest-year percentage per GEO_PICT region
  - Sea level averages last 10 years per region
  - Missing `GEO_PICT` / `TIME_PERIOD` dimensions return empty list
  - Empty `observations` returns empty list, no throw
- Port 4 HTTP integration test files verbatim:
  - `backend/tests/test_spc_api_client.py`
  - `backend/tests/test_spc_caching.py`
  - `backend/tests/test_spc_api_error_handling.py`
  - `backend/tests/test_h3_resolution_fallback.py`
- Port Playwright e2e: `frontend/e2e/test_dynamic_map_layers.spec.ts`

## Capabilities

### New Capabilities
- `pacific-data-hub-indicators`: Live fetch of indicator series from the Pacific Data Hub SDMX REST API (sea level rise, power generation, safely managed water access), joined to PICT region geometries and rendered as Mapbox layers.

### Modified Capabilities
- `spatial-map-viz`: Adds 3 dynamic layer sources to the map panel and a new "Dynamic Datasets" toggle group (existing static layers and heat-risk UI preserved).

## Impact

- **Backend `server.js`**: surgical addition of 4 endpoints and 2 helper functions. No existing endpoint is modified. The god-file debt this adds is acknowledged in gh issue #2; this change does not attempt the refactor.
- **Backend tests**: +1 new pytest unit file (mock SDMX-JSON fixtures), +4 ported HTTP integration test files. Both follow main's existing pytest convention. New test cost: ~2-3s wall clock for the unit file; integration files require a spawned server.
- **Frontend `MapCanvas.tsx`**: surgical insertion of a new layer panel section and tooltip handlers. ~150 lines added; main's admin/heat-risk UI is preserved untouched.
- **Frontend `useMapbox.ts`**: full file replacement. Main's version of this file is identical to merge-base, so the replacement loses nothing of main's work.
- **Frontend types**: `ClimateLayer` type widens to include `sea_level` / `power_gen` / `water_access`. Main's `MapLayer` (in `MapCanvas.tsx`) is independent; we'll add the same values there so the two type systems stay coherent.
- **Data**: 3 layer entries appended to `climate_layer_registry.json` (existing static layer entries untouched).

## Non-Goals

- Chatbot mock response stripping and live integration (gh issue #3).
- Visual workflow programmer UI (the `visual-workflow-programmer` openspec change owns this).
- `server.js` god-file refactor (gh issue #2).
- Any new endpoints beyond the 4 SDMX endpoints.
- Any changes to main's existing endpoints.
- TypeScript migration of the SDMX services (they stay in JS to match their existing form; a future JS→TS pass after issue #2 can revisit).
- NetCDF re-processing or any change to `data/climate/raw/`.

## References

- Source branch: `feature/integrate-starter-bundle` tip `a94d41d`
- Archived openspec change describing the original intent: `openspec/changes/archive/2026-07-07-integrate-starter-bundle/`
- gh issue #2: server.js compartmentalization
- gh issue #3: strip mock chatbot responses