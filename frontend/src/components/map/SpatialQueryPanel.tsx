import { useMemo, useState } from "react";
import type { SpatialQueryMetadata } from "../../hooks/useSpatialQuery";

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
  "Manual Heat Risk": "Heat exposure grid",
  "Manual Heat Risk Assets": "Infrastructure assets",
  "Population Exposure Overlay": "Expected exposed population",
  "Near-Surface Air Temp (TAS)": "Near-surface air temperature",
  "Annual Mean Wet-Bulb (WBT)": "Annual mean wet-bulb",
};

function getFeatureLayerName(feature: GeoJSON.Feature): string {
  return String(feature.properties?.layer_name || "unknown_layer");
}

function getNumber(value: unknown): number | null {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numberValue = getNumber(value);

    if (numberValue !== null) return numberValue;
  }

  return null;
}

function formatPercent(value: unknown): string {
  const numberValue = getNumber(value);

  if (numberValue === null) return "—";

  return `${Math.round(numberValue * 100)}%`;
}

function formatTemp(value: unknown): string {
  const numberValue = getNumber(value);

  if (numberValue === null) return "—";

  return `${numberValue.toFixed(1)}°C`;
}

function formatCount(value: unknown): string {
  const numberValue = getNumber(value);

  if (numberValue === null) return "—";

  return Math.round(numberValue).toLocaleString();
}

function formatCompactCount(value: unknown): string {
  const numberValue = getNumber(value);

  if (numberValue === null) return "—";

  return new Intl.NumberFormat("en", {
    notation: Math.abs(numberValue) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(numberValue) >= 10_000 ? 1 : 0,
  }).format(numberValue);
}

function getProp(feature: GeoJSON.Feature | null | undefined, key: string) {
  return feature?.properties?.[key];
}

function getNumberProp(feature: GeoJSON.Feature | null | undefined, key: string) {
  return getNumber(getProp(feature, key));
}

function getStringProp(
  feature: GeoJSON.Feature | null | undefined,
  key: string
): string | null {
  const value = getProp(feature, key);

  if (value === null || value === undefined || value === "") return null;

  return String(value);
}

