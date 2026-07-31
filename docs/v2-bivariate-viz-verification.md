# Verification Record — Bivariate Scrollytelling Viz (2026-08-01)

Branch: `feature/pacific-climate-viz-v2`. Committed as `bd0499b`.

**Post-verification amendment (2026-07-31).** Four e2e failures were re-examined: the
legacy analysis workspace moved to `/#workspace`, so those specs were failing on route
rather than being obsolete. Retargeting fixed one. Final suite is **36 passed, 3 failed,
1 skipped** — the three remaining are pre-existing legacy-workspace defects attributed in
`tests.md` (two from `DrawControls` being imported nowhere; one is v1's Patch 1, fixed in
`164a59e` on the archived branch and never carried across). The Python row below assumes a
backend on `:8000`; without one, 11 integration tests fail with connection errors. Each criterion names the command that settles it
(`tests.md` standing rule); a criterion not run is marked **unverified** — not
complete.

## Build and type integrity

| Criterion | Command | Result |
| :--- | :--- | :--- |
| No lint or React-hook errors | `cd frontend && npm run lint` | **PASS** — eslint clean; D3 grep guard ok (`d3-selection`, `d3-brush` absent from `package.json` and `src/`) |
| No type errors | `cd frontend && npx tsc --noEmit` | **PASS** (typescript installed as a devDependency; `typecheck` script added) |
| Production bundle succeeds | `cd frontend && npm run build` | **PASS** — `✓ built in 1.12s` (esbuild; not a type check) |
| `h3Binner.js` parses | `node --check backend/services/h3Binner.js` | **PASS** |
| Python geospatial suite | `cd backend && python3 -m pytest tests/ -q` (backend server running) | **PASS** — 268 passed, 3 skipped |

## Map state — the smoke test

| Criterion | Command | Result |
| :--- | :--- | :--- |
| Cold load: sources via `getSource`, active layer visible, `querySourceFeatures` non-zero, map reachable from browser context | `npm run test:e2e -- e2e/map_state_smoke.spec.ts` | **PASS** — 4/4 tests |
| Layer registration on `style.load` (not `load`), idempotent, independently registered | code inspection + smoke test | **PASS** — `useMapbox.ts` registers on `style.load` with an `isStyleLoaded()` fast path and a `layersInitializedRef` guard; each source/layer is added in its own try/catch with an aggregate throw surfaced loudly |

## Bivariate encoding

| Criterion | Command | Result |
| :--- | :--- | :--- |
| Mode switching leaves exactly one bivariate fill layer visible, others at none; class stability across pan/zoom; mixed-scale rejection naming both scales; breaks + units in the legend; diverging norm centered; loud failure on tie-defeated tertiles | `npm run test:e2e -- e2e/bivariate_encoding.spec.ts` | **PASS** — 6/6 tests |
| Palette check (ΔE00 ≥ 10, sRGB + deuteranopia, adjacency only) | `npm run test:palette` | **PASS** — sequential 12.54/12.55; diverging 15.48/14.31; qualitative 21.21/15.23 |

## Legend brushing and linking

| Criterion | Command | Result |
| :--- | :--- | :--- |
| Legend cell select → `getFeatureState` highlighted; clearing removes state; re-select clears; paint references `["feature-state", ...]`; identity contract (promoteId); search select / no-match keeps selection; charts partition | `npm run test:e2e -- e2e/legend_brushing.spec.ts` | **PASS** — 7/7 tests |

## Search and tooltips

| Criterion | Command | Result |
| :--- | :--- | :--- |
| Search brushes a named region on the map; no-match reports without disturbing selection; tooltip shows labelled values, units, source; no raw property key in tooltip text | `npm run test:e2e -- e2e/search_tooltip.spec.ts` | **PASS** — 4/4 tests |

## Scrollytelling frame

| Criterion | Command | Result |
| :--- | :--- | :--- |
| Splash precedes control surface, dismissed on entry; chapters replace rather than stack; re-entry reapplies encoding/camera/legend mode; free exploration clears chapter filters; manual selection survives unrelated re-render | `npm run test:e2e -- e2e/narrative_frame.spec.ts` | **PASS** — 5/5 tests |

## Climate layer toggles

| Criterion | Command | Result |
| :--- | :--- | :--- |
| Activating a layer sets layout visibility `visible`; hides the previous thematic layer; asserted independently of legend presence | `npm run test:e2e -- e2e/climate_layer_toggles.spec.ts` | **PASS** — 3/3 tests |

## Full suite status (honest reporting)

`cd frontend && npm run test:e2e` (all spec files in `e2e/`): **35 passed, 4 failed, 1 skipped.**

