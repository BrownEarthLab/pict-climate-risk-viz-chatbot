## Why

The v1 brushing visualization was superseded on 2026-07-30 after a PI redirect, and the
post-mortem (`docs/brushing-viz-retrospective.md`) found its headline feature was never
observed working — 13 DOM tests passed while the map rendered no custom layers at all.
Rather than resume that work, the lab notes point at a different center of gravity: a
scrollytelling piece built around **bivariate choropleth encoding**, where the legend is
itself the primary interactive control and only one attribute is shown at a time.

This direction is chosen now because it is the only one whose data is entirely on disk
today (verified — `docs/v2-direction-research.md` §3a), and a reviewable prototype is due
~2026-08-06. The two alternatives considered both stall on data acquisition before
anything renders.

### Provenance of this proposal

Every claim below traces to a committed document. Read these before implementing; they
exist so the reasoning does not have to be re-derived.

| Document | What it establishes | Commit |
| :--- | :--- | :--- |
| `docs/brushing-viz-retrospective.md` | Why v1 failed; which assets survive; seven guardrails | `7d45ebf`, `a4badf5` |
| `docs/v2-direction-research.md` | Three directions costed; §2 granularity constraint; §3a verified data inventory | `0edc66d`, `b027fb3` |
| `docs/v2-plan-appraisal.md` | Why the externally-supplied v2 plan is not implementable | `0c8da5e` |
| `docs/v2-reference-implementations.md` | Architecture of the winning entry; licensing | `5321bbf` |
| `openspec/changes/archive/2026-07-30-pacific-climate-brushing-viz/` | The superseded v1 change, frozen | `7d45ebf` |

## What Changes

**Frontend — new visualization layer**

- Add a **bivariate choropleth encoding** with three selectable modes, matching the three
  variants named in the lab notes: sequential–sequential, diverging–diverging (center =
  the norm), and qualitative–sequential.
- Add an **interactive 3×3 bivariate legend that is the primary brush control**. Clicking
  or hovering a legend cell filters the map and every linked chart. This is the notes'
  "bivariate legend is brush and linked to the chart itself."
- Add a **scrollytelling frame** that advances one encoding at a time rather than
  stacking layers, per the notes' "focus on one feature/attribute at a time so the viewer
  doesn't get distracted by overlapping layers on the same map."
- Add a **minimal splash screen** and a **search control** that brushes a country or
  province across map and charts.
- Add **linked distribution charts** (histogram + box plot) rendered beside the map, not
  on it — per the notes' "map analysis should not be displayed on the map itself."
- Add **HTML tooltips fed by typed interaction state**, never by raw feature properties,
  so no developer-facing attribute slugs reach the UI.

