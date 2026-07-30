## Why

For the 2026 Pacific Data Viz Challenge (Climate Change Edition), participants need an engaging, performant, and transparent interactive visualization tool. This change introduces a 4-chapter guided data storytelling engine ("Rising Tides, Heat & Human Resilience") linked to bi-directional brushing between Mapbox GL geospatial maps and D3.js distribution charts (scatterplots & histograms) powered by official Pacific Data Hub SDMX indicators and Fiji healthcare datasets.

## What Changes

- **4-Chapter Storyteller Deck (`StorytellerDeck.tsx`)**: Interactive narrative bar driving map camera movements (`map.flyTo`), threshold filters, and topic-specific layer activations.
- **Bi-Directional Brushing & Linking (`LinkedRiskCharts.tsx` & `useBrushingState.ts`)**: 2D scatterplot (Risk vs. Population/Exposure) and 1D histogram (Heat Exposure Distribution) with `d3-brush` gesture handlers synchronized to Mapbox GL via sub-16ms `map.setFeatureState()` GPU paint updates.
- **Data Provenance Badges**: Explicit citations on every layer, chart, and tooltip linking to official Pacific Community (SPC) / Pacific Data Hub (PDH) SDMX endpoints.
- **Antimeridian Polygon Fix (`h3Binner.js`)**: Centroid-relative longitude wrapping (+180°/-180°) to prevent H3 cell tearing across Fiji and Kiribati.
- **CHVA Health Facility Layer**: Integrated 111 Fiji healthcare facilities from `earthlab-fiji-map` with 3x3 bivariate color scheme classification.

## Capabilities

### New Capabilities
- `pacific-climate-brushing-viz`: Interactive bi-directional brushing, 4-chapter scrollytelling engine, and D3 distribution charts linked to Mapbox GL H3 grids and Pacific Data Hub SDMX indicators.

### Modified Capabilities
<!-- None -->

## Impact

- **Frontend**: Adds `StorytellerDeck.tsx`, `LinkedRiskCharts.tsx`, `useBrushingState.ts`, and embeds them into `ResultPanel.tsx` and `AppLayout.tsx`. Adds D3 micro-modules (`d3-scale`, `d3-brush`, `d3-selection`, `d3-array`) to `frontend/package.json`.
- **Backend**: Fixes longitude wrapping in `backend/services/h3Binner.js`.
- **Data**: Reuses Pacific Data Hub SDMX API pipeline, NetCDF climate rasters, and Fiji CHVA dataset.

## Status: superseded (2026-07-30)

**This change was not shipped.** Direction was redirected by the PI on 2026-07-30 and
work stopped. The change is archived as a reference, not as a completed capability — its
delta spec was deliberately **not** synced into `openspec/specs/`, because the headline
bi-directional brushing feature was never empirically verified as working.

Read `docs/brushing-viz-retrospective.md` first for what is worth reusing and what is
not, then `docs/brushing-viz-debug-findings.md` for the line-by-line technical record.

## Verification Follow-up (2026-07-30)

> **Superseded — the paragraph below was accurate at commit `042e5e5` and is false as of
> `164a59e` onward.** Retained for history. Corrections: chart records now use real
> `chva-N` IDs matching the map features; `map.setFeatureState()` is invoked with
> stale-state cleanup; the histogram and `d3.brushX` interaction exist; map hover covers
> CHVA and updates brushing state; and chapters apply presets with an "Explore Freely"
> reset. What remains genuinely unverified is whether chart→map and map→chart linking
> were ever *observed* working — see Part 4 of the debug-findings doc.

The original implementation checklist was marked complete, but verification found
that several core interactions are only scaffolded rather than functional. The
frontend builds and static H3 antimeridian test pass, and the CHVA endpoint now
returns 111 facilities from `data/layers/CHVADataSeperatedCoordinatesFile.csv`.
However, chart data still uses mock `fj_*` IDs that do not identify rendered H3
or CHVA features, there is no `map.setFeatureState()` invocation, and the
histogram/`d3.brushX` interaction is absent. Map hover does not include CHVA or
update brushing state, and story transitions do not apply chart presets or offer
the required open-exploration control.

The following GitHub issues track the remediation patches:

- [#4 Restore chart-to-map H3 feature-state brushing](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/4)
- [#5 Link CHVA and H3 map hover/click events back to risk charts](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/5)
- [#6 Complete story chapter controls and chapter-specific brushing presets](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/6)
- [#7 Repair visual-regression coverage for storyteller and dynamic map layers](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/7)

## Latest UI/Data Adjustments

- Fiji-focused Chapters 1 and 2 set the analysis H3 resolution to 7 so any
  follow-up Fiji heat-risk analysis uses a detailed grid. Wider Pacific chapters
  retain the coarser resolution preset.
- The left analysis controls rail is collapsible; when hidden it leaves a compact
  Show control so the map remains usable at full width.
- CHVA facility points are styled by facility type: red hospitals, orange health
  centres, and blue nursing stations, with a matching map legend.
- The sea-level H3 layer now uses resolution 7 consistently. Cells are emitted
  only when their H3 centroid is inside the source land polygon, preventing
  intersecting coastal cells from rendering over water.
- The analysis rail collapses in both dimensions: its hidden state is a compact
  square control rather than a full-height or full-width overlay.
