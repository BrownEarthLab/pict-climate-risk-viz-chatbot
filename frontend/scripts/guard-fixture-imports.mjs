// Lint guard: no import of src/fixtures/ may exist anywhere in the
// application module graph (tests.md "Containment" source guard; spec
// "Fixture Data Is Confined To The Workbench Entry"). Enforced in the lint
// step so it fails fast rather than at build.
//
// Scope: every file under src/ EXCEPT src/workbench/ and src/fixtures/
// themselves. The workbench is the only legal consumer of fixtures; shared
// component source is included in the scan because it is reachable from the
// application entry. Follows guard-d3.mjs: exit code plus printed offenders.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const srcDir = join(root, "src");
const offenders = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "fixtures" || entry === "workbench") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// Static import specifiers and dynamic import() calls whose specifier
// references the fixtures directory.
const IMPORT_RE = /(?:from\s+|import\s*\(\s*)(["'])([^"']*fixtures[^"']*)\1/g;

for (const file of walk(srcDir)) {
  const content = readFileSync(file, "utf8");
  const rel = relative(srcDir, file);
  for (const match of content.matchAll(IMPORT_RE)) {
    offenders.push(
      `${rel} imports "${match[2]}" — fixture modules may be imported only from the ` +
        `workbench entry (architecture.md Decision 1; the application entry must not ` +
        `bundle or render fixture data).`
    );
  }
}

if (offenders.length > 0) {
  console.error(`Fixture-import guard failed:\n${offenders.join("\n")}`);
  process.exit(1);
}

console.log(
  "Fixture-import guard ok: no import of src/fixtures/ outside src/workbench/."
);
