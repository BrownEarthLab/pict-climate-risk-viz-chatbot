# Retrospective: Pacific Climate Brushing & Linking Viz (v1)

**Status:** superseded — direction changed after PI meeting, 2026-07-30. Not shipped.
**Branch:** `feature/pacific-climate-brushing-viz` (kept as reference, do not delete)
**OpenSpec change:** `pacific-climate-brushing-viz`
**Purpose of this document:** carry forward what was learned so v2 planning does not
re-derive it. Companion to `docs/brushing-viz-debug-findings.md`, which is the
line-by-line technical record; this document is the judgement layer on top of it.

---

## 1. What actually worked, and is worth reusing

These are direction-independent. Any Pacific climate viz, whatever its interaction
model, will need most of them.

### 1.1 Antimeridian longitude wrapping in `backend/services/h3Binner.js`
Centroid-relative wrapping (`if (lng - centerLng > 180) wrappedLng -= 360; else if
(lng - centerLng < -180) wrappedLng += 360`) in `cellIndexToFeature`.

This is the single most reusable thing produced. Fiji and Kiribati straddle 180°, and
the CHVA dataset itself has longitudes running to **181.75** — every Pacific-region
polygon layer will tear without this. It is non-obvious, cheap, and has no dependency
on the viz direction. **Port it to v2 verbatim.**

### 1.2 H3 land-mask by centroid-in-source-polygon
Sea-level cells are emitted only when the H3 centroid falls inside the source land
polygon, so coastal cells that merely *intersect* land don't render over open water.
Same category as 1.1: a general Pacific-geometry correction, not a feature.

### 1.3 The CHVA facility data path
`backend/server.js` → `loadChvaFacilities()` → `/api/layers/chva_facilities`, serving
111 Fiji healthcare facilities as GeoJSON with a stable `chva-N` identity emitted
identically as both `feature.id` and `properties.facility_id`. Verified live at HTTP
200 with 111 features; the source CSV is now tracked in the repo, so this reproduces on
a fresh clone.

**The identity contract is the reusable part**, more than the route. Having one ID that
is simultaneously the Mapbox feature id, the `promoteId` value, and the chart record key
is what makes any cross-view linking possible at all. Decide this *first* in v2, before
writing either the map or the charts.

### 1.4 The Mapbox `feature-state` paint pattern
`useMapbox.ts` lines ~142–187 are a working reference for making `setFeatureState`
actually visible — `feature-state` branches wired into `circle-radius`,
`circle-opacity`, `circle-stroke-color`, `circle-stroke-width`, with the `interpolate`
on `["zoom"]` kept outermost and the `case` nested inside each zoom stop.

### 1.5 Playwright dual-server config
`frontend/playwright.config.ts` starts Vite (5173, `baseURL`) and the backend (8000)
itself with `reuseExistingServer: true`. This worked well and removed a whole class of
"which port is the test hitting" problems. Keep the shape.

### 1.6 Provenance-badge discipline
Every layer, chart, and tooltip carries an explicit SPC / Pacific Data Hub citation.
This cost almost nothing and is the kind of thing a judging panel or a reviewer notices.
It is also entirely independent of what the viz *shows*. Keep it as a standing rule.

---

## 2. The lessons that should change how v2 is planned

These matter more than the code. Each is stated as what happened, then what to do
differently.

### 2.1 A fully green test suite coexisted with a map that rendered nothing
**What happened.** 13 Playwright tests passed. At the same time, `map.getSource(...)`
returned nothing for *every* custom layer — `chva-facilities`, `climate-temp`,
`sea-level-h3`, `power-gen-fill` — because the layer-setup callback registered on
`map.on("load")` never fired. The tests passed because they asserted on the DOM: legend
text, button labels, React state. React state said "the sea-level layer is active" and
the legend dutifully rendered, while the map itself was a bare basemap.

**Why this is the headline lesson.** For a visualization, the DOM is a *proxy* for the
thing you care about, and the proxy can be 100% green while the artifact is blank. This
is not a testing-effort problem — more DOM tests would not have caught it.

**For v2:**
- Write a **"does anything actually render"** smoke test on day one, before any feature:
  assert `map.getSource(id)` exists, `map.getLayoutProperty(layerId, "visibility")` is
  `visible`, and `map.querySourceFeatures(id).length > 0`.
- Any assertion about a map behaviour must read **map state**, not React state:
  `getFeatureState`, `getLayoutProperty`, `querySourceFeatures`, canvas pixels.
