# Research — Pacific Bivariate Scrollytelling Viz

> **Back-filled 2026-07-31**, after the change was implemented, as a worked example of the
> `tdd-rnd` schema's `research` artifact (see GitHub issue #16). A real change would write
> this *before* `proposal.md`. No other artifact of this change was modified — only the
> change's declared schema, which moved from `tdd-development` to `tdd-rnd` so that
> `research` is a tracked artifact rather than an untracked stray file.

## Source material

**PI meeting, ~2026-07-30/31.** Notes as supplied, verbatim. They reference an earlier
`7/23/26` set that is not available here. Prior to this back-fill these notes existed
**nowhere in the repository** — twelve spec requirements cited `lab notes, "…"` as their
rationale while quoting only fragments.

> more project context is I want to ideally reuse tools or features as much as possible
> from this current project to enrich the data viz
>
> Dataviz what could be useful:
> More notes: 7/23/26 also has more info · This comment · mood board for psid
> - Summarize data with brushing and linking with those circular graphs
> - Get prototype by next week for review
> - Space time cluster emerging hotspot with heat → brushed and linked with tuberculosis data
> - Already highlight the rose graph/particular area with tuberculosis change on graph
> - Have features, then click it, and then mean value or box plots, and then how uncertainty changes (more brushing and linking)
> - With population data
> - Various ways to display bivariate choropleth maps
>   - Normal version
>   - Diverging-diverging legend, center is the "norm"
>   - Qualitative-sequential
> - Scrollytelling dataviz's let you focus on one feature/attribute at a time so the viewer doesn't get distracted by overlapping layers on the same map
>
> Previous winners: <https://www.yan-holtz.com/> · <https://holtzy.github.io/pacific-challenge/>
> - Minimal information/analysis for opening splash screen
> - Tool tips are clean (no random attribute names/slugs)
> - Brush and linked to the top right
>
> <https://hnuradhyaksa.github.io/post/pacific-dataviz-2025>
> - Color is very powerful — needs to convey a message
> - Everything should be intentional — what happens when I remove a component/element?
> - Bivariate legend is brush and linked to the chart itself
> - Everything is clean and self-explanatory, no raw attribute name that only the developer understands
> - Search bar for brushing and linking certain countries on the graph
> - Brush/link feature with circular graph (nightengale rose graph) connected to province/country
>   - E.g. click country/province then relevant graph/feature is highlighted
> - Map analysis should not be displayed on the map itself (just the climate stressor — and it can be visualized as emergence hot spot)
> - We're limited by granularity of data which is on the country level
> - Emerging hotspot analysis? [example psid heat data] — One of my students already implemented this on python so you can benefit from that notebook
> - We can have four quartiles in time and cluster analysis
> - Some of the categories we might use:
>   - New hot spot — a location that is statistically significant hot spot for the final quartile (2018–2023)
>   - Persistent hot spot — a location with an uninterrupted significance
>   - Historical hot spot — the most recent time period is not hot, but at least 90 percent of the time-step intervals have been statistically significant hot spots
>
> <https://doc.esri.com/en/arcgis-pro/latest/tool-reference/space-time-pattern-mining/learnmoreemerging.html>
> Nacis map competition: <https://nacis.org/> for ideas for good visuals

### Raised but not acted on

| Raised | Why not in this change |
| :--- | :--- |
| Nightingale rose charts, brushed to province/country | No TB or comparable per-region indicator exists. Deferred to `viz-component-workbench` + issue #10. |
| Space-time emerging hotspot analysis on heat | Two independent blockers — see Verified facts. Issue #9. |
| TB linkage, "highlight the rose graph with tuberculosis change" | No TB data in the repo at any granularity. Issue #10. |
| "Four quartiles in time and cluster analysis" | Requires a space-time cube; the heat layer is one period. Issue #9. |
| The student's Python EHSA notebook | Not in the repo; not obtained. Issue #9. |
| "mood board for psid", the 7/23/26 notes, the SPC Facebook post | Not supplied. Would be worth adding to this section if they surface. |
| Population data | Partly acted on — country-level only, via Natural Earth rather than an official source. Issue #11. |

