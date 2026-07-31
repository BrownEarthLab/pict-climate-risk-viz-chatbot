## Why

The current repository contains a fully functioning prototype of the PICT Climate Risk Visualizer and Chatbot, but it has no formal specifications documenting its behavior, components, and integration contracts. Adopting an artifact-driven specification flow requires establishing a baseline set of specs that define the current state of the application. This proposal establishes the baseline specs covering all existing capabilities of the chatbot, map interface, and spatial queries.

## What Changes

No code changes will be made in this baseline change. Instead, we are documenting all existing features of the project by defining their specification requirements.

Specifically, we are establishing the following new specification files:
- `specs/conversational-chatbot/spec.md`: Chat message view, sidebar conversation management, prompt starters, and parsed JSON workflow triggers.
- `specs/spatial-map-viz/spec.md`: Mapbox canvas integration, layer toggles (Air Temp, Wet-bulb), and color scale legends.
- `specs/spatial-query-analysis/spec.md`: Custom polygon drawing, backend mock queries (Turf.js), and selected features tabular panel display.
- `specs/app-configuration/spec.md`: Settings tab modal inputs (units, default regions, theme placeholders) and Help guides.
- `specs/dataset-ingestion-pipeline/spec.md`: Climate dataset processing scripts, NetCDF ingestion parameters, H3 indexing structures, and spatial metadata schemas.

## Capabilities

### New Capabilities
- `conversational-chatbot`: Manages messaging interface, typing indicators, conversation management (creation, deletion, search, localStorage backup), and rendering workflow payload links.
- `spatial-map-viz`: Manages Mapbox canvas load state, map legends, layer controls, and view fly-to animations.
- `spatial-query-analysis`: Manages drawing tools, geometry retrieval, mock query endpoints (calculating wet-bulb and air temp stats), and highlight markers.
- `app-configuration`: Manages Settings preference panels (units, themes, region filters) and static documentation help guides.
- `dataset-ingestion-pipeline`: Manages Python-based extraction scripts, NetCDF file formats integration, spatial grid binning (H3 index level), and metadata headers standard.

### Modified Capabilities
<!-- None. Empty since this is the first set of specs. -->

## Impact

This is a documentation-only change. It has zero impact on active code execution but establishes the baseline validation files for future spec-driven changes.
