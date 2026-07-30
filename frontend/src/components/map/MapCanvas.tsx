import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { getApiUrl } from "../../config/api";
import { useMapbox } from "../../hooks/useMapbox";
import FeatureHighlighter from "./FeatureHighlighter";
import SpatialQueryPanel from "./SpatialQueryPanel";
import MapControls from "./MapControls";
import { StorytellerDeck } from "../story/StorytellerDeck";
import { LinkedRiskCharts } from "./LinkedRiskCharts";
import { useBrushingState } from "../../state/useBrushingState";
import type {
  AdminAssetLookupRequestOptions,
  AssetHeatRiskRequestOptions,
  AssetLookupOption,
  SpatialQueryMetadata,
} from "../../hooks/useSpatialQuery";

interface SpatialQueryRequestOptions {
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

interface MapCanvasProps {
  onDrawGeometry: (geometry: GeoJSON.Geometry | null) => void;
  drawnGeometry: GeoJSON.Geometry | null;
  runSpatialQuery: (
    geometry: GeoJSON.Geometry,
    activeLayers: Record<string, boolean>,
    analysisType?: string,
    requestOptions?: SpatialQueryRequestOptions,
  ) => Promise<void>;
  runAssetHeatRiskQuery: (
    requestOptions: AssetHeatRiskRequestOptions,
  ) => Promise<void>;
  fetchAdminAssets: (
    requestOptions: AdminAssetLookupRequestOptions,
  ) => Promise<AssetLookupOption[]>;
  clearSpatialQuery: () => void;
  highlightedFeatures: GeoJSON.Feature[] | null;
  queryMetadata: SpatialQueryMetadata | null;
  isDrawMode: boolean;
  setIsDrawMode: (mode: boolean) => void;
  isQuerying: boolean;
}

interface RegionSummary {
  country_id: string;
  country_iso3?: string;
  country_name: string;
  available_admin_levels: string[];
  population?: {
    status?: string;
    path?: string | null;
  };
  assets?: {
    status?: string;
    asset_count?: number | null;
  };
}

interface RegionsResponse {
  countries?: RegionSummary[];
  error?: string;
}

interface AdminBoundaryResponse extends GeoJSON.FeatureCollection {
  metadata?: {
    country_id?: string;
    admin_level?: string;
    normalized_admin_level?: string;
    feature_count?: number;
    source_path?: string;
  };
  error?: string;
}

interface SelectedAdminArea {
  countryId: string;
  countryName: string;
  adminId: string;
  adminName: string;
  adminLevel: string;
  displayAdminLevel: string;
  geometry: GeoJSON.Geometry;
}

interface AdminBoundaryConfig {
  countryId: string;
  countryName: string;
  adminLevel: string;
  cacheKey: string;
  title: string;
  unitLabel: string;
  unitLabelLower: string;
  unitPluralLower: string;
  apiPath: string;
}

type MapLayer = "tas" | "wet_bulb" | "manual_heat_risk" | "sea_level" | "power_gen" | "water_access" | null;
type HeatDisplayMode = "combined" | "risk" | "uncertainty";

type BoundaryLoadStatus =
  | "idle"
  | "waiting_for_map"
  | "fetching_regions"
  | "fetching"
  | "downloading"
  | "parsing"
  | "adding_layers"
  | "ready"
  | "error";

interface BoundaryLoadState {
  status: BoundaryLoadStatus;
  message: string;
  percent: number;
  featureCount?: number;
  error?: string;
}

interface AnalysisSettings {
  defaultCountryId: string;
  defaultAdminLevel: string;
  heatThreshold: number;
  h3Resolution: number;
  assetBufferKm: number;
  heatDisplayMode: HeatDisplayMode;
  showPopulationOverlay: boolean;
  showInfrastructureAssets: boolean;
}

const analysisSettingsStorageKey = "pict-analysis-settings-v2";

const defaultAnalysisSettings: AnalysisSettings = {
  defaultCountryId: "fji",
  defaultAdminLevel: "province",
  heatThreshold: 22,
  h3Resolution: 7,
  assetBufferKm: 5,
  heatDisplayMode: "combined",
  showPopulationOverlay: false,
  showInfrastructureAssets: false,
};

const adminSourceId = "pict-admin-source";
const adminFillLayerId = "pict-admin-fill";
const adminOutlineLayerId = "pict-admin-outline";
const adminHoverFillLayerId = "pict-admin-hover-fill";
const adminHoverOutlineLayerId = "pict-admin-hover-outline";
const adminSelectedFillLayerId = "pict-admin-selected-fill";
const adminSelectedOutlineLayerId = "pict-admin-selected-outline";

type MapboxFilter = Parameters<mapboxgl.Map["setFilter"]>[1];

const noAdminFilter: MapboxFilter = ["==", ["get", "admin_id"], "__none__"];

const cachedAdminGeoJsonByKey: Record<string, GeoJSON.FeatureCollection> = {};

const assetPlaceholderFallbacks: Record<string, string> = {
  fji: "Lautoka Hospital",
  wsm: "Tupua Tamasese Meaole Hospital",
  ton: "Vaiola Hospital",
  vut: "Vila Central Hospital",
  slb: "National Referral Hospital",
  png: "Port Moresby General Hospital",
  ncl: "Médipôle",
  pyf: "Centre Hospitalier de Polynésie Française",
  asm: "LBJ Tropical Medical Center",
  gum: "Guam Memorial Hospital",
};

function clampSettingNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return fallback;

  return Math.max(min, Math.min(max, numberValue));
}

function isHeatDisplayMode(value: unknown): value is HeatDisplayMode {
  return value === "combined" || value === "risk" || value === "uncertainty";
}

function normalizeAdminLevel(value: unknown, fallback = "province"): string {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .trim();

  return normalized || fallback;
}

function loadAnalysisSettings(): AnalysisSettings {
  if (typeof window === "undefined") {
    return defaultAnalysisSettings;
  }

  try {
    const rawSettings =
      window.localStorage.getItem(analysisSettingsStorageKey) ??
      window.localStorage.getItem("pict-analysis-settings-v1");

    if (!rawSettings) {
      return defaultAnalysisSettings;
    }

    const parsed = JSON.parse(rawSettings) as Partial<
      AnalysisSettings & { defaultAdminBoundaryMode?: string }
    >;

    return {
      defaultCountryId: String(parsed.defaultCountryId || "fji").toLowerCase(),
      defaultAdminLevel: normalizeAdminLevel(
        parsed.defaultAdminLevel ?? parsed.defaultAdminBoundaryMode,
        defaultAnalysisSettings.defaultAdminLevel,
      ),
      heatThreshold: clampSettingNumber(
        parsed.heatThreshold,
        defaultAnalysisSettings.heatThreshold,
        10,
        45,
      ),
      h3Resolution: Math.round(
        clampSettingNumber(
          parsed.h3Resolution,
          defaultAnalysisSettings.h3Resolution,
          5,
          7,
        ),
      ),
      assetBufferKm: clampSettingNumber(
        parsed.assetBufferKm,
        defaultAnalysisSettings.assetBufferKm,
        1,
        20,
      ),
      heatDisplayMode: isHeatDisplayMode(parsed.heatDisplayMode)
        ? parsed.heatDisplayMode
        : defaultAnalysisSettings.heatDisplayMode,
      showPopulationOverlay:
        typeof parsed.showPopulationOverlay === "boolean"
          ? parsed.showPopulationOverlay
          : defaultAnalysisSettings.showPopulationOverlay,
      showInfrastructureAssets:
        typeof parsed.showInfrastructureAssets === "boolean"
          ? parsed.showInfrastructureAssets
          : defaultAnalysisSettings.showInfrastructureAssets,
    };
  } catch (error) {
    console.warn("Could not load analysis settings:", error);
    return defaultAnalysisSettings;
  }
}

function saveAnalysisSettings(settings: AnalysisSettings): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      analysisSettingsStorageKey,
      JSON.stringify(settings),
    );
  } catch (error) {
    console.warn("Could not save analysis settings:", error);
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  const mb = bytes / (1024 * 1024);

  if (mb >= 1) return `${mb.toFixed(1)} MB`;

  return `${Math.round(bytes / 1024)} KB`;
}

function getStringProperty(
  properties: Record<string, unknown> | null | undefined,
  key: string,
  fallback = "",
): string {
  const value = properties?.[key];

  if (value === null || value === undefined) return fallback;

  return String(value);
}

function buildAdminFilter(adminId: string | null): MapboxFilter {
  if (!adminId) return noAdminFilter;

  return ["==", ["get", "admin_id"], adminId];
}

function formatMetadataValue(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;

  return String(value);
}

function formatCompactNumber(value: unknown, fallback = "—"): string {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return fallback;

  return new Intl.NumberFormat("en", {
    notation: Math.abs(numberValue) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(numberValue) >= 10_000 ? 1 : 0,
  }).format(numberValue);
}

