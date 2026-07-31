## Automated Tests

### New pytest unit file — `backend/tests/test_parse_sdmx_observations.py`

Pure-function tests of `parseSdmxObservations` (the SDMX-JSON → observation-list derivation that lives temporarily inside `backend/server.js`). Tests use inline mock SDMX-JSON payloads as Python dicts (matching the inline-fixture convention of main's existing `backend/tests/test_*.py`).

Command: `pytest backend/tests/test_parse_sdmx_observations.py -v`

Acceptance criteria verified:
- **sea_level averages last 10 years per region** — constructs a mock SDMX-JSON payload with FJ values for years 2010–2023 in `data.dataSets[0].observations`; asserts the returned entry for `"FJ"` has `value == mean(values[2014..2023])` rounded to 4 decimals and `year == "2014-2023"`.
- **power_gen sums across sub-dimensions, keeps latest year** — constructs a payload with FJ observations for years 2022 and 2023 across `ENERGY_SOURCE × GRID_CONN` dimensions; asserts the returned entry for `"FJ"` has `value == sum(2023 sub-dimensions)` and `year == "2023"`.
- **water_access returns latest-year percentage per region** — constructs a payload with FJ observations for three years (descending order); asserts the returned entry has `value` equal to the latest year's percentage and `year` equal to the latest year string.
- **missing GEO_PICT dimension returns empty list** — constructs a payload whose `structure.dimensions.observation` lacks `id === "GEO_PICT"`; asserts the function returns `[]` without throwing.
- **missing TIME_PERIOD dimension returns empty list** — same as above but for `TIME_PERIOD`.
- **empty observations returns empty list** — constructs a payload whose `data.dataSets[0].observations` is `{}`; asserts `[]` without throwing.
- **null/NaN observation values are skipped** — constructs a payload where one observation's value is `null` and another's is `NaN`; asserts the function skips those entries and includes only the valid numeric observations in the result.

Access pattern note: tests import `parseSdmxObservations` either by importing the function directly (if architecture decision #2 stays as "lives in `server.js`" we'll need a small Python-callable adapter — e.g., a `backend/services/sdmxPipeline.js` re-export — OR the function is invoked by spinning up the server and round-tripping through the `/api/layers/:layer` endpoint with a mock SDMX server. **Preferred: extract `parseSdmxObservations` into `backend/services/sdmxPipeline.js` (re-exported by `server.js`) so the unit test can import it directly. This keeps the god-file-debt-refactor (gh issue #2) as the larger extraction and lets this change introduce the function under test in its natural module.** If the test-to-function isolation cost is too high, fall back to HTTP-level integration (next suite).

### Ported pytest integration tests (4 files, verbatim)

These tests run against a spawned Express server (`API_BASE = "http://localhost:8000"`). They form the HTTP-contract layer; the unit suite above is the pure-function layer.

Command:
```
cd backend && python -m pytest \
  tests/test_spc_api_client.py \
  tests/test_spc_caching.py \
  tests/test_spc_api_error_handling.py \
  tests/test_h3_resolution_fallback.py \
  tests/test_parse_sdmx_observations.py \
  -v
```

Per-file acceptance (these files already exist on `feature/integrate-starter-bundle`; this change ports them verbatim and confirms they still pass after the surgical `server.js` injection):
- **`test_spc_api_client.py`** — `GET /api/layers` returns a list including `sea_level_rise_dynamic`, `power_gen_dynamic`, `water_access_dynamic`; `GET /api/layers/unknown_layer` returns 400; `POST /api/refresh` (missing and invalid `layer`) returns 400.
- **`test_spc_caching.py`** — `GET /api/chatbot-context` returns `{ available_layers, unavailable_layers }`; `GET /api/layers/sea_level` returns response shape consistent with `status: "available" | "stale" | "unavailable"`.
- **`test_spc_api_error_handling.py`** — `GET /api/layers/sea_level` against an unreachable Pacific Data Hub returns 503 with `{ layer, status: "unavailable", data: null, error }`.
- **`test_h3_resolution_fallback.py`** — `GET /api/layers/sea_level` H3 cells are at resolution 4 for Fiji and resolution 5 for Tuvalu, Nauru, Kiribati (when those regions appear in the response).

### Ported Playwright e2e — `frontend/e2e/test_dynamic_map_layers.spec.ts`

Command (from repo root): `cd frontend && npx playwright test e2e/test_dynamic_map_layers.spec.ts`

Acceptance criteria verified:
- The "Dynamic Datasets" section header is visible in the Map Layers panel.
- All three dynamic layer toggle buttons render with their expected labels.
- Clicking "Sea Level Rise (H3)" toggles `activeLayer` (visible via the legend block that appears).
- Hovering over a rendered (mocked or live) sea-level feature displays a tooltip containing an indicator value (when the live layer has features; otherwise gracefully skips).
- The starter prompt cards visible in the chat panel do not include "Sea Level"/"Power Assets"/"Water Access" — those were removed by gh issue #3 (out of scope here, but this test asserts the cards visible are only genuinely-supported actions).

Note: the last assertion is intentionally forward-looking. If gh issue #3 hasn't landed when this change is being verified, the test is skipped via Playwright's `test.skip` conditional (e.g., `test.skip(!process.env.MOCK_PROMPTS_REMOVED, ...)`). After issue #3 lands the skip lifts.

### Existing tests that must continue to pass

- `cd backend && pytest backend/tests/` — main's 11 existing pytest files (`test_aggregate_by_admin_region.py`, `test_calculate_infrastructure_exposure.py`, `test_compare_climate_scenarios.py`, `test_find_extreme_locations.py`, `test_get_threshold_exceedance.py`, `test_rank_assets_by_exposure.py`, `test_rank_regions.py`, `test_sample_hazard_at_assets.py`, `test_summarize_climate_by_region.py`, plus the pre-existing `test_clip_to_region.py`, `test_compare_climate_periods.py`, `test_load_climate_projection.py`, `test_resolve_region.py`). Porting SDMX must not regress any of these.
- `cd frontend && npx playwright test e2e/spatial-query.spec.ts` — main's existing Playwright suite for the spatial query UI; must continue to pass after the surgical `MapCanvas.tsx` insert.
- `cd frontend && npm run lint` — ESLint passes across all new and modified files.
- `cd frontend && npm run build` — Vite production build succeeds (catches type errors introduced by `ClimateLayer` widening and `MapLayer` value additions).

## Manual Verification

### Dynamic Datasets panel renders and is distinct

- **WHEN** the developer opens the app at `http://localhost:5173` with the backend running on `http://localhost:8000` and clicks the Map Layers control icon.
- **THEN** the panel renders with two visually distinct groups: "Climate Projections" (containing "Temperature" and "Wet-Bulb" buttons) and "Dynamic Datasets" (containing "Sea Level Rise (H3)", "Power Gen (GWh)", and "Water Access" buttons).

### Sea Level layer toggle shows H3 hexagons

- **WHEN** the developer clicks "Sea Level Rise (H3)" in the Dynamic Datasets group with the backend running and Pacific Data Hub reachable (or a cached sea-level payload present).
- **THEN** the map renders a layer of blue-toned H3 hexagon polygons across PICT regions, the previously-active "Climate Projections" layer becomes non-visible, and a blue gradient legend appears below the panel section labeled "Sea Level Anomaly".

### Hovering a sea-level hex shows indicator value and year range

- **WHEN** the "Sea Level Rise (H3)" layer is active and the developer hovers over an H3 hex polygon.
- **THEN** a popup appears near the cursor showing `indicator_value` (e.g., `0.42`) and `observation_year` (e.g., `2014-2023`).

### Power Gen choropleth renders region-level fills

- **WHEN** the developer clicks "Power Gen (GWh)".
- **THEN** the map shows an orange choropleth at region granularity (not H3 hexagons), the sea-level layer becomes non-visible, and the legend block switches to a cream-to-orange gradient labeled "Power Generation (GWh)".

### Switching from Sea Level to Power Gen hides the prior legend

- **WHEN** "Sea Level Rise (H3)" is active and the developer clicks "Power Gen (GWh)".
- **THEN** the sea-level legend block disappears and the power-gen legend block appears; the sea-level `fill` layer's `visibility` becomes `"none"` and the power-gen `fill` layer's `visibility` becomes `"visible"`.

### Choropleth hover shows value only (no year range)

- **WHEN** `activeLayer === "power_gen"` and the developer hovers over a FJ region polygon.
- **THEN** the tooltip shows `1234.5` (or the live FJ value) but does not show any year-range text.

### Manual refresh via admin endpoint

- **WHEN** the developer runs `curl -X POST "http://localhost:8000/api/refresh?layer=sea_level"` while the backend is running.
- **THEN** the response is 200 (or 503 if Pacific Data Hub is down and no prior cache exists) and a follow-up `GET /api/layers/sea_level` returns `status: "available"` with fresh data.

### Error contract surfaces to UI

- **WHEN** Pacific Data Hub is unreachable (developer can simulate by adding `127.0.0.1 stats-sdmx-disseminate.pacificdata.org` to `/etc/hosts` blocking the domain) and the developer clicks "Sea Level Rise (H3)".
- **THEN** if a stale cache exists, the layer still renders and the backend warns (log line `"Using cached data — PDH unreachable"`); if no cache exists, the layer shows no hexagons and `apiFetch("/api/layers/sea_level")` returns 503 — the UI degrades silently (no error popup to the user, just an empty layer).

### workflow-complete flyTo still works

- **WHEN** the developer opens the browser console and runs `window.dispatchEvent(new CustomEvent("workflow-complete", { detail: { center: [178.06, -17.85], zoom: 8.5 } }))`.
- **THEN** the map smoothly flies to center `[178.06, -17.85]` at zoom `8.5` (forward-compat hook for the `visual-workflow-programmer` openspec change).

### Main's existing admin/heat-risk UI untouched

- **WHEN** the developer interacts with any control added by main — admin boundary picker, heat-risk threshold settings, asset fuzzy search panel.
- **THEN** all behavior and UI remain identical to before this change merged (no regressions from the `MapCanvas.tsx` surgical insert).

### Conversation panel does not include mentions of sea level / power / water

- **WHEN** the developer opens the chat panel and reviews the starter prompts list.
- **THEN** these SDMX-related starter prompt cards ("Sea Level", "Power Assets", "Water Access", "Dev Preset") are NOT present (this is the precondition established by gh issue #3; if issue #3 hasn't landed, this verification is skipped and noted in the PR description rather than blocking the merge).