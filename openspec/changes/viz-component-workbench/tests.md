## Automated Tests

Per `docs/brushing-viz-retrospective.md` §2.2, every criterion names the command that
settles it, and a checkbox means that command ran and passed.

The containment criteria are the ones that matter most here. A component that renders
beautifully but whose fixtures can reach production is a failure of this change.

### Containment — the criteria this change exists for

- `cd frontend && npm run build && npm run test:bundle-guard`:
  - no module under `src/fixtures/` appears in the production bundle output;
  - the workbench entry produces no artefact in the production build;
  - *edge case:* still passes when a component imported by both entries is present in the
    bundle — the guard targets fixture modules, not shared components.
- `npm run test:e2e -- e2e/workbench_containment.spec.ts`:
  - passing a dataset flagged `provenance: "fixture"` to the application entry raises an
    error rather than rendering;
  - a dataset omitting `provenance` entirely is rejected with an error naming it;
  - a dataset flagged `"real"` renders with no watermark.
- Source guard: no import of `src/fixtures/` exists anywhere under the application entry's
  module graph. Enforced in the lint step so it fails fast rather than at build.

### Labelling

- `npm run test:fixtures`:
  - no fixture label matches any name in `data/reference/pict_regions.geojson`
    (`name`, `country`) or `data/reference/fiji_tikina.geojson` (`Province`, `Division`, `Tikina`) — this
    is checked against the real files, not a hardcoded list;
  - no fixture class name matches an ESRI category string such as `Persistent Hot Spot`,
    `New Hot Spot`, or `Historical Hot Spot`;
  - every fixture dataset declares `provenance: "fixture"`.
- `npm run test:e2e -- e2e/workbench_watermark.spec.ts`:
  - a synthetic-data marker is visible within the visualization bounds for every fixture
    view;
  - no control removes the marker while leaving the visualization displayed.

### No analysis

- `npm run test:fixtures` (same run):
  - the workbench source contains no Getis-Ord, Mann-Kendall, or comparable statistical
    implementation;
  - hotspot class values are read from the fixture rather than computed.

### Component rendering

- `npm run test:e2e -- e2e/workbench_components.spec.ts`:
  - each component renders in the workbench with **no map instance and no narrative state
    present** — the isolation guarantee;
  - the rose chart renders one petal per fixture axis, and petal **area** scales with
    value (`d3.scaleRadial`, not `scaleLinear` — see
    `docs/v2-reference-implementations.md` §5);
  - the categorical hotspot layer renders every class present in the fixture;
  - changing a component's input via the workbench controls re-renders it.

### Build integrity

- `cd frontend && npm run lint` — clean.
- `cd frontend && npx tsc --noEmit` — clean. Depends on
  `pacific-bivariate-scrollytelling-viz` task 0.1 having installed `typescript`.
- `cd frontend && npm run build` — production build succeeds with the workbench excluded.
- `cd frontend && npm run dev:workbench` — the workbench entry serves and renders.

## Manual Verification

- **Categorical legibility — the actual research question**:
  - **WHEN** the hotspot layer is rendered over real tikina geometry at 3, 5, 8 and 16
    classes in turn
  - **THEN** record at which count classes stop being distinguishable at a glance. This
    is the finding the workbench exists to produce, and it should be written down rather
    than left as an impression

- **Rose chart encoding honesty**:
  - **WHEN** two petals whose values differ by a factor of two are compared
  - **THEN** their **areas** differ by roughly a factor of two, not four

- **Screenshot test — the real containment check**:
  - **WHEN** a fixture view is screenshotted and the image is cropped to the chart alone
  - **THEN** the content still reads as synthetic from its labels alone, without the
    watermark. If it does not, the labels are too realistic and must be changed

- **Isolation is real**:
  - **WHEN** the workbench is opened with the backend stopped
  - **THEN** every component still renders, confirming no hidden dependency on
    application state or API

- **Promotion rehearsal**:
  - **WHEN** a component is passed a real dataset (the box plot with actual `_min` /
    `_mean` / `_max`) instead of a fixture
  - **THEN** it renders with no code change and no watermark — confirming promotion will
    be a change of props, not a port

### Explicitly not claimed by this change

- No analytical result. No hotspot classification produced here means anything; the
  categories are literals.
- No performance figure.
- No claim that any component is production-ready. Promotion is a separate decision made
  when real data arrives.
