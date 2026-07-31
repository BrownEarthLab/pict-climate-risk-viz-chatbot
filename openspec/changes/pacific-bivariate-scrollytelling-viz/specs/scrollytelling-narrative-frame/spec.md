## ADDED Requirements

### Requirement: One Encoding Visible Per Chapter
Each narrative chapter SHALL present exactly one thematic encoding. Advancing a chapter SHALL replace the active encoding rather than adding a layer on top of the previous one.

Rationale and source: lab notes, "Scrollytelling dataviz's let you focus on one feature/attribute at a time so the viewer doesn't get distracted by overlapping layers on the same map."

#### Scenario: Advancing replaces rather than stacks
- **WHEN** the reader advances from one chapter to the next
- **THEN** exactly one thematic layer reports `visibility: "visible"`
- **AND** the previous chapter's thematic layer reports `visibility: "none"`

#### Scenario: Chapter state is recoverable
- **WHEN** a chapter is re-entered after navigating away
- **THEN** its declared encoding, camera position, and legend mode are reapplied

### Requirement: Analysis Output Renders Beside The Map, Not On It
The map SHALL carry only the climate stressor encoding. Derived analysis — distributions, summary statistics, and uncertainty — SHALL render in panels adjacent to the map.

Rationale and source: lab notes, "Map analysis should not be displayed on the map itself (just the climate stressor)."

#### Scenario: Distribution charts are outside the map canvas
- **WHEN** any chapter is active
- **THEN** the distribution and box-plot panels render outside the Mapbox canvas element

### Requirement: Opening Splash Screen Is Minimal
The application SHALL open on a splash view carrying a title, a one-sentence framing, the search control, and a single entry point into the narrative. It SHALL NOT present the full control surface on first paint.

Rationale and source: lab notes, "Minimal information/analysis for opening splash screen."

#### Scenario: Splash precedes the analysis view
- **WHEN** the application is loaded at its root path
- **THEN** the splash view is displayed
- **AND** the layer control surface is not yet displayed

#### Scenario: Entering the narrative dismisses the splash
- **WHEN** the reader activates the narrative entry point
- **THEN** the splash view is dismissed and the first chapter's encoding is applied

### Requirement: Free Exploration Clears Narrative State
The system SHALL provide a control that exits the narrative, clears chapter-imposed filters and camera constraints, and leaves ordinary brushing available.

Rationale: `openspec/changes/archive/2026-07-30-pacific-climate-brushing-viz/tasks.md` task 11.2 established this control; v1's implementation is being carried forward as a requirement rather than reinvented.

#### Scenario: Exiting clears chapter filters
- **WHEN** the reader activates free exploration
- **THEN** no chapter-imposed selection remains active
- **AND** the legend and search controls remain operable

### Requirement: Narrative State Does Not Override Manual Selection
While the narrative frame is mounted, a reader's manual layer or legend selection SHALL persist until the reader changes chapters. Chapter presets SHALL be applied on chapter transition only.

Rationale: `docs/brushing-viz-retrospective.md` §2.4, Patch 2 — in v1 an unstable callback identity caused the deck's effect to re-run every parent render and reset the active layer, making manual selection impossible while the deck was mounted.

#### Scenario: Manual selection survives re-render
- **WHEN** the reader selects a legend cell and the parent component re-renders for an unrelated reason
- **THEN** the reader's selection is still active

#### Scenario: Chapter change does apply its preset
- **WHEN** the reader advances to a chapter that declares a preset encoding
- **THEN** that preset is applied
