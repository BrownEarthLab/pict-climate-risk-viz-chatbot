#!/usr/bin/env python3
from pathlib import Path
import shutil

FEATURE = Path("frontend/src/components/map/FeatureHighlighter.tsx")
CANVAS = Path("frontend/src/components/map/MapCanvas.tsx")

OLD_BLOCK = '''      paint: {
        "fill-color": [
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
        ],
        "fill-opacity": 0.82,
      },'''

NEW_BLOCK = '''      paint: {
        "fill-color": [
          "match",
          ["get", "risk_class"],
          "low",
          "#0067B1",
          "medium",
          "#B89A75",
          "high",
          "#F47A00",
          "#B89A75",
        ],
        "fill-opacity": [
          "match",
          ["get", "reliability_class"],
          "low",
          0.55,
          "medium",
          0.75,
          "high",
          0.95,
          0.75,
        ],
      },'''

def backup(path: Path) -> None:
    backup_path = path.with_name(path.name + ".before_stronger_climate_colors_v2.bak")
    if not backup_path.exists():
        shutil.copy2(path, backup_path)
        print(f"backup: {backup_path}")

def patch_feature() -> None:
    if not FEATURE.exists():
        raise SystemExit(f"Missing {FEATURE}")

    text = FEATURE.read_text()

    if NEW_BLOCK in text:
        print(f"already patched: {FEATURE}")
        return

    if OLD_BLOCK not in text:
        raise SystemExit(
            "Expected current TX90p climate style block was not found.\n"
            "No changes were made."
        )

    backup(FEATURE)
    text = text.replace(OLD_BLOCK, NEW_BLOCK, 1)
    text = text.replace(
        "<strong>Inter-inter-inter-inter-model spread:</strong>",
        "<strong>Inter-model spread:</strong>",
    )
    FEATURE.write_text(text)
    print(f"patched {FEATURE}")

def patch_canvas() -> None:
    if not CANVAS.exists():
        print(f"WARNING: {CANVAS} not found; skipping legend patch.")
        return

    text = CANVAS.read_text()
    original = text

    replacements = {
        "rgba(242,142,43,0.38)": "rgba(244,122,0,0.55)",
        "rgba(242,142,43,0.64)": "rgba(244,122,0,0.75)",
        "rgba(242,142,43,0.90)": "rgba(244,122,0,0.95)",
        "rgba(242,142,43,0.9)": "rgba(244,122,0,0.95)",
        "rgba(183,168,145,0.38)": "rgba(184,154,117,0.55)",
        "rgba(183,168,145,0.64)": "rgba(184,154,117,0.75)",
        "rgba(183,168,145,0.90)": "rgba(184,154,117,0.95)",
        "rgba(183,168,145,0.9)": "rgba(184,154,117,0.95)",
        "rgba(44,123,182,0.38)": "rgba(0,103,177,0.55)",
        "rgba(44,123,182,0.64)": "rgba(0,103,177,0.75)",
        "rgba(44,123,182,0.90)": "rgba(0,103,177,0.95)",
        "rgba(44,123,182,0.9)": "rgba(0,103,177,0.95)",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    if text != original:
        backup(CANVAS)
        CANVAS.write_text(text)
        print(f"patched {CANVAS}")
    else:
        print(f"legend colors unchanged in {CANVAS} (may already be updated)")

def main() -> None:
    patch_feature()
    patch_canvas()
    print("\nDone.")
    print("Next:")
    print("  python scripts/verify_stronger_climate_colors_v2.py")
    print("  cd frontend")
    print("  npm run build")
    print("  npm run dev")

if __name__ == "__main__":
    main()