function getFeatureSummary(
  highlightedFeatures: GeoJSON.Feature[] | null,
  queryMetadata?: SpatialQueryMetadata | null
) {
  const features = highlightedFeatures ?? [];
  const riskGrid = features.filter(
    (feature) =>
      feature.properties?.layer_name === "Manual Heat Risk" ||
      feature.properties?.feature_role === "risk_grid"
  );
  const assets = features.filter(
    (feature) => feature.properties?.layer_name === "Manual Heat Risk Assets"
  );
  const population = features.filter(
    (feature) =>
      feature.properties?.layer_name === "Population Exposure Overlay"
  );

  const exposureValues = riskGrid
    .map((feature) => getNumberProp(feature, "exposure_probability"))
    .filter((value): value is number => value !== null);

  const spreadValues = riskGrid
    .map((feature) =>
      firstNumber(
        feature.properties?.forecast_spread,
        feature.properties?.heat_uncertainty_delta
      )
    )
    .filter((value): value is number => value !== null);

  const heatValues = riskGrid
    .map((feature) => getNumberProp(feature, "heat_mean"))
    .filter((value): value is number => value !== null);

  const mean = (values: number[]) =>
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length;

  const topAsset =
    assets.find((feature) => feature.properties?.focus_asset === true) ||
    assets.find((feature) => getNumberProp(feature, "asset_rank") === 1) ||
    assets[0] ||
    null;

  const exposedAssets = assets.filter(
    (feature) => feature.properties?.exposed_to_hazard === true
  );

  return {
    riskGrid,
    assets,
    population,
    topAsset,
    gridCellCount:
      firstNumber(queryMetadata?.h3_cell_count, queryMetadata?.grid_cell_count) ??
      riskGrid.length,
    meanExposure:
      firstNumber(queryMetadata?.mean_exposure_probability) ??
      mean(exposureValues),
    maxExposure:
      firstNumber(queryMetadata?.max_exposure_probability) ??
      (exposureValues.length > 0 ? Math.max(...exposureValues) : null),
    meanSpread:
      firstNumber(queryMetadata?.mean_forecast_spread) ?? mean(spreadValues),
    maxSpread:
      firstNumber(queryMetadata?.max_forecast_spread) ??
      (spreadValues.length > 0 ? Math.max(...spreadValues) : null),
    meanHeat: firstNumber(queryMetadata?.mean_heat) ?? mean(heatValues),
    highRiskCellCount:
      firstNumber(queryMetadata?.high_risk_cell_count) ??
      riskGrid.filter(
        (feature) => (getNumberProp(feature, "exposure_probability") ?? 0) >= 0.5
      ).length,
    highSpreadCellCount:
      firstNumber(queryMetadata?.high_spread_cell_count) ??
      riskGrid.filter(
        (feature) =>
          firstNumber(
            feature.properties?.normalized_forecast_spread,
            feature.properties?.normalized_uncertainty
          ) !== null &&
          (firstNumber(
            feature.properties?.normalized_forecast_spread,
            feature.properties?.normalized_uncertainty
          ) ?? 0) >= 0.67
      ).length,
    highRiskHighSpreadCellCount:
      firstNumber(queryMetadata?.high_risk_high_spread_cell_count) ??
      riskGrid.filter((feature) => {
        const risk = getNumberProp(feature, "exposure_probability") ?? 0;
        const spread =
          firstNumber(
            feature.properties?.normalized_forecast_spread,
            feature.properties?.normalized_uncertainty
          ) ?? 0;

        return risk >= 0.5 && spread >= 0.67;
      }).length,
    expectedExposedPopulation:
      firstNumber(
        queryMetadata?.total_expected_exposed_population,
        queryMetadata?.expected_exposed_population
      ) ??
      population.reduce(
        (sum, feature) =>
          sum + (getNumberProp(feature, "expected_exposed_population") ?? 0),
        0
      ),
    totalPopulation:
      firstNumber(queryMetadata?.total_population) ??
      population.reduce(
        (sum, feature) => sum + (getNumberProp(feature, "population_estimate") ?? 0),
        0
      ),
    assetCount: firstNumber(queryMetadata?.summary?.asset_count) ?? assets.length,
    exposedAssetCount:
      firstNumber(queryMetadata?.summary?.exposed_asset_count) ??
      exposedAssets.length,
  };
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
  layerDisplayNames = {},
}: SpatialQueryPanelProps) => {
  const [showDetails, setShowDetails] = useState(false);

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

  const summary = useMemo(
    () => getFeatureSummary(highlightedFeatures, queryMetadata),
    [highlightedFeatures, queryMetadata]
  );

  if ((!highlightedFeatures || highlightedFeatures.length === 0) && !queryMetadata) {
    return null;
  }

  const isAssetAnalysis = queryMetadata?.analysis_type === "asset_heat_risk";
  const isHeatAnalysis =
    queryMetadata?.analysis_type === "manual_heat_risk" || isAssetAnalysis;

  const matchedAsset = queryMetadata?.matched_asset;
  const topAssetName =
    matchedAsset?.asset_name ??
    getStringProp(summary.topAsset, "asset_name") ??
    null;

  const handleDownloadLayer = (layerName: string) => {
    const features = groupedFeatures[layerName];

    if (!features || features.length === 0) return;

    const displayName =
      layerDisplayNames[layerName] ||
      DEFAULT_LAYER_DISPLAY_NAMES[layerName] ||
      layerName;
    const fileName = displayName.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    const metadata: SpatialQueryMetadata = {
      ...queryMetadata,
      exported_layer: layerName,
      exported_feature_count: features.length,
    };

    const blob = new Blob(
      [JSON.stringify(buildFeatureCollection(features, metadata), null, 2)],
      { type: "application/geo+json" }
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
      { type: "application/geo+json" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = isAssetAnalysis
      ? "asset_heat_risk_results.geojson"
      : "spatial_query_results.geojson";

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute bottom-14 right-3 z-[1000] max-h-[500px] w-[340px] overflow-y-auto rounded-2xl border border-black/5 bg-white/92 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            {isAssetAnalysis ? "Asset heat risk" : "Analysis results"}
          </p>
          <h3 className="mt-1 text-sm font-black leading-tight text-neutral-950">
            {isAssetAnalysis && topAssetName
              ? topAssetName
              : isHeatAnalysis
                ? "Heat exposure analysis"
                : "Spatial query results"}
          </h3>
          <p className="mt-1 text-[10px] font-medium text-neutral-500">
            {queryMetadata?.admin_name
              ? `${queryMetadata.admin_name} · `
              : ""}
            {formatCount(summary.gridCellCount)} H3 cells
            {isAssetAnalysis && queryMetadata?.buffer_km
              ? ` · ${queryMetadata.buffer_km} km buffer`
              : ""}
          </p>
        </div>

        {highlightedFeatures && highlightedFeatures.length > 0 && (
          <button
            onClick={handleDownloadAll}
            className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-blue-700"
          >
            Download
          </button>
        )}
      </div>

      {Array.isArray(queryMetadata?.warnings) &&
        queryMetadata.warnings.length > 0 && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-[10px] leading-snug text-amber-800">
            <p className="font-black uppercase tracking-wide text-amber-600">
              Notes
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {queryMetadata.warnings.slice(0, 3).map((warning, index) => (
                <li key={`${warning}-${index}`}>{String(warning)}</li>
              ))}
            </ul>
          </div>
        )}

      {isAssetAnalysis && matchedAsset && (
        <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-orange-600">
            Matched asset
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-orange-400">
                Risk at asset
              </p>
              <p className="text-sm font-black text-orange-900">
                {formatPercent(matchedAsset.exposure_probability)}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-orange-400">
                Mean heat
              </p>
              <p className="text-sm font-black text-orange-900">
                {formatTemp(matchedAsset.heat_mean)}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-orange-400">
                Spread
              </p>
              <p className="text-sm font-black text-orange-900">
                {formatTemp(matchedAsset.forecast_spread)}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-orange-400">
                Match
              </p>
              <p className="text-sm font-black text-orange-900">
                {formatCount(queryMetadata.match_score)}
              </p>
            </div>
          </div>
        </div>
      )}

      {isHeatAnalysis && (
        <>
          <div className="mt-3 rounded-xl bg-neutral-50 p-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">
                  Mean risk
                </p>
                <p className="text-sm font-black text-neutral-950">
                  {formatPercent(summary.meanExposure)}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">
                  High-risk
                </p>
                <p className="text-sm font-black text-orange-700">
                  {formatCount(summary.highRiskCellCount)}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">
                  High-spread
                </p>
                <p className="text-sm font-black text-blue-700">
                  {formatCount(summary.highSpreadCellCount)}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white p-2">
                <p className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">
                  Expected exposed people
                </p>
                <p className="text-sm font-black text-purple-700">
                  {formatCompactCount(summary.expectedExposedPopulation)}
                </p>
              </div>
              <div className="rounded-lg bg-white p-2">
                <p className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">
                  Mean spread
                </p>
                <p className="text-sm font-black text-violet-700">
                  {formatTemp(summary.meanSpread)}
                </p>
              </div>
            </div>

            <p className="mt-3 text-[10px] leading-snug text-neutral-500">
              Risk is the share of forecast hours crossing the selected heat
              threshold. Spread is cell-level forecast range, not region-level
              uncertainty.
            </p>
          </div>

          <div className="mt-3 rounded-xl border border-neutral-100 bg-white p-3">
            <button
              onClick={() => setShowDetails((value) => !value)}
              className="flex w-full items-center justify-between text-left text-[10px] font-black uppercase tracking-wide text-neutral-500 hover:text-neutral-950"
            >
              <span>Details and downloads</span>
              <span>{showDetails ? "Hide" : "Show"}</span>
            </button>

            {showDetails && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-red-50 p-2">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-red-500">
                      Max risk
                    </p>
                    <p className="text-sm font-black text-red-700">
                      {formatPercent(summary.maxExposure)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-2">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-blue-500">
                      Max spread
                    </p>
                    <p className="text-sm font-black text-blue-700">
                      {formatTemp(summary.maxSpread)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-orange-50 p-2">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-orange-500">
                      Risk + spread
                    </p>
                    <p className="text-sm font-black text-orange-700">
                      {formatCount(summary.highRiskHighSpreadCellCount)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-purple-50 p-2">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-purple-500">
                      Total population
                    </p>
                    <p className="text-sm font-black text-purple-700">
                      {formatCompactCount(summary.totalPopulation)}
                    </p>
                  </div>
                </div>

                {Object.entries(groupedFeatures).map(([layerName, features]) => {
                  const layerFeatures = features as GeoJSON.Feature[];
                  const displayName =
                    layerDisplayNames[layerName] ||
                    DEFAULT_LAYER_DISPLAY_NAMES[layerName] ||
                    layerName;

                  return (
                    <div
                      key={layerName}
                      className="flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-2"
                    >
                      <div>
                        <p className="text-[10px] font-bold text-neutral-800">
                          {displayName}
                        </p>
                        <p className="text-[9px] text-neutral-400">
                          {layerFeatures.length.toLocaleString()} features
                        </p>
                      </div>
                      <button
                        onClick={() => handleDownloadLayer(layerName)}
                        className="rounded-md bg-neutral-950 px-2 py-1 text-[9px] font-bold text-white hover:bg-neutral-800"
                      >
                        Download
                      </button>
                    </div>
                  );
                })}

                {queryMetadata?.provenance?.data_sources?.length ? (
                  <div className="rounded-lg bg-neutral-50 p-2">
                    <p className="text-[9px] font-black uppercase tracking-wide text-neutral-400">
                      Data sources
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[9px] leading-snug text-neutral-600">
                      {queryMetadata.provenance.data_sources.map((source) => (
                        <li key={source}>{source}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}

      {!isHeatAnalysis && highlightedFeatures && highlightedFeatures.length > 0 && (
        <div className="mt-3 space-y-2">
          {Object.entries(groupedFeatures).map(([layerName, features]) => {
            const layerFeatures = features as GeoJSON.Feature[];
            const displayName =
              layerDisplayNames[layerName] ||
              DEFAULT_LAYER_DISPLAY_NAMES[layerName] ||
              layerName;

            return (
              <div
                key={layerName}
                className="flex items-center justify-between rounded-xl bg-neutral-50 p-3"
              >
                <div>
                  <p className="text-xs font-bold text-neutral-900">
                    {displayName}
                  </p>
                  <p className="text-[10px] text-neutral-500">
                    {layerFeatures.length.toLocaleString()} features
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadLayer(layerName)}
                  className="rounded-lg bg-neutral-950 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-neutral-800"
                >
                  Download
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SpatialQueryPanel;