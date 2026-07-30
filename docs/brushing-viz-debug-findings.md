# Handoff: Pacific Climate Brushing & Linking Viz — State of Work and Remaining Tasks

**Branch:** `feature/pacific-climate-brushing-viz`
**Baseline before this work:** `042e5e5`
**This work, committed:** `5cd3c20` (backend + data) → `164a59e` (frontend fixes) →
`617e472` (e2e) → `a39ce9e` (docs). Working tree clean; nothing pushed.
**Written:** 2026-07-30
**OpenSpec change:** `openspec/changes/pacific-climate-brushing-viz/`
(`proposal.md`, `tasks.md`, `tests.md`, `architecture.md`, `specs/`)

---

## ⚠️ READ FIRST — three things that will waste your time or destroy work

**1. This work is committed but NOT pushed.** Four commits sit on top of `042e5e5`
(listed above) and the working tree is clean, so you can start from a known-good state.
Nothing is on the remote — do not `git reset --hard` past `042e5e5` or force-push over
this branch without checking. If you need to A/B a change against the pre-fix baseline,
compare against `042e5e5` rather than stashing.

**2. The patches in Part 3 are ALREADY APPLIED.** Part 3 is a *record of what was
changed and why*, not a work queue. Verify each is present; do not re-apply. Re-applying
Patch 1 in particular will corrupt the JSX brace nesting.

**3. Two upstream documents are stale and will mislead you.**

- The prior agent's diagnostic plan (not in the repo, may be pasted to you) is wrong on
  6 of 7 root causes — see Part 2.
- `openspec/changes/pacific-climate-brushing-viz/proposal.md`, section
  **"Verification Follow-up (2026-07-30)"**, claims *"chart data still uses mock `fj_*`
  IDs"*, *"there is no `map.setFeatureState()` invocation"*, and *"the
  histogram/`d3.brushX` interaction is absent"*. **All three were true at `042e5e5` and
  are false in the current working tree.** That section needs updating once this work is
  committed.

---

## Part 1 — Your actual work order

Everything in `tasks.md` is checked except three items. These are the job:

### 10.3 — Loop-prevention coverage for chart- and map-originated updates
**Status: not started. Read this before implementing.**

`useBrushingState.ts` records a `source: "MAP" | "CHART" | "STORY" | null` on every
setter, and **nothing anywhere reads it**. There is no observable feedback loop today
because the updates are effectively idempotent — a map hover sets `hoveredId`, the chart
restyles, and the chart does not write back.

I deliberately did not add guards, because guarding a loop that does not exist is
speculative and risks suppressing legitimate updates. Before writing code, decide whether
this task means (a) prove no loop exists with a regression test, or (b) add
source-attribution guards defensively. (a) is the cheaper and more honest reading.

### 12.2 — Dynamic-layer toggle/legend regression
**Status: bug fixed, coverage clause incomplete.**

The regression itself is fixed — it was two independent bugs, see Patches 1 and 2. What
remains is the task's own wording: *"cover all dynamic layers **and CHVA visibility**."*
Current test `dynamic layer toggles render their matching legend` covers only:

- `sea_level` and `chva_facilities` — **not** `power_gen` or `water_access`
- legend **DOM** visibility — **not** whether the Mapbox layer itself became visible

To close it, extend the test across all four layers and assert actual layer visibility:

```ts
const visibility = await page.evaluate(() =>
  (window as any).__map?.getLayoutProperty("chva-facilities-layer", "visibility")
);
expect(visibility).toBe("visible");
```

**Prerequisite for both 12.2 and 12.3: you need a map handle on `window`.** One exists —
`(window as any).__mapboxMap`, set in `DrawControls.tsx:30` — but **`DrawControls` is
imported and rendered nowhere in `frontend/src`** (verified by grep). It is orphaned dead
code, so the handle is never set at runtime. Either mount `DrawControls`, or expose the
map from `useMapbox`/`MapCanvas` directly. The latter is simpler and doesn't entangle
this work with the separate draw-mode regression.

### 12.3 — Browser tests for GPU brushing, map→chart linking, story reset
**Status: 1 of 3 done.**

