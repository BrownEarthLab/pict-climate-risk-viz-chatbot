# Manual Risk Mockup API Contract

## Goal

Support a manual frontend mockup where a user draws/selects an area, clicks a risk-analysis button, and the backend runs a fixed geospatial analysis chain using API-sourced data.

This bypasses the chatbot. The frontend only sends geometry and analysis options. The backend owns data fetching, wrapper execution, risk calculation, provenance, warnings, and returned GeoJSON.

---

## Endpoint

For the MVP, reuse the existing spatial query endpoint:

```http
POST /api/spatial-query