# Verification Record — Viz Component Workbench (2026-07-31)

Branch: `feature/viz-component-workbench`. OpenSpec change:
`openspec/changes/viz-component-workbench/`. Each criterion names the command that
settles it (`tests.md` standing rule); a criterion not run is marked **unverified** —
not complete.

**Verification-method note.** The categorical-legibility question remains measurement-
based. The regenerated fixture screenshots were also opened and visually inspected
after the §7 repairs; the rose chart is centred and all three saved fixture views visibly
carry the synthetic marker.

## Build and type integrity

| Criterion | Command | Result |
| :--- | :--- | :--- |
| No lint or React-hook errors | `cd frontend && npm run lint` | **PASS** — eslint clean; D3 guard ok (`d3-selection`, `d3-brush` absent from `package.json` and `src/`); fixture-import guard ok (no import of `src/fixtures/` outside `src/workbench/`) |
| No type errors | `cd frontend && npx tsc --noEmit` | **PASS** — clean, `typescript` ^7.0.2 |
| Production bundle succeeds, workbench excluded | `cd frontend && npm run build` | **PASS** — `✓ built in 1.06s`; `dist/` contains `index.html` + hashed assets only; no workbench artefact |
| Workbench entry serves under the dev server | `cd frontend && npm run dev:workbench` | **PASS** — the same dev server (port 5173) serves `/workbench.html` (HTTP 200) and opens it; `build.rolldownOptions.input` names `index.html` only (Vite 8 / Rolldown) |

## Containment — the criteria this change exists for

| Criterion | Command | Result |
| :--- | :--- | :--- |
| No fixture module in the bundle; no workbench artefact | `cd frontend && npm run build && npm run test:bundle-guard` | **PASS** — sentinel-keyed scan (`fixture-data-workbench-sentinel-v1`) finds nothing in `dist/`; no workbench file |
| **Negative control — guard is non-vacuous (tasks.md 1.1a)** | deliberately import `roseFixtures` from `src/main.jsx`, `npm run build`, `npm run test:bundle-guard` | **PASS (control seen to fail)** — the guard **failed** on `fixture sentinel "fixture-data-workbench-sentinel-v1" found in the production bundle: dist/assets/index-*.js`. The sentinel STRING LITERAL survives Oxc minification while paths/identifiers do not (architecture.md Decision 3). Deliberate import reverted; guard green again. |
| Application entry refuses `provenance: "fixture"` data | `npm run test:e2e -- e2e/workbench_containment.spec.ts` | **PASS** — 3/3: fixture-flagged dataset raises a provenance-naming error; a dataset omitting `provenance` is rejected with an error naming it (`pict-water-pop`); a `"real"` dataset renders with no watermark |
| Source guard: no `src/fixtures/` import in the application graph | `npm run lint` (guard-fixture-imports.mjs) | **PASS** — wired into `lint` so it fails fast rather than at build |

## Labelling (Decision 4, the load-bearing safeguard)

| Criterion | Command | Result |
| :--- | :--- | :--- |
| No fixture label equals a real geographic name | `cd frontend && npm run test:fixtures` | **PASS** — 441 fixture literals checked whole-label (trim + casefold, never substring) against ALL string-valued properties of `data/reference/pict_regions.geojson` (`name`, `country`, `subregion`, …) and `data/reference/fiji_tikina.geojson` (`Province`, `Division`, `Tikina`, …) — a new name field cannot silently open the hole |
| No fixture label matches an ESRI category string | same run | **PASS** — none of the 16 ESRI Emerging Hot Spot Analysis category strings present |
| Every fixture dataset declares `provenance: "fixture"` | same run | **PASS** — 8 provenance declarations, all `"fixture"` |
| **Screenshot crop test** (cropped fixture chart still reads as synthetic) | DOM crop simulation plus visual inspection of regenerated `docs/images/workbench-*.png` | **PASS** — rose: `Region A | Region B | …`; hotspot legend: `Class 1…N`; population: `Region A | Region B | …`; all generic, and the saved images visibly show the marker |

## No analysis