- ✅ story preset reset — `Explore Freely clears the active layer and its legend`
- ❌ GPU feature-state brushing
- ❌ map→chart linking

**These two are the highest-value work remaining**, because they are the only way to
verify the change's headline features (see Part 4 — they are currently unverified).
GPU feature-state is not in the DOM, so DOM assertions cannot reach it. You need:

```ts
// drive a real brush gesture over the scatterplot SVG
await page.mouse.move(x0, y0); await page.mouse.down();
await page.mouse.move(x1, y1); await page.mouse.up();

// then read GPU state directly
const state = await page.evaluate(() =>
  (window as any).__map?.getFeatureState({ source: "chva-facilities", id: "chva-1" })
);
expect(state.highlighted).toBe(true);
```

Also assert the state is **cleared** when the brush is cleared — `tests.md` calls for
this explicitly and the cleanup path (`removeFeatureState`) is untested.

---

## Part 2 — Corrections to the prior diagnosis (do not re-apply that plan)

A previous agent produced a diagnostic plan written against `042e5e5`, not against the
working tree. Five of its six tasks describe work that already exists. Verified
claim by claim:

| Prior claim | Verified reality |
| :--- | :--- |
| `/api/layers/chva_facilities` missing → 404 | **False.** Exists at `backend/server.js:4890`. Confirmed live: HTTP 200, 111 features. |
| Source lacks `promoteId: "facility_id"` | **False.** Set at `useMapbox.ts:132`. |
| No `mousemove`/`click` handlers for CHVA | **False.** Both exist, incl. CHVA tooltip with name, vulnerability, provenance. |
| IDs inconsistent (`fj_*` vs `chva-*`) | **False.** Backend emits `facility_id: "chva-N"`; charts use `chva-1..12`. Aligned. |
| No `setFeatureState` cleanup for deselected IDs | **False.** Present via `previousFeatureStateRef` / `previousHoveredIdRef`. |
| "Next Chapter" / "Explore Freely" missing | **False.** Both present in `StorytellerDeck.tsx`. |
| Task 1: add the backend route | **Not needed.** No backend edit was made or is needed. |

The reported *symptoms* were real. The diagnosed *causes* were not. Real causes: Part 3.

---

## Part 3 — What was changed and why (ALREADY APPLIED — verify, don't re-apply)

Files touched: `MapCanvas.tsx`, `useMapbox.ts`, `LinkedRiskCharts.tsx`,
`storyteller_brushing_deck.spec.ts`. **No backend changes.**

### Patch 1 — Controls section trapped in the `manual_heat_risk` conditional
*Primary bug. Explains missing legends, invisible charts, and most of "toggling does nothing".*

The Dynamic Datasets buttons, all four legends, and `<LinkedRiskCharts />` were nested
inside `{currentActiveLayer === "manual_heat_risk" && ( ... )}`. So they rendered only in
manual-heat-risk mode, and clicking a dynamic layer set `activeLayer` away from
`manual_heat_risk` — **unmounting the very legend that click should have revealed.**
`LinkedRiskCharts` never rendered on a normal page load at all.

Fix: close the conditional right after the "Optional overlays" group so everything from
`{/* Dynamic Datasets section */}` onward is a sibling, then dedent the lifted block by 4.

*Verify present:* `MapCanvas.tsx` — `{/* Dynamic Datasets section */}` (~line 2570) sits
at 16-space indent and is **not** inside the `manual_heat_risk` block.

### Patch 2 — Unstable callback identity reset `activeLayer` every render

`MapCanvas` passed `setBrushRange={(range) => setBrushRange(range, "STORY")}` — a new
function identity per render — into `StorytellerDeck`, which lists it in an effect's
dependency array. The effect re-ran on every parent render and forcibly reset
`activeLayer` to the chapter preset. **Manual layer selection was impossible while the
deck was mounted.** It appeared to work for CHVA only because Chapter 2's preset layer
*is* `chva_facilities`, making the reset a no-op.

Fix: `applyStoryBrushRange = useCallback((range: BrushRange | null) => setBrushRange(range, "STORY"), [setBrushRange])`.

*Verify present:* `MapCanvas.tsx:886` and the call site at ~line 1985.

