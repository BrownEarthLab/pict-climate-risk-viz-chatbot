#!/usr/bin/env python3
from pathlib import Path
import sys

checks = [
    (
        Path("frontend/src/components/layout/AppLayout.tsx"),
        ["const CHATBOT_ENABLED = false;", "const chatbotUiEnabled = CHATBOT_ENABLED;", "font-sans"],
        "chatbot hidden but retained + shared UI font",
    ),
    (
        Path("frontend/src/components/map/MapCanvas.tsx"),
        ["Presentation palette: neutral basemap", "#d5d9dd", 'w-[190px]', "font-sans"],
        "neutral basemap + compact collapsed analysis controls",
    ),
    (
        Path("frontend/src/components/map/MapControls.tsx"),
        ["bottom-12", "right-4", "z-[1300]"],
        "zoom controls moved clear of analysis panel",
    ),
    (
        Path("frontend/src/components/map/FeatureHighlighter.tsx"),
        ["#2c7bb6", "#b7a891", "#f28e2b", "reliability_class"],
        "blue-neutral-orange risk hue + reliability alpha",
    ),
    (
        Path("scripts/build_nex_tx90p_bivariate_fiji.py"),
        ["RELIABILITY_ALPHA", "#2c7bb6", "#f28e2b", "reliability_class_value_by_alpha_3x3"],
        "yearly climate builder value-by-alpha metadata",
    ),
    (
        Path("scripts/build_nex_tx90p_time_windows_fiji.py"),
        ["RELIABILITY_ALPHA", "#2c7bb6", "#f28e2b", "reliability_class_value_by_alpha_3x3"],
        "time-window climate builder value-by-alpha metadata",
    ),
]

failed = False
for path, needles, label in checks:
    if not path.exists():
        print(f"FAIL  {label}: missing {path}")
        failed = True
        continue
    text = path.read_text(encoding="utf-8")
    missing = [needle for needle in needles if needle not in text]
    if missing:
        print(f"FAIL  {label}: missing {missing}")
        failed = True
    else:
        print(f"PASS  {label}")

if failed:
    sys.exit(1)
print("\nAll Oct 15 UI feedback checks passed.")
