#!/usr/bin/env python3
"""
Patch existing frontend files so the TX90p bivariate display uses a 3 x 3 matrix
and clearer terminology for inter-model spread/model disagreement.

Run from repo root:
  python scripts/patch_frontend_climate_3x3.py

This patch is intentionally conservative: it edits only climate legend/styling
text blocks that are known from the current prototype. It preserves the TC layer
and other local changes.
"""

from __future__ import annotations

import re
from pathlib import Path

MAP_CANVAS = Path("frontend/src/components/map/MapCanvas.tsx")
FEATURE_HIGHLIGHTER = Path("frontend/src/components/map/FeatureHighlighter.tsx")

COLORS_3X3_TS_ARRAY = '''["#8a2d13", "#c2410c", "#ff7a00", "#6b3f35", "#a66a43", "#f1b866", "#3b2c66", "#6d55b3", "#a78bfa"]'''

FILL_COLOR_3X3 = '''        "fill-color": [
          "match",
          ["get", "bivariate_class"],
          "low_risk_low_reliability",
          "#3b2c66",
          "low_risk_medium_reliability",
          "#6d55b3",
          "low_risk_high_reliability",
          "#a78bfa",
          "medium_risk_low_reliability",
          "#6b3f35",
          "medium_risk_medium_reliability",
          "#a66a43",
          "medium_risk_high_reliability",
          "#f1b866",
          "high_risk_low_reliability",
          "#8a2d13",
          "high_risk_medium_reliability",
          "#c2410c",
          "high_risk_high_reliability",
          "#ff7a00",
          "#a66a43",
        ],'''

METHOD_TEXT = '''                        <p className="mt-2 text-[10px] leading-snug text-red-700">
                          3×3 legend: color combines ensemble-mean TX90p risk
                          with model reliability. Reliability is the inverse of
                          normalized inter-model spread.
                        </p>

                        <div className="mt-2 rounded-md bg-red-50 p-2 text-[9px] leading-snug text-red-800">
                          <div><strong>Risk:</strong> ensemble mean TX90p.</div>
                          <div><strong>Inter-model spread:</strong> max model TX90p − min model TX90p.</div>
                          <div><strong>Reliability:</strong> 1 − min(1, spread / global spread p95).</div>
                        </div>'''


def patch_map_canvas() -> None:
    if not MAP_CANVAS.exists():
        print(f"SKIP: {MAP_CANVAS} not found")
        return
    text = MAP_CANVAS.read_text()
    original = text

    # Replace known 15-color legend array with 9-color legend array.
    text = re.sub(
        r'\["#84280f",\s*"#c2410c",\s*"#ff6b00",\s*"#763d1f",\s*"#b56825",\s*"#f59e0b",\s*"#553642",\s*"#94705c",\s*"#ddb579",\s*"#302354",\s*"#6750a4",\s*"#a58af0",\s*"#21164f",\s*"#46328c",\s*"#7c6bd6"\]',
        COLORS_3X3_TS_ARRAY,
        text,
    )

    # Replace explanatory wording if present.
    text = text.replace(
        '''                        <p className="mt-2 text-[10px] leading-snug text-red-700">
                          Each cell color combines TX90p risk class with reliability.
                          Higher/rightward reliability means lower model spread.
                        </p>''',
        METHOD_TEXT,
    )

    text = text.replace("TX90p risk × model reliability", "TX90p risk × model reliability")
    text = text.replace("Model spread", "Inter-model spread")
    text = text.replace("model spread", "inter-model spread")
    text = text.replace("inverse model spread", "inverse normalized inter-model spread")
    text = text.replace("bivariate TX90p risk × model reliability matrix", "3×3 bivariate TX90p risk × model reliability matrix")
    text = text.replace("bivariate matrix", "3×3 bivariate matrix")

    if text != original:
        MAP_CANVAS.write_text(text)
        print(f"patched {MAP_CANVAS}")
    else:
        print(f"no changes made to {MAP_CANVAS}; patterns may already be patched or differ")


def patch_feature_highlighter() -> None:
    if not FEATURE_HIGHLIGHTER.exists():
        print(f"SKIP: {FEATURE_HIGHLIGHTER} not found")
        return
    text = FEATURE_HIGHLIGHTER.read_text()
    original = text

    # Replace climate fill-color match block inside FeatureHighlighter if it uses bivariate_class.
    text = re.sub(
        r'        "fill-color": \[\n          "match",\n          \["get", "bivariate_class"\],[\s\S]*?          "#6750a4",\n        \],',
        FILL_COLOR_3X3,
        text,
        count=1,
    )

    text = text.replace("Model spread:", "Inter-model spread:")
    text = text.replace("model spread", "inter-model spread")
    text = text.replace("Color comes from a bivariate matrix: vertical axis = TX90p risk, horizontal axis = model reliability.",
                        "Color comes from a 3×3 bivariate matrix: vertical axis = TX90p risk; horizontal axis = model reliability/agreement.")
    text = text.replace("Bivariate class:", "3×3 class:")

    if text != original:
        FEATURE_HIGHLIGHTER.write_text(text)
        print(f"patched {FEATURE_HIGHLIGHTER}")
    else:
        print(f"no changes made to {FEATURE_HIGHLIGHTER}; patterns may already be patched or differ")


def main() -> None:
    patch_map_canvas()
    patch_feature_highlighter()
    print("Done. Run npm lint/build after patching.")


if __name__ == "__main__":
    main()
