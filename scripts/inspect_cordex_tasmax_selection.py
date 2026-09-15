#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

SELECTION_PATH = Path("data/catalog/cordex_tasmax_selection.json")

def main() -> None:
    selection = json.loads(SELECTION_PATH.read_text(encoding="utf-8"))
    print("\nCORDEX Tmax selection")
    print("---------------------")
    print(f"Plan: {selection['plan_id']}")
    print(f"Status: {selection['status']}")
    print(f"Variable: {selection['data_source']['variable']} ({selection['data_source']['variable_label']})")
    print(f"Domain priority: {', '.join(selection['data_source']['domain_priority'])}")
    print(f"Model: {selection['model_choice']['meeting_label']}")
    print(f"Thresholds: {', '.join(map(str, selection['approved_thresholds_c']))} °C")
    print("\nExperiments")
    for exp in selection["experiments"]:
        print(f"- {exp['experiment_id']} ({'required' if exp['required'] else 'optional'}): {exp['role']}")
    print("\nMetrics")
    for metric in selection["metrics_to_compute"]:
        print(f"- {metric['metric_id']}: {metric['label']} [{metric['unit']}]")
    print("\nNext manual step")
    print("Verify exact ESGF dataset IDs/URLs and download one small historical + one scenario tasmax NetCDF before bulk download.")

if __name__ == "__main__":
    main()
