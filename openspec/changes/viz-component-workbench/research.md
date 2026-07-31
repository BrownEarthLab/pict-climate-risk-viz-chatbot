# Research — Viz Component Workbench

> **Written 2026-07-31**, after this change's `proposal` / `architecture` / `specs` /
> `tests` but **before any implementation** (0 of 34 tasks). Unlike the sibling change's
> research artifact, which is a true post-hoc back-fill, this one still precedes the build
> and the findings below are meant to be acted on — three of them contradict statements
> already in `architecture.md`. See **Superseded claims**.
>
> This change and `pacific-bivariate-scrollytelling-viz` rest on the same PI meeting and
> largely the same external reading. Per the `tdd-rnd` rule that material spanning several
> changes is linked rather than duplicated, the shared record lives in
> [`../pacific-bivariate-scrollytelling-viz/research.md`](../pacific-bivariate-scrollytelling-viz/research.md).
> Carried-over entries appear here only where this change actually depends on them, and are
> marked ⟳. Everything unmarked is specific to the workbench and was verified today.

## Source material

**PI meeting, ~2026-07-30/31.** Same supplied notes as the sibling change; the full
transcript is in that artifact and is not repeated. Reproduced verbatim below are only the
lines that generate *this* change — the three features whose data does not exist yet.

> - Summarize data with brushing and linking with those circular graphs
> - Get prototype by next week for review
> - Space time cluster emerging hotspot with heat → brushed and linked with tuberculosis data
> - Already highlight the rose graph/particular area with tuberculosis change on graph
> - With population data
>
> - Brush/link feature with circular graph (nightengale rose graph) connected to province/country
>   - E.g. click country/province then relevant graph/feature is highlighted
> - Emerging hotspot analysis? [example psid heat data] — One of my students already implemented this on python so you can benefit from that notebook
> - We can have four quartiles in time and cluster analysis
> - Some of the categories we might use:
>   - New hot spot — a location that is statistically significant hot spot for the final quartile (2018–2023)
>   - Persistent hot spot — a location with an uninterrupted significance
>   - Historical hot spot — the most recent time period is not hot, but at least 90 percent of the time-step intervals have been statistically significant hot spots
>
> <https://doc.esri.com/en/arcgis-pro/latest/tool-reference/space-time-pattern-mining/learnmoreemerging.html>

The operative reading: every one of these asks for a **component** and a **dataset**, and
only the datasets are blocked. "Get prototype by next week for review" is the reason this
change exists at all rather than waiting on issues #9–#11.

### Raised but not acted on

| Raised | Why not in this change |
| :--- | :--- |
| Real hotspot analysis — Gi\*, Mann-Kendall, "four quartiles in time" | Forbidden outright by the spec, not merely deferred. Once real analysis exists in the workbench its output stops being obviously synthetic. Belongs to whichever change consumes issue #9. |
| Brushing the rose chart to TB change | No TB data at any granularity. Issue #10. This change builds the chart, not the linkage. |
| The student's Python EHSA notebook | Still not obtained. Would inform the *analysis* change, not this one. Issue #9. |
| The ESRI category names themselves | Deliberately **not** used as fixture labels — see Decision 4. They are the single most dangerous string to put on a synthetic map. |
| The uncertainty box plot | Assigned to the sibling change on the grounds that its data is real. That reasoning is now **wrong in part** — see Superseded claims. It stays out of this change regardless; the question is which real field it uses. |
| Promoting any component into the application | Happens when real data lands, in the change that consumes it. |
| A deployable workbench URL the PI can open | Architecture Open Question 1, still open. Local-only until the labelling rules have been exercised at least once. |

## Glossary

