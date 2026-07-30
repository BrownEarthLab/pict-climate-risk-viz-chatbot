# v2 Direction Research — Pacific Climate Data Viz

**Date:** 2026-07-30
**Inputs:** lab notes (7/23 + 7/30 PI meeting), `docs/brushing-viz-retrospective.md`,
inventory of the existing codebase, ESRI emerging-hotspot reference.
**Hard deadline in the notes:** prototype for review by ~2026-08-06.
**Status:** research for planning. No implementation.

---

## 1. What we can actually reuse

This is the binding constraint, so it comes first. The inventory is stronger than the v1
post-mortem suggests — almost none of what failed in v1 was the data layer.

### Reusable with no changes

| Asset | Where | Why it matters for v2 |
| :--- | :--- | :--- |
| **Python geospatial tool registry** — 13 JSON-schema'd tools over `geopandas` | `backend/tools/geospatial/`, `backend/tools/schemas/` | `statistics.py`, `temporal.py`, `extremes.py`, `aggregation.py`, `exposure.py` are exactly the primitives an emerging-hotspot pipeline needs. **This is the single most valuable asset and it is entirely direction-independent.** |
| **Climate layer registry with uncertainty columns** | `data/layers/climate_layer_registry.json` | Already carries `uncertainty_columns: [..._min, ..._max]` alongside `_mean`. The notes' "click a feature → mean, box plot, how uncertainty changes" is **already backed by data on disk**. |
| **NEX-GDDP-CMIP6 processing pipeline** | `backend/scripts/build_climate_layer_from_nex.py` | Produces gridded per-year climate layers. This is what a space-time cube needs as input. |
| **SDMX client + disk cache** | `backend/services/sdmxApiClient.js`, `data/cache/sdmx/` | 3 PDH flows wired (sea level, power gen, water access); adding a flow is a config entry. Includes a hard-won workaround (`node:https` over HTTP/1.1 — the dissemination host 500s on undici's HTTP/2). |
| **Reference geometries** | `data/reference/` | `fiji_admin_adm1`, `adm2`, `fiji_tikina`, `pict_regions`. The tikina layer is the key one — see §3. |
| **H3 binning with antimeridian wrap + land mask** | `backend/services/h3Binner.js` | Non-obvious and Pacific-specific. Reuse verbatim. |
| **Climate catalog** (indices, thresholds, sources) | `data/catalog/` | Metric definitions, time windows (yearly / 5-year / decade), threshold semantics. Directly reusable for a time-binned analysis. |
| **CHVA facilities** (111, stable `chva-N` ids) | `backend/server.js` | Optional but cheap to keep. |
| **Playwright dual-server harness** | `frontend/playwright.config.ts` | Keep the shape; see §5 for what to assert differently. |

### Reusable as *pattern*, not code

- The **Mapbox `promoteId` + `setFeatureState` identity contract** and the paint
  expressions that make feature-state visible (`useMapbox.ts` on the archived branch).
  The pattern is sound; the v1 wiring around it was not.
- The **split build/restyle D3 effect** rule from the retrospective.

### Not currently present on this branch

- **D3 is not in `frontend/package.json`.** It was added only on
  `feature/pacific-climate-brushing-viz`. v2 starts without it.
- No spatial-statistics library (`esda` / `libpysal` / `pysal`) in the Python stack.
  Emerging hotspot analysis needs one, or needs the student's notebook.
- No space-time cube representation anywhere.

---

## 2. The central tension in the notes

Two statements in the notes are in direct conflict, and everything else depends on how
it's resolved:

> "Space time cluster emerging hotspot with heat → brushed and linked with tuberculosis data"

> "We're limited by granularity of data which is on the country level"

**Emerging hotspot analysis does not work at PICT country level.** Getis-Ord Gi* — the
statistic underneath it — classifies a location by comparing it to its *spatial
neighbours*. There are roughly 20 PICTs, separated by thousands of kilometres of ocean.
Any spatial weights matrix over them is either near-empty (distance band) or arbitrary
(KNN across open ocean). With n≈20 you also have almost no power after the FDR
correction the method applies. You would get a map of "no pattern detected" and a
statistic that does not mean what the legend claims.

Worth knowing before scoping: ESRI's method produces **16 categories**, not the three in
the notes. The notes list New, Persistent, and Historical; the full set adds Consecutive,
Intensifying, Diminishing, Sporadic, and Oscillating, each mirrored for cold spots, plus
"no pattern detected." It needs a space-time netCDF cube, a neighbourhood distance, a
time-step interval, and it runs Gi* per bin plus a **Mann-Kendall trend test** to
separate Intensifying from Persistent from Diminishing.

**The resolution is a division of labour, and it is already implied by another note:**

> "Map analysis should not be displayed on the map itself (just the climate stressor)"

So:

- **Heat is gridded** (NEX-GDDP is 0.25°, and there is tikina-level Fiji geometry). It
  supports a real space-time cube and a defensible EHSA — *within Fiji*, at tikina
  level, where n is in the dozens-to-hundreds and neighbours are genuinely adjacent.
- **Tuberculosis is country-level.** It is not a hotspot candidate. It belongs in the
  **linked non-spatial views** — the rose chart, the box plots, the distribution panel.

That is not a compromise; it is the honest reading, and it satisfies the notes better
than forcing both onto the map would. It also matches the winners' pattern the notes
admire: map carries one stressor, analysis lives beside it.

---

## 3. Three directions

Each reuses the same backend. They differ in where the intellectual weight sits.

### Direction A — "Where heat is emerging, and who is already sick"

**Center of gravity:** the space-time emerging hotspot analysis.

Map shows Fiji tikina-level heat with EHSA categories as the single stressor layer.
Brushing a hotspot category (or a region) drives a rose/Nightingale chart of TB burden
and a box-plot panel showing the distribution and its uncertainty band. The bivariate
legend is itself the brush control.

- **Reuses:** the whole Python tool registry, tikina geometry, NEX-GDDP pipeline,
  uncertainty columns, H3 binning.
- **New work:** space-time cube construction, `esda`-based Gi* + Mann-Kendall (or port
  the student's notebook), a category → color scheme for 8–16 classes, TB data
  acquisition and country↔tikina reconciliation.
- **Biggest risk:** **the TB data.** It is not in the repo, its granularity is
  country-level, and Fiji-only TB time series at sufficient temporal depth may not
  exist. If TB is one number per country per year, the rose chart has ~20 petals × N
  years and the "brush a tikina → see TB change" interaction has nothing to change —
  every tikina in Fiji shares the same national TB value. **Verify the TB dataset exists
  at usable granularity before committing to this direction.** This is the single
  assumption that decides whether Direction A is viable.
- **Prototype-by-next-week realism:** low, unless the student's notebook is genuinely
  drop-in and the TB data is already in hand.

### Direction B — "The bivariate atlas" (legend as the primary control)

**Center of gravity:** the color/encoding research the notes dwell on most.

One map, one bivariate encoding at a time, with a scrollytelling spine that swaps
encodings rather than stacking layers. The 3×3 legend is a live brush: click a cell,
the map and the linked distribution chart both filter to it. Deliberately builds the
three variants the notes name — standard sequential-sequential, **diverging-diverging
with "the norm" at center**, and **qualitative-sequential** — and lets the reader
compare them on the same data.

- **Reuses:** existing climate layers + SDMX indicators, `aggregation.py`, the v1
  bivariate palette work, H3 binning. Verified available pairs are in §3a — note that
  **population data is not in the repo**, so any population encoding requires
  acquisition first.
- **New work:** three legend components and their scales, the legend-as-brush
  interaction, scrollytelling scaffold.
- **Biggest risk:** it is a *design* contribution more than an analytical one. Strong for
  the competition's craft criteria, thinner as lab research output.
- **Prototype-by-next-week realism:** **high.** Every input already exists on disk. No
  new data acquisition, no new statistics. This is the only one of the three that is
  clearly deliverable in a week.

### Direction C — "Uncertainty you can interrogate"

**Center of gravity:** the note "click it, and then mean value or box plots, and then how
uncertainty changes."

Map shows a single climate stressor. Clicking any feature opens a linked panel: the mean,
the min–max envelope from the model ensemble, a box plot across scenarios/models, and how
that spread changes across time windows (yearly → 5-year → decade, which the catalog
already defines). Brushing the distribution filters the map.

- **Reuses:** `uncertainty_columns` already in the registry, `climate_indices.json` time
  windows, `statistics.py`, `compare_climate_scenarios.json` / `compare_climate_periods.json`
  tool schemas — these exist and do exactly this.
- **New work:** the distribution panel, scenario-ensemble expansion (currently one model,
  ACCESS-CM2 — a real ensemble needs more model runs pulled through the NEX pipeline).
- **Biggest risk:** with one model in the registry today, "uncertainty" is currently just
  a min–max envelope, not an ensemble spread. Needs more NEX downloads to be honest.
- **Prototype-by-next-week realism:** medium. The panel is buildable now against min/max;
  the ensemble story needs data work.

---

### 3a. What the data on disk actually supports (verified 2026-07-30)

Checked directly, because §3 originally asserted a "heat × population" pair that does
not exist.

| Dataset | Units | Fields |
| :--- | :--- | :--- |
| `fiji_extreme_heat_days_2050s_ssp245_access_cm2.geojson` | **102** polygon cells | `extreme_heat_days_mean` / `_min` / `_max`, `mean_tasmax_c_mean`, `cell_id` |
| `fiji_tikina.geojson` | **86** polygons | Province, Division, Tikina |
| `fiji_admin_adm2.geojson` | **15** (provinces) | — |
| `fiji_admin_adm1.geojson` | **4** (divisions) | — |
| `pict_regions.geojson` | **26** | iso3, subregion, region_group, sovereignty |
| SDMX cache | country level | sea level anomaly, power generation, safe water access |

**Three findings that constrain scope:**

1. **There is no population data in the repo.** Not in `data/`, not in the catalogs, not
   as a property on any reference geometry. The note "with population data" requires an
   acquisition step (PDH has population indicators — an SDMX flow addition).
2. **The heat layer is a single period** (2050s, SSP2-4.5, one model, ACCESS-CM2). It is
   a projection, not a time series. **No space-time cube can be built from it**, which
   independently confirms Direction A cannot start until many more years are pulled
   through `build_climate_layer_from_nex.py`.
3. **The heat grid is Fiji-only and the SDMX indicators are country-level.** They do not
   join at cell level. A bivariate map has to pick one of the two scales.

**Bivariate pairs that are real today**, mapped to the three variants in the notes:

| Variant | Pair | Scale | On disk? |
| :--- | :--- | :--- | :--- |
| Sequential–sequential | extreme heat days × model uncertainty (`_max − _min`) | Fiji, 102 cells | ✅ |
| Diverging–diverging (center = norm) | sea level **anomaly** (diverges around 0) × indicator deviation from regional median | PICT, 26 | ✅ |
| Qualitative–sequential | `region_group` (Melanesia / Polynesia / Micronesia) × any indicator | PICT, 26 | ✅ |
| Qualitative–sequential (alt) | CHVA facility type × heat exposure | Fiji | ⚠️ needs `5cd3c20` cherry-pick |

The sequential–sequential pair is the one v1 already prototyped as "Heat Hazard ×
Climate Uncertainty," so it also carries forward the uncertainty thread from Direction C.

## 4. Recommendation

**Build Direction B as the prototype for next week, structured so Direction A can land
inside it.**

The reasoning is scheduling, not preference. B is the only direction whose data is
entirely on disk today, and the notes ask for a reviewable prototype in a week. A and C
both have an unresolved data dependency (TB granularity; model ensemble) that could
consume the whole week before anything renders.

But B is not a throwaway. Its scrollytelling spine and legend-as-brush mechanism are the
*container* the other two directions need — an EHSA category map is just another
encoding in the same frame, and the uncertainty panel is just another linked view. So
building B first buys the shell, and A or C slots in once its data question is answered.

**In parallel, and this week:** get the TB dataset and the student's EHSA notebook in
hand and check them against §2. That question decides v2's actual research contribution,
and it is answerable in a day.

---

## 5. Constraints v2 should adopt from the v1 post-mortem

Carried from `docs/brushing-viz-retrospective.md`, restated as things to decide *now*:

1. **Assert against the map, not the DOM.** v1 ended with 13 DOM tests green and 3 map-state
   tests failing on a map that wasn't showing layers. Write the `getSource` /
   `getLayoutProperty` / `querySourceFeatures` smoke test before the first feature.
2. **Install `typescript` and run `tsc --noEmit`.** esbuild does not type-check. This is
   one line and closes a whole class of silent breakage.
3. **Register map layers on `style.load`, never `load`,** and make setup idempotent.
4. **Fix the identity contract first** — one id that is simultaneously the Mapbox feature
   id, the `promoteId`, and the chart record key. Every linking feature depends on it.
5. **Split data/geometry work from interaction work into separate changes.** In v1 the
   data half survived the pivot and the interaction half did not.
6. **Tie every success criterion to a command.** No performance claim in a spec without a
   stated way to measure it.
7. **Decide brush-conflict semantics up front** if there is more than one brushable view
   (intersect / replace / mutually exclusive). v1 left this ambiguous and it stayed broken.

---

## 6. Open questions for the PI

1. **Does Fiji-level (or sub-national) tuberculosis data exist, at what time depth?** If
   country-level only, Direction A's core interaction has nothing to drive it — see §2.
2. **Is the EHSA expected on heat alone, or on a heat-health composite?** The former is
   defensible; the latter needs the answer to Q1.
3. **How many of the 16 hotspot categories do we show?** Eight-plus categorical classes
   is a hard color problem, and the notes rightly insist color must carry a message.
   Collapsing to 4–5 is likely better; that is an analytical choice, not a design one.
4. **Is the scope Fiji or all PICTs?** The statistics push toward Fiji; the competition
   framing and the PDH indicators push toward regional. They may need different views.
5. **Is v2 still targeting the Pacific Dataviz Challenge**, or is it lab research output
   first? The notes cite previous winners heavily, but the PI redirect suggests the
   research framing now leads.

---

## 7. Sources cited in the notes

- Previous winners: `yan-holtz.com` / `holtzy.github.io/pacific-challenge`,
  `hnuradhyaksa.github.io/post/pacific-dataviz-2025`
- ESRI emerging hotspot reference (16 categories, Gi* + Mann-Kendall, space-time cube):
  `doc.esri.com/en/arcgis-pro/latest/tool-reference/space-time-pattern-mining/learnmoreemerging.html`
- NACIS (`nacis.org`) for cartographic craft references
