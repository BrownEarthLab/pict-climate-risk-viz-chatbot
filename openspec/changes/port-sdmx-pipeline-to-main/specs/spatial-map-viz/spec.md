## ADDED Requirements

### Requirement: Dynamic Datasets layer group SHALL toggle Pacific Data Hub indicator layers

The Map Layers control panel SHALL include a "Dynamic Datasets" group (visually distinct from the existing "Climate Projections" group) containing three toggle buttons: "Sea Level Rise (H3)", "Power Gen (GWh)", and "Water Access". Clicking a button SHALL set `activeLayer` to the corresponding value (`sea_level` / `power_gen` / `water_access`) and toggle visibility of the matching Mapbox source/layer. Toggling one dynamic layer SHALL hide the others and SHALL hide any "Climate Projections" layer that was active.

#### Scenario: Enable Sea Level layer

- **WHEN** the user clicks "Sea Level Rise (H3)" in the Dynamic Datasets group
- **THEN** the `sea-level-h3-layer` Mapbox layer's visibility becomes `"visible"`, the `activeLayer` state is `"sea_level"`, and all other dynamic layers remain non-visible.

#### Scenario: Switch from Sea Level to Power Gen hides the previous

- **WHEN** "Sea Level Rise (H3)" is active and the user clicks "Power Gen (GWh)"
- **THEN** the `sea-level-h3-layer` becomes non-visible, `power-gen-fill-layer` becomes visible, and `activeLayer` updates to `"power_gen"`.

#### Scenario: Dynamic Datasets group is visually distinct

- **WHEN** the Map Layers control panel renders
- **THEN** a "Dynamic Datasets" section header is displayed separately from the "Climate Projections" section header.

### Requirement: Dynamic layer sources SHALL fetch on map load and stay hidden until toggled

The `useMapbox` hook SHALL register three empty GeoJSON sources (`sea-level-h3`, `power-gen-fill`, `water-access-fill`) and three corresponding `fill`-type Mapbox layers on map `load`. On map load, the hook SHALL issue `Promise.all` of `apiFetch("/api/layers/sea_level")`, `apiFetch("/api/layers/power_gen")`, and `apiFetch("/api/layers/water_access")` and populate each source's data with the response's `data` FeatureCollection when `status === "available"` or `status === "stale"`. All three layers SHALL be initialized with `layout.visibility: "none"` and only revealed when the user toggles them on.

#### Scenario: Sources populate on successful fetch

- **WHEN** the map fires `load` and all three `/api/layers/*` calls return `status: "available"` with valid FeatureCollections
- **THEN** the three Mapbox sources have their data set to the response's `data` field, and the three Mapbox layers remain non-visible.

#### Scenario: Sources stay empty on 503

- **WHEN** the map fires `load` and `/api/layers/sea_level` returns HTTP 503
- **THEN** the `sea-level-h3` source remains an empty FeatureCollection (`{ type: "FeatureCollection", features: [] }`) and no exception is raised in the React tree.

#### Scenario: Layers are hidden by default

- **WHEN** the map renders for the first time
- **THEN** the `layout.visibility` of `sea-level-h3-layer`, `power-gen-fill-layer`, and `water-access-fill-layer` is `"none"`.

### Requirement: Hover tooltips SHALL display indicator values for active dynamic layers

When a dynamic layer is active and the user hovers over a rendered feature of `sea-level-h3-layer`, `power-gen-fill-layer`, or `water-access-fill-layer`, the system SHALL query the rendered feature under the cursor for its active layer and display a popup tooltip near the cursor showing the feature's `indicator_value` (and where `activeLayer === "sea_level"` also showing the year range from `observation_year`).

#### Scenario: Sea level hover shows value and year range

- **WHEN** `activeLayer === "sea_level"` and the cursor is over a feature with `properties.indicator_value === 0.42` and `properties.observation_year === "2014-2023"`
- **THEN** a popup tooltip displays near the cursor containing both the value `0.42` and the year range `"2014-2023"`.

#### Scenario: Power gen hover shows value only

- **WHEN** `activeLayer === "power_gen"` and the cursor is over a feature with `properties.indicator_value === 1234.5`
- **THEN** a popup tooltip displays near the cursor containing `1234.5` (no year-range field is shown for the choropleth layers).

#### Scenario: No tooltip when no dynamic layer is active

- **WHEN** `activeLayer === "tas"` or `activeLayer === "manual_heat_risk"` or `activeLayer === null`
- **THEN** no dynamic-layer hover tooltip is displayed regardless of cursor position over the map.

### Requirement: Legend gradients SHALL render for active dynamic layers

The Map Layers panel SHALL render a gradient legend block per dynamic layer when (and only when) that layer is `activeLayer`. Each legend SHALL encode the same color stops used in its Mapbox layer's `fill-color` interpolation:

- Sea level: light-blue-to-dark-blue ramp keyed on indicator values 0.0 .. 1.0.
- Power gen: cream-to-dark-orange ramp keyed on 0 .. 5000 GWh.
- Water access: red-to-green ramp keyed on 0% .. 100%.

#### Scenario: Sea level legend renders when sea level is active

- **WHEN** `activeLayer === "sea_level"`
- **THEN** a legend block renders with the sea-level gradient and the label `"Sea Level Anomaly"`.

#### Scenario: Power gen legend hidden when power gen is not active

- **WHEN** `activeLayer !== "power_gen"`
- **THEN** no power-gen legend block is rendered in the Map Layers panel.

### Requirement: View Fly-to Controls SHALL also accept `workflow-complete` custom events

The map SHALL listen for `window` `"workflow-complete"` CustomEvents carrying `detail: { features, center, zoom }` and invoke `mapboxMap.flyTo({ center: detail.center, zoom: detail.zoom })`. This capability augments the existing `View Fly-to Controls` requirement (see `spatial-map-viz` base spec) and preserves forward compatibility with the upcoming `visual-workflow-programmer` openspec change, which will dispatch such events on approved workflow completion.

#### Scenario: Fly to Fiji hospital workflow center

- **WHEN** a `workflow-complete` event is dispatched with `detail.center === [178.06, -17.85]` and `detail.zoom === 8.5`
- **THEN** the map animates via `flyTo` to center `[178.06, -17.85]` at zoom `8.5`.

#### Scenario: No flyTo when no event has been dispatched

- **WHEN** the map loads and no `workflow-complete` event has been dispatched
- **THEN** the map stays at its initial `MAPBOX_DEFAULTS.center` and `MAPBOX_DEFAULTS.zoom` and no `flyTo` calls are made.