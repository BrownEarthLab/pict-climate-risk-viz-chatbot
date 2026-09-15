import { getApiUrl } from "../config/api";

export interface ClimateIndexParams {
  countryId?: string;
  variable?: string;
  metric?: string;
  scenario?: string;
  timeWindow?: string;
  year: number;
  h3Resolution?: number;
  layerMode?: "ensemble" | "model";
  model?: string;
  adminLevel?: string;
  adminId?: string;
  adminName?: string;
}

export interface ClimateIndexLayer extends GeoJSON.FeatureCollection {
  metadata?: Record<string, unknown>;
  api_metadata?: Record<string, unknown>;
  error?: string;
}

export async function fetchClimateIndexLayer({
  countryId = "fji",
  variable = "tasmax",
  metric = "tx90p",
  scenario = "ssp585",
  timeWindow = "yearly",
  year,
  h3Resolution = 6,
  layerMode = "ensemble",
  model,
  adminLevel,
  adminId,
  adminName,
}: ClimateIndexParams): Promise<ClimateIndexLayer> {
  const params = new URLSearchParams({
    country_id: countryId,
    variable,
    metric,
    scenario,
    time_window: timeWindow,
    year: String(year),
    h3_resolution: String(h3Resolution),
    layer_mode: layerMode,
  });

  if (model) {
    params.set("model", model);
  }

  if (adminLevel && adminId) {
    params.set("admin_level", adminLevel);
    params.set("admin_id", adminId);
  }

  if (adminName) {
    params.set("admin_name", adminName);
  }

  const response = await fetch(getApiUrl(`/api/climate-index?${params}`));

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Climate index request failed: HTTP ${response.status}. ${errorText.slice(
        0,
        280,
      )}`,
    );
  }

  return (await response.json()) as ClimateIndexLayer;
}
