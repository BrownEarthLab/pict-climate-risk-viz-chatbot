#!/usr/bin/env python3
# Apply Gemini 2.5 interpretation-chat update to the CURRENT PICT repo.
#
# Run from repository root:
#   python scripts/apply_gemini_25_interpretation_chat.py
#
# The script creates *.before_gemini25_chat.bak backups and refuses to guess
# if the current climate/TC MapCanvas no longer matches the expected anchors.

from __future__ import annotations

from pathlib import Path
import re
import shutil

ROOT = Path(".")
SERVER = ROOT / "backend/server.js"
APP_LAYOUT = ROOT / "frontend/src/components/layout/AppLayout.tsx"
MAP = ROOT / "frontend/src/components/map/MapCanvas.tsx"
GITIGNORE = ROOT / ".gitignore"
BACKUP_SUFFIX = ".before_gemini25_chat.bak"


def die(message: str) -> None:
    raise SystemExit(f"\nERROR: {message}\n")


def backup(path: Path) -> None:
    if not path.exists():
        die(f"Required file not found: {path}")
    target = path.with_name(path.name + BACKUP_SUFFIX)
    if not target.exists():
        shutil.copy2(path, target)
        print(f"backup: {target}")


def package_root() -> Path:
    script_parent = Path(__file__).resolve().parents[1]
    extracted_bundle = script_parent / "gemini_25_interpretation_chat_update"

    if (extracted_bundle / "backend/interpretResults.js").exists():
        return extracted_bundle

    if (script_parent / "backend/interpretResults.js").exists() and (
        script_parent / "frontend/src/components/chat/InterpretationChat.tsx"
    ).exists():
        return script_parent

    die(
        "Could not locate the extracted gemini_25_interpretation_chat_update "
        "bundle. Unzip it in the repository root before running this script."
    )


def install_file(relative_path: str) -> None:
    src = package_root() / relative_path
    dst = ROOT / relative_path

    if not src.exists():
        die(f"Package file missing: {src}")

    dst.parent.mkdir(parents=True, exist_ok=True)

    if dst.exists() and dst.read_bytes() == src.read_bytes():
        print(f"support file already current: {dst}")
        return

    if dst.exists():
        backup(dst)

    shutil.copy2(src, dst)
    print(f"installed: {dst}")


def add_import(text: str, import_line: str, anchor: str | None = None) -> str:
    if import_line in text:
        return text

    if anchor:
        position = text.find(anchor)
        if position >= 0:
            line_end = text.find("\n", position)
            if line_end >= 0:
                return text[: line_end + 1] + import_line + "\n" + text[line_end + 1 :]

    imports = list(re.finditer(r"^import .*?;\s*$", text, flags=re.M))
    if not imports:
        die(f"Could not find import section while adding: {import_line}")

    end = imports[-1].end()
    return text[:end] + "\n" + import_line + text[end:]


def find_route_block_end(text: str, route_start: int) -> int:
    # Find the Express route callback's closing `});` while ignoring strings
    # and comments.
    callback_brace = text.find("{", route_start)
    if callback_brace < 0:
        die("Could not find route callback opening brace.")

    depth = 0
    in_string = False
    quote = ""
    escaped = False
    line_comment = False
    block_comment = False
    i = callback_brace

    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if line_comment:
            if ch == "\n":
                line_comment = False
            i += 1
            continue

        if block_comment:
            if ch == "*" and nxt == "/":
                block_comment = False
                i += 2
                continue
            i += 1
            continue

        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                in_string = False
            i += 1
            continue

        if ch == "/" and nxt == "/":
            line_comment = True
            i += 2
            continue

        if ch == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue

        if ch in ('"', "'", "`"):
            in_string = True
            quote = ch
            i += 1
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                semi = text.find(");", i)
                if semi >= 0 and semi - i < 10:
                    return semi + 2
                die("Could not find Express route terminator.")

        i += 1

    die("Unclosed Express route while patching server.js.")


def patch_server() -> None:
    backup(SERVER)
    text = SERVER.read_text()
    original = text

    old_import = 'import { interpretResults } from "./interpretResults.js";'
    new_import = 'import { interpretChat, interpretResults } from "./interpretResults.js";'

    if new_import not in text:
        if old_import in text:
            text = text.replace(old_import, new_import, 1)
        else:
            text = add_import(
                text,
                new_import,
                'import * as h3 from "h3-js";',
            )

    if 'app.post("/api/chat/interpret"' not in text:
        route_anchor = 'app.post("/api/interpret-results"'
        start = text.find(route_anchor)
        if start < 0:
            die(
                "server.js has no /api/interpret-results route. "
                "Refusing to guess where to insert the Gemini chat route."
            )

        end = find_route_block_end(text, start)

        chat_route = '''

app.post("/api/chat/interpret", async (req, res) => {
  try {
    const {
      message,
      history = [],
      analysis_context = null,
    } = req.body || {};

    if (!String(message || "").trim()) {
      return res.status(400).json({
        error: "message is required",
      });
    }

    const result = await interpretChat({
      message,
      history,
      analysisContext: analysis_context,
    });

    return res.json(result);
  } catch (error) {
    console.error("Interpretation chat failed:", error);

    return res.status(500).json({
      error: "Interpretation chat failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
'''
        text = text[:end] + chat_route + text[end:]

    if text != original:
        SERVER.write_text(text)
        print(f"patched: {SERVER}")
    else:
        print(f"server already current: {SERVER}")


