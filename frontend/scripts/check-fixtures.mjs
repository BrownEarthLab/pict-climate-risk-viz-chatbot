// test:fixtures — labelling, provenance and no-analysis guard for the
// workbench fixture layer (tasks.md 1.3 and 1.6; tests.md "Labelling" and
// "No analysis"). Follows guard-d3.mjs (architecture.md Decision 6): exit
// code plus printed offenders, not a describe/it suite.
//
// What it checks:
//   1. No fixture label equals any real geographic name. The real-name set is
//      built by ENUMERATING THE STRING-VALUED PROPERTIES of the actual
//      reference files (data/reference/pict_regions.geojson and
//      data/reference/fiji_tikina.geojson), so a name field added later
//      cannot silently open the same hole. Comparison is WHOLE-LABEL after
//      trimming and casefolding — never a substring test: real names go down
//      to two characters (`Ba`, `Ra`), so substring matching flags almost any
//      English label.
//   2. No fixture label matches an ESRI Emerging Hot Spot Analysis category
//      string ("Persistent Hot Spot", "New Hot Spot", ...) — the single most
//      dangerous string to put on a synthetic map (Decision 4).
//   3. Every fixture dataset declares `provenance: "fixture"` (Decision 2).
//   4. The workbench computes no analysis: no Getis-Ord, Mann-Kendall, or
//      comparable statistical implementation in the workbench/fixture source,
//      and hotspot classes are LITERALS supplied by the fixture rather than
//      values derived in code.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const srcDir = join(root, "src");
const offenders = [];

// Reference geometry files whose string values are real names the fixtures
// must never collide with (tests.md "Labelling"; research.md Verified facts).
const REFERENCE_FILES = [
  join(root, "..", "data", "reference", "pict_regions.geojson"),
  join(root, "..", "data", "reference", "fiji_tikina.geojson"),
];

// The ESRI Emerging Hot Spot Analysis categories (16, from the vendor doc the
// change's research read). Deliberately hardcoded: they are the exact strings
// fixtures must avoid, and they do not live in any repo file to enumerate.
const ESRI_CATEGORIES = [
  "New Hot Spot",
  "Consecutive Hot Spot",
  "Intensifying Hot Spot",
  "Persistent Hot Spot",
  "Diminishing Hot Spot",
  "Sporadic Hot Spot",
  "Oscillating Hot Spot",
  "Historical Hot Spot",
  "New Cold Spot",
  "Consecutive Cold Spot",
  "Intensifying Cold Spot",
  "Persistent Cold Spot",
  "Diminishing Cold Spot",
  "Sporadic Cold Spot",
  "Oscillating Cold Spot",
  "Historical Cold Spot",
  "No Pattern Detected",
];

// Statistical terms that must not appear in workbench/fixture/component
// source (tests.md "No analysis"; spec requirement "The Workbench Computes No
// Analysis"). Spatial statistics and trend tests specifically — not general
// charting math.
const FORBIDDEN_ANALYSIS = [
  /getis/i,
  /kendall/i,
  /mann[\s-]?kendall/i,
  /gi\s*\*/i,
  /esda/i,
  /libpysal/i,
  /moran/i,
  /emerging\s+hot\s+spot/i,
  /space[\s-]?time\s+cube/i,
];