## Glossary

Terms this change uses in a non-obvious sense, or that are actively ambiguous in this
codebase. The **Does NOT mean** column is the point: a definition alone does not stop a
wrong inference; naming the plausible misreading does.

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **uncertainty** (heat layers) | inter-annual variability — `_max − _min` across years for **one** model | model-ensemble spread. Shipped wrong in `docs/presentation-script-and-cheat-sheet.md:66` as "model uncertainty (α)" |
| **scale** | geographic scale of a dataset: `fiji-cells` \| `pict-country` | a d3 scale function — both senses appear in this change |
| **norm** (diverging mode) | an explicitly declared baseline value, e.g. `0` for sea level anomaly | "typical", the mean, or the median |
| **tikina** | Fijian administrative district, n = **86** | province (n = 15) or division (n = 4) |
| **provenance** | the `"real"` \| `"fixture"` data flag (workbench change) | source attribution, also called provenance in tooltip copy |
| **EHSA** | ESRI Emerging Hot Spot Analysis — Gi\* per time bin **plus** Mann-Kendall, **16** categories | any map coloured by hotspot-ish categories |
| **bivariate** | two variables encoded simultaneously via a 3×3 class matrix | two layers stacked on one map |
| **H3** | Uber's hexagonal hierarchical spatial index | a hex-shaped rendering style |
| **PICT** | Pacific Island Countries and Territories, n = 26 in `pict_regions.geojson` | Pacific islands generally |
| **CHVA** | Fiji Climate & Health Vulnerability Assessment — 111 facilities, ids `chva-1`…`chva-111` | any health facility dataset |
| **antimeridian** | the 180° meridian, which Fiji and Kiribati straddle | the prime meridian |
| **deuteranopia** | red-green colour vision deficiency, the simulation the palette check runs | colour blindness generally |
| **feature-state** | Mapbox GPU-side per-feature state, set via `setFeatureState` | React state about a feature |
| **legacy workspace** | the pre-existing analysis UI, now at `/#workspace` | deprecated code — it is live and untouched |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| `github.com/holtzy/pacific-challenge` | The winning 2024 entry. D3 for maths only — deps are `d3-array`/`scale`/`shape`/`geo`; **zero** uses of `d3-selection`, `d3-brush`, `selectAll`, or an SVG ref across `src/`. React renders every mark. Cross-chart linking is a prop plus an opacity ternary, no store. Tooltips are HTML fed a typed `{xPos,yPos,name}`. No Mapbox — map is `d3-geo` SVG. No backend; static CSV prepped by `data_prep.R`. | **NONE** (verified via GitHub API) → all-rights-reserved. **Study only; do not copy source.** | 2026-07-30 |
| `react-graph-gallery.com/circular-barplot` | Radial bars need **`d3.scaleRadial`**, not `scaleLinear` — it corrects for a radial bar being wider at its outer edge, so equal value differences give equal *area* differences. | Repo not found at the obvious path; treat as study-only | 2026-07-30 |
| `github.com/holtzy/D3-graph-gallery` | General D3 patterns | **MIT** — usable with attribution | 2026-07-30 |
| ESRI, *How Emerging Hot Spot Analysis works* | **16** categories, not 3. Requires a space-time netCDF cube, a neighbourhood distance, a time-step interval; runs Gi\* per bin with FDR correction **plus Mann-Kendall** — without which Intensifying / Persistent / Diminishing cannot be separated. | Vendor doc | 2026-07-30 |
| `nacis.org` | Cartographic craft reference; a map gallery, not source code | — | 2026-07-30 |
| `hnuradhyaksa.github.io/post/pacific-dataviz-2025` | **Fetch failed** — client-rendered SPA, returned the single word "Adhyaksa". No conclusions drawn. Do not re-attempt without a headless browser. | — | 2026-07-30 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| `d3-scale`, `d3-shape`, `d3-array` | **Adopted** | Computation only; React renders marks | 2026-07-31 |
| `d3-selection`, `d3-brush` | **Rejected** | v1's worst defect (`selectAll("*").remove()` in an effect keyed on interaction state) requires imperative D3 DOM ownership to exist. Removing it retires the bug class. Enforced by `frontend/scripts/guard-d3.mjs` in lint. | 2026-07-31 |
| Zustand | **Rejected** | Not a dependency; v1's `source` attribution field was written by every setter and read by nothing. Lifted React state suffices for chart↔chart. | 2026-07-31 |
| `d3-geo` SVG map (as the winner used) | **Rejected** | Would strand H3 binning, antimeridian wrapping, the land mask, and `feature-state` paint. Attractive but a large pivot. | 2026-07-31 |
| `typescript` + `tsc --noEmit` | **Adopted** | Project had **no** type checking — `npm run build` uses esbuild. Surfaced 8 latent errors. | 2026-07-31 |
| `@types/mapbox__mapbox-gl-draw` | **Adopted** | Replaced a bare `declare module` shim that forced an `any` cast in `DrawControls.tsx` | 2026-07-31 |
| Storybook | **Rejected** | For the workbench change: a large dependency for what is one HTML file plus a component list. A second Vite entry gives stronger isolation. | 2026-07-31 |
| `esda` / `libpysal` | **Deferred** | Needed for a real Gi\*. Not installed; blocked on data anyway. Issue #9. | 2026-07-31 |
| `d3.scaleRadial` | **Deferred** | Correct for the rose chart, which is out of scope here. Carried to `viz-component-workbench`. | 2026-07-31 |

