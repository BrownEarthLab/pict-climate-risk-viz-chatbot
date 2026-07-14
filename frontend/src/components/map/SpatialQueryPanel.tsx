import { useMemo, useState } from "react";
import type { SpatialQueryMetadata } from "../../hooks/useSpatialQuery";
import ResultInterpreterPanel from "./ResultInterpreterPanel";

interface SpatialQueryPanelProps {
  highlightedFeatures: GeoJSON.Feature[] | null;
  queryMetadata?: SpatialQueryMetadata | null;
  showPopulationOverlay?: boolean;
  showInfrastructureAssets?: boolean;
  layerDisplayNames?: Record<string, string>;
}

interface GroupedFeatures {
  [layerName: string]: GeoJSON.Feature[];
}

const DEFAULT_LAYER_DISPLAY_NAMES: Record<string, string> = {
  "Manual Heat Risk": "Heat Exposure Grid",
  "Manual Heat Risk Assets": "Infrastructure Assets",
  "Population Exposure Overlay": "Population Affected",
  "Near-Surface Air Temp (TAS)": "Near-Surface Air Temperature",
  "Annual Mean Wet-Bulb (WBT)": "Annual Mean Wet-Bulb Temperature",
};

function getFeatureLayerName(feature: GeoJSON.Feature): string {
  return String(feature.properties?.layer_name || "unknown_layer");
}

function getReadableAnalysisChain({
  showPopulationOverlay,
  showInfrastructureAssets,
}: {
  showPopulationOverlay: boolean;
  showInfrastructureAssets: boolean;
}): string[] {
  const steps = [
    "Generate a spatial grid inside the drawn boundary.",
    "Fetch short-term heat forecast values at each grid cell.",
    "Estimate exposure probability and forecast uncertainty for each cell.",
  ];

  if (showPopulationOverlay) {
    steps.push(
      "Overlay WorldPop population counts on the heat-exposure grid.",
      "Estimate expected exposed population for each grid cell.",
      "Rank population priority zones using exposed population and uncertainty."
    );
  }

  if (showInfrastructureAssets) {
    steps.push(
      "Retrieve hospitals, schools, and ports from OpenStreetMap through Overpass.",
      "Sample each asset against the nearest heat-exposure cell.",
      "Rank infrastructure assets by sampled heat exposure."
    );
  }

  return steps;
}

function getStringProp(feature: GeoJSON.Feature, key: string): string | null {
  const value = feature.properties?.[key];

  if (value === null || value === undefined) return null;

  return String(value);
}

function getNumberProp(feature: GeoJSON.Feature, key: string): number | null {
  const value = Number(feature.properties?.[key]);

  return Number.isFinite(value) ? value : null;
}

function getBooleanProp(feature: GeoJSON.Feature, key: string): boolean {
  return feature.properties?.[key] === true;
}

function formatPercent(value: number | null): string {
  if (value === null) return "N/A";

  return `${(value * 100).toFixed(0)}%`;
}

function formatTemp(value: number | null): string {
  if (value === null) return "N/A";

  return `${value.toFixed(1)}°C`;
}

function formatCount(value: number | null): string {
  if (value === null) return "N/A";

  return Math.round(value).toLocaleString();
}

function getExposureLabel(probability: number | null): string {
  if (probability === null) return "unknown";

  if (probability >= 0.75) return "high";
  if (probability >= 0.5) return "moderate-to-high";
  if (probability >= 0.25) return "moderate";
  return "low";
}

function getPlanningClassLabel(feature: GeoJSON.Feature): string {
  const exposureProbability = getNumberProp(feature, "exposure_probability");
  const normalizedUncertainty = getNumberProp(feature, "normalized_uncertainty");
  const expectedExposedPopulation = getNumberProp(
    feature,
    "expected_exposed_population"
  );

  const exposure = exposureProbability ?? 0;
  const uncertainty = normalizedUncertainty ?? 0;
  const expectedExposed = expectedExposedPopulation ?? 0;

  if (exposure >= 0.75 && uncertainty >= 0.6) {
    return "Urgent data-gap zone";
  }

  if (exposure >= 0.5 && uncertainty >= 0.6) {
    return "Data-gap priority";
  }

  if (expectedExposed >= 5000 && exposure >= 0.35) {
    return "Population priority zone";
  }

  if (exposure >= 0.35 && uncertainty >= 0.6) {
    return "Uncertain monitoring zone";
  }

  if (expectedExposed >= 2000) {
    return "Population monitoring zone";
  }

  return "Lower priority zone";
}

