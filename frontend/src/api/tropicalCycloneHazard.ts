import { getApiUrl } from "../config/api";

export interface TropicalCycloneHazardParams {
  countryId?: string;
  layerId?: string;
  adminLevel?: string;
  adminId?: string;
  adminName?: string;
}

export interface TropicalCycloneHazardLayer extends GeoJSON.FeatureCollection {
  metadata?: Record<string, unknown>;
  api_metadata?: Record<string, unknown>;
  error?: string;
}

export async function fetchTropicalCycloneHazardLayer({
  countryId = "fji",
  layerId = "tc_hazard",
  adminLevel,
  adminId,
  adminName,
}: TropicalCycloneHazardParams = {}): Promise<TropicalCycloneHazardLayer> {
  const params = new URLSearchParams({
    country_id: countryId,
    layer_id: layerId,
  });

  if (adminLevel && adminId) {
    params.set("admin_level", adminLevel);
    params.set("admin_id", adminId);
  }

  if (adminName) {
    params.set("admin_name", adminName);
  }

  const response = await fetch(getApiUrl(`/api/tropical-cyclone-hazard?${params}`));

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Tropical cyclone hazard request failed: HTTP ${response.status}. ${errorText.slice(
        0,
        280,
      )}`,
    );
  }

  return (await response.json()) as TropicalCycloneHazardLayer;
}
