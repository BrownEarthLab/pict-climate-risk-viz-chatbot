## Automated Tests

- `cd frontend && npx playwright test`: Runs Playwright E2E integration test suites validating Mapbox canvas mounts, polygon drawing modes activation, and coordinates echoes via backend `/api/spatial-query` REST calls.

## Manual Verification

- **Chat Interface & Message Flow**:
  - **WHEN** the user types "Show Fiji heat risk workflow" and clicks send in the chat panel.
  - **THEN** a user message bubble renders right-aligned, followed by assistant typing indicator dots, which resolve into a formatted assistant message containing the Fiji Hospital Heat Exposure Analysis workflow callout.
- **Workflow Ingestion Triggers**:
  - **WHEN** the user clicks "Inspect & Run on Map" on the proposed Fiji workflow card.
  - **THEN** the workflow overlay panel opens, the Mapbox canvas invokes a flyTo coordinate update centering on Fiji coordinates `[178.06, -17.85]`, and mock clinic features are mapped with highlighted icons.
- **Map Layers Selector**:
  - **WHEN** the user clicks the "Wet-Bulb" tab inside the floating Map Layers drawer.
  - **THEN** the active layer updates and a color gradient scale from 15°C to 27°C renders in the legend panel.
- **Settings Modal Preferences**:
  - **WHEN** the user clicks "Settings" in the footer, switches to the Data tab, and toggles the uncertainty warnings checkbox.
  - **THEN** the selection state updates and persists across browser refreshes in `localStorage`.
- **Data Ingestion Script Execution**:
  - **WHEN** a developer runs `python dataset-explorer/h3_processing/netcdf_to_geojson.py`.
  - **THEN** the process reads `pacific_islands_tas_historical.nc`, computes H3 cell grids at Level 5, and outputs a valid GeoJSON file under `frontend/public/`.
