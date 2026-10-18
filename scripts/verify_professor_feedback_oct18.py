#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(".")
map_path = ROOT / "frontend/src/components/map/MapCanvas.tsx"
highlighter_path = ROOT / "frontend/src/components/map/FeatureHighlighter.tsx"
errors = []
passes = []

def check(label, condition):
    (passes if condition else errors).append(label)

if not map_path.exists():
    raise SystemExit("MapCanvas.tsx not found. Run from repository root.")

map_text = map_path.read_text()
highlighter_text = highlighter_path.read_text() if highlighter_path.exists() else ""
climate_text = (ROOT / "frontend/src/components/map/climateValueByAlpha.ts").read_text()
controls_text = (ROOT / "frontend/src/components/map/ClimateValueByAlphaControls.tsx").read_text()

check("custom cutoff controls imported", "ClimateValueByAlphaControls" in map_text)
check("custom cutoff state", "climateCutoffs" in map_text)
check("reclassification helper used", "reclassifyClimateFeatures" in map_text)
check("studied defaults button", "Studied defaults" in controls_text)
check("35/50 defaults", "riskLowMax: 35" in climate_text and "riskHighMin: 50" in climate_text)
check("0.33/0.66 defaults", "reliabilityLowMax: 0.33" in climate_text and "reliabilityHighMin: 0.66" in climate_text)
check("dynamic boundary legend", "Current class boundaries" in map_text)
check("POI legend", "Point colors" in map_text and "ASSET_LEGEND_ITEMS" in map_text)
check("shared asset palette", "ASSET_COLOR_EXPRESSION" in highlighter_text)
check("analysis navy", "#003F7B" in map_text or "#174A73" in map_text)
check("inter-model typo fixed", "Inter-inter-model spread" not in map_text)

offenders = []
for path in (ROOT / "frontend/src").rglob("*"):
    if path.suffix not in {".ts", ".tsx", ".css"}:
        continue
    text = path.read_text(errors="ignore")
    if re.search(r"(?:red|rose)-\d+", text):
        offenders.append(f"{path}: red/rose Tailwind class remains")
    if re.search(r"#(?:ef4444|dc2626|b91c1c|991b1b|7f1d1d)\b", text, flags=re.I):
        offenders.append(f"{path}: explicit red hex remains")

check("no red/rose styling in frontend/src", not offenders)

for path in [
    ROOT / "scripts/build_nex_tx90p_bivariate_fiji.py",
    ROOT / "scripts/build_nex_tx90p_time_windows_fiji.py",
]:
    if path.exists():
        text = path.read_text()
        check(f"{path.name}: 35 threshold", "value < 35" in text)
        check(f"{path.name}: 50 threshold", "value < 50" in text)

for label in passes:
    print("PASS", label)
for label in errors:
    print("FAIL", label)
for item in offenders:
    print("    ", item)

if errors:
    print(f"\n{len(errors)} verification check(s) failed.")
    sys.exit(1)

print("\nAll professor-feedback checks passed.")
