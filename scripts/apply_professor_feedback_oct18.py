#!/usr/bin/env python3
# Safe Oct 18 professor-feedback patcher.
# Run from the pict-climate-risk-viz-chatbot repository root.

from __future__ import annotations
from pathlib import Path
import re
import shutil

ROOT = Path(".")
MAP = ROOT / "frontend/src/components/map/MapCanvas.tsx"
HIGHLIGHTER = ROOT / "frontend/src/components/map/FeatureHighlighter.tsx"
PANEL = ROOT / "frontend/src/components/map/SpatialQueryPanel.tsx"
APP_LAYOUT = ROOT / "frontend/src/components/layout/AppLayout.tsx"
BUILDER_YEARLY = ROOT / "scripts/build_nex_tx90p_bivariate_fiji.py"
BUILDER_WINDOWS = ROOT / "scripts/build_nex_tx90p_time_windows_fiji.py"
BACKUP_SUFFIX = ".before_professor_feedback_oct18.bak"


def die(message: str) -> None:
    raise SystemExit(f"\nERROR: {message}\n")


def backup(path: Path) -> None:
    if not path.exists():
        die(f"Required file not found: {path}")
    target = path.with_name(path.name + BACKUP_SUFFIX)
    if not target.exists():
        shutil.copy2(path, target)
        print(f"backup: {target}")


def add_import_after(text: str, after_fragment: str, import_line: str) -> str:
    if import_line in text:
        return text
    pos = text.find(after_fragment)
    if pos < 0:
        die(f"Could not find import anchor: {after_fragment}")
    line_end = text.find("\n", pos)
    if line_end < 0:
        die(f"Malformed import area near: {after_fragment}")
    return text[: line_end + 1] + import_line + "\n" + text[line_end + 1 :]


def statement_end(text: str, anchor_pos: int) -> int:
    semi = text.find(";", anchor_pos)
    if semi < 0:
        die("Could not find statement terminator after anchor.")
    return semi + 1


def replace_array_value_after_anchor(
    text: str,
    anchor: str,
    property_name: str,
    replacement: str,
) -> tuple[str, bool]:
    anchor_pos = text.find(anchor)
    if anchor_pos < 0:
        return text, False

    prop = f'"{property_name}":'
    prop_pos = text.find(prop, anchor_pos)
    if prop_pos < 0:
        return text, False

    start = prop_pos + len(prop)
    while start < len(text) and text[start].isspace():
        start += 1

    if start >= len(text) or text[start] != "[":
        return text, False

    depth = 0
    in_string = False
    quote = ""
    escaped = False

    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                in_string = False
            continue

        if ch in ('"', "'", "`"):
            in_string = True
            quote = ch
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return text[:start] + replacement + text[i + 1 :], True

    return text, False


def replace_no_red_tokens(text: str) -> str:
    replacements = {
        "border-red-50": "border-[#E8F1F9]",
        "border-red-100": "border-[#BFD7ED]",
        "border-red-200": "border-[#A9C9E3]",
        "border-red-300": "border-[#8FB6D5]",
        "bg-red-50": "bg-[#E8F1F9]",
        "bg-red-100": "bg-[#D8E8F5]",
        "bg-red-200": "bg-[#BFD7ED]",
        "bg-red-300": "bg-[#A9C9E3]",
        "bg-red-400": "bg-[#5E7F9A]",
        "bg-red-500": "bg-[#174A73]",
        "bg-red-600": "bg-[#174A73]",
        "bg-red-700": "bg-[#003F7B]",
        "bg-red-800": "bg-[#173F5F]",
        "bg-red-900": "bg-[#12324D]",
        "bg-red-950": "bg-[#0C253A]",
        "text-red-300": "text-[#8FB6D5]",
        "text-red-400": "text-[#5E7F9A]",
        "text-red-500": "text-[#174A73]",
        "text-red-600": "text-[#174A73]",
        "text-red-700": "text-[#174A73]",
        "text-red-800": "text-[#174A73]",
        "text-red-900": "text-[#003F7B]",
        "text-red-950": "text-[#003F7B]",
        "ring-red-": "ring-blue-",
        "accent-red-": "accent-blue-",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)

    text = text.replace("rose-", "teal-")

    hex_replacements = {
        "#ef4444": "#F47A00",
        "#f87171": "#F59E0B",
        "#dc2626": "#E87516",
        "#b91c1c": "#C95A00",
        "#991b1b": "#A84D00",
        "#7f1d1d": "#78350F",
        "#fee2e2": "#E8F1F9",
        "#fecaca": "#BFD7ED",
        "#fef2f2": "#F3F7FA",
    }
    for old, new in hex_replacements.items():
        text = text.replace(old, new).replace(old.upper(), new)

    return text


