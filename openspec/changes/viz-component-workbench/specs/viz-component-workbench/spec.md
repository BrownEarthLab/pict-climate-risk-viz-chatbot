## ADDED Requirements

### Requirement: Fixture Data Is Confined To The Workbench Entry
Fixture data SHALL be reachable only from the workbench entry point. The application entry SHALL NOT import, bundle, or render any fixture module.

#### Scenario: Production bundle contains no fixtures
- **WHEN** the production bundle is built from the application entry
- **THEN** no module under the fixtures directory appears in the output

#### Scenario: Application refuses fixture-flagged data
- **WHEN** a dataset whose `provenance` is `"fixture"` is passed to the application entry
- **THEN** the application raises an error rather than rendering it

#### Scenario: Workbench is absent from the deployed application
- **WHEN** the application is served from a production build
- **THEN** the workbench entry is not reachable

### Requirement: Every Dataset Declares Its Provenance
Every dataset consumed by a visualization component SHALL carry a `provenance` field valued `"real"` or `"fixture"`. The field SHALL be required, with no default.

#### Scenario: Missing provenance is rejected
- **WHEN** a dataset is supplied without a `provenance` field
- **THEN** it is rejected with an error naming the offending dataset

#### Scenario: Real data passes through unmodified
- **WHEN** a dataset declares `provenance: "real"`
- **THEN** it renders in either entry without a watermark

### Requirement: Fixture Renderings Are Visibly Marked
Any view rendering fixture data SHALL display a persistent visual marker identifying the content as synthetic. The marker SHALL be positioned so that it is captured by a screenshot of the visualization, and SHALL NOT be dismissible.

Rationale: the realistic failure is a screenshot reused later without context, not deliberate misrepresentation.

#### Scenario: Watermark is present on fixture views
- **WHEN** a component renders data flagged `"fixture"`
- **THEN** a synthetic-data marker is visible within the bounds of the visualization

#### Scenario: Watermark cannot be dismissed
- **WHEN** a fixture view is rendered
- **THEN** no control exists that removes the marker while leaving the visualization displayed

### Requirement: Fixtures Do Not Attach Synthetic Values To Real Place Names
Fixture datasets SHALL NOT associate synthetic measurements with real geographic or administrative names. Where real geometry is required to answer a rendering question, category and series labels SHALL be generic.

#### Scenario: Rose chart uses generic axis labels
- **WHEN** the rose chart renders fixture data
- **THEN** its axis labels are generic identifiers and none is a real province, division, country, territory, or subregion name appearing in the project's reference geometry

#### Scenario: Hotspot layer uses generic class names
- **WHEN** the categorical hotspot layer renders over real tikina geometry
- **THEN** its classes are named generically and none uses an ESRI category name such as "Persistent Hot Spot"

### Requirement: Workbench Renders Components In Isolation
The workbench SHALL render each component independently, with controls to vary its inputs, so that a component can be exercised without the application's map, state, or narrative frame being present.

Rationale: `docs/brushing-viz-retrospective.md` §2.4 — v1 had four independent defects present simultaneously with everything wired together, making attribution impossible.

#### Scenario: A component renders without the application shell
- **WHEN** a component is opened in the workbench
- **THEN** it renders correctly with no map instance and no narrative state present

#### Scenario: Inputs can be varied
- **WHEN** a component is displayed in the workbench
- **THEN** controls exist to change its input data and re-render it

### Requirement: The Workbench Computes No Analysis
The workbench SHALL NOT compute spatial statistics, trend tests, or any derived analytical result. Fixture categories SHALL be supplied as literal data.

Rationale: this change answers rendering questions only. Analysis arrives with real data, in the change that consumes it.

#### Scenario: No statistical computation is present
- **WHEN** the workbench source is inspected
- **THEN** it contains no Getis-Ord, Mann-Kendall, or comparable statistical implementation

#### Scenario: Hotspot categories are literals
- **WHEN** the categorical hotspot layer renders
- **THEN** its per-feature class values are read directly from the fixture rather than derived
