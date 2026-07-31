import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { MAPBOX_DEFAULTS } from "../config/mapbox";
import { apiFetch } from "../config/api";
import { DATASET_DEFINITIONS } from "../dataviz/datasetDefinitions";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? "";

export type ClimateLayer = "tas" | "wet_bulb" | "manual_heat_risk" | "sea_level" | "power_gen" | "water_access" | null;

export const BIVARIATE_SOURCE_PREFIX = "bivariate-";
export const BIVARIATE_LAYER_SUFFIX = "-fill";

/** Layer ids of the mutually exclusive thematic layers (arch: exactly one visible). */
export function bivariateSourceId(datasetId: string): string {
  return `${BIVARIATE_SOURCE_PREFIX}${datasetId}`;
}
export function bivariateLayerId(datasetId: string): string {
  return `${BIVARIATE_SOURCE_PREFIX}${datasetId}${BIVARIATE_LAYER_SUFFIX}`;
}
export function isBivariateLayerId(id: string): boolean {
  return id.startsWith(BIVARIATE_SOURCE_PREFIX) && id.endsWith(BIVARIATE_LAYER_SUFFIX);
}

export const THEMATIC_LAYER_IDS = [
  "climate-temp-layer",
  "wet-bulb-temp-layer",
  "sea-level-h3-layer",
  "power-gen-fill-layer",
  "water-access-fill-layer",
  ...DATASET_DEFINITIONS.map((def) => bivariateLayerId(def.id)),
];

/**
 * Build the bivariate fill paint. `interpolate` stays outermost with the
 * `case` nested inside each zoom stop — nesting `["zoom"]` inside `case`
 * throws during addLayer and silently aborts every later layer
 * (architecture.md Risks). Feature-state drives highlight/hover; the class
 * colour travels as the `fill_color` property.
 */
export function buildBivariateFillPaint(): mapboxgl.FillLayerSpecification["paint"] {
  const stateCase = (): mapboxgl.ExpressionSpecification => [
    "case",
    ["boolean", ["feature-state", "highlighted"], false],
    ["get", "highlight_color"],
    ["boolean", ["feature-state", "hovered"], false],
    ["get", "hover_color"],
    ["get", "fill_color"],
  ];
  return {
    "fill-color": [
      "interpolate",
      ["linear"],
      ["zoom"],
      0,
      stateCase(),
      22,
      stateCase(),
    ],
    "fill-opacity": [
      "case",
      ["boolean", ["feature-state", "highlighted"], false],
      0.95,
      ["boolean", ["feature-state", "hovered"], false],
      0.85,
      0.75,
    ],
    "fill-outline-color": "rgba(255, 255, 255, 0.4)",
  };
}