def copy_support_files() -> None:
    package_root = Path(__file__).resolve().parents[1]
    mappings = {
        package_root / "frontend/src/components/map/climateValueByAlpha.ts":
            ROOT / "frontend/src/components/map/climateValueByAlpha.ts",
        package_root / "frontend/src/components/map/ClimateValueByAlphaControls.tsx":
            ROOT / "frontend/src/components/map/ClimateValueByAlphaControls.tsx",
        package_root / "frontend/src/components/map/assetPalette.ts":
            ROOT / "frontend/src/components/map/assetPalette.ts",
    }
    for src, dst in mappings.items():
        if not src.exists():
            die(f"Package support file missing: {src}")
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists() and dst.read_text() == src.read_text():
            print(f"support file already current: {dst}")
            continue
        if dst.exists():
            backup(dst)
        shutil.copy2(src, dst)
        print(f"installed support file: {dst}")


def patch_map_canvas() -> None:
    backup(MAP)
    text = MAP.read_text()
    original = text

    required = [
        "climateIndexFeatures",
        "setClimateIndexFeatures",
        "Climate indices",
        "climateLayerScopeLabel",
        "TX90p",
    ]
    missing = [item for item in required if item not in text]
    if missing:
        die(
            "MapCanvas.tsx does not look like the current climate-enabled version. "
            f"Missing anchors: {', '.join(missing)}"
        )

    import_anchor = 'import MapControls from "./MapControls";'
    text = add_import_after(
        text,
        import_anchor,
        'import ClimateValueByAlphaControls from "./ClimateValueByAlphaControls";',
    )
    text = add_import_after(
        text,
        import_anchor,
        'import { ASSET_LEGEND_ITEMS } from "./assetPalette";',
    )
    text = add_import_after(
        text,
        import_anchor,
        'import { loadClimateCutoffs, reclassifyClimateFeatures, saveClimateCutoffs, type ClimateCutoffs } from "./climateValueByAlpha";',
    )

    if "const [climateCutoffs, setClimateCutoffs]" not in text:
        pos = text.find("const [climateIndexFeatures")
        if pos < 0:
            die("Could not locate climateIndexFeatures state declaration.")
        end = statement_end(text, pos)
        state_code = '''

  const [climateCutoffs, setClimateCutoffs] = useState<ClimateCutoffs>(
    loadClimateCutoffs,
  );

  const handleClimateCutoffsChange = useCallback(
    (next: ClimateCutoffs) => {
      saveClimateCutoffs(next);
      setClimateCutoffs(next);
      setClimateIndexFeatures((current) =>
        reclassifyClimateFeatures(current, next),
      );
    },
    [],
  );'''
        text = text[:end] + state_code + text[end:]

    text = text.replace(
        "setClimateIndexFeatures(features);",
        "setClimateIndexFeatures(reclassifyClimateFeatures(features, climateCutoffs));",
    )

    if "<ClimateValueByAlphaControls" not in text:
        p = text.find("Scope: {climateLayerScopeLabel}")
        if p < 0:
            die("Could not find the climate scope label for control insertion.")
        close = text.find("</div>", p)
        if close < 0:
            die("Could not find closing div after climate scope label.")
        close += len("</div>")
        controls = '''

                          <ClimateValueByAlphaControls
                            value={climateCutoffs}
                            onChange={handleClimateCutoffsChange}
                          />'''
        text = text[:close] + controls + text[close:]

    if "Current class boundaries" not in text:
        p = text.find("3×3 legend: color combines ensemble-mean TX90p risk")
        if p < 0:
            die("Could not find TX90p 3x3 legend text.")
        tag_start = text.rfind("<p", 0, p)
        if tag_start < 0:
            die("Could not find 3x3 legend paragraph start.")
        legend_block = '''<div className="mt-2 rounded-md border border-[#BFD7ED] bg-white/80 p-2 text-[9px] leading-snug text-[#263746]">
                          <div className="font-bold text-[#174A73]">Current class boundaries</div>
                          <div>
                            Blue &lt; {climateCutoffs.riskLowMax}% · tan{" "}
                            {climateCutoffs.riskLowMax}–&lt;{climateCutoffs.riskHighMin}% ·
                            orange ≥ {climateCutoffs.riskHighMin}%
                          </div>
                          <div>
                            Reliability: low &lt; {climateCutoffs.reliabilityLowMax.toFixed(2)} ·
                            medium {climateCutoffs.reliabilityLowMax.toFixed(2)}–&lt;
                            {climateCutoffs.reliabilityHighMin.toFixed(2)} · high ≥{" "}
                            {climateCutoffs.reliabilityHighMin.toFixed(2)}
                          </div>
                        </div>

                        '''
        text = text[:tag_start] + legend_block + text[tag_start:]

    if "Point colors" not in text:
        p = text.find("Infrastructure assets")
        if p < 0:
            die("Could not find Infrastructure assets toggle for POI legend.")
        label_end = text.find("</label>", p)
        if label_end < 0:
            die("Could not find Infrastructure assets label closing tag.")
        label_end += len("</label>")
        poi_legend = '''

                        {showInfrastructureAssets && (
                          <div className="mt-2 rounded-xl border border-sky-100 bg-white/90 p-2.5">
                            <div className="text-[9px] font-black uppercase tracking-wide text-sky-700">
                              Point colors
                            </div>
                            <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1">
                              {ASSET_LEGEND_ITEMS.map((item) => (
                                <div
                                  key={item.label}
                                  className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-600"
                                >
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm"
                                    style={{ backgroundColor: item.color }}
                                  />
                                  <span>{item.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}'''
        text = text[:label_end] + poi_legend + text[label_end:]

    active = text.find("Active analysis")
    if active >= 0:
        window_start = max(0, active - 500)
        prefix = text[window_start:active]
        prefix = prefix.replace(
            "border border-orange-100 bg-white",
            "border border-[#BFD7ED] bg-[#F3F7FA]",
        )
        prefix = prefix.replace("text-orange-500", "text-[#174A73]")
        text = text[:window_start] + prefix + text[active:]

    text = text.replace("Inter-inter-model spread", "Inter-model spread")
    text = text.replace("inter-inter-model spread", "inter-model spread")
    text = replace_no_red_tokens(text)

    if text != original:
        MAP.write_text(text)
        print(f"patched: {MAP}")
    else:
        print(f"no changes needed: {MAP}")


