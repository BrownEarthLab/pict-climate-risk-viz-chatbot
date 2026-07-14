import { useCallback, useState } from "react";
import { getApiUrl } from "../config/api";

export interface SpatialQueryRequestOptions {
  threshold?: number;
  risk_metric?: string;
  asset_types?: string[];
  comparison_operator?: string;
  return_layers?: {
    risk_grid?: boolean;
    sampled_assets?: boolean;
    ranked_assets?: boolean;
  };
}

export interface SpatialQueryMetadata {
  analysis_type?: string;
  risk_metric?: string;
  threshold?: number;
  comparison_operator?: string;
  summary?: Record<string, unknown>;
  warnings?: string[];
  provenance?: {
    method?: string;
    data_sources?: string[];
    wrapper_chain?: string[];
  };
  [key: string]: unknown;
}

export function useSpatialQuery() {
  const [drawnGeometry, setDrawnGeometry] =
    useState<GeoJSON.Geometry | null>(null);
  const [highlightedFeatures, setHighlightedFeatures] =
    useState<GeoJSON.Feature[] | null>(null);
  const [queryResults, setQueryResults] =
    useState<GeoJSON.Feature[] | null>(null);
  const [queryMetadata, setQueryMetadata] =
    useState<SpatialQueryMetadata | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  const runSpatialQuery = useCallback(
    async (
      geometry: GeoJSON.Geometry,
      activeLayers: Record<string, boolean>,
      analysisType?: string,
      requestOptions: SpatialQueryRequestOptions = {}
    ) => {
      setDrawnGeometry(geometry);

      if (!geometry) {
        setHighlightedFeatures(null);
        setQueryResults(null);
        setQueryMetadata(null);
        return;
      }

      const selectedLayers = Object.keys(activeLayers).filter(
        (key) => activeLayers[key]
      );

      if (selectedLayers.length === 0) {
        return;
      }

      setIsQuerying(true);

      try {
        const res = await fetch(getApiUrl("/api/spatial-query"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            drawn_boundary: geometry,
            target_layers: selectedLayers,
            analysis_type: analysisType,
            ...requestOptions,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const features = data.features || [];

        setQueryResults(features);
        setHighlightedFeatures(features);
        setQueryMetadata(data.metadata || null);
      } catch (err) {
        console.error("Spatial query failed:", err);
        setQueryResults(null);
        setHighlightedFeatures(null);
        setQueryMetadata(null);
      } finally {
        setIsQuerying(false);
      }
    },
    []
  );

  const clearSpatialQuery = useCallback(() => {
    setDrawnGeometry(null);
    setHighlightedFeatures(null);
    setQueryResults(null);
    setQueryMetadata(null);
  }, []);

  return {
    drawnGeometry,
    highlightedFeatures,
    queryResults,
    queryMetadata,
    isQuerying,
    runSpatialQuery,
    clearSpatialQuery,
    setDrawnGeometry,
    setHighlightedFeatures,
  };
}