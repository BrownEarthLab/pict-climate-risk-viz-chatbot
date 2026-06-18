import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { MAPBOX_DEFAULTS } from "../config/mapbox";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? "";

export type ClimateLayer = "tas" | "wet_bulb" | null;

export function useMapbox() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapboxMap, setMapboxMap] = useState<mapboxgl.Map | null>(null);
  const [activeLayer, setActiveLayer] = useState<ClimateLayer>(null);
  const [showGlobalDataset, setShowGlobalDataset] = useState(false);

  // Keep layer visibility in sync with activeLayer and showGlobalDataset states
  useEffect(() => {
    if (!mapboxMap) return;

    // Wait until style is loaded before modifying visibility
    if (mapboxMap.isStyleLoaded()) {
      if (mapboxMap.getLayer("climate-temp-layer")) {
        mapboxMap.setLayoutProperty(
          "climate-temp-layer",
          "visibility",
          activeLayer === "tas" && showGlobalDataset ? "visible" : "none"
        );
      }
      if (mapboxMap.getLayer("wet-bulb-temp-layer")) {
        mapboxMap.setLayoutProperty(
          "wet-bulb-temp-layer",
          "visibility",
          activeLayer === "wet_bulb" && showGlobalDataset ? "visible" : "none"
        );
      }
    } else {
      const handleStyleLoad = () => {
        if (mapboxMap.getLayer("climate-temp-layer")) {
          mapboxMap.setLayoutProperty(
            "climate-temp-layer",
            "visibility",
            activeLayer === "tas" && showGlobalDataset ? "visible" : "none"
          );
        }
        if (mapboxMap.getLayer("wet-bulb-temp-layer")) {
          mapboxMap.setLayoutProperty(
            "wet-bulb-temp-layer",
            "visibility",
            activeLayer === "wet_bulb" && showGlobalDataset ? "visible" : "none"
          );
        }
      };
      mapboxMap.on("styledata", handleStyleLoad);
      return () => {
        mapboxMap.off("styledata", handleStyleLoad);
      };
    }
  }, [activeLayer, showGlobalDataset, mapboxMap]);

  useEffect(() => {
    if (mapContainerRef.current && !mapboxMap) {
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAPBOX_DEFAULTS.style,
        center: MAPBOX_DEFAULTS.center,
        zoom: MAPBOX_DEFAULTS.zoom,
        projection: MAPBOX_DEFAULTS.projection,
      });

      map.on("load", () => {
        map.setFog(MAPBOX_DEFAULTS.fog);

        // 1. Load the local NetCDF-converted temperature GeoJSON (TAS)
        map.addSource("climate-temp", {
          type: "geojson",
          data: "/pacific_islands_tas.geojson",
        });

        // Add fill layer representing the grid cells (raster-style grid squares)
        map.addLayer({
          id: "climate-temp-layer",
          type: "fill",
          source: "climate-temp",
          layout: {
            visibility: "none"
          },
          paint: {
            // Color ramp: Blue (cold) -> Yellow (warm) -> Red (hot)
            "fill-color": [
              "interpolate",
              ["linear"],
              ["get", "temp_c"],
              20, "#3b82f6", // 20C (cool blue)
              25, "#eab308", // 25C (warm yellow)
              30, "#ef4444"  // 30C (hot red)
            ],
            "fill-opacity": 0.6,
            "fill-outline-color": "rgba(255, 255, 255, 0.15)" // Soft grid outlines
          }
        });

        // 2. Load the wet bulb temperature GeoJSON (WBT)
        map.addSource("wet-bulb-temp", {
          type: "geojson",
          data: "/pacific_islands_wet_bulb.geojson",
        });

        map.addLayer({
          id: "wet-bulb-temp-layer",
          type: "fill",
          source: "wet-bulb-temp",
          layout: {
            visibility: "none" // hidden by default
          },
          paint: {
            // Color ramp: Emerald -> Amber -> Red -> Magenta
            "fill-color": [
              "interpolate",
              ["linear"],
              ["get", "wet_bulb_c"],
              15, "#10b981", // 15C (emerald green - Low/Comfortable)
              20, "#f59e0b", // 20C (amber - Moderate stress)
              24, "#ef4444", // 24C (red - High risk)
              27, "#d946ef"  // 27C (magenta - Extreme hazard)
            ],
            "fill-opacity": 0.6,
            "fill-outline-color": "rgba(255, 255, 255, 0.15)"
          }
        });

        setMapboxMap(map);
      });

      return () => {
        map.remove();
        setMapboxMap(null);
      };
    }
  }, []);

  return { 
    mapContainerRef, 
    mapboxMap, 
    activeLayer, 
    setActiveLayer, 
    showGlobalDataset, 
    setShowGlobalDataset 
  };
}
