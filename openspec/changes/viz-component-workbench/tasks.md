> **Read first:** `proposal.md` (why this is separate), `architecture.md` Decisions 1–5
> (Decision 4 is the load-bearing safeguard), `tests.md`.
>
> **Depends on** `pacific-bivariate-scrollytelling-viz` tasks 0.1–0.2 only: `typescript`
> installed, and `d3-scale` / `d3-shape` / `d3-array` installed. After that the two
> changes are independent and can run in parallel.
>
> **A checkbox means the named verification ran and passed.**

## 1. Test Scaffolding (TDD)

- [ ] 1.1 Write failing `test:bundle-guard` for **Fixture Data Is Confined To The Workbench Entry**: no `src/fixtures/` module in the production bundle; no workbench artefact in the production build; passes when a shared component is legitimately bundled.
- [ ] 1.2 Write failing `e2e/workbench_containment.spec.ts` for the runtime half of the same requirement plus **Every Dataset Declares Its Provenance**: fixture-flagged data throws in the application entry; missing `provenance` is rejected with a naming error; `"real"` renders unwatermarked.
- [ ] 1.3 Write failing `test:fixtures` for **Fixtures Do Not Attach Synthetic Values To Real Place Names**, checking labels against the actual `data/reference/pict_regions.geojson` and `data/reference/fiji_tikina.geojson` name fields rather than a hardcoded list, and rejecting ESRI category strings. Include `subregion` on the PICT file (`Polynesia` / `Micronesia` / `Melanesia`) — enumerate string-valued properties rather than hand-listing fields. Compare **whole normalised labels, not substrings**: `Ba` and `Ra` are real names. See `research.md` → Superseded claims.
- [ ] 1.4 Write failing `e2e/workbench_watermark.spec.ts` for **Fixture Renderings Are Visibly Marked**, including that no control dismisses the marker.
- [ ] 1.5 Write failing `e2e/workbench_components.spec.ts` for **Workbench Renders Components In Isolation** — each component renders with no map instance and no narrative state present.
- [ ] 1.6 Write the failing source check for **The Workbench Computes No Analysis**.
- [ ] 1.7 Run all of the above and confirm each fails for its intended reason, not from harness error.

## 2. Entry Separation and Containment

- [ ] 2.1 Add `frontend/workbench.html` and `frontend/src/workbench/main.tsx`.
- [ ] 2.2 Configure `build.rollupOptions.input` for both entries and exclude the workbench from the production build (architecture.md Decision 1).
- [ ] 2.3 Add a `dev:workbench` script.
- [ ] 2.4 Add the `provenance: "real" | "fixture"` field as a required property with no default; update existing real datasets to declare it (Decision 2).
- [ ] 2.5 Add the application-entry runtime guard that throws on `"fixture"` and on a missing field.
- [ ] 2.6 Add the lint rule forbidding any import of `src/fixtures/` from the application module graph.
- [ ] 2.7 Make 1.1 and 1.2 pass. **Do not proceed past this point until containment is green** — every later task adds synthetic data to the repo.

## 3. Fixture Layer

- [ ] 3.1 Create `frontend/src/fixtures/` with the provenance flag on every export.
- [ ] 3.2 Author the rose-chart fixture with generic axis labels (`Region A`, `Region B`, …) shaped like a per-region indicator across categories.
- [ ] 3.3 Author the hotspot fixture: real tikina geometry joined to generic class values (`Class 1`…`Class N`), spanning several class counts so the legibility question can be exercised at 3, 5, 8 and 16 (architecture.md Open Question 2).
- [ ] 3.4 Author the population small-multiples fixture as a generic-region time series.
- [ ] 3.5 Build the non-dismissible watermark wrapper and apply it to every fixture view.
- [ ] 3.6 Make 1.3 and 1.4 pass.

## 4. Components (shared source — no workbench-only logic)

- [ ] 4.1 Build the Nightingale rose chart: `scaleBand().range([0, 2π])` for angle, **`d3.scaleRadial()`** for radius, `d3.arc()` for paths. React renders the marks; no `d3-selection`, no `selectAll`, no SVG ref for rendering (`pacific-bivariate-scrollytelling-viz` architecture.md Decision 1).
- [ ] 4.2 Build the categorical hotspot layer rendering literal class values with a categorical palette.
- [ ] 4.3 Build population small-multiples.
- [ ] 4.4 Build the workbench gallery shell: component list plus controls to vary each component's inputs.
- [ ] 4.5 Verify every component lives in shared source and the workbench holds no component logic of its own (Decision 5).
- [ ] 4.6 Make 1.5 and 1.6 pass.

## 5. Verification and the Finding This Change Exists To Produce

- [ ] 5.1 Run `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:bundle-guard`, `npm run test:fixtures`, and the workbench e2e specs. Record actual output.
- [ ] 5.2 Complete the manual verification in `tests.md`, including the **screenshot crop test** — if a cropped fixture chart does not read as synthetic from its labels alone, the labels are too realistic and must be changed.
- [ ] 5.3 **Record the categorical legibility finding**: at what class count do hotspot classes stop being distinguishable at a glance, over real tikina geometry? Write it down; this is the deliverable of the change, not an impression.
- [ ] 5.4 Run the promotion rehearsal — pass a component real `mean_tasmax_c_mean` values from `data/climate/processed/fiji_extreme_heat_days_2050s_ssp245_access_cm2.geojson` (95 non-null of 102, 24.30–28.79 °C) and confirm it renders unwatermarked with no code change. Do **not** use `extreme_heat_days_*`: all 102 cells are `0`, so the rehearsal would pass on a flat line and demonstrate nothing.
- [ ] 5.5 Write a verification record naming each criterion, the command run, and the result. Anything unverified is marked unverified, not complete.

## 6. Feed Back Into The Data Requests

- [ ] 6.1 Attach the 5.3 legibility finding to issue #9 — it constrains how many of ESRI's 16 categories are worth acquiring data for.
- [ ] 6.2 Attach a rose-chart screenshot to issue #10 as evidence the component is ready and only the data is missing.
- [ ] 6.3 Revisit architecture.md Open Question 3 once #10 is answered: if TB is national-only, a 26-country rose chart is a materially weaker artefact than a Fiji-province one, and may not be worth promoting.
