## 1. Test Scaffolding (TDD) & Dependencies

- [x] 1.1 Add D3 micro-dependencies (`d3-scale`, `d3-brush`, `d3-selection`, `d3-array`, `@types/d3`) to `frontend/package.json` and run `npm install`.
- [x] 1.2 Scaffold test assertion script for `h3Binner.js` antimeridian wrapping under `backend/tests/test_h3_antimeridian_wrap.py` or JS module check.

## 2. H3 Antimeridian Longitude Wrap Fix

- [x] 2.1 Update `cellIndexToFeature` in `backend/services/h3Binner.js` to compute wrapped longitude coordinates relative to cell center longitudes (`if (lng - centerLng > 180) wrappedLng -= 360; else if (lng - centerLng < -180) wrappedLng += 360`).
- [x] 2.2 Verify `node --check backend/services/h3Binner.js` passes.

## 3. Shared Brushing & Linking State Hook

- [x] 3.1 Create `frontend/src/state/useBrushingState.ts` exporting `useBrushingState` hook with `selectedIds: Set<string>`, `hoveredId: string | null`, `activeChapter: number | null`, and `source: "MAP" | "CHART" | "STORY" | null`.
- [x] 3.2 Add `requestAnimationFrame` throttle wrapper to prevent main thread rendering lag.

## 4. D3 Linked Risk Charts Component

- [x] 4.1 Create `frontend/src/components/map/LinkedRiskCharts.tsx` rendering a D3.js 2D Scatterplot (Risk vs. Population/Exposure) and 1D Histogram (Heat Exposure Distribution).
- [x] 4.2 Attach `d3-brush` (2D box) and `d3-brushX` (1D slider) gesture listeners forwarding selected IDs to `useBrushingState`.
- [x] 4.3 Add Data Provenance Footer badge ("Source: Pacific Data Hub SDMX / Pacific Community (SPC)") and 3x3 Bivariate palette legend toggle.

## 5. 4-Chapter Guided Storyteller Deck Component

- [x] 5.1 Create `frontend/src/components/story/StorytellerDeck.tsx` rendering a responsive narrative control bar with 4 guided chapters: Chapter 1 (Extreme Heat Days), Chapter 2 (111 Healthcare Clinics at Risk), Chapter 3 (Pacific Resilience PDH Indicators), and Chapter 4 (Open AI Exploration).
- [x] 5.2 Wire chapter step buttons to trigger `map.flyTo()`, map layer visibilities, and D3 brush presets.

## 6. Mapbox GL GPU Highlight & Event Wiring

- [x] 6.1 Update `frontend/src/hooks/useMapbox.ts` and `frontend/src/components/map/MapCanvas.tsx` to listen for `useBrushingState` updates and apply `map.setFeatureState()` highlighting to active layer features on the GPU.
- [x] 6.2 Attach Mapbox `mousemove` / `click` event handlers to update `hoveredId` and `selectedIds` in `useBrushingState`.

## 7. App Layout & Dashboard Integration

- [x] 7.1 Embed `<StorytellerDeck />` at the top of the dashboard layout in `AppLayout.tsx`.
- [x] 7.2 Embed `<LinkedRiskCharts />` into `ResultPanel.tsx`.
- [x] 7.3 Add story starter cards ("Story 1: Extreme Heat Days", "Story 2: Fiji Hospitals at Risk", "Story 3: Pacific Water & Power") into `MainChat.jsx` starter prompts.

## 8. Verification & Demo Polish

- [x] 8.1 Run `cd frontend && npm run lint` to verify zero TypeScript or React Hook linting errors.
- [x] 8.2 Run `cd frontend && npm run build` to verify Vite production build succeeds.
- [x] 8.3 Conduct manual verification walkthrough of Chapters 1 $\rightarrow$ 4 and test 60fps bi-directional brushing between Mapbox map and D3 charts for tomorrow's lab meeting.

## 9. Restore Chart-to-Map GPU Brushing ([#4](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/4))

- [x] 9.1 Define a stable ID contract for chart data and rendered H3, asset, and CHVA features; replace the mock-only `fj_*` mapping.
- [x] 9.2 Add rAF-throttled `map.setFeatureState()` application and stale-state cleanup for chart-driven selections.
- [x] 9.3 Implement the linked heat histogram with `d3.brushX` and connect it to the same selection state.

## 10. Restore Map-to-Chart Linking ([#5](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/5))

- [x] 10.1 Add H3 and CHVA hover/click handlers that update `hoveredId` and `selectedIds` with `source: "MAP"`.
- [x] 10.2 Render CHVA facility/tool-tip provenance and ensure the matching chart mark receives active hover/selection styling.
- [ ] 10.3 Add loop-prevention coverage for chart-originated and map-originated updates.

## 11. Complete Story Presets and Open Exploration ([#6](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/6))

- [x] 11.1 Define and apply a map-layer and chart-brush preset for each of the four chapters.
- [x] 11.2 Add Next Chapter and Explore Freely controls; the latter must clear story filters and restore normal brush interaction.

## 12. Repair Browser Regression Coverage ([#7](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/7))

- [x] 12.1 Replace hard-coded storyteller test URLs with Playwright `baseURL`; the storyteller spec passes on the configured port.
- [ ] 12.2 Diagnose and fix the sea-level dynamic-layer toggle/legend regression; cover all dynamic layers and CHVA visibility.
- [ ] 12.3 Add browser tests for GPU feature-state brushing, map-to-chart linking, and story preset reset behavior.
- [x] 12.4 Use H3 resolution 7 for sea-level polygons and omit cells whose centroids fall outside the source land polygon (water mask).
- [x] 12.5 Make the analysis rail collapse horizontally and vertically to a compact map control.
