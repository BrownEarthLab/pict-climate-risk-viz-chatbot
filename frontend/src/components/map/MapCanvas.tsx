import { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { useMapbox } from "../../hooks/useMapbox";
import SearchBar from "./SearchBar";
import DrawControls from "./DrawControls";
import FeatureHighlighter from "./FeatureHighlighter";
import SpatialQueryPanel from "./SpatialQueryPanel";
import MapControls from "./MapControls";

interface MapCanvasProps {
  onDrawGeometry: (geometry: GeoJSON.Geometry | null) => void;
  drawnGeometry: GeoJSON.Geometry | null;
  runSpatialQuery: (
    geometry: GeoJSON.Geometry,
    activeLayers: Record<string, boolean>,
    analysisType?: string
  ) => Promise<void>;
  highlightedFeatures: GeoJSON.Feature[] | null;
  isDrawMode: boolean;
  setIsDrawMode: (mode: boolean) => void;
}

function getGeometryCenter(geometry: GeoJSON.Geometry): [number, number] {
  if (geometry.type === "Point") {
    return geometry.coordinates as [number, number];
  } else if (geometry.type === "LineString") {
    const coords = geometry.coordinates;
    const mid = Math.floor(coords.length / 2);
    return coords[mid] as [number, number];
  } else if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0];
    let sumLng = 0;
    let sumLat = 0;
    const count = ring.length - 1;
    if (count <= 0) return [0, 0];
    for (let i = 0; i < count; i++) {
      sumLng += ring[i][0];
      sumLat += ring[i][1];
    }
    return [sumLng / count, sumLat / count];
  } else if (geometry.type === "MultiPolygon") {
    const ring = geometry.coordinates[0][0];
    let sumLng = 0;
    let sumLat = 0;
    const count = ring.length - 1;
    if (count <= 0) return [0, 0];
    for (let i = 0; i < count; i++) {
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
  highlightedFeatures,
  isDrawMode,
  setIsDrawMode,
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
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null);

  // Hover tooltip for dynamic layers
  useEffect(() => {
    if (!mapboxMap) return;

    const dynamicLayers = [
      "sea-level-h3-layer",
      "power-gen-fill-layer",
      "water-access-fill-layer",
    ];

    const handleMouseMove = (e: mapboxgl.MapMouseEvent) => {
      // Check each dynamic layer for features
      for (const layerId of dynamicLayers) {
        if (!mapboxMap.getLayer(layerId)) continue;
        const features = mapboxMap.queryRenderedFeatures(e.point, {
          layers: [layerId],
        });
        if (features.length > 0) {
          const feature = features[0];
          const props = feature.properties || {};
          const layerName = props.layer_name || layerId;
          const indicatorValue = props.indicator_value;
          const regionName = props.name || props.geo_pict || "Unknown";

          let tooltipContent = `<strong>${regionName}</strong>`;
          if (indicatorValue !== undefined && indicatorValue !== null) {
            let unit = "";
            if (layerId === "sea-level-h3-layer") unit = "m";
            else if (layerId === "water-access-fill-layer") unit = "%";
            else if (layerId === "power-gen-fill-layer") unit = " GWh";
            tooltipContent += `<br/>Value: ${Number(indicatorValue).toFixed(3)}${unit}`;
          }
          tooltipContent += `<br/><span style="font-size:10px;color:#888;">${layerName}</span>`;

          mapboxMap.getCanvas().style.cursor = "pointer";

          if (hoverPopupRef.current) {
            hoverPopupRef.current.remove();
          }
          hoverPopupRef.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 10,
            maxWidth: "220px",
          })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family:sans-serif;font-size:12px;padding:4px 6px;line-height:1.4;">${tooltipContent}</div>`
            )
            .addTo(mapboxMap);
          return;
        }
      }

      // No feature found — remove hover popup
      mapboxMap.getCanvas().style.cursor = "";
      if (hoverPopupRef.current) {
        hoverPopupRef.current.remove();
        hoverPopupRef.current = null;
      }
    };

    mapboxMap.on("mousemove", handleMouseMove);
    return () => {
      mapboxMap.off("mousemove", handleMouseMove);
      if (hoverPopupRef.current) {
        hoverPopupRef.current.remove();
      }
    };
  }, [mapboxMap]);

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

    // Create container for popup content
    const container = document.createElement("div");
    container.className = "p-2 text-neutral-900 font-sans";
    container.innerHTML = `
      <p class="text-xs font-bold mb-2 text-neutral-700">Select Manual Analysis:</p>
      <div class="flex flex-col gap-1.5">
        <button id="btn-temp-stats" class="w-full bg-neutral-950 text-white rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer hover:bg-neutral-800 transition">
          Calculate Air Temp Stats
        </button>
        <button id="btn-heat-stress" class="w-full bg-blue-600 text-white rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer hover:bg-blue-700 transition">
          Get Mean Wet-Bulb Temp
        </button>
      </div>
    `;

    // Remove existing popup if any
    if (popupRef.current) {
      popupRef.current.remove();
    }

    const popup = new mapboxgl.Popup({ closeOnClick: false, closeButton: true })
      .setLngLat(center)
      .setDOMContent(container)
      .addTo(mapboxMap);

    popupRef.current = popup;

    const handleTempStats = () => {
      setActiveLayer("tas");
      setShowGlobalDataset(false);
      runSpatialQuery(drawnGeometry, { "Near-Surface Air Temp (TAS)": true }, "zonal_stats");
      popup.remove();
    };

    const handleHeatStress = () => {
      setActiveLayer("wet_bulb");
      setShowGlobalDataset(false);
      runSpatialQuery(drawnGeometry, { "Annual Mean Wet-Bulb (WBT)": true }, "heat_stress");
      popup.remove();
    };

    const tempBtn = container.querySelector("#btn-temp-stats");
    const heatBtn = container.querySelector("#btn-heat-stress");

    tempBtn?.addEventListener("click", handleTempStats);
    heatBtn?.addEventListener("click", handleHeatStress);

    return () => {
      tempBtn?.removeEventListener("click", handleTempStats);
      heatBtn?.removeEventListener("click", handleHeatStress);
      popup.remove();
      if (popupRef.current === popup) {
        popupRef.current = null;
      }
    };
  }, [mapboxMap, drawnGeometry, runSpatialQuery]);

  useEffect(() => {
    if (!mapboxMap) return;

    const handleWorkflowComplete = (e: CustomEvent) => {
      const { center, zoom } = e.detail;
      if (center) {
        mapboxMap.flyTo({
          center: center as [number, number],
          zoom: zoom || 8,
          essential: true,
          duration: 2500,
        });
      }
    };

    window.addEventListener("workflow-complete" as any, handleWorkflowComplete);
    return () => {
      window.removeEventListener("workflow-complete" as any, handleWorkflowComplete);
    };
  }, [mapboxMap]);

  // Helper to toggle a layer on (off if already active)
  const toggleLayer = (layer: typeof activeLayer, isGlobal: boolean) => {
    if (activeLayer !== layer) {
      setActiveLayer(layer);
      setShowGlobalDataset(isGlobal);
    } else if (showGlobalDataset === isGlobal) {
      setActiveLayer(null);
    } else {
      setShowGlobalDataset(isGlobal);
    }
  };

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
          <FeatureHighlighter mapboxMap={mapboxMap} highlightedFeatures={highlightedFeatures} />
          <SpatialQueryPanel highlightedFeatures={highlightedFeatures} />
          <MapControls map={mapboxMap} />

          {/* Premium Floating Layer Selector & Legend */}
          <div className="absolute bottom-16 left-4 z-20 w-[260px] rounded-2xl border border-black/5 bg-white/90 p-4 shadow-lg backdrop-blur-md transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Map Layers
              </span>
              <button
                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 cursor-pointer"
              >
                {isLegendExpanded ? "Collapse" : "Expand"}
              </button>
            </div>

            {isLegendExpanded && (
              <div className="mt-3 flex flex-col gap-3">
                {/* Static Layers Group */}
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1 block">
                    Climate Projections
                  </span>
                  <div className="flex rounded-xl bg-neutral-100 p-0.5">
                    <button
                      onClick={() => toggleLayer("tas", true)}
                      className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition ${activeLayer === "tas"
                          ? `bg-white shadow-sm ${showGlobalDataset ? "text-neutral-950 font-bold" : "text-neutral-500 font-medium opacity-75"}`
                          : "text-neutral-500 hover:text-neutral-900"
                        }`}
                    >
                      Air Temp
                    </button>
                    <button
                      onClick={() => toggleLayer("wet_bulb", true)}
                      className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition ${activeLayer === "wet_bulb"
                          ? `bg-white shadow-sm ${showGlobalDataset ? "text-neutral-950 font-bold" : "text-neutral-500 font-medium opacity-75"}`
                          : "text-neutral-500 hover:text-neutral-900"
                        }`}
                    >
                      Wet-Bulb
                    </button>
                  </div>
                </div>

                {/* Dynamic Layers Group */}
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1 block">
                    Dynamic Datasets
                  </span>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => toggleLayer("sea_level", false)}
                      className={`w-full text-left px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition ${activeLayer === "sea_level" && !showGlobalDataset
                          ? "bg-white shadow-sm text-neutral-950 font-bold"
                          : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
                        }`}
                    >
                      Sea Level Rise (H3)
                    </button>
                    <button
                      onClick={() => toggleLayer("power_gen", false)}
                      className={`w-full text-left px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition ${activeLayer === "power_gen" && !showGlobalDataset
                          ? "bg-white shadow-sm text-neutral-950 font-bold"
                          : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
                        }`}
                    >
                      Power Gen (GWh)
                    </button>
                    <button
                      onClick={() => toggleLayer("water_access", false)}
                      className={`w-full text-left px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition ${activeLayer === "water_access" && !showGlobalDataset
                          ? "bg-white shadow-sm text-neutral-950 font-bold"
                          : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
                        }`}
                    >
                      Water Access
                    </button>
                  </div>
                </div>

                {/* Legend Display */}
                {activeLayer && (
                  <div className="border-t border-neutral-100 pt-3">
                    <div className="mb-2 flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-neutral-800">
                        {activeLayer === "tas"
                          ? "Near-Surface Air Temp"
                          : activeLayer === "wet_bulb"
                            ? "Annual Mean Wet-Bulb"
                            : activeLayer === "sea_level"
                              ? "Sea Level Anomaly"
                              : activeLayer === "power_gen"
                                ? "Power Generation (GWh)"
                                : activeLayer === "water_access"
                                  ? "Safe Water Access"
                                  : ""}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {activeLayer === "tas" || activeLayer === "wet_bulb"
                          ? "Degrees Celsius (°C)"
                          : activeLayer === "sea_level"
                            ? "Meters (m)"
                            : activeLayer === "power_gen"
                              ? "Gigawatt-hours (GWh)"
                              : activeLayer === "water_access"
                                ? "Percentage (%)"
                                : ""}
                      </span>
                    </div>

                    {activeLayer === "tas" && (
                      <div>
                        <div
                          className="h-2 w-full rounded-full"
                          style={{
                            background: "linear-gradient(to right, #3b82f6, #eab308, #ef4444)",
                          }}
                        />
                        <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
                          <span>20°C</span>
                          <span>25°C</span>
                          <span>30°C</span>
                        </div>
                      </div>
                    )}

                    {activeLayer === "wet_bulb" && (
                      <div>
                        <div
                          className="h-2 w-full rounded-full"
                          style={{
                            background: "linear-gradient(to right, #10b981, #f59e0b, #ef4444, #d946ef)",
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

                    {activeLayer === "sea_level" && (
                      <div>
                        <div
                          className="h-2 w-full rounded-full"
                          style={{
                            background: "linear-gradient(to right, #f0f9ff, #38bdf8, #075985)",
                          }}
                        />
                        <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
                          <span>Low</span>
                          <span>Moderate</span>
                          <span>High</span>
                        </div>
                      </div>
                    )}

                    {activeLayer === "power_gen" && (
                      <div>
                        <div
                          className="h-2 w-full rounded-full"
                          style={{
                            background: "linear-gradient(to right, #fff7ed, #fb923c, #7c2d12)",
                          }}
                        />
                        <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
                          <span>Low</span>
                          <span>Medium</span>
                          <span>High (GWh)</span>
                        </div>
                      </div>
                    )}

                    {activeLayer === "water_access" && (
                      <div>
                        <div
                          className="h-2 w-full rounded-full"
                          style={{
                            background: "linear-gradient(to right, #fee2e2, #fbbf24, #22c55e)",
                          }}
                        />
                        <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
                          <span>0%</span>
                          <span>50%</span>
                          <span>100%</span>
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
