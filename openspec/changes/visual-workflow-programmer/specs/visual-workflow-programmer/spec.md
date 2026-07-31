## ADDED Requirements

### Requirement: Workflow rendered as a column-based node graph

The `WorkflowViewer` SHALL render the chatbot-suggested GIS pipeline as a left-to-right column-based flow chart of typed nodes (Dataset Input, Analytical Tool, Map Output) instead of a vertical accordion list. Node positions SHALL be computed deterministically from the `WorkflowStep[]` array without user drag-and-drop.

#### Scenario: Three-step Fiji hospital workflow renders three columns

- **WHEN** the chatbot emits a workflow containing three steps (`select_features_by_attribute`, `buffer_geometry`, `zonal_statistics`)
- **THEN** the viewer renders a Dataset Input node for the initial source layer, two Tool nodes for the intermediate steps, and a Map Output node for the final step's `outputs[0]`, arranged left-to-right in separate columns.

#### Scenario: Empty workflow renders an empty canvas placeholder

- **WHEN** the chatbot emits a workflow with `steps: []`
- **THEN** the viewer renders an empty-canvas placeholder with a "No workflow steps to display" message and renders no nodes or edges.

### Requirement: SVG edges represent data flow between steps

The viewer SHALL draw a single absolutely-positioned SVG layer behind the node HTML layer containing one Bézier path per data-flow connection. An edge SHALL connect a step's `outputs` entry to the next step's matching `inputs` entry by normalised layer-name matching (case-insensitive, trimmed). Edges SHALL becup-shaped cubic Béziers from the source node's output port to the target node's input port.

#### Scenario: Edge connects output to next step input with matching layer name

- **WHEN** step 1 has `outputs: ["fiji_hospitals"]` and step 2 has `inputs: { input_layer: "fiji_hospitals", ... }`
- **THEN** the viewer draws a single edge between the step 1 node output port and the step 2 node `input_layer` input port.

#### Scenario: Unresolved input has no edge and does not throw

- **WHEN** a step's `input_layer` value does not match any previous step's `outputs`
- **THEN** the viewer omits the edge for that input and does not throw or render a dangling path.

#### Scenario: Re-running execution re-animates edges

- **WHEN** the user clicks "Approve & Run Workflow" a second time after a previous completed run
- **THEN** the SVG edges animate their dash-array again from the start, with no leftover animation state from the previous run.

### Requirement: Flowing dash-array animation on active edges

Edges feeding a `running` node SHALL animate their `stroke-dashoffset` to produce a flowing dash effect. Edges connected to `pending`, `success`, or `failed` nodes SHALL be static.

#### Scenario: Only edges feeding the running node animate

- **WHEN** step 2 has status `running` and steps 1 and 3 have statuses `success` and `pending` respectively
- **THEN** only the edge from step 1 to step 2 animates its dash-array; the edge from step 2 to step 3 remains static.

### Requirement: Inline parameter editing on tool nodes

Tool nodes SHALL render an inline form exposing each `inputs` entry. Numeric fields and the `expression` field SHALL be editable text/number inputs. Other fields SHALL render as read-only values. Edits SHALL mutate the active `WorkflowStep[]` state owned by the viewer and SHALL re-derive edges from the updated input layer names.

#### Scenario: Editing a numeric input updates workflow state

- **WHEN** the user changes the `distance` input of the `buffer_geometry` step from `2000` to `1500`
- **THEN** the viewer's local `steps` state is updated with `inputs.distance = 1500` and the change is reflected in the parameter form on the next render.

#### Scenario: Editing an input_layer reference re-routes the edge

- **WHEN** the user edits `inputs.input_layer` of step 2 from `fiji_hospitals` to another existing output name
- **THEN** the viewer redraws the edge to connect step 2's `input_layer` port to the step that produces that output, and removes the previous edge.

#### Scenario: Read-only parameter fields are non-editable

- **WHEN** a parameter value is a non-numeric type other than `expression` (e.g. an array `["mean", "max"]`)
- **THEN** the value renders as a read-only span and exposes no input element.

