import { useState, useCallback } from "react";
import { getApiUrl } from "../config/api";

export function useSpatialQuery() {
  const [drawnGeometry, setDrawnGeometry] = useState<GeoJSON.Geometry | null>(null);
  const [highlightedFeatures, setHighlightedFeatures] = useState<GeoJSON.Feature[] | null>(null);
  const [queryResults, setQueryResults] = useState<GeoJSON.Feature[] | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  const runSpatialQuery = useCallback(async (geometry: GeoJSON.Geometry, activeLayers: Record<string, boolean>) => {
    setDrawnGeometry(geometry);
    if (!geometry) {
      setHighlightedFeatures(null);
      setQueryResults(null);
      return;
    }

    const selectedLayers = Object.keys(activeLayers).filter(k => activeLayers[k]);
    if (selectedLayers.length === 0) return;

    setIsQuerying(true);
    try {
      const res = await fetch(getApiUrl("/api/spatial-query"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drawn_boundary: geometry, target_layers: selectedLayers }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const features = data.features || [];
      setQueryResults(features);
      setHighlightedFeatures(features);
    } catch (err) {
      console.error("Spatial query failed:", err);
      setQueryResults(null);
      setHighlightedFeatures(null);
    } finally {
      setIsQuerying(false);
    }
  }, []);

  const clearSpatialQuery = useCallback(() => {
    setDrawnGeometry(null);
    setHighlightedFeatures(null);
    setQueryResults(null);
  }, []);

  return {
    drawnGeometry,
    highlightedFeatures,
    queryResults,
    isQuerying,
    runSpatialQuery,
    clearSpatialQuery,
    setDrawnGeometry,
    setHighlightedFeatures,
  };
}