| Criterion | Command | Result |
| :--- | :--- | :--- |
| No Getis-Ord / Mann-Kendall / comparable implementation in the workbench | `cd frontend && npm run test:fixtures` (same run) | **PASS** — no statistical patterns in `src/workbench/`, `src/fixtures/`, or the three new components |
| Hotspot class values are literals from the fixture | same run + code inspection | **PASS** — `hotspot.ts` assignments are a literal array aligned by index with the reference file; `CategoricalHotspotLayer` reads `properties[classKey]` and computes nothing |

## Component rendering

| Criterion | Command | Result |
| :--- | :--- | :--- |
| Components render with no map instance and no narrative state | `npm run test:e2e -- e2e/workbench_components.spec.ts` | **PASS** — 4/4: no `__mapboxMap`, no `.mapboxgl-map`, no narrative/splash/chapter testids |
| Rose chart: one petal per fixture axis; area ∝ value (`scaleRadial`) | same spec | **PASS** — 8 petals (default variant); petals with values 10 vs 20 have bbox-area ratio **1.4–3.2** (measured ≈2), i.e. AREA encodes value — `scaleLinear` on a radius would give ≈4 |
| Hotspot layer renders every literal class | same spec | **PASS** — legend and rendered `path[data-class]` cover all classes; switching 3 → 5 re-renders to exactly 5 classes; rose variant switch re-renders 8 → 12 petals |
| Watermark present in every fixture view, non-dismissible | `npm run test:e2e -- e2e/workbench_watermark.spec.ts` | **PASS** — 2/2: marker is rendered inside each chart SVG and therefore inside captured chart bounds; survives interaction with every control; no dismiss-like control exists |

## Manual verification (tests.md)

