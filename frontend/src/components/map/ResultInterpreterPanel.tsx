import { useState } from "react";
import { getApiUrl } from "../../config/api";
import type { SpatialQueryMetadata } from "../../hooks/useSpatialQuery";

interface InterpretationResult {
  headline: string;
  plain_language_summary: string;
  key_findings: string[];
  uncertainty_notes: string[];
  recommended_next_steps: string[];
  data_limitations: string[];
}

interface ResultInterpreterPanelProps {
  queryMetadata?: SpatialQueryMetadata | null;
  manualRiskSummary: Record<string, unknown>;
  populationOverlaySummary?: Record<string, unknown> | null;
  showPopulationOverlay: boolean;
  showInfrastructureAssets: boolean;
}

function getNumber(value: unknown): number | null {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatPercent(value: unknown): string {
  const numberValue = getNumber(value);

  if (numberValue === null) return "N/A";

  return `${(numberValue * 100).toFixed(0)}%`;
}

function formatCount(value: unknown): string {
  const numberValue = getNumber(value);

  if (numberValue === null) return "N/A";

  return Math.round(numberValue).toLocaleString();
}

function formatTemp(value: unknown): string {
  const numberValue = getNumber(value);

  if (numberValue === null) return "N/A";

  return `${numberValue.toFixed(1)}°C`;
}

function getFeatureProp(
  feature: GeoJSON.Feature | null | undefined,
  key: string
): unknown {
  return feature?.properties?.[key];
}

function buildCompactSummary({
  queryMetadata,
  manualRiskSummary,
  populationOverlaySummary,
  showPopulationOverlay,
  showInfrastructureAssets,
}: ResultInterpreterPanelProps) {
  const topPriorityCellsRaw = Array.isArray(
    populationOverlaySummary?.topPriorityCells
  )
    ? (populationOverlaySummary?.topPriorityCells as GeoJSON.Feature[])
    : [];

  const topPriorityCells = topPriorityCellsRaw.slice(0, 5).map((feature) => ({
    cell_id: getFeatureProp(feature, "cell_id"),
    population_estimate: getFeatureProp(feature, "population_estimate"),
    expected_exposed_population: getFeatureProp(
      feature,
      "expected_exposed_population"
    ),
    exposure_probability: getFeatureProp(feature, "exposure_probability"),
    hforecast_spread: getFeatureProp(feature, "heat_uncertainty_delta"),
heat_uncertainty_delta: getFeatureProp(
  feature,
  "heat_uncertainty_delta"
),
    priority_score: getFeatureProp(feature, "priority_score"),
  }));

  return {
    analysis_type: queryMetadata?.analysis_type ?? "manual_heat_risk",
    threshold: manualRiskSummary.threshold,
    data_sources: queryMetadata?.provenance?.data_sources ?? [],
    warnings: queryMetadata?.warnings ?? [],

    heat: {
  grid_cell_count: manualRiskSummary.gridCellCount,
  mean_exposure_probability: manualRiskSummary.meanExposureProbability,
  max_exposure_probability: manualRiskSummary.maxExposureProbability,
  mean_heat: manualRiskSummary.meanHeat,

  mean_forecast_spread: manualRiskSummary.meanUncertaintyDelta,
  max_forecast_spread: manualRiskSummary.maxUncertaintyDelta,
  high_spread_cell_count: manualRiskSummary.highUncertaintyCellCount,
  high_exposure_cell_count: manualRiskSummary.highRiskCellCount,
  high_exposure_high_spread_cell_count:
    manualRiskSummary.highRiskHighUncertaintyCellCount,

  forecast_spread_definition:
    "Cell-level forecast spread, currently represented by the P90 - P10 heat estimate range.",

  // Backward-compatible names for the backend interpreter.
  mean_uncertainty_spread: manualRiskSummary.meanUncertaintyDelta,
  high_risk_cell_count: manualRiskSummary.highRiskCellCount,
  high_uncertainty_cell_count: manualRiskSummary.highUncertaintyCellCount,
  high_risk_high_uncertainty_cell_count:
    manualRiskSummary.highRiskHighUncertaintyCellCount,
},

    population: showPopulationOverlay
      ? {
          total_population: populationOverlaySummary?.totalPopulation,
          expected_exposed_population:
            populationOverlaySummary?.expectedExposedPopulation,
          expected_exposed_population_method:
            "population estimate × exposure probability",
          expected_exposed_population_note:
            "Expected exposed population is an expected value, not a confirmed observed count of individual exposed people.",
          exposure_share: populationOverlaySummary?.exposurePercent,
          high_priority_cell_count:
            populationOverlaySummary?.highPriorityCellCount,
          urgent_data_gap_cell_count:
            populationOverlaySummary?.urgentDataGapCellCount,
          high_priority_population:
            populationOverlaySummary?.highPriorityPopulation,
          top_priority_cells: topPriorityCells,
        }
      : null,

    infrastructure_assets: showInfrastructureAssets
      ? {
          asset_count: manualRiskSummary.assetCount,
          exposed_asset_count: manualRiskSummary.exposedAssetCount,
          top_asset_name: manualRiskSummary.topAssetName,
          top_asset_type: manualRiskSummary.topAssetType,
        }
      : null,
  };
}

function buildFallbackInterpretation(
  summary: ReturnType<typeof buildCompactSummary>
): InterpretationResult {
  const thresholdText = formatTemp(summary.threshold);
  const meanExposureText = formatPercent(
    summary.heat.mean_exposure_probability
  );
  const maxExposureText = formatPercent(summary.heat.max_exposure_probability);
  const meanForecastSpreadText = formatTemp(
  summary.heat.mean_forecast_spread ??
    summary.heat.mean_uncertainty_spread
);
const highSpreadCellCountText = formatCount(
  summary.heat.high_spread_cell_count ??
    summary.heat.high_uncertainty_cell_count
);
  const expectedExposedText = formatCount(
    summary.population?.expected_exposed_population
  );
  const totalPopulationText = formatCount(summary.population?.total_population);

  const hasPopulation = summary.population !== null;
  const hasAssets = summary.infrastructure_assets !== null;

  return {
    headline: "Heat exposure with cell-level forecast spread",
plain_language_summary: hasPopulation
  ? `This selected area shows moderate heat exposure at the ${thresholdText} threshold. The mean crossing probability is ${meanExposureText}. The expected exposed population is about ${expectedExposedText} people out of ${totalPopulationText}, calculated as population estimate × exposure probability. This is an expected value, not a confirmed observed count. Mean cell-level forecast spread is ${meanForecastSpreadText}.`
  : `This selected area shows moderate heat exposure at the ${thresholdText} threshold. The mean crossing probability is ${meanExposureText}, with a maximum cell-level probability of ${maxExposureText}. Mean cell-level forecast spread is ${meanForecastSpreadText}.`,
    key_findings: [
      `Mean exposure probability is ${meanExposureText}.`,
      `Maximum cell-level exposure probability is ${maxExposureText}.`,
      `Mean heat value is ${formatTemp(summary.heat.mean_heat)}.`,
      hasPopulation
        ? `Expected exposed population is ${expectedExposedText}, calculated as population estimate × exposure probability.`
        : "Expected exposed population overlay is currently hidden.",
      hasPopulation
        ? "Expected exposed population is an expected value, not a confirmed observed count of individual people."
        : "Turn on the expected exposed population overlay to include population-based exposure in the interpretation.",
      hasAssets
        ? `${formatCount(
            summary.infrastructure_assets?.exposed_asset_count
          )} of ${formatCount(
            summary.infrastructure_assets?.asset_count
          )} visible infrastructure assets are exposed.`
        : "Infrastructure asset overlay is currently hidden.",
    ],
    uncertainty_notes: [
  `Mean cell-level forecast spread is ${meanForecastSpreadText}.`,
  `${highSpreadCellCountText} grid cells have high forecast spread.`,
  "Forecast spread is calculated per grid cell, then summarized across the selected area.",
  "Interpret this as a screening-level result rather than a final planning conclusion.",
],
    recommended_next_steps: [
      "Rerun the same area at 24°C and 26°C to test sensitivity to the threshold.",
      "Inspect the top expected exposed population priority zones before making planning decisions.",
      "Compare the result with longer-term climate projection data when available.",
    ],
    data_limitations: [
      "Heat exposure currently uses short-term Open-Meteo forecast data, not long-term climate projections.",
      "Expected exposed population uses WorldPop population counts multiplied by exposure probability.",
      "Infrastructure assets come from OpenStreetMap / Overpass and may be incomplete.",
    ],
  };
}

const ResultInterpreterPanel = ({
  queryMetadata,
  manualRiskSummary,
  populationOverlaySummary = null,
  showPopulationOverlay,
  showInfrastructureAssets,
}: ResultInterpreterPanelProps) => {
  const [interpretation, setInterpretation] =
    useState<InterpretationResult | null>(null);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

  const handleInterpretResults = async () => {
    const compactSummary = buildCompactSummary({
      queryMetadata,
      manualRiskSummary,
      populationOverlaySummary,
      showPopulationOverlay,
      showInfrastructureAssets,
    });

    setIsInterpreting(true);
    setErrorMessage(null);
    setUsedFallback(false);

    try {
      const response = await fetch(getApiUrl("/api/interpret-results"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          result_summary: compactSummary,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Interpretation endpoint failed with HTTP ${response.status}`
        );
      }

      const data = await response.json();

      setInterpretation(data.interpretation);
    } catch (error) {
      console.warn("Falling back to local interpretation:", error);

      setInterpretation(buildFallbackInterpretation(compactSummary));
      setUsedFallback(true);
      setErrorMessage(
        "LLM endpoint is not connected yet, so this is a local draft interpretation."
      );
    } finally {
      setIsInterpreting(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-emerald-950">
            Result Interpretation
          </div>
          <div className="text-[10px] font-medium text-emerald-600">
            Plain-language planning summary
          </div>
        </div>

        <button
          onClick={handleInterpretResults}
          disabled={isInterpreting}
          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200"
        >
          {isInterpreting ? "Interpreting..." : "Interpret"}
        </button>
      </div>

      {!interpretation && (
        <div className="rounded-xl bg-white/80 p-2 text-xs leading-relaxed text-emerald-900">
          Click Interpret to generate a concise planning-style explanation of
          the current heat exposure, cell-level forecast spread, expected exposed
population, and infrastructure results.
        </div>
      )}

      {errorMessage && (
        <div className="mb-2 rounded-xl bg-yellow-50 p-2 text-[10px] font-medium text-yellow-800">
          ⚠ {errorMessage}
        </div>
      )}

      {interpretation && (
        <div className="space-y-3">
          <div className="rounded-xl bg-white/80 p-2">
            <div className="text-xs font-bold text-emerald-950">
              {interpretation.headline}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-emerald-900">
              {interpretation.plain_language_summary}
            </p>
            {usedFallback && (
              <div className="mt-1 text-[10px] font-medium text-emerald-600">
                Local fallback draft
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
              Key findings
            </div>
            <ul className="space-y-1 text-xs leading-relaxed text-emerald-900">
              {interpretation.key_findings.map((finding) => (
                <li key={finding}>• {finding}</li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
              Forecast spread
            </div>
            <ul className="space-y-1 text-xs leading-relaxed text-emerald-900">
              {interpretation.uncertainty_notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
              Next steps
            </div>
            <ul className="space-y-1 text-xs leading-relaxed text-emerald-900">
              {interpretation.recommended_next_steps.map((step) => (
                <li key={step}>• {step}</li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
              Data limitations
            </div>
            <ul className="space-y-1 text-xs leading-relaxed text-emerald-900">
              {interpretation.data_limitations.map((limitation) => (
                <li key={limitation}>• {limitation}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultInterpreterPanel;