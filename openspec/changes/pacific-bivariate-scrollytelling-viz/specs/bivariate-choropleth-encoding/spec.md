## ADDED Requirements

### Requirement: Three Selectable Bivariate Modes
The system SHALL provide three bivariate choropleth encoding modes — `sequential-sequential`, `diverging-diverging`, and `qualitative-sequential` — and SHALL render the active mode as the sole thematic encoding on the map at any one time.

Rationale and source: lab notes, "Various ways to display bivariate choropleth maps — Normal version; Diverging-diverging legend, center is the 'norm'; Qualitative-sequential."

#### Scenario: Switching mode replaces the encoding
- **WHEN** the active mode changes from `sequential-sequential` to `diverging-diverging`
- **THEN** the map layer's fill paint is rebuilt from the new mode's color matrix
- **AND** no feature retains a fill color from the previous mode

#### Scenario: Only one thematic encoding is active
- **WHEN** any bivariate mode is active
- **THEN** exactly one bivariate fill layer has `visibility: "visible"` in Mapbox layout state
- **AND** every other bivariate fill layer has `visibility: "none"`

### Requirement: Diverging Mode Centers On A Declared Norm
The `diverging-diverging` mode SHALL classify each variable relative to an explicitly declared norm value, and the center cell of the 3×3 matrix SHALL represent "at the norm on both variables". The norm SHALL be a property of the dataset definition, not a value derived at render time from the visible extent.

Rationale: the lab notes specify "center is the 'norm'". A norm recomputed from whatever is on screen would silently change meaning as the viewport moves.

#### Scenario: Sea level anomaly uses zero as its norm
- **WHEN** the sea level anomaly variable is encoded in `diverging-diverging` mode
- **THEN** its declared norm is `0`
- **AND** features with an anomaly of `0` classify to the center band on that axis

#### Scenario: Norm is stable across viewport changes
- **WHEN** the map is panned or zoomed so that the set of visible features changes
- **THEN** each feature's assigned bivariate class is unchanged

### Requirement: Class Breaks Follow From The Mode
The classification method SHALL be determined by the active bivariate mode and SHALL NOT be a per-dataset choice. Sequential axes SHALL use quantile (tertile) breaks; diverging axes SHALL use breaks placed symmetrically about the declared norm. The system SHALL expose the resulting break values to the legend for display.

Rationale: `architecture.md` Decision 4a. The legend is the primary brush control, so an unpopulated cell is a dead control — quantile guarantees every cell has members. Diverging cannot use quantile because the center must sit at the declared norm rather than at the median.

#### Scenario: Break values are displayed, not hidden
- **WHEN** a bivariate legend is rendered
- **THEN** the numeric break values and the unit for each axis are visible to the reader

#### Scenario: Classification is reproducible
- **WHEN** the same dataset is classified twice in the same mode
- **THEN** the resulting break values are identical

#### Scenario: Every sequential legend cell is a live control
- **WHEN** a `sequential-sequential` encoding is classified
- **THEN** each of the nine legend cells has at least one member feature

#### Scenario: A distribution that defeats tertiles fails loudly
- **WHEN** ties prevent a variable being split into three non-empty quantile bands
- **THEN** classification raises an error naming the variable, rather than emitting an empty class

### Requirement: Palette Accessibility Is Verified, Not Asserted
Each mode's 3×3 palette SHALL satisfy a documented contrast and color-vision-deficiency check, and the check SHALL be executable rather than claimed in prose.

Rationale: `docs/v2-plan-appraisal.md` §5 — the externally-supplied plan asserted "colorblind-safe HSL palettes" while pairing teal/purple with green/orange, which are the pairs that collapse under deuteranopia.

#### Scenario: Palette check runs as a test
- **WHEN** the palette verification is executed
- **THEN** it reports a pass or fail per mode
- **AND** a failing palette fails the check rather than emitting a warning

#### Scenario: Adjacent classes remain distinguishable under simulation
- **WHEN** a mode's nine colors are simulated under deuteranopia
- **THEN** every pair of cells adjacent in the 3×3 matrix differs by at least the documented perceptual threshold (ΔE00 ≥ 10 — a colour-difference measure, not a luminance contrast ratio)

### Requirement: Encoding Operates At A Single Declared Scale
Each bivariate dataset SHALL declare the geographic scale of its features, and the system SHALL NOT join variables across scales within one encoding.

Rationale: verified in `docs/v2-direction-research.md` §3a — the Fiji heat grid has 102 cells while the SDMX indicators are country level over 26 PICT regions. They do not join at cell level.

#### Scenario: Mixed-scale pairing is rejected
- **WHEN** a bivariate dataset definition pairs a Fiji-cell variable with a PICT-country variable
- **THEN** the definition is rejected at load time with an explicit error naming both scales
