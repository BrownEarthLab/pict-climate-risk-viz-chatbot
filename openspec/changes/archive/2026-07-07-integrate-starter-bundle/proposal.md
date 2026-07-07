## Why

The climate risk visualization chatbot currently uses mock layers and older static temp datasets. To validate real spatial queries, exposure sampling, and risk indexing, we must integrate a set of real, decision-relevant datasets from the PICT DataViz Challenge: Sea Level Anomalies (hazard), Power Generation infrastructure (point asset exposure), and safely managed drinking water access (regional vulnerability).

## What Changes

- Integrate and structure three real datasets from the PICT DataViz Challenge:
  - **Sea Level anomalies** (gridded H3 polygons)
  - **Power generation locations** (point asset coordinates)
  - **Proportion of population using safely managed drinking water services** (regional/atoll vulnerability attributes)
- Save assets and vulnerability layers to `data/reference/` and register the gridded Sea Level anomalies dataset in the climate registry (`data/layers/climate_layer_registry.json`).
- Ensure the gridded sea level anomalies file is correctly binned to H3 index cells and has dates/scenarios aligned with the project standards.
- Expose these datasets in the backend so the chatbot and Mapbox frontend can load, query, and render them.

## Capabilities

### New Capabilities
- `starter-bundle-datasets`: Standardises and registers the gridded Sea Level anomalies hazard layer, Power Generation point asset layer, and Atoll-level Drinking Water vulnerability indicators.

### Modified Capabilities
<!-- None -->

## Impact

- Adds new GeoJSON data files under `data/reference/` and `data/climate/processed/`.
- Updates `data/layers/climate_layer_registry.json` to register the new sea level rise hazard layer.
- Updates frontend starter prompts and chatbot conversation context to refer to these new datasets.
