## Automated Tests

- `cd frontend && npm run lint`: Verifies zero TypeScript type errors or React Hook rule violations across `StorytellerDeck.tsx`, `LinkedRiskCharts.tsx`, `useBrushingState.ts`, and modified `useMapbox.ts`.
- `cd frontend && npm run build`: Verifies Vite production build compiles successfully with added D3 micro-modules.
- `cd backend && node --check services/h3Binner.js`: Verifies zero JavaScript syntax errors in modified H3 binner module.

## Manual Verification

- **Antimeridian H3 Cell Rendering**:
  - **WHEN** user loads H3 hexagon layers over Fiji (Taveuni/Vanua Levu) or Kiribati
  - **THEN** H3 cell boundary polygons render cleanly without cross-globe line stretching or broken coordinate tearing.

- **Narrative Storyteller Deck Walkthrough**:
  - **WHEN** user clicks through Chapters 1 $\rightarrow$ 4 in `StorytellerDeck`
  - **THEN** Mapbox camera smoothly flies to target SIDS coordinates, active map layers toggle, and D3 chart brush range filters update automatically to match the chapter theme.

- **Bi-Directional Brushing (Chart $\rightarrow$ Map)**:
  - **WHEN** user drags a 2D selection box over points in `LinkedRiskCharts`
  - **THEN** intersecting H3 cells and asset points on `MapCanvas` illuminate instantly (<16ms) via `map.setFeatureState()` without reloading GeoJSON.

- **Feature Linking (Map $\rightarrow$ Chart)**:
  - **WHEN** user hovers over an H3 cell or health facility on `MapCanvas`
  - **THEN** the matching SVG dot in `LinkedRiskCharts` displays an active highlight ring and tooltip showing indicator values and Pacific Data Hub provenance.

- **Data Provenance Badges**:
  - **WHEN** user inspects D3 chart footers, legends, or hover tooltips
  - **THEN** explicit dataset citations ("Source: Pacific Data Hub SDMX / Pacific Community (SPC)") are clearly visible.

## Verification Recovery Coverage

- Run `npm run test:e2e` without a manually started Vite server. Storyteller
  tests must use the configured Playwright `baseURL` and pass on the same port
  as the web-server fixture.
- Assert Chapter 2 loads all 111 features from
  `data/layers/CHVADataSeperatedCoordinatesFile.csv` and makes the CHVA point
  layer visible.
- Assert a 2D chart brush and histogram threshold brush call
  `map.setFeatureState()` for matching rendered feature IDs, then clear that
  state when the brush is cleared.
- Assert H3 and CHVA map hover/click update the matching chart mark and expose
  facility/indicator provenance in the tooltip.
- Assert every dynamic layer button makes both its Mapbox layer and its legend
  visible.