| Criterion | Command / method | Result |
| :--- | :--- | :--- |
| **Categorical legibility — the finding this change exists to produce** | rendered the hotspot over real tikina geometry at 3 / 5 / 8 / 16 classes and measured colour distinguishability (ΔE00, the repo's own palette gate) and per-class rendered area | **FINDING — see below** |
| Rose chart encoding honesty | e2e area-ratio assertion | **PASS** (see component rendering) |
| Isolation is real (backend stopped) | dev server without the backend, all components render | **PASS** — the workbench rendered every component with the backend (`:8000`) stopped |
| Promotion rehearsal | rose chart fed real `mean_tasmax_c_mean` values from the served Fiji heat file | **PASS** — 95 petals (of 102 cells), values 24.30–28.79 °C, rendered with **no watermark** and **no code change** to the component; the rehearsal view is a prop change only |

### The categorical legibility finding (tasks.md 5.3)

Over real tikina geometry, at class counts **3, 5, 8 and 16** (the fixture spans all four;
16 is the ESRI Emerging Hot Spot Analysis count), using a 16-colour categorical palette:

| Classes | Min adjacent-pair ΔE00 (sRGB / deuteranopia) | Smallest class rendered area (px² at 520×420) | Readable at a glance? |
| :--- | :--- | :--- | :--- |
| 3 | 52.4 / 38.9 | 5,127 | Yes — colour and extent both ample |
| 5 | 30.2 / 27.3 | 2,362 | Yes |
| 8 | 18.1 / 16.7 | 823 | Yes, but the smallest class is starting to shrink |
| 16 | 18.1 / 16.7 | **18** | **No** — colour holds (all adjacent pairs ≥ 13.3 ΔE00 even under deuteranopia, above the repo's ≥ 10 gate), but several classes render as slivers |

**The threshold sits between 8 and 16 classes.** At 16, the failure is NOT the palette —
every adjacent pair exceeds the repo's ΔE00 ≥ 10 gate in sRGB and under deuteranopia.
The failure is spatial extent: over real tikina geometry at national scale, the eastern
island groups (Lau, Rotuma) occupy a handful of pixels per class (smallest class
measured at **18 px²** on a 520×420 canvas; the next two at 283 and 422 px²), so several
of the 16 categories cannot be distinguished at a glance regardless of colour. Consequence
for issues #9/#12: acquiring data for all 16 ESRI categories is only worth it if the
encoding is rendered at province/division scale or with an inset for the eastern groups;
at national scale, **8 categories is the defensible ceiling**.

Measured with the same ΔE00 implementation the repo gates on (`paletteCore.js`) and
per-class path-bounding-box areas from the rendered layer. The class blocks are the
fixture's literal index-aligned assignment, so the smallest classes are exactly the
small-island features a real analysis would also produce.

## Full suite status (honest reporting)

`cd frontend && npm run test:e2e -- e2e/workbench_containment.spec.ts e2e/workbench_watermark.spec.ts e2e/workbench_components.spec.ts`:
**9 passed.** The three workbench specs were run in isolation; the full `test:e2e` suite
additionally contains the pre-existing legacy-workspace specs whose known failures are
attributed in the sibling change's verification record (`docs/v2-bivariate-viz-verification.md`)
and are unrelated to this change.

### Final command output

```text
$ npm run lint
D3 guard ok: d3-selection and d3-brush absent from package.json and src/
Fixture-import guard ok: no import of src/fixtures/ outside src/workbench/.

$ npx tsc --noEmit
(no output; exit 0)

$ npm run build
vite v8.0.16 building client environment for production...
✓ 203 modules transformed.
dist/index.html 0.45 kB │ gzip: 0.29 kB
dist/assets/index-CGe4znoD.css 76.89 kB │ gzip: 12.69 kB
dist/assets/index-CawBr2cL.js 2,102.66 kB │ gzip: 582.05 kB
✓ built in 964ms

$ npm run test:bundle-guard
Bundle guard ok: workbench absent from the production build, no fixture sentinel in the bundle.

$ npm run test:fixtures
Fixture check ok: 441 fixture literals clear of real names and ESRI categories; 8 provenance declarations all "fixture"; no analysis patterns found.

$ npm run test:e2e -- e2e/workbench_containment.spec.ts e2e/workbench_watermark.spec.ts e2e/workbench_components.spec.ts
9 passed (10.0s)
```

## Post-review repairs (tasks.md §7)

| Repair | Verification | Result |
| :--- | :--- | :--- |
| 7.1 Rose petals and labels share the chart origin | `npx playwright test e2e/workbench_components.spec.ts` | **PASS** — the strengthened test catches petal boxes outside the SVG and checks each petal transform origin is the SVG centre; it failed before the transform repair and passes after |
| 7.2 Regression test is non-vacuous | same command, with the pre-repair failure recorded above | **PASS** — pre-repair failure was the out-of-bounds/incorrect-origin assertion; post-repair run is green |
| 7.3 Marker is inside captured SVG bounds | `npx playwright test e2e/workbench_watermark.spec.ts` | **PASS** — 2/2 |
| 7.4 Screenshots regenerated and inspected | Playwright locator screenshots; `view_image` inspection | **PASS** — all three named images regenerated; rose petals are visible and all three markers are visible |
| 7.5 Provenance claim reconciled | `rg -n "assertRealProvenance" frontend/src` | **PASS** — claim narrowed: the runtime guard is currently applied only in `src/hooks/useBivariateData.ts` (`fetchFeatures`); other visualization data paths are not claimed to be guarded |
| 7.6 Re-check 5.2 and record finding | screenshot inspection plus `npx playwright test e2e/workbench_components.spec.ts` | **PASS** — screenshot-crop criterion re-checked after regeneration; 7.1 was a review defect caught by the strengthened component e2e command |

The review found that the original component e2e assertions were position-blind and
passed while the rose petals were clipped at `(0, 0)`. The repaired assertions now make
that defect observable.

## Feed-back into the data requests (tasks.md 6)

| Criterion | Result |
| :--- | :--- |
| Legibility finding attached to issue #9 | **Done** — https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/9#issuecomment-5145009831 |
| Rose-chart screenshot / evidence attached to issue #10 | **Done** — https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/10#issuecomment-5145013576. Note: the GitHub issue API/CLI has no binary-attachment endpoint, so the screenshot is attached as the change's committed asset (`docs/images/workbench-rose-chart-fixture.png`, referenced in the comment) rather than an inline image; the image becomes inline-visible once this change is committed and pushed. |
| Revisit architecture.md Open Question 3 after #10 is answered | **Unverified / blocked** — issue #10 remains OPEN (no answer as of 2026-07-31); OQ3 stays open in `architecture.md`. |

## Explicitly not claimed by this change

- No analytical result. The hotspot categories are literals; nothing here means anything.
- No performance figure.
- No claim any component is production-ready — promotion happens when real data lands.
- A human visual pass on the rendered workbench (as opposed to the quantitative proxies
  above) — flagged to the next lab meeting / issue #14.