## Patterns adopted

Patterns are not copyrightable; source is. `holtzy/pacific-challenge` is unlicensed, so
its *approach* was adopted and **no lines were copied**.

| Pattern | From | Landed in |
| :--- | :--- | :--- |
| D3 computes, React renders every mark | pacific-challenge dependency list + grep | architecture.md Decision 1; all of `components/viz/` |
| Cross-view linking as a prop and an opacity ternary; no store | pacific-challenge `Barplot.tsx` | architecture.md Decision 2; `BivariateStory.tsx` |
| HTML tooltip fed a typed payload, returns `null` when null | pacific-challenge `Tooltip.tsx` | `components/viz/Tooltip.tsx` |
| `useDimensions(ref)` for responsive charts | pacific-challenge `lib/use-dimensions.ts` | `hooks/useDimensions.ts` |
| Shared design tokens declared before the first chart | pacific-challenge `dataviz/constant.tsx` | `dataviz/constant.ts` |
| `style.load` rather than `load` for layer registration | v1 post-mortem, commit `b92169a` | architecture.md Decision 3; `hooks/useMapbox.ts` |

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Fiji heat cells | 102 | parsed the geojson, counted `features` | 2026-07-30 | stable |
| **Heat days are non-zero** | **FALSE — all 102 cells are `0`** | read `_mean`/`_min`/`_max` for every feature, not just checked the fields exist | 2026-07-31 | stable |
| Cause of the zeros | `threshold_c` = 35.0 °C vs Fiji `mean_tasmax_c` 24.30–28.79 °C | read `threshold_c` and the tasmax range from the same file | 2026-07-31 | stable |
| `_min`/`_max` semantics | inter-annual spread, single model | read `build_climate_layer_from_nex.py:288-296` — groups by `(lat,lon)`, aggregates across **years**; registry names one model | 2026-07-31 | stable |
| Fiji tikina | 86 polygons | parsed `fiji_tikina.geojson` | 2026-07-30 | stable |
| Fiji provinces / divisions | 15 / 4 | parsed `fiji_admin_adm2` / `adm1` | 2026-07-30 | stable |
| PICT regions | 26 | parsed `pict_regions.geojson` | 2026-07-30 | stable |
| **Population data exists** | `POP_EST`/`POP_YEAR`, 30 Pacific-subregion features, 2019 | property scan of `_ne_10m_admin_0_map_units.geojson` | 2026-07-31 | decays (Natural Earth releases) |
| Population join key | ISO3; **PNG and Bougainville carry `ISO_A3 = -99`** | listed Pacific features with their ISO3 | 2026-07-31 | stable |
| `pict_regions.geojson` lacks population | confirmed | property scan — the derivation dropped the fields | 2026-07-31 | stable |
| SDMX flows wired | sea level, power gen, water access | read `LAYER_CONFIGS` in `sdmxApiClient.js` | 2026-07-30 | decays (upstream API) |
| Python geospatial suite | 13 schema'd tools, 19 pytest files | `ls backend/tools/schemas/`, `ls backend/tests/` | 2026-07-30 | stable |
| Python suite needs a live backend | `test_spc_*.py` hit `http://localhost:8000` | ran without a server → 11 connection-error failures; grepped `API_BASE` | 2026-07-31 | stable |
| `MapCanvas.tsx` size on this branch | 2581 lines | `wc -l` | 2026-07-30 | decays |
| `DrawControls` is imported nowhere | confirmed | grep across `frontend/src` | 2026-07-31 | decays |
| v1 Patch 1 still present here | `MapCanvas.tsx:2083` opens `manual_heat_risk &&`, Dynamic Datasets ~2471 nested inside | grep + line inspection | 2026-07-31 | decays |

