import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { useMapbox } from "../../hooks/useMapbox";
import SearchBar from "./SearchBar";
import DrawControls from "./DrawControls";
import FeatureHighlighter from "./FeatureHighlighter";
import SpatialQueryPanel from "./SpatialQueryPanel";
import MapControls from "./MapControls";
import type { SpatialQueryMetadata } from "../../hooks/useSpatialQuery";

interface SpatialQueryRequestOptions {
  threshold?: number;
  risk_metric?: string;
  asset_types?: string[];
  comparison_operator?: string;
  include_population?: boolean;
  include_assets?: boolean;
  return_layers?: {
    risk_grid?: boolean;
    sampled_assets?: boolean;
    ranked_assets?: boolean;
  };
}

interface MapCanvasProps {
  onDrawGeometry: (geometry: GeoJSON.Geometry | null) => void;
  drawnGeometry: GeoJSON.Geometry | null;
  runSpatialQuery: (
    geometry: GeoJSON.Geometry,
    activeLayers: Record<string, boolean>,
    analysisType?: string,
    requestOptions?: SpatialQueryRequestOptions
  ) => Promise<void>;
  clearSpatialQuery: () => void;
  highlightedFeatures: GeoJSON.Feature[] | null;
  queryMetadata: SpatialQueryMetadata | null;
  isDrawMode: boolean;
  setIsDrawMode: (mode: boolean) => void;
  isQuerying: boolean;
}

type MapLayer = "tas" | "wet_bulb" | "manual_heat_risk" | null;

function getGeometryCenter(geometry: GeoJSON.Geometry): [number, number] {
  if (geometry.type === "Point") {
    return geometry.coordinates as [number, number];
  }

  if (geometry.type === "LineString") {
    const coords = geometry.coordinates;
    const mid = Math.floor(coords.length / 2);
    return coords[mid] as [number, number];
  }

  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0];
    let sumLng = 0;
    let sumLat = 0;
    const count = ring.length - 1;

    if (count <= 0) return [0, 0];

    for (let i = 0; i < count; i += 1) {
      sumLng += ring[i][0];
      sumLat += ring[i][1];
    }

    return [sumLng / count, sumLat / count];
  }

  if (geometry.type === "MultiPolygon") {
    const ring = geometry.coordinates[0][0];
    let sumLng = 0;
    let sumLat = 0;
    const count = ring.length - 1;

    if (count <= 0) return [0, 0];

    for (let i = 0; i < count; i += 1) {
      sumLng += ring[i][0];
      sumLat += ring[i][1];
    }

    return [sumLng / count, sumLat / count];
  }

  return [0, 0];
}

