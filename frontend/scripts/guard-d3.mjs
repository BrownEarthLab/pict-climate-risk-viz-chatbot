// Grep guard enforcing architecture.md Decision 1: d3-selection and d3-brush must
// appear in neither package.json nor any import under src/. The v1 self-destruction
// defect required imperative D3 DOM ownership (svg.selectAll("*").remove()); removing
// the packages retires the whole bug class, so their absence is enforced mechanically.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const FORBIDDEN = ["d3-selection", "d3-brush"];
const offenders = [];

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

const pkg = readFileSync(join(root, "package.json"), "utf8");
for (const forbidden of FORBIDDEN) {
  if (pkg.includes(forbidden)) {
    offenders.push(`package.json contains "${forbidden}"`);
  }
}

for (const file of walk(join(root, "src"))) {
  const content = readFileSync(file, "utf8");
  for (const forbidden of FORBIDDEN) {
    if (content.includes(forbidden)) {
      offenders.push(`${file} references "${forbidden}"`);
    }
  }
}

if (offenders.length > 0) {
  console.error(`D3 guard failed:\n${offenders.join("\n")}`);
  process.exit(1);
}

console.log("D3 guard ok: d3-selection and d3-brush absent from package.json and src/");
