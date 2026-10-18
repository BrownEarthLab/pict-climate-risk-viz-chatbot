#!/usr/bin/env python3
from pathlib import Path
import sys

checks = []

feature = Path("frontend/src/components/map/FeatureHighlighter.tsx").read_text()
canvas = Path("frontend/src/components/map/MapCanvas.tsx").read_text()

checks.append(("strong blue", "#0067B1" in feature))
checks.append(("strong neutral", "#B89A75" in feature))
checks.append(("strong orange", "#F47A00" in feature))
checks.append(("low reliability alpha 0.55", "0.55" in feature))
checks.append(("medium reliability alpha 0.75", "0.75" in feature))
checks.append(("high reliability alpha 0.95", "0.95" in feature))
checks.append(("legend orange", "rgba(244,122,0,0.55)" in canvas))
checks.append(("legend blue", "rgba(0,103,177,0.95)" in canvas))

failed = False
for label, ok in checks:
    print(("PASS" if ok else "FAIL"), label)
    failed = failed or not ok

sys.exit(1 if failed else 0)