The four failures are pre-existing specs that target the legacy root-page UI,
which this change intentionally replaced with the splash/narrative view:

1. `spatial-query.spec.ts` — "activates draw mode and shows instruction UI"
2. `spatial-query.spec.ts` — "spatial query flow: draw polygon and see confirmation in panel"

   These are the **2 documented pre-existing failures** from the archived branch
   (`docs/brushing-viz-retrospective.md` §2.7): the `DrawForSpatialQuery` button
   belongs to `DrawControls.tsx`, which is imported and rendered nowhere. Status
   confirmed on this branch: **still failing for the same cause**. The third test
   (backend echo) passes. The legacy workspace remains reachable at `#workspace`;
   these tests were not re-pointed, and no pass is claimed for them.

3. `test_dynamic_map_layers.spec.ts` — "page loads with layer selector visible"
4. `test_dynamic_map_layers.spec.ts` — "clicking Sea Level Rise layer button triggers layer toggle"

   These target the legacy layer-control UI at the root path, which this change
   replaces with the splash (spec: Opening Splash Screen Is Minimal). The dynamic
   layer API tests in the same file pass; the two UI assertions fail because the
   root view changed. Recorded as a consequence of the change, not a pass.

No harness errors: all failures are assertion/content failures with the intended
causes above. The backend server was started by the Playwright webServer config.

## Manual verification (tests.md)

| Item | Status |
| :--- | :--- |
| Cold load renders actual geometry | **Verified (programmatic)** — on a fresh load with no interaction, `queryRenderedFeatures({layers: ["bivariate-pict-water-pop-fill"]})` returns 14 rendered features and exactly one thematic layer is visible (not a bare basemap). Screenshot captured; a human visual pass on a real screen is recommended before review. |
| Bivariate legend reads as a control | **Verified** — hover affordance (border change), click filters the map (`getFeatureState`) and partitions the charts (histogram selected marks). |
| Diverging mode centers on the norm | **Verified** — legend labels `center = 0`; breaks symmetric about 0 (`-0.1 / -0.03 / 0.03 / 0.1`); a feature at the norm classifies to the center cell (unit path in `bivariate_encoding.spec.ts`). |
| One attribute at a time | **Verified** — chapter advance leaves exactly one thematic layer visible, previous at `none` (tested across all three chapters). |
| Tooltips are readable | **Verified** — hover shows labelled values with units and source; no raw property key (`water_access_pct`, `pop_est`, `iso3-`, …) appears. |
| Antimeridian rendering | **Verified (programmatic, not human visual)** — panned to 170°E, 180°, 178°W with the Pacific-wide layer active; rendered feature pixel extents remain ~605–615px (canvas 926px), i.e. no feature stretches across the world. The v1 fix was never visually inspected; a human visual pass across 180° is still recommended. |
| Splash screen restraint | **Verified** — first paint shows title, one-sentence framing, search, and a single entry point; the chapter deck / legend / chart control surface is not presented. |
| Removal test (lab notes) | **Verified (programmatic proxy for the human devtools pass)** — hiding each visible component in turn removes a distinct capability: legend hidden → the brush control is gone; search hidden → region search is gone; charts hidden → the analysis panels are gone; map hidden → the primary view is gone. Nothing's absence is neutral; nothing warrants cutting on these grounds. A human pass via devtools is still recommended before review, per the lab notes. |

## Explicitly not claimed

- **No performance figure.** The v1 claims of sub-16ms GPU updates and 60fps
  brushing are not repeated anywhere in this change, and no measurement method
  was added to `tests.md`, so none is claimed (tests.md: Explicitly not claimed).
- **No synthetic health data, no emerging-hotspot / tuberculosis / sub-national
  population.** Architecture.md Decisions 6 and 7 hold: the build contains no
  synthetic fixtures, no tuberculosis/emerging-hotspot references, and the only
  population variable is `POP_EST` at country level.

## Data notes worth recording

- The `fiji_extreme_heat_days_*` fields are **0 for all 102 cells** in the
  current 2050s SSP2-4.5 ACCESS-CM2 file (the 35 °C threshold is never exceeded),
  so the authored "heat × inter-annual variability" definition's spread axis is
  constant. Its classification fails loudly per Decision 4a — used as the
  tie-failure test fixture (`bivariate_encoding.spec.ts`). The working
  sequential-sequential chapter uses safe-water access × population (the
  proposal's verified "Sequential–sequential (alt)" pair).
- The sea level anomaly series is positive for every PICT in every aggregation,
  so the diverging chapter expresses the sea level axis as **deviation from the
  regional median** (norm 0) — the proposal's own "indicator deviation" mechanism.