function formatPercentValue(value: unknown, fallback = "—"): string {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return fallback;

  return `${Math.round(numberValue * 100)}%`;
}

function getAssetTypeLabel(assetType: unknown): string {
  const value = String(assetType || "asset")
    .replace(/_/g, " ")
    .trim();

  if (!value) return "Asset";

  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getAssetOptionLabel(asset: AssetLookupOption): string {
  const assetName = asset.asset_name || "Unnamed asset";
  const assetType = getAssetTypeLabel(asset.asset_type);

  return `${assetName} — ${assetType}`;
}

function normalizeAssetLookupText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAssetFromLookupText(
  lookupText: string,
  assetOptions: AssetLookupOption[],
): AssetLookupOption | null {
  const normalizedLookup = normalizeAssetLookupText(lookupText);

  if (!normalizedLookup) return null;

  return (
    assetOptions.find((asset) => {
      const normalizedName = normalizeAssetLookupText(asset.asset_name);
      const normalizedLabel = normalizeAssetLookupText(getAssetOptionLabel(asset));
      const normalizedId = normalizeAssetLookupText(asset.asset_id);

      return (
        normalizedLookup === normalizedName ||
        normalizedLookup === normalizedLabel ||
        normalizedLookup === normalizedId
      );
    }) ?? null
  );
}

function getAssetTypeFilterHint(assetOptions: AssetLookupOption[]): string {
  const typeCounts = assetOptions.reduce<Record<string, number>>((counts, asset) => {
    const key = getAssetTypeLabel(asset.asset_type);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  const topTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${count} ${type.toLowerCase()}`);

  if (topTypes.length === 0) return "";

  return topTypes.join(" · ");
}

function getAssetPlaceholder(
  selectedArea: SelectedAdminArea | null,
  selectedCountry: RegionSummary | null,
  assetOptions: AssetLookupOption[],
  isLoadingAssets: boolean,
): string {
  if (!selectedArea) {
    return "Select an admin area first";
  }

  if (isLoadingAssets) {
    return `Loading assets in ${selectedArea.adminName}...`;
  }

  const preferredAsset =
    assetOptions.find((asset) => asset.asset_type === "hospital") ??
    assetOptions.find((asset) => asset.asset_type === "school") ??
    assetOptions.find((asset) => asset.asset_type === "port") ??
    assetOptions[0];

  const fallback =
    assetPlaceholderFallbacks[selectedArea.countryId] ??
    assetPlaceholderFallbacks[selectedCountry?.country_id ?? ""] ??
    null;

  const exampleName = preferredAsset?.asset_name || fallback;

  if (exampleName) {
    return `Choose an asset, e.g. ${exampleName}`;
  }

  return `No assets loaded for ${selectedArea.adminName}`;
}

function buildInfrastructureAssetFeatures(
  assets: AssetLookupOption[],
): GeoJSON.Feature[] {
  return assets.flatMap((asset) => {
    const coordinates = asset.coordinates;

    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !Number.isFinite(Number(coordinates[0])) ||
      !Number.isFinite(Number(coordinates[1]))
    ) {
      return [];
    }

    return [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [Number(coordinates[0]), Number(coordinates[1])],
        },
        properties: {
          ...asset,
          layer_name: "Manual Heat Risk Assets",
          asset_name: asset.asset_name,
          asset_type: asset.asset_type,
          exposed_to_hazard: false,
        },
      },
    ];
  });
}

function getAdminLevelLabel(countryId: string, adminLevel: string): string {
  const normalized = normalizeAdminLevel(adminLevel);

  if (countryId === "fji" && (normalized === "province" || normalized === "adm2")) {
    return "Province";
  }

  if (countryId === "fji" && normalized === "tikina") {
    return "Tikina";
  }

  if (normalized === "adm0") return "Country";
  if (normalized === "adm1") return "ADM1";
  if (normalized === "adm2") return "ADM2";
  if (normalized === "adm3") return "ADM3";

  return normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPreferredAdminLevels(country: RegionSummary | null): string[] {
  if (!country) return ["province"];

  const levels = Array.from(
    new Set((country.available_admin_levels || []).map((level) => normalizeAdminLevel(level))),
  );

  if (country.country_id === "fji") {
    return ["province", "tikina"].filter(
      (level) => levels.includes(level) || (level === "province" && levels.includes("adm2")),
    );
  }

  const preferred = ["adm1", "adm2", "adm0"].filter((level) =>
    levels.includes(level),
  );

  return preferred.length > 0 ? preferred : levels;
}

function buildAdminBoundaryConfig(
  country: RegionSummary | null,
  adminLevel: string,
): AdminBoundaryConfig | null {
  if (!country) return null;

  const normalizedLevel = normalizeAdminLevel(adminLevel);
  const label = getAdminLevelLabel(country.country_id, normalizedLevel);
  const labelLower = label.toLowerCase();

  return {
    countryId: country.country_id,
    countryName: country.country_name,
    adminLevel: normalizedLevel,
    cacheKey: `${country.country_id}:${normalizedLevel}`,
    title: label,
    unitLabel: label,
    unitLabelLower: labelLower,
    unitPluralLower:
      labelLower === "country"
        ? "countries"
        : labelLower === "tikina"
          ? "tikina"
          : `${labelLower}s`,
    apiPath: getApiUrl(
      `/api/admin-boundaries?country_id=${encodeURIComponent(
        country.country_id,
      )}&admin_level=${encodeURIComponent(normalizedLevel)}`,
    ),
  };
}


function getLongitudeRangeFromCoordinates(
  coordinates: unknown,
): { min: number; max: number } | null {
  const stack: unknown[] = [coordinates];
  let min = Infinity;
  let max = -Infinity;

  while (stack.length > 0) {
    const current = stack.pop();

    if (!Array.isArray(current)) continue;

    if (
      current.length >= 2 &&
      typeof current[0] === "number" &&
      typeof current[1] === "number"
    ) {
      const lng = current[0];

      if (Number.isFinite(lng)) {
        min = Math.min(min, lng);
        max = Math.max(max, lng);
      }

      continue;
    }

    current.forEach((child) => stack.push(child));
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  return { min, max };
}

function unwrapCoordinateForMapDisplay(point: unknown): unknown {
  if (
    !Array.isArray(point) ||
    point.length < 2 ||
    typeof point[0] !== "number" ||
    typeof point[1] !== "number"
  ) {
    return point;
  }

  const lng = point[0] < 0 ? point[0] + 360 : point[0];

  return [lng, point[1], ...point.slice(2)];
}

function unwrapCoordinatesForMapDisplay(coordinates: unknown): unknown {
  if (!Array.isArray(coordinates)) return coordinates;

  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    return unwrapCoordinateForMapDisplay(coordinates);
  }

  return coordinates.map(unwrapCoordinatesForMapDisplay);
}

function unwrapGeometryForMapDisplay(
  geometry: GeoJSON.Geometry | null | undefined,
): GeoJSON.Geometry | null | undefined {
  if (!geometry || !("coordinates" in geometry)) {
    return geometry;
  }

  const range = getLongitudeRangeFromCoordinates(geometry.coordinates);

  if (!range || range.max - range.min <= 180) {
    return geometry;
  }

  return {
    ...geometry,
    coordinates: unwrapCoordinatesForMapDisplay(
      geometry.coordinates,
    ) as GeoJSON.Position[] | GeoJSON.Position[][] | GeoJSON.Position[][][],
  } as GeoJSON.Geometry;
}

function normalizeAdminFeatureCollection(
  collection: GeoJSON.FeatureCollection,
  config: AdminBoundaryConfig,
): GeoJSON.FeatureCollection {
  return {
    ...collection,
    features: (collection.features || []).map((feature, index) => {
      const properties = (feature.properties || {}) as Record<string, unknown>;
      const adminName =
        getStringProperty(properties, "admin_name") ||
        getStringProperty(properties, "shapeName") ||
        getStringProperty(properties, "name") ||
        `${config.unitLabel} ${index + 1}`;
      const adminId =
        getStringProperty(properties, "admin_id") ||
        `${config.countryId}_${config.adminLevel}_${index}`;

      return {
        ...feature,
        geometry: unwrapGeometryForMapDisplay(feature.geometry) ?? feature.geometry,
        properties: {
          ...properties,
          country_id:
            getStringProperty(properties, "country_id") || config.countryId,
          country_name:
            getStringProperty(properties, "country_name") || config.countryName,
          admin_level:
            getStringProperty(properties, "admin_level") || config.adminLevel,
          admin_id: adminId,
          admin_name: adminName,
          display_admin_level: config.adminLevel,
        },
      };
    }),
  };
}

async function fetchAdminBoundaryGeoJsonWithProgress(
  config: AdminBoundaryConfig,
  signal: AbortSignal,
  onProgress: (state: BoundaryLoadState) => void,
): Promise<GeoJSON.FeatureCollection> {
  const cachedGeoJson = cachedAdminGeoJsonByKey[config.cacheKey];

  if (cachedGeoJson) {
    onProgress({
      status: "parsing",
      message: `Using cached ${config.countryName} ${config.unitPluralLower} boundaries.`,
      percent: 72,
      featureCount: cachedGeoJson.features.length,
    });

    return cachedGeoJson;
  }

  onProgress({
    status: "fetching",
    message: `Requesting ${config.countryName} ${config.unitPluralLower} boundaries...`,
    percent: 15,
  });

  const response = await fetch(config.apiPath, {
    cache: "force-cache",
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Could not fetch ${config.unitLabelLower} GeoJSON: HTTP ${response.status}. ${errorText.slice(
        0,
        160,
      )}`,
    );
  }

  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : Number.NaN;

  let geoJsonText = "";

  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      if (value) {
        receivedBytes += value.length;
        chunks.push(decoder.decode(value, { stream: true }));

        const downloadPercent = Number.isFinite(contentLength)
          ? Math.min(65, 20 + (receivedBytes / contentLength) * 45)
          : Math.min(65, 20 + receivedBytes / 40_000);

        const downloadedText = Number.isFinite(contentLength)
          ? `${formatBytes(receivedBytes)} / ${formatBytes(contentLength)}`
          : `${formatBytes(receivedBytes)} downloaded`;

        onProgress({
          status: "downloading",
          message: `Downloading boundaries: ${downloadedText}`,
          percent: Math.round(downloadPercent),
        });
      }
    }

    chunks.push(decoder.decode());
    geoJsonText = chunks.join("");
  } else {
    onProgress({
      status: "downloading",
      message: "Downloading admin boundaries...",
      percent: 45,
    });

    geoJsonText = await response.text();
  }

  onProgress({
    status: "parsing",
    message: "Parsing boundary GeoJSON...",
    percent: 72,
  });

  const parsed = JSON.parse(geoJsonText) as AdminBoundaryResponse;

  const featureCount = parsed.features?.length ?? 0;

  if (!parsed || parsed.type !== "FeatureCollection" || featureCount === 0) {
    throw new Error(`${config.unitLabel} GeoJSON loaded, but it has no features.`);
  }

  const normalized = normalizeAdminFeatureCollection(parsed, config);
  cachedAdminGeoJsonByKey[config.cacheKey] = normalized;

  onProgress({
    status: "parsing",
    message: `Parsed ${featureCount} ${config.unitPluralLower} boundaries.`,
    percent: 78,
    featureCount,
  });

  return normalized;
}

