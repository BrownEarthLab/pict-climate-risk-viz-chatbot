#!/usr/bin/env python3
"""
Strengthen TX90p map colors without overwriting newer climate/TC functionality.

Run from repository root:
    python scripts/apply_stronger_climate_colors.py

It patches:
  - frontend/src/components/map/FeatureHighlighter.tsx
  - frontend/src/components/map/MapCanvas.tsx

Scientific semantics remain unchanged:
  hue = TX90p risk class
  opacity = model reliability
Only presentation is strengthened for print/screenshot legibility.
"""

from __future__ import annotations

import shutil
from pathlib import Path

FEATURE = Path("frontend/src/components/map/FeatureHighlighter.tsx")
CANVAS = Path("frontend/src/components/map/MapCanvas.tsx")

BACKUP_SUFFIX = ".before_stronger_climate_colors.bak"

CLIMATE_FILL_COLOR = """[
          "match",
          ["get", "risk_class"],
          "low",
          "#0067B1",
          "medium",
          "#B89A75",
          "high",
          "#F47A00",
          "#B89A75",
        ]"""

CLIMATE_FILL_OPACITY = """[
          "match",
          ["get", "reliability_class"],
          "low",
          0.55,
          "medium",
          0.75,
          "high",
          0.95,
          0.75,
        ]"""

CLIMATE_OUTLINE_COLOR = """[
          "match",
          ["get", "risk_class"],
          "low",
          "#004B82",
          "medium",
          "#77634D",
          "high",
          "#A84D00",
          "#665A4B",
        ]"""

NEW_LEGEND = (
    '["rgba(244,122,0,0.55)", "rgba(244,122,0,0.75)", "rgba(244,122,0,0.95)", '
    '"rgba(184,154,117,0.55)", "rgba(184,154,117,0.75)", "rgba(184,154,117,0.95)", '
    '"rgba(0,103,177,0.55)", "rgba(0,103,177,0.75)", "rgba(0,103,177,0.95)"]'
)

OLD_LEGENDS = [
    '["rgba(242,142,43,0.38)", "rgba(242,142,43,0.64)", "rgba(242,142,43,0.90)", '
    '"rgba(183,168,145,0.38)", "rgba(183,168,145,0.64)", "rgba(183,168,145,0.90)", '
    '"rgba(44,123,182,0.38)", "rgba(44,123,182,0.64)", "rgba(44,123,182,0.90)"]',
    '["rgba(242,142,43,0.38)", "rgba(242,142,43,0.64)", "rgba(242,142,43,0.9)", '
    '"rgba(183,168,145,0.38)", "rgba(183,168,145,0.64)", "rgba(183,168,145,0.9)", '
    '"rgba(44,123,182,0.38)", "rgba(44,123,182,0.64)", "rgba(44,123,182,0.9)"]',
]

def backup(path: Path) -> None:
    if not path.exists():
        return
    backup_path = path.with_name(path.name + BACKUP_SUFFIX)
    if not backup_path.exists():
        shutil.copy2(path, backup_path)
        print(f"backup: {backup_path}")