- Treat "React thinks the layer is on" and "the layer is on" as two different claims
  that each need their own assertion.

### 2.2 Only 4 of 13 declared success criteria were ever empirically verified
And all four were hygiene: `npm run lint`, `npm run build`, `node --check
h3Binner.js`, and "e2e runs on the configured baseURL". The headline claims — chart→map
brushing illuminating features, map→chart hover linking, **sub-16ms GPU updates** — were
never observed by anyone, and the 16ms figure was never measured a single time. Yet
`tasks.md` was fully checked.

**For v2:** at proposal time, every success criterion must name **the command or the
observation that settles it**. If a criterion cannot be settled by a command, it is a
manual-verification item and must be labelled as one with a named owner. A checkbox
should mean "the named verification ran and passed," never "I wrote the code."

Specifically: do not put a performance number (`<16ms`, `60fps`) in a spec unless the
plan also says how it gets measured. Otherwise it is decoration.

### 2.3 The failures were silent by construction
Three separate silent-failure modes, all of which cost real time:

1. **Mapbox `addLayer` validation errors abort every subsequently registered layer.** A
   `["zoom"]` nested inside a `case` throws during `addLayer` — and every layer after it
   in the same setup function is silently skipped. You get a blank map and one console
   line, not a build failure.
2. **There is no `tsc` in this project.** `typescript` is not installed and `npm run
   build` uses esbuild, which does not type-check. Widening the `MapLayer` union was
   never verified by anything. `npm run lint` catches some of this, not all.
3. **`map.on("load")` waits for the style *and* the initial tile set.** A slow or
   blocked tile means the callback never fires, so nothing is ever added, with zero
   errors thrown. The fix — `map.once("style.load", setupLayers)` plus an
   `isStyleLoaded()` fast path — is on the branch, uncommitted at time of writing.

**For v2:**
- Install `typescript` and run `tsc --noEmit` in the check script. This is a one-line
  fix for a whole category of undetected breakage.
- Register map sources/layers on `style.load`, never `load`, and make the setup function
  idempotent.
- Wrap layer registration so a throw is surfaced loudly rather than swallowed — and
  consider registering each layer independently so one bad paint expression cannot take
  the rest down.

### 2.4 Four independent defects each individually sufficient to break the feature
Bi-directional brushing was broken by, simultaneously: (a) the whole controls section
being nested inside a `manual_heat_risk` conditional so legends and charts only mounted
in one mode; (b) an unstable inline callback identity that made a child effect re-apply
the story preset every render, so manual layer selection was impossible; (c) CHVA paint
properties not referencing `feature-state` at all, making every `setFeatureState` call a
visual no-op; (d) the D3 brush destroying its own `<g class="brush">` mid-drag. All four
had to be fixed before *anything* was observable.

**For v2:** an interaction chain with N links fails silently and indistinguishably at
every link. Build it one link at a time with a check at each hop — data reaches the
source; the source has features; the feature-state write lands; the paint expression
reads it; the visual changes — rather than wiring the whole chain and then debugging the
end-to-end symptom.

### 2.5 The React ↔ D3 lifecycle conflict is architectural, not incidental
The scatter effect called `svg.selectAll("*").remove()` and listed `selectedIds` /
`hoveredId` in its dependency array. So: drag the brush → brush event → state update →
effect re-runs → **the element being dragged is removed from the DOM** → gesture aborts.
Hovering failed identically (circle destroyed, `mouseleave` never fires).

The fix is a general pattern and should be a standing rule in v2:

> **Split the D3 effect in two.** A *build* effect that creates the DOM, keyed only on
> stable inputs (data, `useCallback`-stable handlers). An *in-place restyle* effect
> keyed on the interaction state, which only sets attributes and never removes nodes.
> Append brush overlays *before* the marks so the overlay does not swallow per-mark
> hover.

Related and equally general: **any callback passed into a child that lists it in an
effect dependency array must be `useCallback`-stable.** An inline arrow there is not a
style nit — it silently re-runs the child's effect on every parent render.

### 2.6 Diagnostic documents go stale within one commit
The diagnostic plan that opened this work was wrong on **6 of 7 root causes** — the
backend route existed, `promoteId` was set, the handlers existed, the IDs were already
aligned, the state cleanup existed, the story controls existed. The symptoms were all
real; the causes were not. The plan had been written against a commit, not against the
working tree, and the tree had moved.