### Patch 3 — CHVA layer paint never read `feature-state`
*Real cause of "chart brushing does not illuminate map features" for CHVA.*

`setFeatureState({ highlighted: true })` was called correctly, but **no**
`chva-facilities-layer` paint property referenced `["feature-state", ...]` — a visual
no-op. (`sea-level-h3-layer` already had this; CHVA did not.)

Fix: `feature-state` branches added to `circle-radius`, `circle-opacity`,
`circle-stroke-color`, `circle-stroke-width` in `useMapbox.ts` (~lines 142–187).

> **Gotcha, cost ~1 test cycle:** Mapbox rejects `["zoom"]` nested inside `case`
> (`"zoom" expression may only be used as input to a top-level "step" or "interpolate"`).
> The `interpolate` must stay outermost with the `case` inside each zoom stop. Getting
> this wrong throws during `addLayer` and **silently aborts every layer registered after
> it** — you get a blank map and a console error, not a build failure.

### Patch 4 — The D3 brush destroyed itself mid-drag

The scatter effect called `svg.selectAll("*").remove()` and listed `selectedIds` /
`hoveredId` in its deps. Dragging fired a brush event → state update → effect re-ran →
**the `<g class="brush">` being dragged was removed from the DOM** → gesture aborted.
Hovering had the same failure mode (circle destroyed, `mouseleave` never fired).

Fix: split into a **build** effect (deps: stable `useBrushingState` callbacks) and an
**in-place restyle** effect (deps: `selectedIds`, `hoveredId`, `brushRange`). Brush group
appended *before* the dots so the overlay doesn't swallow per-dot hover.

*Verify present:* `LinkedRiskCharts.tsx` — build effect ends `}, [dataset, onSelectIds, onHoverId]);`
(line 160), restyle effect ends `}, [selectedIds, hoveredId, brushRange]);` (line 181).

### Patch 5 — Hover cleared on every mousemove pixel

`setHoveredId(null, "MAP")` fired on every pointer move that missed a feature — a state
update per pixel of travel while panning empty ocean, re-rendering the charts
continuously. Fix: `lastMapHoverIdRef` guard so it dispatches once per hover-exit.

*Verify present:* `MapCanvas.tsx:880`, plus guards at ~1734 and ~1779.

### Patch 6 — No control bound to the CHVA layer

The Dynamic Datasets list offered only `sea_level`, `power_gen`, `water_access`. CHVA was
reachable **only** via Storyteller Chapter 2. This is the actual "missing layer" symptom —
data and layer were fine, no control existed. Added a "Fiji CHVA Facilities" button and
widened `type MapLayer` (line 120) to include `"chva_facilities"`.

> The `MapLayer` widening is **not caught by the build** — see Part 5, there is no `tsc`.

### Patch 7 — E2E coverage

Patch 6 makes `"Fiji CHVA Facilities"` both the Ch2 badge and a button label, breaking
the existing test under Playwright strict mode — scoped to the badge via
`page.locator("span").filter({ hasText: ... })`. Added three tests: CHVA endpoint
contract, dynamic-layer legend toggling, Explore Freely reset.

`dynamic layer toggles render their matching legend` is the direct regression test for
Patches 1 and 2 — it fails against either bug alone.

---

## Part 4 — Verification status: 4 of 13 criteria empirically verified

Against the 13 criteria in `tests.md` (3 automated + 5 manual + 5 recovery). **Be
skeptical of any claim that this change is "done" — the headline features are unverified.**

| | Criterion | Status |
|---|---|---|
| ✅ | `npm run lint` | Clean |
| ✅ | `npm run build` | Clean |
| ✅ | `node --check backend/services/h3Binner.js` | Clean |
| ✅ | e2e on Playwright `baseURL`, no manual Vite server | 6/6 + 8/8 pass |
| ⚠️ | Storyteller walkthrough Ch1→4 | Narrative content + Ch2→CHVA activation verified. **flyTo camera motion and chart brush-range updates never observed.** |
| ⚠️ | Ch2 loads all 111 features, CHVA layer visible | Endpoint verified (111 confirmed, matches spec). **Map layer visibility not asserted.** |
| ⚠️ | Every dynamic layer button shows layer + legend | 2 of 4 layers; legend only, not layer |
| ⚠️ | Provenance badges visible | Panel renders; footer text never asserted |
| ❌ | **Chart→map brushing illuminates features <16ms** | **Not verified — task 12.3** |
| ❌ | **Map→chart hover highlights dot + tooltip** | **Not verified — task 12.3** |
| ❌ | Antimeridian H3 rendering (no tearing) | Never visually inspected |
| ❌ | Assert brush calls `setFeatureState`, then clears | Not written — task 12.3 |
| ❌ | Assert map hover/click updates chart mark | Not written — task 12.3 |

