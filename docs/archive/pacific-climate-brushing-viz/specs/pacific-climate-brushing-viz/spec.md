## ADDED Requirements

### Requirement: 4-Chapter Guided Story Arc Engine
The system SHALL provide an interactive narrative control component (`StorytellerDeck.tsx`) that leads users through four sequential climate chapters: Chapter 1 (Extreme Heat Days), Chapter 2 (111 Healthcare Clinics at Risk), Chapter 3 (Pacific Resilience & Water/Energy Indicators), and Chapter 4 (Open AI Exploration).

#### Scenario: Chapter step transition
- **WHEN** user clicks "Next Chapter" in `StorytellerDeck`
- **THEN** system MUST execute `map.flyTo()` to the chapter target coordinates, toggle active Mapbox layers, and update D3 chart brush range filters to match the chapter theme.

#### Scenario: Return to open exploration
- **WHEN** user selects Chapter 4 or clicks "Explore Freely"
- **THEN** system MUST unlock all interactive D3 brush handles, Mapbox controls, and chatbot starter prompt cards.

### Requirement: Bi-Directional Chart-to-Map Brushing
The system SHALL support 2D rectangular box selection (`d3.brush()`) and 1D threshold slider handles (`d3.brushX()`) on D3 distribution charts that highlight intersecting Mapbox GL spatial features in real time without GeoJSON re-parsing.

#### Scenario: D3 scatterplot 2D brush drag
- **WHEN** user drags a 2D selection box over points in the scatterplot
- **THEN** system MUST execute `map.setFeatureState()` for selected IDs and illuminate matching map H3 cells/assets on the GPU within 16ms.

#### Scenario: D3 1D histogram range handle drag
- **WHEN** user drags 1D range handles across temperature bins on the histogram
- **THEN** system MUST update `map.setFeatureState()` highlighting matching spatial cells reaching or exceeding the selected threshold.

### Requirement: Map-to-Chart Feature Linking
The system SHALL support hover and click selection events on Mapbox GL polygon and point layers that immediately outline corresponding data points and histogram bars in the D3 charts.

#### Scenario: Mapbox feature hover
- **WHEN** user moves cursor over an H3 cell or CHVA health facility point on the map
- **THEN** system MUST apply active highlight CSS classes to the matching SVG dot in `LinkedRiskCharts` and display a tooltip showing indicator values and data provenance.

### Requirement: Data Provenance & Citation Footers
The system SHALL display explicit data provenance badges on all chart panels, legends, and hover tooltips citing official Pacific Community (SPC) and Pacific Data Hub (PDH) SDMX endpoints.

#### Scenario: Displaying dataset citation
- **WHEN** user views dynamic layers or charts derived from Pacific Data Hub
- **THEN** system MUST display a visible provenance badge reading "Source: Pacific Data Hub SDMX / Pacific Community (SPC)".

### Requirement: Antimeridian Longitude Wrapping
The system SHALL wrap H3 hexagon polygon boundary coordinates relative to cell center longitudes in `h3Binner.js` to prevent polygon tearing across the 180° date line (+179°/-179°).

#### Scenario: H3 cell polyfill across 180° meridian
- **WHEN** backend generates H3 cells over Fiji (Taveuni/Vanua Levu) or Kiribati
- **THEN** system MUST output closed, valid GeoJSON Polygon coordinates wrapped relative to cell center longitudes without cross-globe line stretching.
