# spatial-map-viz Specification

## Purpose
TBD - created by archiving change baseline-project-specs. Update Purpose after archive.
## Requirements
### Requirement: Map Canvas Loading
The system SHALL render Mapbox GL inside the main viewport and display a "Loading map..." placeholder overlay while initializing.

#### Scenario: Verify initial zoom and center
- **WHEN** the MapCanvas component mounts
- **THEN** the Mapbox GL map instance is initialized with controls.

### Requirement: Climate Layer Toggles
The system SHALL display a floating Map Layers control panel permitting toggles between "tas" (Near-Surface Air Temp) and "wet_bulb" (Annual Mean Wet-Bulb) overlays.

#### Scenario: Toggle wet-bulb layer
- **WHEN** user clicks "Wet-Bulb" inside the Map Layers panel
- **THEN** the map's active layer shifts to "wet_bulb" and the color gradient legend displays values from 15°C to 27°C.

### Requirement: View Fly-to Controls
The system SHALL intercept incoming coordinate-based custom event coordinates and animate the viewport center.

#### Scenario: Animate to coordinates
- **WHEN** the `workflow-complete` event is dispatched with center `[178.06, -17.85]` and zoom `8.5`
- **THEN** the map invokes a smooth flyTo animation centering on Fiji.

