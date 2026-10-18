export interface ClimateCutoffs {
  riskLowMax: number;
  riskHighMin: number;
  reliabilityLowMax: number;
  reliabilityHighMin: number;
}

export const DEFAULT_CLIMATE_CUTOFFS: ClimateCutoffs = {
  riskLowMax: 35,
  riskHighMin: 50,
  reliabilityLowMax: 0.33,
  reliabilityHighMin: 0.66,
};

export const CLIMATE_CUTOFFS_STORAGE_KEY =
  "pict-climate-value-by-alpha-cutoffs-v1";

export const TX90P_RISK_COLORS = {
  low: "#0067B1",
  medium: "#B89A75",
  high: "#F47A00",
} as const;

export const RELIABILITY_ALPHA = {
  low: 0.55,
  medium: 0.75,
  high: 0.95,
} as const;

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeClimateCutoffs(
  value: Partial<ClimateCutoffs> | null | undefined,
): ClimateCutoffs {
  const riskLow = finiteNumber(value?.riskLowMax);
  const riskHigh = finiteNumber(value?.riskHighMin);
  const relLow = finiteNumber(value?.reliabilityLowMax);
  const relHigh = finiteNumber(value?.reliabilityHighMin);

  const riskLowMax = Math.max(
    0,
    Math.min(99, riskLow ?? DEFAULT_CLIMATE_CUTOFFS.riskLowMax),
  );
  const riskHighMin = Math.max(
    riskLowMax + 1,
    Math.min(100, riskHigh ?? DEFAULT_CLIMATE_CUTOFFS.riskHighMin),
  );

  const reliabilityLowMax = Math.max(
    0,
    Math.min(0.98, relLow ?? DEFAULT_CLIMATE_CUTOFFS.reliabilityLowMax),
  );
  const reliabilityHighMin = Math.max(
    reliabilityLowMax + 0.01,
    Math.min(1, relHigh ?? DEFAULT_CLIMATE_CUTOFFS.reliabilityHighMin),
  );

  return {
    riskLowMax,
    riskHighMin,
    reliabilityLowMax,
    reliabilityHighMin,
  };
}

export function loadClimateCutoffs(): ClimateCutoffs {
  if (typeof window === "undefined") return DEFAULT_CLIMATE_CUTOFFS;

  try {
    const raw = window.localStorage.getItem(CLIMATE_CUTOFFS_STORAGE_KEY);
    if (!raw) return DEFAULT_CLIMATE_CUTOFFS;

    return normalizeClimateCutoffs(
      JSON.parse(raw) as Partial<ClimateCutoffs>,
    );
  } catch (error) {
    console.warn("Could not load TX90p visualization cutoffs:", error);
    return DEFAULT_CLIMATE_CUTOFFS;
  }
}

export function saveClimateCutoffs(value: ClimateCutoffs): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      CLIMATE_CUTOFFS_STORAGE_KEY,
      JSON.stringify(normalizeClimateCutoffs(value)),
    );
  } catch (error) {
    console.warn("Could not save TX90p visualization cutoffs:", error);
  }
}

export function classifyTx90pRisk(
  value: number,
  cutoffs: ClimateCutoffs,
): "low" | "medium" | "high" {
  if (value < cutoffs.riskLowMax) return "low";
  if (value < cutoffs.riskHighMin) return "medium";
  return "high";
}

export function classifyReliability(
  value: number,
  cutoffs: ClimateCutoffs,
): "low" | "medium" | "high" {
  if (value < cutoffs.reliabilityLowMax) return "low";
  if (value < cutoffs.reliabilityHighMin) return "medium";
  return "high";
}

export function reclassifyClimateFeatures(
  features: GeoJSON.Feature[],
  requestedCutoffs: ClimateCutoffs,
): GeoJSON.Feature[] {
  const cutoffs = normalizeClimateCutoffs(requestedCutoffs);

  return features.map((feature) => {
    const properties = (feature.properties || {}) as Record<string, unknown>;

    const tx90p = finiteNumber(
      properties.value ??
        properties.tx90p ??
        properties.ensemble_mean_tx90p,
    );

    const reliability = finiteNumber(properties.reliability_score);

    if (tx90p === null || reliability === null) {
      return feature;
    }

    const riskClass = classifyTx90pRisk(tx90p, cutoffs);
    const reliabilityClass = classifyReliability(reliability, cutoffs);

    return {
      ...feature,
      properties: {
        ...properties,
        risk_class: riskClass,
        reliability_class: reliabilityClass,
        bivariate_class: `${riskClass}_risk_${reliabilityClass}_reliability`,
        bivariate_color: TX90P_RISK_COLORS[riskClass],
        alpha: RELIABILITY_ALPHA[reliabilityClass],
        visualization_risk_low_max: cutoffs.riskLowMax,
        visualization_risk_high_min: cutoffs.riskHighMin,
        visualization_reliability_low_max: cutoffs.reliabilityLowMax,
        visualization_reliability_high_min: cutoffs.reliabilityHighMin,
      },
    };
  });
}