export function useMapbox() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapboxMap, setMapboxMap] = useState<mapboxgl.Map | null>(null);
  const [activeLayer, setActiveLayer] = useState<ClimateLayer>(null);
  const [showGlobalDataset, setShowGlobalDataset] = useState(false);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(
    DATASET_DEFINITIONS[0]?.id ?? null,
  );
  const layersInitializedRef = useRef(false);

  /**
   * Register every custom source and layer. Runs on `style.load` (NOT `load` —
   * which waits for the initial tile set, so a stalled tile silently skipped all
   * registration in v1), with an `isStyleLoaded()` fast path and an idempotence
   * guard (architecture.md Decision 3).
   *
   * Each layer is registered independently: one failing `addLayer` cannot
   * silently abort those after it. The throw is surfaced, not swallowed.
   */
  const setupLayers = (map: mapboxgl.Map) => {
    if (layersInitializedRef.current) return;
    layersInitializedRef.current = true;

    const errors: unknown[] = [];

    const addSourceSafely = (id: string, source: mapboxgl.AnySourceData) => {
      try {
        if (!map.getSource(id)) map.addSource(id, source);
      } catch (err) {
        errors.push(err);
      }
    };

    const addLayerSafely = (layer: mapboxgl.AnyLayer) => {
      try {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      } catch (err) {
        errors.push(err);
      }
    };

    map.setFog(MAPBOX_DEFAULTS.fog);

    // 1. Global temperature overlays (static geojson in public/)
    addSourceSafely("climate-temp", {
      type: "geojson",
      data: "/pacific_islands_tas.geojson",
    });
    addLayerSafely({
      id: "climate-temp-layer",
      type: "fill",
      source: "climate-temp",
      layout: { visibility: "none" },
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

    addSourceSafely("wet-bulb-temp", {
      type: "geojson",
      data: "/pacific_islands_wet_bulb.geojson",
    });
    addLayerSafely({
      id: "wet-bulb-temp-layer",
      type: "fill",
      source: "wet-bulb-temp",
      layout: { visibility: "none" },
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

    // 2. Dynamic API layers (sea level H3, power gen, water access)
    addSourceSafely("sea-level-h3", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    addLayerSafely({
      id: "sea-level-h3-layer",
      type: "fill",
      source: "sea-level-h3",
      layout: { visibility: "none" },
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
        "fill-opacity": 0.65,
        "fill-outline-color": "rgba(255, 255, 255, 0.2)",
      },
    });

    addSourceSafely("power-gen-fill", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    addLayerSafely({
      id: "power-gen-fill-layer",
      type: "fill",
      source: "power-gen-fill",
      layout: { visibility: "none" },
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

    addSourceSafely("water-access-fill", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    addLayerSafely({
      id: "water-access-fill-layer",
      type: "fill",
      source: "water-access-fill",
      layout: { visibility: "none" },
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

    // 3. Bivariate fill layers — one per dataset, `promoteId` = the shared
    // identity contract (feature id == promoteId value == chart record key).
    const fillPaint = buildBivariateFillPaint();
    for (const def of DATASET_DEFINITIONS) {
      addSourceSafely(bivariateSourceId(def.id), {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: def.featureIdKey,
      });
      addLayerSafely({
        id: bivariateLayerId(def.id),
        type: "fill",
        source: bivariateSourceId(def.id),
        layout: { visibility: "none" },
        paint: fillPaint,
      });
    }

    if (errors.length > 0) {
      // Surface the throw loudly rather than swallowing it (retrospective §2.3),
      // but every independent layer above is already registered.
      throw new Error(
        `Map layer registration failed for ${errors.length} source(s)/layer(s): ` +
          errors.map((err) => String(err)).join(" | ")
      );
    }
  };

  useEffect(() => {
    if (!mapboxMap) return;

    const syncVisibility = () => {
      const setVis = (layerId: string, visible: boolean) => {
        if (mapboxMap.getLayer(layerId)) {
          mapboxMap.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
        }
      };

      setVis("climate-temp-layer", activeLayer === "tas" && showGlobalDataset);
      setVis("wet-bulb-temp-layer", activeLayer === "wet_bulb" && showGlobalDataset);
      setVis("sea-level-h3-layer", activeLayer === "sea_level" && !showGlobalDataset);
      setVis("power-gen-fill-layer", activeLayer === "power_gen" && !showGlobalDataset);
      setVis("water-access-fill-layer", activeLayer === "water_access" && !showGlobalDataset);

      // Exactly one bivariate fill layer is visible at any time.
      for (const def of DATASET_DEFINITIONS) {
        setVis(bivariateLayerId(def.id), activeDatasetId === def.id);
      }
    };

    // Layers exist once registered on style.load; setVis no-ops safely when a
    // layer is not (yet) registered. No `isStyleLoaded()` gate: that flag is
    // false while tiles are loading, and `styledata` is not emitted for
    // `source.setData`, so gating here silently skipped visibility syncs.
    syncVisibility();
  }, [activeLayer, showGlobalDataset, activeDatasetId, mapboxMap]);

  useEffect(() => {
    if (mapContainerRef.current && !mapboxMap) {
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAPBOX_DEFAULTS.style,
        center: MAPBOX_DEFAULTS.center,
        zoom: MAPBOX_DEFAULTS.zoom,
        projection: MAPBOX_DEFAULTS.projection,
      });

      const setup = () => {
        try {
          setupLayers(map);
        } catch (err) {
          console.error("Layer registration failed (surfaced loudly):", err);
        }
        setMapboxMap(map);
      };

      if (map.isStyleLoaded()) {
        setup();
      } else {
        map.once("style.load", setup);
      }

      // Expose the map for browser-context verification (tests assert against
      // map state, not React state — retrospective §2.1).
      (window as any).__mapboxMap = map;

      return () => {
        if ((window as any).__mapboxMap === map) {
          delete (window as any).__mapboxMap;
        }
        map.remove();
        setMapboxMap(null);
        layersInitializedRef.current = false;
      };
    }
  }, []);

  // Fetch dynamic layer data from API and populate Mapbox GeoJSON sources on load
  useEffect(() => {
    if (!mapboxMap) return;

    const loadDynamicLayers = async () => {
      try {
        const [seaLevelRes, powerGenRes, waterAccessRes] = await Promise.all([
          apiFetch("/api/layers/sea_level").then((r) => r.json()),
          apiFetch("/api/layers/power_gen").then((r) => r.json()),
          apiFetch("/api/layers/water_access").then((r) => r.json()),
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
    activeDatasetId,
    setActiveDatasetId,
  };
}