const normalize = (s) => String(s).trim().toLocaleLowerCase("en");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// Extract the string literals of a source file, skipping comments: the
// check targets DATA literals (labels the fixture actually renders), not
// prose — a comment may legitimately quote an ESRI category or a real place
// name while explaining why fixtures must not use them. Fixture modules are
// plain data (.ts), so a small scanner over quotes/escapes suffices.
function stringLiterals(source) {
  const out = [];
  const n = source.length;
  let i = 0;
  while (i < n) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      let lit = "";
      while (j < n) {
        const c = source[j];
        if (c === "\\") {
          lit += c + (source[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (c === quote) {
          j += 1;
          break;
        }
        lit += c;
        j += 1;
      }
      out.push(lit);
      i = j;
      continue;
    }
    i += 1;
  }
  return out;
}

// --- 1 + 2. Label checks -----------------------------------------------------
// Build the real-name set from the actual reference files.
const realNames = new Set();
for (const file of REFERENCE_FILES) {
  let geojson;
  try {
    geojson = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    offenders.push(`Cannot read reference file ${file} — the label check is not running.`);
    continue;
  }
  for (const feature of geojson.features ?? []) {
    for (const value of Object.values(feature.properties ?? {})) {
      if (typeof value === "string" && value.trim() !== "") {
        realNames.add(normalize(value));
      }
    }
  }
}

const fixtureDir = join(srcDir, "fixtures");
let fixtureFiles;
try {
  fixtureFiles = walk(fixtureDir);
} catch {
  offenders.push(`src/fixtures/ does not exist — the fixture layer has not been authored.`);
  fixtureFiles = [];
}

const esriSet = new Set(ESRI_CATEGORIES.map(normalize));
let fixtureLiteralCount = 0;
let provenanceDeclarations = 0;

for (const file of fixtureFiles) {
  const source = readFileSync(file, "utf8");
  const rel = relative(srcDir, file);

  // Provenance (check 3): every declaration must be "fixture".
  const provRe = /provenance\s*:\s*["']([^"']*)["']/g;
  let pm;
  while ((pm = provRe.exec(source)) !== null) {
    provenanceDeclarations += 1;
    if (normalize(pm[1]) !== "fixture") {
      offenders.push(
        `${rel}: a dataset declares provenance "${pm[1]}" — every fixture dataset must ` +
          `declare provenance: "fixture" (architecture.md Decision 2).`
      );
    }
  }

  // Labels (checks 1 + 2): every string literal, whole-label normalised.
  for (const literal of stringLiterals(source)) {
    if (literal.trim() === "") continue;
    fixtureLiteralCount += 1;
    const key = normalize(literal);
    if (realNames.has(key)) {
      offenders.push(
        `${rel}: label "${literal}" equals a real geographic name in the reference ` +
          `geometry — synthetic values MUST NOT be attached to real place names ` +
          `(architecture.md Decision 4; the load-bearing safeguard).`
      );
    }
    if (esriSet.has(key)) {
      offenders.push(
        `${rel}: label "${literal}" is an ESRI Emerging Hot Spot Analysis category ` +
          `string — fixtures must use generic class names (Decision 4).`
      );
    }
  }
}

if (fixtureFiles.length === 0) {
  offenders.push("No fixture source found — nothing declares provenance or labels to check.");
} else if (provenanceDeclarations === 0) {
  offenders.push("No `provenance` declaration found in src/fixtures/ — every fixture dataset must declare it.");
}

// --- 4. No analysis ----------------------------------------------------------
// Scan the workbench, the fixture layer, and the three components this change
// builds: the place a statistical implementation would live.
const noAnalysisDirs = [
  join(srcDir, "workbench"),
  fixtureDir,
  join(srcDir, "components", "viz", "NightingaleRoseChart.tsx"),
  join(srcDir, "components", "viz", "CategoricalHotspotLayer.tsx"),
  join(srcDir, "components", "viz", "PopulationSmallMultiples.tsx"),
];

for (const target of noAnalysisDirs) {
  const files = walkSafe(target);
  for (const file of files) {
    const source = readFileSafe(file);
    if (source === null) continue;
    const rel = relative(srcDir, file);
    for (const re of FORBIDDEN_ANALYSIS) {
      if (re.test(source)) {
        offenders.push(
          `${rel}: source matches the statistical-computation pattern /${re.source}/ — ` +
            `the workbench computes no analysis (spec: "The Workbench Computes No Analysis").`
        );
      }
    }
  }
}

// Hotspot classes must be literals supplied by the fixture, not values derived
// in code (spec scenario: "per-feature class values are read directly from the
// fixture rather than derived"). The fixture's class assignments are a literal
// data array; require at least the first class to be present as a literal.
const hotspotFixture = fixtureFiles.find((f) => /hotspot/i.test(f));
if (hotspotFixture) {
  const source = readFileSync(hotspotFixture, "utf8");
  if (!source.includes('"Class 1"') && !source.includes("'Class 1'")) {
    offenders.push(
      `${relative(srcDir, hotspotFixture)}: no literal class value "Class 1" found — hotspot ` +
        `class values must be literals read from the fixture, never computed.`
    );
  }
}

function walkSafe(dir) {
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    return [];
  }
  if (stat.isFile()) {
    return [dir];
  }
  try {
    return walk(dir);
  } catch {
    return [];
  }
}

function readFileSafe(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

if (offenders.length > 0) {
  console.error(`Fixture check failed:\n${offenders.join("\n")}`);
  process.exit(1);
}

console.log(
  `Fixture check ok: ${fixtureLiteralCount} fixture literals clear of real names and ESRI ` +
    `categories; ${provenanceDeclarations} provenance declarations all "fixture"; no analysis ` +
    `patterns found.`
);
