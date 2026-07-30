import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { MAPBOX_DEFAULTS } from "../config/mapbox";
import { getApiUrl, apiFetch } from "../config/api";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? "";

export type ClimateLayer =
  | "tas"
  | "wet_bulb"
  | "sea_level"
  | "power_gen"
  | "water_access"
  | "chva_facilities"
  | null;

export function useMapbox() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapboxMap, setMapboxMap] = useState<mapboxgl.Map | null>(null);
  const [activeLayer, setActiveLayer] = useState<ClimateLayer>(null);
  const [showGlobalDataset, setShowGlobalDataset] = useState(false);

  // Keep layer visibility in sync with activeLayer and showGlobalDataset states
  useEffect(() => {
    if (!mapboxMap) return;

    const updateLayerVisibility = () => {
      // Static layers
      if (mapboxMap.getLayer("climate-temp-layer")) {
        mapboxMap.setLayoutProperty(
          "climate-temp-layer",
          "visibility",
          activeLayer === "tas" ? "visible" : "none"
        );
      }
      if (mapboxMap.getLayer("wet-bulb-temp-layer")) {
        mapboxMap.setLayoutProperty(
          "wet-bulb-temp-layer",
          "visibility",
          activeLayer === "wet_bulb" ? "visible" : "none"
        );
      }

      // Dynamic layers
      if (mapboxMap.getLayer("sea-level-h3-layer")) {
        mapboxMap.setLayoutProperty(
          "sea-level-h3-layer",
          "visibility",
          activeLayer === "sea_level" ? "visible" : "none"
        );
      }
      if (mapboxMap.getLayer("power-gen-fill-layer")) {
        mapboxMap.setLayoutProperty(
          "power-gen-fill-layer",
          "visibility",
          activeLayer === "power_gen" ? "visible" : "none"
        );
      }
      if (mapboxMap.getLayer("water-access-fill-layer")) {
        mapboxMap.setLayoutProperty(
          "water-access-fill-layer",
          "visibility",
          activeLayer === "water_access" ? "visible" : "none"
        );
      }
      if (mapboxMap.getLayer("chva-facilities-layer")) {
        mapboxMap.setLayoutProperty(
          "chva-facilities-layer",
          "visibility",
          activeLayer === "chva_facilities" ? "visible" : "none"
        );
      }
    };

    if (mapboxMap.isStyleLoaded()) {
      updateLayerVisibility();
    } else {
      const handleStyleLoad = () => updateLayerVisibility();
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

      // Keep a diagnostic handle for browser regression tests and local map
      // debugging. The public hook remains the application-facing API.
      const debugWindow = window as Window & {
        __map?: mapboxgl.Map;
        __mapboxMap?: mapboxgl.Map;
      };
      debugWindow.__map = map;
      debugWindow.__mapboxMap = map;

      setMapboxMap(map);

      let layersInitialized = false;
      const setupLayers = () => {
        if (layersInitialized) return;
        layersInitialized = true;
        map.setFog(MAPBOX_DEFAULTS.fog);

        // 1. Load the local NetCDF-converted temperature GeoJSON (TAS)
        map.addSource("climate-temp", {
          type: "geojson",
          data: "/pacific_islands_tas.geojson",
        });

        map.addLayer({
          id: "climate-temp-layer",
          type: "fill",
          source: "climate-temp",
          layout: {
            visibility: "none",
          },
          paint: {
            "fill-color": [
              "interpolate",
              ["linear"],
              ["get", "temp_c"],
              20, "#3b82f6",
              25, "#eab308",
              30, "#ef4444",
            ],
            "fill-opacity": 0.6,
            "fill-outline-color": "rgba(255, 255, 255, 0.15)",
          },
        });

        // 6. Fiji Climate and Health Vulnerability Assessment facilities.
        map.addSource("chva-facilities", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          promoteId: "facility_id",
        });

        map.addLayer({
          id: "chva-facilities-layer",
          type: "circle",
          source: "chva-facilities",
          layout: {
            visibility: "none",
          },
          paint: {
            // Selected/hovered facilities grow and gain a dark ring so chart
            // brushing is legible against the basemap.
            // "zoom" may only feed a top-level interpolate, so the
            // selection/hover branch lives inside each zoom stop.
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              4, ["case", ["boolean", ["feature-state", "hovered"], false], 6, ["boolean", ["feature-state", "highlighted"], false], 5, 3],
              8, ["case", ["boolean", ["feature-state", "hovered"], false], 9, ["boolean", ["feature-state", "highlighted"], false], 8, 5],
              11, ["case", ["boolean", ["feature-state", "hovered"], false], 12, ["boolean", ["feature-state", "highlighted"], false], 10, 7],
            ],
            "circle-color": [
              "match",
              ["get", "facility_type"],
              "Hospital", "#dc2626",
              "Health Centre", "#f97316",
              "Nursing Station", "#2563eb",
              "#64748b",
            ],
            "circle-opacity": [
              "case",
              ["boolean", ["feature-state", "highlighted"], false],
              1,
              ["boolean", ["feature-state", "hovered"], false],
              1,
              0.92,
            ],
            "circle-stroke-color": [
              "case",
              ["boolean", ["feature-state", "hovered"], false],
              "#0a0a0a",
              ["boolean", ["feature-state", "highlighted"], false],
              "#0a0a0a",
              "#ffffff",
            ],
            "circle-stroke-width": [
              "case",
              ["boolean", ["feature-state", "hovered"], false],
              3,
              ["boolean", ["feature-state", "highlighted"], false],
              2.25,
              1.25,
            ],
          },
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
            visibility: "none",
          },
          paint: {
            "fill-color": [
              "interpolate",
              ["linear"],
              ["get", "wet_bulb_c"],
              15, "#10b981",
              20, "#f59e0b",
              24, "#ef4444",
              27, "#d946ef",
            ],
            "fill-opacity": 0.6,
            "fill-outline-color": "rgba(255, 255, 255, 0.15)",
          },
        });

        // 3. Dynamic Sea Level Rise layer (H3 hexagons) — loaded via API
        map.addSource("sea-level-h3", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          promoteId: "h3_index",
        });

        map.addLayer({
          id: "sea-level-h3-layer",
          type: "fill",
          source: "sea-level-h3",
          layout: {
            visibility: "none",
          },
          paint: {
            "fill-color": [
              "interpolate",
              ["linear"],
              ["get", "indicator_value"],
              0, "#f0f9ff",
              0.1, "#bae6fd",
              0.3, "#38bdf8",
              0.5, "#0284c7",
              0.7, "#075985",
              1.0, "#082f49",
            ],
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "highlighted"], false],
              0.95,
              ["boolean", ["feature-state", "hovered"], false],
              0.85,
              0.65,
            ],
            "fill-outline-color": "rgba(255, 255, 255, 0.4)",
          },
        });

        // 4. Dynamic Power Generation layer (choropleth — annual GWh per country) — loaded via API
        // The PDH Power Gen dataset is tabular (GWh per country/year), not point assets,
        // so it is rendered as a regional choropleth like the Water Access layer.
        map.addSource("power-gen-fill", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "power-gen-fill-layer",
          type: "fill",
          source: "power-gen-fill",
          layout: {
            visibility: "none",
          },
          paint: {
            "fill-color": [
              "interpolate",
              ["linear"],
              ["get", "indicator_value"],
              0, "#fff7ed",
              50, "#fed7aa",
              200, "#fb923c",
              1000, "#ea580c",
              5000, "#7c2d12",
            ],
            "fill-opacity": 0.75,
            "fill-outline-color": "rgba(255, 255, 255, 0.3)",
          },
        });

        // 5. Dynamic Water Access layer (choropleth) — loaded via API
        map.addSource("water-access-fill", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "water-access-fill-layer",
          type: "fill",
          source: "water-access-fill",
          layout: {
            visibility: "none",
          },
          paint: {
            "fill-color": [
              "interpolate",
              ["linear"],
              ["get", "indicator_value"],
              0, "#fee2e2",
              25, "#fecaca",
              50, "#fbbf24",
              75, "#a3e635",
              100, "#22c55e",
            ],
            "fill-opacity": 0.7,
            "fill-outline-color": "rgba(255, 255, 255, 0.3)",
          },
        });

        setMapboxMap(map);
      };

      // `load` waits for the style and initial tile set. A slow or blocked
      // tile can therefore prevent custom sources/layers from ever being
      // registered. `style.load` fires as soon as the style is parsed, which
      // is the point at which sources and layers may safely be added.
      if (map.isStyleLoaded()) setupLayers();
      else map.once("style.load", setupLayers);

      return () => {
        map.off("style.load", setupLayers);
        map.remove();
        if (debugWindow.__map === map) debugWindow.__map = undefined;
        if (debugWindow.__mapboxMap === map) debugWindow.__mapboxMap = undefined;
        setMapboxMap(null);
      };
    }
  }, []);

  // Fetch dynamic layer data from API and populate Mapbox GeoJSON sources on load
  useEffect(() => {
    if (!mapboxMap) return;

    const loadDynamicLayers = async () => {
      try {
        const [seaLevelRes, powerGenRes, waterAccessRes, chvaFacilitiesRes] = await Promise.all([
          apiFetch("/api/layers/sea_level").then((r) => r.json()),
          apiFetch("/api/layers/power_gen").then((r) => r.json()),
          apiFetch("/api/layers/water_access").then((r) => r.json()),
          apiFetch("/api/layers/chva_facilities").then((r) => r.json()),
        ]);

        if (seaLevelRes.status === "available" || seaLevelRes.status === "stale") {
          const source = mapboxMap.getSource("sea-level-h3") as mapboxgl.GeoJSONSource;
          if (source && seaLevelRes.data) {
            source.setData(seaLevelRes.data);
          }
        }

        if (powerGenRes.status === "available" || powerGenRes.status === "stale") {
          const source = mapboxMap.getSource("power-gen-fill") as mapboxgl.GeoJSONSource;
          if (source && powerGenRes.data) {
            source.setData(powerGenRes.data);
          }
        }

        if (waterAccessRes.status === "available" || waterAccessRes.status === "stale") {
          const source = mapboxMap.getSource("water-access-fill") as mapboxgl.GeoJSONSource;
          if (source && waterAccessRes.data) {
            source.setData(waterAccessRes.data);
          }
        }

        if (chvaFacilitiesRes.status === "available") {
          const source = mapboxMap.getSource("chva-facilities") as mapboxgl.GeoJSONSource;
          if (source && chvaFacilitiesRes.data) {
            source.setData(chvaFacilitiesRes.data);
          }
        }
      } catch (err) {
        console.error("Error loading dynamic map layers:", err);
      }
    };

    if (mapboxMap.isStyleLoaded()) {
      loadDynamicLayers();
    } else {
      mapboxMap.once("idle", loadDynamicLayers);
    }
  }, [mapboxMap]);

  // Refetch / load dynamic layer data when the layer is set to active
  useEffect(() => {
    if (!mapboxMap || !activeLayer || showGlobalDataset) return;

    const sourceMap = {
      sea_level: { sourceId: "sea-level-h3", endpoint: "/api/layers/sea_level" },
      power_gen: { sourceId: "power-gen-fill", endpoint: "/api/layers/power_gen" },
      water_access: { sourceId: "water-access-fill", endpoint: "/api/layers/water_access" },
      chva_facilities: { sourceId: "chva-facilities", endpoint: "/api/layers/chva_facilities" },
    };

    const config = sourceMap[activeLayer as keyof typeof sourceMap];
    if (!config) return;

    const source = mapboxMap.getSource(config.sourceId) as mapboxgl.GeoJSONSource;
    if (!source) return;

    apiFetch(config.endpoint)
      .then((res) => res.json())
      .then((json) => {
        if (json.status === "available" || json.status === "stale") {
          if (json.data) {
            source.setData(json.data);
          }
        }
      })
      .catch((err) => console.error(`Error loading dynamic layer ${activeLayer}:`, err));
  }, [activeLayer, showGlobalDataset, mapboxMap]);

  return {
    mapContainerRef,
    mapboxMap,
    activeLayer,
    setActiveLayer,
    showGlobalDataset,
    setShowGlobalDataset,
  };
}
