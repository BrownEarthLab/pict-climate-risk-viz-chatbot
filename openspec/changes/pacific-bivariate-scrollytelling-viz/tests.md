## Automated Tests

Every criterion below names the command that settles it. This is a direct response to
`docs/brushing-viz-retrospective.md` §2.2, where v1 declared 13 criteria, empirically
verified 4, and marked every task complete regardless.

**Standing rule for this change: a test that asserts only on the DOM does not count as
evidence that a map behaviour works.** v1 ended with 13 DOM tests green while
`getLayoutProperty("sea-level-h3-layer", "visibility")` returned `"none"`. Assertions
about the map must query the map.

### Build and type integrity

- `cd frontend && npm run lint`: no lint or React-hook errors.
- `cd frontend && npx tsc --noEmit`: **no type errors.** This command does not currently
  run — `typescript` must be installed as part of this change. Until it does, no type
  claim in this change is verified.
- `cd frontend && npm run build`: production bundle succeeds. Note this uses esbuild and
  is **not** a type check; it does not substitute for the above.
- `node --check backend/services/h3Binner.js`: parses after the `5cd3c20` cherry-pick.
- `cd backend && python3 -m pytest tests/ -q`: the existing 19-file geospatial suite still
  passes, including `test_h3_antimeridian_wrap.py` once carried across.

### Map state — the smoke test that must exist first

- `npm run test:e2e -- e2e/map_state_smoke.spec.ts`:
  - every declared custom source is retrievable via `getSource` after style load;
  - the active thematic layer reports layout visibility `visible`;
  - `querySourceFeatures` returns a non-zero count for the active source;
  - the map instance is reachable from the browser context for later assertions.
  - *Edge case:* passes on a cold load with no user interaction, since v1's failure
    occurred before any interaction took place.

### Bivariate encoding

- `npm run test:e2e -- e2e/bivariate_encoding.spec.ts`:
  - switching modes rebuilds the fill paint and leaves exactly one bivariate fill layer
    visible, with all others at `none`;
  - a feature's assigned class is unchanged after panning and zooming — the declared norm
    does not drift with the viewport;
  - a dataset definition pairing variables of differing declared scale is rejected at load
    with an error naming both scales;
  - break values and units are present in the rendered legend.
- `npm run test:palette` (or a pytest/node equivalent) — thresholds fixed by
  `architecture.md` Decision 4b:
  - every pair of cells **adjacent** in the 3×3 matrix has **ΔE00 (CIEDE2000) ≥ 10** in
    sRGB. Note this is a *perceptual difference* metric — **not** WCAG contrast ratio,
    which is a luminance measure for text on a background and gives the wrong answer for
    two map fills at equal lightness;
  - the same adjacency check passes under a **deuteranopia simulation**;
  - non-adjacent pairs (opposite corners) are exempt — the matrix is a continuum and
    forcing all 36 pairs apart over-constrains the palette;
  - *this must fail the run on violation, not warn.* See `docs/v2-plan-appraisal.md` §5.
  - WCAG contrast still applies to any **text drawn over** a fill; that is a separate
    check on a different pair of colours.
- Classification behaviour (`architecture.md` Decision 4a) — method follows from mode, not
  from the dataset:
  - `sequential-sequential` uses quantile breaks, and **every one of the nine legend cells
    has at least one member**, since an empty cell is a dead brush control;
  - `diverging-diverging` places breaks symmetrically about the declared norm, and a
    feature exactly at the norm classifies to the center band — verified with sea level
    anomaly, whose norm is `0`;
  - a distribution that cannot be split into tertiles (heavy ties) fails loudly at
    classification rather than yielding an empty cell.

### Legend brushing and linking

