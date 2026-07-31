## ADDED Requirements

### Requirement: The Legend Is An Interactive Control
The 3×3 bivariate legend SHALL be operable as the primary selection control. Selecting a legend cell SHALL filter the map layer and every linked chart to the features in that bivariate class.

Rationale and source: lab notes, "Bivariate legend is brush and linked to the chart itself."

#### Scenario: Selecting a cell filters the map
- **WHEN** the reader selects the legend cell at row 2, column 3
- **THEN** every map feature in that bivariate class is rendered in its highlighted state
- **AND** every map feature outside that class is rendered in its de-emphasized state

#### Scenario: Selecting a cell filters the linked charts
- **WHEN** a legend cell is selected
- **THEN** the linked distribution charts show the selected subset as distinct from the unselected remainder

#### Scenario: Re-selecting the active cell clears the selection
- **WHEN** the reader selects the legend cell that is already selected
- **THEN** the selection is cleared
- **AND** all features return to their unselected rendering

### Requirement: Highlighting Uses Mapbox Feature State
Map highlighting driven by legend or chart selection SHALL be applied through `map.setFeatureState`, and the layer's paint properties SHALL read `["feature-state", ...]` so that the state change is visible.

Rationale: `docs/brushing-viz-retrospective.md` §2.4 — in v1, `setFeatureState` was called correctly but no CHVA paint property referenced `feature-state`, making every call a visual no-op.

#### Scenario: Selection sets feature state
- **WHEN** a legend cell is selected
- **THEN** `getFeatureState` for a feature in that class reports the highlighted flag as true

#### Scenario: Clearing selection removes feature state
- **WHEN** the selection is cleared
- **THEN** no feature in the source reports the highlighted flag as true

#### Scenario: Paint reads feature state
- **WHEN** the bivariate fill layer is registered
- **THEN** at least one of its paint properties references `["feature-state", ...]`

### Requirement: One Identity Contract Across Views
Every record SHALL carry a single stable identifier that serves simultaneously as the Mapbox feature id, the source's `promoteId` value, and the key used by the linked charts.

Rationale: `docs/brushing-viz-retrospective.md` §1.3 — the identity contract is the prerequisite for any cross-view linking and must be settled before either view is built.

#### Scenario: Identifiers agree across map and chart
- **WHEN** a feature is selected on the map
- **THEN** the linked chart locates its corresponding mark using the identical identifier string

#### Scenario: Source declares promoteId
- **WHEN** a brushable GeoJSON source is added
- **THEN** its `promoteId` names the same property used as the chart record key

### Requirement: Search Brushes A Named Region
The system SHALL provide a search control that accepts a country or province name and applies the corresponding selection across the map and the linked charts.

Rationale and source: lab notes, "Search bar for brushing and linking certain countries on the graph."

#### Scenario: Searching selects a region
- **WHEN** the reader searches for a region name present in the active dataset
- **THEN** that region's features become the active selection in both the map and the charts

#### Scenario: Unmatched search reports no match
- **WHEN** the reader searches for a name absent from the active dataset
- **THEN** the control reports that no region matched
- **AND** the existing selection is left unchanged

### Requirement: Tooltips Render Typed Fields, Never Raw Properties
Tooltips SHALL be rendered from an explicitly typed interaction payload with human-readable labels and units. The system SHALL NOT render raw feature property keys.

Rationale and source: lab notes, "Everything is clean and self-explanatory, no raw attribute name that only the developer understands." Mechanism from `docs/v2-reference-implementations.md` §4.

#### Scenario: Tooltip shows readable labels
- **WHEN** the reader hovers a map feature
- **THEN** the tooltip displays labelled values with units and a source attribution

#### Scenario: No developer-facing slugs appear
- **WHEN** any tooltip is displayed
- **THEN** no raw property key such as `extreme_heat_days_mean` or `shapeISO` appears in its text
