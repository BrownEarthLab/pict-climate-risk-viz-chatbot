/**
 * Bivariate dataset definitions (architecture.md Decision 4 / 4a).
 *
 * Each dataset declares the geographic scale of its features, its two
 * variables, and — for diverging mode — an explicit norm value per axis.
 * The classification METHOD is NOT declared per dataset: it follows from the
 * active mode (quantile for sequential axes, symmetric equal-interval about
 * the declared norm for diverging).
 */

export type GeographicScale = "fiji-cells" | "pict-country";

export type BivariateMode =
  | "sequential-sequential"
  | "diverging-diverging"
  | "qualitative-sequential";

export interface DatasetVariable {
  /** Property key holding the value on each GeoJSON feature. */
  key: string;
  /** Human-readable label shown in the legend and tooltips. */
  label: string;
  /** Display units, e.g. "%", "people", "°C", "days/year", "m". */
  units: string;
  /** Declared norm for diverging mode (Decision 4). Undefined for axes without one. */
  norm?: number;
  /** Geographic scale of this variable's features (Decision 4: no cross-scale joins). */
  scale: GeographicScale;
  /** For the qualitative axis: the ordered category values. */
  categories?: string[];
  /**
   * Per-feature uncertainty envelope property keys (`_min` / `_mean` / `_max`),
   * for the box plot. The Fiji heat layer's uncertainty columns are the
   * year-to-year spread for one model — NOT model-ensemble uncertainty.
   */
  envelope?: { min: string; mean: string; max: string };
}

export interface DatasetDefinition {
  id: string;
  title: string;
  /** One-sentence framing shown in the chapter. */
  description: string;
  source: string;
  /** GeoJSON FeatureCollection URL served by the frontend. */
  dataUrl: string;
  /** Property used as the stable identity (feature id == promoteId == chart key). */
  featureIdKey: string;
  /** Property (or accessor) used to read a value for each axis variable. */
  axis1: DatasetVariable;
  axis2: DatasetVariable;
}

/**
 * The verified pairs (docs/v2-direction-research.md §3a), as authored on
 * 2026-07-31 against the actual on-disk data:
 *
 *  1. pict-water-pop     — safe water access % × population (PICT, country).
 *     Sequential–sequential (the proposal's verified "Sequential–sequential
 *     (alt)" pair: any SDMX indicator × POP_EST).
 *  2. pict-sea-level     — sea level anomaly (m, norm 0) × safe water access
 *     deviation from the regional median (pp, norm 0). Diverging–diverging.
 *  3. pict-subregion-pop — subregion (Melanesia/Polynesia/Micronesia) ×
 *     population (PICT, country). Qualitative–sequential.
 *  4. fiji-heat-variability — mean annual max temperature (°C) × year-to-year
 *     spread of extreme heat days (`extreme_heat_days_max − _min`; days/year).
 *     DATA NOTE: in the current 2050s SSP2-4.5 ACCESS-CM2 file every cell has
 *     0 extreme heat days, so the spread axis is constant (0) everywhere.
 *     Its classification therefore FAILS LOUDLY per Decision 4a — the honest,
 *     spec-mandated outcome for a distribution that defeats tertiles. This
 *     definition doubles as the fixture for that test case; the narrative
 *     chapters use the PICT pairs above.
 */
export const DATASET_DEFINITIONS: DatasetDefinition[] = [
  {
    id: "pict-water-pop",
    title: "Safe water access × population",
    description:
      "Countries with the lowest safe water access and the largest populations face the hardest adaptation problem.",
    source: "SPC Pacific Data Hub SDMX (DF_SDG_06, SH_H2O_SAFE, latest year) and Natural Earth 10m admin-0 POP_EST (2019).",
    dataUrl: "/data/pict_bivariate.geojson",
    featureIdKey: "id",
    axis1: {
      key: "water_access_pct",
      label: "Safe water access",
      units: "%",
      scale: "pict-country",
    },
    axis2: {
      key: "pop_est",
      label: "Population",
      units: "people",
      scale: "pict-country",
    },
  },
  {
    id: "pict-sea-level",
    title: "Sea level anomaly × indicator deviation",
    description:
      "How far each country sits from the regional norms — the Pacific median sea level anomaly, and the regional median of safe water access.",
    source:
      "SPC Pacific Data Hub SDMX: DF_CLIMATE_CHANGE SEA_LVL (sea level anomaly, m, latest year) and DF_SDG_06 SH_H2O_SAFE, each expressed as deviation from the regional median.",
    dataUrl: "/data/pict_bivariate.geojson",
    featureIdKey: "id",
    axis1: {
      key: "sea_level_deviation_m",
      label: "Sea level anomaly deviation from regional median",
      units: "m",
      norm: 0,
      scale: "pict-country",
    },
    axis2: {
      key: "water_access_deviation_pp",
      label: "Safe water access deviation from regional median",
      units: "pp",
      norm: 0,
      scale: "pict-country",
    },
  },
  {
    id: "pict-subregion-pop",
    title: "Subregion × population",
    description:
      "Melanesia, Polynesia, and Micronesia — with population as the sequential axis.",
    source: "Natural Earth 10m admin-0 POP_EST (2019) joined to pict_regions.geojson on ISO3.",
    dataUrl: "/data/pict_bivariate.geojson",
    featureIdKey: "id",
    axis1: {
      key: "subregion",
      label: "Subregion",
      units: "",
      scale: "pict-country",
      categories: ["Melanesia", "Polynesia", "Micronesia"],
    },
    axis2: {
      key: "pop_est",
      label: "Population",
      units: "people",
      scale: "pict-country",
    },
  },
  {
    id: "fiji-heat-variability",
    title: "Heat × inter-annual variability (Fiji, 102 cells)",
    description:
      "Mean annual maximum temperature against the year-to-year spread of extreme heat days — a single model (ACCESS-CM2), not model uncertainty.",
    source:
      "fiji_extreme_heat_days_2050s_ssp245_access_cm2.geojson (NASA NEX-GDDP-CMIP6, ACCESS-CM2, SSP2-4.5, 2041–2060).",
    dataUrl: "/data/fiji_extreme_heat_days.geojson",
    featureIdKey: "cell_id",
    axis1: {
      key: "mean_tasmax_c_mean",
      label: "Mean annual maximum temperature",
      units: "°C",
      scale: "fiji-cells",
      envelope: {
        min: "extreme_heat_days_min",
        mean: "extreme_heat_days_mean",
        max: "extreme_heat_days_max",
      },
    },
    axis2: {
      // `_max − _min` is the year-to-year spread of extreme-heat-days for one
      // model — inter-annual variability, NOT model-ensemble uncertainty.
      key: "extreme_heat_days_spread",
      label: "Inter-annual variability of extreme heat days",
      units: "days/year",
      scale: "fiji-cells",
    },
  },
];

export function getDatasetDefinition(id: string): DatasetDefinition {
  const def = DATASET_DEFINITIONS.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown dataset definition: ${id}`);
  return def;
}

/**
 * Decision 4: a bivariate encoding must NOT join variables across scales.
 * Rejects a definition pairing variables of differing declared scale with an
 * error naming both scales.
 */
export function validateDatasetDefinition(def: DatasetDefinition): void {
  if (def.axis1.scale !== def.axis2.scale) {
    throw new Error(
      `Mixed-scale dataset definition rejected: "${def.axis1.label}" declares scale ` +
        `"${def.axis1.scale}" but "${def.axis2.label}" declares scale "${def.axis2.scale}". ` +
        `A bivariate encoding may not join variables across scales (architecture.md Decision 4).`
    );
  }
}
