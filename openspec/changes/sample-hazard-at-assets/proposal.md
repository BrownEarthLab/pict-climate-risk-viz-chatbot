## Why

The climate chatbot lacks a generic spatial overlay function, relying on hardcoded backend results for the Fiji hospital heat exposure workflow. Implementing a point-in-polygon hazard sampling wrapper enables users and LLM workflows to evaluate climate risk at any set of coordinate-based infrastructure assets (such as clinics, schools, or ports) against H3-binned climate projection grids.

## What Changes

- Add a new chatbot-callable Python geospatial wrapper function `sample_hazard_at_assets` that:
  - Takes a vector point layer (GeoJSON format) and a gridded hazard layer (GeoJSON format).
  - Performs a spatial join or H3 index lookup to find overlapping cells.
  - Enriches the point features by appending the overlapping grid hazard value (e.g. wet-bulb temp, near-surface temp) as a new property.
- Export this function under `backend/tools/geospatial/` and register its schema under `backend/tools/schemas/sample_hazard_at_assets.json`.
- Implement unit tests for point-in-polygon overlays under `backend/tests/test_sampling.py`.

## Capabilities

### New Capabilities
- `spatial-asset-hazard-sampling`: Performs spatial overlay extraction of grid cell risk/hazard metrics at coordinate point asset shapes.

### Modified Capabilities
<!-- None -->

## Impact

- Modifies `backend/tools/geospatial/__init__.py` to export the new function.
- Adds new module `backend/tools/geospatial/sampling.py`.
- Adds JSON schema file `backend/tools/schemas/sample_hazard_at_assets.json`.
- Adds unit tests in `backend/tests/test_sampling.py`.