def replace_property_expression(
    text: str,
    anchor: str,
    property_name: str,
    replacement_expr: str,
    *,
    occurrence_after_anchor: int = 1,
    search_radius: int = 5000,
) -> tuple[str, bool]:
    """
    Replace a JS object property value near an anchor.
    Supports array expressions and scalar/string expressions.
    """
    anchor_pos = text.find(anchor)
    if anchor_pos < 0:
        return text, False

    start_search = anchor_pos
    found_pos = -1
    key = f'"{property_name}":'

    for _ in range(occurrence_after_anchor):
        found_pos = text.find(key, start_search, min(len(text), anchor_pos + search_radius))
        if found_pos < 0:
            # fallback: search slightly before anchor too
            found_pos = text.find(
                key,
                max(0, anchor_pos - 2000),
                min(len(text), anchor_pos + search_radius),
            )
            if found_pos < 0:
                return text, False
        start_search = found_pos + len(key)

    value_start = found_pos + len(key)
    while value_start < len(text) and text[value_start].isspace():
        value_start += 1

    if value_start >= len(text):
        return text, False

    opening = text[value_start]

    if opening in "[{":
        close_for = {"[": "]", "{": "}"}
        closing = close_for[opening]
        depth = 0
        in_string = False
        quote = ""
        escape = False
        i = value_start
        while i < len(text):
            ch = text[i]
            if in_string:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == quote:
                    in_string = False
            else:
                if ch in ('"', "'", "`"):
                    in_string = True
                    quote = ch
                elif ch == opening:
                    depth += 1
                elif ch == closing:
                    depth -= 1
                    if depth == 0:
                        value_end = i + 1
                        break
            i += 1
        else:
            return text, False
    else:
        comma = text.find(",", value_start)
        newline = text.find("\n", value_start)
        candidates = [x for x in (comma, newline) if x >= 0]
        if not candidates:
            return text, False
        value_end = min(candidates)

    return text[:value_start] + replacement_expr + text[value_end:], True

def patch_feature() -> None:
    if not FEATURE.exists():
        raise SystemExit(f"Missing {FEATURE}")

    backup(FEATURE)
    text = FEATURE.read_text()
    original = text

    if '"bivariate_class"' not in text and "bivariate_class" not in text:
        raise SystemExit(
            "Could not find climate bivariate styling in FeatureHighlighter.tsx. "
            "No changes were made."
        )

    anchor = '"bivariate_class"' if '"bivariate_class"' in text else "bivariate_class"

    text, changed_color = replace_property_expression(
        text, anchor, "fill-color", CLIMATE_FILL_COLOR
    )
    text, changed_opacity = replace_property_expression(
        text, anchor, "fill-opacity", CLIMATE_FILL_OPACITY
    )

    # Strengthen the climate polygon outline if a line-color property is located
    # close enough to the climate bivariate block. This is presentation-only.
    text, changed_outline = replace_property_expression(
        text, anchor, "line-color", CLIMATE_OUTLINE_COLOR
    )

    if not changed_color:
        raise SystemExit("Could not patch climate fill-color; no reliable match was found.")
    if not changed_opacity:
        raise SystemExit("Could not patch climate fill-opacity; no reliable match was found.")

    if text != original:
        FEATURE.write_text(text)
        print(f"patched {FEATURE}")
        print("  fill colors: stronger blue / tan / orange")
        print("  alpha: 0.55 / 0.75 / 0.95")
        if changed_outline:
            print("  climate outlines: strengthened")
        else:
            print("  note: no climate outline expression was changed")
    else:
        print(f"no changes needed in {FEATURE}")

def patch_canvas() -> None:
    if not CANVAS.exists():
        raise SystemExit(f"Missing {CANVAS}")

    backup(CANVAS)
    text = CANVAS.read_text()
    original = text

    replaced = False
    for old in OLD_LEGENDS:
        if old in text:
            text = text.replace(old, NEW_LEGEND, 1)
            replaced = True
            break

    # Tolerate a previously updated palette by replacing the exact hex/RGBA values
    # individually when the legend array formatting changed.
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
        if old in text:
            text = text.replace(old, new)
            replaced = True

    if text != original:
        CANVAS.write_text(text)
        print(f"patched {CANVAS}")
    elif replaced:
        print(f"legend already matched in {CANVAS}")
    else:
        print(
            "WARNING: no known old legend colors found in MapCanvas.tsx. "
            "Feature styling was still patched."
        )

def main() -> None:
    patch_feature()
    patch_canvas()
    print("\nDone. Next run:")
    print("  python scripts/recolor_existing_tx90p_cache.py")
    print("  cd frontend && npm run build")

if __name__ == "__main__":
    main()
