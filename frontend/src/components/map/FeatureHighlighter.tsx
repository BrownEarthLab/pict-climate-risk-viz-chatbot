import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

type HeatDisplayMode = "combined" | "risk" | "uncertainty";

interface FeatureHighlighterProps {
  mapboxMap: mapboxgl.Map | null;
  highlightedFeatures: GeoJSON.Feature[] | null;
  showPopulationOverlay?: boolean;
  showInfrastructureAssets?: boolean;
  heatDisplayMode?: HeatDisplayMode;
}

const DEFAULT_LAYER_DISPLAY_NAMES: Record<string, string> = {
  "Manual Heat Risk": "Heat Exposure Grid",
  "Manual Heat Risk Assets": "Infrastructure Assets",
  "Population Exposure Overlay": "Expected Exposed Population",
  "Near-Surface Air Temp (TAS)": "Near-Surface Air Temperature",
  "Annual Mean Wet-Bulb (WBT)": "Annual Mean Wet-Bulb Temperature",
};

const highlightSourceId = "highlight-source";

const manualHeatRiskFillLayerId = "manual-heat-risk-fill";
const manualHeatRiskOutlineLayerId = "manual-heat-risk-outline";
const manualHeatUncertaintyFillLayerId = "manual-heat-uncertainty-fill";
const manualHeatUncertaintyOutlineLayerId = "manual-heat-uncertainty-outline";

const populationOverlayCircleLayerId = "population-exposure-overlay-circles";

const assetPointLayerId = "manual-heat-risk-assets-points";

const tasFillLayerId = "tas-highlight-fill";
const wetBulbFillLayerId = "wet-bulb-highlight-fill";
const genericPointLayerId = "generic-highlight-points";
const genericLineLayerId = "generic-highlight-lines";
const genericPolygonLayerId = "generic-highlight-polygons";

const allHighlightLayerIds = [
  tasFillLayerId,
  wetBulbFillLayerId,
  manualHeatRiskFillLayerId,
  manualHeatRiskOutlineLayerId,
  manualHeatUncertaintyFillLayerId,
  manualHeatUncertaintyOutlineLayerId,
  populationOverlayCircleLayerId,
  assetPointLayerId,
  genericPointLayerId,
  genericLineLayerId,
  genericPolygonLayerId,
];

function formatNumber(value: unknown, digits = 1): string {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return "N/A";

  return numberValue.toFixed(digits);
}

function formatPercent(value: unknown): string {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return "N/A";

  return `${(numberValue * 100).toFixed(0)}%`;
}

function cleanLabel(value: unknown): string {
  return String(value || "N/A").replaceAll("_", " ");
}

function getNumberProp(
  properties: Record<string, unknown>,
  key: string
): number | null {
  const value = Number(properties[key]);

  return Number.isFinite(value) ? value : null;
}

function getForecastSpread(properties: Record<string, unknown>): number | null {
  return (
    getNumberProp(properties, "forecast_spread") ??
    getNumberProp(properties, "heat_uncertainty_delta")
  );
}

function getNormalizedForecastSpread(
  properties: Record<string, unknown>
): number {
  return (
    getNumberProp(properties, "normalized_forecast_spread") ??
    getNumberProp(properties, "normalized_uncertainty") ??
    0
  );
}

function getPopulationPlanningClassLabel(
  properties: Record<string, unknown>
): string {
  const exposureProbability =
    getNumberProp(properties, "exposure_probability") ?? 0;
  const normalizedForecastSpread = getNormalizedForecastSpread(properties);
  const expectedExposedPopulation =
    getNumberProp(properties, "expected_exposed_population") ?? 0;

  if (exposureProbability >= 0.75 && normalizedForecastSpread >= 0.6) {
    return "Urgent high-spread exposure zone";
  }

  if (exposureProbability >= 0.5 && normalizedForecastSpread >= 0.6) {
    return "High-spread exposure priority";
  }

  if (expectedExposedPopulation >= 5000 && exposureProbability >= 0.35) {
    return "Population exposure priority";
  }

  if (exposureProbability >= 0.35 && normalizedForecastSpread >= 0.6) {
    return "High-spread monitoring zone";
  }

  if (expectedExposedPopulation >= 2000) {
    return "Population monitoring zone";
  }

  return "Lower priority zone";
}