**Frontend — architecture change (BREAKING relative to v1's approach)**

- **BREAKING**: charts are rendered by React from D3-computed scales. `d3-selection` and
  `d3-brush` are **not** reintroduced. v1's imperative `svg.selectAll("*").remove()`
  pattern is prohibited. Rationale and evidence: `docs/v2-reference-implementations.md`
  §2 — the winning entry's `src/` tree contains zero uses of `d3-selection`, `d3-brush`,
  `selectAll`, or an SVG ref, and that architecture cannot express the v1 defect.
- Add `typescript` as a devDependency and a `tsc --noEmit` check. The project currently
  has **no type checking at all** — `npm run build` uses esbuild.

**Backend — carry forward v1's surviving half**

- Cherry-pick `5cd3c20`: the `backend/services/h3Binner.js` land-mask filter and refinements, the CHVA
  facility route and CSV, and `backend/tests/test_h3_antimeridian_wrap.py`. Verified
  absent from this branch (`docs/v2-plan-appraisal.md` §8). The basic antimeridian wrap
  is already present; the land mask and CHVA layer are not.

**Explicitly out of scope for this change**

- **Emerging hotspot analysis / Getis-Ord Gi\***. Blocked on two verified data facts: the
  heat layer is a single period (2050s, one model), so no space-time cube can be built
  from it; and PICT country-level granularity cannot support a defensible spatial weights
  matrix. See `docs/v2-direction-research.md` §2 and §3a.
- **Tuberculosis linkage and Nightingale rose charts**. Blocked on the same open
  question — whether TB data exists below national level. If it is one value per country
  per year, every Fiji tikina shares a value and the interaction has nothing to drive.
- **Synthetic health data of any kind.** The externally-supplied plan proposed generating
  tuberculosis series for named Pacific territories and rendering them under real ESRI
  category names. This is prohibited in this change. See `docs/v2-plan-appraisal.md` §6.
- **Sub-national population encodings.** Country-level population **is** available —
  `POP_EST` / `POP_YEAR` on `data/reference/_ne_10m_admin_0_map_units.geojson`, 30
  Pacific-subregion features, 2019, joinable to `data/reference/pict_regions.geojson` on ISO3. So a
  country-scale population pair is **in scope** and listed under Impact. What remains out
  of scope is any population encoding below country level, and any population *time
  series* — neither exists. If an official SPC/PDH figure is required rather than a
  Natural Earth estimate, that is an SDMX flow addition and a separate change.

## Capabilities

### New Capabilities

- `bivariate-choropleth-encoding`: Three-mode bivariate classification and color
  assignment (sequential–sequential, diverging–diverging with a defined norm center,
  qualitative–sequential), including the class-break derivation and the accessibility
  constraints the palette must satisfy.
- `bivariate-legend-brushing`: The 3×3 legend as an interactive control — cell hover and
  selection filtering the map layer and all linked charts, and the identity contract that
  makes cross-view linking possible.
- `scrollytelling-narrative-frame`: Splash screen, ordered chapters that swap a single
  encoding at a time, search-driven region brushing, and the free-exploration exit.

### Modified Capabilities

- `spatial-map-viz`: Map layer registration moves from the `load` event to `style.load`,
  and layer visibility becomes independently assertable. v1 shipped a state where React
  believed a layer was active while the Mapbox layer remained at `visibility: "none"` —
  this capability's requirements must state that map state, not React state, is
  authoritative.

## Impact

**Affected code**

- `frontend/src/components/viz/` — new directory for chart components.
- `frontend/src/components/story/` — new directory; does not currently exist.
- `frontend/src/hooks/useMapbox.ts` — `style.load` registration, idempotent setup, map
  handle exposure for tests.
- `frontend/src/components/map/MapCanvas.tsx` — bivariate layer integration (2581 lines
  on this branch; note that any plan citing line numbers above that is describing the
  archived branch).
- `backend/services/h3Binner.js`, `backend/server.js`, `data/layers/` — via the `5cd3c20`
  cherry-pick.

**Dependencies added**

- `d3-scale`, `d3-shape`, `d3-array` (computation only). **Not** `d3-selection`, **not**
  `d3-brush`.
- `typescript` (devDependency) for `tsc --noEmit`.

**Data consumed** (all verified present — `docs/v2-direction-research.md` §3a)

- `data/climate/processed/fiji_extreme_heat_days_2050s_ssp245_access_cm2.geojson` — 102
  cells with `_mean` / `_min` / `_max`.
- `data/reference/pict_regions.geojson` — 26 features with `region_group`, `subregion`.
- `data/reference/_ne_10m_admin_0_map_units.geojson` — `POP_EST` / `POP_YEAR`, 30
  Pacific-subregion features (2019). Country level only; joins on ISO3, with name-based
  fallback for the entries carrying `ISO_A3 = -99`.
- `data/reference/fiji_tikina.geojson` — 86 polygons.
- SDMX cache — sea level anomaly, power generation, safe water access (country level).

**Systems unaffected**

- The chatbot API, `/api/spatial-query`, `/api/interpret-results`, and the Python
  geospatial tool registry (`backend/tools/`) are untouched by this change.

**Licensing constraint**

- `holtzy/pacific-challenge` has **no license file** (verified via GitHub API) and is
  therefore all-rights-reserved. Its architecture may be adopted; its source must not be
  copied. `holtzy/D3-graph-gallery` is MIT and may be used with attribution.
