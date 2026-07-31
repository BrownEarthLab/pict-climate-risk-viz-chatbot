# Viz Component Workbench — Section 7 Walkthrough

Date: 2026-07-31  
Branch: `feature/viz-component-workbench`  
OpenSpec change: `openspec/changes/viz-component-workbench/`

## Scope

The existing implementation was already present and uncommitted. This walkthrough
covers only the six post-review repairs in section 7 of `tasks.md`; the implementation
was not re-created or refactored.

## 7.1–7.2 — Rose chart repair and regression coverage

`d3.arc()` creates each petal around `(0, 0)`. The petals had no translation, while
labels used `center.x` and `center.y`, so the rendered chart showed labels and an empty
circle but clipped petals at the SVG origin.

The repair places petals and labels in one shared `<g>` translated to the chart centre.
The component e2e test now verifies that:

- every petal bounding box stays inside the SVG bounds; and
- every petal transform origin is the SVG centre.

The strengthened test was run before the component fix and failed with an out-of-bounds
petal (`top: -67.75`). It was run again after the fix and passed.

## 7.3 — Watermark placement

The watermark was previously an HTML overlay beside the chart SVG. A screenshot of the
SVG therefore omitted it. Fixture components now receive the watermark label and render
the non-dismissible, `pointer-events-none` marker inside their SVG output.

`workbench_watermark.spec.ts` passed both checks: marker containment for all fixture
views and marker persistence after interacting with every control.

## 7.4 — Screenshot regeneration

The following images were regenerated from the workbench and visually inspected:

- `docs/images/workbench-rose-chart-fixture.png`
- `docs/images/workbench-hotspot-3classes.png`
- `docs/images/workbench-hotspot-16classes.png`

The rose petals are visible and centred. All three fixture screenshots visibly contain
the synthetic-data marker.

## 7.5 — Provenance claim

The narrow-claim option was chosen. `assertRealProvenance` is currently called only from
`frontend/src/hooks/useBivariateData.ts` in `fetchFeatures`:

```text
frontend/src/hooks/useBivariateData.ts:47:  assertRealProvenance(geojson, def.id);
```

The verification record now explicitly limits the runtime-backstop claim to that path;
other visualization data paths are not described as guarded.

## 7.6 — Verification record

`tasks.md` now marks 5.2 and all section 7 tasks complete. The verification record
documents the original rose-chart defect as a review finding and names the strengthened
component e2e command that catches it.

## Final command results

```text
npm run lint
D3 guard ok: d3-selection and d3-brush absent from package.json and src/
Fixture-import guard ok: no import of src/fixtures/ outside src/workbench/.

npx tsc --noEmit
(no output; exit 0)

npm run build
✓ built in 964ms

npm run test:bundle-guard
Bundle guard ok: workbench absent from the production build, no fixture sentinel in the bundle.

npm run test:fixtures
Fixture check ok: 441 fixture literals clear of real names and ESRI categories; 8 provenance declarations all "fixture"; no analysis patterns found.

npm run test:e2e -- e2e/workbench_containment.spec.ts e2e/workbench_watermark.spec.ts e2e/workbench_components.spec.ts
9 passed (10.0s)
```

No commit or push was made.
