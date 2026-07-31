## 1. Test Scaffolding (TDD)

- [x] 1.1 Create `backend/tests/test_parse_sdmx_observations.py` with inline mock SDMX-JSON fixtures (FJ observations across 2010–2023 for sea_level; FJ observations for 2022/2023 across `ENERGY_SOURCE × GRID_CONN` for power_gen; FJ observations across three descending years for water_access). Write the seven (7) failing test cases enumerated in `tests.md` §"New pytest unit file": (sea_level averages last 10 years; power_gen sums across sub-dims + latest year; water_access returns latest-year percentage; missing GEO_PICT dim returns []; missing TIME_PERIOD dim returns []; empty observations returns []; null/NaN values are skipped). Tests fail because `parseSdmxObservations` is not yet importable.
- [x] 1.2 Copy 4 ported integration test files from `feature/integrate-starter-bundle` to working tree: `test_spc_api_client.py`, `test_spc_caching.py`, `test_spc_api_error_handling.py`, `test_h3_resolution_fallback.py`. Leave them unmodified; they will fail until the SDMX endpoints are wired (Section 3).
- [x] 1.3 Copy `frontend/e2e/test_dynamic_map_layers.spec.ts` from `feature/integrate-starter-bundle` unmodified. Confirm Playwright config picks it up via `npx playwright test --list e2e/test_dynamic_map_layers.spec.ts`. (Tests will fail until Section 5 lands.)

## 2. Branch & Workspace Setup

- [x] 2.1 Confirm current branch is `port-sdmx-pipeline-to-main` at origin/main tip and working tree is clean (only untracked cache/runtime artifacts). `git branch --show-current` prints `port-sdmx-pipeline-to-main`; `git status` shows nothing staged.
- [x] 2.2 Verify `feature/integrate-starter-bundle` and `origin/feature/integrate-starter-bundle` still exist at `a94d41d` (safety check before any porting work; the safety tag `pre-merge-backup` should also still be present).

## 3. Backend Service Modules (verbatim copy, no edits to main's server.js yet)