#### Scenario: Parameter inputs are disabled during execution

- **WHEN** `executionState` is `running`
- **THEN** all inline parameter inputs are disabled and cannot be edited until execution completes or is reset.

### Requirement: Execution status mapped to node visual state

Each node SHALL display a status indicator (`pending` / `running` / `success` / `failed`) using the existing icon set. A `running` node SHALL apply a blue border glow (`ring-2 ring-blue-50 border-blue-300`), a `success` node SHALL apply a neutralised border, and a `failed` node SHALL apply a rose border glow.

#### Scenario: Running node shows blue glow and spinner status icon

- **WHEN** a step's status is `running`
- **THEN** the corresponding node renders with `ring-2 ring-blue-50 border-blue-300` and the spinning `...` status icon.

#### Scenario: Failed node shows rose glow and cross icon

- **WHEN** a step's status is `failed`
- **THEN** the corresponding node renders with a rose border glow and the `✕` status icon.

### Requirement: Deterministic positional node typing

The viewer SHALL derive each node's kind by its position in the `steps[]` array: the first step's input layer is rendered as a Dataset Input node, intermediate steps as Tool nodes, and the final step's `outputs[0]` as a Map Output node. The viewer SHALL NOT require a `kind` field on `WorkflowStep`.

#### Scenario: Single-step workflow renders Dataset Input and Map Output only

- **WHEN** the workflow contains exactly one step
- **THEN** the viewer renders a Dataset Input node for the step's source layer and a Map Output node for the step's `outputs[0]`, with one edge between them, and renders no Tool node.

### Requirement: Workflow completion dispatches existing workflow-complete event

On completion of the mock execution pipeline, the viewer SHALL dispatch a `workflow-complete` `CustomEvent` on `window` with the same `detail` shape (`{ features, center, zoom }`) consumed by `AppLayout`. The viewer SHALL NOT change the event name or `detail` contract.

#### Scenario: Completed workflow dispatches features to MapCanvas

- **WHEN** the final step transitions to `success` and `executionState` becomes `completed`
- **THEN** the viewer dispatches `window.dispatchEvent(new CustomEvent("workflow-complete", { detail: { features, center, zoom } }))` and `AppLayout`'s existing listener calls `setHighlightedFeatures(features)`.

### Requirement: useWorkflowExecution hook encapsulates execution state

The execution state machine (`executionState`, `currentStepIndex`, `stepStatuses`, and the mock timer pipeline) SHALL be extracted into a `useWorkflowExecution` hook. The hook SHALL clear any pending timers when `start()` is called and on hook unmount. The hook SHALL expose a stable `start` function and a `reset` function returning statuses to all-`pending`.

#### Scenario: Calling start twice cancels timers from the first run

- **WHEN** the user clicks "Approve & Run Workflow" while a previous run is still in progress
- **THEN** all `setTimeout` timers from the previous run are cleared before the new run begins, and no orphaned status updates fire.

#### Scenario: Unmounting the viewer mid-run cancels pending timers

- **WHEN** the `WorkflowViewer` unmounts while `executionState` is `running`
- **THEN** any pending mock execution `setTimeout` handles are cleared and no `workflow-complete` event is dispatched after unmount.

### Requirement: Overlay chrome sized for horizontal graph canvas

The active-workflow overlay in `AppLayout` SHALL be wide enough to host a horizontal flow canvas (at least `w-[min(900px,90vw)]`). The graph canvas SHALL scroll horizontally and vertically independently of the pinned title and run-control chrome. The overlay SHALL retain `pointer-events` only on itself so the `MapCanvas` underneath remains interactive outside the overlay bounds.

#### Scenario: Overlay widens to host three columns side by side

- **WHEN** a three-step workflow is opened
- **THEN** the overlay is at least `720px` wide (or `90vw` on narrower viewports) and all three node columns are visible without vertical stacking.

#### Scenario: Map stays interactive outside the overlay

- **WHEN** the user clicks on the `MapCanvas` area outside the workflow overlay bounds
- **THEN** the click is received by the map (e.g. drawing geometry) and is not swallowed by the overlay.