## Why

Three features the lab notes ask for — Nightingale rose charts, an emerging-hotspot
category layer, and population small-multiples — are blocked on data that does not exist
yet (GitHub issues #9, #10, #11). But the *components* are not blocked. A rose chart takes
`[{axis, value}]` and has no idea whether the numbers are tuberculosis incidence or noise.

Building them now against fixtures does two things. It gives the next lab meeting a
working artefact instead of a description — "here is the rose chart running, it needs
issue #10 answered to point at anything real" is a far stronger case for data acquisition
than a mockup slide. And it answers real rendering questions that do not depend on the
data at all, chiefly whether 5–8 categorical hotspot classes can be read simultaneously.

It also addresses the specific way v1 failed. Per `docs/brushing-viz-retrospective.md`
§2.4, four independent defects each individually sufficient to break bi-directional
brushing were all present at once, and because everything was wired together nobody could
tell which was which. Components proven in isolation first mean integration debugging has
one unknown at a time.

**The reason this needs its own change rather than living inside
`pacific-bivariate-scrollytelling-viz`:** that change is the deliverable; this is dev
tooling. Retrospective §2.8 records that v1 bundled fragile interaction work with durable
data work and the fragile half dragged the whole change's perceived status down. Keeping
them separate also lets the workbench proceed in parallel with the core chapters.

## What Changes

- Add a **second Vite entry point** (`frontend/workbench.html`) rendering a component gallery,
  separate from the application entry. It is excluded from the production build.
- Add a **fixture module** providing synthetic datasets for components whose real data is
  not yet available. Fixtures exist only under the workbench entry.
- Add a **provenance flag** to every dataset shape: `provenance: "real" | "fixture"`. The
  application entry SHALL refuse to render `"fixture"` data.
- Add a **persistent visual watermark** to any view rendering fixture data, designed to
  survive a screenshot.
- Add a **fixture naming rule**: synthetic values MUST NOT be attached to real place
  names. See Impact for why this is the load-bearing safeguard.
- Build the three currently-blocked components in the workbench: Nightingale rose chart
  (using `d3.scaleRadial`), categorical hotspot layer, population small-multiples.
- Add a **build guard** asserting no fixture module reaches the production bundle.

**Explicitly out of scope**

- Any real analysis. No Getis-Ord Gi\*, no Mann-Kendall, no statistics of any kind. This
  change renders shapes; it does not compute findings.
- Promoting any component into the application. Promotion happens when real data lands,
  in whichever change consumes it.
- Storybook or any component-explorer dependency. A plain second entry point is
  sufficient and adds no dependency.

## Capabilities

### New Capabilities

- `viz-component-workbench`: An isolated development surface for visualization components
  whose production data is not yet available, including the fixture provenance contract,
  the containment guarantees that keep synthetic data out of the application, and the
  labelling rules that prevent a fixture rendering from being mistaken for a finding.

### Modified Capabilities

<!-- None. This change adds an isolated surface and does not alter any existing
     capability's requirements. -->

## Impact

**Affected code**

- `frontend/vite.config.js` — multi-entry `build.rollupOptions.input`; currently a single
  entry with no router.
- `frontend/workbench.html` + `frontend/src/workbench/` — new.
- `frontend/src/fixtures/` — new; reachable only from the workbench entry.
- `frontend/package.json` — a `dev:workbench` script. **No new runtime dependencies**;
  `d3-scale` / `d3-shape` / `d3-array` arrive with `pacific-bivariate-scrollytelling-viz`.

**Dependency on the other change**

This change assumes `pacific-bivariate-scrollytelling-viz` tasks 0.1–0.2 (install
`typescript`, install the d3 computation modules) have landed. It does not otherwise
depend on it, and the two can proceed in parallel after that point.

**Why the naming rule is the load-bearing safeguard**

The realistic failure is not dishonesty. It is a **screenshot escaping into a slide deck
weeks later, stripped of its context**. A rose chart labelled "Region A / Region B" is
self-evidently a mockup. One labelled "Ba / Nadroga / Rewa" with invented tuberculosis
rates looks exactly like research output, and a watermark cropped out of a screenshot
offers no protection.

The hotspot layer is the sharp case, because answering the rendering question genuinely
requires real tikina geometry. There the rule is real geometry, classes named `Class 1…5`
rather than `Persistent Hot Spot`, plus the watermark — which answers whether the palette
is legible without ever producing an image that reads as a claim.

**Relationship to the prohibition in the other change**

`pacific-bivariate-scrollytelling-viz` architecture.md Decision 7 prohibits synthetic
health data. This change is the carve-out that decision already names: fixtures for
interaction development, clearly labelled, never rendered as analysis. The containment
requirements here are what make that distinction enforceable rather than a matter of
intent.

**Related issues**

- #12 tracking, #9 multi-period heat layers, #10 sub-national TB data, #11 official PDH
  population — this change is what proceeds *while* those are open.