Terms this change uses in a non-obvious sense. Where the sibling change defines the same
term differently in emphasis, the ⟳ row states **this** change's sense — `provenance` in
particular flips meaning between the two.

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **provenance** | the required `"real"` \| `"fixture"` flag on every dataset — the containment mechanism | ⟳ source attribution, which is what the sibling's tooltip copy calls provenance. Both senses are live in this repo |
| **fixture** | a synthetic dataset that exists only under the workbench entry | a test fixture in the Playwright sense; these are rendered, not asserted on |
| **entry** | a Vite/Rollup HTML entry point — a separate module graph | a route. Decision 1 rejects the route because a route shares the graph |
| **workbench** | the second entry plus its gallery shell | a component library or design system; it ships nothing |
| **containment** | fixtures cannot reach the application, enforced at build time *and* runtime | fixtures are merely discouraged from reaching it |
| **promotion** | passing a component real data instead of fixture data, with no code change | porting or rewriting the component for the application |
| **watermark / marker** | non-dismissible synthetic-data label inside the visualization bounds | a page-level banner, which a crop removes |
| **generic label** | `Region A`, `Class 1` — self-evidently not a place | an anonymised real name. "Province 1" ordered by real index is still a real-name mapping |
| **`scaleRadial`** | d3 scale correcting for a radial bar being wider at its outer edge, so equal value differences give equal **area** differences | `scaleLinear` on a radius, which exaggerates large values by roughly their square |
| **Nightingale rose** | polar area chart — value encoded as **area**, all sectors equal angle | a pie chart (angle-encoded) or a radar/spider chart (line-connected) |
| **small multiples** | one small chart per region, shared scales, read by comparison | a faceted single chart with a shared axis |
| ⟳ **EHSA** | ESRI Emerging Hot Spot Analysis — Gi\* per time bin **plus** Mann-Kendall, **16** categories | any map coloured by hotspot-ish categories. The workbench renders the *encoding*, never the analysis |
| ⟳ **tikina** | Fijian administrative district, n = **86** | province (n = 15) or division (n = 4) |
| ⟳ **PICT** | Pacific Island Countries and Territories, n = 26 | Pacific islands generally |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| ⟳ `react-graph-gallery.com/circular-barplot` | Radial bars need **`d3.scaleRadial`**, not `scaleLinear`. This is the whole technical content of the rose-chart task and the reason `tests.md` asserts on **area**, not radius. | Repo not found at the obvious path; study-only | 2026-07-30 |
| ⟳ `github.com/holtzy/pacific-challenge` | The winning 2024 entry. D3 computes, React renders every mark; no `d3-selection`, no store, cross-view linking is a prop. Establishes that the "pure component, props in / SVG out" shape this change depends on is what a winning entry actually used. | **NONE** (verified via GitHub API) → all-rights-reserved. **Study only; do not copy source.** | 2026-07-30 |
| ⟳ `github.com/holtzy/D3-graph-gallery` | General D3 patterns | **MIT** — usable with attribution | 2026-07-30 |
| ⟳ ESRI, *How Emerging Hot Spot Analysis works* | **16** categories, not the 3 the notes list. Supplies the exact strings the fixtures must avoid (`New Hot Spot`, `Persistent Hot Spot`, `Historical Hot Spot`, …) and the "at what count is categorical colour still readable" question the workbench exists to answer. | Vendor doc | 2026-07-30 |
| Storybook | Considered as the isolation surface and rejected before reading deeply. Not evaluated in depth — the rejection is on dependency weight, not on capability. | — | 2026-07-31 |
| Vite multi-entry (`build.rollupOptions.input`) | **Not consulted.** Decision 1 rests on this API; the installed major is Vite **8**, and the mechanism was assumed from prior versions rather than checked. Listed under Unverified assumptions, not here. | — | — |
| ⟳ `hnuradhyaksa.github.io/post/pacific-dataviz-2025` | **Fetch failed** — client-rendered SPA, returned the single word "Adhyaksa". Do not re-attempt without a headless browser. | — | 2026-07-30 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Second Vite entry (`workbench.html`) | **Adopted** | Isolation is structural: fixtures live in a different module graph, so the production bundle *cannot* contain them, and that is assertable rather than conventional. | 2026-07-31 |
| `/workbench` route behind an env flag | **Rejected** | Same module graph — fixtures stay one import from production and the guard degrades to a lint rule. Flags get flipped and the failure is silent. | 2026-07-31 |
| Storybook | **Rejected** | A substantial dependency and config surface for one HTML file and a list of components. Also would own the isolation boundary, which this change wants to own itself. | 2026-07-31 |
| `d3.scaleRadial` | **Adopted** | Present in the already-installed `d3-scale` 4.0.2 and typed in `@types/d3-scale` — no new dependency. Verified, not assumed; see Verified facts. | 2026-07-31 |
| ⟳ `d3-selection`, `d3-brush` | **Rejected** | Retired repo-wide by the sibling change and enforced by `frontend/scripts/guard-d3.mjs` in `lint`. The workbench inherits the prohibition — its components are shared source. | 2026-07-31 |
| ⟳ `esda` / `libpysal` | **Out of scope**, not deferred | The spec forbids statistical computation here. These belong to the change that consumes issue #9. | 2026-07-31 |
| A new test runner (vitest/jest) for `test:fixtures` | **Open** | The repo has Playwright and two bespoke `node` scripts (`guard-d3.mjs`, `check-palettes.mjs`) and no unit runner. `test:fixtures` and `test:bundle-guard` are node-script shaped and should probably follow that pattern rather than add a runner. Not yet decided. | 2026-07-31 |

## Patterns adopted

