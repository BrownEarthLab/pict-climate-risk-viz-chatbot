#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(".")
errors = []
passes = []

def check(label, condition):
    (passes if condition else errors).append(label)

server = ROOT / "backend/server.js"
interpreter = ROOT / "backend/interpretResults.js"
app_layout = ROOT / "frontend/src/components/layout/AppLayout.tsx"
map_canvas = ROOT / "frontend/src/components/map/MapCanvas.tsx"
chat = ROOT / "frontend/src/components/chat/InterpretationChat.tsx"
context = ROOT / "frontend/src/components/chat/analysisContext.ts"

required = [server, interpreter, app_layout, map_canvas, chat, context]

for path in required:
    check(f"exists: {path}", path.exists())

if not all(path.exists() for path in required):
    for label in passes:
        print("PASS", label)
    for label in errors:
        print("FAIL", label)
    sys.exit(1)

server_text = server.read_text()
interpreter_text = interpreter.read_text()
layout_text = app_layout.read_text()
map_text = map_canvas.read_text()
chat_text = chat.read_text()
context_text = context.read_text()

check("Gemini API key env used", "GEMINI_API_KEY" in interpreter_text)
check("Gemini 2.5 Flash default", "gemini-2.5-flash" in interpreter_text)
check(
    "server-side Gemini REST call",
    "generativelanguage.googleapis.com" in interpreter_text,
)
check("no OpenAI API in interpreter", "api.openai.com" not in interpreter_text)
check("no OPENAI_API_KEY in interpreter", "OPENAI_API_KEY" not in interpreter_text)
check(
    "interpretResults preserved",
    "export async function interpretResults" in interpreter_text,
)
check(
    "multi-turn interpretChat exported",
    "export async function interpretChat" in interpreter_text,
)
check("chat route installed", 'app.post("/api/chat/interpret"' in server_text)
check(
    "interpretChat imported by server",
    "interpretChat" in server_text and "./interpretResults.js" in server_text,
)
check(
    "legacy result route preserved",
    'app.post("/api/interpret-results"' in server_text,
)
check("visible InterpretationChat rendered", "<InterpretationChat" in layout_text)
check("chat panel imported", 'from "../chat/InterpretationChat"' in layout_text)
check("TX90p context published", "summarizeClimateAnalysis" in map_text)
check(
    "TC context published",
    "summarizeTropicalCycloneAnalysis" in map_text,
)
check(
    "daily heat clears stale map context",
    "clearPublishedAnalysisContext" in map_text,
)
check(
    "chat uses shared API helper",
    'getApiUrl("/api/chat/interpret")' in chat_text,
)
check(
    "daily heat context included",
    "mean_forecast_spread" in chat_text
    and "mean_exposure_probability" in chat_text,
)
check(
    "TX90p scientific semantics present",
    "inter-model max-minus-min" in interpreter_text,
)
check(
    "TC no-uncertainty semantics present",
    "does not include a separate uncertainty layer" in interpreter_text,
)
check(
    "H3 no-downscaling semantics present",
    "not physical downscaling" in interpreter_text,
)
check(
    "new chatbot has no red/rose UI classes",
    re.search(r"(?:red|rose)-\d+", chat_text + "\n" + context_text) is None,
)

for path in [server, interpreter]:
    result = subprocess.run(
        ["node", "--check", str(path)],
        capture_output=True,
        text=True,
    )
    check(f"node syntax: {path}", result.returncode == 0)
    if result.returncode != 0:
        print(result.stderr)

for label in passes:
    print("PASS", label)

for label in errors:
    print("FAIL", label)

if errors:
    print(f"\n{len(errors)} verification check(s) failed.")
    sys.exit(1)

print("\nAll Gemini interpretation-chat checks passed.")