def patch_app_layout() -> None:
    backup(APP_LAYOUT)
    text = APP_LAYOUT.read_text()
    original = text

    import_line = 'import InterpretationChat from "../chat/InterpretationChat";'
    text = add_import(
        text,
        import_line,
        'import ConversationView from "../chat/ConversationView";',
    )

    if "<InterpretationChat" not in text:
        main_close = text.find("</main>")
        if main_close < 0:
            die("Could not find </main> in AppLayout.tsx.")

        main_close += len("</main>")
        panel = '''

      <InterpretationChat
        queryMetadata={queryMetadata ? { ...queryMetadata } : null}
        highlightedFeatures={highlightedFeatures}
      />'''
        text = text[:main_close] + panel + text[main_close:]

    # Keep the no-red UI rule in legacy hidden chat controls too.
    text = text.replace("hover:text-red-500", "hover:text-[#174A73]")

    if text != original:
        APP_LAYOUT.write_text(text)
        print(f"patched: {APP_LAYOUT}")
    else:
        print(f"AppLayout already current: {APP_LAYOUT}")


def patch_map_canvas() -> None:
    backup(MAP)
    text = MAP.read_text()
    original = text

    required = [
        "climateScenario",
        "climateTimeWindow",
        "climateYear",
        "setClimateIndexFeatures",
        "setTropicalCycloneHazardFeatures",
        "selectedCountryId",
        "selectedArea",
    ]
    missing = [anchor for anchor in required if anchor not in text]
    if missing:
        die(
            "MapCanvas.tsx is not the expected climate+TC version. "
            f"Missing anchors: {', '.join(missing)}"
        )

    import_line = '''import {
  clearPublishedAnalysisContext,
  publishAnalysisContext,
  summarizeClimateAnalysis,
  summarizeTropicalCycloneAnalysis,
} from "../chat/analysisContext";'''

    if 'from "../chat/analysisContext"' not in text:
        anchor = 'import MapControls from "./MapControls";'
        if anchor in text:
            pos = text.find(anchor)
            end = text.find("\n", pos)
            text = text[: end + 1] + import_line + "\n" + text[end + 1 :]
        else:
            text = add_import(text, import_line)

    # Climate: publish the exact features that are displayed after the
    # user-selected value-by-alpha reclassification.
    if "summarizeClimateAnalysis(featuresForInterpretation" not in text:
        climate_candidates = [
            "setClimateIndexFeatures(reclassifyClimateFeatures(features, climateCutoffs));",
            "setClimateIndexFeatures(features);",
        ]
        climate_call = next(
            (candidate for candidate in climate_candidates if candidate in text),
            None,
        )

        if climate_call is None:
            die(
                "Could not find the climate feature-set call. "
                "The current MapCanvas may have changed since the previous patch."
            )

        if "reclassifyClimateFeatures" in climate_call:
            replacement = '''const featuresForInterpretation = reclassifyClimateFeatures(
        features,
        climateCutoffs,
      );
      setClimateIndexFeatures(featuresForInterpretation);
      publishAnalysisContext(
        summarizeClimateAnalysis(featuresForInterpretation, {
          country_id: selectedCountryId,
          country_name: selectedCountry?.country_name ?? null,
          admin_level: selectedAdminLevel,
          admin_area: selectedArea
            ? {
                admin_id: selectedArea.adminId,
                admin_name: selectedArea.adminName,
                country_name: selectedArea.countryName,
              }
            : null,
          scenario: climateScenario,
          time_window: climateTimeWindow,
          year: climateYear,
          current_visualization_cutoffs: climateCutoffs,
          api_metadata: layer.metadata ?? null,
        }),
      );'''
        else:
            replacement = '''const featuresForInterpretation = features;
      setClimateIndexFeatures(featuresForInterpretation);
      publishAnalysisContext(
        summarizeClimateAnalysis(featuresForInterpretation, {
          country_id: selectedCountryId,
          country_name: selectedCountry?.country_name ?? null,
          admin_level: selectedAdminLevel,
          admin_area: selectedArea
            ? {
                admin_id: selectedArea.adminId,
                admin_name: selectedArea.adminName,
                country_name: selectedArea.countryName,
              }
            : null,
          scenario: climateScenario,
          time_window: climateTimeWindow,
          year: climateYear,
          api_metadata: layer.metadata ?? null,
        }),
      );'''

        text = text.replace(climate_call, replacement, 1)

    # TC: find the first identifier-based feature set in the live fetch path,
    # not the [] clearing calls.
    if "summarizeTropicalCycloneAnalysis(tcFeaturesForInterpretation" not in text:
        tc_pattern = re.compile(
            r"(?P<indent>^[ \t]*)setTropicalCycloneHazardFeatures"
            r"\((?P<arg>[A-Za-z_$][A-Za-z0-9_$]*)\);",
            flags=re.M,
        )

        matches = list(tc_pattern.finditer(text))
        candidate = None

        for match in matches:
            before = text[max(0, match.start() - 3000) : match.start()]
            if (
                "fetchTropicalCycloneHazard" in before
                or "TropicalCycloneHazard" in before
            ):
                candidate = match
                break

        if candidate is None and matches:
            candidate = matches[-1]

        if candidate is None:
            die("Could not find the tropical-cyclone feature-set call.")

        indent = candidate.group("indent")
        arg = candidate.group("arg")
        replacement = f'''{indent}const tcFeaturesForInterpretation = {arg};
{indent}setTropicalCycloneHazardFeatures(tcFeaturesForInterpretation);
{indent}publishAnalysisContext(
{indent}  summarizeTropicalCycloneAnalysis(tcFeaturesForInterpretation, {{
{indent}    country_id: selectedCountryId,
{indent}    country_name: selectedCountry?.country_name ?? null,
{indent}    admin_level: selectedAdminLevel,
{indent}    admin_area: selectedArea
{indent}      ? {{
{indent}          admin_id: selectedArea.adminId,
{indent}          admin_name: selectedArea.adminName,
{indent}          country_name: selectedArea.countryName,
{indent}        }}
{indent}      : null,
{indent}    api_metadata: null,
{indent}  }}),
{indent});'''

        text = text[: candidate.start()] + replacement + text[candidate.end() :]

    # Daily heat should take over the chat context instead of leaving a stale
    # climate/TC layer context in localStorage.
    marker = "clearPublishedAnalysisContext(); // Gemini context: daily heat"
    if marker not in text:
        target = 'setActiveLayer("manual_heat_risk" as never);'
        if target not in text:
            die("Could not find daily heat active-layer anchor.")

        text = text.replace(
            target,
            target + "\n    " + marker,
        )

    if text != original:
        MAP.write_text(text)
        print(f"patched: {MAP}")
    else:
        print(f"MapCanvas already current: {MAP}")