| Pattern | From | Lands in |
| :--- | :--- | :--- |
| ⟳ Pure component: props in, SVG out, no imperative DOM ownership | `holtzy/pacific-challenge` (approach only — unlicensed, no lines copied) | Decision 5; every component built here |
| ⟳ `scaleRadial` for radial bar area honesty | `react-graph-gallery.com/circular-barplot` | The rose chart; asserted in `tests.md` "Rose chart encoding honesty" |
| Walk-the-tree grep guard as a `node` script wired into an npm script | This repo's own `frontend/scripts/guard-d3.mjs` (added `bd0499b`) | `test:bundle-guard`, `test:fixtures`, and the fixture-import lint rule should be built on this shape rather than inventing a third convention |
| Two-layer enforcement — static check plus runtime throw | Decision 3, generalising the d3 guard (which is static only) | The bundle guard plus the application-entry provenance throw |

## Verified facts

Everything below was checked on 2026-07-31 against this branch
(`feature/pacific-climate-viz-v2`, at `6c535a3`).

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `vite.config.js` declares a single entry | no `build` key at all — only `plugins` and `server` | read the whole file | 2026-07-31 | decays |
| The only HTML entry | `frontend/index.html` | `ls frontend/*.html` | 2026-07-31 | decays |
| No fixture or workbench source exists yet | neither `frontend/src/fixtures/` nor `frontend/src/workbench/` | `ls -d` on both | 2026-07-31 | decays |
| npm scripts present | `dev`, `build`, `typecheck`, `lint`, `preview`, `test:e2e`, `test:e2e:spatial`, `test:palette` | parsed `package.json` — **note `typecheck` and `test:palette` are absent from architecture.md's list** | 2026-07-31 | decays |
| The scripts this change needs | `test:bundle-guard`, `test:fixtures`, `dev:workbench` do **not** exist | same parse | 2026-07-31 | decays |
| `lint` already runs a custom guard | `eslint . && node scripts/guard-d3.mjs` | read the script value | 2026-07-31 | decays |
| **No new runtime dependency is required** | `d3-scale` 4.0.2, `d3-shape` 3.2.0, `d3-array` 3.2.4 all present as `dependencies`; `typescript` ^7.0.2 as a devDependency | parsed `package.json`; the proposal's stated precondition (sibling tasks 0.1–0.2) is **met** | 2026-07-31 | decays |
| **`scaleRadial` is actually available** | exported by the installed `d3-scale` 4.0.2 and declared in `@types/d3-scale` 4.0.9 | grepped `node_modules/d3-scale/src/index.js` and the `.d.ts` — the export, not just the version number | 2026-07-31 | stable |
| Storybook is absent | no Storybook package in either dependency block | parsed `package.json` | 2026-07-31 | decays |
| Existing e2e surface | Playwright, 9 spec files; none of the three this change adds | `ls frontend/e2e/` | 2026-07-31 | decays |
| Real tikina names are fully reachable via the fields `tests.md` names | 97 distinct values across `Province` / `Division` / `Tikina` | parsed `fiji_tikina.geojson` | 2026-07-31 | stable |
| `admin_name` / `display_name` add no further real names | **0** values not already covered by the three fields above | set difference over all 86 features — so the field list in `tests.md` is complete for this file | 2026-07-31 | stable |
| PICT real names via `name` / `country` | 26 distinct | parsed `pict_regions.geojson` | 2026-07-31 | stable |
| **`pict_regions.geojson` carries real names in a field `tests.md` does not check** | `subregion` = `Polynesia`, `Micronesia`, `Melanesia` (+1 `null`) | property scan of all 26 features — a fixture labelled "Melanesia" passes the test as currently specified | 2026-07-31 | stable |
| **Real names go down to two characters** | `Ba`, `Ra`; 12 names ≤ 3 chars (`Bau`, `Bua`, `Gau`, `Lau`, `Ono`, …) | length scan over all real names | 2026-07-31 | stable |
| The heat layer's own place field | `region_name` is the single value `"Fiji"` for all 102 cells | distinct-value scan | 2026-07-31 | stable |
| **`extreme_heat_days` `_mean`/`_min`/`_max` are all zero** | every one of the 102 cells, 1 distinct value per field | read every value, not merely checked the fields exist | 2026-07-31 | stable |
| A real field with usable spread does exist in that file | `mean_tasmax_c_mean`: 95 non-null of 102, 24.30–28.79 °C, 95 distinct | same pass | 2026-07-31 | stable |
| ⟳ Fiji tikina / PICT regions / Fiji heat cells | 86 / 26 / 102 | parsed each file | 2026-07-30 | stable |

## Unverified assumptions

