## Why

The current chatbot prototype presents multi-step GIS tool call pipelines as a static vertical accordion list. This format makes it difficult for users to visually grasp the data flow (inputs, spatial tools, and final outputs) and spatial dependencies. A node-based visual workflow programmer will represent these pipelines as interactive dataflow graphs, allowing users to understand the sequence, adjust execution parameters inline, and see data flow through the system.

## What Changes

- **Node Graph Visualization**: Replace the vertical accordion in the `WorkflowViewer` overlay with an interactive column-based flow chart rendering.
- **Dynamic Node Components**: Introduce custom cards representing:
  - **Dataset Inputs**: Vector/raster source layers (e.g. `pacific_island_hospitals`, `wet_bulb_temperature_2050`).
  - **Analytical Tools**: PostGIS/GDAL analytical tools (e.g. `select_features_by_attribute`, `buffer_geometry`, `zonal_statistics`) with inline form inputs for parameter adjustment.
  - **Map Outputs**: Final layer outputs that trigger map overlay renders.
- **Data Flow Connections**: Draw SVG edges connecting outputs of previous steps to inputs of subsequent steps, with running animations (e.g., flowing dash-arrays) to indicate active processing.
- **Interactive Parameters**: Enable inline editing of numeric/text parameter fields inside tool nodes, directly modifying the active workflow state before execution.
- **State Feedback**: Map the execution pipeline states (Pending, Running, Success, Failed) directly to node border glows and status indicators.

## Capabilities

### New Capabilities
- `visual-workflow-programmer`: Renders chatbot-suggested GIS workflows as interactive node-and-edge graphs, allowing parameter adjustments, execution tracking, and custom event dispatches to update Mapbox canvas layers.

### Modified Capabilities
<!-- None. Empty since no existing specifications are defined in openspec/specs. -->

## Impact

- **Frontend Core Components**:
  - `frontend/src/components/chat/WorkflowViewer.tsx`: Refactored to render the SVG/HTML node canvas layout instead of the vertical list.
  - `frontend/src/components/layout/AppLayout.tsx`: Displays the visual workflow program as an interactive popup overlay on top of the MapCanvas.
- **State & Event hooks**:
  - `frontend/src/state/useConversations.js`: Will handle interactive parameter updates from the visual editor.
- **Dependencies**:
  - Pure React & Tailwind v4 layout. No heavy external visual rendering packages are introduced.