def patch_env_and_gitignore() -> None:
    src = package_root() / "backend/.env.gemini.example"
    dst = ROOT / "backend/.env.gemini.example"
    shutil.copy2(src, dst)
    print(f"installed: {dst}")

    if not GITIGNORE.exists():
        GITIGNORE.write_text(".env\nbackend/.env\n")
        print(f"created: {GITIGNORE}")
        return

    text = GITIGNORE.read_text()
    additions = []

    if re.search(r"(?m)^\.env$", text) is None:
        additions.append(".env")
    if re.search(r"(?m)^backend/\.env$", text) is None:
        additions.append("backend/.env")

    if additions:
        backup(GITIGNORE)
        with GITIGNORE.open("a") as handle:
            if text and not text.endswith("\n"):
                handle.write("\n")
            handle.write("\n# Local LLM/API credentials\n")
            for line in additions:
                handle.write(line + "\n")
        print(f"patched: {GITIGNORE}")


def main() -> None:
    if not (ROOT / "backend").exists() or not (ROOT / "frontend").exists():
        die("Run this from the pict-climate-risk-viz-chatbot repository root.")

    install_file("backend/interpretResults.js")
    install_file("frontend/src/components/chat/analysisContext.ts")
    install_file("frontend/src/components/chat/InterpretationChat.tsx")

    patch_server()
    patch_app_layout()
    patch_map_canvas()
    patch_env_and_gitignore()

    print("\nGemini 2.5 interpretation-chat update applied.")
    print("Next:")
    print("  cp backend/.env.gemini.example backend/.env")
    print("  # edit backend/.env and set GEMINI_API_KEY")
    print("  python scripts/verify_gemini_25_interpretation_chat.py")
    print("  node --check backend/server.js")
    print("  node --check backend/interpretResults.js")
    print("  cd frontend && npm run build && npm run lint")


if __name__ == "__main__":
    main()