## Unverified assumptions

| Assumption | Cost to check |
| :--- | :--- |
| Quantile tertiles produce a *useful* map rather than flattening the signal | One human look at the running prototype — issue #14 |
| The three palettes read well at map scale, not just at ΔE00 ≥ 10 | Same visual pass — metric passing ≠ legible |
| The antimeridian fix holds visually | Pan across 180°. Programmatically checked; **never visually inspected in v1 either** |
| Sub-national TB data exists somewhere | ~1 day — issue #10. Decides whether the health direction exists |
| Multi-year NEX runs would produce a usable space-time cube | Unknown until run — issue #9 |
| A region-appropriate heat threshold (or wet-bulb) would give non-zero Fiji values | Re-run the build script with a lower threshold — issue #8 |

## Superseded claims

| Believed | Why it was wrong | Replaced by |
| :--- | :--- | :--- |
| "No population data exists in the repo" | Checked the catalogs and two *derived* geometries, never the raw Natural Earth source | `POP_EST`, 30 Pacific features — country level only |
| "heat days × inter-annual variability is a verified pair ✅" | The *fields* were verified; the *values* were not. All 102 cells are 0. | Pair is degenerate; used as the tie-failure fixture. Working sequential pair is water × population |
| "`_max − _min` is model uncertainty" | Assumed from the name; the aggregation is across years with one model | Inter-annual variability. The wrong term reached `presentation-script-and-cheat-sheet.md:66` — issue #8 |
| "openspec/ is untracked, so specs die on this machine" | True of the app repo, but `openspec/` was versioned in a separate spec vault | Vault existed but had **no remote**; resolved by tracking `openspec/` in the app repo (`7484c3d`) |
| "The 4 failing e2e tests are obsolete" | They were failing on *route* — the legacy workspace moved to `/#workspace` | Retargeted; 1 of 4 fixed, 3 are pre-existing legacy defects |
| "The externally-supplied v2 plan is a usable starting point" | Written against the archived branch: targeted `server.js` lines past EOF, named Zustand and D3 as installed, both verification commands failed | Appraised and largely discarded — `docs/v2-plan-appraisal.md` |

## Links out

Project-scoped material this change rests on. Linked, not copied.

- `docs/README.md` — index
- `docs/brushing-viz-retrospective.md` — why v1 failed; the seven guardrails
- `docs/v2-direction-research.md` — three directions costed; §2 granularity; §3a data inventory
- `docs/v2-reference-implementations.md` — the winning entry's architecture and licensing
- `docs/v2-plan-appraisal.md` — verifying an external plan against the tree
- `docs/v2-bivariate-viz-verification.md` — per-criterion verification record
- `docs/v2-parallel-research.md` — TB / notebook / multi-year heat findings
- `openspec/changes/archive/2026-07-30-pacific-climate-brushing-viz/` — the superseded v1 change
- Issues **#8** model ensemble · **#9** multi-period heat · **#10** sub-national TB · **#11** PDH population · **#12** tracking · **#14** visual verification · **#15** post-delegation findings · **#16** this artifact's proposal