- `npm run test:e2e -- e2e/legend_brushing.spec.ts`:
  - selecting a legend cell sets `getFeatureState(...).highlighted === true` for a feature
    in that class — asserted through the map, not through CSS;
  - clearing the selection removes that state for every feature;
  - re-selecting the active cell clears rather than re-applies;
  - the bivariate fill layer's paint references `["feature-state", ...]`, so the state
    write is not a visual no-op (v1's Patch 3 failure);
  - the same identifier string resolves a map feature and its chart mark;
  - searching a known region selects it in both views; an unknown region reports no match
    and leaves the existing selection intact.

### Scrollytelling frame

- `npm run test:e2e -- e2e/narrative_frame.spec.ts`:
  - advancing a chapter leaves exactly one thematic layer visible and sets the previous
    one to `none`;
  - re-entering a chapter reapplies its encoding, camera, and legend mode;
  - the splash view renders before the control surface and is dismissed on entry;
  - free exploration clears chapter filters while leaving legend and search operable;
  - **a manual legend selection survives an unrelated parent re-render** — the direct
    regression test for v1's Patch 2, where an unstable callback identity reset the active
    layer on every render.

### Regression guards carried from v1

- **Three pre-existing failures in the legacy workspace, confirmed 2026-07-31.** All
  three predate this change and none is caused by it. The legacy analysis workspace moved
  from `/` to `/#workspace` (App.jsx hash route), so these specs were retargeted; that
  fixed one of four, leaving:
  - `e2e/spatial-query.spec.ts` × 2 — `DrawControls` is imported nowhere in
    `frontend/src`, so "Draw for Spatial Query" never renders. Stranded by `04cd9f1`.
  - `e2e/test_dynamic_map_layers.spec.ts` "clicking Sea Level Rise… triggers layer
    toggle" — **v1's Patch 1, never carried to this branch.** `MapCanvas.tsx:2083` opens
    `{currentActiveLayer === "manual_heat_risk" && (`, and the Dynamic Datasets section
    (~2471) and Sea Level Anomaly legend (~2513) are nested inside it. Clicking a dynamic
    layer sets `activeLayer` away from `manual_heat_risk`, unmounting the legend the click
    should reveal. Fixed on the archived branch in `164a59e`; only `5cd3c20` (the backend
    half) was cherry-picked here.

  Do not report a pass that was never true. Fixing either is legacy-workspace work,
  outside this change's scope.
- Grep guard: `d3-selection` and `d3-brush` appear in neither `frontend/package.json` nor any
  import in `frontend/src`. Enforces Decision 1 mechanically rather than by convention.

## Manual Verification

- **Cold load renders actual geometry**:
  - **WHEN** the app is loaded fresh with an empty cache and the first chapter is entered
  - **THEN** thematic polygons are visibly drawn on the map — not a bare basemap with a
    populated legend, which is precisely the state v1 shipped

- **Bivariate legend reads as a control, not an ornament**:
  - **WHEN** the reader hovers and then clicks a legend cell
  - **THEN** the cell shows a hover affordance, the map de-emphasises everything outside
    that class, and the linked charts visibly partition into selected and unselected

- **Diverging mode centers on the norm**:
  - **WHEN** `diverging-diverging` mode is active over sea level anomaly
  - **THEN** features at zero anomaly render in the center band, and the legend labels the
    center cell as the norm with its value shown

- **One attribute at a time**:
  - **WHEN** the reader advances through every chapter in sequence
  - **THEN** at no point are two thematic encodings visible simultaneously

- **Tooltips are readable**:
  - **WHEN** the reader hovers any feature in any chapter
  - **THEN** the tooltip shows labelled values with units and a source attribution, and no
    raw property key such as `extreme_heat_days_mean` or `shapeISO` is visible anywhere

- **Antimeridian rendering**:
  - **WHEN** the map is panned across 180° longitude with a Pacific-wide layer active
  - **THEN** no polygon tears or stretches across the world. *Never visually inspected in
    v1 despite the fix being implemented* — carry it forward as an open item, not a
    settled one

- **Splash screen restraint**:
  - **WHEN** the app first paints
  - **THEN** the reader sees a title, one sentence of framing, the search control, and one
    entry point — and does not see the layer control surface

- **Removal test** (from the lab notes: *"what happens when I remove a component?"*):
  - **WHEN** each visible component is hidden in turn via devtools
  - **THEN** its absence is noticeably worse — anything whose removal is not missed should
    be cut before review

### Explicitly not claimed by this change

- No performance figure is asserted. v1's proposal and tests claimed sub-16ms GPU updates
  and 60fps brushing; **neither was ever measured**. This change makes no such claim, and
  none may be added without a stated measurement method in this file first.
- No emerging-hotspot, tuberculosis, or population criterion appears here, because none of
  that is in scope. See `architecture.md` Decisions 6 and 7.
