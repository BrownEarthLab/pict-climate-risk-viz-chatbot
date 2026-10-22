export interface PublishedAnalysisContext {
  analysis_type: string;
  [key: string]: unknown;
}

const STORAGE_KEY = "pict-active-analysis-context-v2";
const EVENT_NAME = "pict-active-analysis-context";

type FeatureLike = {
  properties?: Record<string, unknown> | null;
};

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countBy(
  features: FeatureLike[],
  property: string,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const feature of features) {
    const raw = feature.properties?.[property];
    if (raw === null || raw === undefined || raw === "") continue;
    const key = String(raw);
    counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
}

function numericValues(
  features: FeatureLike[],
  keys: string[],
): number[] {
  const values: number[] = [];

  for (const feature of features) {
    for (const key of keys) {
      const value = finiteNumber(feature.properties?.[key]);
      if (value !== null) {
        values.push(value);
        break;
      }
    }
  }

  return values;
}

export function summarizeClimateAnalysis(
  features: FeatureLike[],
  options: Record<string, unknown>,
): PublishedAnalysisContext {
  const tx90p = numericValues(features, [
    "value",
    "tx90p",
    "ensemble_mean_tx90p",
  ]);
  const reliability = numericValues(features, ["reliability_score"]);
  const spread = numericValues(features, [
    "uncertainty_spread",
    "inter_model_spread",
    "model_spread",
    "spread",
    "ensemble_spread",
  ]);

  return {
    analysis_type: "climate_tx90p",
    published_at: Date.now(),
    feature_count: features.length,
    mean_tx90p_percent: mean(tx90p),
    max_tx90p_percent: tx90p.length ? Math.max(...tx90p) : null,
    mean_reliability: mean(reliability),
    mean_inter_model_spread_percentage_points: mean(spread),
    risk_class_counts: countBy(features, "risk_class"),
    reliability_class_counts: countBy(features, "reliability_class"),
    methodology: {
      source: "NASA NEX-GDDP-CMIP6 daily tasmax",
      reference_period: "1981-2010 historical model simulation",
      ensemble_models: 5,
      displayed_risk_metric: "ensemble mean TX90p",
      uncertainty_metric: "inter-model max-minus-min TX90p spread",
      h3_note:
        "H3 resolution 6 is a display/spatial-index layer, not physical downscaling.",
    },
    ...options,
  };
}

export function summarizeTropicalCycloneAnalysis(
  features: FeatureLike[],
  options: Record<string, unknown>,
): PublishedAnalysisContext {
  const hazard = numericValues(features, [
    "hazard_value",
    "value",
    "tc_hazard",
    "indicator_value",
    "hazard",
  ]);

  return {
    analysis_type: "tropical_cyclone_hazard",
    published_at: Date.now(),
    feature_count: features.length,
    mean_hazard_value: mean(hazard),
    max_hazard_value: hazard.length ? Math.max(...hazard) : null,
    methodology: {
      source: "EMPIRIC_TC / STORM-derived tropical-cyclone hazard",
      native_grid: "0.5 degree",
      uncertainty_layer:
        "No separate tropical-cyclone uncertainty layer is currently implemented.",
      return_period_note:
        "Do not infer an exact return-period meaning from a source filename alone.",
    },
    ...options,
  };
}

export function publishAnalysisContext(
  context: PublishedAnalysisContext | null,
): void {
  if (typeof window === "undefined") return;

  try {
    if (context) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Could not persist analysis context:", error);
  }

  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, {
      detail: context,
    }),
  );
}

export function clearPublishedAnalysisContext(): void {
  publishAnalysisContext(null);
}

export function readPublishedAnalysisContext(): PublishedAnalysisContext | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as PublishedAnalysisContext)
      : null;
  } catch {
    return null;
  }
}

export function subscribePublishedAnalysisContext(
  listener: (context: PublishedAnalysisContext | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<PublishedAnalysisContext | null>;
    listener(customEvent.detail ?? null);
  };

  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
