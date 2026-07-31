// Executable palette accessibility check (architecture.md Decision 4b).
// Runs `node scripts/check-palettes.mjs` — a failing palette fails the run.
//
// Threshold: ΔE00 (CIEDE2000) >= 10 between every pair of cells ADJACENT in the
// 3x3 matrix, evaluated both in sRGB and under a deuteranopia simulation.
// Non-adjacent pairs (opposite corners) are exempt: the matrix is a continuum.
// This is a perceptual difference metric, NOT WCAG contrast ratio.
import {
  PALETTES,
  minAdjacentDeltaE,
  simulateDeuteranopia,
} from "../src/dataviz/paletteCore.js";

const THRESHOLD = 10;

let failed = false;
for (const [name, matrix] of Object.entries(PALETTES)) {
  const sRGB = minAdjacentDeltaE(matrix);
  const deutan = minAdjacentDeltaE(matrix, simulateDeuteranopia);

  const ok = sRGB.minDeltaE >= THRESHOLD && deutan.minDeltaE >= THRESHOLD;
  if (!ok) failed = true;

  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}: ` +
      `sRGB ΔE00=${sRGB.minDeltaE.toFixed(2)} ` +
      `deuteranopia ΔE00=${deutan.minDeltaE.toFixed(2)} ` +
      `(threshold ${THRESHOLD})`
  );
  if (!ok) {
    console.log(
      `  worst pair: ${sRGB.worstPair.join(" vs ")} (sRGB ${sRGB.minDeltaE.toFixed(2)}) / ` +
        `${deutan.worstPair.join(" vs ")} (deutan ${deutan.minDeltaE.toFixed(2)})`
    );
  }
}

if (failed) {
  console.error(
    `\nPalette check failed: at least one palette has an adjacent pair below ΔE00 ${THRESHOLD}. ` +
      "Fix the palette — do not relax the threshold (architecture.md Decision 4b)."
  );
  process.exit(1);
}
console.log("\nPalette check passed: every mode's adjacent cells differ by ΔE00 >= 10 in sRGB and under deuteranopia.");
