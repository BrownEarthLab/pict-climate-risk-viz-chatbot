import { useCallback, useState } from "react";
import { getApiUrl } from "../config/api";

export interface SpatialQueryRequestOptions {
  request_mode?: "geometry" | "admin";
  mode?: "geometry" | "admin";

  country_id?: string;
  country_name?: string;

  admin_level?: string;
  admin_id?: string;
  admin_name?: string;
  h3_resolution?: number;

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

export interface AssetHeatRiskRequestOptions {
  request_mode?: "geometry" | "admin";
  mode?: "geometry" | "admin";

  drawn_boundary?: GeoJSON.Geometry;
  country_id?: string;
  country_name?: string;

  admin_level?: string;
  admin_id?: string;
  admin_name?: string;

  asset_query?: string;
  asset_id?: string;
  asset_types?: string[] | null;

  threshold?: number;
  comparison_operator?: string;
  h3_resolution?: number;
  buffer_km?: number;
  include_population?: boolean;
}

export interface AssetLookupOption {
  asset_id: string;
  asset_name: string;
  asset_type: string;
  osm_type?: string;
  osm_id?: string | number;
  coordinates?: [number, number] | number[];
}

export interface AdminAssetLookupRequestOptions {
  request_mode?: "geometry" | "admin";
  mode?: "geometry" | "admin";

  drawn_boundary?: GeoJSON.Geometry;
  country_id?: string;
  country_name?: string;

  admin_level?: string;
  admin_id?: string;
  admin_name?: string;
  asset_types?: string[] | null;
}

interface AdminAssetLookupResponse {
  assets?: AssetLookupOption[];
  metadata?: {
    analysis_type?: string;
    request_mode?: string;
    admin_level?: string | null;
    admin_id?: string | null;
    admin_name?: string | null;
    asset_count?: number;
    asset_type_counts?: Record<string, number>;
    placeholder_asset_name?: string | null;
    warnings?: string[];
  };
  error?: string;
}

export interface SpatialQueryMetadata {
  analysis_type?: string;
  risk_metric?: string;
  threshold?: number;
  comparison_operator?: string;

  request_mode?: "geometry" | "admin" | string;
  mode?: "geometry" | "admin" | string;

  country_id?: string | null;
  country_name?: string | null;

  admin_level?: string | null;
  admin_id?: string | null;
  admin_name?: string | null;
  boundary_source?: string | null;

  spatial_unit?: string;
  requested_h3_resolution?: number | null;
  h3_resolution?: number | null;

  h3_cell_count?: number | null;
  grid_cell_count?: number | null;

  high_risk_cell_count?: number | null;
  very_high_risk_cell_count?: number | null;
  high_spread_cell_count?: number | null;
  high_risk_high_spread_cell_count?: number | null;

  high_exposure_cell_count?: number | null;
  high_exposure_high_spread_cell_count?: number | null;
  high_uncertainty_cell_count?: number | null;
  high_exposure_high_uncertainty_cell_count?: number | null;

  mean_exposure_probability?: number | null;
  max_exposure_probability?: number | null;

  mean_heat?: number | null;
  max_heat?: number | null;

  mean_forecast_spread?: number | null;
  max_forecast_spread?: number | null;
  mean_normalized_forecast_spread?: number | null;

  total_population?: number | null;
  expected_exposed_population?: number | null;
  total_expected_exposed_population?: number | null;
  population_exposure_percent?: number | null;
  population_cache_hit_count?: number | null;
  population_cache_miss_count?: number | null;

  include_population?: boolean;
  include_assets?: boolean;

  asset_query?: string | null;
  buffer_km?: number | null;
  match_score?: number | null;
  matched_asset?: {
    asset_id?: string;
    asset_name?: string;
    asset_type?: string;
    osm_type?: string;
    osm_id?: string | number;
    coordinates?: [number, number] | number[];
    exposure_probability?: number | null;
    heat_mean?: number | null;
    heat_p10?: number | null;
    heat_p90?: number | null;
    forecast_spread?: number | null;
    normalized_forecast_spread?: number | null;
    exposed_to_hazard?: boolean;
    source_h3_index?: string | null;
  } | null;
  candidate_matches?: Array<{
    asset_id?: string;
    asset_name?: string;
    asset_type?: string;
    score?: number;
  }>;

  summary?: Record<string, unknown> | null;

  warnings?: string[];

  provenance?: {
    method?: string;
    data_sources?: string[];
    wrapper_chain?: string[];
  };

  exported_layer?: string;
  exported_feature_count?: number;

