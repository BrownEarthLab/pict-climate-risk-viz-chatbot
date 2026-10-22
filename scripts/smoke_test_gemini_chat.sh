#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"

curl -sS -X POST "${BASE_URL}/api/chat/interpret" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What does this result mean?",
    "history": [],
    "analysis_context": {
      "analysis_type": "manual_heat_risk",
      "threshold_celsius": 30,
      "mean_exposure_probability": 0.30,
      "mean_forecast_spread_celsius": 2.1,
      "methodology": {
        "forecast_spread": "P90 minus P10 across forecast-hour values"
      }
    }
  }' | python -m json.tool
