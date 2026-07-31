## ADDED Requirements

### Requirement: SDMX REST client SHALL fetch indicator data from Pacific Data Hub

The system SHALL fetch Pacific Data Hub SDMX-JSON via `node:https` (HTTP/1.1 — required because Cloudflare-fronted DotStat rejects undici's HTTP/2 negotiation) for three indicators: `sea_level` (flow `SPC,DF_CLIMATE_CHANGE,1.0` / key `A.SEA_LVL.`), `power_gen` (flow `SPC,DF_POWER_GEN,1.0` / key `A...`), and `water_access` (flow `SPC,DF_SDG_06,3.0` / key `A.SH_H2O_SAFE...._T.....`).

#### Scenario: Successful fetch returns parsed SDMX-JSON

- **WHEN** `fetchLayerDataWithTimeout("sea_level")` is called with a reachable Pacific Data Hub endpoint
- **THEN** the function resolves to a parsed JavaScript object containing `data.dataSets[0].observations` and `data.structure.dimensions.observation` arrays.

#### Scenario: Timeout after 10s

- **WHEN** the Pacific Data Hub does not respond within 10 seconds
- **THEN** the AbortController fires, the request is destroyed with an "aborted" error, and `fetchLayerDataWithTimeout` rejects with that error.

#### Scenario: Unknown layer name rejected

- **WHEN** `fetchLayerDataWithTimeout("unknown_layer")` is called
- **THEN** the function throws synchronously with `Error: Unknown layer: unknown_layer`.

### Requirement: Cache-aside SHALL serve fresh or stale data with 24h TTL

The system SHALL cache each fetched SDMX-JSON payload in memory + on disk at `data/cache/sdmx/<flow>|<key>` (URL-safe base64 per `getUrlSafeCacheKey`). The cache entry SHALL be considered fresh for 24 hours. On fetch failure, the system SHALL serve the stale payload from disk if one exists and annotate the response with `status: "stale"` and a warning. If no stale payload exists, the system SHALL return HTTP 503 with `{ layer, status: "unavailable", data: null, error }`.

#### Scenario: Cache miss fetches and stores

- **WHEN** `handleLayerRequest("sea_level")` is called with no cached payload
- **THEN** the system fetches from Pacific Data Hub, parses observations, joins with regions, bins to H3, and responds with `{ layer: "sea_level", status: "available", data: <FeatureCollection> }`. The fetched SDMX-JSON is written to disk for future misses.

#### Scenario: Cache hit serves without fetch

- **WHEN** `handleLayerRequest("sea_level")` is called with a fresh cached payload (age < 24h)
- **THEN** no HTTP request to Pacific Data Hub is made and the response is built from the cache.

#### Scenario: API failure falls back to stale cache

- **WHEN** Pacific Data Hub is unreachable but a stale cache payload exists on disk
- **THEN** the system responds with `{ layer: "sea_level", status: "stale", data: <FeatureCollection>, warning: "Using cached data — PDH unreachable" }` and HTTP 200.

#### Scenario: API failure with no cache returns 503

- **WHEN** Pacific Data Hub is unreachable and no stale cache payload exists on disk
- **THEN** the system responds with HTTP 503 and `{ layer: "sea_level", status: "unavailable", data: null, error: <message> }`.

### Requirement: Observation parsing SHALL derive one indicator value per GEO_PICT region

The `parseSdmxObservations()` function SHALL resolve `GEO_PICT` and `TIME_PERIOD` dimensions from the SDMX-JSON structure, iterate observations, and produce an array of `{ geoPictCode, value, year }` entries — one per region — with layer-specific aggregation:

- `sea_level`: average the most recent 10 years of observations per region (year range `maxYear - 9 .. maxYear`; year label formatted as `"${startYear}-${endYear}"`).
- `power_gen` and `water_access`: sum observations across all sub-dimensions per region/year, then take the latest year per region.

#### Scenario: Sea levels averaged over last 10 years

- **WHEN** `parseSdmxObservations(payload, "sea_level")` is called with a payload containing FJ values for years 2010–2023
- **THEN** the returned entry for FJ has `value = mean(values[2014..2023])` (rounded to 4 decimal places) and `year = "2014-2023"`.

#### Scenario: Power gen summed across sub-dimensions, latest year kept

- **WHEN** `parseSdmxObservations(payload, "power_gen")` is called with a payload containing FJ observations for 2023 across `ENERGY_SOURCE × GRID_CONN` sub-dimensions
- **THEN** the returned entry for FJ has `value = sum(across all sub-dimensions for 2023)` and `year = "2023"`.

#### Scenario: Missing GEO_PICT or TIME_PERIOD dimension returns empty list

- **WHEN** the payload's `structure.dimensions.observation` array has no dimension with `id === "GEO_PICT"` or no dimension with `id === "TIME_PERIOD"`
- **THEN** the function returns `[]` without throwing.

#### Scenario: Empty observations returns empty list

- **WHEN** the payload's `data.dataSets[0].observations` is empty or absent
- **THEN** the function returns `[]` without throwing.

### Requirement: Region geometry join SHALL map GEO_PICT codes to PICT polygons

The `joinObservationsToRegions(observations, layerName)` function SHALL look up each observation's `geoPictCode` via the `ISO_3166_2_TO_ISO3` table (alpha-2 → alpha-3), find the matching region feature in `data/reference/pict_regions.geojson` by `iso3`, and emit a new Feature with `properties.indicator_value`, `properties.observation_year`, `properties.geo_pict`, and `properties.layer_name`. Observations whose `geoPictCode` has no matching region SHALL be skipped silently.

#### Scenario: FJ observation joined to Fiji region polygon

- **WHEN** `joinObservationsToRegions([{ geoPictCode: "FJ", value: 3.5, year: "2023" }], "power_gen")` is called
- **THEN** the returned FeatureCollection's first feature has `properties.iso3 === "FJI"`, `properties.indicator_value === 3.5`, `properties.layer_name === "power_gen"`, and Fiji's polygon geometry.

#### Scenario: Unknown GEO_PICT code is dropped silently

- **WHEN** `joinObservationsToRegions([{ geoPictCode: "ZZ", value: 1.0, year: "2023" }], "power_gen")` is called
- **THEN** the returned array is empty (no throw, no warning).

### Requirement: H3 binning SHALL produce a hexagon grid for the sea-level layer

For `layerName === "sea_level"` only, `handleLayerRequest` SHALL invoke `binFeaturesToH3(regionFeatures)` which converts each region feature's polygon into H3 hexagons at resolution 4 by default, falling back to resolution 5 for atolls whose area fits one resolution-4 cell (current hardcoded list: Tuvalu, Nauru, Kiribati). Each output Feature is a H3 cell boundary polygon enriched with the original region's `indicator_value` property. For `power_gen` and `water_access`, the joined region features SHALL be returned as a FeatureCollection directly (no binning — these render as choropleths at region granularity).

#### Scenario: Sea-level layer returns H3 FeatureCollection

- **WHEN** `handleLayerRequest("sea_level", res)` succeeds
- **THEN** the response `data` is a FeatureCollection whose features have H3-cell polygon geometries with `properties.indicator_value` set.

#### Scenario: Power-gen layer returns region choropleth FeatureCollection

- **WHEN** `handleLayerRequest("power_gen", res)` succeeds
- **THEN** the response `data` is a FeatureCollection whose features use the original region polygon geometries (no H3 binning), with `properties.indicator_value` set.

#### Scenario: Atolls use H3 resolution 5 fallback

- **WHEN** `binFeaturesToH3` is called with a Feature whose `iso3 === "TUV"` (Tuvalu)
- **THEN** the produced H3 cells are at resolution 5, not resolution 4.

### Requirement: Endpoints SHALL expose layer listing, fetch, refresh, and chatbot context

The system SHALL register 4 Express endpoints:

- `GET /api/layers` → returns a JSON array of registered dynamic layer metadata entries from `data/layers/climate_layer_registry.json` (each entry has at minimum `layer_id`, `display_name`, `source`).
- `GET /api/layers/:layer` → dispatches to `handleLayerRequest` for `sea_level` / `power_gen` / `water_access`. Returns 400 for any other `:layer` value.
- `POST /api/refresh?layer=<name>` → invalidates the cache for the named layer and force-fetches fresh data from Pacific Data Hub. Returns 400 if `layer` is missing or not in the allowed set.
- `GET /api/chatbot-context` → returns `{ available_layers: [<names with successful recent fetch>], unavailable_layers: [<names with stale-or-no data>] }`.

#### Scenario: List layers

- **WHEN** `GET /api/layers` is called
- **THEN** the response is a JSON array containing entries with `layer_id` values `sea_level_rise_dynamic`, `power_gen_dynamic`, and `water_access_dynamic`.

#### Scenario: Unknown layer returns 400

- **WHEN** `GET /api/layers/unknown_layer` is called
- **THEN** the response is HTTP 400 with body `{ error: "Unknown layer: unknown_layer" }`.

#### Scenario: Refresh missing layer returns 400

- **WHEN** `POST /api/refresh` is called without a `?layer=` query parameter
- **THEN** the response is HTTP 400 with body `{ error: "Missing or invalid 'layer' query param. Must be one of: sea_level, power_gen, water_access" }`.

#### Scenario: Chatbot context reports availability

- **WHEN** `GET /api/chatbot-context` is called after `sea_level` was successfully fetched but `power_gen` was not
- **THEN** the response body includes `available_layers: ["sea_level"]` and `unavailable_layers: ["power_gen"]` (exact membership depends on per-layer state at request time).