  [key: string]: unknown;
}

interface SpatialQueryResponse {
  type?: string;
  features?: GeoJSON.Feature[];
  metadata?: SpatialQueryMetadata;
  error?: string;
}

export function useSpatialQuery() {
  const [drawnGeometry, setDrawnGeometry] = useState<GeoJSON.Geometry | null>(
    null,
  );
  const [highlightedFeatures, setHighlightedFeatures] = useState<
    GeoJSON.Feature[] | null
  >(null);
  const [queryResults, setQueryResults] = useState<GeoJSON.Feature[] | null>(
    null,
  );
  const [queryMetadata, setQueryMetadata] =
    useState<SpatialQueryMetadata | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  const runSpatialQuery = useCallback(
    async (
      geometry: GeoJSON.Geometry,
      activeLayers: Record<string, boolean>,
      analysisType?: string,
      requestOptions: SpatialQueryRequestOptions = {},
    ) => {
      if (!geometry) {
        setDrawnGeometry(null);
        setHighlightedFeatures(null);
        setQueryResults(null);
        setQueryMetadata(null);
        return;
      }

      const selectedLayers = Object.keys(activeLayers).filter(
        (key) => activeLayers[key],
      );

      if (selectedLayers.length === 0) {
        return;
      }

      const requestMode =
        requestOptions.request_mode ?? requestOptions.mode ?? "geometry";

      if (requestMode === "geometry") {
        setDrawnGeometry(geometry);
      } else {
        setDrawnGeometry(null);
      }

      setIsQuerying(true);

      try {
        const response = await fetch(getApiUrl("/api/spatial-query"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            drawn_boundary: geometry,
            target_layers: selectedLayers,
            analysis_type: analysisType,
            request_mode: requestMode,
            mode: requestMode,
            ...requestOptions,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as SpatialQueryResponse;
        const features = data.features || [];

        setQueryResults(features);
        setHighlightedFeatures(features);
        setQueryMetadata(data.metadata || null);
      } catch (error) {
        console.error("Spatial query failed:", error);

        setQueryResults(null);
        setHighlightedFeatures(null);
        setQueryMetadata({
          analysis_type: analysisType ?? "spatial_query",
          warnings: [error instanceof Error ? error.message : String(error)],
        });
      } finally {
        setIsQuerying(false);
      }
    },
    [],
  );

  const runAssetHeatRiskQuery = useCallback(
    async (requestOptions: AssetHeatRiskRequestOptions) => {
      const assetQuery = requestOptions.asset_query?.trim() ?? "";
      const assetId = requestOptions.asset_id?.trim() ?? "";

      if (!assetQuery && !assetId) {
        return;
      }

      const requestMode =
        requestOptions.request_mode ?? requestOptions.mode ?? "admin";

      if (requestMode === "geometry" && requestOptions.drawn_boundary) {
        setDrawnGeometry(requestOptions.drawn_boundary);
      } else {
        setDrawnGeometry(null);
      }

      setIsQuerying(true);

      try {
        const response = await fetch(getApiUrl("/api/asset-heat-risk"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threshold: 22,
            comparison_operator: ">=",
            h3_resolution: 7,
            buffer_km: 5,
            include_population: true,
            ...requestOptions,
            asset_query: assetQuery || requestOptions.asset_query,
            asset_id: assetId || requestOptions.asset_id,
            request_mode: requestMode,
            mode: requestMode,
          }),
        });

        const data = (await response.json()) as SpatialQueryResponse;

        if (!response.ok) {
          const message =
            data.error ||
            data.metadata?.warnings?.[0] ||
            `HTTP ${response.status}`;

          throw new Error(message);
        }

        const features = data.features || [];

        setQueryResults(features);
        setHighlightedFeatures(features);
        setQueryMetadata(data.metadata || null);
      } catch (error) {
        console.error("Asset heat-risk query failed:", error);

        setQueryResults(null);
        setHighlightedFeatures(null);
        setQueryMetadata({
          analysis_type: "asset_heat_risk",
          asset_query: assetQuery || requestOptions.asset_query || assetId,
          asset_id: assetId || requestOptions.asset_id,
          request_mode: requestMode,
          country_id: requestOptions.country_id ?? null,
          country_name: requestOptions.country_name ?? null,
          admin_level: requestOptions.admin_level ?? null,
          admin_id: requestOptions.admin_id ?? null,
          admin_name: requestOptions.admin_name ?? null,
          warnings: [error instanceof Error ? error.message : String(error)],
        });
      } finally {
        setIsQuerying(false);
      }
    },
    [],
  );

  const fetchAdminAssets = useCallback(
    async (
      requestOptions: AdminAssetLookupRequestOptions,
    ): Promise<AssetLookupOption[]> => {
      const requestMode =
        requestOptions.request_mode ?? requestOptions.mode ?? "admin";

      const response = await fetch(getApiUrl("/api/admin-assets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_types: [
            "hospital",
            "school",
            "port",
            "power_substation",
            "critical_facility",
          ],
          ...requestOptions,
          request_mode: requestMode,
          mode: requestMode,
        }),
      });

      const data = (await response.json()) as AdminAssetLookupResponse;

      if (!response.ok) {
        const message =
          data.error ||
          data.metadata?.warnings?.[0] ||
          `HTTP ${response.status}`;

        throw new Error(message);
      }

      return data.assets || [];
    },
    [],
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
    runAssetHeatRiskQuery,
    fetchAdminAssets,
    clearSpatialQuery,
    setDrawnGeometry,
    setHighlightedFeatures,
  };
}