| Assumption | Cost to check |
| :--- | :--- |
| **Vite 8 still configures multi-entry via `build.rollupOptions.input`, and an entry can be excluded from the production build the way Decision 1 describes.** The whole containment argument rests on this and it has not been run. | ~15 min — write the config, run `npm run build`, inspect `dist/`. Do this as task 2.2 *before* authoring any fixture |
| A bundle scan can reliably detect a fixture module in production output. Minification and tree-shaking may leave no recognisable path or identifier, in which case a path-based guard passes vacuously — the worst possible failure for this change | One build. If it is vacuous, key the guard on a sentinel export string that survives minification, and assert the guard fails when a fixture is deliberately imported (the `tests.md` edge case already asks for the inverse case) |
| **5–8 categorical classes are simultaneously legible** — the actual research question | Cannot be automated. Manual pass at 3 / 5 / 8 / 16 classes, written down rather than left as an impression |
| The watermark survives a screenshot in every render path — SVG `foreignObject` and canvas-composited layers behave differently under OS screenshot and `html2canvas` | Screenshot each fixture view once, crop to the chart, look |
| Generic labels are enough that a cropped screenshot still reads as synthetic to someone who was not in the room | The `tests.md` manual "screenshot test", ideally shown to one person who has not seen the workbench |
| The PI wants the workbench reviewable at a URL rather than local-only | One question at the next meeting — Open Question 1 |
| A rose chart is still worth building if issue #10 returns "national only" — 26 countries × N years is a materially weaker chart than Fiji provinces | Blocked on #10. The component is cheap enough that building it anyway is defensible; the *placement* decision is not this change's |

## Superseded claims

| Believed | Why it was wrong | Replaced by |
| :--- | :--- | :--- |
| **`architecture.md` Context: "the uncertainty box plot needs no fixture at all — real `_min` / `_mean` / `_max` already exist on 102 cells… It should be built against real data in the sibling change"** | The *fields* exist; the *values* are all zero across all 102 cells. A box plot over them is a flat line at zero. This is precisely the "field exists ≠ values usable" conflation the schema warns about, and it survived into an architecture decision | The box plot is either built against `mean_tasmax_c_mean` (95 values, 24.30–28.79 °C, real spread) or it is blocked on issue #8 like the rest of the heat layer. Either way it stays out of this change — but the stated reason for excluding it no longer holds |
| **`architecture.md` Context: "scripts are `dev`, `build`, `lint`, `preview`, `test:e2e`, `test:e2e:spatial`"** | Accurate when written; the sibling change landed `typecheck` and `test:palette` in `bd0499b` | Eight scripts, listed under Verified facts. Anything asserting on the script set must be re-read, not trusted from the architecture doc |
| `tests.md`: checking fixture labels against `pict_regions.geojson` (`name`, `country`) is sufficient for that file | `subregion` also holds real geographic names — `Polynesia`, `Micronesia`, `Melanesia` — and is not in the list | Task 1.3 must include `subregion`. The general rule: enumerate string-valued properties of the reference files rather than naming fields by hand |
| Implicit in `tests.md`: a label-vs-real-name check is a simple containment test | Real names include `Ba` and `Ra`. A case-insensitive **substring** check flags almost any English label; an exact-match check misses case and whitespace variants | Normalise (trim, casefold) then compare **whole labels**, never substrings. Worth an inline comment in the test, since substring is the obvious first implementation |
| ⟳ "`_max − _min` is model uncertainty" | The aggregation is across **years** with a single model | Inter-annual variability. Relevant here because the box plot renders exactly this quantity, and the wrong term already reached `docs/presentation-script-and-cheat-sheet.md:66` — issue #8 |
| ⟳ "No population data exists in the repo" | Only derived geometries had been checked, not the raw Natural Earth source | `POP_EST` / `POP_YEAR`, 30 Pacific-subregion features, 2019 — **country level only**, which is why the population small-multiples fixture is still needed. Issue #11 |

## Links out

- [`../pacific-bivariate-scrollytelling-viz/research.md`](../pacific-bivariate-scrollytelling-viz/research.md) — the shared record: full PI transcript, full glossary, the reference-implementation study
- `docs/brushing-viz-retrospective.md` — §2.2 every criterion names its command · §2.4 the four simultaneous defects that motivate isolation · §2.8 why fragile and durable work were split apart
- `docs/v2-reference-implementations.md` — §5 the `scaleRadial` finding
- `docs/v2-direction-research.md` — §2 granularity, §3a data inventory
- `openspec/changes/archive/2026-07-30-pacific-climate-brushing-viz/` — the superseded v1 change
- Issues **#8** heat threshold / model ensemble · **#9** multi-period heat · **#10** sub-national TB · **#11** PDH population · **#12** tracking · **#16** the `tdd-rnd` research artifact proposal