**For v2:** any diagnosis — human or agent — must state the exact tree state it was
derived from (commit SHA *and* whether the working tree was dirty), and must be
re-verified against current state before anything is acted on. Cheap to do, and it would
have saved most of a session here.

### 2.7 Dead code left by a refactor becomes a permanent test failure
`DrawControls.tsx` is imported and rendered nowhere in `frontend/src` — almost certainly
stranded by `04cd9f1` ("remove auxiliary chatbot sidebar"). Consequences: two
permanently failing tests in `spatial-query.spec.ts`, and `window.__mapboxMap` never
being set at runtime, which blocked the GPU-brushing tests that needed a map handle.

**For v2:** when a refactor removes a mount point, delete the component or re-mount it
in the same commit. A component with no importer is a latent failure, not neutral.

### 2.8 The change bundled fragile and durable work together
One change carried: a narrative deck, bi-directional brushing, provenance badges, the
antimeridian fix, and a new facility layer. The **data-pipeline half landed cleanly and
is still valuable today** (§1.1–1.3). The **interaction half is what failed**, and it
dragged the perceived status of the whole change down with it.

**For v2:** separate data/geometry work (deterministic, testable headlessly, durable
across direction changes) from interaction work (fragile, needs visual verification,
direction-dependent) into different changes. The first kind survives a pivot. The second
kind is what you just lost.

---

## 3. What is direction-dependent and should *not* be carried forward uncritically

- **The 4-chapter storyteller deck.** The narrative framing ("Rising Tides, Heat & Human
  Resilience") is a product decision that the PI has now redirected. The *mechanism* —
  chapter presets driving camera + layer + chart filter together — is reusable if the
  new direction still wants guided narration. Keep the mechanism, drop the script.
- **Bi-directional brushing itself.** Worth being honest: it was never observed working.
  Do not carry forward the assumption that it is "almost done."
- **`SAMPLE_DATA` in `LinkedRiskCharts`.** The 12 hard-coded points use real `chva-N`
  IDs, so brushing genuinely targeted real map features — but `temp` / `exposure` are
  mock. Any v2 chart work starts from live data or it will repeat this.
- **`useBrushingState.source`.** The `"MAP" | "CHART" | "STORY"` attribution field is
  written by every setter and **read by nothing**. The loop it was designed to prevent
  never materialised. If v2 wants cross-view linking, decide up front whether source
  attribution is actually needed or whether idempotent updates suffice — do not port the
  field reflexively.
- **The two brushes clobbering each other.** The scatter `d3.brush` and histogram
  `d3.brushX` both overwrite `selectedIds` wholesale and neither clears the other's
  rectangle. This was left unresolved because it needs a product decision (intersect,
  replace, or mutually exclusive). If v2 has more than one brushable view, decide this
  in the proposal, not in the implementation.

---

## 4. Open questions worth resolving in v2 planning

1. Does the new direction still need cross-view linking at all? If not, most of §2.4–2.5
   becomes irrelevant and the reusable set collapses to §1.1–1.3 plus §1.6.
2. Is the map still the primary view, or does the pivot demote it? That determines
   whether the Mapbox-specific lessons (§2.1, §2.3) stay load-bearing.
3. Should the CHVA facility dataset remain in scope? The data path is built and working
   — it is the cheapest asset to keep.
4. Was `<16ms` / 60fps ever a real requirement, or inherited from the competition brief?
   If real, v2 needs a measurement method in the proposal.

---

## 5. Pointers

| Thing | Where |
| :--- | :--- |
| Line-by-line technical record, all 7 patches, verification matrix | `docs/brushing-viz-debug-findings.md` |
| Original proposal, architecture, tasks, tests | `openspec/changes/archive/…-pacific-climate-brushing-viz/` |
| Antimeridian + land-mask logic | `backend/services/h3Binner.js` |
| CHVA route and loader | `backend/server.js` (route ~4890, paths ~140–146) |
| `feature-state` paint reference | `frontend/src/hooks/useMapbox.ts` ~142–187 |
| React/D3 split-effect pattern | `frontend/src/components/map/LinkedRiskCharts.tsx` |
| Brushing state hook | `frontend/src/state/useBrushingState.ts` (85 lines) |

**Caveat on `docs/brushing-viz-debug-findings.md`:** two of its Part 5 environment notes
are now out of date. The CHVA CSV *is* tracked (it says untracked), and the
`map.on("load")` → `style.load` fix has since been applied on the branch. Everything
else in it still holds.
