/**
 * Plain-JS palette core, importable both from the React app and from the
 * `npm run test:palette` check script (which has no build step).
 *
 * Contains:
 *  - the three 3x3 palette matrices (rows = axis 2 class, columns = axis 1 class);
 *  - CIEDE2000 (ΔE00) colour difference;
 *  - a deuteranopia simulation (Viénot, Brettel & Mollon 1999).
 *
 * architecture.md Decision 4b: palette distinguishability is measured in ΔE00,
 * not WCAG contrast ratio.
 */

/** @type {Record<string, string[][]>} */
export const PALETTES = {
  // axis 1 (columns): light -> saturated red-ish sequential ramp
  // axis 2 (rows):    light -> dark blue-green sequential ramp
  // ΔE00 (sRGB / deuteranopia): 12.5 / 12.6
  "sequential-sequential": [
    ["#e8d2b2", "#c7b7ba", "#c29494"],
    ["#e0a98d", "#bd8396", "#b73d5e"],
    ["#9fa58a", "#5d7c94", "#4e2a59"],
  ],
  // diverging about the norm:
  //   axis 1 (columns): blue -> neutral -> red
  //   axis 2 (rows):    yellow -> neutral -> purple
  // center cell is the neutral (norm on both axes).
  // ΔE00 (sRGB / deuteranopia): 15.5 / 14.3
  "diverging-diverging": [
    ["#b5a684", "#f5e3b8", "#e6a546"],
    ["#b5bfd5", "#f5f5f5", "#e6beba"],
    ["#584f99", "#c3b6c7", "#af4b6c"],
  ],
  // qualitative axis 1: hue per category (orange / teal / purple);
  // axis 2 (rows): lightness ramp (tint -> base -> shade).
  // ΔE00 (sRGB / deuteranopia): 21.2 / 15.2
  "qualitative-sequential": [
    ["#ebbeb3", "#b4d1c4", "#c3c2da"],
    ["#d95f02", "#1b9e77", "#7570b3"],
    ["#742f01", "#09533d", "#3c395e"],
  ],
};

/**
 * Parse a #rrggbb hex string into integer rgb components.
 * @param {string} hex
 * @returns {{r: number, g: number, b: number}}
 */
export function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const int = parseInt(value, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

/** @param {number} c 0..255 */
function toLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** @param {number} t 0..1 linear */
function toGamma(t) {
  return t <= 0.0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - 0.055;
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function mixChannels(a, b, t) {
  const ch = (key) => toGamma(toLinear(a[key]) * (1 - t) + toLinear(b[key]) * t);
  const r = clamp255(ch("r") * 255);
  const g = clamp255(ch("g") * 255);
  const blue = clamp255(ch("b") * 255);
  return "#" + [r, g, blue].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Lighten a hex colour toward white by t (0..1). */
export function lighten(hex, t) {
  return mixChannels(hexToRgb(hex), { r: 255, g: 255, b: 255 }, t);
}

/** Darken a hex colour toward black by t (0..1). */
export function darken(hex, t) {
  return mixChannels(hexToRgb(hex), { r: 0, g: 0, b: 0 }, t);
}

/** @param {{r: number, g: number, b: number}} rgb 0..255 values */
export function rgbToLab(rgb) {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  // sRGB -> XYZ (D65)
  let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  let z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;

  x = x / 0.95047;
  z = z / 1.08883;

  const f = (t) => (t > epsilon ? Math.cbrt(t) : (kappa * t + 16) / 116);

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * CIEDE2000 colour difference between two Lab colours.
 * @param {{L: number, a: number, b: number}} lab1
 * @param {{L: number, a: number, b: number}} lab2
 * @returns {number} ΔE00
 */
export function ciede2000(lab1, lab2) {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (C1 + C2) / 2;

  const G =
    0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = Math.atan2(b1, a1p) * (180 / Math.PI);
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * (180 / Math.PI);
  if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    const raw = h2p - h1p;
    if (raw <= 180) dhp = raw + (raw < -180 ? 360 : 0);
    else dhp = raw - 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * (Math.PI / 180));

  const avgLp = (L1 + L2) / 2;
  const avgCp = (C1p + C2p) / 2;

  let avgHp = 0;
  if (C1p * C2p !== 0) {
    const raw = h1p + h2p;
    if (Math.abs(h1p - h2p) > 180) {
      avgHp = raw < 360 ? (raw + 360) / 2 : (raw - 360) / 2;
    } else {
      avgHp = raw / 2;
    }
  }

  const T =
    1 -
    0.17 * Math.cos(((avgHp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * avgHp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * avgHp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * avgHp - 63) * Math.PI) / 180);

  const dTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const Rc =
    2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const Sl =
    1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const Rt = -Math.sin((2 * dTheta * Math.PI) / 180) * Rc;

  const lTerm = dLp / Sl;
  const cTerm = dCp / Sc;
  const hTerm = dHp / Sh;

  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + Rt * cTerm * hTerm);
}

/**
 * Deuteranopia simulation (Viénot, Brettel & Mollon 1999).
 * @param {string} hex #rrggbb
 * @returns {{r: number, g: number, b: number}} simulated 0..255 rgb
 */
export function simulateDeuteranopia(hex) {
  const { r, g, b } = hexToRgb(hex);

  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);

  // Viénot 1999 deuteranopia matrix (D65)
  const sr = 0.1443 * rl + 0.8736 * gl + -0.0185 * bl;
  const sg = -0.1519 * rl + 1.0884 * gl + 0.0635 * bl;
  const sb = 0.0 * rl + 0.0 * gl + 1.0 * bl;

  return {
    r: Math.round(255 * toGamma(Math.max(0, Math.min(1, sr)))),
    g: Math.round(255 * toGamma(Math.max(0, Math.min(1, sg)))),
    b: Math.round(255 * toGamma(Math.max(0, Math.min(1, sb)))),
  };
}

/**
 * Compute the minimum ΔE00 between matrix-adjacent cells.
 * @param {string[][]} matrix 3x3 palette
 * @param {(hex: string) => {r: number, g: number, b: number}} [transform]
 * @returns {{minDeltaE: number, worstPair: [string, string]}}
 */
export function minAdjacentDeltaE(matrix, transform = hexToRgb) {
  const labs = matrix.map((row) =>
    row.map((hex) => rgbToLab(transform(hex)))
  );
  let minDeltaE = Infinity;
  let worstPair = ["", ""];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const neighbors = [];
      if (r < 2) neighbors.push([r + 1, c]);
      if (c < 2) neighbors.push([r, c + 1]);
      for (const [nr, nc] of neighbors) {
        const d = ciede2000(labs[r][c], labs[nr][nc]);
        if (d < minDeltaE) {
          minDeltaE = d;
          worstPair = [matrix[r][c], matrix[nr][nc]];
        }
      }
    }
  }
  return { minDeltaE, worstPair };
}
