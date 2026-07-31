# spatial-query-analysis Specification

## Purpose
TBD - created by archiving change baseline-project-specs. Update Purpose after archive.
## Requirements
### Requirement: Interactive Shape Drawing
The system SHALL display geometry drawing controls on the map canvas and trigger analysis options when a polygon is closed.

#### Scenario: Display analysis selection popup
- **WHEN** user draws a polygon on the map canvas
- **THEN** a map popup overlay is opened presenting "Calculate Air Temp Stats" and "Get Mean Wet-Bulb Temp" buttons.

### Requirement: Backend Zonal Calculations
The backend API `/api/spatial-query` SHALL perform point-in-polygon centroid matching on preloaded GeoJSON records and return statistics summaries.

#### Scenario: Perform air temperature zonal stats
- **WHEN** user clicks "Calculate Air Temp Stats" on a drawn geometry
- **THEN** the backend processes the polygon, matches cells from the TAS dataset, and returns a summary detailing mean, max, and min temperatures.

### Requirement: Tabular Features Listing
The frontend dashboard SHALL provide a panel display listing properties of all highlighted map features.

#### Scenario: Populate clicked query features list
- **WHEN** a list of features is loaded into the highlighted query hook
- **THEN** the sidebar list panel renders clinic/hospital names, capacities, wet-bulb risks, and descriptions.

