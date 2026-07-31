## 1. Project setup & tooling

- [ ] 1.1 Add Vitest as a dev dependency in `frontend/package.json` and add a `test` script (`vitest run`) and a `test:watch` script. Install `@testing-library/react` and `jsdom` for component testing.
- [ ] 1.2 Add a `vitest.config.ts` to `frontend/` configured to use the jsdom environment and to pick up tests under `src/**/*.test.{ts,tsx}`.
- [ ] 1.3 Create the new folder `frontend/src/components/chat/workflow/` that will host the extracted hooks and node components.

## 2. Pure-logic hooks

- [ ] 2.1 Implement `useWorkflowLayout` in `workflow/useWorkflowLayout.ts`: takes a `WorkflowStep[]`, returns `{ nodes, edges }` where each node has `{ id, kind, stepIndex, column, x, y, portYs }` (`kind` derived positionally) and each edge has `{ id, fromNode, fromPort, toNode, toPort }` resolved by normalising (lowercase + trim) matching between a step's `outputs` entries and later steps' `inputs` values.
- [ ] 2.2 Implement `useWorkflowExecution` in `workflow/useWorkflowExecution.ts`: encapsulates `executionState`, `currentStepIndex`, `stepStatuses`, and the mock `setTimeout` pipeline. Expose `start()` and `reset()`. Track all pending timeout ids in a ref and clear them on `start()` and on unmount. On completion dispatch `window.dispatchEvent(new CustomEvent("workflow-complete", { detail: { features, center, zoom } }))` with the existing mock Fiji hospital payload.
- [ ] 2.3 Write unit tests under `workflow/useWorkflowLayout.test.ts` covering: column positioning, vertical centring rule, edge resolution matches, unresolved-input produces no edge and does not throw, single-step workflow produces one Dataset Input + one Map Output node and one edge.
- [ ] 2.4 Write unit tests under `workflow/useWorkflowExecution.test.ts` covering: initial all-pending state, advancing statuses with fake timers, calling `start()` twice cancels prior timers, unmounting mid-run clears timers, completion dispatches `workflow-complete` with the expected payload shape.

## 3. Node components

- [ ] 3.1 Implement `DatasetNode` in `workflow/DatasetNode.tsx`: renders the input layer name, a dataset glyph, the data source label and uncertainty badge. Accepts `status` and applies the shared status styling (border glow + status icon).
- [ ] 3.2 Implement `ToolNode` in `workflow/ToolNode.tsx`: renders the step's `action_title`, formatted `tool_name`, the inline `ParameterForm`, diagnostics/coverage warnings, and the run-time border glow + status icon. Forwards parameter edits via an `onInputChange(stepId, key, value)` callback.
- [ ] 3.3 Implement `OutputNode` in `workflow/OutputNode.tsx`: renders the final step's `outputs[0]` as a map-output glyph with a "View on Map" affordance and shared status styling.
- [ ] 3.4 Implement `ParameterForm` in `workflow/ParameterForm.tsx`: iterates over `step.inputs` and renders an editable input (`type="number"` for numeric values, `type="text"` for `expression`) or a read-only span for other shapes. Disables all inputs when `disabled` is true (wired to `executionState === "running"`).
- [ ] 3.5 Implement `NodeStatusBadge` in `workflow/NodeStatusBadge.tsx` by extracting the existing `getStatusIcon` switch (pending ○ / running spin / success ✓ / failed ✕) so all three node types render a consistent status badge.
- [ ] 3.6 Extract `getUncertaintyColor` and `formatToolName` helpers into `workflow/formatters.ts` and import them from the node components (and remove the duplicates in the old `WorkflowViewer`).

## 4. SVG edge layer

- [ ] 4.1 Implement `WorkflowEdges` in `workflow/WorkflowEdges.tsx`: a single absolutely-positioned full-size `<svg>` overlay that maps the `edges` from `useWorkflowLayout` to cubic Bézier paths between source and target port coordinates. Falls back to node-centre coordinates if port coordinates are not yet measured.
- [ ] 4.2 Add a CSS class `.workflow-edge-flowing` (in a new `workflow/workflow-edges.css` or via Tailwind arbitrary values) that animates `stroke-dashoffset` over ~1s linear infinite; apply it only to edges whose target node has status `running`.

## 5. WorkflowViewer refactor

- [ ] 5.1 Refactor `frontend/src/components/chat/WorkflowViewer.tsx` to remove the accordion markup, the inline `getStatusIcon`/`getUncertaintyColor`/`formatToolName` helpers, and the inline mock `setTimeout` block.
- [ ] 5.2 Compose the new graph: a relatively-positioned canvas containing `<WorkflowEdges />` and the auto-laid-out `<DatasetNode />` / `<ToolNode />` / `<OutputNode />` components, sized via the `useWorkflowLayout` outputs. Maintain the existing local `steps` state and route parameter edits through the `ToolNode` callback.
- [ ] 5.3 Preserve the title, description, badge, and "Approve & Run Workflow"/"Reject Plan" controls outside the scrolling graph canvas so they stay pinned while the canvas scrolls.
- [ ] 5.4 Render the empty-canvas placeholder ("No workflow steps to display") when `workflow.steps` is empty.
- [ ] 5.5 Use a `ResizeObserver` (via `useLayoutEffect`) to measure rendered node heights and feed `portYs` back into `useWorkflowLayout` so edge endpoints align with the actual port positions; fall back to deterministic centre on first paint.

## 6. AppLayout overlay resize

- [ ] 6.1 In `frontend/src/components/layout/AppLayout.tsx`, change the `activeWorkflow` overlay container from `w-[340px]` to a breakpoint-aware width (`w-[min(900px,90vw)]`) and cap at `max-h-[calc(100%-2rem)]`. Keep the `pointer-events` semantics so the underlying `MapCanvas` remains interactive outside the overlay.
- [ ] 6.2 Pin the overlay header ("Active GIS Workflow" + Close ×) and the run-control chrome outside the scrolling canvas; allow only the inner graph canvas to overflow-scroll both directions.

## 7. Test tooling & automated verification

- [ ] 7.1 Add `frontend/e2e/workflow-viewer.spec.ts` Playwright suite covering: opening the Fiji hospital workflow, asserting three node columns render, asserting the overlay width is at least 720px, editing the `distance` parameter, running the workflow, asserting the `workflow-complete` features appear on the map, and asserting clicks outside the overlay still reach the map (draw mode activates).
- [ ] 7.2 Ensure `npm run lint` passes across new files in `src/components/chat/workflow/` and the edited `WorkflowViewer.tsx` / `AppLayout.tsx` (fix any hook rule violations introduced by the refactor).
- [ ] 7.3 Ensure `npm run build` succeeds with the refactored component tree and the new Vitest/Playwright additions (no new external runtime dependencies beyond `vitest`, `@testing-library/react`, and `jsdom`).

## 8. Manual verification pass

- [ ] 8.1 Walk through the manual verification scenarios listed in `tests.md` (column layout for Fiji workflow, edge re-route on input rename, dash animation only on active edge, status icon mapping, re-run re-animation, `workflow-complete` map overlay, map interactivity outside overlay, pinned chrome with inner scroll, empty-workflow placeholder) and confirm each behaves as specified.