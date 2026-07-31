/**
 * Bivariate classification — a pure function over a declared dataset definition
 * (architecture.md Decision 4). The method follows from the mode (Decision 4a):
 *
 *   sequential-sequential   quantile (tertile) breaks on both axes
 *   diverging-diverging     symmetric equal-interval about the declared norm
 *   qualitative-sequential  categories as-is on the qualitative axis, quantile
 *                           on the sequential axis
 *
 * Classification runs once per (dataset, mode) and attaches a stable class to
 * every feature; breaks are exposed to the legend (Decision 4 rationale).
 * Features with a missing value on either axis are not classified (classIndex
 * null, rendered in the no-data colour).
 */
import { quantileSorted } from "d3-array";
import {
  type BivariateMode,
  type DatasetDefinition,
  type DatasetVariable,
  validateDatasetDefinition,
} from "./datasetDefinitions";

export interface AxisBreaks {
  /** Band edges for legend display. Length is the number of bands − 1. */
  edges: number[];
  /** Declared norm for diverging axes (undefined otherwise). */
  norm?: number;
}

export interface ClassifiedFeature {
  /** Stable identity: Mapbox feature id == promoteId value == chart record key. */
  id: string;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
  axis1Value: number | string | null;
  axis2Value: number | null;
  /** Per-axis class 0..2 (columns = axis1, rows = axis2). null when unclassified. */
  classCol: number | null;
  classRow: number | null;
  /** 0..8 = classRow * 3 + classCol. null when unclassified. */
  classIndex: number | null;
  /** Palette colour for the class, or the no-data colour. */
  fillColor: string | null;
}

export interface ClassificationResult {
  features: ClassifiedFeature[];
  breaksAxis1: AxisBreaks;
  breaksAxis2: AxisBreaks;
  /** Members per class index 0..8. */
  counts: number[];
  mode: BivariateMode;
  noDataCount: number;
}

const NO_DATA_COLOR = "#e0e0e0";

