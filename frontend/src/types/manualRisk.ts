export type ManualRiskAnalysisType = "manual_heat_risk";

export type ManualRiskMetric = "heat";

export type ManualRiskAssetType =
  | "hospital"
  | "school"
  | "port"
  | "power_substation"
  | "road"
  | "critical_facility";

export type ManualRiskComparisonOperator =
  | ">"
  | ">="
  | "<"
  | "<="
  | "=="
  | "!=";

export type ManualRiskCategory =
  | "low"
  | "medium"
  | "high"
  | "very_high";

export interface ManualRiskReturnLayers {
  risk_grid: boolean;
  sampled_assets: boolean;
  ranked_assets: boolean;
}

export interface ManualRiskRequest {
  drawn_boundary: GeoJSON.Geometry;
  target_layers: string[];
  analysis_type: ManualRiskAnalysisType;
  risk_metric: ManualRiskMetric;
  asset_types: ManualRiskAssetType[];
  threshold: number;
  comparison_operator: ManualRiskComparisonOperator;
  return_layers: ManualRiskReturnLayers;
}

export interface ManualRiskSummary {
  asset_count: number;
  exposed_asset_count: number;
  unexposed_asset_count: number;
  missing_value_count: number;
  exposure_percent: number | null;
  top_asset: Record<string, unknown> | null;
}

export interface ManualRiskProvenance {
  method: string;
  data_sources: string[];
  wrapper_chain: string[];
}

export interface ManualRiskMetadata {
  analysis_type: ManualRiskAnalysisType;
  risk_metric: ManualRiskMetric;
  threshold: number;
  comparison_operator: ManualRiskComparisonOperator;
  summary: ManualRiskSummary;
  warnings: string[];
  provenance: ManualRiskProvenance;
}

export interface ManualRiskFeatureProperties {
  layer_name: "Manual Heat Risk" | "Manual Heat Risk Assets";
  feature_role: "risk_grid" | "sampled_asset" | "ranked_asset";
  description: string;
  risk_score?: number;
  heat_value?: number;
  risk_category?: ManualRiskCategory;
  asset_name?: string;
  asset_id?: string;
  asset_type?: ManualRiskAssetType | string;
  sampled_hazard_value?: number | null;
  exposed_to_hazard?: boolean;
  exposure_difference?: number | null;
  asset_rank?: number | null;
  asset_rank_score?: number | null;
}

export interface ManualRiskFeatureCollection
  extends GeoJSON.FeatureCollection<
    GeoJSON.Geometry,
    ManualRiskFeatureProperties
  > {
  metadata?: ManualRiskMetadata;
}