def patch_feature_highlighter() -> None:
    backup(HIGHLIGHTER)
    text = HIGHLIGHTER.read_text()
    original = text

    import_line = 'import { ASSET_COLOR_EXPRESSION } from "./assetPalette";'
    if import_line not in text:
        imports = list(re.finditer(r"^import .*?;\s*$", text, flags=re.M))
        if not imports:
            die("Could not find FeatureHighlighter import section.")
        end = imports[-1].end()
        text = text[:end] + "\n" + import_line + text[end:]

    text, ok = replace_array_value_after_anchor(
        text,
        "id: assetPointLayerId",
        "circle-color",
        "ASSET_COLOR_EXPRESSION as any",
    )
    if not ok:
        text, ok = replace_array_value_after_anchor(
            text,
            "assetPointLayerId",
            "circle-color",
            "ASSET_COLOR_EXPRESSION as any",
        )
    if not ok:
        die("Could not safely replace infrastructure asset circle-color expression.")

    text = replace_no_red_tokens(text)

    if text != original:
        HIGHLIGHTER.write_text(text)
        print(f"patched: {HIGHLIGHTER}")


def patch_spatial_query_panel() -> None:
    if not PANEL.exists():
        print(f"note: {PANEL} not found; skipping right-panel styling")
        return
    backup(PANEL)
    text = PANEL.read_text()
    original = text

    text = text.replace(
        "rounded-2xl border border-black/5 bg-white/92",
        "rounded-2xl border border-[#BFD7ED] bg-white/94",
    )

    anchor = '{isAssetAnalysis ? "Asset heat risk" : "Analysis results"}'
    p = text.find(anchor)
    if p >= 0:
        start = text.rfind('className="', 0, p)
        end = text.find('"', start + len('className="')) if start >= 0 else -1
        if start >= 0 and end >= 0:
            cls = text[start:end + 1]
            cls = cls.replace("text-neutral-400", "text-[#174A73]")
            text = text[:start] + cls + text[end + 1:]

    text = replace_no_red_tokens(text)
    if text != original:
        PANEL.write_text(text)
        print(f"patched: {PANEL}")


def patch_app_layout() -> None:
    if not APP_LAYOUT.exists():
        return
    backup(APP_LAYOUT)
    text = APP_LAYOUT.read_text()
    updated = replace_no_red_tokens(text)
    if updated != text:
        APP_LAYOUT.write_text(updated)
        print(f"patched: {APP_LAYOUT}")


def patch_builder(path: Path) -> None:
    if not path.exists():
        print(f"note: builder not found, skipping: {path}")
        return
    backup(path)
    text = path.read_text()
    original = text

    start = text.find("def risk_class_from_value")
    if start < 0:
        print(f"WARNING: risk_class_from_value not found in {path}")
        return
    next_def = text.find("\ndef ", start + 5)
    if next_def < 0:
        next_def = len(text)

    body = text[start:next_def]
    body2 = re.sub(r"value\s*<\s*33(?:\.0+)?", "value < 35.0", body)
    body2 = re.sub(r"value\s*<\s*66(?:\.0+)?", "value < 50.0", body2)
    text = text[:start] + body2 + text[next_def:]

    if text != original:
        path.write_text(text)
        print(f"patched builder defaults: {path}")
    else:
        print(f"builder unchanged/already locked: {path}")


def main() -> None:
    if not (ROOT / "frontend").exists() or not (ROOT / "scripts").exists():
        die("Run this from the pict-climate-risk-viz-chatbot repository root.")

    copy_support_files()
    patch_map_canvas()
    patch_feature_highlighter()
    patch_spatial_query_panel()
    patch_app_layout()
    patch_builder(BUILDER_YEARLY)
    patch_builder(BUILDER_WINDOWS)

    print("\nProfessor-feedback update applied.")
    print("Studied defaults: TX90p 35/50; reliability 0.33/0.66.")
    print("Next:")
    print("  python scripts/verify_professor_feedback_oct18.py")
    print("  cd frontend && npm run build && npm run lint")


if __name__ == "__main__":
    main()