function readAxisValue(
  feature: GeoJSON.Feature,
  variable: DatasetVariable
): number | string | null {
  const raw = feature.properties?.[variable.key];
  if (raw === undefined || raw === null || raw === "") return null;
  if (variable.categories) return String(raw);
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

/**
 * Quantile (tertile) breaks. Fails loudly — naming the variable — when ties
 * defeat a clean three-way split (Decision 4a: an empty band is a dead legend
 * cell, which the legend contract forbids).
 */
function quantileBreaks(values: number[], variable: DatasetVariable): AxisBreaks {
  if (values.length === 0) {
    throw new Error(
      `Classification failed for "${variable.label}" (${variable.units}): no numeric values ` +
        `are present for this variable.`
    );
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 1 / 3) ?? sorted[0];
  const q2 = quantileSorted(sorted, 2 / 3) ?? sorted[sorted.length - 1];

  let band0 = 0;
  let band1 = 0;
  let band2 = 0;
  for (const v of sorted) {
    if (v <= q1) band0 += 1;
    else if (v <= q2) band1 += 1;
    else band2 += 1;
  }

  if (band0 === 0 || band1 === 0 || band2 === 0) {
    throw new Error(
      `Classification failed for "${variable.label}" (${variable.units}): the distribution ` +
        `cannot be split into three non-empty quantile bands (members ${band0}/${band1}/${band2} ` +
        `at breaks ${q1}, ${q2}). Heavy ties defeat tertiles — fail loudly rather than emit an empty class ` +
        `(architecture.md Decision 4a).`
    );
  }

  return { edges: [q1, q2] };
}

/**
 * Symmetric equal-interval breaks outward from the declared norm (Decision 4a).
 * The norm sits at the midpoint of the center band, so a feature exactly at the
 * norm classifies to the center band. Unlike quantile, an outer band MAY be
 * empty: tests.md requires the loud failure only for distributions that defeat
 * tertiles; a diverging axis whose data sits entirely on one side of the norm
 * (e.g. sea level anomaly, which is positive for every PICT) is a legitimate,
 * informative result — the legend marks the empty cell as such.
 */
function divergingBreaks(values: number[], variable: DatasetVariable): AxisBreaks {
  const norm = variable.norm;
  if (norm === undefined) {
    throw new Error(
      `Cannot classify "${variable.label}" in diverging-diverging mode: the dataset definition ` +
        `declares no norm for this variable. The norm is a property of the dataset definition, not ` +
        `a value derived from the visible extent (architecture.md Decision 4).`
    );
  }

  const halfExtent = Math.max(0, ...values.map((v) => Math.abs(v - norm)));
  if (halfExtent === 0) {
    throw new Error(
      `Classification failed for "${variable.label}" (${variable.units}): every feature equals ` +
        `the declared norm (${norm}), so symmetric equal-interval cannot split the distribution.`
    );
  }

  const step = halfExtent / 3;
  return { edges: [norm - halfExtent, norm - step, norm + step, norm + halfExtent], norm };
}

function classForValue(
  value: number,
  breaks: AxisBreaks,
  variable: DatasetVariable,
  isQuantile: boolean
): number {
  if (isQuantile) {
    const [q1, q2] = breaks.edges;
    if (value <= q1) return 0;
    if (value <= q2) return 1;
    return 2;
  }
  const norm = variable.norm as number;
  // Center band half-width: distance from the norm to the inner break.
  const step = breaks.edges[2] - norm;
  if (value < norm - step) return 0;
  if (value <= norm + step) return 1;
  return 2;
}

/**
 * Classify a dataset's features in the given mode. Pure and deterministic:
 * the same (features, definition, mode) always yields the same classes and
 * breaks (tests.md: "Classification is reproducible").
 */
export function classify(
  features: GeoJSON.Feature[],
  definition: DatasetDefinition,
  mode: BivariateMode,
  palette: string[][]
): ClassificationResult {
  validateDatasetDefinition(definition);

  const axis1IsCategorical = mode === "qualitative-sequential";
  const axis2IsQuantile = mode !== "diverging-diverging";
  const axis1IsQuantile = !axis1IsCategorical && axis2IsQuantile;

  const records = features.map((feature) => ({
    feature,
    id: String(feature.properties?.[definition.featureIdKey] ?? ""),
    axis1Value: readAxisValue(feature, definition.axis1),
    axis2Value: readAxisValue(feature, definition.axis2),
  }));

  // Break computation uses only features with a value on the axis in question.
  const axis1Numeric = records
    .map((r) => r.axis1Value)
    .filter((v): v is number => typeof v === "number");
  const axis2Numeric = records
    .map((r) => r.axis2Value)
    .filter((v): v is number => typeof v === "number");

  let breaksAxis1: AxisBreaks;
  if (axis1IsCategorical) {
    breaksAxis1 = { edges: [] };
  } else if (axis1IsQuantile) {
    breaksAxis1 = quantileBreaks(axis1Numeric, definition.axis1);
  } else {
    breaksAxis1 = divergingBreaks(axis1Numeric, definition.axis1);
  }

  let breaksAxis2: AxisBreaks;
  if (axis2IsQuantile) {
    breaksAxis2 = quantileBreaks(axis2Numeric, definition.axis2);
  } else {
    breaksAxis2 = divergingBreaks(axis2Numeric, definition.axis2);
  }

  const categories = definition.axis1.categories ?? [];

  const counts = Array(9).fill(0);
  let noDataCount = 0;

  const classified: ClassifiedFeature[] = records.map(({ feature, id, axis1Value, axis2Value }) => {
    let classCol: number | null = null;
    let classRow: number | null = null;
    let classIndex: number | null = null;
    let fillColor: string | null = NO_DATA_COLOR;

    if (axis1Value !== null && axis2Value !== null) {
      if (axis1IsCategorical) {
        const categoryIndex = categories.indexOf(String(axis1Value));
        if (categoryIndex !== -1) {
          classCol = categoryIndex;
          classRow = classForValue(axis2Value as number, breaksAxis2, definition.axis2, axis2IsQuantile);
          fillColor = palette[classRow][classCol];
        }
      } else {
        classCol = classForValue(axis1Value as number, breaksAxis1, definition.axis1, axis1IsQuantile);
        classRow = classForValue(axis2Value as number, breaksAxis2, definition.axis2, axis2IsQuantile);
        fillColor = palette[classRow][classCol];
      }

      if (classCol !== null && classRow !== null) {
        classIndex = classRow * 3 + classCol;
        counts[classIndex] += 1;
      }
    }

    if (classIndex === null) {
      noDataCount += 1;
    }

    return {
      id,
      geometry: feature.geometry,
      properties: feature.properties ?? {},
      axis1Value,
      axis2Value: axis2Value as number,
      classCol,
      classRow,
      classIndex,
      fillColor,
    };
  });

  return {
    features: classified,
    breaksAxis1,
    breaksAxis2,
    counts,
    mode,
    noDataCount,
  };
}