const MapCanvas = ({
  onDrawGeometry,
  drawnGeometry,
  runSpatialQuery,
  clearSpatialQuery,
  highlightedFeatures,
  queryMetadata,
  isQuerying,
}: MapCanvasProps) => {
  const {
    mapContainerRef,
    mapboxMap,
    activeLayer,
    setActiveLayer,
    showGlobalDataset,
    setShowGlobalDataset,
  } = useMapbox();

  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [manualHeatThreshold, setManualHeatThreshold] = useState(22);
  const [showPopulationOverlay, setShowPopulationOverlay] = useState(false);
  const [showInfrastructureAssets, setShowInfrastructureAssets] =
    useState(false);

  const manualHeatThresholdRef = useRef(22);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const currentActiveLayer = activeLayer as MapLayer;

  useEffect(() => {
    manualHeatThresholdRef.current = manualHeatThreshold;
  }, [manualHeatThreshold]);

  const handleRerunHeatExposure = () => {
  if (!drawnGeometry) return;

  setActiveLayer("manual_heat_risk" as never);
  setShowGlobalDataset(false);

  runSpatialQuery(
    drawnGeometry,
    { "Manual Heat Risk": true },
    "manual_heat_risk",
    {
      threshold: manualHeatThreshold,
      risk_metric: "heat",
      asset_types: ["hospital", "school", "port"],
      comparison_operator: ">=",
      include_population: true,
      include_assets: true,
      return_layers: {
        risk_grid: true,
        sampled_assets: true,
        ranked_assets: true,
      },
    }
  );
};

  const handleClearAnalysis = () => {
    popupRef.current?.remove();
    popupRef.current = null;

    const draw = (
      window as typeof window & {
        __mapboxDraw?: {
          deleteAll?: () => void;
          changeMode?: (mode: string) => void;
        };
      }
    ).__mapboxDraw;

    try {
      draw?.deleteAll?.();
      draw?.changeMode?.("simple_select");
    } catch (error) {
      console.warn("Could not clear drawn polygon:", error);
    }

    setActiveLayer(null);
    setShowGlobalDataset(false);
    setShowPopulationOverlay(false);
    setShowInfrastructureAssets(false);

    clearSpatialQuery();
    onDrawGeometry(null);
  };

  useEffect(() => {
    if (!mapboxMap || !drawnGeometry) {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }

      return;
    }

    const center = getGeometryCenter(drawnGeometry);

    if (center[0] === 0 && center[1] === 0) return;

    const container = document.createElement("div");
    container.className = "p-2 text-neutral-900 font-sans";
    container.innerHTML = `
      <p class="mb-2 text-xs font-bold text-neutral-700">Select Manual Analysis:</p>

      <div class="flex flex-col gap-1.5">
        <button id="btn-temp-stats" class="w-full cursor-pointer rounded-lg bg-neutral-950 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-800">
          Calculate Air Temp Stats
        </button>

        <button id="btn-heat-stress" class="w-full cursor-pointer rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700">
          Get Mean Wet-Bulb Temp
        </button>

        <div class="mt-1 rounded-lg border border-orange-100 bg-orange-50 p-2">
          <label for="manual-heat-threshold" class="mb-1 block text-[10px] font-bold uppercase tracking-wide text-orange-700">
            Heat threshold (°C)
          </label>
          <input
            id="manual-heat-threshold"
            type="number"
            min="10"
            max="45"
            step="0.5"
            value="${manualHeatThresholdRef.current}"
            class="w-full rounded-md border border-orange-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-900 outline-none focus:border-orange-500"
          />
        </div>

        <button id="btn-manual-heat-risk" class="w-full cursor-pointer rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-700">
          Run Heat Exposure Analysis
        </button>
      </div>
    `;

    if (popupRef.current) {
      popupRef.current.remove();
    }

    const popup = new mapboxgl.Popup({
      closeOnClick: false,
      closeButton: true,
    })
      .setLngLat(center)
      .setDOMContent(container)
      .addTo(mapboxMap);

    popupRef.current = popup;

    const handleTempStats = () => {
      setActiveLayer("tas");
      setShowGlobalDataset(false);
      setShowPopulationOverlay(false);
      setShowInfrastructureAssets(false);

      runSpatialQuery(
        drawnGeometry,
        { "Near-Surface Air Temp (TAS)": true },
        "zonal_stats"
      );

      popup.remove();
    };

    const handleHeatStress = () => {
      setActiveLayer("wet_bulb");
      setShowGlobalDataset(false);
      setShowPopulationOverlay(false);
      setShowInfrastructureAssets(false);

      runSpatialQuery(
        drawnGeometry,
        { "Annual Mean Wet-Bulb (WBT)": true },
        "heat_stress"
      );

      popup.remove();
    };

    const handleManualHeatRisk = () => {
      const thresholdInput = container.querySelector<HTMLInputElement>(
        "#manual-heat-threshold"
      );

      const parsedThreshold = Number(thresholdInput?.value);
      const threshold = Number.isFinite(parsedThreshold)
        ? parsedThreshold
        : manualHeatThresholdRef.current;

      manualHeatThresholdRef.current = threshold;
      setManualHeatThreshold(threshold);

      setActiveLayer("manual_heat_risk" as never);
      setShowGlobalDataset(false);
      setShowPopulationOverlay(false);
      setShowInfrastructureAssets(false);

      runSpatialQuery(
        drawnGeometry,
        { "Manual Heat Risk": true },
        "manual_heat_risk",
        {
          threshold,
          risk_metric: "heat",
          asset_types: ["hospital", "school", "port"],
          comparison_operator: ">=",
          include_population: true,
          include_assets: true,
          return_layers: {
            risk_grid: true,
            sampled_assets: true,
            ranked_assets: true,
          },
        }
      );

      popup.remove();
    };

    const tempBtn = container.querySelector<HTMLButtonElement>("#btn-temp-stats");
    const heatBtn =
      container.querySelector<HTMLButtonElement>("#btn-heat-stress");
    const manualHeatRiskBtn = container.querySelector<HTMLButtonElement>(
      "#btn-manual-heat-risk"
    );

    tempBtn?.addEventListener("click", handleTempStats);
    heatBtn?.addEventListener("click", handleHeatStress);
    manualHeatRiskBtn?.addEventListener("click", handleManualHeatRisk);

    return () => {
      tempBtn?.removeEventListener("click", handleTempStats);
      heatBtn?.removeEventListener("click", handleHeatStress);
      manualHeatRiskBtn?.removeEventListener("click", handleManualHeatRisk);

      popup.remove();

      if (popupRef.current === popup) {
        popupRef.current = null;
      }
    };
  }, [
    mapboxMap,
    drawnGeometry,
    runSpatialQuery,
    setActiveLayer,
    setShowGlobalDataset,
  ]);

  return (
    <div className="absolute inset-0">
      <div ref={mapContainerRef} className="h-full w-full" />

      {!mapboxMap && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center bg-white/70 text-lg text-gray-800">
          Loading map...
        </div>
      )}

      {mapboxMap && (
        <>
          <SearchBar map={mapboxMap} />

          <DrawControls map={mapboxMap} onDrawGeometry={onDrawGeometry} />

          <FeatureHighlighter
            mapboxMap={mapboxMap}
            highlightedFeatures={highlightedFeatures}
            showPopulationOverlay={showPopulationOverlay}
            showInfrastructureAssets={showInfrastructureAssets}
          />

          <SpatialQueryPanel
            highlightedFeatures={highlightedFeatures}
            queryMetadata={queryMetadata}
            showPopulationOverlay={showPopulationOverlay}
            showInfrastructureAssets={showInfrastructureAssets}
          />

          <MapControls map={mapboxMap} />

          {isQuerying && (
            <div className="pointer-events-none absolute left-1/2 top-5 z-[1200] -translate-x-1/2 rounded-2xl border border-black/5 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                <div>
                  <div className="text-xs font-bold text-neutral-900">
                    Running spatial analysis
                  </div>
                  <div className="text-[10px] font-medium text-neutral-500">
                    Fetching forecast uncertainty and calculating exposure...
                  </div>
                </div>
              </div>
            </div>
          )}

          {(drawnGeometry || highlightedFeatures?.length) && (
            <button
              onClick={handleClearAnalysis}
              className="absolute right-3 top-28 z-[1200] rounded-xl border border-black/5 bg-white/95 px-3 py-2 text-xs font-bold text-neutral-700 shadow-lg backdrop-blur-md hover:bg-neutral-100"
            >
              Clear analysis
            </button>
          )}

          <div className="absolute bottom-16 left-4 z-20 w-[300px] rounded-2xl border border-black/5 bg-white/90 p-4 shadow-lg backdrop-blur-md transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Map Layers
              </span>

              <button
                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                className="cursor-pointer text-xs font-semibold text-neutral-500 hover:text-neutral-900"
              >
                {isLegendExpanded ? "Collapse" : "Expand"}
              </button>
            </div>

            {isLegendExpanded && (
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex rounded-xl bg-neutral-100 p-0.5">
                  <button
                    onClick={() => {
                      if (currentActiveLayer !== "tas") {
                        setActiveLayer("tas");
                        setShowGlobalDataset(true);
                        setShowPopulationOverlay(false);
                        setShowInfrastructureAssets(false);
                      } else if (showGlobalDataset) {
                        setShowGlobalDataset(false);
                      } else {
                        setActiveLayer(null);
                      }
                    }}
                    className={`flex-1 cursor-pointer rounded-lg py-1.5 text-center text-xs font-semibold transition ${
                      currentActiveLayer === "tas"
                        ? `bg-white shadow-sm ${
                            showGlobalDataset
                              ? "font-bold text-neutral-950"
                              : "font-medium text-neutral-500 opacity-75"
                          }`
                        : "text-neutral-500 hover:text-neutral-900"
                    }`}
                  >
                    Air
                  </button>

                  <button
                    onClick={() => {
                      if (currentActiveLayer !== "wet_bulb") {
                        setActiveLayer("wet_bulb");
                        setShowGlobalDataset(true);
                        setShowPopulationOverlay(false);
                        setShowInfrastructureAssets(false);
                      } else if (showGlobalDataset) {
                        setShowGlobalDataset(false);
                      } else {
                        setActiveLayer(null);
                      }
                    }}
                    className={`flex-1 cursor-pointer rounded-lg py-1.5 text-center text-xs font-semibold transition ${
                      currentActiveLayer === "wet_bulb"
                        ? `bg-white shadow-sm ${
                            showGlobalDataset
                              ? "font-bold text-neutral-950"
                              : "font-medium text-neutral-500 opacity-75"
                          }`
                        : "text-neutral-500 hover:text-neutral-900"
                    }`}
                  >
                    WBT
                  </button>

                  <button
                    onClick={() => {
                      if (currentActiveLayer !== "manual_heat_risk") {
                        setActiveLayer("manual_heat_risk" as never);
                        setShowGlobalDataset(false);
                      } else {
                        setActiveLayer(null);
                        setShowPopulationOverlay(false);
                        setShowInfrastructureAssets(false);
                      }
                    }}
                    className={`flex-1 cursor-pointer rounded-lg py-1.5 text-center text-xs font-semibold transition ${
                      currentActiveLayer === "manual_heat_risk"
                        ? "bg-white font-bold text-orange-700 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-900"
                    }`}
                  >
                    Heat
                  </button>
                </div>

                {currentActiveLayer && (
                  <div className="border-t border-neutral-100 pt-3">
                    {currentActiveLayer === "manual_heat_risk" ? (
                      <div>
                        <div className="mb-2 flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-neutral-800">
                            Heat Exposure
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            Color = chance of crossing threshold
                          </span>
                          <div className="mt-1 flex items-center gap-2">
  <label className="text-[10px] font-semibold text-orange-600">
    Threshold
  </label>

  <input
    type="number"
    min="10"
    max="45"
    step="0.5"
    value={manualHeatThreshold}
    onChange={(event) => {
      const nextValue = Number(event.target.value);

      if (Number.isFinite(nextValue)) {
        setManualHeatThreshold(nextValue);
        manualHeatThresholdRef.current = nextValue;
      }
    }}
    className="h-7 w-16 rounded-lg border border-orange-100 bg-orange-50 px-2 text-[11px] font-bold text-orange-700 outline-none focus:border-orange-400"
  />

  <span className="text-[10px] font-semibold text-orange-600">°C</span>

  <button
    onClick={handleRerunHeatExposure}
    disabled={!drawnGeometry || isQuerying}
    className="ml-auto rounded-lg bg-orange-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
  >
    Rerun
  </button>
</div>
                        </div>

                        <div
                          className="h-2 w-full rounded-full"
                          style={{
                            background:
                              "linear-gradient(to right, #3b82f6, #86efac, #fde047, #fb923c, #ef4444)",
                          }}
                        />

                        <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
                          <span>0%</span>
                          <span>25%</span>
                          <span>50%</span>
                          <span>75%</span>
                          <span>100%</span>
                        </div>

                        <div className="mt-3 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                          Optional overlays
                        </div>

                        <label className="mt-2 flex cursor-pointer items-center justify-between rounded-xl bg-purple-50 px-3 py-2">
                          <span className="text-[10px] font-bold text-purple-700">
                            Population affected
                          </span>

                          <input
                            type="checkbox"
                            checked={showPopulationOverlay}
                            onChange={(event) =>
                              setShowPopulationOverlay(event.target.checked)
                            }
                            className="h-4 w-4 cursor-pointer accent-purple-600"
                          />
                        </label>

                        <label className="mt-2 flex cursor-pointer items-center justify-between rounded-xl bg-sky-50 px-3 py-2">
                          <span className="text-[10px] font-bold text-sky-700">
                            Infrastructure assets
                          </span>

                          <input
                            type="checkbox"
                            checked={showInfrastructureAssets}
                            onChange={(event) =>
                              setShowInfrastructureAssets(event.target.checked)
                            }
                            className="h-4 w-4 cursor-pointer accent-sky-600"
                          />
                        </label>

                        <div className="mt-3">
                          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                            Uncertainty
                          </div>

                          <div className="flex items-end gap-2 text-[10px] font-semibold text-neutral-500">
                            <div className="flex flex-1 flex-col gap-1">
                              <div className="border-t border-neutral-200" />
                              <span>Low</span>
                            </div>

                            <div className="flex flex-1 flex-col gap-1">
                              <div className="border-t border-orange-300" />
                              <span>Med</span>
                            </div>

                            <div className="flex flex-1 flex-col gap-1">
                              <div className="border-t-2 border-orange-900" />
                              <span>High</span>
                            </div>
                          </div>
                        </div>

                        <p className="mt-2 text-[10px] leading-snug text-neutral-500">
                          Borders become more visible where the forecast spread
                          is larger.
                        </p>
                      </div>
                    ) : currentActiveLayer === "tas" ? (
                      <div>
                        <div className="mb-2 flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-neutral-800">
                            Near-Surface Air Temp
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            Degrees Celsius (°C)
                          </span>
                        </div>

                        <div
                          className="h-2 w-full rounded-full"
                          style={{
                            background:
                              "linear-gradient(to right, #3b82f6, #eab308, #ef4444)",
                          }}
                        />

                        <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
                          <span>20°C</span>
                          <span>25°C</span>
                          <span>30°C</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-2 flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-neutral-800">
                            Annual Mean Wet-Bulb
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            Degrees Celsius (°C)
                          </span>
                        </div>

                        <div
                          className="h-2 w-full rounded-full"
                          style={{
                            background:
                              "linear-gradient(to right, #10b981, #f59e0b, #ef4444, #d946ef)",
                          }}
                        />

                        <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
                          <span>15°C</span>
                          <span>20°C</span>
                          <span>24°C</span>
                          <span>27°C</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MapCanvas;