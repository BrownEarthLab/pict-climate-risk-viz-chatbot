#!/usr/bin/env python3
"""
Apply Oct 15 visual/UI feedback without overwriting newer climate/TC functionality.

Changes:
  - temporarily hides chatbot UI while keeping its code intact
  - collapses Analysis Controls to a compact Show control instead of a tall blank panel
  - makes the basemap water/background neutral grey
  - uses one inherited sans-serif UI font
  - updates TX90p value-by-alpha rendering to a 3x3 blue/neutral/orange x reliability-alpha design
  - keeps terminology explicit: inter-model spread / model reliability

Run from repository root:
    python scripts/apply_oct15_ui_feedback.py
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

APP_LAYOUT = Path("frontend/src/components/layout/AppLayout.tsx")
MAP_CANVAS = Path("frontend/src/components/map/MapCanvas.tsx")
FEATURE_HIGHLIGHTER = Path("frontend/src/components/map/FeatureHighlighter.tsx")

BACKUP_SUFFIX = ".before_oct15_ui_feedback.bak"

LEGEND_3X3_RGBA = (
    '["rgba(242,142,43,0.38)", "rgba(242,142,43,0.64)", "rgba(242,142,43,0.90)", '
    '"rgba(183,168,145,0.38)", "rgba(183,168,145,0.64)", "rgba(183,168,145,0.90)", '
    '"rgba(44,123,182,0.38)", "rgba(44,123,182,0.64)", "rgba(44,123,182,0.90)"]'
)

CLIMATE_FILL_COLOR = '''[
          "match",
          ["get", "risk_class"],
          "low",
          "#2c7bb6",
          "medium",
          "#b7a891",
          "high",
          "#f28e2b",
          "#b7a891",
        ]'''

CLIMATE_FILL_OPACITY = '''[
          "match",
          ["get", "reliability_class"],
          "low",
          0.38,
          "medium",
          0.64,
          "high",
          0.9,
          0.64,
        ]'''

NEUTRAL_BASEMAP_EFFECT = '''
  // Presentation palette: neutral basemap so analytical blue/orange layers carry the emphasis.
  useEffect(() => {
    if (!mapboxMap) return;

    const applyNeutralBasemap = () => {
      try {
        const style = mapboxMap.getStyle();

        style.layers?.forEach((layer) => {
          if (layer.type === "background") {
            const current = mapboxMap.getPaintProperty(layer.id, "background-color");
            if (current !== "#e5e7eb") {
              mapboxMap.setPaintProperty(layer.id, "background-color", "#e5e7eb");
            }
          }

          if (layer.type === "fill" && /water|ocean/i.test(layer.id)) {
            const current = mapboxMap.getPaintProperty(layer.id, "fill-color");
            if (current !== "#d5d9dd") {
              mapboxMap.setPaintProperty(layer.id, "fill-color", "#d5d9dd");
            }
          }
        });
      } catch (error) {
        console.warn("Could not apply neutral basemap palette:", error);
      }
    };

    if (mapboxMap.isStyleLoaded()) {
      applyNeutralBasemap();
    }

    mapboxMap.on("styledata", applyNeutralBasemap);
    return () => mapboxMap.off("styledata", applyNeutralBasemap);
  }, [mapboxMap]);
'''


def backup(path: Path) -> None:
    if not path.exists():
        return
    backup_path = path.with_name(path.name + BACKUP_SUFFIX)
    if not backup_path.exists():
        shutil.copy2(path, backup_path)
        print(f"backup: {backup_path}")


def replace_property_expression(text: str, anchor: str, property_name: str, replacement_expr: str) -> tuple[str, bool]:
    """Replace a JS object property expression near anchor, handling arrays or scalar values."""
    anchor_pos = text.find(anchor)
    if anchor_pos < 0:
        return text, False

    search_start = max(0, anchor_pos - 1800)
    search_end = min(len(text), anchor_pos + 2600)
    window = text[search_start:search_end]

    key = f'"{property_name}":'
    rel_pos = window.find(key)
    if rel_pos < 0:
        # Try after the anchor specifically.
        rel_anchor = anchor_pos - search_start
        rel_pos = window.find(key, rel_anchor)
    if rel_pos < 0:
        return text, False

    start = search_start + rel_pos
    value_start = start + len(key)
    while value_start < len(text) and text[value_start].isspace():
        value_start += 1

    if value_start >= len(text):
        return text, False

    if text[value_start] == "[":
        depth = 0
        in_string = False
        escape = False
        i = value_start
        while i < len(text):
            ch = text[i]
            if in_string:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_string = False
            else:
                if ch == '"':
                    in_string = True
                elif ch == "[":
                    depth += 1
                elif ch == "]":
                    depth -= 1
                    if depth == 0:
                        value_end = i + 1
                        break
            i += 1
        else:
            return text, False
    else:
        comma = text.find(",", value_start)
        if comma < 0:
            return text, False
        value_end = comma

    new_text = text[:value_start] + replacement_expr + text[value_end:]
    return new_text, True


def patch_app_layout() -> None:
    if not APP_LAYOUT.exists():
        print(f"SKIP: {APP_LAYOUT} not found")
        return

    backup(APP_LAYOUT)
    text = APP_LAYOUT.read_text()
    original = text

    if "const CHATBOT_ENABLED = false;" not in text:
        # Insert after imports and before the first interface/type/const.
        matches = list(re.finditer(r"^(?:import .*?;\n)+", text, flags=re.MULTILINE))
        if matches:
            end = matches[0].end()
            text = text[:end] + "\n// Chatbot UI is intentionally hidden for the current map-only prototype.\nconst CHATBOT_ENABLED = false;\n" + text[end:]
        else:
            text = "const CHATBOT_ENABLED = false;\n" + text

    # Keep a single inherited UI font.
    text = text.replace(
        'className="flex h-[calc(100vh-2rem)] gap-4"',
        'className="flex h-[calc(100vh-2rem)] gap-4 font-sans"',
        1,
    )

    # Hide any centered chatbot landing overlay while preserving it in source.
    # Be tolerant of formatting changes in AppLayout.tsx.
    if "CHATBOT_ENABLED &&" not in text:
        overlay_patterns = [
            r"\{\s*!hasActiveChat\s*&&\s*!isDrawMode\s*&&\s*\(",
            r"\{\s*!isDrawMode\s*&&\s*!hasActiveChat\s*&&\s*\(",
        ]
        for pattern in overlay_patterns:
            text, count = re.subn(
                pattern,
                lambda m: m.group(0).replace("{", "{CHATBOT_ENABLED && ", 1),
                text,
                count=1,
            )
            if count:
                break

    # If the landing overlay structure changed entirely, retain an explicit
    # boolean tied to CHATBOT_ENABLED so the disabled state is auditable.
    if "CHATBOT_ENABLED &&" not in text:
        anchor = "  const hasActiveChat ="
        idx = text.find(anchor)
        if idx >= 0:
            line_end = text.find("\n", idx)
            if line_end >= 0:
                text = (
                    text[: line_end + 1]
                    + "  const chatbotUiEnabled = CHATBOT_ENABLED && true;\n"
                    + text[line_end + 1 :]
                )

    # Hide the whole right chat/history rail without deleting its JSX.
    if "style={{ display: CHATBOT_ENABLED ? undefined : \"none\" }}" not in text:
        text = text.replace(
            "      <aside\n",
            '      <aside\n        style={{ display: CHATBOT_ENABLED ? undefined : "none" }}\n',
            1,
        )

    if text != original:
        APP_LAYOUT.write_text(text)
        print(f"patched {APP_LAYOUT}")
    else:
        print(f"no changes needed in {APP_LAYOUT}")


def patch_map_canvas() -> None:
    if not MAP_CANVAS.exists():
        print(f"SKIP: {MAP_CANVAS} not found")
        return

    backup(MAP_CANVAS)
    text = MAP_CANVAS.read_text()
    original = text

    # One inherited UI typeface.
    text = text.replace(
        '<div className="absolute inset-0">',
        '<div className="absolute inset-0 font-sans">',
        1,
    )

    # Neutral grey basemap. Insert once immediately after isLegendExpanded state.
    if "Presentation palette: neutral basemap" not in text:
        marker = "  const [isLegendExpanded, setIsLegendExpanded] = useState(true);"
        if marker in text:
            text = text.replace(marker, marker + "\n" + NEUTRAL_BASEMAP_EFFECT, 1)
        else:
            print("WARNING: could not find isLegendExpanded state; neutral basemap effect not inserted")

    # Collapse Analysis Controls to a compact card instead of leaving the full-height blank background.
    old_panel_classes = [
        'className="absolute bottom-16 left-4 top-6 z-20 flex w-[300px] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/90 shadow-lg backdrop-blur-md"',
        'className="absolute bottom-16 left-4 top-6 z-20 flex w-[300px] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/90 shadow-lg backdrop-blur-md transition-all duration-300"',
    ]
    new_panel_class = '''className={`absolute left-4 top-6 z-20 flex flex-col transition-all duration-300 ${
              isLegendExpanded
                ? "bottom-16 w-[300px] overflow-hidden rounded-2xl border border-black/5 bg-white/90 shadow-lg backdrop-blur-md"
                : "w-[190px] overflow-visible bg-transparent shadow-none"
            }`}'''
    for old in old_panel_classes:
        if old in text:
            text = text.replace(old, new_panel_class, 1)
            break

    old_header = 'className="flex items-center justify-between border-b border-neutral-100 px-4 py-3"'
    new_header = '''className={`flex items-center justify-between ${
                isLegendExpanded
                  ? "border-b border-neutral-100 px-4 py-3"
                  : "rounded-xl border border-black/5 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-md"
              }`}'''
    if old_header in text:
        text = text.replace(old_header, new_header, 1)

    # 3x3 value-by-alpha legend: blue -> neutral -> orange; alpha = reliability.
    old_arrays = [
        '["#84280f", "#c2410c", "#ff6b00", "#763d1f", "#b56825", "#f59e0b", "#553642", "#94705c", "#ddb579", "#302354", "#6750a4", "#a58af0", "#21164f", "#46328c", "#7c6bd6"]',
        '["#8a2d13", "#c2410c", "#ff7a00", "#6b3f35", "#a66a43", "#f1b866", "#3b2c66", "#6d55b3", "#a78bfa"]',
    ]
    for arr in old_arrays:
        text = text.replace(arr, LEGEND_3X3_RGBA)

    # Make climate methodology copy non-alerting and explicit.
    text = text.replace(
        'className="mt-2 text-[10px] leading-snug text-red-700"',
        'className="mt-2 text-[10px] leading-snug text-slate-600"',
    )
    text = text.replace(
        'className="mt-2 rounded-md bg-red-50 p-2 text-[9px] leading-snug text-red-800"',
        'className="mt-2 rounded-md bg-slate-50 p-2 text-[9px] leading-snug text-slate-700"',
    )
    text = text.replace(
        "3×3 legend: color combines ensemble-mean TX90p risk with model reliability.",
        "3×3 value-by-alpha legend: blue→orange shows ensemble-mean TX90p risk; opacity shows model reliability.",
    )
    text = text.replace(
        "3×3 legend: color combines ensemble-mean TX90p risk\n                          with model reliability. Reliability is the inverse of\n                          normalized inter-model spread.",
        "3×3 value-by-alpha legend: blue→orange shows ensemble-mean TX90p risk;\n                          opacity shows model reliability. Reliability is the inverse of\n                          normalized inter-model spread.",
    )

    if text != original:
        MAP_CANVAS.write_text(text)
        print(f"patched {MAP_CANVAS}")
    else:
        print(f"no changes made to {MAP_CANVAS}; inspect patterns manually")


def patch_feature_highlighter() -> None:
    if not FEATURE_HIGHLIGHTER.exists():
        print(f"SKIP: {FEATURE_HIGHLIGHTER} not found")
        return

    backup(FEATURE_HIGHLIGHTER)
    text = FEATURE_HIGHLIGHTER.read_text()
    original = text

    # Locate the climate bivariate block by its bivariate_class anchor and replace
    # both value color and reliability alpha, while leaving TC styling untouched.
    if '"bivariate_class"' in text:
        text, changed_color = replace_property_expression(
            text, '"bivariate_class"', "fill-color", CLIMATE_FILL_COLOR
        )
        text, changed_alpha = replace_property_expression(
            text, '"bivariate_class"', "fill-opacity", CLIMATE_FILL_OPACITY
        )
        if not changed_color:
            print("WARNING: climate fill-color near bivariate_class was not found")
        if not changed_alpha:
            print("WARNING: climate fill-opacity near bivariate_class was not found")
    else:
        print("WARNING: no bivariate_class styling found in FeatureHighlighter")

    text = text.replace("Model spread:", "Inter-model spread:")
    text = text.replace("model spread", "inter-model spread")
    text = text.replace(
        "Color comes from a 3×3 bivariate matrix: vertical axis = TX90p risk; horizontal axis = model reliability/agreement.",
        "3×3 value-by-alpha: blue→orange = TX90p risk; opacity = model reliability/agreement.",
    )
    text = text.replace(
        "Color comes from a bivariate matrix: vertical axis = TX90p risk, horizontal axis = model reliability.",
        "3×3 value-by-alpha: blue→orange = TX90p risk; opacity = model reliability/agreement.",
    )

    if text != original:
        FEATURE_HIGHLIGHTER.write_text(text)
        print(f"patched {FEATURE_HIGHLIGHTER}")
    else:
        print(f"no changes made to {FEATURE_HIGHLIGHTER}; patterns may differ")


def main() -> None:
    patch_app_layout()
    patch_map_canvas()
    patch_feature_highlighter()
    print("Done. Replace MapControls.tsx from the update package, then run npm lint/build.")


if __name__ == "__main__":
    main()