function getTooltipHtml(properties: Record<string, unknown>): string {
  const layerName = String(properties.layer_name || "");
  const forecastSpread = getForecastSpread(properties);
  const normalizedForecastSpread = getNormalizedForecastSpread(properties);

  if (layerName === "Population Exposure Overlay") {
    return `
      <div class="min-w-[250px] font-sans">
        <div class="mb-1 text-xs font-bold text-neutral-900">
          Expected exposed population
        </div>
        <div class="space-y-0.5 text-[11px] text-neutral-700">
          <div><strong>Population estimate:</strong> ${formatNumber(
            properties.population_estimate,
            0
          )}</div>
          <div><strong>Exposure probability:</strong> ${formatPercent(
            properties.exposure_probability
          )}</div>
          <div><strong>Expected exposed people:</strong> ${formatNumber(
            properties.expected_exposed_population,
            0
          )}</div>
          <div><strong>Method:</strong> population × probability</div>
          <div><strong>Forecast spread:</strong> ${formatNumber(
            forecastSpread
          )}°C</div>
          <div><strong>Normalized spread:</strong> ${formatPercent(
            normalizedForecastSpread
          )}</div>
          <div><strong>Priority class:</strong> ${cleanLabel(
            properties.priority_category
          )}</div>
          <div><strong>Planning class:</strong> ${getPopulationPlanningClassLabel(
            properties
          )}</div>
        </div>
        <div class="mt-1 border-t border-neutral-100 pt-1 text-[10px] leading-snug text-neutral-500">
          Expected exposed people is an expected value, not a confirmed observed count.
        </div>
      </div>
    `;
  }

  if (layerName === "Manual Heat Risk") {
    return `
      <div class="min-w-[245px] font-sans">
        <div class="mb-1 text-xs font-bold text-neutral-900">
          Heat exposure H3 hexagon
        </div>
        <div class="space-y-0.5 text-[11px] text-neutral-700">
          <div><strong>Exposure probability:</strong> ${formatPercent(
            properties.exposure_probability
          )}</div>
          <div><strong>Mean heat:</strong> ${formatNumber(
            properties.heat_mean
          )}°C</div>
          <div><strong>P10 / P90:</strong> ${formatNumber(
            properties.heat_p10
          )}°C / ${formatNumber(properties.heat_p90)}°C</div>
          <div><strong>Forecast spread:</strong> ${formatNumber(
            forecastSpread
          )}°C</div>
          <div><strong>Normalized spread:</strong> ${formatPercent(
            normalizedForecastSpread
          )}</div>
          <div><strong>Spatial unit:</strong> ${cleanLabel(
            properties.spatial_unit || "h3_hexagon"
          )}</div>
          <div><strong>H3 resolution:</strong> ${String(
            properties.h3_resolution || "N/A"
          )}</div>
        </div>
        <div class="mt-1 border-t border-neutral-100 pt-1 text-[10px] leading-snug text-neutral-500">
          Orange = exposure probability. Blue-purple = forecast spread.
        </div>
      </div>
    `;
  }

  if (layerName === "Manual Heat Risk Assets") {
    const exposed =
      properties.exposed_to_hazard === true ||
      properties.exposed_to_hazard === "true";

    return `
      <div class="min-w-[210px] font-sans">
        <div class="mb-1 text-xs font-bold text-neutral-900">
          ${String(properties.asset_name || "Infrastructure asset")}
        </div>
        <div class="space-y-0.5 text-[11px] text-neutral-700">
          <div><strong>Type:</strong> ${cleanLabel(properties.asset_type)}</div>
          <div><strong>Status:</strong> ${
            exposed ? "Exposed" : "Not exposed"
          }</div>
          <div><strong>Sampled heat:</strong> ${formatNumber(
            properties.sampled_hazard_value || properties.heat_value
          )}°C</div>
          <div><strong>Exposure probability:</strong> ${formatPercent(
            properties.exposure_probability
          )}</div>
          <div><strong>Forecast spread:</strong> ${formatNumber(
            forecastSpread
          )}°C</div>
          <div><strong>Rank:</strong> ${String(
            properties.asset_rank || "N/A"
          )}</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="font-sans text-xs text-neutral-800">
      ${String(
        properties.description ||
          DEFAULT_LAYER_DISPLAY_NAMES[layerName] ||
          layerName ||
          "Map feature"
      )}
    </div>
  `;
}

function isMapReady(map: mapboxgl.Map): boolean {
  try {
    return Boolean(map.getStyle());
  } catch {
    return false;
  }
}

const FeatureHighlighter = ({
  mapboxMap,
  highlightedFeatures,
  showPopulationOverlay = false,
  showInfrastructureAssets = false,
  heatDisplayMode = "combined",
}: FeatureHighlighterProps) => {
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  useEffect(() => {
    if (!mapboxMap || !isMapReady(mapboxMap)) return;

    const safeGetLayer = (id: string) => {
      try {
        if (!isMapReady(mapboxMap)) return undefined;
        return mapboxMap.getLayer(id);
      } catch {
        return undefined;
      }
    };

    const safeGetSource = (id: string) => {
      try {
        if (!isMapReady(mapboxMap)) return undefined;
        return mapboxMap.getSource(id);
      } catch {
        return undefined;
      }
    };

    const removePopup = () => {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };

    const removeLayer = (id: string) => {
      try {
        if (!isMapReady(mapboxMap)) return;
        if (safeGetLayer(id)) mapboxMap.removeLayer(id);
      } catch {
        // Ignore cleanup issues during hot reload or map teardown.
      }
    };

    const removeSource = (id: string) => {
      try {
        if (!isMapReady(mapboxMap)) return;
        if (safeGetSource(id)) mapboxMap.removeSource(id);
      } catch {
        // Ignore cleanup issues during hot reload or map teardown.
      }
    };

    const removeAllHighlightLayers = () => {
      allHighlightLayerIds.forEach(removeLayer);
      removeSource(highlightSourceId);
      removePopup();
    };

    const addLayerIfMissing = (layer: mapboxgl.AnyLayer) => {
      try {
        if (!isMapReady(mapboxMap)) return;

        if (!safeGetLayer(layer.id)) {
          mapboxMap.addLayer(layer);
        }
      } catch (error) {
        console.warn(`Could not add layer ${layer.id}:`, error);
      }
    };

    const attachHoverHandlers = (layerId: string) => {
      const handleMouseMove = (event: mapboxgl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];

        if (!feature || !feature.properties) return;

        mapboxMap.getCanvas().style.cursor = "pointer";

        const properties = feature.properties as Record<string, unknown>;
        const html = getTooltipHtml(properties);

        if (!popupRef.current) {
          popupRef.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 12,
            className: "manual-risk-hover-popup",
          });
        }

        popupRef.current
          .setLngLat(event.lngLat)
          .setHTML(html)
          .addTo(mapboxMap);
      };

      const handleMouseLeave = () => {
        mapboxMap.getCanvas().style.cursor = "";
        removePopup();
      };

      try {
        if (safeGetLayer(layerId)) {
          mapboxMap.on("mousemove", layerId, handleMouseMove);
          mapboxMap.on("mouseleave", layerId, handleMouseLeave);
        }
      } catch (error) {
        console.warn(`Could not attach hover handlers to ${layerId}:`, error);
      }

      return () => {
        try {
          if (safeGetLayer(layerId)) {
            mapboxMap.off("mousemove", layerId, handleMouseMove);
            mapboxMap.off("mouseleave", layerId, handleMouseLeave);
          }
        } catch {
          // Ignore teardown errors.
        }
      };
    };

    removeAllHighlightLayers();

    if (!highlightedFeatures || highlightedFeatures.length === 0) return;

    const collection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: highlightedFeatures,
    };

    try {
      mapboxMap.addSource(highlightSourceId, {
        type: "geojson",
        data: collection,
      });
    } catch (error) {
      console.warn("Could not add highlight source:", error);
      return;
    }

    const cleanupHoverHandlers: Array<() => void> = [];

    const showRiskLayer =
      heatDisplayMode === "risk" || heatDisplayMode === "combined";
    const showUncertaintyFillLayer = heatDisplayMode === "uncertainty";
    const showUncertaintyOutlineLayer =
      heatDisplayMode === "uncertainty" || heatDisplayMode === "combined";

    addLayerIfMissing({
      id: tasFillLayerId,
      type: "fill",
      source: highlightSourceId,
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "layer_name"], "Near-Surface Air Temp (TAS)"],
      ],
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          ["get", "temp_c"],
          20,
          "#3b82f6",
          25,
          "#eab308",
          30,
          "#ef4444",
        ],
        "fill-opacity": 0.5,
      },
    });

    addLayerIfMissing({
      id: wetBulbFillLayerId,
      type: "fill",
      source: highlightSourceId,
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "layer_name"], "Annual Mean Wet-Bulb (WBT)"],
      ],
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          ["get", "wet_bulb_c"],
          15,
          "#10b981",
          20,
          "#f59e0b",
          24,
          "#ef4444",
          27,
          "#d946ef",
        ],
        "fill-opacity": 0.5,
      },
    });

    addLayerIfMissing({
      id: manualHeatRiskFillLayerId,
      type: "fill",
      source: highlightSourceId,
      layout: {
        visibility: showRiskLayer ? "visible" : "none",
      },
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "layer_name"], "Manual Heat Risk"],
      ],
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          [
            "coalesce",
            ["get", "exposure_probability"],
            ["get", "risk_score"],
            0,
          ],
          0,
          "#fff7ed",
          0.2,
          "#ffedd5",
          0.4,
          "#fdba74",
          0.6,
          "#fb923c",
          0.8,
          "#ea580c",
          1,
          "#7c2d12",
        ],
        "fill-opacity": heatDisplayMode === "combined" ? 0.58 : 0.72,
      },
    });

    addLayerIfMissing({
      id: manualHeatRiskOutlineLayerId,
      type: "line",
      source: highlightSourceId,
      layout: {
        visibility: showRiskLayer ? "visible" : "none",
      },
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "layer_name"], "Manual Heat Risk"],
      ],
      paint: {
        "line-color": "rgba(255,255,255,0.78)",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5,
          0.25,
          8,
          0.55,
          11,
          0.9,
        ],
        "line-opacity": 0.7,
      },
    });

    addLayerIfMissing({
      id: manualHeatUncertaintyFillLayerId,
      type: "fill",
      source: highlightSourceId,
      layout: {
        visibility: showUncertaintyFillLayer ? "visible" : "none",
      },
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "layer_name"], "Manual Heat Risk"],
      ],
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          [
            "coalesce",
            ["get", "normalized_forecast_spread"],
            ["get", "normalized_uncertainty"],
            0,
          ],
          0,
          "#f0f9ff",
          0.25,
          "#bae6fd",
          0.5,
          "#60a5fa",
          0.75,
          "#7c3aed",
          1,
          "#312e81",
        ],
        "fill-opacity": 0.72,
      },
    });

    addLayerIfMissing({
      id: manualHeatUncertaintyOutlineLayerId,
      type: "line",
      source: highlightSourceId,
      layout: {
        visibility: showUncertaintyOutlineLayer ? "visible" : "none",
      },
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "layer_name"], "Manual Heat Risk"],
      ],
      paint: {
        "line-color": [
          "interpolate",
          ["linear"],
          [
            "coalesce",
            ["get", "normalized_forecast_spread"],
            ["get", "normalized_uncertainty"],
            0,
          ],
          0,
          "rgba(186,230,253,0.25)",
          0.25,
          "rgba(96,165,250,0.55)",
          0.5,
          "rgba(37,99,235,0.8)",
          0.75,
          "rgba(124,58,237,0.95)",
          1,
          "rgba(49,46,129,1)",
        ],
        "line-width": [
          "interpolate",
          ["linear"],
          [
            "coalesce",
            ["get", "normalized_forecast_spread"],
            ["get", "normalized_uncertainty"],
            0,
          ],
          0,
          heatDisplayMode === "uncertainty" ? 0.4 : 0.2,
          0.5,
          heatDisplayMode === "uncertainty" ? 1.1 : 1.4,
          1,
          heatDisplayMode === "uncertainty" ? 1.8 : 2.4,
        ],
        "line-opacity": heatDisplayMode === "uncertainty" ? 0.8 : 0.95,
      },
    });

    addLayerIfMissing({
      id: populationOverlayCircleLayerId,
      type: "circle",
      source: highlightSourceId,
      layout: {
        visibility: showPopulationOverlay ? "visible" : "none",
      },
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        ["==", ["get", "layer_name"], "Population Exposure Overlay"],
      ],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "expected_exposed_population"], 0],
          0,
          0,
          250,
          2.5,
          1000,
          5,
          3000,
          8,
          6000,
          11,
          10000,
          14,
          15000,
          17,
          25000,
          21,
          40000,
          25,
        ],
        "circle-color": "#8b5cf6",
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "expected_exposed_population"], 0],
          0,
          0,
          250,
          0.22,
          1000,
          0.34,
          3000,
          0.46,
          6000,
          0.56,
          15000,
          0.66,
          40000,
          0.72,
        ],
        "circle-blur": 0.12,
        "circle-stroke-color": [
          "case",
          [
            "all",
            [">=", ["coalesce", ["get", "exposure_probability"], 0], 0.75],
            [
              ">=",
              [
                "coalesce",
                ["get", "normalized_forecast_spread"],
                ["get", "normalized_uncertainty"],
                0,
              ],
              0.6,
            ],
          ],
          "#ef4444",
          [
            "all",
            [">=", ["coalesce", ["get", "exposure_probability"], 0], 0.5],
            [
              ">=",
              [
                "coalesce",
                ["get", "normalized_forecast_spread"],
                ["get", "normalized_uncertainty"],
                0,
              ],
              0.6,
            ],
          ],
          "#f97316",
          [
            "all",
            [
              ">=",
              ["coalesce", ["get", "expected_exposed_population"], 0],
              5000,
            ],
            [">=", ["coalesce", ["get", "exposure_probability"], 0], 0.35],
          ],
          "#8b5cf6",
          "rgba(255,255,255,0.75)",
        ],
        "circle-stroke-width": [
          "case",
          [
            "all",
            [">=", ["coalesce", ["get", "exposure_probability"], 0], 0.75],
            [
              ">=",
              [
                "coalesce",
                ["get", "normalized_forecast_spread"],
                ["get", "normalized_uncertainty"],
                0,
              ],
              0.6,
            ],
          ],
          2,
          [
            "all",
            [">=", ["coalesce", ["get", "exposure_probability"], 0], 0.5],
            [
              ">=",
              [
                "coalesce",
                ["get", "normalized_forecast_spread"],
                ["get", "normalized_uncertainty"],
                0,
              ],
              0.6,
            ],
          ],
          1.5,
          [
            "all",
            [
              ">=",
              ["coalesce", ["get", "expected_exposed_population"], 0],
              5000,
            ],
            [">=", ["coalesce", ["get", "exposure_probability"], 0], 0.35],
          ],
          1.2,
          0.6,
        ],
        "circle-stroke-opacity": 0.75,
      },
    });

    addLayerIfMissing({
      id: assetPointLayerId,
      type: "circle",
      source: highlightSourceId,
      layout: {
        visibility: showInfrastructureAssets ? "visible" : "none",
      },
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        ["==", ["get", "layer_name"], "Manual Heat Risk Assets"],
      ],
      paint: {
        "circle-radius": [
          "case",
          ["==", ["get", "exposed_to_hazard"], true],
          5.4,
          3.8,
        ],
        "circle-color": [
          "match",
          ["get", "asset_type"],
          "hospital",
          "#ef4444",
          "clinic",
          "#ef4444",
          "school",
          "#2563eb",
          "college",
          "#2563eb",
          "university",
          "#2563eb",
          "kindergarten",
          "#2563eb",
          "port",
          "#0891b2",
          "ferry_terminal",
          "#0891b2",
          "power_substation",
          "#a855f7",
          "critical_facility",
          "#f97316",
          "#111827",
        ],
        "circle-opacity": 0.9,
        "circle-stroke-color": [
          "case",
          ["==", ["get", "exposed_to_hazard"], true],
          "#facc15",
          "#ffffff",
        ],
        "circle-stroke-width": [
          "case",
          ["==", ["get", "exposed_to_hazard"], true],
          2.2,
          1.2,
        ],
      },
    });

    addLayerIfMissing({
      id: genericPointLayerId,
      type: "circle",
      source: highlightSourceId,
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        ["!=", ["get", "layer_name"], "Manual Heat Risk Assets"],
        ["!=", ["get", "layer_name"], "Population Exposure Overlay"],
      ],
      paint: {
        "circle-radius": 5,
        "circle-color": "#00FFFF",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });

    addLayerIfMissing({
      id: genericLineLayerId,
      type: "line",
      source: highlightSourceId,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#00FFFF",
        "line-width": 4,
      },
    });

    addLayerIfMissing({
      id: genericPolygonLayerId,
      type: "fill",
      source: highlightSourceId,
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["!=", ["get", "layer_name"], "Manual Heat Risk"],
        ["!=", ["get", "layer_name"], "Near-Surface Air Temp (TAS)"],
        ["!=", ["get", "layer_name"], "Annual Mean Wet-Bulb (WBT)"],
      ],
      paint: {
        "fill-color": "#00FFFF",
        "fill-opacity": 0.35,
      },
    });

    [
      tasFillLayerId,
      wetBulbFillLayerId,
      manualHeatRiskFillLayerId,
      manualHeatUncertaintyFillLayerId,
      populationOverlayCircleLayerId,
      assetPointLayerId,
      genericPointLayerId,
      genericLineLayerId,
      genericPolygonLayerId,
    ].forEach((layerId) => {
      cleanupHoverHandlers.push(attachHoverHandlers(layerId));
    });

    return () => {
      cleanupHoverHandlers.forEach((cleanup) => cleanup());
      removeAllHighlightLayers();
    };
  }, [
    mapboxMap,
    highlightedFeatures,
    showPopulationOverlay,
    showInfrastructureAssets,
    heatDisplayMode,
  ]);

  return null;
};

export default FeatureHighlighter;