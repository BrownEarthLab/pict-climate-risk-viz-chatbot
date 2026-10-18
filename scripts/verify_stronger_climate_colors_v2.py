#!/usr/bin/env python3
from pathlib import Path
import sys

text = Path("frontend/src/components/map/FeatureHighlighter.tsx").read_text()

checks = {
    "strong blue fill": '"#0067B1"' in text,
    "strong neutral fill": '"#B89A75"' in text,
    "strong orange fill": '"#F47A00"' in text,
    "risk-class hue mapping": '["get", "risk_class"]' in text,
    "reliability-class opacity mapping": '["get", "reliability_class"]' in text,
    "low alpha 0.55": "0.55" in text,
    "medium alpha 0.75": "0.75" in text,
    "high alpha 0.95": "0.95" in text,
    "old purple removed": '"#3b2c66"' not in text,
    "old parser corruption absent": '],20,20,0.42)"' not in text,
}

failed = False
for label, ok in checks.items():
    print(("PASS" if ok else "FAIL"), label)
    failed |= not ok

sys.exit(1 if failed else 0)
