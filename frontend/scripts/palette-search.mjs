// Palette search v5: qualitative-sequential via hue families x lightness levels.
import {
  ciede2000, hexToRgb, rgbToLab, simulateDeuteranopia,
} from "../src/dataviz/paletteCore.js";

const linear = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const gamma = (t) =>
  Math.round(255 * (t <= 0.0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - 0.055));
const clamp = (v) => Math.max(0, Math.min(255, v));
const hex = (r, g, b) => "#" + [clamp(r), clamp(g), clamp(b)].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const ch = (k) => gamma(linear(a[k]) * (1 - t) + linear(b[k]) * t);
  return hex(ch("r"), ch("g"), ch("b"));
}
const shade = (hexC, blackT) => mix(hexC, "#000000", blackT);
const tint = (hexC, whiteT) => mix(hexC, "#ffffff", whiteT);

function minDE(matrix) {
  let min = Infinity;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const here = rgbToLab(hexToRgb(matrix[r][c]));
    if (r < 2) min = Math.min(min, ciede2000(here, rgbToLab(hexToRgb(matrix[r + 1][c]))));
    if (c < 2) min = Math.min(min, ciede2000(here, rgbToLab(hexToRgb(matrix[r][c + 1]))));
  }
  return min;
}
function minDeutan(matrix) {
  let min = Infinity;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const here = rgbToLab(simulateDeuteranopia(matrix[r][c]));
    if (r < 2) min = Math.min(min, ciede2000(here, rgbToLab(simulateDeuteranopia(matrix[r + 1][c]))));
    if (c < 2) min = Math.min(min, ciede2000(here, rgbToLab(simulateDeuteranopia(matrix[r][c + 1]))));
  }
  return min;
}

const hueCandidates = [
  ["#e41a1c", "#377eb8", "#4daf4a"],   // red, blue, green (brewer set1)
  ["#e31a1c", "#1f78b4", "#33a02c"],   // red, blue, green
  ["#d95f02", "#1b9e77", "#7570b3"],   // orange, teal, purple
  ["#ca0020", "#0571b0", "#4d9221"],   // red, blue, green
  ["#b2182b", "#2166ac", "#4d9221"],   // dark red, blue, green
  ["#e08214", "#8073ac", "#35978f"],   // orange, purple, teal
  ["#a50026", "#4a90d9", "#3c8a5e"],   // dark red, blue, green
];

const results = [];
for (const hues of hueCandidates) {
  for (const tLight of [0.35, 0.45, 0.55]) {      // tint toward white for the light row
    for (const tDark of [0.55, 0.65, 0.75]) {     // shade toward black for the dark row
      // row0 = tints, row1 = base hues, row2 = shades
      const matrix = [
        [tint(hues[0], tLight), tint(hues[1], tLight), tint(hues[2], tLight)],
        [hues[0], hues[1], hues[2]],
        [shade(hues[0], tDark), shade(hues[1], tDark), shade(hues[2], tDark)],
      ];
      const s = minDE(matrix);
      const d = minDeutan(matrix);
      if (s >= 10 && d >= 10) {
        results.push({ hues, tLight, tDark, matrix, s, d });
      }
    }
  }
}

results.sort((a, b) => Math.min(a.s, a.d) > Math.min(b.s, b.d) ? -1 : 1);
console.log("total passing:", results.length);
for (const r of results.slice(0, 8)) {
  console.log(`\nsRGB=${r.s.toFixed(2)} deutan=${r.d.toFixed(2)} hues=[${r.hues}] tint=${r.tLight} shade=${r.tDark}`);
  for (const row of r.matrix) console.log("  ", row.join(" "));
}
