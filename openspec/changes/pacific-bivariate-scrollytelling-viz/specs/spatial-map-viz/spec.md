## MODIFIED Requirements

### Requirement: Map Canvas Loading
The system SHALL render Mapbox GL inside the main viewport and display a "Loading map..." placeholder overlay while initializing.

Custom sources and layers SHALL be registered on the map's `style.load` event, not its `load` event, and the registration routine SHALL be idempotent. The system SHALL expose the map instance for verification so that map state can be asserted independently of React state.

Rationale: `docs/brushing-viz-retrospective.md` §2a — `load` waits for the style *and* the initial tile set, so a stalled tile prevented every custom source and layer from ever being registered, with zero errors thrown. Confirmed empirically: `getSource` returned nothing for `chva-facilities`, `climate-temp`, `sea-level-h3`, and `power-gen-fill` simultaneously.

#### Scenario: Verify initial zoom and center
- **WHEN** the MapCanvas component mounts
- **THEN** the Mapbox GL map instance is initialized with controls.

#### Scenario: Custom sources exist after style load
- **WHEN** the map's style has loaded
- **THEN** every declared custom source is retrievable via `getSource`

#### Scenario: Repeated setup does not duplicate layers
- **WHEN** the layer registration routine runs more than once for the same map instance
- **THEN** no source or layer is registered twice and no error is raised

#### Scenario: Map instance is reachable for verification
- **WHEN** the map has initialized
- **THEN** the map instance is reachable from the browser context so that layer and feature state can be queried directly

### Requirement: Climate Layer Toggles
The system SHALL display a floating Map Layers control panel permitting toggles between "tas" (Near-Surface Air Temp) and "wet_bulb" (Annual Mean Wet-Bulb) overlays.

Activating a layer control SHALL set the corresponding Mapbox layer's layout visibility to `visible` and set every other mutually exclusive thematic layer to `none`. Mapbox layout state SHALL be authoritative: React state indicating an active layer is not sufficient evidence that the layer is displayed.

Rationale: `docs/brushing-viz-retrospective.md` §2a — v1's final measured state had the legend rendering and React state reporting the sea-level layer active while `getLayoutProperty("sea-level-h3-layer", "visibility")` returned `"none"`. The DOM-level tests passed throughout.

#### Scenario: Toggle wet-bulb layer
- **WHEN** user clicks "Wet-Bulb" inside the Map Layers panel
- **THEN** the map's active layer shifts to "wet_bulb" and the color gradient legend displays values from 15°C to 27°C.

#### Scenario: Activating a layer changes Mapbox layout visibility
- **WHEN** the user activates any thematic layer control
- **THEN** that layer's layout visibility is `visible`

#### Scenario: Activating a layer hides the previously active one
- **WHEN** the user activates a thematic layer while another is active
- **THEN** the previously active layer's layout visibility is `none`

#### Scenario: Legend presence does not imply layer visibility
- **WHEN** a layer's legend is displayed
- **THEN** that layer's layout visibility is independently confirmed to be `visible`