function buildHeatInterpretation({
  meanExposureProbability,
  highRiskCellCount,
  highRiskHighUncertaintyCellCount,
  exposedAssetCount,
  assetCount,
  showInfrastructureAssets,
}: {
  meanExposureProbability: number | null;
  highRiskCellCount: number;
  highRiskHighUncertaintyCellCount: number;
  exposedAssetCount: number;
  assetCount: number;
  showInfrastructureAssets: boolean;
}): string {
  const exposureLabel = getExposureLabel(meanExposureProbability);
  const meanExposureText =
    meanExposureProbability === null
      ? "an unknown average crossing probability"
      : `a mean crossing probability of ${(
          meanExposureProbability * 100
        ).toFixed(0)}%`;

  const uncertaintyText =
    highRiskHighUncertaintyCellCount > 0
      ? `${highRiskHighUncertaintyCellCount} cells are both high-risk and high-uncertainty`
      : highRiskCellCount > 0
        ? `${highRiskCellCount} cells are high-risk`
        : "no cells are currently classified as high-risk";

  const assetText = showInfrastructureAssets
    ? `, with ${exposedAssetCount} of ${assetCount} visible infrastructure assets exposed`
    : "";

  return `This area has ${exposureLabel} heat exposure, with ${meanExposureText}; ${uncertaintyText}${assetText}.`;
}

function buildPopulationInterpretation({
  expectedExposedPopulation,
  totalPopulation,
  threshold,
  urgentDataGapCellCount,
}: {
  expectedExposedPopulation: number;
  totalPopulation: number;
  threshold: number | null;
  urgentDataGapCellCount: number;
}): string {
  const thresholdText =
    threshold === null
      ? "the selected heat threshold"
      : `${threshold.toFixed(1)}°C`;

  const expectedText = Math.round(expectedExposedPopulation).toLocaleString();
  const totalText = Math.round(totalPopulation).toLocaleString();

  const urgentText =
    urgentDataGapCellCount > 0
      ? ` ${urgentDataGapCellCount} cells are urgent data-gap zones because exposure probability and uncertainty are both high.`
      : " No cells are currently classified as urgent, but high-population monitoring zones may still need attention.";

  return `About ${expectedText} of ${totalText} people are expected to experience heat above ${thresholdText} in this area.${urgentText}`;
}

