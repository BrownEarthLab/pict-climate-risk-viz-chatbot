> **Before starting, read in this order:** `proposal.md` (why, and what is out of scope),
> `architecture.md` (Decisions 1–8 — several are prohibitions), `tests.md` (every criterion
> names its command). Background: `docs/brushing-viz-retrospective.md`,
> `docs/v2-direction-research.md` §3a, `docs/v2-plan-appraisal.md`,
> `docs/v2-reference-implementations.md`.
>
> **A checkbox means the named verification ran and passed — not that code was written.**

## 0. Foundation (must precede everything)

- [x] 0.1 Install `typescript` as a devDependency and add a `typecheck` script running `tsc --noEmit`; confirm it reports errors on a deliberately broken type, then fix.
- [x] 0.2 Install `d3-scale`, `d3-shape`, `d3-array` and their `@types`. Do **not** install `d3-selection` or `d3-brush` (architecture.md Decision 1).
- [x] 0.3 Cherry-pick `5cd3c20` from `feature/pacific-climate-brushing-viz`: `backend/services/h3Binner.js` land mask, CHVA route and CSV, `backend/tests/test_h3_antimeridian_wrap.py`. Resolve conflicts against the current `backend/services/h3Binner.js`, which already has the antimeridian wrap.
- [x] 0.4 Verify `node --check backend/services/h3Binner.js` and `cd backend && python3 -m pytest tests/ -q` both pass after the cherry-pick. **The Python suite needs the backend running on :8000** — `tests/test_spc_*.py` are integration tests hitting `http://localhost:8000`; without a server they fail with connection errors (11 failures) that are environmental, not regressions.
- [x] 0.5 Add a grep guard to the lint step asserting `d3-selection` and `d3-brush` appear in neither `frontend/package.json` nor any import under `frontend/src`.

## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing `e2e/map_state_smoke.spec.ts` for **Map Canvas Loading**: sources retrievable via `getSource` after style load, active layer at `visibility: "visible"`, `querySourceFeatures` non-zero, map reachable from browser context. Must fail on a cold load with no interaction.
- [x] 1.2 Write failing `e2e/bivariate_encoding.spec.ts` for **Three Selectable Bivariate Modes**, **Diverging Mode Centers On A Declared Norm**, and **Encoding Operates At A Single Declared Scale** — including class stability across pan/zoom and rejection of a mixed-scale definition.
- [x] 1.3 Write the failing palette check for **Palette Accessibility Is Verified, Not Asserted**: ΔE00 ≥ 10 between matrix-adjacent cells, in sRGB and under deuteranopia (architecture.md Decision 4b — ΔE, **not** WCAG contrast ratio). It must fail the run, not warn.
- [x] 1.4 Write failing `e2e/legend_brushing.spec.ts` for **The Legend Is An Interactive Control**, **Highlighting Uses Mapbox Feature State**, and **One Identity Contract Across Views** — asserting via `getFeatureState`, and asserting the fill paint references `["feature-state", ...]`.
- [x] 1.5 Write failing tests for **Search Brushes A Named Region** and **Tooltips Render Typed Fields, Never Raw Properties**, including the negative assertion that no raw property key appears in tooltip text.
- [x] 1.6 Write failing `e2e/narrative_frame.spec.ts` for **One Encoding Visible Per Chapter**, **Analysis Output Renders Beside The Map**, **Opening Splash Screen Is Minimal**, **Free Exploration Clears Narrative State**, and **Narrative State Does Not Override Manual Selection**.
- [x] 1.7 Write failing tests for the modified **Climate Layer Toggles**: activating a layer sets its Mapbox layout visibility to `visible` and the previous one to `none`, asserted independently of legend presence.
- [x] 1.8 Run the full suite and record which tests fail and why. Confirm they fail for the intended reason, not from harness errors.

## 2. Map Registration and Verifiability

- [x] 2.1 Move layer setup in `frontend/src/hooks/useMapbox.ts` from `map.on("load")` to `style.load` with an `isStyleLoaded()` fast path and an idempotence guard (architecture.md Decision 3).
- [x] 2.2 Expose the map instance for browser-context assertions, and clean it up on unmount.
- [x] 2.3 Register layers so that one failing `addLayer` cannot silently abort those after it; surface the throw rather than swallowing it.
- [x] 2.4 Make 1.1 pass.

## 3. Dataset Definitions and Classification

- [x] 3.1 Define the dataset-definition shape: declared geographic scale, two variables, and an explicit norm for diverging mode. The classification **method is not declared per dataset** — it follows from the mode (architecture.md Decision 4a): quantile for sequential axes, symmetric equal-interval about the norm for diverging.
- [x] 3.2 Author definitions for the verified pairs (`docs/v2-direction-research.md` §3a): heat × **inter-annual variability** (Fiji, 102 cells — `_max − _min` is year-to-year spread for one model, **not** model uncertainty; label it accordingly in the UI); sea level anomaly × indicator deviation (PICT, 26); `region_group` × population (PICT, country).
- [x] 3.3 Implement `classify()` as a pure function returning a stable class index per feature; reject mixed-scale definitions at load with an error naming both scales.
- [x] 3.4 Expose derived break values and units for legend display.
- [x] 3.5 Make 1.2 pass.

## 4. Palettes

- [x] 4.1 Construct the `sequential-sequential` 3×3 palette from two sequential ramps.
- [x] 4.2 Construct `diverging-diverging` as two diverging ramps blended about a neutral center.
- [x] 4.3 Construct `qualitative-sequential` as a hue per category with lightness carrying the sequential axis.
- [x] 4.4 Make 1.3 pass — ΔE00 (CIEDE2000) ≥ 10 between matrix-adjacent cells, in sRGB and under deuteranopia (architecture.md Decision 4b). If a palette fails, change the palette — do not relax the threshold.

## 5. Bivariate Map Layer

- [x] 5.1 Add the bivariate fill layer with `promoteId` set to the shared identifier (spec: **One Identity Contract Across Views**).
- [x] 5.2 Build fill paint from the active mode's matrix, with `feature-state` branches for highlighted and hovered states. Keep `interpolate` outermost and `case` nested inside each zoom stop — nesting `["zoom"]` inside `case` throws and silently aborts every later layer (architecture.md Risks).
- [x] 5.3 Implement mode switching so exactly one bivariate fill layer is visible.
- [x] 5.4 Make 1.7 pass.

## 6. Chart Components (React renders, D3 computes)

- [x] 6.1 Add a `useDimensions(ref)` hook returning `{width, height}` with resize handling.
- [x] 6.2 Add a `frontend/src/dataviz/constant.ts` of shared design tokens before the first chart, not after the fifth.
- [x] 6.3 Build the distribution histogram: `d3-array` for bins, `d3-scale` for scales, marks returned from `.map()`. No `selectAll`, no SVG ref for rendering.
- [x] 6.4 Build the box plot for the uncertainty envelope (`_min` / `_mean` / `_max`).
- [x] 6.5 Build the HTML tooltip component fed a typed interaction payload with labels, units, and provenance.
- [x] 6.6 Make 1.5 pass.

## 7. Legend as Primary Brush Control

- [x] 7.1 Build the 3×3 legend with per-cell hover and selection, displaying break values and units.
- [x] 7.2 Lift `mode`, `selectedClass`, `selectedIds`, `hoveredId`, `activeChapter` into one owner component passed down as props — no store, no source attribution (architecture.md Decision 2).
- [x] 7.3 Apply selection to the map via `setFeatureState`, removing stale state when the selection changes or clears.
- [x] 7.4 Apply selection to the charts by prop, partitioning selected from unselected.
- [x] 7.5 Implement re-select-to-clear.
- [x] 7.6 Build the search control brushing a named region across both views, reporting no-match without disturbing the existing selection.
- [x] 7.7 Make 1.4 pass.

## 8. Scrollytelling Frame

- [x] 8.1 Build the splash view: title, one-sentence framing, search control, single entry point. No control surface on first paint.
- [x] 8.2 Define chapters, each declaring one encoding, a camera position, a legend mode, and a geographic scale.
- [x] 8.3 Implement chapter transitions that replace rather than stack the active encoding.
- [x] 8.4 Ensure every callback passed into the narrative component is `useCallback`-stable, so chapter presets apply on transition only and never on an unrelated parent re-render (v1 Patch 2).
- [x] 8.5 Add the free-exploration exit clearing chapter filters while leaving legend and search operable.
- [x] 8.6 Make 1.6 pass.

## 9. Verification and Honest Reporting

- [x] 9.1 Run `npm run lint`, `npx tsc --noEmit`, `npm run build`, the Python suite, and the full e2e suite. Record actual output.
- [x] 9.2 Re-run `frontend/e2e/spatial-query.spec.ts` and record its status on this branch; it had 2 pre-existing failures on the archived branch from `DrawControls` being mounted nowhere. Do not report a pass that was never true.
- [x] 9.3 Complete every item in `tests.md` → Manual Verification, including the antimeridian pan (never visually inspected in v1) and the removal test from the lab notes.
- [x] 9.4 Write a verification record stating, per criterion, the command run and its result. Any criterion not verified is marked unverified — not complete.
- [x] 9.5 Confirm no performance claim has been added anywhere without a measurement method in `tests.md`.
- [x] 9.6 Confirm no synthetic health data exists in the build, and that emerging-hotspot, tuberculosis, and population scope remain excluded (architecture.md Decisions 6 and 7).

## 10. Parallel Research (not blocking, but decides what comes next)

- [x] 10.1 Determine whether tuberculosis data exists below national level and at what time depth. This decides whether Direction A is viable at all (architecture.md Open Question 1).
- [x] 10.2 Obtain the student's Python emerging-hotspot notebook and record what it needs as input.
- [x] 10.3 Scope the work to produce multi-year heat layers via `backend/scripts/build_climate_layer_from_nex.py`, which is the prerequisite for any space-time cube.