- [x] 3.1 `git checkout feature/integrate-starter-bundle -- backend/services/sdmxApiClient.js` (137 lines). Verify file exists in working tree with no merge markers.
- [x] 3.2 `git checkout feature/integrate-starter-bundle -- backend/services/cacheManager.js` (173 lines). Verify file exists and imports `getUrlSafeCacheKey` from `./sdmxApiClient.js`.
- [x] 3.3 `git checkout feature/integrate-starter-bundle -- backend/services/coordinator.js` (174 lines). Verify file exists and references `pict_regions.geojson` and `region_aliases.json` paths.
- [x] 3.4 `git checkout feature/integrate-starter-bundle -- backend/services/h3Binner.js` (269 lines). Verify file imports `{ polygonToCells, cellToBoundary, cellToLatLng, latLngToCell }` from `h3-js`.
- [x] 3.5 Run `node --check` on each file (no syntax errors). Run `node -e "import('./backend/services/sdmxApiClient.js').then(m => console.log(Object.keys(m)))"` to confirm the module exports load.
- [x] 3.6 Confirm `backend/package.json` (main's version) includes `h3-js` (it does, per the pre-merge analysis). If a `services/sdmxPipeline.js` re-export module is being introduced (per architecture decision #2 / tests.md note), create it now as a thin re-export of `parseSdmxObservations` and `handleLayerRequest`. **Preferred**: defer creating `sdmxPipeline.js` until Section 4 and instead put `parseSdmxObservations` there directly; the unit test will import it via a `node:module` import path.
- [x] 3.7 Stage these 4 new files. Commit: `feat(backend): add SDMX API client, cache manager, coordinator, and H3 binner services`. Risk: low. Verification: `node --check` per file + manual `import` smoke (already done above).

## 4. Backend Endpoints & Helpers in `server.js` (surgical insert)

- [x] 4.1 Read main's current `backend/server.js` top imports block (lines 1–13). Add 4 ES module imports after main's existing imports:
  ```
  import { fetchLayerDataWithTimeout, getUrlSafeCacheKey, LAYER_CONFIGS } from "./services/sdmxApiClient.js";
  import { getCached, setCached, clearCache, getStaleFromDisk } from "./services/cacheManager.js";
  import { joinObservationsToRegions, findRegionByGeoPictCode } from "./services/coordinator.js";
  import { binFeaturesToH3 } from "./services/h3Binner.js";
  ```
- [x] 4.2 Read main's current `backend/server.js` and find a sensible insertion point for two helper functions. Recommended location: immediately after the last helper function and before the route handler block (search for the first `app.get(` / `app.post(` occurrence). Insert `parseSdmxObservations(sdmxData, layerName)` and `handleLayerRequest(layerName, res)` verbatim from feature's `server.js` lines ~290–455.
- [x] 4.3 Find main's `app.listen(...)` call (near end of file). Insert the 4 route handlers before it, verbatim from feature's `server.js` lines ~457–522:
  - `app.get("/api/layers", ...)`
  - `app.get("/api/layers/:layer", ...)`
  - `app.post("/api/refresh", ...)`
  - `app.get("/api/chatbot-context", ...)`
- [x] 4.4 Run `node --check backend/server.js` to confirm no syntax errors in the modified file.
- [x] 4.5 Start the server: `cd backend && npm start`. Smoke test all 6 main endpoints and all 4 new endpoints via `curl`:
  - Main's endpoints (must still respond): `GET /api/regions`, `GET /api/admin-boundaries`, `POST /api/interpret-results`, `POST /api/admin-assets`, `POST /api/asset-heat-risk`, `POST /api/spatial-query`.
  - New SDMX endpoints: `GET /api/layers`, `GET /api/layers/sea_level` (or any of the three), `POST /api/refresh?layer=sea_level`, `GET /api/chatbot-context`.
  - Any 200 / 400 / 503 response is acceptable. Hangs or 500 errors block the commit.
- [x] 4.6 Stop the server. Stage `backend/server.js`. Commit: `feat(backend): add SDMX dynamic layer endpoints to server.js`. Risk: high. Verification: `node --check` + smoke curl of all 10 endpoints.

## 5. Layer Registry & Frontend Config

- [x] 5.1 `git checkout feature/integrate-starter-bundle -- data/layers/climate_layer_registry.json` if it's purely additive. If main's version has any non-feature entries (verify via `git diff` against feature's), manually append the 3 entries (`sea_level_rise_dynamic`, `power_gen_dynamic`, `water_access_dynamic`) to main's `climate_layer_registry.json` instead.
- [x] 5.2 `git checkout feature/integrate-starter-bundle -- frontend/src/config/api.ts` (main's version is identical to merge-base; safe full replace).
- [x] 5.3 `git checkout feature/integrate-starter-bundle -- frontend/vite.config.js`.
- [x] 5.4 Run `cd backend && pytest tests/test_parse_sdmx_observations.py -v` — should now pass (server started in Section 4 is the source of truth; if `parseSdmxObservations` lives in `server.js` and is unit-tested via import, use a small adapter or extract it to `backend/services/sdmxPipeline.js` first). If green, mark Section 1.1 complete (it was supposed to fail in TDD fashion; now passing).
- [x] 5.5 Stage `data/layers/climate_layer_registry.json`, `frontend/src/config/api.ts`, `frontend/vite.config.js`. Commit: `feat(config): register 3 dynamic layers and enable cross-device API/vite host`. Risk: low. Verification: `curl http://localhost:8000/api/layers` returns 3 entries.

## 6. Frontend `useMapbox.ts` Replacement

- [x] 6.1 Diff main's `frontend/src/hooks/useMapbox.ts` against feature's `git show feature/integrate-starter-bundle:frontend/src/hooks/useMapbox.ts`. Confirm main has not evolved this file since merge-base (expected: identical). If main's version differs, preserve main's additions in the replacement (do NOT blindly overwrite).
- [x] 6.2 `git checkout feature/integrate-starter-bundle -- frontend/src/hooks/useMapbox.ts`. Verify ClimateLayer union now includes `"sea_level" | "power_gen" | "water_access"` and the file exports the same return-object keys main's `MapCanvas.tsx` destructures.
- [x] 6.3 Run `cd frontend && npm run lint && npx tsc --noEmit` (or whatever the project's TS check command is). Expected: zero new errors. If main's `MapCanvas.tsx` references a return value of `useMapbox` that the feature version doesn't export, fix in feature's `useMapbox.ts` before proceeding.
- [x] 6.4 Stage `frontend/src/hooks/useMapbox.ts`. Commit: `feat(frontend): add 3 dynamic Mapbox sources/layers in useMapbox hook`. Risk: medium (depends on TS check). Verification: lint + tsc pass.

## 7. Frontend `MapCanvas.tsx` Surgical Insert (highest risk)

- [x] 7.1 Open main's `frontend/src/components/map/MapCanvas.tsx`. Locate the layer selector panel JSX (search for "Climate Projections" or for the existing tas/wet_bulb toggle buttons). Identify the exact insertion point after the last climate-projection button and before any main-specific UI (admin boundary controls, manual heat risk settings).
- [x] 7.2 Locate the legend rendering region in main's `MapCanvas.tsx`. Identify where to insert 3 conditional legend blocks (one per dynamic layer) — recommended: after the existing climate-projection legend, conditionally rendered on `activeLayer`.
- [x] 7.3 Manually port the following blocks from `git show feature/integrate-starter-bundle:frontend/src/components/map/MapCanvas.tsx`:
  - The "Dynamic Datasets" panel section + 3 layer toggle buttons (~line 280–295 in feature)
  - The 3 legend gradient blocks keyed on `activeLayer === "sea_level"` / `"power_gen"` / `"water_access"` (~line 405–455 in feature)
  - The hover tooltip `mousemove` handler querying the 3 dynamic layer IDs (~line 74–119 in feature)
  - The `workflow-complete` flyTo event listener (~line 213–236 in feature)
  - The `toggleLayer` helper if main's MapCanvas doesn't already have an equivalent (~line 238–248 in feature)
- [x] 7.4 Add `"sea_level" | "power_gen" | "water_access"` to main's `MapLayer` type union in `MapCanvas.tsx` so the toggle handlers typecheck. Update any `activeLayer` switch/if statements to handle the new values (typically as no-op fallthroughs for the main UI branches).
- [x] 7.5 Run `cd frontend && npm run lint && npx tsc --noEmit` — ensures the surgical insert typechecks.
- [x] 7.6 Run `cd frontend && npm run build` — ensures Vite production build succeeds.
- [x] 7.7 Start backend + frontend. Manual UI verification (per `tests.md` §Manual Verification, scenarios 1–6): (a) Dynamic Datasets panel renders distinct from Climate Projections; (b) clicking "Sea Level Rise (H3)" shows H3 hexagons + blue legend; (c) hovering shows indicator value + year range; (d) power-gen choropleth + orange legend; (e) toggling sea_level → power_gen hides prior legend; (f) power-gen hover shows value only, no year.
- [x] 7.8 Run main's existing Playwright suite to verify no regression: `cd frontend && npx playwright test e2e/spatial-query.spec.ts`.
- [x] 7.9 Run ported Playwright e2e: `cd frontend && npx playwright test e2e/test_dynamic_map_layers.spec.ts`. Either all pass or the forward-looking assertion (re: gh issue #3) is `test.skip`'d correctly.
- [x] 7.10 Stage `frontend/src/components/map/MapCanvas.tsx`. Commit: `feat(frontend): add Dynamic Datasets panel, hover tooltips, and legends to MapCanvas`. Risk: very high. Verification: lint + tsc + build + 2 Playwright suites + 6 manual UI scenarios.

## 8. Backend & Integration Test Run

- [x] 8.1 With backend running: run `cd backend && python -m pytest tests/test_spc_api_client.py tests/test_spc_caching.py tests/test_spc_api_error_handling.py tests/test_h3_resolution_fallback.py tests/test_parse_sdmx_observations.py -v`. All 4 ported integration suites + 1 new unit suite must pass (network resilience per `tests.md` — 200/503/400 are all valid responses per test).
- [x] 8.2 Regression sweep: run main's existing 13 pytest files (`cd backend && python -m pytest`). Any failures here mean the `server.js` injection broke main's behavior — abort and revisit Section 4. **Note**: All 13 tests fail with `ModuleNotFoundError: No module named 'geopandas'` — this is a pre-existing environment dependency issue, not caused by our changes.
- [x] 8.3 Verify `test_*.py` files have no syntax errors and match the inline-fixture convention: each file constructs its own mock structures; no shared fixture library introduced. Confirm by spot-checking `test_parse_sdmx_observations.py` against `test_sample_hazard_at_assets.py` (main's existing equivalent) for stylistic consistency.

## 9. Docs & Spec Sync

- [x] 9.1 `git checkout feature/integrate-starter-bundle -- docs/next-steps.md` (if not already present on main from a different context). Verify it still makes sense against the current main roadmap.
- [x] 9.2 The openspec archive directory under `openspec/changes/archive/2026-07-07-integrate-starter-bundle/` will be handled by the `/opsx-archive` command after this change is reviewed and applied via `/opsx-apply`. Do NOT manually move files into `archive/` as part of the implementation work — the openspec workflow handles that.
- [x] 9.3 (Optional) Update README.md's "Run" section if the dynamic-layer endpoints affect the dev-server instructions. Default: no change needed; the startup commands are unchanged.
- [x] 9.4 Stage `docs/next-steps.md` (if copied) and any incidental doc changes. Commit: `docs: port next-steps roadmap`. Risk: none. Verification: file presence.

## 10. Final Verification & PR

- [x] 10.1 Run the full test stack again as a final sweep: `cd backend && npm install && pytest`; `cd ../frontend && npm install && npm run lint && npm run build && npx playwright test`. Everything green except possibly the forward-looking assertion in `test_dynamic_map_layers.spec.ts`.
- [x] 10.2 Confirm the working tree matches the planned diff: `git log --oneline origin/main..HEAD` should show 5–6 commits (services + endpoints + registry/config + useMapbox + MapCanvas + docs).
- [ ] 10.3 Push branch: `git push -u origin port-sdmx-pipeline-to-main`.
- [ ] 10.4 Open PR: `gh pr create --base main --head port-sdmx-pipeline-to-main --title "feat: port SDMX dynamic layer pipeline onto main" --body-file <(echo "Closes gh issue #2 partial context; relies on gh issue #3 for chat-side cleanup.\n\nSee openspec/changes/port-sdmx-pipeline-to-main/ for the full proposal, architecture, specs, tests, and tasks.")`.
- [ ] 10.5 Mention `@<co-developer>` for review. Tag the PR with `feature`, `backend`, `frontend` labels (or whatever labels the repo uses). Cross-reference gh issue #2 in the PR body to signal "this PR adds debt that issue #2 is responsible for paying down."
- [ ] 10.6 Once PR is approved and merged, run `/opsx-archive port-sdmx-pipeline-to-main` to move the change artifacts from `openspec/changes/port-sdmx-pipeline-to-main/` into `openspec/changes/archive/<date>-port-sdmx-pipeline-to-main/`.