function getMean(values: number[]): number | null {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getMax(values: number[]): number | null {
  if (values.length === 0) return null;

  return Math.max(...values);
}

function getSum(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function buildFeatureCollection(
  features: GeoJSON.Feature[],
  metadata?: SpatialQueryMetadata | null
): GeoJSON.FeatureCollection & { metadata?: SpatialQueryMetadata } {
  return {
    type: "FeatureCollection",
    features,
    ...(metadata ? { metadata } : {}),
  };
}

const SpatialQueryPanel = ({
  highlightedFeatures,
  queryMetadata,
  showPopulationOverlay = false,
  showInfrastructureAssets = false,
  layerDisplayNames = {},
}: SpatialQueryPanelProps) => {
  const [showAnalysisChain, setShowAnalysisChain] = useState(false);

  const displayNames = {
    ...DEFAULT_LAYER_DISPLAY_NAMES,
    ...layerDisplayNames,
  };

  const groupedFeatures = useMemo<GroupedFeatures>(() => {
    if (!highlightedFeatures || highlightedFeatures.length === 0) {
      return {};
    }

    return highlightedFeatures.reduce<GroupedFeatures>((acc, feature) => {
      const layerName = getFeatureLayerName(feature);

      if (!acc[layerName]) {
        acc[layerName] = [];
      }

      acc[layerName].push(feature);
      return acc;
    }, {});
  }, [highlightedFeatures]);

  const manualRiskGrid = groupedFeatures["Manual Heat Risk"] || [];
  const manualRiskAssets = groupedFeatures["Manual Heat Risk Assets"] || [];
  const populationOverlayCells =
    groupedFeatures["Population Exposure Overlay"] || [];

  const hasManualRisk =
    manualRiskGrid.length > 0 || manualRiskAssets.length > 0;
  const hasPopulationOverlay = populationOverlayCells.length > 0;

  const manualRiskSummary = useMemo(() => {
    const exposureProbabilities = manualRiskGrid
      .map((feature) => getNumberProp(feature, "exposure_probability"))
      .filter((value): value is number => value !== null);

    const uncertaintyDeltas = manualRiskGrid
      .map((feature) => getNumberProp(feature, "heat_uncertainty_delta"))
      .filter((value): value is number => value !== null);

    const heatMeans = manualRiskGrid
      .map((feature) => getNumberProp(feature, "heat_mean"))
      .filter((value): value is number => value !== null);

    const highRiskCells = manualRiskGrid.filter((feature) => {
      const probability = getNumberProp(feature, "exposure_probability");
      return probability !== null && probability >= 0.75;
    });

    const highUncertaintyCells = manualRiskGrid.filter((feature) => {
      const uncertainty = getNumberProp(feature, "heat_uncertainty_delta");
      return uncertainty !== null && uncertainty >= 4;
    });

    const highRiskHighUncertaintyCells = manualRiskGrid.filter((feature) => {
      const probability = getNumberProp(feature, "exposure_probability");
      const uncertainty = getNumberProp(feature, "heat_uncertainty_delta");

      return (
        probability !== null &&
        uncertainty !== null &&
        probability >= 0.75 &&
        uncertainty >= 4
      );
    });

    const exposedAssets = manualRiskAssets.filter((feature) =>
      getBooleanProp(feature, "exposed_to_hazard")
    );

    const topAsset =
      manualRiskAssets.find(
        (feature) => getNumberProp(feature, "asset_rank") === 1
      ) ||
      manualRiskAssets[0] ||
      null;

    const threshold =
      manualRiskGrid.length > 0
        ? getNumberProp(manualRiskGrid[0], "threshold")
        : manualRiskAssets.length > 0
          ? getNumberProp(manualRiskAssets[0], "threshold")
          : null;

    return {
      threshold,
      gridCellCount: manualRiskGrid.length,
      assetCount: manualRiskAssets.length,
      exposedAssetCount: exposedAssets.length,
      meanExposureProbability: getMean(exposureProbabilities),
      maxExposureProbability: getMax(exposureProbabilities),
      meanUncertaintyDelta: getMean(uncertaintyDeltas),
      maxUncertaintyDelta: getMax(uncertaintyDeltas),
      meanHeat: getMean(heatMeans),
      highRiskCellCount: highRiskCells.length,
      highUncertaintyCellCount: highUncertaintyCells.length,
      highRiskHighUncertaintyCellCount: highRiskHighUncertaintyCells.length,
      topAssetName: topAsset ? getStringProp(topAsset, "asset_name") : null,
      topAssetType: topAsset ? getStringProp(topAsset, "asset_type") : null,
    };
  }, [manualRiskGrid, manualRiskAssets]);

  const populationOverlaySummary = useMemo(() => {
    const populationEstimates = populationOverlayCells
      .map((feature) => getNumberProp(feature, "population_estimate"))
      .filter((value): value is number => value !== null);

    const expectedExposedValues = populationOverlayCells
      .map((feature) => getNumberProp(feature, "expected_exposed_population"))
      .filter((value): value is number => value !== null);

    const highPriorityCells = populationOverlayCells.filter((feature) => {
      const category = getStringProp(feature, "priority_category");
      return category === "high" || category === "very_high";
    });

    const urgentDataGapCells = populationOverlayCells.filter((feature) => {
      const exposureProbability = getNumberProp(
        feature,
        "exposure_probability"
      );
      const normalizedUncertainty = getNumberProp(
        feature,
        "normalized_uncertainty"
      );

      return (
        exposureProbability !== null &&
        normalizedUncertainty !== null &&
        exposureProbability >= 0.75 &&
        normalizedUncertainty >= 0.6
      );
    });

    const topPriorityCells = [...populationOverlayCells]
      .sort((a, b) => {
        const bExpected = Number(
          b.properties?.expected_exposed_population || 0
        );
        const aExpected = Number(
          a.properties?.expected_exposed_population || 0
        );

        const bPriority = Number(b.properties?.priority_score || 0);
        const aPriority = Number(a.properties?.priority_score || 0);

        return bExpected + bPriority * 500 - (aExpected + aPriority * 500);
      })
      .slice(0, 5);

    const topPriorityCell = topPriorityCells[0] || null;

    const totalPopulation = getSum(populationEstimates);
    const expectedExposedPopulation = getSum(expectedExposedValues);

    const threshold =
      populationOverlayCells.length > 0
        ? getNumberProp(populationOverlayCells[0], "threshold")
        : null;

    return {
      threshold,
      cellCount: populationOverlayCells.length,
      totalPopulation,
      expectedExposedPopulation,
      exposurePercent:
        totalPopulation > 0 ? expectedExposedPopulation / totalPopulation : null,
      highPriorityCellCount: highPriorityCells.length,
      urgentDataGapCellCount: urgentDataGapCells.length,
      highPriorityPopulation: highPriorityCells.reduce(
        (sum, feature) =>
          sum + Number(feature.properties?.expected_exposed_population || 0),
        0
      ),
      topCellId: topPriorityCell
        ? getStringProp(topPriorityCell, "cell_id")
        : null,
      topCellPopulation: topPriorityCell
        ? getNumberProp(topPriorityCell, "population_estimate")
        : null,
      topCellExpectedExposed: topPriorityCell
        ? getNumberProp(topPriorityCell, "expected_exposed_population")
        : null,
      topCellPriorityScore: topPriorityCell
        ? getNumberProp(topPriorityCell, "priority_score")
        : null,
      topCellCategory: topPriorityCell
        ? getStringProp(topPriorityCell, "priority_category")
        : null,
      topCellQuadrant: topPriorityCell
        ? getStringProp(topPriorityCell, "risk_uncertainty_quadrant")
        : null,
      topPriorityCells,
    };
  }, [populationOverlayCells]);

  const handleDownload = (layerName: string) => {
    const features = groupedFeatures[layerName];

    if (!features || features.length === 0) return;

    const displayName = displayNames[layerName] || layerName;
    const fileName = displayName.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    const metadata: SpatialQueryMetadata = {
      ...queryMetadata,
      exported_layer: layerName,
      exported_layer_display_name: displayName,
      exported_feature_count: features.length,
    };

    const blob = new Blob(
      [JSON.stringify(buildFeatureCollection(features, metadata), null, 2)],
      {
        type: "application/geo+json",
      }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `${fileName}_query_results.geojson`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    if (!highlightedFeatures || highlightedFeatures.length === 0) return;

    const metadata: SpatialQueryMetadata = {
      ...queryMetadata,
      exported_layer: "all",
      exported_layer_display_name: "Full Heat Exposure Analysis",
      exported_feature_count: highlightedFeatures.length,
    };

    const blob = new Blob(
      [
        JSON.stringify(
          buildFeatureCollection(highlightedFeatures, metadata),
          null,
          2
        ),
      ],
      {
        type: "application/geo+json",
      }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "full_heat_exposure_analysis.geojson";

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  if (!highlightedFeatures || highlightedFeatures.length === 0) return null;

  return (
    <div className="absolute bottom-14 right-3 z-[1000] max-h-[420px] w-[330px] overflow-y-auto rounded-2xl border border-black/5 bg-white/90 p-4 shadow-lg backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h6 className="text-sm font-bold text-neutral-900">
            Heat Exposure Analysis
          </h6>
          <p className="text-[10px] font-medium text-neutral-400">
            {hasManualRisk
              ? `${manualRiskGrid.length} heat grid cells`
              : `${highlightedFeatures.length} returned features`}
          </p>
        </div>

        <button
          onClick={handleDownloadAll}
          className="rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-700"
        >
          Download all
        </button>
      </div>

      {hasManualRisk ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-neutral-100 bg-white p-3">
            <div className="mb-2">
              <div className="text-sm font-bold text-neutral-900">
                Heat Exposure
              </div>
              <div className="text-[10px] font-medium text-neutral-400">
                Exposure probability and forecast uncertainty
              </div>
              <div className="mt-1 inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                Threshold: {formatTemp(manualRiskSummary.threshold)}
              </div>
            </div>

            <div className="mb-3 rounded-xl bg-orange-50 p-2 text-xs leading-relaxed text-orange-950">
              {buildHeatInterpretation({
                meanExposureProbability:
                  manualRiskSummary.meanExposureProbability,
                highRiskCellCount: manualRiskSummary.highRiskCellCount,
                highRiskHighUncertaintyCellCount:
                  manualRiskSummary.highRiskHighUncertaintyCellCount,
                exposedAssetCount: manualRiskSummary.exposedAssetCount,
                assetCount: manualRiskSummary.assetCount,
                showInfrastructureAssets,
              })}
            </div>

            {queryMetadata?.provenance?.data_sources && (
              <div className="mb-3 rounded-xl bg-neutral-50 p-2">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                  Data sources
                </div>
                <div className="space-y-0.5 text-[10px] font-medium text-neutral-600">
                  {queryMetadata.provenance.data_sources.map((source) => (
                    <div key={source}>• {source}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-neutral-50 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  Grid cells
                </div>
                <div className="text-base font-bold text-neutral-900">
                  {manualRiskSummary.gridCellCount}
                </div>
              </div>

              {showInfrastructureAssets && (
                <div className="rounded-lg bg-neutral-50 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    Assets
                  </div>
                  <div className="text-base font-bold text-neutral-900">
                    {manualRiskSummary.assetCount}
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-orange-50 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">
                  Mean exposure
                </div>
                <div className="text-base font-bold text-orange-700">
                  {formatPercent(manualRiskSummary.meanExposureProbability)}
                </div>
              </div>

              <div className="rounded-lg bg-red-50 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-red-500">
                  Max exposure
                </div>
                <div className="text-base font-bold text-red-700">
                  {formatPercent(manualRiskSummary.maxExposureProbability)}
                </div>
              </div>

              <div className="rounded-lg bg-sky-50 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-500">
                  Mean heat
                </div>
                <div className="text-base font-bold text-sky-700">
                  {formatTemp(manualRiskSummary.meanHeat)}
                </div>
              </div>

              <div className="rounded-lg bg-purple-50 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-500">
                  Mean spread
                </div>
                <div className="text-base font-bold text-purple-700">
                  {formatTemp(manualRiskSummary.meanUncertaintyDelta)}
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-1.5 text-xs text-neutral-600">
              <p>
                <span className="font-semibold text-neutral-800">
                  High-risk cells:
                </span>{" "}
                {manualRiskSummary.highRiskCellCount}
              </p>
              <p>
                <span className="font-semibold text-neutral-800">
                  High-uncertainty cells:
                </span>{" "}
                {manualRiskSummary.highUncertaintyCellCount}
              </p>
              <p>
                <span className="font-semibold text-neutral-800">
                  High-risk + high-uncertainty:
                </span>{" "}
                {manualRiskSummary.highRiskHighUncertaintyCellCount}
              </p>

              {showInfrastructureAssets && (
                <p>
                  <span className="font-semibold text-neutral-800">
                    Exposed assets:
                  </span>{" "}
                  {manualRiskSummary.exposedAssetCount} /{" "}
                  {manualRiskSummary.assetCount}
                </p>
              )}

              {showInfrastructureAssets && manualRiskSummary.topAssetName && (
                <p>
                  <span className="font-semibold text-neutral-800">
                    {manualRiskSummary.exposedAssetCount > 0
                      ? "Top exposed asset:"
                      : "Highest-ranked asset:"}
                  </span>{" "}
                  {manualRiskSummary.topAssetName}
                  {manualRiskSummary.topAssetType
                    ? ` (${manualRiskSummary.topAssetType})`
                    : ""}
                </p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {manualRiskGrid.length > 0 && (
                <button
                  onClick={() => handleDownload("Manual Heat Risk")}
                  className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-neutral-700"
                >
                  Download heat grid
                </button>
              )}

              {showInfrastructureAssets && manualRiskAssets.length > 0 && (
                <button
                  onClick={() => handleDownload("Manual Heat Risk Assets")}
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-700"
                >
                  Download assets
                </button>
              )}
            </div>

            {manualRiskAssets.length > 0 && !showInfrastructureAssets && (
              <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900">
                Infrastructure asset data is available. Turn on the
                infrastructure assets toggle in the map legend to show asset
                points and exposed-asset metrics.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-neutral-100 bg-white p-3">
            <button
              onClick={() => setShowAnalysisChain(!showAnalysisChain)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <div className="text-sm font-bold text-neutral-900">
                  Analysis Chain
                </div>
                <div className="text-[10px] font-medium text-neutral-400">
                  Spatial functions used to produce this result
                </div>
              </div>

              <span className="text-xs font-bold text-neutral-400">
                {showAnalysisChain ? "Hide" : "Show"}
              </span>
            </button>

            {showAnalysisChain && (
              <div className="mt-3 space-y-2">
                {getReadableAnalysisChain({
                  showPopulationOverlay,
                  showInfrastructureAssets,
                }).map((step, index) => (
                  <div key={step} className="flex gap-2 text-xs text-neutral-700">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-bold text-white">
                      {index + 1}
                    </div>
                    <div className="pt-0.5 leading-snug">{step}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ResultInterpreterPanel
            queryMetadata={queryMetadata}
            manualRiskSummary={manualRiskSummary}
            populationOverlaySummary={
              hasPopulationOverlay ? populationOverlaySummary : null
            }
            showPopulationOverlay={showPopulationOverlay}
            showInfrastructureAssets={showInfrastructureAssets}
          />

          {hasPopulationOverlay && showPopulationOverlay && (
            <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-3">
              <div className="mb-2">
                <div className="text-sm font-bold text-purple-900">
                  Population Affected
                </div>
                <div className="text-[10px] font-medium text-purple-500">
                  WorldPop overlay on the heat-exposure grid
                </div>
              </div>

              <div className="mb-3 rounded-xl bg-white/80 p-2 text-xs leading-relaxed text-purple-900">
                {buildPopulationInterpretation({
                  expectedExposedPopulation:
                    populationOverlaySummary.expectedExposedPopulation,
                  totalPopulation: populationOverlaySummary.totalPopulation,
                  threshold: populationOverlaySummary.threshold,
                  urgentDataGapCellCount:
                    populationOverlaySummary.urgentDataGapCellCount,
                })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/80 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-400">
                    Population
                  </div>
                  <div className="text-base font-bold text-purple-950">
                    {formatCount(populationOverlaySummary.totalPopulation)}
                  </div>
                </div>

                <div className="rounded-lg bg-white/80 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-400">
                    Expected exposed
                  </div>
                  <div className="text-base font-bold text-purple-950">
                    {formatCount(
                      populationOverlaySummary.expectedExposedPopulation
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-white/80 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-400">
                    Exposure share
                  </div>
                  <div className="text-base font-bold text-purple-950">
                    {formatPercent(populationOverlaySummary.exposurePercent)}
                  </div>
                </div>

                <div className="rounded-lg bg-white/80 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-400">
                    High-priority cells
                  </div>
                  <div className="text-base font-bold text-purple-950">
                    {populationOverlaySummary.highPriorityCellCount}
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-purple-900">
                <p>
                  <span className="font-semibold">Urgent data-gap cells:</span>{" "}
                  {populationOverlaySummary.urgentDataGapCellCount}
                </p>
                <p>
                  <span className="font-semibold">
                    High-priority exposed population:
                  </span>{" "}
                  {formatCount(populationOverlaySummary.highPriorityPopulation)}
                </p>
              </div>

              {populationOverlaySummary.topPriorityCells.length > 0 && (
                <div className="mt-3 rounded-xl bg-white/80 p-2">
                  <div className="mb-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-purple-400">
                      Priority zones
                    </div>
                    <div className="text-[10px] leading-snug text-purple-700">
                      Ranked by expected exposed population, with uncertainty
                      used as a planning signal.
                    </div>
                  </div>

                  <div className="space-y-2">
                    {populationOverlaySummary.topPriorityCells.map(
                      (feature, index) => {
                        const cellId = getStringProp(feature, "cell_id");
                        const expectedExposed = getNumberProp(
                          feature,
                          "expected_exposed_population"
                        );
                        const population = getNumberProp(
                          feature,
                          "population_estimate"
                        );
                        const exposureProbability = getNumberProp(
                          feature,
                          "exposure_probability"
                        );
                        const uncertaintyDelta = getNumberProp(
                          feature,
                          "heat_uncertainty_delta"
                        );
                        const priorityScore = getNumberProp(
                          feature,
                          "priority_score"
                        );
                        const planningLabel = getPlanningClassLabel(feature);

                        return (
                          <div
                            key={cellId || index}
                            className="rounded-lg border border-purple-100 bg-purple-50/70 p-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-[11px] font-bold text-purple-950">
                                  {index + 1}. {planningLabel}
                                </div>
                                <div className="text-[10px] font-medium text-purple-500">
                                  {cellId || "population cell"}
                                </div>
                              </div>

                              <div className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-purple-700">
                                {formatCount(expectedExposed)}
                              </div>
                            </div>

                            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-purple-900">
                              <div>
                                <span className="font-semibold">
                                  Population:
                                </span>{" "}
                                {formatCount(population)}
                              </div>
                              <div>
                                <span className="font-semibold">Exposed:</span>{" "}
                                {formatCount(expectedExposed)}
                              </div>
                              <div>
                                <span className="font-semibold">
                                  Probability:
                                </span>{" "}
                                {formatPercent(exposureProbability)}
                              </div>
                              <div>
                                <span className="font-semibold">Spread:</span>{" "}
                                {formatTemp(uncertaintyDelta)}
                              </div>
                            </div>

                            <div className="mt-1 text-[10px] leading-snug text-purple-700">
                              Priority score:{" "}
                              {priorityScore === null
                                ? "N/A"
                                : priorityScore.toFixed(2)}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => handleDownload("Population Exposure Overlay")}
                className="mt-3 rounded-lg bg-purple-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-purple-700"
              >
                Download population overlay
              </button>
            </div>
          )}

          {hasPopulationOverlay && !showPopulationOverlay && (
            <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-3 text-xs leading-relaxed text-purple-900">
              Population exposure data is available. Turn on the population
              overlay in the map legend to show exposed-population metrics.
            </div>
          )}

          {queryMetadata?.warnings && queryMetadata.warnings.length > 0 && (
            <div className="rounded-xl bg-yellow-50 p-2 text-[10px] font-medium text-yellow-800">
              {queryMetadata.warnings.map((warning) => (
                <div key={warning}>⚠ {warning}</div>
              ))}
            </div>
          )}
        </div>
      ) : Object.keys(groupedFeatures).length > 0 ? (
        <ul className="space-y-2">
          {Object.entries(groupedFeatures).map(([layerName, features]) => {
            const displayName = displayNames[layerName] || layerName;

            return (
              <li
                key={layerName}
                className="rounded-xl border border-neutral-100 bg-white p-3 text-sm"
              >
                <strong>{displayName}</strong> ({features.length} features)

                {features[0]?.properties?.description && (
                  <div className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-neutral-600">
                    {String(features[0].properties.description)
                      .split("\n")
                      .map((line: string, idx: number) => (
                        <p key={idx}>{line}</p>
                      ))}
                  </div>
                )}

                <button
                  onClick={() => handleDownload(layerName)}
                  className="mt-2 rounded-lg bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700"
                >
                  Download layer
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No features found.</p>
      )}
    </div>
  );
};

export default SpatialQueryPanel;