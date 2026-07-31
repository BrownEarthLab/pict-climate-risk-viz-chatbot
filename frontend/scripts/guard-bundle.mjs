// Bundle guard for the fixture containment contract (architecture.md
// Decisions 1 and 3; tasks.md 1.1 / 1.1a; tests.md "Containment"). Run AFTER
// `npm run build` — `npm run test:bundle-guard`.
//
// Three independent checks:
//   1. STRUCTURAL (Decision 1). The production build input must name the
//      application entry only. The workbench is excluded by never being an
//      entry, not by filtering afterwards — this config assertion is the half
//      that can fail before anything is built.
//   2. ARTEFACT SCAN. No workbench artefact (file or path) may appear in
//      `dist/`.
//   3. FIXTURE SCAN. No fixture module may appear in the bundle. This scan is
//      keyed on the sentinel STRING LITERAL declared in
//      `src/fixtures/sentinel.ts`, never on module paths or identifiers:
//      Vite 8 minifies with Oxc by default, which can mangle both, while
//      string literals survive (architecture.md Decision 3).
//
// The scan targets fixture modules only, never shared components — a shared
// component legitimately bundled by both entries must not trip it
// (tests.md "Containment" edge case).
//
// Non-vacuousness is proven by the negative control in tasks.md 1.1a: leak a
// fixture from the application entry, build, and confirm THIS guard fails.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const distDir = join(root, "dist");
const srcDir = join(root, "src");
const offenders = [];

// --- 1. Structural: the production build input excludes the workbench --------
const viteConfig = readFileSync(join(root, "vite.config.js"), "utf8");
if (!/build\s*:/m.test(viteConfig)) {
  offenders.push(
    "vite.config.js declares no `build` key — the workbench is not structurally " +
      "excluded from the production build (architecture.md Decision 1)."
  );
} else if (!/rolldownOptions\s*:/m.test(viteConfig)) {
  offenders.push(
    "vite.config.js `build` does not use `rolldownOptions` — Vite 8 bundles with " +
      "Rolldown and `rollupOptions` is a deprecated alias for it."
  );
} else if (!/input\s*:/m.test(viteConfig)) {
  offenders.push(
    "vite.config.js `build.rolldownOptions` declares no `input` — nothing asserts " +
      "which HTML entry the production build emits."
  );
} else {
  // The check targets the INPUT VALUE, not prose: the config's comments may
  // legitimately explain the exclusion.
  const inputMatch = viteConfig.match(/input\s*:\s*(?:\[)?\s*["']([^"']+)["']/);
  if (inputMatch && /workbench/i.test(inputMatch[1])) {
    offenders.push(
      `vite.config.js lists "${inputMatch[1]}" as a build input — the production build ` +
        `input must name the application entry only; the workbench is excluded by never ` +
        `being an entry.`
    );
  } else if (!inputMatch) {
    offenders.push(
      "vite.config.js `build.rolldownOptions.input` holds no quoted entry — nothing asserts " +
        "the production build input names the application entry only."
    );
  }
}

// --- 2. Artefact scan: no workbench file anywhere in dist/ -------------------
if (!statSync(distDir, { throwIfNoEntry: false })?.isDirectory()) {
  offenders.push(`dist/ does not exist at ${distDir} — run \`npm run build\` before this guard.`);
} else {
  const distFiles = walk(distDir);
  for (const file of distFiles) {
    if (/workbench/i.test(file)) {
      offenders.push(`workbench artefact present in the production build: ${file}`);
    }
  }

  // --- 3. Fixture scan: no sentinel literal anywhere in the bundle ------------
  const sentinelFile = join(srcDir, "fixtures", "sentinel.ts");
  let sentinelSource;
  try {
    sentinelSource = readFileSync(sentinelFile, "utf8");
  } catch {
    offenders.push(
      `${sentinelFile} does not exist — the fixture scan cannot be keyed and would be vacuous.`
    );
    sentinelSource = "";
  }
  const sentinelMatch = sentinelSource.match(/FIXTURE_SENTINEL\s*=\s*["']([^"']+)["']/);
  if (!sentinelMatch) {
    offenders.push(
      "src/fixtures/sentinel.ts does not declare `FIXTURE_SENTINEL` — the bundle scan " +
        "cannot be keyed and would be vacuous."
    );
  } else {
    const sentinel = sentinelMatch[1];
    const codeFiles = distFiles.filter((f) => /\.(js|css|mjs|cjs|html)$/i.test(f));
    for (const file of codeFiles) {
      const content = readFileSync(file, "utf8");
      if (content.includes(sentinel)) {
        offenders.push(
          `fixture sentinel "${sentinel}" found in the production bundle: ${file} — ` +
            `a fixture module reached the application build.`
        );
      }
    }
  }
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

if (offenders.length > 0) {
  console.error(`Bundle guard failed:\n${offenders.join("\n")}`);
  process.exit(1);
}

console.log(
  "Bundle guard ok: workbench absent from the production build, no fixture sentinel in the bundle."
);
