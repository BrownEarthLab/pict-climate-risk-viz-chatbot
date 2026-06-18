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
          <div className="absolute bottom-16 left-4 z-20 w-[240px] rounded-2xl border border-black/5 bg-white/90 p-4 shadow-lg backdrop-blur-md transition-all duration-300">
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
                {/* Pill/Tabs Selector */}
                <div className="flex rounded-xl bg-neutral-100 p-0.5">
                  <button
                    onClick={() => {
                      if (activeLayer !== "tas") {
                        setActiveLayer("tas");
                        setShowGlobalDataset(true);
                      } else if (showGlobalDataset) {
                        setShowGlobalDataset(false);
                      } else {
                        setActiveLayer(null);
                      }
                    }}
                    className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition ${
                      activeLayer === "tas"
                        ? `bg-white shadow-sm ${showGlobalDataset ? "text-neutral-950 font-bold" : "text-neutral-500 font-medium opacity-75"}`
                        : "text-neutral-500 hover:text-neutral-900"
                    }`}
                  >
                    Air Temp
                  </button>
                  <button
                    onClick={() => {
                      if (activeLayer !== "wet_bulb") {
                        setActiveLayer("wet_bulb");
                        setShowGlobalDataset(true);
                      } else if (showGlobalDataset) {
                        setShowGlobalDataset(false);
                      } else {
                        setActiveLayer(null);
                      }
                    }}
                    className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition ${
                      activeLayer === "wet_bulb"
                        ? `bg-white shadow-sm ${showGlobalDataset ? "text-neutral-950 font-bold" : "text-neutral-500 font-medium opacity-75"}`
                        : "text-neutral-500 hover:text-neutral-900"
                    }`}
                  >
                    Wet-Bulb
                  </button>
                </div>

                {/* Legend Display */}
                {activeLayer && (
                  <div className="border-t border-neutral-100 pt-3">
                    <div className="mb-2 flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-neutral-800">
                        {activeLayer === "tas" ? "Near-Surface Air Temp" : "Annual Mean Wet-Bulb"}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        Degrees Celsius (°C)
                      </span>
                    </div>

                    {activeLayer === "tas" ? (
                      <div>
                        {/* Gradient Bar for TAS */}
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
                    ) : (
                      <div>
                        {/* Gradient Bar for WBT */}
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