function featureCollectionBounds(
  collection: GeoJSON.FeatureCollection,
): mapboxgl.LngLatBoundsLike | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const visit = (coordinates: unknown) => {
    if (!Array.isArray(coordinates)) return;

    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number"
    ) {
      const lng = coordinates[0];
      const lat = coordinates[1];

      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        west = Math.min(west, lng);
        south = Math.min(south, lat);
        east = Math.max(east, lng);
        north = Math.max(north, lat);
      }

      return;
    }

    coordinates.forEach(visit);
  };

  collection.features.forEach((feature) => {
    visit(feature.geometry?.coordinates);
  });

  if (![west, south, east, north].every(Number.isFinite)) return null;

  if (east - west > 180) {
    return null;
  }

  return [
    [west, south],
    [east, north],
  ];
}

const MapCanvas = ({
  onDrawGeometry,
  drawnGeometry,
  runSpatialQuery,
  runAssetHeatRiskQuery,
  fetchAdminAssets,
  clearSpatialQuery,
  highlightedFeatures,
  queryMetadata,
  isQuerying,
}: MapCanvasProps) => {
  const {
    mapContainerRef,
    mapboxMap,
    activeLayer,
    setActiveLayer,
    showGlobalDataset,
    setShowGlobalDataset,
  } = useMapbox();

  const {
    selectedIds,
    hoveredId,
    activeChapter,
    setSelectedIds,
    setHoveredId,
    setActiveChapter,
  } = useBrushingState();

  const initialAnalysisSettings = useMemo(loadAnalysisSettings, []);

  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [isLoadingRegions, setIsLoadingRegions] = useState(false);
  const [regionsError, setRegionsError] = useState<string | null>(null);
  const [selectedCountryId, setSelectedCountryId] = useState(
    initialAnalysisSettings.defaultCountryId,
  );
  const [selectedAdminLevel, setSelectedAdminLevel] = useState(
    initialAnalysisSettings.defaultAdminLevel,
  );
  const [manualHeatThreshold, setManualHeatThreshold] = useState(
    initialAnalysisSettings.heatThreshold,
  );
  const [heatDisplayMode, setHeatDisplayMode] = useState<HeatDisplayMode>(
    initialAnalysisSettings.heatDisplayMode,
  );
  const [showPopulationOverlay, setShowPopulationOverlay] = useState(
    initialAnalysisSettings.showPopulationOverlay,
  );
  const [showInfrastructureAssets, setShowInfrastructureAssets] = useState(
    initialAnalysisSettings.showInfrastructureAssets,
  );
  const [selectedArea, setSelectedArea] = useState<SelectedAdminArea | null>(
    null,
  );
  const [boundaryLoadAttempt, setBoundaryLoadAttempt] = useState(0);
  const [boundaryLoad, setBoundaryLoad] = useState<BoundaryLoadState>({
    status: "idle",
    message: "Preparing admin boundaries...",
    percent: 0,
  });
  const [assetOptions, setAssetOptions] = useState<AssetLookupOption[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [assetLookupText, setAssetLookupText] = useState("");
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [assetLookupError, setAssetLookupError] = useState<string | null>(null);
  const [assetBufferKm, setAssetBufferKm] = useState(
    initialAnalysisSettings.assetBufferKm,
  );
  const [h3Resolution, setH3Resolution] = useState(
    initialAnalysisSettings.h3Resolution,
  );

  const manualHeatThresholdRef = useRef(initialAnalysisSettings.heatThreshold);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const didInitializeHeatLayerRef = useRef(false);

  // Helper to toggle a dynamic layer on/off
  const toggleLayer = useCallback((layer: MapLayer, isGlobal: boolean) => {
    if (activeLayer !== layer) {
      setActiveLayer(layer);
      setShowGlobalDataset(isGlobal);
    } else if (showGlobalDataset === isGlobal) {
      setActiveLayer(null);
    } else {
      setShowGlobalDataset(isGlobal);
    }
  }, [activeLayer, setActiveLayer, setShowGlobalDataset, showGlobalDataset]);

  const selectedCountry =
    regions.find((country) => country.country_id === selectedCountryId) ?? null;
  const availableAdminLevels = useMemo(
    () => getPreferredAdminLevels(selectedCountry),
    [selectedCountry],
  );
  const adminBoundaryConfig = useMemo(
    () => buildAdminBoundaryConfig(selectedCountry, selectedAdminLevel),
    [selectedAdminLevel, selectedCountry],
  );
  const currentActiveLayer = activeLayer as MapLayer;
  const activeAnalysisGeometry = selectedArea?.geometry ?? drawnGeometry;
  const boundaryLayerReady = boundaryLoad.status === "ready";
  const hasHeatResult =
    queryMetadata?.analysis_type === "manual_heat_risk" ||
    queryMetadata?.analysis_type === "asset_heat_risk";
  const isAssetResult = queryMetadata?.analysis_type === "asset_heat_risk";
  const exactAssetFromInput = getAssetFromLookupText(
    assetLookupText,
    assetOptions,
  );
  const selectedAsset =
    assetOptions.find((asset) => asset.asset_id === selectedAssetId) ??
    exactAssetFromInput;
  const assetDropdownPlaceholder = getAssetPlaceholder(
    selectedArea,
    selectedCountry,
    assetOptions,
    isLoadingAssets,
  );
  const hasTypedAssetQuery = assetLookupText.trim().length > 0;
  const hasNoLoadedAssets =
    selectedArea !== null &&
    !isLoadingAssets &&
    !assetLookupError &&
    assetOptions.length === 0;
  const canRunAssetLookup =
    selectedArea !== null &&
    assetOptions.length > 0 &&
    !isLoadingAssets &&
    !isQuerying &&
    (selectedAsset !== null || hasTypedAssetQuery);

  const highlightedFeaturesForMap = useMemo(() => {
    const baseFeatures = highlightedFeatures ?? [];

    if (!showInfrastructureAssets || assetOptions.length === 0) {
      return baseFeatures;
    }

    const existingAssetIds = new Set(
      baseFeatures
        .filter(
          (feature) =>
            feature.properties?.layer_name === "Manual Heat Risk Assets",
        )
        .map((feature) => String(feature.properties?.asset_id || "")),
    );

    const cachedAssetFeatures = buildInfrastructureAssetFeatures(
      assetOptions,
    ).filter(
      (feature) =>
        !existingAssetIds.has(String(feature.properties?.asset_id || "")),
    );

    return [...baseFeatures, ...cachedAssetFeatures];
  }, [assetOptions, highlightedFeatures, showInfrastructureAssets]);

  useEffect(() => {
    manualHeatThresholdRef.current = manualHeatThreshold;
  }, [manualHeatThreshold]);

  useEffect(() => {
    saveAnalysisSettings({
      defaultCountryId: selectedCountryId,
      defaultAdminLevel: selectedAdminLevel,
      heatThreshold: manualHeatThreshold,
      h3Resolution,
      assetBufferKm,
      heatDisplayMode,
      showPopulationOverlay,
      showInfrastructureAssets,
    });
  }, [
    assetBufferKm,
    h3Resolution,
    heatDisplayMode,
    manualHeatThreshold,
    selectedAdminLevel,
    selectedCountryId,
    showInfrastructureAssets,
    showPopulationOverlay,
  ]);

  useEffect(() => {
    if (didInitializeHeatLayerRef.current) return;

    didInitializeHeatLayerRef.current = true;
    setActiveLayer("manual_heat_risk" as never);
    setShowGlobalDataset(false);
  }, [setActiveLayer, setShowGlobalDataset]);

  useEffect(() => {
    let cancelled = false;

    setIsLoadingRegions(true);
    setRegionsError(null);
    setBoundaryLoad({
      status: "fetching_regions",
      message: "Loading region registry...",
      percent: 5,
    });

    fetch(getApiUrl("/api/regions"), { cache: "force-cache" })
      .then(async (response) => {
        const data = (await response.json()) as RegionsResponse;

        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data.countries || [];
      })
      .then((countries) => {
        if (cancelled) return;

        const sortedCountries = [...countries].sort((a, b) =>
          a.country_name.localeCompare(b.country_name),
        );

        setRegions(sortedCountries);

        const currentCountry =
          sortedCountries.find(
            (country) => country.country_id === selectedCountryId,
          ) ?? sortedCountries.find((country) => country.country_id === "fji") ??
          sortedCountries[0];

        if (currentCountry && currentCountry.country_id !== selectedCountryId) {
          setSelectedCountryId(currentCountry.country_id);
        }

        if (currentCountry) {
          const preferredLevels = getPreferredAdminLevels(currentCountry);

          if (!preferredLevels.includes(selectedAdminLevel)) {
            setSelectedAdminLevel(preferredLevels[0] ?? "adm0");
          }
        }
      })
      .catch((error) => {
        if (cancelled) return;

        const message = error instanceof Error ? error.message : String(error);

        setRegionsError(message);
        setBoundaryLoad({
          status: "error",
          message: "Region registry could not be loaded.",
          percent: 0,
          error: message,
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRegions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCountry) return;

    const preferredLevels = getPreferredAdminLevels(selectedCountry);

    if (!preferredLevels.includes(selectedAdminLevel)) {
      setSelectedAdminLevel(preferredLevels[0] ?? "adm0");
      setSelectedArea(null);
      clearSpatialQuery();
      onDrawGeometry(null);
      return;
    }

    setBoundaryLoadAttempt((attempt) => attempt + 1);
    setSelectedArea(null);
    setAssetOptions([]);
    setSelectedAssetId("");
    setAssetLookupText("");
    setAssetLookupError(null);
    clearSpatialQuery();
    onDrawGeometry(null);
  }, [selectedCountryId]);

  useEffect(() => {
    if (!selectedArea) {
      setAssetOptions([]);
      setSelectedAssetId("");
      setAssetLookupText("");
      setAssetLookupError(null);
      setIsLoadingAssets(false);
      return;
    }

    let cancelled = false;

    setAssetOptions([]);
    setSelectedAssetId("");
    setAssetLookupText("");
    setAssetLookupError(null);
    setIsLoadingAssets(true);

    fetchAdminAssets({
      request_mode: "admin",
      mode: "admin",
      country_id: selectedArea.countryId,
      country_name: selectedArea.countryName,
      admin_level: selectedArea.adminLevel,
      admin_id: selectedArea.adminId,
      admin_name: selectedArea.adminName,
      asset_types: [
        "hospital",
        "school",
        "port",
        "power_substation",
        "critical_facility",
      ],
    })
      .then((assets) => {
        if (cancelled) return;
        setAssetOptions(assets);
      })
      .catch((error) => {
        if (cancelled) return;
        setAssetOptions([]);
        setAssetLookupError(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAssets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchAdminAssets, selectedArea]);

  useEffect(() => {
    const coordinates = queryMetadata?.matched_asset?.coordinates;

    if (
      !mapboxMap ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !Number.isFinite(Number(coordinates[0])) ||
      !Number.isFinite(Number(coordinates[1]))
    ) {
      return;
    }

    mapboxMap.flyTo({
      center: [Number(coordinates[0]), Number(coordinates[1])],
      zoom: Math.max(mapboxMap.getZoom(), 11),
      duration: 900,
    });
  }, [mapboxMap, queryMetadata?.matched_asset?.coordinates]);

  const runHeatExposureAnalysis = useCallback(
    (
      geometry: GeoJSON.Geometry,
      adminContext?: SelectedAdminArea,
      thresholdOverride?: number,
    ) => {
      popupRef.current?.remove();
      popupRef.current = null;

      const threshold = Number.isFinite(thresholdOverride)
        ? Number(thresholdOverride)
        : manualHeatThresholdRef.current;

      setActiveLayer("manual_heat_risk" as never);
      setShowGlobalDataset(false);

      runSpatialQuery(
        geometry,
        { "Manual Heat Risk": true },
        "manual_heat_risk",
        {
          request_mode: adminContext ? "admin" : "geometry",
          mode: adminContext ? "admin" : "geometry",

          country_id: adminContext?.countryId ?? selectedCountry?.country_id,
          country_name:
            adminContext?.countryName ?? selectedCountry?.country_name,

          admin_level: adminContext?.adminLevel,
          admin_id: adminContext?.adminId,
          admin_name: adminContext?.adminName,
          h3_resolution: h3Resolution,

          threshold,
          risk_metric: "heat",
          asset_types: ["hospital", "school", "port"],
          comparison_operator: ">=",
          include_population: true,
          include_assets: false,
          return_layers: {
            risk_grid: true,
            sampled_assets: false,
            ranked_assets: false,
          },
        },
      );
    },
    [
      h3Resolution,
      runSpatialQuery,
      selectedCountry?.country_id,
      selectedCountry?.country_name,
      setActiveLayer,
      setShowGlobalDataset,
    ],
  );

  const handleRunAssetHeatRisk = useCallback(() => {
    const typedQuery = assetLookupText.trim();

    if (!selectedArea || (!selectedAsset && !typedQuery)) return;

    popupRef.current?.remove();
    popupRef.current = null;

    setActiveLayer("manual_heat_risk" as never);
    setShowGlobalDataset(false);
    setShowPopulationOverlay(true);
    setShowInfrastructureAssets(true);

    void runAssetHeatRiskQuery({
      request_mode: "admin",
      mode: "admin",
      country_id: selectedArea.countryId,
      country_name: selectedArea.countryName,
      admin_level: selectedArea.adminLevel,
      admin_id: selectedArea.adminId,
      admin_name: selectedArea.adminName,
      asset_id: selectedAsset?.asset_id,
      asset_query: selectedAsset?.asset_name ?? typedQuery,
      asset_types: selectedAsset ? [selectedAsset.asset_type] : null,
      threshold: manualHeatThresholdRef.current,
      h3_resolution: h3Resolution,
      buffer_km: assetBufferKm,
      include_population: true,
    });
  }, [
    assetBufferKm,
    assetLookupText,
    h3Resolution,
    runAssetHeatRiskQuery,
    selectedAsset,
    selectedArea,
    setActiveLayer,
    setShowGlobalDataset,
  ]);

  useEffect(() => {
    if (!mapboxMap) {
      setBoundaryLoad({
        status: "waiting_for_map",
        message: "Waiting for Mapbox map to initialize...",
        percent: 5,
      });

      return;
    }

    if (!adminBoundaryConfig) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    let cleanupHandlers: (() => void) | null = null;

    const safeGetLayer = (id: string) => {
      try {
        return mapboxMap.getLayer(id);
      } catch {
        return undefined;
      }
    };

    const safeGetSource = (id: string) => {
      try {
        return mapboxMap.getSource(id);
      } catch {
        return undefined;
      }
    };

    const addLayerIfMissing = (layer: mapboxgl.AnyLayer) => {
      if (!safeGetLayer(layer.id)) {
        mapboxMap.addLayer(layer);
      }
    };

    const setAdminHoverFilter = (adminId: string | null) => {
      const filter = buildAdminFilter(adminId);

      try {
        if (safeGetLayer(adminHoverFillLayerId)) {
          mapboxMap.setFilter(adminHoverFillLayerId, filter);
        }

        if (safeGetLayer(adminHoverOutlineLayerId)) {
          mapboxMap.setFilter(adminHoverOutlineLayerId, filter);
        }
      } catch (error) {
        console.warn("Could not update admin hover filter:", error);
      }
    };

    const attachAdminHandlers = () => {
      const handleMouseMove = (event: mapboxgl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];

        if (!feature || !feature.properties) return;

        const adminId = getStringProperty(feature.properties, "admin_id");

        mapboxMap.getCanvas().style.cursor = "pointer";
        setAdminHoverFilter(adminId);
      };

      const handleMouseLeave = () => {
        mapboxMap.getCanvas().style.cursor = "";
        setAdminHoverFilter(null);
      };

      const handleClick = (event: mapboxgl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];

        if (!feature || !feature.properties || !feature.geometry) return;

        const adminId = getStringProperty(feature.properties, "admin_id");
        const adminName = getStringProperty(
          feature.properties,
          "admin_name",
          adminId,
        );
        const adminLevel = getStringProperty(
          feature.properties,
          "admin_level",
          adminBoundaryConfig.adminLevel,
        );
        const countryId = getStringProperty(
          feature.properties,
          "country_id",
          adminBoundaryConfig.countryId,
        );
        const countryName = getStringProperty(
          feature.properties,
          "country_name",
          adminBoundaryConfig.countryName,
        );

        setSelectedArea({
          countryId,
          countryName,
          adminId,
          adminName,
          adminLevel,
          displayAdminLevel: adminBoundaryConfig.adminLevel,
          geometry: feature.geometry as GeoJSON.Geometry,
        });

        popupRef.current?.remove();
        popupRef.current = null;
      };

      mapboxMap.on("mousemove", adminFillLayerId, handleMouseMove);
      mapboxMap.on("mouseleave", adminFillLayerId, handleMouseLeave);
      mapboxMap.on("click", adminFillLayerId, handleClick);

      return () => {
        mapboxMap.off("mousemove", adminFillLayerId, handleMouseMove);
        mapboxMap.off("mouseleave", adminFillLayerId, handleMouseLeave);
        mapboxMap.off("click", adminFillLayerId, handleClick);
      };
    };

    const addAdminLayers = (adminGeoJson: GeoJSON.FeatureCollection) => {
      if (cancelled) return;

      setBoundaryLoad({
        status: "adding_layers",
        message: `Adding clickable ${adminBoundaryConfig.unitPluralLower} layers to the map...`,
        percent: 86,
        featureCount: adminGeoJson.features.length,
      });

      const existingSource = safeGetSource(adminSourceId);

      if (existingSource) {
        (existingSource as mapboxgl.GeoJSONSource).setData(adminGeoJson);
      } else {
        mapboxMap.addSource(adminSourceId, {
          type: "geojson",
          data: adminGeoJson,
          promoteId: "admin_id",
        });
      }

      addLayerIfMissing({
        id: adminFillLayerId,
        type: "fill",
        source: adminSourceId,
        paint: {
          "fill-color": "#111827",
          "fill-opacity": 0.035,
        },
      });

      addLayerIfMissing({
        id: adminOutlineLayerId,
        type: "line",
        source: adminSourceId,
        paint: {
          "line-color": "#111827",
          "line-width": 0.7,
          "line-opacity": 0.45,
        },
      });

      addLayerIfMissing({
        id: adminHoverFillLayerId,
        type: "fill",
        source: adminSourceId,
        filter: noAdminFilter,
        paint: {
          "fill-color": "#f97316",
          "fill-opacity": 0.16,
        },
      });

      addLayerIfMissing({
        id: adminHoverOutlineLayerId,
        type: "line",
        source: adminSourceId,
        filter: noAdminFilter,
        paint: {
          "line-color": "#f97316",
          "line-width": 2,
          "line-opacity": 0.85,
        },
      });

      addLayerIfMissing({
        id: adminSelectedFillLayerId,
        type: "fill",
        source: adminSourceId,
        filter: noAdminFilter,
        paint: {
          "fill-color": "#ea580c",
          "fill-opacity": 0.18,
        },
      });

      addLayerIfMissing({
        id: adminSelectedOutlineLayerId,
        type: "line",
        source: adminSourceId,
        filter: noAdminFilter,
        paint: {
          "line-color": "#c2410c",
          "line-width": 2.8,
          "line-opacity": 0.95,
        },
      });

      cleanupHandlers?.();
      cleanupHandlers = attachAdminHandlers();

      const bounds = featureCollectionBounds(adminGeoJson);

      if (bounds) {
        mapboxMap.fitBounds(bounds, {
          padding: { top: 80, bottom: 80, left: 340, right: 80 },
          duration: 700,
          maxZoom: adminBoundaryConfig.adminLevel === "adm0" ? 8 : 9.5,
        });
      }

      setBoundaryLoad({
        status: "ready",
        message: `Loaded ${adminGeoJson.features.length} ${adminBoundaryConfig.unitPluralLower} boundaries.`,
        percent: 100,
        featureCount: adminGeoJson.features.length,
      });
    };

    const waitForMapStyle = async () => {
      setBoundaryLoad({
        status: "waiting_for_map",
        message: "Waiting for Mapbox style to finish loading...",
        percent: 8,
      });

      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (cancelled) return false;

        try {
          if (mapboxMap.loaded() || mapboxMap.isStyleLoaded()) {
            return true;
          }
        } catch {
          // Keep polling.
        }

        await sleep(100);
      }

      return false;
    };

    const loadAdminBoundaries = async () => {
      try {
        const styleReady = await waitForMapStyle();

        if (!styleReady || cancelled) {
          if (!cancelled) {
            throw new Error("Mapbox style did not become ready in time.");
          }

          return;
        }

        const geoJson = await fetchAdminBoundaryGeoJsonWithProgress(
          adminBoundaryConfig,
          abortController.signal,
          setBoundaryLoad,
        );

        if (cancelled) return;

        addAdminLayers(geoJson);
      } catch (error) {
        if (cancelled || abortController.signal.aborted) return;

        const message =
          error instanceof Error
            ? error.message
            : `Unknown ${adminBoundaryConfig.unitLabelLower} boundary loading error.`;

        console.warn(
          `Could not load ${adminBoundaryConfig.countryName} ${adminBoundaryConfig.unitLabelLower} layer:`,
          error,
        );

        setBoundaryLoad({
          status: "error",
          message: `${adminBoundaryConfig.unitLabel} boundaries could not be loaded.`,
          percent: 0,
          error: message,
        });
      }
    };

    void loadAdminBoundaries();

    const handleStyleData = () => {
      const cachedGeoJson = cachedAdminGeoJsonByKey[adminBoundaryConfig.cacheKey];

      if (
        cancelled ||
        !cachedGeoJson ||
        !mapboxMap.isStyleLoaded() ||
        safeGetSource(adminSourceId)
      ) {
        return;
      }

      try {
        addAdminLayers(cachedGeoJson);
      } catch (error) {
        console.warn(
          `Could not restore ${adminBoundaryConfig.unitLabelLower} layers after style change:`,
          error,
        );
      }
    };

    mapboxMap.on("styledata", handleStyleData);

    return () => {
      cancelled = true;
      abortController.abort();
      cleanupHandlers?.();
      mapboxMap.off("styledata", handleStyleData);
      mapboxMap.getCanvas().style.cursor = "";
    };
  }, [adminBoundaryConfig, boundaryLoadAttempt, mapboxMap]);

  useEffect(() => {
    if (!mapboxMap) return;

    const filter = buildAdminFilter(selectedArea?.adminId ?? null);

    try {
      if (mapboxMap.getLayer(adminSelectedFillLayerId)) {
        mapboxMap.setFilter(adminSelectedFillLayerId, filter);
      }

      if (mapboxMap.getLayer(adminSelectedOutlineLayerId)) {
        mapboxMap.setFilter(adminSelectedOutlineLayerId, filter);
      }
    } catch (error) {
      console.warn("Could not update selected admin filter:", error);
    }
  }, [mapboxMap, selectedArea]);

  // Hover tooltip for dynamic layers (sea-level-h3, power-gen-fill, water-access-fill)
  useEffect(() => {
    if (!mapboxMap) return;

    const dynamicLayers = [
      "sea-level-h3-layer",
      "power-gen-fill-layer",
      "water-access-fill-layer",
    ];

    const handleMouseMove = (e: mapboxgl.MapMouseEvent) => {
      for (const layerId of dynamicLayers) {
        if (!mapboxMap.getLayer(layerId)) continue;

        const features = mapboxMap.queryRenderedFeatures(e.point, {
          layers: [layerId],
        });

        if (features.length > 0) {
          const feature = features[0];
          const props = feature.properties || {};
          const indicatorValue = props.indicator_value;
          let tooltipContent = `<strong>${props.name || props.geo_pict || "Unknown"}</strong>`;

          if (indicatorValue !== undefined && indicatorValue !== null) {
            let unit = "";
            if (layerId === "sea-level-h3-layer") unit = " m";
            else if (layerId === "water-access-fill-layer") unit = "%";
            else if (layerId === "power-gen-fill-layer") unit = " GWh";
            tooltipContent += `<br/>Value: ${Number(indicatorValue).toFixed(3)}${unit}`;
          }
          tooltipContent += `<br/><span style="font-size:10px;color:#888;">${props.layer_name || layerId}</span>`;

          mapboxMap.getCanvas().style.cursor = "pointer";

          if (hoverPopupRef.current) {
            hoverPopupRef.current.remove();
          }
          hoverPopupRef.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 10,
            maxWidth: "220px",
          })
            .setLngLat(e.lngLat)
            .setHTML(`<div style="font-family:sans-serif;font-size:12px;padding:4px 6px;line-height:1.4;">${tooltipContent}</div>`)
            .addTo(mapboxMap);
          return;
        }
      }

      // No dynamic layer feature found — remove hover popup
      if (hoverPopupRef.current) {
        hoverPopupRef.current.remove();
        hoverPopupRef.current = null;
      }
    };

    mapboxMap.on("mousemove", handleMouseMove);
    return () => {
      mapboxMap.off("mousemove", handleMouseMove);
      if (hoverPopupRef.current) {
        hoverPopupRef.current.remove();
        hoverPopupRef.current = null;
      }
    };
  }, [mapboxMap]);

  // workflow-complete flyTo listener (forward-compat with visual-workflow-programmer)
  useEffect(() => {
    if (!mapboxMap) return;

    const handleWorkflowComplete = (e: CustomEvent) => {
      const { center, zoom } = e.detail;
      if (center) {
        mapboxMap.flyTo({
          center: center as [number, number],
          zoom: zoom || 8,
          essential: true,
          duration: 2500,
        });
      }
    };

    window.addEventListener("workflow-complete" as any, handleWorkflowComplete);
    return () => {
      window.removeEventListener("workflow-complete" as any, handleWorkflowComplete);
    };
  }, [mapboxMap]);

  const handleRerunHeatExposure = () => {
    if (!activeAnalysisGeometry) return;

    runHeatExposureAnalysis(activeAnalysisGeometry, selectedArea ?? undefined);
  };

  const handleRunSelectedAreaAnalysis = () => {
    if (!selectedArea) return;

    runHeatExposureAnalysis(selectedArea.geometry, selectedArea);
  };

  const handleClearAnalysis = () => {
    popupRef.current?.remove();
    popupRef.current = null;

    const draw = (
      window as typeof window & {
        __mapboxDraw?: {
          deleteAll?: () => void;
          changeMode?: (mode: string) => void;
        };
      }
    ).__mapboxDraw;

    try {
      draw?.deleteAll?.();
      draw?.changeMode?.("simple_select");
    } catch (error) {
      console.warn("Could not clear drawn polygon:", error);
    }

    setSelectedArea(null);
    setActiveLayer("manual_heat_risk" as never);
    setShowGlobalDataset(false);
    clearSpatialQuery();
    onDrawGeometry(null);
  };

  const handleCountryChange = (countryId: string) => {
    if (countryId === selectedCountryId) return;

    popupRef.current?.remove();
    popupRef.current = null;

    const nextCountry =
      regions.find((country) => country.country_id === countryId) ?? null;
    const nextLevels = getPreferredAdminLevels(nextCountry);

    setSelectedCountryId(countryId);
    setSelectedAdminLevel(nextLevels[0] ?? "adm0");
  };

  const handleAdminLevelChange = (nextLevel: string) => {
    if (nextLevel === selectedAdminLevel) return;

    popupRef.current?.remove();
    popupRef.current = null;

    setSelectedAdminLevel(nextLevel);
    setSelectedArea(null);
    setAssetOptions([]);
    setSelectedAssetId("");
    setAssetLookupText("");
    setAssetLookupError(null);
    setBoundaryLoadAttempt((attempt) => attempt + 1);
    clearSpatialQuery();
    onDrawGeometry(null);
  };

  const handleResetAnalysisSettings = () => {
    const defaults = defaultAnalysisSettings;

    setSelectedCountryId(defaults.defaultCountryId);
    setSelectedAdminLevel(defaults.defaultAdminLevel);
    setManualHeatThreshold(defaults.heatThreshold);
    manualHeatThresholdRef.current = defaults.heatThreshold;
    setH3Resolution(defaults.h3Resolution);
    setAssetBufferKm(defaults.assetBufferKm);
    setHeatDisplayMode(defaults.heatDisplayMode);
    setShowPopulationOverlay(defaults.showPopulationOverlay);
    setShowInfrastructureAssets(defaults.showInfrastructureAssets);
    setSelectedArea(null);
    setAssetOptions([]);
    setSelectedAssetId("");
    setAssetLookupText("");
    setAssetLookupError(null);
    setBoundaryLoadAttempt((attempt) => attempt + 1);
    clearSpatialQuery();
    onDrawGeometry(null);
  };

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
          <FeatureHighlighter
            mapboxMap={mapboxMap}
            highlightedFeatures={highlightedFeaturesForMap}
            showPopulationOverlay={showPopulationOverlay}
            showInfrastructureAssets={showInfrastructureAssets}
            heatDisplayMode={heatDisplayMode}
          />

          <SpatialQueryPanel
            highlightedFeatures={highlightedFeatures}
            queryMetadata={queryMetadata}
            showPopulationOverlay={showPopulationOverlay}
            showInfrastructureAssets={showInfrastructureAssets}
          />

          <MapControls map={mapboxMap} />

          {isQuerying && (
            <div className="pointer-events-none absolute left-1/2 top-5 z-[1200] -translate-x-1/2 rounded-2xl border border-black/5 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                <div>
                  <div className="text-xs font-bold text-neutral-900">
                    Running spatial analysis
                  </div>
                  <div className="text-[10px] font-medium text-neutral-500">
                    Fetching forecast spread and population...
                  </div>
                </div>
              </div>
            </div>
          )}

          {(selectedArea || highlightedFeatures?.length) && (
            <button
              onClick={handleClearAnalysis}
              className="absolute right-4 top-4 z-[1200] rounded-xl border border-black/5 bg-white/95 px-3 py-2 text-xs font-bold text-neutral-700 shadow-lg backdrop-blur-md hover:bg-neutral-100"
            >
              Clear analysis
            </button>
          )}

          {/* 4-Chapter Guided Storyteller Deck Bar */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] w-[min(92%,720px)]">
            <StorytellerDeck
              currentChapter={activeChapter ?? 1}
              onSelectChapter={setActiveChapter}
              mapboxMap={mapboxMap}
              setActiveLayer={setActiveLayer}
            />
          </div>

          <div className="absolute bottom-16 left-4 top-6 z-20 flex w-[300px] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/90 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Analysis controls
              </span>

              <button
                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                className="cursor-pointer text-xs font-semibold text-neutral-500 hover:text-neutral-900"
              >
                {isLegendExpanded ? "Hide" : "Show"}
              </button>
            </div>

            {isLegendExpanded && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="rounded-xl border border-orange-100 bg-orange-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-orange-500">
                      Region
                    </div>

                    {!boundaryLayerReady && (
                      <div className="text-[10px] font-bold text-orange-700">
                        {Math.round(boundaryLoad.percent)}%
                      </div>
                    )}
                  </div>

                  <label className="mt-2 block">
                    <span className="text-[10px] font-bold text-orange-700">
                      Country / territory
                    </span>

                    <select
                      value={selectedCountryId}
                      onChange={(event) => handleCountryChange(event.target.value)}
                      disabled={isLoadingRegions || regions.length === 0}
                      className="mt-1 h-9 w-full rounded-lg border border-orange-100 bg-white px-2 text-xs font-bold text-orange-950 outline-none focus:border-orange-400 disabled:cursor-not-allowed disabled:bg-orange-100 disabled:text-orange-300"
                    >
                      {regions.map((country) => (
                        <option key={country.country_id} value={country.country_id}>
                          {country.country_name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedCountry && (
                    <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-orange-100 p-1">
                      {availableAdminLevels.map((level) => (
                        <button
                          key={level}
                          onClick={() => handleAdminLevelChange(level)}
                          className={`rounded-lg px-2 py-1.5 text-[10px] font-bold transition ${
                            selectedAdminLevel === level
                              ? "bg-white text-orange-800 shadow-sm"
                              : "text-orange-500 hover:text-orange-900"
                          }`}
                        >
                          {getAdminLevelLabel(selectedCountry.country_id, level)}
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedCountry && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] font-bold">
                      <div
                        className={`rounded-lg px-2 py-1 ${
                          selectedCountry.population?.status === "ready"
                            ? "bg-white text-emerald-700"
                            : "bg-white/70 text-neutral-400"
                        }`}
                      >
                        Population: {selectedCountry.population?.status ?? "unknown"}
                      </div>

                      <div
                        className={`rounded-lg px-2 py-1 ${
                          selectedCountry.assets?.status === "ready"
                            ? "bg-white text-blue-700"
                            : "bg-white/70 text-neutral-400"
                        }`}
                      >
                        Assets:{" "}
                        {formatCompactNumber(selectedCountry.assets?.asset_count)}
                      </div>
                    </div>
                  )}

                  {selectedArea ? (
                    <div className="mt-2">
                      <div className="text-sm font-bold text-orange-950">
                        {selectedArea.adminName}
                      </div>
                      <div className="text-[10px] font-medium text-orange-700">
                        {selectedArea.countryName} ·{" "}
                        {getAdminLevelLabel(
                          selectedArea.countryId,
                          selectedArea.displayAdminLevel,
                        )}{" "}
                        · {selectedArea.adminId}
                      </div>

                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={handleRunSelectedAreaAnalysis}
                          disabled={isQuerying}
                          className="flex-1 rounded-lg bg-orange-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
                        >
                          Run area
                        </button>

                        <button
                          onClick={() => setSelectedArea(null)}
                          className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-orange-700 hover:bg-orange-100"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  ) : regionsError ? (
                    <div className="mt-2">
                      <div className="text-[10px] leading-snug text-red-700">
                        Region registry could not be loaded.
                      </div>

                      <div className="mt-1 rounded-lg bg-white/70 p-2 text-[9px] leading-snug text-red-600">
                        {regionsError}
                      </div>
                    </div>
                  ) : boundaryLoad.status === "error" ? (
                    <div className="mt-2">
                      <div className="text-[10px] leading-snug text-red-700">
                        {boundaryLoad.message}
                      </div>

                      {boundaryLoad.error && (
                        <div className="mt-1 rounded-lg bg-white/70 p-2 text-[9px] leading-snug text-red-600">
                          {boundaryLoad.error}
                        </div>
                      )}

                      <button
                        onClick={() =>
                          setBoundaryLoadAttempt((attempt) => attempt + 1)
                        }
                        className="mt-2 rounded-lg bg-red-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-red-700"
                      >
                        Retry
                      </button>
                    </div>
                  ) : boundaryLayerReady && adminBoundaryConfig ? (
                    <div className="mt-2 text-[10px] leading-snug text-orange-800">
                      Click a {adminBoundaryConfig.unitLabelLower} on the map.
                    </div>
                  ) : (
                    <div className="mt-2">
                      <div className="text-[10px] leading-snug text-orange-800">
                        {boundaryLoad.message}
                      </div>

                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-orange-100">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all duration-300"
                          style={{
                            width: `${Math.max(
                              3,
                              Math.min(100, boundaryLoad.percent),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 rounded-xl border border-orange-100 bg-white p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-orange-500">
                    Active analysis
                  </div>
                  <div className="mt-1 text-sm font-bold text-neutral-950">
                    Heat exposure
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-neutral-500">
                    Heat is the default workflow. Select a country, admin scale,
                    and area, then run heat risk or analyze an infrastructure
                    asset.
                  </p>
                </div>

                {currentActiveLayer === "manual_heat_risk" && (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                          Threshold
                        </label>

                        <input
                          type="number"
                          min="10"
                          max="45"
                          step="0.5"
                          value={manualHeatThreshold}
                          onChange={(event) => {
                            const nextValue = Number(event.target.value);

                            if (Number.isFinite(nextValue)) {
                              setManualHeatThreshold(nextValue);
                              manualHeatThresholdRef.current = nextValue;
                            }
                          }}
                          className="h-7 w-16 rounded-lg border border-orange-100 bg-white px-2 text-[11px] font-bold text-orange-700 outline-none focus:border-orange-400"
                        />

                        <span className="text-[10px] font-semibold text-orange-600">
                          °C
                        </span>

                        <button
                          onClick={handleRerunHeatExposure}
                          disabled={!activeAnalysisGeometry || isQuerying}
                          className="ml-auto rounded-lg bg-orange-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
                        >
                          Rerun
                        </button>
                      </div>

                      {hasHeatResult && (
                        <div className="mt-2 rounded-lg bg-white p-2 text-[10px] text-neutral-600">
                          <span className="font-bold text-neutral-900">
                            Current:
                          </span>{" "}
                          {isAssetResult
                            ? formatMetadataValue(
                                queryMetadata?.matched_asset?.asset_name ??
                                  queryMetadata?.asset_query,
                              )
                            : formatMetadataValue(
                                queryMetadata?.admin_name ??
                                  selectedArea?.adminName ??
                                  "selected area",
                              )}
                          {" · "}
                          {formatCompactNumber(
                            queryMetadata?.h3_cell_count ??
                              queryMetadata?.grid_cell_count,
                          )}{" "}
                          cells
                          {queryMetadata?.mean_exposure_probability !==
                            undefined && (
                            <>
                              {" · "}
                              {formatPercentValue(
                                queryMetadata.mean_exposure_probability,
                              )}{" "}
                              mean risk
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-neutral-100 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                            Analysis settings
                          </div>
                          <p className="mt-1 text-[10px] leading-snug text-neutral-500">
                            Saved locally. These defaults control the next heat
                            or asset run.
                          </p>
                        </div>

                        <button
                          onClick={handleResetAnalysisSettings}
                          className="rounded-lg bg-neutral-100 px-2 py-1 text-[10px] font-bold text-neutral-600 hover:bg-neutral-200"
                        >
                          Reset
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[10px] font-bold text-neutral-500">
                            H3 grid
                          </span>

                          <select
                            value={h3Resolution}
                            onChange={(event) =>
                              setH3Resolution(Number(event.target.value))
                            }
                            className="mt-1 h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] font-bold text-neutral-700 outline-none focus:border-orange-400"
                          >
                            <option value={5}>5 · coarse</option>
                            <option value={6}>6 · balanced</option>
                            <option value={7}>7 · detailed</option>
                          </select>
                        </label>

                        <label className="block">
                          <span className="text-[10px] font-bold text-neutral-500">
                            Default view
                          </span>

                          <select
                            value={heatDisplayMode}
                            onChange={(event) =>
                              setHeatDisplayMode(
                                event.target.value as HeatDisplayMode,
                              )
                            }
                            className="mt-1 h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] font-bold text-neutral-700 outline-none focus:border-orange-400"
                          >
                            <option value="combined">Both</option>
                            <option value="risk">Risk</option>
                            <option value="uncertainty">Spread</option>
                          </select>
                        </label>
                      </div>

                      <p className="mt-2 text-[9px] leading-snug text-neutral-400">
                        Also saved: country, admin scale, threshold, asset
                        buffer, and overlay toggles.
                      </p>
                    </div>

                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-blue-500">
                            Asset lookup
                          </div>
                          <div className="text-[10px] text-blue-700">
                            Pick from assets found inside the selected area.
                          </div>
                        </div>

                        {selectedArea && (
                          <div className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-blue-600">
                            {isLoadingAssets
                              ? "loading"
                              : `${assetOptions.length} assets`}
                          </div>
                        )}
                      </div>

                      {selectedArea &&
                      !isLoadingAssets &&
                      !assetLookupError &&
                      assetOptions.length === 0 ? (
                        <div className="mt-2 rounded-lg border border-blue-100 bg-white/90 p-2 text-[10px] leading-snug text-blue-700">
                          No supported OSM assets were found in {selectedArea.adminName}.
                          The asset analyzer is hidden for this area unless
                          asset data is added later.
                        </div>
                      ) : (
                        <>
                          <input
                            list="admin-asset-options"
                            value={assetLookupText}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              const matchedAsset = getAssetFromLookupText(
                                nextValue,
                                assetOptions,
                              );

                              setAssetLookupText(nextValue);
                              setSelectedAssetId(matchedAsset?.asset_id ?? "");
                            }}
                            disabled={
                              !selectedArea ||
                              isLoadingAssets ||
                              assetOptions.length === 0
                            }
                            placeholder={assetDropdownPlaceholder}
                            className="mt-2 h-9 w-full rounded-lg border border-blue-100 bg-white px-2 text-xs font-semibold text-neutral-900 outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:bg-blue-50 disabled:text-blue-300"
                          />

                          <datalist id="admin-asset-options">
                            {assetOptions.map((asset) => (
                              <option
                                key={asset.asset_id}
                                value={getAssetOptionLabel(asset)}
                              />
                            ))}
                          </datalist>
                        </>
                      )}

                      {selectedArea && assetLookupError && (
                        <p className="mt-2 rounded-lg bg-white/80 p-2 text-[10px] leading-snug text-red-600">
                          {assetLookupError}
                        </p>
                      )}

                      {selectedArea &&
                        !assetLookupError &&
                        !isLoadingAssets && (
                          <p className="mt-2 text-[10px] leading-snug text-blue-700">
                            {assetOptions.length > 0
                              ? `Type a name or choose one of the loaded assets. ${getAssetTypeFilterHint(assetOptions)}`
                              : "No matching infrastructure assets were found for this area."}
                          </p>
                        )}

                      {!hasNoLoadedAssets && (
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-[10px] font-bold text-blue-700">
                            Buffer
                          </label>

                          <input
                            type="number"
                            min="1"
                            max="20"
                            step="1"
                            value={assetBufferKm}
                            onChange={(event) => {
                              const nextValue = Number(event.target.value);

                              if (Number.isFinite(nextValue)) {
                                setAssetBufferKm(
                                  Math.max(1, Math.min(20, nextValue)),
                                );
                              }
                            }}
                            className="h-7 w-14 rounded-lg border border-blue-100 bg-white px-2 text-[11px] font-bold text-blue-700 outline-none focus:border-blue-400"
                          />

                          <span className="text-[10px] font-semibold text-blue-700">
                            km
                          </span>

                          <button
                            onClick={handleRunAssetHeatRisk}
                            disabled={!canRunAssetLookup}
                            className="ml-auto rounded-lg bg-blue-600 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-200"
                          >
                            Analyze asset
                          </button>
                        </div>
                      )}

                      {!selectedArea && (
                        <p className="mt-2 text-[10px] leading-snug text-blue-700">
                          Select an admin area first; the asset lookup will load
                          hospitals, schools, ports, substations, and emergency
                          facilities from that area.
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                        Heat view
                      </div>

                      <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1">
                        <button
                          onClick={() => setHeatDisplayMode("combined")}
                          className={`rounded-lg px-2 py-1.5 text-[10px] font-bold transition ${
                            heatDisplayMode === "combined"
                              ? "bg-white text-neutral-950 shadow-sm"
                              : "text-neutral-500 hover:text-neutral-900"
                          }`}
                        >
                          Both
                        </button>

                        <button
                          onClick={() => setHeatDisplayMode("risk")}
                          className={`rounded-lg px-2 py-1.5 text-[10px] font-bold transition ${
                            heatDisplayMode === "risk"
                              ? "bg-white text-orange-700 shadow-sm"
                              : "text-neutral-500 hover:text-neutral-900"
                          }`}
                        >
                          Risk
                        </button>

                        <button
                          onClick={() => setHeatDisplayMode("uncertainty")}
                          className={`rounded-lg px-2 py-1.5 text-[10px] font-bold transition ${
                            heatDisplayMode === "uncertainty"
                              ? "bg-white text-blue-700 shadow-sm"
                              : "text-neutral-500 hover:text-neutral-900"
                          }`}
                        >
                          Spread
                        </button>
                      </div>

                      <p className="mt-2 text-[10px] leading-snug text-neutral-500">
                        Both overlays risk fill and spread outline. Use Risk or
                        Spread to isolate one signal.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-orange-50 p-2">
                        <div className="mb-1 text-[10px] font-bold text-orange-700">
                          Risk
                        </div>

                        <div
                          className="h-2 w-full rounded-full"
                          style={{
                            background:
                              "linear-gradient(to right, #fff7ed, #ffedd5, #fdba74, #fb923c, #ea580c, #7c2d12)",
                          }}
                        />

                        <div className="mt-1 flex justify-between text-[9px] font-semibold text-orange-700">
                          <span>0%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="rounded-xl bg-sky-50 p-2">
                        <div className="mb-1 text-[10px] font-bold text-blue-700">
                          Spread
                        </div>

                        <div
                          className="h-2 w-full rounded-full"
                          style={{
                            background:
                              "linear-gradient(to right, #f0f9ff, #bae6fd, #60a5fa, #7c3aed, #312e81)",
                          }}
                        />

                        <div className="mt-1 flex justify-between text-[9px] font-semibold text-blue-700">
                          <span>Low</span>
                          <span>High</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                        Optional overlays
                      </div>

                      <label className="mt-2 flex cursor-pointer items-center justify-between rounded-xl bg-purple-50 px-3 py-2">
                        <span className="text-[10px] font-bold text-purple-700">
                          Expected exposed population
                        </span>

                        <input
                          type="checkbox"
                          checked={showPopulationOverlay}
                          onChange={(event) =>
                            setShowPopulationOverlay(event.target.checked)
                          }
                          className="h-4 w-4 cursor-pointer accent-purple-600"
                        />
                      </label>

                      <label className="mt-2 flex cursor-pointer items-center justify-between rounded-xl bg-sky-50 px-3 py-2">
                        <span className="text-[10px] font-bold text-sky-700">
                          Infrastructure assets
                        </span>

                        <input
                          type="checkbox"
                          checked={showInfrastructureAssets}
                          onChange={(event) =>
                            setShowInfrastructureAssets(event.target.checked)
                          }
                          className="h-4 w-4 cursor-pointer accent-sky-600"
                        />
                      </label>
                    </div>

                    {/* Dynamic Datasets section */}
                    <div className="mt-3 border-t border-neutral-100 pt-3">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                        Dynamic Datasets
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => toggleLayer("sea_level", false)}
                          className={`w-full text-left rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            activeLayer === "sea_level" && !showGlobalDataset
                              ? "bg-white shadow-sm text-neutral-950 font-bold"
                              : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
                          }`}
                        >
                          Sea Level Rise (H3)
                        </button>
                        <button
                          onClick={() => toggleLayer("power_gen", false)}
                          className={`w-full text-left rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            activeLayer === "power_gen" && !showGlobalDataset
                              ? "bg-white shadow-sm text-neutral-950 font-bold"
                              : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
                          }`}
                        >
                          Power Gen (GWh)
                        </button>
                        <button
                          onClick={() => toggleLayer("water_access", false)}
                          className={`w-full text-left rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            activeLayer === "water_access" && !showGlobalDataset
                              ? "bg-white shadow-sm text-neutral-950 font-bold"
                              : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
                          }`}
                        >
                          Water Access
                        </button>
                      </div>

                      {/* Legend blocks for active dynamic layers */}
                      {activeLayer === "sea_level" && (
                        <div className="mt-3 border-t border-neutral-100 pt-3">
                          <div className="mb-2 text-xs font-bold text-neutral-800">
                            Sea Level Anomaly
                          </div>
                          <div className="mb-1 text-[10px] text-neutral-400">
                            Meters (m)
                          </div>
                          <div
                            className="h-2 w-full rounded-full"
                            style={{
                              background: "linear-gradient(to right, #f0f9ff, #38bdf8, #075985)",
                            }}
                          />
                          <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
                            <span>Low</span>
                            <span>Moderate</span>
                            <span>High</span>
                          </div>
                        </div>
                      )}
                      {activeLayer === "power_gen" && (
                        <div className="mt-3 border-t border-neutral-100 pt-3">
                          <div className="mb-2 text-xs font-bold text-neutral-800">
                            Power Generation (GWh)
                          </div>
                          <div className="mb-1 text-[10px] text-neutral-400">
                            Gigawatt-hours (GWh)
                          </div>
                          <div
                            className="h-2 w-full rounded-full"
                            style={{
                              background: "linear-gradient(to right, #fff7ed, #fb923c, #7c2d12)",
                            }}
                          />
                          <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
                            <span>Low</span>
                            <span>Medium</span>
                            <span>High (GWh)</span>
                          </div>
                        </div>
                      )}
                      {activeLayer === "water_access" && (
                        <div className="mt-3 border-t border-neutral-100 pt-3">
                          <div className="mb-2 text-xs font-bold text-neutral-800">
                            Safe Water Access
                          </div>
                          <div className="mb-1 text-[10px] text-neutral-400">
                            Percentage (%)
                          </div>
                          <div
                            className="h-2 w-full rounded-full"
                            style={{
                              background: "linear-gradient(to right, #fee2e2, #fbbf24, #22c55e)",
                            }}
                          />
                          <div className="mt-1 flex justify-between text-[10px] font-semibold text-neutral-500">
                            <span>0%</span>
                            <span>50%</span>
                            <span>100%</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bi-directional D3 Linked Risk Charts */}
                    <LinkedRiskCharts
                      selectedIds={selectedIds}
                      hoveredId={hoveredId}
                      onSelectIds={setSelectedIds}
                      onHoverId={setHoveredId}
                      activeLayer={activeLayer}
                    />
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