## Automated Tests

The repo uses Playwright for end-to-end tests (`frontend/e2e/*.spec.ts`, run via `npx playwright test` from `frontend/`). There is no unit test runner configured today; this change therefore introduces lightweight Vitest unit tests alongside the existing Playwright setup for the pure-logic modules (`useWorkflowLayout`, `useWorkflowExecution`).

- `npm run lint` (in `frontend/`): ESLint passes across new files in `src/components/chat/workflow/` and edited `WorkflowViewer.tsx` / `AppLayout.tsx`. Verifies hook-import ordering, exhaustive-deps, and TS strict-mode compatibility for the new execution hook and layout hook.
- `npm run build` (in `frontend/`): Vite production build succeeds, verifying that the refactored `WorkflowViewer` and new workflow submodules typecheck and tree-shake correctly.
- `npx playwright test e2e/workflow-viewer.spec.ts`: New Playwright suite verifying the visual workflow overlay end-to-end (see scenarios below).
- `npx vitest run src/components/chat/workflow` (new): Vitest unit tests for pure logic:
  - `useWorkflowLayout`: column x-position increments by one column per step, nodes are vertically centred within a column, and edges resolve `outputs` → matching `inputs[input_layer]` with normalised layer names. Verifies the "Unresolved input has no edge and does not throw" scenario by asserting no edge is emitted for an unmatched input.
  - `useWorkflowExecution`: asserts initial state is all-`pending`; `start()` advances statuses through `running` → `success` per step using fake timers; calling `start()` twice clears timers from the first run (no orphaned `workflow-complete` dispatch); unmounting mid-run clears pending timers; on completion dispatches `workflow-complete` with `{ features, center, zoom }`.

## Manual Verification

- **Three-column layout for the Fiji hospital workflow**:
  - **WHEN** the user triggers the mock "hospital" / "workflow" conversation and clicks "View Workflow on Map" in the chat
  - **THEN** the overlay opens at least `720px` wide (or `90vw` on narrow viewports) and shows three nodes arranged left-to-right: a Dataset Input node (`pacific_island_hospitals`), a Tool node (`buffer_geometry`), and a Map Output node (`hospitals_with_heat_stats`), with two SVG Bézier edges connecting them.

- **Inline numeric parameter editing**:
  - **WHEN** the user opens the `buffer_geometry` Tool node, changes the `distance` field from `2000` to `1500`, and blurs the input
  - **THEN** the input retains `1500`, the rendered parameter form reflects the new value, and the surrounding node border does not switch to `running` styling (no execution triggered).

- **Edge re-routes on input layer rename**:
  - **WHEN** the user edits `inputs.input_layer` of the second step to a different existing output name (manually via DevTools or by introducing a custom mock workflow)
  - **THEN** the SVG edge from the second step re-connects to the step that produces the renamed output, and the previous edge disappears without throwing.

- **Flowing dash animation only on the active edge**:
  - **WHEN** the user clicks "Approve & Run Workflow"
  - **THEN** during step 2's execution, only the edge from step 1 to step 2 animates its dash-array; the edge from step 2 to step 3 remains solid until step 2 succeeds. The step 2 node shows a blue border glow (`ring-2 ring-blue-50 border-blue-300`) and the spinning `...` status badge.

- **Status icon mapping**:
  - **WHEN** the run completes
  - **THEN** every node transitioned through `success` shows the green `✕`-replaced `✓` icon and a neutralised border. If a manual mock is tweaked to fail a step, that node shows the rose border glow and `✕` icon.

- **Re-running execution re-animates edges**:
  - **WHEN** the user clicks "Approve & Run Workflow" a second time after a completed run
  - **THEN** all node statuses reset to `pending`, edges re-animate from the start with no leftover dash animation from the previous run, and only one `workflow-complete` event fires when the new run finishes.

- **`workflow-complete` event still drives the map**:
  - **WHEN** the mock run completes
  - **THEN** three Fiji hospital point features (`Colonial War Memorial Hospital`, `Lautoka Hospital`, `Levuka Hospital`) appear as highlighted features on the Mapbox canvas, centred on `[178.06, -17.85]` at zoom `8.5`, identical to pre-change behaviour.

- **Map remains interactive outside the overlay**:
  - **WHEN** the user clicks "Draw for Spatial Query" on the map area not covered by the workflow overlay
  - **THEN** the draw mode activates and a polygon can be drawn, confirming the overlay does not swallow pointer events outside its bounds.

- **Overlay chrome stays pinned while the canvas scrolls**:
  - **WHEN** a workflow is wide enough to require horizontal scroll (e.g. a 4+ step mock workflow)
  - **THEN** the title, "Active GIS Workflow" header, and "Approve & Run Workflow" button remain pinned while only the node canvas scrolls horizontally and vertically.

- **Empty workflow placeholder**:
  - **WHEN** DevTools is used to inject a workflow with `steps: []` into the `onViewWorkflowOnMap` callback
  - **THEN** the overlay renders an empty-canvas placeholder with "No workflow steps to display" and renders no nodes or SVG edges, without throwing.