**What is defensible:** four defects were found and fixed that would each have
*independently* prevented bi-directional brushing from working, and the fixes are
test-backed at the DOM level. **What is not:** nobody has observed a map feature change
colour from a chart drag. The `<16ms` performance claim in `tests.md` and the proposal
has never been measured at all.

---

## Part 5 — Environment facts you will need

- **No `tsc` in this project.** `typescript` is not installed; `npm run build` uses
  esbuild and **does not type-check**. Type errors (e.g. the `MapLayer` union) will not
  fail the build. `npm run lint` catches some but not all.
- **Playwright spawns both servers itself** (`frontend/playwright.config.ts`): Vite on
  `5173` (`baseURL`), backend on `8000`, both `reuseExistingServer: true`. Do not start
  them manually. The endpoint test hardcodes `http://localhost:8000` because `baseURL` is
  the frontend — fine, but it is coupled to that config.
- **`data/layers/CHVADataSeperatedCoordinatesFile.csv` is UNTRACKED.** The endpoint works
  locally but returns 503 on a fresh clone or in CI, which will also fail the new endpoint
  test. Either commit the CSV or document `CHVA_FACILITIES_PATH`. Resolution paths are in
  `backend/server.js:140-146`.
- **Pre-existing failures — not yours.** `e2e/spatial-query.spec.ts` has 2 failing tests
  (`activates draw mode…`, `spatial query flow…`), both timing out on
  `getByText("Draw for Spatial Query")`. **Confirmed pre-existing by stashing all
  frontend changes and re-running against `042e5e5` — they fail identically.**
  **Root cause found:** the label exists at `DrawControls.tsx:69`, but `DrawControls` is
  **imported and rendered nowhere in `frontend/src`** — it is orphaned dead code, almost
  certainly stranded by `04cd9f1` ("remove auxiliary chatbot sidebar"). Fixing it means
  re-mounting the component, which is a product decision (does draw mode still belong in
  the full-screen map UI?), not a test fix. Separate issue — but note this also means
  `window.__mapboxMap` is never set, which blocks tasks 12.2 and 12.3.

### Commands

```bash
cd frontend
npm run lint                                              # clean
npm run build                                             # clean, but NOT a type-check
npm run test:e2e -- e2e/storyteller_brushing_deck.spec.ts  # 6/6
npm run test:e2e -- e2e/test_dynamic_map_layers.spec.ts    # 8/8
npm run test:e2e -- e2e/spatial-query.spec.ts              # 2 fail, pre-existing
node --check ../backend/services/h3Binner.js
```

---

## Part 6 — Known-imperfect, deliberately unchanged (get a decision before "fixing")

1. **The two brushes clobber each other.** Scatter `d3.brush` and histogram `d3.brushX`
   both overwrite `selectedIds` wholesale, and neither clears the other's selection
   rectangle. Functional but confusing. Needs a product decision: intersect, replace, or
   mutually exclusive?
2. **The histogram sets `selectedIds`, not `brushRange`.** The prior plan expected it to
   compute `tempMin`/`tempMax` into `setBrushRange`. Current behaviour (direct selection)
   is defensible. Flagging the divergence rather than guessing intent.
3. **`LinkedRiskCharts` renders `SAMPLE_DATA`, not live CHVA data.** The 12 hard-coded
   points use real `chva-N` IDs, so brushing genuinely targets real map features — but
   `temp`/`exposure` are mock. `tests.md` does not require live chart data; the proposal
   arguably implies it. Separate task if wanted.
4. **`useBrushingState.source` is written and never read** — see task 10.3 above.
