import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fromArrayBuffer } from "geotiff";
import * as h3 from "h3-js";
import { interpretResults } from "./interpretResults.js";
import {
  loadClimateCatalog,
  listClimateVariables,
  getCompatibleMetrics,
} from "./climate/climateCatalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const tasPath = path.resolve(
  __dirname,
  "../frontend/public/pacific_islands_tas.geojson"
);
const wbPath = path.resolve(
  __dirname,
  "../frontend/public/pacific_islands_wet_bulb.geojson"
);

const ADMIN_BOUNDARY_PATHS = {
  adm1: path.resolve(__dirname, "../data/reference/fiji_admin_adm1.geojson"),
  adm2: path.resolve(__dirname, "../data/reference/fiji_admin_adm2.geojson"),
  province: path.resolve(__dirname, "../data/reference/fiji_admin_adm2.geojson"),
  tikina: path.resolve(__dirname, "../data/reference/fiji_tikina.geojson"),
};

const DEFAULT_COUNTRY_ID = "fji";
const PICT_REFERENCE_DIR = path.resolve(__dirname, "../data/reference/pict");
const PICT_REGION_REGISTRY_PATH = path.resolve(
  __dirname,
  "../data/reference/pict_region_registry.json",
);
const PICT_GE0FABRIK_ASSET_MANIFEST_PATH = path.resolve(
  __dirname,
  "../data/reference/pict_geofabrik_asset_manifest.json",
);

const KNOWN_PICT_COUNTRIES = [
  { country_id: "asm", country_iso3: "ASM", country_name: "American Samoa" },
  { country_id: "cok", country_iso3: "COK", country_name: "Cook Islands" },
  { country_id: "fji", country_iso3: "FJI", country_name: "Fiji" },
  {
    country_id: "fsm",
    country_iso3: "FSM",
    country_name: "Micronesia (Federated States of)",
  },
  { country_id: "gum", country_iso3: "GUM", country_name: "Guam" },
  { country_id: "kir", country_iso3: "KIR", country_name: "Kiribati" },
  { country_id: "mhl", country_iso3: "MHL", country_name: "Marshall Islands" },
  {
    country_id: "mnp",
    country_iso3: "MNP",
    country_name: "Northern Mariana Islands",
  },
  { country_id: "nru", country_iso3: "NRU", country_name: "Nauru" },
  { country_id: "ncl", country_iso3: "NCL", country_name: "New Caledonia" },
  { country_id: "niu", country_iso3: "NIU", country_name: "Niue" },
  { country_id: "plw", country_iso3: "PLW", country_name: "Palau" },
  { country_id: "png", country_iso3: "PNG", country_name: "Papua New Guinea" },
  { country_id: "pyf", country_iso3: "PYF", country_name: "French Polynesia" },
  { country_id: "slb", country_iso3: "SLB", country_name: "Solomon Islands" },
  { country_id: "tkl", country_iso3: "TKL", country_name: "Tokelau" },
  { country_id: "ton", country_iso3: "TON", country_name: "Tonga" },
  { country_id: "tuv", country_iso3: "TUV", country_name: "Tuvalu" },
  { country_id: "vut", country_iso3: "VUT", country_name: "Vanuatu" },
  { country_id: "wlf", country_iso3: "WLF", country_name: "Wallis and Futuna" },
  { country_id: "wsm", country_iso3: "WSM", country_name: "Samoa" },
];

console.log("Loading backend data on startup...");

// Legacy static TAS/WBT layers are optional. The current MVP defaults to the
// live H3 + Open-Meteo heat workflow, so missing legacy GeoJSON files should
// not produce noisy startup warnings.
let tasFeatures = [];
let wbFeatures = [];

try {
  if (fs.existsSync(tasPath)) {
    const tasData = JSON.parse(fs.readFileSync(tasPath, "utf8"));
    tasFeatures = tasData.features || [];
    console.log(`Loaded optional legacy TAS layer: ${tasFeatures.length} features.`);
  }
} catch (err) {
  console.warn("Optional legacy TAS layer could not be loaded:", err);
}

try {
  if (fs.existsSync(wbPath)) {
    const wbData = JSON.parse(fs.readFileSync(wbPath, "utf8"));
    wbFeatures = wbData.features || [];
    console.log(`Loaded optional legacy Wet-Bulb layer: ${wbFeatures.length} features.`);
  }
} catch (err) {
  console.warn("Optional legacy Wet-Bulb layer could not be loaded:", err);
}

const MANUAL_HEAT_RISK_LAYER = "Manual Heat Risk";
const MANUAL_HEAT_RISK_ASSET_LAYER = "Manual Heat Risk Assets";
const POPULATION_EXPOSURE_OVERLAY_LAYER = "Population Exposure Overlay";

const OVERPASS_ASSET_CACHE_TTL_MS = 1000 * 60 * 60;
const overpassAssetCache = new Map();

const ADMIN_ASSET_CACHE_DIR = path.resolve(__dirname, "cache", "admin_assets");
const ADMIN_ASSET_CACHE_SCHEMA_VERSION = 1;
const ADMIN_ASSET_WARMUP_ENABLED =
  process.env.ADMIN_ASSET_WARMUP !== "false";
const ADMIN_ASSET_WARMUP_DELAY_MS = Number.isFinite(
  Number(process.env.ADMIN_ASSET_WARMUP_DELAY_MS),
)
  ? Number(process.env.ADMIN_ASSET_WARMUP_DELAY_MS)
  : 1200;
const adminAssetLookupCache = new Map();

const OPEN_METEO_BATCH_SIZE = 25;
const OPEN_METEO_BATCH_DELAY_MS = 900;
const OPEN_METEO_MAX_RETRIES = 4;
const MAX_LIVE_FORECAST_H3_CELLS = 250;
const openMeteoForecastCache = new Map();

const WORLDPOP_FJI_2020_URL =
  "https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/FJI/fji_ppp_2020.tif";

const WORLDPOP_CACHE_DIR = path.resolve(__dirname, "cache");
const WORLDPOP_FJI_2020_PATH = path.resolve(
  WORLDPOP_CACHE_DIR,
  "fji_ppp_2020.tif"
);

let worldPopFijiRasterCache = null;
const adminBoundaryCache = new Map();

// WorldPop population is static for this prototype.
// Cache by H3 index so rerunning the same province or threshold does not
// rescan the raster for every hexagon.
const worldPopPopulationByH3Cache = new Map();

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLongitude(lng) {
  const numericLng = Number(lng);

  if (!Number.isFinite(numericLng)) return numericLng;

  let normalized = numericLng;

  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;

  return normalized;
}

function normalizeCoordinatePair(point) {
  if (
    !Array.isArray(point) ||
    point.length < 2 ||
    typeof point[0] !== "number" ||
    typeof point[1] !== "number"
  ) {
    return point;
  }

  return [normalizeLongitude(point[0]), point[1]];
}

function normalizeCoordinatesLongitudes(coordinates) {
  if (!Array.isArray(coordinates)) return coordinates;

  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    return normalizeCoordinatePair(coordinates);
  }

  return coordinates.map(normalizeCoordinatesLongitudes);
}

function normalizeGeometryLongitudes(geometry) {
  if (!geometry) return geometry;

  if (geometry.type === "Point") {
    return {
      ...geometry,
      coordinates: normalizeCoordinatePair(geometry.coordinates),
    };
  }

  return {
    ...geometry,
    coordinates: normalizeCoordinatesLongitudes(geometry.coordinates),
  };
}

function pointInRing(point, ring) {
  const x = point[0];
  const y = point[1];

  if (!ring || ring.length === 0) return false;

  let inside = false;
  const n = ring.length;
  let p1x = ring[0][0];
  let p1y = ring[0][1];

  for (let i = 0; i <= n; i += 1) {
    const p2 = ring[i % n];
    const p2x = p2[0];
    const p2y = p2[1];

    if (y > Math.min(p1y, p2y)) {
      if (y <= Math.max(p1y, p2y)) {
        if (x <= Math.max(p1x, p2x)) {
          let xinters = 0;

          if (p1y !== p2y) {
            xinters = ((y - p1y) * (p2x - p1x)) / (p2y - p1y) + p1x;
          }

          if (p1x === p2x || x <= xinters) {
            inside = !inside;
          }
        }
      }
    }

    p1x = p2x;
    p1y = p2y;
  }

  return inside;
}

function pointInPolygon(point, polygonCoords) {
  const exterior = polygonCoords[0];

  if (!pointInRing(point, exterior)) return false;

  const holes = polygonCoords.slice(1);

  for (const hole of holes) {
    if (pointInRing(point, hole)) {
      return false;
    }
  }

  return true;
}

function isPointInsideGeometry(point, geometry) {
  if (!geometry) return false;

  const normalizedPoint = [normalizeLongitude(point[0]), point[1]];
  const normalizedGeometry = normalizeGeometryLongitudes(geometry);

  if (normalizedGeometry.type === "Polygon") {
    return pointInPolygon(normalizedPoint, normalizedGeometry.coordinates);
  }

  if (normalizedGeometry.type === "MultiPolygon") {
    return normalizedGeometry.coordinates.some((polyCoords) =>
      pointInPolygon(normalizedPoint, polyCoords)
    );
  }

  return false;
}

function getCentroid(geometry) {
  const normalizedGeometry = normalizeGeometryLongitudes(geometry);

  const coords =
    normalizedGeometry.type === "Polygon"
      ? normalizedGeometry.coordinates
      : normalizedGeometry.coordinates[0];

  const ring = coords[0];

  if (!ring || ring.length === 0) return [0, 0];

  let sumLng = 0;
  let sumLat = 0;
  const count = ring.length - 1;

  if (count <= 0) return [0, 0];

  for (let i = 0; i < count; i += 1) {
    sumLng += ring[i][0];
    sumLat += ring[i][1];
  }

  return [sumLng / count, sumLat / count];
}

function flattenCoordinates(coordinates) {
  if (!Array.isArray(coordinates)) return [];

  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    return [coordinates];
  }

  return coordinates.flatMap(flattenCoordinates);
}

function getGeometryBbox(geometry) {
  const normalizedGeometry = normalizeGeometryLongitudes(geometry);
  const points = flattenCoordinates(normalizedGeometry.coordinates);

  if (points.length === 0) {
    throw new Error("Geometry has no coordinates.");
  }

  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);

  return {
    west: Math.min(...lngs),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    north: Math.max(...lats),
  };
}

function ensureClosedRing(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return ring;

  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }

  return [...ring, first];
}

function ensureClosedPolygonCoordinates(polygonCoordinates) {
  return polygonCoordinates.map(ensureClosedRing);
}

function normalizeCountryId(countryId) {
  return String(countryId || DEFAULT_COUNTRY_ID).toLowerCase();
}

function normalizeAdminLevel(adminLevel) {
  const normalizedLevel = String(adminLevel || "adm2").toLowerCase();

  if (normalizedLevel === "province") return "adm2";

  return normalizedLevel;
}

function getFijiLocalBoundaryPath(adminLevel) {
  const normalizedLevel = String(adminLevel || "adm2").toLowerCase();
  return ADMIN_BOUNDARY_PATHS[normalizedLevel] ?? null;
}

function getPictBoundaryPath(countryId, adminLevel) {
  const normalizedCountryId = normalizeCountryId(countryId);
  const normalizedLevel = normalizeAdminLevel(adminLevel);

  return path.resolve(
    PICT_REFERENCE_DIR,
    normalizedCountryId,
    `${normalizedLevel}.geojson`,
  );
}

function getAdminBoundaryPath(countryId, adminLevel) {
  const normalizedCountryId = normalizeCountryId(countryId);
  const normalizedLevel = String(adminLevel || "adm2").toLowerCase();

  if (normalizedCountryId === DEFAULT_COUNTRY_ID) {
    const localFijiPath = getFijiLocalBoundaryPath(normalizedLevel);

    if (localFijiPath && fs.existsSync(localFijiPath)) {
      return localFijiPath;
    }
  }

  const pictPath = getPictBoundaryPath(normalizedCountryId, normalizedLevel);

  if (fs.existsSync(pictPath)) {
    return pictPath;
  }

  return pictPath;
}

function getAvailableAdminLevelsForCountry(countryId) {
  const normalizedCountryId = normalizeCountryId(countryId);
  const levels = [];

  if (normalizedCountryId === DEFAULT_COUNTRY_ID) {
    for (const [level, boundaryPath] of Object.entries(ADMIN_BOUNDARY_PATHS)) {
      if (fs.existsSync(boundaryPath)) {
        levels.push(level);
      }
    }
  }

  const countryReferenceDir = path.resolve(PICT_REFERENCE_DIR, normalizedCountryId);

  for (const level of ["adm0", "adm1", "adm2", "adm3"]) {
    const levelPath = path.resolve(countryReferenceDir, `${level}.geojson`);

    if (fs.existsSync(levelPath) && !levels.includes(level)) {
      levels.push(level);
    }
  }

  return levels;
}

function loadJsonFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(
      `Could not read JSON file ${filePath}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

function getCountryAssetCachePath(countryId) {
  const normalizedCountryId = normalizeCountryId(countryId);

  return getAdminAssetCachePath(
    "adm0",
    `${normalizedCountryId}_adm0_country`,
    getDefaultAssetTypesForLookup(null),
  );
}

function summarizeCountryAssetCache(countryId) {
  const cachePath = getCountryAssetCachePath(countryId);

  if (!fs.existsSync(cachePath)) {
    return {
      status: "missing",
      cache_path: cachePath,
      asset_count: 0,
    };
  }

  try {
    const payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const features = Array.isArray(payload.features) ? payload.features : [];

    return {
      status: "ready",
      cache_path: cachePath,
      asset_count: features.length,
      created_at: payload.created_at ?? null,
      source: payload.metadata?.source ?? null,
    };
  } catch (error) {
    return {
      status: "error",
      cache_path: cachePath,
      asset_count: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeCountryPopulationSource(countryId) {
  const normalizedCountryId = normalizeCountryId(countryId);
  const pictWorldPopPath = path.resolve(
    PICT_REFERENCE_DIR,
    normalizedCountryId,
    "worldpop",
    `${normalizedCountryId}_ppp_2020.tif`,
  );

  if (fs.existsSync(pictWorldPopPath)) {
    return {
      status: "ready",
      path: pictWorldPopPath,
      source: "WorldPop 2020",
    };
  }

  if (normalizedCountryId === DEFAULT_COUNTRY_ID && fs.existsSync(WORLDPOP_FJI_2020_PATH)) {
    return {
      status: "ready",
      path: WORLDPOP_FJI_2020_PATH,
      source: "WorldPop Fiji 2020 cache",
    };
  }

  return {
    status: "missing",
    path: pictWorldPopPath,
    source: "WorldPop 2020",
  };
}

function getKnownCountryRecord(countryId) {
  const normalizedCountryId = normalizeCountryId(countryId);

  return KNOWN_PICT_COUNTRIES.find(
    (country) => country.country_id === normalizedCountryId,
  );
}

function buildRegionRegistryResponse() {
  const registry = loadJsonFileIfExists(PICT_REGION_REGISTRY_PATH);
  const geofabrikManifest = loadJsonFileIfExists(PICT_GE0FABRIK_ASSET_MANIFEST_PATH);
  const countriesFromRegistry = registry?.countries ?? {};
  const countriesFromManifest = new Map();

  if (Array.isArray(geofabrikManifest?.results)) {
    for (const result of geofabrikManifest.results) {
      const countryId = String(result.country_iso3 || "").toLowerCase();

      if (countryId) {
        countriesFromManifest.set(countryId, result);
      }
    }
  }

  const allCountryIds = new Set([
    ...KNOWN_PICT_COUNTRIES.map((country) => country.country_id),
    ...Object.keys(countriesFromRegistry).map((countryId) => countryId.toLowerCase()),
    ...countriesFromManifest.keys(),
  ]);

  const countries = Array.from(allCountryIds)
    .sort()
    .map((countryId) => {
      const known = getKnownCountryRecord(countryId) ?? {};
      const registryCountry = countriesFromRegistry[countryId] ?? {};
      const manifestCountry = countriesFromManifest.get(countryId) ?? null;
      const availableAdminLevels = getAvailableAdminLevelsForCountry(countryId);
      const population = summarizeCountryPopulationSource(countryId);
      const assets = summarizeCountryAssetCache(countryId);

      return {
        country_id: countryId,
        country_iso3:
          known.country_iso3 || registryCountry.country_iso3 || countryId.toUpperCase(),
        country_name:
          known.country_name || registryCountry.country_name || countryId.toUpperCase(),
        available_admin_levels: availableAdminLevels,
        default_admin_level:
          countryId === DEFAULT_COUNTRY_ID && availableAdminLevels.includes("province")
            ? "province"
            : availableAdminLevels.includes("adm2")
              ? "adm2"
              : availableAdminLevels.includes("adm1")
                ? "adm1"
                : availableAdminLevels[0] ?? null,
        population,
        assets: {
          ...assets,
          geofabrik_status: manifestCountry?.status ?? null,
          geofabrik_country_asset_count: manifestCountry?.country_asset_count ?? null,
          geofabrik_errors: manifestCountry?.errors ?? [],
        },
        reference_dir: path.resolve(PICT_REFERENCE_DIR, countryId),
      };
    });

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    default_country_id: DEFAULT_COUNTRY_ID,
    registry_path: fs.existsSync(PICT_REGION_REGISTRY_PATH)
      ? PICT_REGION_REGISTRY_PATH
      : null,
    geofabrik_manifest_path: fs.existsSync(PICT_GE0FABRIK_ASSET_MANIFEST_PATH)
      ? PICT_GE0FABRIK_ASSET_MANIFEST_PATH
      : null,
    countries,
  };
}

function loadAdminBoundaryCollection(adminLevel, countryId = DEFAULT_COUNTRY_ID) {
  const normalizedCountryId = normalizeCountryId(countryId);
  const requestedLevel = String(adminLevel || "adm2").toLowerCase();
  const normalizedLevel = normalizeAdminLevel(requestedLevel);
  const boundaryPath = getAdminBoundaryPath(normalizedCountryId, requestedLevel);

  if (!fs.existsSync(boundaryPath)) {
    throw new Error(
      `Admin boundary file not found for country '${normalizedCountryId}' level '${adminLevel}': ${boundaryPath}`,
    );
  }

  const cacheKey = `${normalizedCountryId}:${requestedLevel}:${boundaryPath}`;

  if (adminBoundaryCache.has(cacheKey)) {
    return adminBoundaryCache.get(cacheKey);
  }

  const collection = JSON.parse(fs.readFileSync(boundaryPath, "utf8"));

  if (!collection?.features?.length) {
    throw new Error(`Admin boundary file has no features: ${boundaryPath}`);
  }

  const enrichedCollection = {
    ...collection,
    properties: {
      ...(collection.properties || {}),
      country_id: normalizedCountryId,
      requested_admin_level: requestedLevel,
      normalized_admin_level: normalizedLevel,
      source_path: boundaryPath,
    },
    features: collection.features.map((feature, index) => {
      const existingProperties = feature.properties || {};
      const adminId =
        existingProperties.admin_id ||
        existingProperties.shapeID ||
        existingProperties.GID_2 ||
        existingProperties.GID_1 ||
        existingProperties.id ||
        `${normalizedCountryId}_${normalizedLevel}_${index}`;
      const adminName =
        existingProperties.admin_name ||
        existingProperties.display_name ||
        existingProperties.shapeName ||
        existingProperties.NAME ||
        existingProperties.Name ||
        existingProperties.name ||
        adminId;

      return {
        ...feature,
        geometry: normalizeGeometryLongitudes(feature.geometry),
        properties: {
          ...existingProperties,
          country_id: existingProperties.country_id || normalizedCountryId,
          country_iso3:
            existingProperties.country_iso3 || normalizedCountryId.toUpperCase(),
          admin_level: existingProperties.admin_level || requestedLevel,
          normalized_admin_level: normalizedLevel,
          admin_id: adminId,
          admin_name: adminName,
        },
      };
    }),
  };

  adminBoundaryCache.set(cacheKey, enrichedCollection);

  return enrichedCollection;
}

function resolveAdminBoundary(adminLevel, adminId, countryId = DEFAULT_COUNTRY_ID) {
  const normalizedCountryId = normalizeCountryId(countryId);
  const collection = loadAdminBoundaryCollection(adminLevel, normalizedCountryId);
  const normalizedAdminId = String(adminId || "").toLowerCase();

  const feature = collection.features.find((candidate) => {
    const candidateId = String(
      candidate.properties?.admin_id || ""
    ).toLowerCase();

    return candidateId === normalizedAdminId;
  });

  if (!feature) {
    throw new Error(
      `Could not find admin boundary '${adminId}' in country '${normalizedCountryId}' level '${adminLevel}'.`
    );
  }

  return {
    feature: {
      ...feature,
      geometry: normalizeGeometryLongitudes(feature.geometry),
    },
    country_id: normalizedCountryId,
    country_iso3: feature.properties?.country_iso3 || normalizedCountryId.toUpperCase(),
    country_name:
      feature.properties?.country_name ||
      getKnownCountryRecord(normalizedCountryId)?.country_name ||
      normalizedCountryId.toUpperCase(),
    admin_level: feature.properties?.admin_level || adminLevel,
    normalized_admin_level: feature.properties?.normalized_admin_level || normalizeAdminLevel(adminLevel),
    admin_id: feature.properties?.admin_id || adminId,
    admin_name:
      feature.properties?.admin_name ||
      feature.properties?.display_name ||
      feature.properties?.shapeName ||
      adminId,
  };
}

function resolveAnalysisBoundary(body) {
  const {
    drawn_boundary,
    request_mode = "geometry",
    mode = request_mode,
    country_id = DEFAULT_COUNTRY_ID,
    admin_level = null,
    admin_id = null,
    admin_name = null,
  } = body;

  const normalizedMode = String(
    mode || request_mode || "geometry"
  ).toLowerCase();

  if (normalizedMode === "admin") {
    if (!admin_level || !admin_id) {
      throw new Error("Admin request mode requires admin_level and admin_id.");
    }

    const resolvedAdmin = resolveAdminBoundary(admin_level, admin_id, country_id);

    return {
      boundary: resolvedAdmin.feature.geometry,
      request_mode: "admin",
      country_id: resolvedAdmin.country_id,
      country_iso3: resolvedAdmin.country_iso3,
      country_name: resolvedAdmin.country_name,
      admin_level: resolvedAdmin.admin_level,
      normalized_admin_level: resolvedAdmin.normalized_admin_level,
      admin_id: resolvedAdmin.admin_id,
      admin_name: resolvedAdmin.admin_name || admin_name,
      boundary_source: "official_admin_boundary",
    };
  }

  if (!drawn_boundary) {
    throw new Error("Missing drawn_boundary for geometry request mode.");
  }

  return {
    boundary: normalizeGeometryLongitudes(drawn_boundary),
    request_mode: "geometry",
    country_id: normalizeCountryId(country_id),
    country_iso3: normalizeCountryId(country_id).toUpperCase(),
    country_name:
      getKnownCountryRecord(country_id)?.country_name ||
      normalizeCountryId(country_id).toUpperCase(),
    admin_level,
    admin_id,
    admin_name,
    boundary_source: "submitted_geometry",
  };
}

function getPolygonListFromGeometry(geometry) {
  const normalizedGeometry = normalizeGeometryLongitudes(geometry);

  if (normalizedGeometry.type === "Polygon") {
    return [ensureClosedPolygonCoordinates(normalizedGeometry.coordinates)];
  }

  if (normalizedGeometry.type === "MultiPolygon") {
    return normalizedGeometry.coordinates.map(ensureClosedPolygonCoordinates);
  }

  throw new Error(
    `H3 grid generation only supports Polygon and MultiPolygon. Received ${normalizedGeometry.type}.`
  );
}

function h3CellToPolygon(cellIndex) {
  const boundary = h3.cellToBoundary(cellIndex, true);
  const closedBoundary = ensureClosedRing(boundary);

  return {
    type: "Polygon",
    coordinates: [closedBoundary],
  };
}

function h3CellToCentroid(cellIndex) {
  const [lat, lng] = h3.cellToLatLng(cellIndex);
  return [normalizeLongitude(lng), lat];
}

function generateH3RiskGrid(boundaryGeometry, resolution = 7) {
  const numericResolution = clamp(
    Number.isFinite(Number(resolution)) ? Math.round(Number(resolution)) : 7,
    4,
    9
  );

  const polygons = getPolygonListFromGeometry(boundaryGeometry);
  const cells = new Set();

  for (const polygonCoordinates of polygons) {
    try {
      const polygonCells = h3.polygonToCells(
        polygonCoordinates,
        numericResolution,
        true
      );

      for (const cell of polygonCells) {
        cells.add(cell);
      }
    } catch (error) {
      console.warn("H3 polygonToCells failed for one polygon:", error);

      const fallbackCentroid = getCentroid({
        type: "Polygon",
        coordinates: polygonCoordinates,
      });

      if (
        Number.isFinite(fallbackCentroid[0]) &&
        Number.isFinite(fallbackCentroid[1])
      ) {
        cells.add(
          h3.latLngToCell(
            fallbackCentroid[1],
            fallbackCentroid[0],
            numericResolution
          )
        );
      }
    }
  }

  return [...cells].map((cellIndex) => ({
    id: cellIndex,
    h3_index: cellIndex,
    h3_resolution: numericResolution,
    centroid: h3CellToCentroid(cellIndex),
    geometry: h3CellToPolygon(cellIndex),
  }));
}

function generateH3RiskGridWithCellCap(
  boundaryGeometry,
  requestedResolution = 7,
  maxCells = MAX_LIVE_FORECAST_H3_CELLS
) {
  const safeRequestedResolution = clamp(
    Number.isFinite(Number(requestedResolution))
      ? Math.round(Number(requestedResolution))
      : 7,
    4,
    9
  );

  for (
    let resolution = safeRequestedResolution;
    resolution >= 4;
    resolution -= 1
  ) {
    const gridCells = generateH3RiskGrid(boundaryGeometry, resolution);

    if (gridCells.length <= maxCells || resolution === 4) {
      return {
        gridCells,
        requested_h3_resolution: safeRequestedResolution,
        h3_resolution: resolution,
        was_resolution_reduced: resolution !== safeRequestedResolution,
        max_live_forecast_cells: maxCells,
      };
    }
  }

  const fallbackGridCells = generateH3RiskGrid(boundaryGeometry, 4);

  return {
    gridCells: fallbackGridCells,
    requested_h3_resolution: safeRequestedResolution,
    h3_resolution: 4,
    was_resolution_reduced: safeRequestedResolution !== 4,
    max_live_forecast_cells: maxCells,
  };
}

function getMean(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sum = values.reduce((total, value) => total + value, 0);
  return sum / values.length;
}

function getQuantile(values, quantile) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const position = (sortedValues.length - 1) * quantile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const weight = position - lowerIndex;

  return (
    sortedValues[lowerIndex] * (1 - weight) +
    sortedValues[upperIndex] * weight
  );
}

function getFiniteNumberArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function getRiskCategoryFromExposureProbability(exposureProbability) {
  if (!Number.isFinite(exposureProbability)) return "low";

  if (exposureProbability >= 0.75) return "very_high";
  if (exposureProbability >= 0.5) return "high";
  if (exposureProbability >= 0.25) return "medium";
  return "low";
}

function getUncertaintyCategory(uncertaintyDelta) {
  if (!Number.isFinite(uncertaintyDelta)) return "unknown";

  if (uncertaintyDelta >= 4) return "high";
  if (uncertaintyDelta >= 2) return "medium";
  return "low";
}

function calculateHeatUncertaintyStats(heatValues, threshold) {
  const finiteHeatValues = getFiniteNumberArray(heatValues);

  if (finiteHeatValues.length === 0) {
    return {
      heat_mean: null,
      heat_p10: null,
      heat_p90: null,
      heat_min: null,
      heat_max: null,
      heat_delta_from_threshold: null,
      heat_uncertainty_delta: null,
      exposure_probability: null,
      risk_score: null,
      risk_category: "low",
      uncertainty_category: "unknown",
    };
  }

  const heatMean = getMean(finiteHeatValues);
  const heatP10 = getQuantile(finiteHeatValues, 0.1);
  const heatP90 = getQuantile(finiteHeatValues, 0.9);
  const heatMin = Math.min(...finiteHeatValues);
  const heatMax = Math.max(...finiteHeatValues);

  const exposedCount = finiteHeatValues.filter(
    (value) => value >= threshold
  ).length;

  const exposureProbability = exposedCount / finiteHeatValues.length;

  const heatDeltaFromThreshold =
    Number.isFinite(heatMean) ? heatMean - threshold : null;

  const heatUncertaintyDelta =
    Number.isFinite(heatP10) && Number.isFinite(heatP90)
      ? heatP90 - heatP10
      : null;

  return {
    heat_mean: heatMean,
    heat_p10: heatP10,
    heat_p90: heatP90,
    heat_min: heatMin,
    heat_max: heatMax,
    heat_delta_from_threshold: heatDeltaFromThreshold,
    heat_uncertainty_delta: heatUncertaintyDelta,
    exposure_probability: exposureProbability,
    risk_score: exposureProbability,
    risk_category: getRiskCategoryFromExposureProbability(exposureProbability),
    uncertainty_category: getUncertaintyCategory(heatUncertaintyDelta),
  };
}

function chunkArray(values, size) {
  const chunks = [];

  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }

  return chunks;
}

function addNormalizedForecastSpread(riskGridFeatures) {
  const maxSpread = riskGridFeatures.reduce((max, feature) => {
    const spread = Number(feature.properties?.heat_uncertainty_delta);
    return Number.isFinite(spread) ? Math.max(max, spread) : max;
  }, 0);

  return riskGridFeatures.map((feature) => {
    const spread = Number(feature.properties?.heat_uncertainty_delta);
    const normalizedForecastSpread =
      maxSpread > 0 && Number.isFinite(spread)
        ? clamp(spread / maxSpread, 0, 1)
        : 0;

    return {
      ...feature,
      properties: {
        ...feature.properties,
        forecast_spread: Number.isFinite(spread) ? spread : null,
        normalized_forecast_spread: normalizedForecastSpread,
        normalized_uncertainty: normalizedForecastSpread,
        uncertainty_display_mode: "outline_or_separate_layer",
      },
    };
  });
}

async function fetchOpenMeteoForecastBatch(batch) {
  const latitudes = batch
    .map((cell) => Number(cell.centroid[1]).toFixed(5))
    .join(",");

  const longitudes = batch
    .map((cell) => normalizeLongitude(cell.centroid[0]).toFixed(5))
    .join(",");

  const cacheKey = `${latitudes}|${longitudes}`;

  if (openMeteoForecastCache.has(cacheKey)) {
    return openMeteoForecastCache.get(cacheKey);
  }

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${latitudes}` +
    `&longitude=${longitudes}` +
    "&hourly=temperature_2m,apparent_temperature" +
    "&forecast_days=3" +
    "&timezone=UTC";

  let lastError = null;

  for (let attempt = 1; attempt <= OPEN_METEO_MAX_RETRIES; attempt += 1) {
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      const records = Array.isArray(data) ? data : [data];

      openMeteoForecastCache.set(cacheKey, records);

      return records;
    }

    const responseText = await response.text().catch(() => "");

    lastError = new Error(
      `Open-Meteo request failed with HTTP ${response.status}: ${responseText.slice(
        0,
        200
      )}`
    );

    if (response.status === 429 || response.status >= 500) {
      const waitMs = OPEN_METEO_BATCH_DELAY_MS * attempt * attempt;

      console.warn(
        `Open-Meteo batch failed with HTTP ${response.status}. Retrying in ${waitMs}ms. Attempt ${attempt}/${OPEN_METEO_MAX_RETRIES}.`
      );

      await sleep(waitMs);
      continue;
    }

    throw lastError;
  }

  throw lastError || new Error("Open-Meteo request failed.");
}

async function buildHeatUncertaintySurface(gridCells, threshold) {
  if (gridCells.length === 0) {
    return [];
  }

  const batches = chunkArray(gridCells, OPEN_METEO_BATCH_SIZE);
  const features = [];

  console.log("Fetching Open-Meteo forecasts:", {
    h3_cell_count: gridCells.length,
    batch_size: OPEN_METEO_BATCH_SIZE,
    batch_count: batches.length,
  });

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];

    if (batchIndex > 0) {
      await sleep(OPEN_METEO_BATCH_DELAY_MS);
    }

    console.log(
      `Open-Meteo batch ${batchIndex + 1}/${batches.length}: ${batch.length} cells`
    );

    const records = await fetchOpenMeteoForecastBatch(batch);

    for (let index = 0; index < batch.length; index += 1) {
      const cell = batch[index];
      const record = records[index] || records[0] || {};
      const hourly = record.hourly || {};

      const apparentTemperatureValues = getFiniteNumberArray(
        hourly.apparent_temperature
      );

      const temperatureValues = getFiniteNumberArray(hourly.temperature_2m);

      const heatValues =
        apparentTemperatureValues.length > 0
          ? apparentTemperatureValues
          : temperatureValues;

      const stats = calculateHeatUncertaintyStats(heatValues, threshold);

      features.push({
        type: "Feature",
        geometry: cell.geometry,
        properties: {
          layer_name: MANUAL_HEAT_RISK_LAYER,
          feature_role: "risk_grid",
          spatial_unit: "h3_hexagon",
          cell_id: cell.id,
          h3_index: cell.h3_index,
          h3_resolution: cell.h3_resolution,
          threshold,

          heat_value: stats.heat_mean,
          apparent_temperature: stats.heat_mean,
          temperature_2m:
            temperatureValues.length > 0 ? getMean(temperatureValues) : null,

          heat_mean: stats.heat_mean,
          heat_p10: stats.heat_p10,
          heat_p90: stats.heat_p90,
          heat_min: stats.heat_min,
          heat_max: stats.heat_max,
          heat_delta_from_threshold: stats.heat_delta_from_threshold,
          heat_uncertainty_delta: stats.heat_uncertainty_delta,
          exposure_probability: stats.exposure_probability,
          risk_score: stats.risk_score,
          risk_category: stats.risk_category,
          uncertainty_category: stats.uncertainty_category,

          description:
            "H3 heat-risk hexagon from Open-Meteo hourly forecast spread.",
        },
      });
    }
  }

  return addNormalizedForecastSpread(features);
}

async function ensureWorldPopFijiPopulationRaster() {
  fs.mkdirSync(WORLDPOP_CACHE_DIR, { recursive: true });

  if (
    fs.existsSync(WORLDPOP_FJI_2020_PATH) &&
    fs.statSync(WORLDPOP_FJI_2020_PATH).size > 0
  ) {
    return WORLDPOP_FJI_2020_PATH;
  }

  console.log("Downloading WorldPop Fiji 2020 population raster...");
  console.log(WORLDPOP_FJI_2020_URL);

  const response = await fetch(WORLDPOP_FJI_2020_URL);

  if (!response.ok) {
    throw new Error(
      `WorldPop Fiji population download failed with HTTP ${response.status}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(WORLDPOP_FJI_2020_PATH, Buffer.from(arrayBuffer));

  console.log(`Saved WorldPop Fiji raster to ${WORLDPOP_FJI_2020_PATH}`);

  return WORLDPOP_FJI_2020_PATH;
}

async function loadWorldPopFijiRaster() {
  if (worldPopFijiRasterCache) {
    return worldPopFijiRasterCache;
  }

  const rasterPath = await ensureWorldPopFijiPopulationRaster();
  const buffer = fs.readFileSync(rasterPath);

  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );

  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();

  const origin = image.getOrigin();
  const resolution = image.getResolution();
  const width = image.getWidth();
  const height = image.getHeight();
  const noData = image.getGDALNoData?.();

  worldPopFijiRasterCache = {
    image,
    origin,
    resolution,
    width,
    height,
    noData: noData === null || noData === undefined ? null : Number(noData),
  };

  console.log("Loaded WorldPop Fiji raster:", {
    origin,
    resolution,
    width,
    height,
    noData: worldPopFijiRasterCache.noData,
  });

  return worldPopFijiRasterCache;
}

function lonLatToRasterPixel(lng, lat, raster) {
  const [originX, originY] = raster.origin;
  const [resolutionX, resolutionY] = raster.resolution;

  const col = (normalizeLongitude(lng) - originX) / resolutionX;
  const row = (lat - originY) / resolutionY;

  return [col, row];
}

function rasterPixelToLonLat(col, row, raster) {
  const [originX, originY] = raster.origin;
  const [resolutionX, resolutionY] = raster.resolution;

  const lng = originX + (col + 0.5) * resolutionX;
  const lat = originY + (row + 0.5) * resolutionY;

  return [normalizeLongitude(lng), lat];
}

function getRasterWindowForGeometry(geometry, raster) {
  const bbox = getGeometryBbox(geometry);

  const corners = [
    [bbox.west, bbox.south],
    [bbox.west, bbox.north],
    [bbox.east, bbox.south],
    [bbox.east, bbox.north],
  ].map(([lng, lat]) => lonLatToRasterPixel(lng, lat, raster));

  const cols = corners.map((point) => point[0]);
  const rows = corners.map((point) => point[1]);

  const colMin = clamp(Math.floor(Math.min(...cols)), 0, raster.width - 1);
  const colMax = clamp(Math.ceil(Math.max(...cols)) + 1, 1, raster.width);
  const rowMin = clamp(Math.floor(Math.min(...rows)), 0, raster.height - 1);
  const rowMax = clamp(Math.ceil(Math.max(...rows)) + 1, 1, raster.height);

  if (colMax <= colMin || rowMax <= rowMin) {
    return null;
  }

  return [colMin, rowMin, colMax, rowMax];
}

async function sumWorldPopPopulationForGeometry(geometry) {
  const normalizedGeometry = normalizeGeometryLongitudes(geometry);
  const raster = await loadWorldPopFijiRaster();
  const window = getRasterWindowForGeometry(normalizedGeometry, raster);

  if (!window) {
    return 0;
  }

  const rasters = await raster.image.readRasters({ window });
  const values = rasters[0];

  const [colMin, rowMin, colMax, rowMax] = window;
  const windowWidth = colMax - colMin;

  let total = 0;

  for (let row = rowMin; row < rowMax; row += 1) {
    for (let col = colMin; col < colMax; col += 1) {
      const valueIndex = (row - rowMin) * windowWidth + (col - colMin);
      const numericValue = Number(values[valueIndex]);

      if (!Number.isFinite(numericValue)) continue;
      if (raster.noData !== null && numericValue === raster.noData) continue;
      if (numericValue < 0) continue;

      const pixelCenter = rasterPixelToLonLat(col, row, raster);

      if (!isPointInsideGeometry(pixelCenter, normalizedGeometry)) continue;

      total += numericValue;
    }
  }

  return total;
}

function getPopulationCacheKeyForRiskFeature(feature) {
  const h3Index =
    feature.properties?.h3_index ?? feature.properties?.source_h3_index;

  if (!h3Index) {
    return null;
  }

  const h3Resolution = feature.properties?.h3_resolution ?? "unknown";

  return `${h3Resolution}:${h3Index}`;
}

async function getWorldPopPopulationForRiskFeature(feature) {
  const cacheKey = getPopulationCacheKeyForRiskFeature(feature);

  if (cacheKey && worldPopPopulationByH3Cache.has(cacheKey)) {
    return {
      population: worldPopPopulationByH3Cache.get(cacheKey),
      cacheHit: true,
      cacheKey,
    };
  }

  const population = await sumWorldPopPopulationForGeometry(feature.geometry);

  if (cacheKey) {
    worldPopPopulationByH3Cache.set(cacheKey, population);
  }

  return {
    population,
    cacheHit: false,
    cacheKey,
  };
}


function getPriorityCategory(priorityScore) {
  if (!Number.isFinite(priorityScore)) return "low";

  if (priorityScore >= 0.6) return "very_high";
  if (priorityScore >= 0.35) return "high";
  if (priorityScore >= 0.15) return "medium";
  return "low";
}

function getRiskUncertaintyQuadrant(
  populationWeightedRiskScore,
  normalizedUncertainty
) {
  const highPopulationRisk = populationWeightedRiskScore >= 0.35;
  const highUncertainty = normalizedUncertainty >= 0.5;

  if (highPopulationRisk && highUncertainty) {
    return "high_exposure_high_uncertainty";
  }

  if (highPopulationRisk && !highUncertainty) {
    return "high_exposure_low_uncertainty";
  }

  if (!highPopulationRisk && highUncertainty) {
    return "low_exposure_high_uncertainty";
  }

  return "low_exposure_low_uncertainty";
}

async function buildPopulationWeightedHeatRiskSurface(
  riskGridFeatures,
  _analysisBoundary,
  threshold
) {
  const enrichedCells = [];
  let maxPopulation = 0;
  let maxExpectedExposedPopulation = 0;
  let maxForecastSpread = 0;
  let populationCacheHitCount = 0;
  let populationCacheMissCount = 0;

  console.log("Building WorldPop population overlay:", {
    h3_cell_count: riskGridFeatures.length,
    population_cache_size: worldPopPopulationByH3Cache.size,
  });

  for (const feature of riskGridFeatures) {
    const {
      population: rawPopulationEstimate,
      cacheHit,
      cacheKey,
    } = await getWorldPopPopulationForRiskFeature(feature);

    if (cacheHit) {
      populationCacheHitCount += 1;
    } else {
      populationCacheMissCount += 1;
    }

    const processedCellCount = enrichedCells.length + 1;

    if (
      processedCellCount === 1 ||
      processedCellCount % 25 === 0 ||
      processedCellCount === riskGridFeatures.length
    ) {
      console.log("WorldPop population progress:", {
        processed: processedCellCount,
        total: riskGridFeatures.length,
        cache_hits: populationCacheHitCount,
        cache_misses: populationCacheMissCount,
      });
    }

    const populationEstimate = Number.isFinite(rawPopulationEstimate)
      ? Math.max(0, rawPopulationEstimate)
      : 0;

    const exposureProbability = clamp(
      Number(
        feature.properties?.exposure_probability ??
          feature.properties?.risk_score ??
          0
      ),
      0,
      1
    );

    const forecastSpread = Math.max(
      0,
      Number(
        feature.properties?.forecast_spread ??
          feature.properties?.heat_uncertainty_delta ??
          0
      )
    );

    const normalizedForecastSpread = clamp(
      Number(
        feature.properties?.normalized_forecast_spread ??
          feature.properties?.normalized_uncertainty ??
          0
      ),
      0,
      1
    );

    const expectedExposedPopulation =
      populationEstimate * exposureProbability;

    maxPopulation = Math.max(maxPopulation, populationEstimate);
    maxExpectedExposedPopulation = Math.max(
      maxExpectedExposedPopulation,
      expectedExposedPopulation
    );
    maxForecastSpread = Math.max(maxForecastSpread, forecastSpread);

    enrichedCells.push({
      feature,
      populationEstimate,
      exposureProbability,
      forecastSpread,
      normalizedForecastSpread,
      expectedExposedPopulation,
      populationCacheHit: cacheHit,
      populationCacheKey: cacheKey,
    });
  }

  console.log("WorldPop population overlay complete:", {
    h3_cell_count: riskGridFeatures.length,
    cache_hits: populationCacheHitCount,
    cache_misses: populationCacheMissCount,
    population_cache_size: worldPopPopulationByH3Cache.size,
  });

  return enrichedCells.map((cell, index) => {
    const normalizedPopulation =
      maxPopulation > 0 ? cell.populationEstimate / maxPopulation : 0;

    const normalizedExpectedExposed =
      maxExpectedExposedPopulation > 0
        ? cell.expectedExposedPopulation / maxExpectedExposedPopulation
        : 0;

    const normalizedUncertainty =
      cell.normalizedForecastSpread ||
      (maxForecastSpread > 0 ? cell.forecastSpread / maxForecastSpread : 0);

    const priorityScore = clamp(
      0.7 * normalizedExpectedExposed +
        0.3 * normalizedExpectedExposed * normalizedUncertainty,
      0,
      1
    );

    const cellId =
      cell.feature.properties?.cell_id ||
      cell.feature.properties?.id ||
      `population_overlay_${index}`;

    const centroid = getFeatureCentroid(cell.feature);

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: centroid,
      },
      properties: {
        ...cell.feature.properties,
        layer_name: POPULATION_EXPOSURE_OVERLAY_LAYER,
        feature_role: "population_exposure_marker",
        spatial_unit: "h3_hexagon",
        cell_id: cellId,
        source_cell_id: cellId,
        source_h3_index: cell.feature.properties?.h3_index || null,
        threshold,
        population_estimate: cell.populationEstimate,
        expected_exposed_population: cell.expectedExposedPopulation,
        population_exposure_percent: cell.exposureProbability,
        exposure_probability: cell.exposureProbability,
        forecast_spread: cell.forecastSpread,
        heat_uncertainty_delta: cell.forecastSpread,
        normalized_population: normalizedPopulation,
        normalized_expected_exposed: normalizedExpectedExposed,
        normalized_forecast_spread: normalizedUncertainty,
        normalized_uncertainty: normalizedUncertainty,
        priority_score: priorityScore,
        priority_category: getPriorityCategory(priorityScore),
        risk_uncertainty_quadrant: getRiskUncertaintyQuadrant(
          cell.exposureProbability,
          normalizedUncertainty
        ),
        population_cache_hit: cell.populationCacheHit,
        population_cache_key: cell.populationCacheKey,
        population_source: "WorldPop Fiji 2020 population counts",
        description:
          "Expected exposed population marker using WorldPop Fiji 2020 counts and the H3 heat-exposure grid.",
      },
    };
  });
}

function buildPopulationHeatRiskSummary(populationRiskFeatures) {
  const totalPopulation = populationRiskFeatures.reduce(
    (sum, feature) => sum + Number(feature.properties?.population_estimate || 0),
    0
  );

  const expectedExposedPopulation = populationRiskFeatures.reduce(
    (sum, feature) =>
      sum + Number(feature.properties?.expected_exposed_population || 0),
    0
  );

  const highPriorityCells = populationRiskFeatures.filter((feature) => {
    const category = feature.properties?.priority_category;
    return category === "high" || category === "very_high";
  });

  const highUncertaintyDataGapCells = populationRiskFeatures.filter(
    (feature) =>
      feature.properties?.risk_uncertainty_quadrant ===
      "high_exposure_high_uncertainty"
  );

  const populationCacheHitCount = populationRiskFeatures.filter(
    (feature) => feature.properties?.population_cache_hit === true
  ).length;

  const populationCacheMissCount = populationRiskFeatures.filter(
    (feature) => feature.properties?.population_cache_hit === false
  ).length;

  const topPriorityCell =
    [...populationRiskFeatures].sort(
      (a, b) =>
        Number(b.properties?.priority_score || 0) -
        Number(a.properties?.priority_score || 0)
    )[0] || null;

  return {
    total_population: totalPopulation,
    expected_exposed_population: expectedExposedPopulation,
    total_expected_exposed_population: expectedExposedPopulation,
    exposure_percent:
      totalPopulation > 0 ? expectedExposedPopulation / totalPopulation : null,
    population_cache_hit_count: populationCacheHitCount,
    population_cache_miss_count: populationCacheMissCount,
    high_priority_cell_count: highPriorityCells.length,
    high_exposure_high_uncertainty_cell_count:
      highUncertaintyDataGapCells.length,
    high_priority_population: highPriorityCells.reduce(
      (sum, feature) =>
        sum + Number(feature.properties?.expected_exposed_population || 0),
      0
    ),
    top_priority_cell: topPriorityCell
      ? {
          cell_id: topPriorityCell.properties?.cell_id,
          h3_index: topPriorityCell.properties?.source_h3_index,
          population_estimate: topPriorityCell.properties?.population_estimate,
          expected_exposed_population:
            topPriorityCell.properties?.expected_exposed_population,
          exposure_probability:
            topPriorityCell.properties?.exposure_probability,
          forecast_spread: topPriorityCell.properties?.forecast_spread,
          normalized_forecast_spread:
            topPriorityCell.properties?.normalized_forecast_spread,
          priority_score: topPriorityCell.properties?.priority_score,
          priority_category: topPriorityCell.properties?.priority_category,
          risk_uncertainty_quadrant:
            topPriorityCell.properties?.risk_uncertainty_quadrant,
        }
      : null,
  };
}

function escapeOverpassString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatOverpassCoordinate(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  return String(Math.round(numericValue * 1_000_000) / 1_000_000);
}

function clampLatitudeForOverpass(lat) {
  return clamp(Number(lat), -90, 90);
}

function clampLongitudeForOverpass(lng) {
  return clamp(Number(lng), -180, 180);
}

function getOverpassBboxesForGeometry(geometry, paddingDegrees = 0.01) {
  const normalizedGeometry = normalizeGeometryLongitudes(geometry);
  const points = flattenCoordinates(normalizedGeometry.coordinates);

  if (points.length === 0) {
    throw new Error("Geometry has no coordinates for Overpass lookup.");
  }

  const longitudes = points
    .map((point) => normalizeLongitude(point[0]))
    .filter((value) => Number.isFinite(value));

  const latitudes = points
    .map((point) => Number(point[1]))
    .filter((value) => Number.isFinite(value));

  if (longitudes.length === 0 || latitudes.length === 0) {
    throw new Error("Geometry has no finite coordinates for Overpass lookup.");
  }

  const south = clampLatitudeForOverpass(
    Math.min(...latitudes) - paddingDegrees
  );
  const north = clampLatitudeForOverpass(
    Math.max(...latitudes) + paddingDegrees
  );

  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const rawLongitudeSpan = maxLng - minLng;

  // Fiji can cross the antimeridian. A naive bbox such as
  // west=-179.9/east=179.9 asks Overpass for almost the whole world and can
  // trigger HTTP 400/timeout responses. When the normalized longitude span is
  // wider than 180 degrees, wrap negative longitudes into [0, 360), compute the
  // compact bbox there, then split it into valid Overpass bboxes.
  if (rawLongitudeSpan > 180) {
    const wrappedLongitudes = longitudes.map((lng) =>
      lng < 0 ? lng + 360 : lng
    );

    const westWrapped = Math.min(...wrappedLongitudes) - paddingDegrees;
    const eastWrapped = Math.max(...wrappedLongitudes) + paddingDegrees;

    const splitBboxes = [];

    if (westWrapped < 180) {
      splitBboxes.push({
        west: clampLongitudeForOverpass(westWrapped),
        south,
        east: 180,
        north,
      });
    }

    if (eastWrapped > 180) {
      splitBboxes.push({
        west: -180,
        south,
        east: clampLongitudeForOverpass(eastWrapped - 360),
        north,
      });
    }

    if (splitBboxes.length > 0) {
      return splitBboxes.filter((bbox) => bbox.east > bbox.west);
    }
  }

  const west = clampLongitudeForOverpass(minLng - paddingDegrees);
  const east = clampLongitudeForOverpass(maxLng + paddingDegrees);

  if (east <= west) {
    return [
      {
        west: Math.min(west, east),
        south,
        east: Math.max(west, east),
        north,
      },
    ];
  }

  return [{ west, south, east, north }];
}

function buildOverpassClause(key, value, bbox) {
  const safeKey = escapeOverpassString(key);
  const safeValue = escapeOverpassString(value);
  const box = [
    formatOverpassCoordinate(bbox.south),
    formatOverpassCoordinate(bbox.west),
    formatOverpassCoordinate(bbox.north),
    formatOverpassCoordinate(bbox.east),
  ].join(",");

  return `
    node["${safeKey}"="${safeValue}"](${box});
    way["${safeKey}"="${safeValue}"](${box});
    relation["${safeKey}"="${safeValue}"](${box});
  `;
}

function getOverpassFilters(assetTypes) {
  const filtersByType = {
    hospital: [
      { key: "amenity", value: "hospital" },
      { key: "healthcare", value: "hospital" },
      { key: "healthcare", value: "clinic" },
    ],
    school: [
      { key: "amenity", value: "school" },
      { key: "amenity", value: "college" },
      { key: "amenity", value: "university" },
      { key: "amenity", value: "kindergarten" },
    ],
    port: [
      { key: "amenity", value: "ferry_terminal" },
      { key: "harbour", value: "yes" },
      { key: "man_made", value: "pier" },
    ],
    power_substation: [{ key: "power", value: "substation" }],
    critical_facility: [
      { key: "amenity", value: "fire_station" },
      { key: "amenity", value: "police" },
      { key: "emergency", value: "ambulance_station" },
    ],
  };

  const requestedTypes =
    Array.isArray(assetTypes) && assetTypes.length > 0
      ? assetTypes
      : ["hospital", "school", "port"];

  const filters = [];

  for (const assetType of requestedTypes) {
    const normalizedType = String(assetType).toLowerCase();
    const typeFilters = filtersByType[normalizedType] || [];

    for (const filter of typeFilters) {
      filters.push({
        ...filter,
        requestedAssetType: normalizedType,
      });
    }
  }

  return filters;
}

function roundForCache(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function normalizeAssetTypesForCache(assetTypes) {
  if (!Array.isArray(assetTypes) || assetTypes.length === 0) {
    return ["hospital", "school", "port"];
  }

  return assetTypes.map((type) => String(type).toLowerCase()).sort();
}

function getOverpassAssetCacheKey(drawnBoundary, assetTypes) {
  const bbox = getGeometryBbox(drawnBoundary);
  const normalizedAssetTypes = normalizeAssetTypesForCache(assetTypes);

  return JSON.stringify({
    west: roundForCache(bbox.west),
    south: roundForCache(bbox.south),
    east: roundForCache(bbox.east),
    north: roundForCache(bbox.north),
    assetTypes: normalizedAssetTypes,
  });
}

function getCachedOverpassAssets(cacheKey) {
  const cached = overpassAssetCache.get(cacheKey);

  if (!cached) return null;

  const isExpired = Date.now() - cached.createdAt > OVERPASS_ASSET_CACHE_TTL_MS;

  if (isExpired) {
    overpassAssetCache.delete(cacheKey);
    return null;
  }

  return cached.features;
}

function setCachedOverpassAssets(cacheKey, features) {
  overpassAssetCache.set(cacheKey, {
    createdAt: Date.now(),
    features,
  });
}

function sanitizeCacheToken(value) {
  return (
    String(value || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  );
}

function getAdminAssetCacheKey(adminLevel, adminId, assetTypes) {
  const normalizedLevel = sanitizeCacheToken(adminLevel || "adm2");
  const normalizedAdminId = sanitizeCacheToken(adminId);
  const normalizedAssetTypes = normalizeAssetTypesForCache(assetTypes);

  return `${normalizedLevel}:${normalizedAdminId}:${normalizedAssetTypes.join(",")}`;
}

function getAdminAssetCachePath(adminLevel, adminId, assetTypes) {
  const normalizedLevel = sanitizeCacheToken(adminLevel || "adm2");
  const normalizedAdminId = sanitizeCacheToken(adminId);
  const normalizedAssetTypes = normalizeAssetTypesForCache(assetTypes)
    .map(sanitizeCacheToken)
    .join("_");

  return path.resolve(
    ADMIN_ASSET_CACHE_DIR,
    `${normalizedLevel}_${normalizedAdminId}_${normalizedAssetTypes}.json`,
  );
}

function readAdminAssetDiskCache(adminLevel, adminId, assetTypes) {
  const cachePath = getAdminAssetCachePath(adminLevel, adminId, assetTypes);

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));

    if (
      payload?.schema_version !== ADMIN_ASSET_CACHE_SCHEMA_VERSION ||
      !Array.isArray(payload.features)
    ) {
      return null;
    }

    return {
      cachePath,
      features: payload.features,
      metadata: payload.metadata || {},
      created_at: payload.created_at || null,
    };
  } catch (error) {
    console.warn(
      `Could not read admin asset cache ${cachePath}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

function writeAdminAssetDiskCache(
  adminLevel,
  adminId,
  adminName,
  assetTypes,
  features,
) {
  fs.mkdirSync(ADMIN_ASSET_CACHE_DIR, { recursive: true });

  const cachePath = getAdminAssetCachePath(adminLevel, adminId, assetTypes);
  const normalizedAssetTypes = normalizeAssetTypesForCache(assetTypes);
  const createdAt = new Date().toISOString();

  const payload = {
    schema_version: ADMIN_ASSET_CACHE_SCHEMA_VERSION,
    created_at: createdAt,
    metadata: {
      admin_level: adminLevel,
      admin_id: adminId,
      admin_name: adminName,
      asset_types: normalizedAssetTypes,
      asset_count: features.length,
    },
    features,
  };

  try {
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.warn(
      `Could not write admin asset cache ${cachePath}:`,
      error instanceof Error ? error.message : error,
    );
  }

  return { cachePath, createdAt };
}

async function getAdminAssetFeaturesForBoundary(
  boundaryContext,
  analysisBoundary,
  assetTypes,
  options = {},
) {
  const { forceRefresh = false } = options;
  const isAdminBoundary =
    boundaryContext.request_mode === "admin" &&
    boundaryContext.admin_level &&
    boundaryContext.admin_id;

  if (!isAdminBoundary) {
    const features = await fetchOverpassAssets(analysisBoundary, assetTypes);
    return {
      features,
      cache_status: "geometry_live",
      cache_key: null,
      cache_path: null,
      cache_created_at: null,
    };
  }

  const cacheKey = getAdminAssetCacheKey(
    boundaryContext.admin_level,
    boundaryContext.admin_id,
    assetTypes,
  );

  if (!forceRefresh && adminAssetLookupCache.has(cacheKey)) {
    const cached = adminAssetLookupCache.get(cacheKey);
    return {
      features: cached.features,
      cache_status: "memory",
      cache_key: cacheKey,
      cache_path: cached.cache_path ?? null,
      cache_created_at: cached.created_at ?? null,
    };
  }

  if (!forceRefresh) {
    const diskCached = readAdminAssetDiskCache(
      boundaryContext.admin_level,
      boundaryContext.admin_id,
      assetTypes,
    );

    if (diskCached) {
      const createdAt = diskCached.created_at ?? null;
      adminAssetLookupCache.set(cacheKey, {
        features: diskCached.features,
        cache_path: diskCached.cachePath,
        created_at: createdAt,
      });

      return {
        features: diskCached.features,
        cache_status: "disk",
        cache_key: cacheKey,
        cache_path: diskCached.cachePath,
        cache_created_at: createdAt,
      };
    }
  }

  const features = await fetchOverpassAssets(analysisBoundary, assetTypes);
  const { cachePath, createdAt } = writeAdminAssetDiskCache(
    boundaryContext.admin_level,
    boundaryContext.admin_id,
    boundaryContext.admin_name,
    assetTypes,
    features,
  );

  adminAssetLookupCache.set(cacheKey, {
    features,
    cache_path: cachePath,
    created_at: createdAt,
  });

  return {
    features,
    cache_status: "live",
    cache_key: cacheKey,
    cache_path: cachePath,
    cache_created_at: createdAt,
  };
}

async function fetchOverpassAssets(drawnBoundary, assetTypes) {
  const cacheKey = getOverpassAssetCacheKey(drawnBoundary, assetTypes);
  const cachedAssets = getCachedOverpassAssets(cacheKey);

  if (cachedAssets) {
    console.log(`Using cached Overpass assets: ${cachedAssets.length} features`);
    return cachedAssets;
  }

  const filters = getOverpassFilters(assetTypes);

  if (filters.length === 0) {
    return [];
  }

  const overpassBboxes = getOverpassBboxesForGeometry(drawnBoundary, 0.01);

  if (overpassBboxes.length > 1) {
    console.log("Using split Overpass bboxes for antimeridian-safe lookup:", {
      bbox_count: overpassBboxes.length,
      bboxes: overpassBboxes,
    });
  }

  const clauses = overpassBboxes
    .flatMap((bbox) =>
      filters.map((filter) => buildOverpassClause(filter.key, filter.value, bbox))
    )
    .join("\n");

  const query = `
    [out:json][timeout:25];
    (
      ${clauses}
    );
    out center tags;
  `;

  const overpassEndpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  let lastError = null;

  for (const endpoint of overpassEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
          "User-Agent":
            "pict-climate-risk-viz-chatbot/0.1 (Brown University research prototype)",
        },
        body: new URLSearchParams({ data: query }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        lastError = new Error(
          `Overpass request failed with HTTP ${response.status} from ${endpoint}: ${errorText.slice(
            0,
            240
          )}`
        );

        console.warn(lastError.message);
        continue;
      }

      const data = await response.json();
      const elements = Array.isArray(data.elements) ? data.elements : [];
      const seenIds = new Set();
      const assetFeatures = [];

      for (const element of elements) {
        const lon = element.lon ?? element.center?.lon;
        const lat = element.lat ?? element.center?.lat;

        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
          continue;
        }

        if (!isPointInsideGeometry([lon, lat], drawnBoundary)) {
          continue;
        }

        const uniqueId = `${element.type}-${element.id}`;

        if (seenIds.has(uniqueId)) {
          continue;
        }

        seenIds.add(uniqueId);

        const tags = element.tags || {};
        const assetType = inferAssetType(tags);

        assetFeatures.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [normalizeLongitude(lon), lat],
          },
          properties: {
            layer_name: MANUAL_HEAT_RISK_ASSET_LAYER,
            feature_role: "raw_asset",
            asset_id: uniqueId,
            asset_name:
              tags.name ||
              tags["name:en"] ||
              tags.operator ||
              `${assetType} ${element.id}`,
            asset_type: assetType,
            osm_type: element.type,
            osm_id: element.id,
            osm_tags: tags,
            description:
              "Infrastructure asset retrieved from OpenStreetMap through Overpass.",
          },
        });
      }

      setCachedOverpassAssets(cacheKey, assetFeatures);

      console.log(
        `Fetched and cached Overpass assets: ${assetFeatures.length} features`
      );

      return assetFeatures;
    } catch (error) {
      lastError = error;
      console.warn(
        `Overpass endpoint failed: ${endpoint}`,
        error instanceof Error ? error.message : error
      );
    }
  }

  const fallbackCachedAssets = getCachedOverpassAssets(cacheKey);

  if (fallbackCachedAssets) {
    console.warn(
      `Overpass failed, using cached assets: ${fallbackCachedAssets.length} features`
    );
    return fallbackCachedAssets;
  }

  throw lastError || new Error("All Overpass endpoints failed.");
}

function inferAssetType(tags = {}) {
  if (
    tags.amenity === "hospital" ||
    tags.healthcare === "hospital" ||
    tags.amenity === "clinic"
  ) {
    return "hospital";
  }

  if (
    tags.amenity === "school" ||
    tags.amenity === "college" ||
    tags.amenity === "university" ||
    tags.amenity === "kindergarten"
  ) {
    return "school";
  }

  if (
    tags.harbour === "yes" ||
    tags["seamark:type"] === "harbour" ||
    tags.amenity === "ferry_terminal" ||
    tags.man_made === "pier"
  ) {
    return "port";
  }

  if (tags.power === "substation") {
    return "power_substation";
  }

  if (tags.highway) {
    return "road";
  }

  return "critical_facility";
}

function distanceSquared(pointA, pointB) {
  return (pointA[0] - pointB[0]) ** 2 + (pointA[1] - pointB[1]) ** 2;
}

function getFeatureCentroid(feature) {
  if (!feature?.geometry) {
    return [0, 0];
  }

  if (feature.geometry.type === "Point") {
    return feature.geometry.coordinates;
  }

  return getCentroid(feature.geometry);
}

function getAssetH3Index(asset, riskGridFeatures) {
  const assetPoint = getFeatureCentroid(asset);
  const firstH3Feature = riskGridFeatures.find(
    (feature) => feature.properties?.h3_resolution
  );

  const h3Resolution = Number(firstH3Feature?.properties?.h3_resolution);

  if (!Number.isFinite(h3Resolution)) {
    return null;
  }

  return h3.latLngToCell(
    assetPoint[1],
    normalizeLongitude(assetPoint[0]),
    h3Resolution
  );
}

function sampleAssetsAgainstRiskGrid(assetFeatures, riskGridFeatures, threshold) {
  const riskGridByH3 = new Map();

  for (const feature of riskGridFeatures) {
    const h3Index = feature.properties?.h3_index;

    if (h3Index) {
      riskGridByH3.set(h3Index, feature);
    }
  }

  return assetFeatures.map((asset) => {
    const assetPoint = getFeatureCentroid(asset);
    const assetH3Index = getAssetH3Index(asset, riskGridFeatures);

    const sameH3RiskFeature = assetH3Index
      ? riskGridByH3.get(assetH3Index)
      : null;

    const nearestRiskFeature =
      sameH3RiskFeature ||
      [...riskGridFeatures].sort((a, b) => {
        const aDistance = distanceSquared(assetPoint, getFeatureCentroid(a));
        const bDistance = distanceSquared(assetPoint, getFeatureCentroid(b));
        return aDistance - bDistance;
      })[0] ||
      null;

    const heatValue = Number(nearestRiskFeature?.properties?.heat_value);
    const heatMean = Number(nearestRiskFeature?.properties?.heat_mean);
    const heatP10 = Number(nearestRiskFeature?.properties?.heat_p10);
    const heatP90 = Number(nearestRiskFeature?.properties?.heat_p90);
    const forecastSpread = Number(
      nearestRiskFeature?.properties?.forecast_spread ??
        nearestRiskFeature?.properties?.heat_uncertainty_delta
    );
    const normalizedForecastSpread = Number(
      nearestRiskFeature?.properties?.normalized_forecast_spread ??
        nearestRiskFeature?.properties?.normalized_uncertainty
    );
    const exposureProbability = Number(
      nearestRiskFeature?.properties?.exposure_probability
    );

    const safeHeatValue = Number.isFinite(heatMean)
      ? heatMean
      : Number.isFinite(heatValue)
        ? heatValue
        : null;

    const safeExposureProbability = Number.isFinite(exposureProbability)
      ? exposureProbability
      : null;

    const exposed =
      safeExposureProbability !== null
        ? safeExposureProbability >= 0.5
        : safeHeatValue !== null
          ? safeHeatValue >= threshold
          : false;

    const exposureDifference =
      safeHeatValue !== null ? safeHeatValue - threshold : null;

    return {
      ...asset,
      properties: {
        ...asset.properties,
        feature_role: "ranked_asset",
        spatial_unit: "h3_hexagon",
        threshold,
        sampled_hazard_value: safeHeatValue,
        heat_value: safeHeatValue,
        heat_mean: Number.isFinite(heatMean) ? heatMean : null,
        heat_p10: Number.isFinite(heatP10) ? heatP10 : null,
        heat_p90: Number.isFinite(heatP90) ? heatP90 : null,
        forecast_spread: Number.isFinite(forecastSpread)
          ? forecastSpread
          : null,
        heat_uncertainty_delta: Number.isFinite(forecastSpread)
          ? forecastSpread
          : null,
        normalized_forecast_spread: Number.isFinite(normalizedForecastSpread)
          ? normalizedForecastSpread
          : null,
        normalized_uncertainty: Number.isFinite(normalizedForecastSpread)
          ? normalizedForecastSpread
          : null,
        exposure_probability: safeExposureProbability,
        risk_score: safeExposureProbability,
        exposed_to_hazard: exposed,
        exposure_difference: exposureDifference,
        asset_h3_index: assetH3Index,
        source_risk_cell_id: nearestRiskFeature?.properties?.cell_id || null,
        source_h3_index: nearestRiskFeature?.properties?.h3_index || null,
        description: `${asset.properties.asset_name} sampled against the matching or nearest H3 heat-risk hexagon.`,
      },
    };
  });
}

function rankSampledAssets(sampledAssets) {
  return [...sampledAssets]
    .sort((a, b) => {
      const aScore = Number(a.properties?.risk_score || 0);
      const bScore = Number(b.properties?.risk_score || 0);
      return bScore - aScore;
    })
    .map((asset, index) => ({
      ...asset,
      properties: {
        ...asset.properties,
        asset_rank: index + 1,
        asset_rank_score: Number(asset.properties?.risk_score || 0),
      },
    }));
}


function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getEditDistance(a, b) {
  const left = String(a || "");
  const right = String(b || "");

  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;

      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}

function tokenLooksLike(token, expectedTerms) {
  const normalizedToken = normalizeSearchText(token);

  if (!normalizedToken) return false;

  return expectedTerms.some((term) => {
    const normalizedTerm = normalizeSearchText(term);

    if (!normalizedTerm) return false;
    if (normalizedToken === normalizedTerm) return true;
    if (normalizedToken.includes(normalizedTerm)) return true;
    if (normalizedTerm.includes(normalizedToken) && normalizedToken.length >= 4) {
      return true;
    }

    const maxDistance = normalizedTerm.length <= 5 ? 1 : 2;

    return (
      normalizedToken.length >= 4 &&
      Math.abs(normalizedToken.length - normalizedTerm.length) <= maxDistance &&
      getEditDistance(normalizedToken, normalizedTerm) <= maxDistance
    );
  });
}

function queryHasTypeTerm(query, terms) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);

  return tokens.some((token) => tokenLooksLike(token, terms));
}

function getTokenMatchScore(queryToken, nameTokens) {
  if (!queryToken) return 0;

  if (nameTokens.has(queryToken)) return 12;

  for (const nameToken of nameTokens) {
    if (queryToken.length >= 3 && nameToken.includes(queryToken)) return 8;
    if (nameToken.length >= 3 && queryToken.includes(nameToken)) return 8;

    const maxDistance = Math.max(queryToken.length, nameToken.length) <= 5 ? 1 : 2;

    if (
      queryToken.length >= 4 &&
      nameToken.length >= 4 &&
      Math.abs(queryToken.length - nameToken.length) <= maxDistance &&
      getEditDistance(queryToken, nameToken) <= maxDistance
    ) {
      return 7;
    }
  }

  return 0;
}

function getAssetSearchScore(asset, query) {
  const normalizedQuery = normalizeSearchText(query);
  const assetName = normalizeSearchText(asset.properties?.asset_name);
  const assetType = normalizeSearchText(asset.properties?.asset_type);
  const operator = normalizeSearchText(asset.properties?.osm_tags?.operator);

  if (!normalizedQuery || !assetName) return 0;

  let score = 0;

  if (assetName === normalizedQuery) score += 120;
  if (assetName.includes(normalizedQuery)) score += 80;
  if (normalizedQuery.includes(assetName)) score += 50;

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const nameTokens = new Set(assetName.split(" ").filter(Boolean));

  for (const token of queryTokens) {
    score += getTokenMatchScore(token, nameTokens);
  }

  if (assetType && queryHasTypeTerm(normalizedQuery, [assetType])) score += 14;
  if (operator && operator.includes(normalizedQuery)) score += 8;

  return score;
}

function findAssetById(assetFeatures, assetId) {
  if (!assetId) return null;

  const normalizedAssetId = String(assetId);

  return (
    assetFeatures.find(
      (asset) => String(asset.properties?.asset_id) === normalizedAssetId
    ) || null
  );
}

function findBestMatchingAsset(assetFeatures, assetQuery, assetId = null) {
  const exactAsset = findAssetById(assetFeatures, assetId);

  if (exactAsset) {
    return {
      matchedAsset: exactAsset,
      matchScore: 999,
      candidateMatches: [exactAsset, ...assetFeatures]
        .filter((asset, index, array) =>
          index ===
          array.findIndex(
            (candidate) =>
              candidate.properties?.asset_id === asset.properties?.asset_id
          )
        )
        .slice(0, 5)
        .map((asset) => ({
          asset_id: asset.properties?.asset_id,
          asset_name: asset.properties?.asset_name,
          asset_type: asset.properties?.asset_type,
          score:
            asset.properties?.asset_id === exactAsset.properties?.asset_id
              ? 999
              : getAssetSearchScore(asset, assetQuery),
        })),
    };
  }

  const scoredAssets = assetFeatures
    .map((asset) => ({
      asset,
      score: getAssetSearchScore(asset, assetQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    matchedAsset: scoredAssets[0]?.asset ?? null,
    matchScore: scoredAssets[0]?.score ?? 0,
    candidateMatches: scoredAssets.slice(0, 5).map((entry) => ({
      asset_id: entry.asset.properties?.asset_id,
      asset_name: entry.asset.properties?.asset_name,
      asset_type: entry.asset.properties?.asset_type,
      score: entry.score,
    })),
  };
}

function inferAssetTypesFromQuery(assetQuery, fallbackAssetTypes = null) {
  if (Array.isArray(fallbackAssetTypes) && fallbackAssetTypes.length > 0) {
    return fallbackAssetTypes;
  }

  const query = normalizeSearchText(assetQuery);

  if (queryHasTypeTerm(query, ["hospital", "clinic", "health", "medical"])) {
    return ["hospital"];
  }

  if (
    queryHasTypeTerm(query, [
      "school",
      "college",
      "university",
      "kindergarten",
      "primary",
      "secondary",
    ])
  ) {
    return ["school"];
  }

  if (
    queryHasTypeTerm(query, ["port", "harbour", "harbor", "ferry", "pier", "jetty"])
  ) {
    return ["port"];
  }

  if (
    queryHasTypeTerm(query, [
      "substation",
      "power",
      "electric",
      "electricity",
    ])
  ) {
    return ["power_substation"];
  }

  return ["hospital", "school", "port", "power_substation", "critical_facility"];
}

function getDefaultAssetTypesForLookup(assetTypes = null) {
  if (Array.isArray(assetTypes) && assetTypes.length > 0) {
    return assetTypes;
  }

  return ["hospital", "school", "port", "power_substation", "critical_facility"];
}

function buildAssetLookupOption(asset) {
  const coordinates = getFeatureCentroid(asset);

  return {
    asset_id: asset.properties?.asset_id,
    asset_name: asset.properties?.asset_name,
    asset_type: asset.properties?.asset_type,
    osm_type: asset.properties?.osm_type,
    osm_id: asset.properties?.osm_id,
    coordinates,
  };
}

function sortAssetLookupOptions(assetOptions) {
  return [...assetOptions].sort((a, b) => {
    const typeComparison = String(a.asset_type || "").localeCompare(
      String(b.asset_type || "")
    );

    if (typeComparison !== 0) return typeComparison;

    return String(a.asset_name || "").localeCompare(
      String(b.asset_name || "")
    );
  });
}

function getAssetTypeCounts(assetOptions) {
  return assetOptions.reduce((counts, asset) => {
    const key = asset.asset_type || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function estimateH3DiskK(bufferKm, h3Resolution) {
  const safeBufferKm = Number.isFinite(Number(bufferKm))
    ? Math.max(1, Number(bufferKm))
    : 5;

  const safeResolution = Number.isFinite(Number(h3Resolution))
    ? Number(h3Resolution)
    : 7;

  const approximateCellSpacingKmByResolution = {
    4: 22,
    5: 8,
    6: 3,
    7: 1.2,
    8: 0.45,
    9: 0.17,
  };

  const spacing = approximateCellSpacingKmByResolution[safeResolution] ?? 1.2;

  return clamp(Math.ceil(safeBufferKm / spacing), 1, 6);
}

function generateH3DiskAroundPoint(
  pointCoordinates,
  resolution = 7,
  bufferKm = 5,
  optionalBoundary = null
) {
  const lng = normalizeLongitude(pointCoordinates[0]);
  const lat = pointCoordinates[1];

  const safeResolution = clamp(
    Number.isFinite(Number(resolution)) ? Math.round(Number(resolution)) : 7,
    4,
    9
  );

  const centerCell = h3.latLngToCell(lat, lng, safeResolution);
  const diskK = estimateH3DiskK(bufferKm, safeResolution);
  const cellIndexes = h3.gridDisk(centerCell, diskK);

  return cellIndexes
    .map((cellIndex) => {
      const centroid = h3CellToCentroid(cellIndex);

      return {
        id: cellIndex,
        h3_index: cellIndex,
        h3_resolution: safeResolution,
        centroid,
        geometry: h3CellToPolygon(cellIndex),
      };
    })
    .filter((cell) => {
      if (!optionalBoundary) return true;
      return isPointInsideGeometry(cell.centroid, optionalBoundary);
    });
}

function getNumber(value, fallback = null) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getFeatureNumber(feature, keys, fallback = null) {
  for (const key of keys) {
    const value = getNumber(feature.properties?.[key], null);

    if (value !== null) {
      return value;
    }
  }

  return fallback;
}

function meanOfNumbers(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) return null;

  return (
    finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
  );
}

function summarizeRiskGridFeatures(riskGridFeatures) {
  const riskCells = riskGridFeatures.filter(
    (feature) =>
      feature.properties?.feature_role === "risk_grid" ||
      feature.properties?.layer_name === MANUAL_HEAT_RISK_LAYER
  );

  const exposureValues = riskCells
    .map((feature) =>
      getFeatureNumber(feature, ["exposure_probability", "risk_score"], null)
    )
    .filter((value) => value !== null);

  const heatMeanValues = riskCells
    .map((feature) =>
      getFeatureNumber(feature, ["heat_mean", "heat_value"], null)
    )
    .filter((value) => value !== null);

  const forecastSpreadValues = riskCells
    .map((feature) =>
      getFeatureNumber(
        feature,
        ["forecast_spread", "heat_uncertainty_delta"],
        null
      )
    )
    .filter((value) => value !== null);

  const normalizedForecastSpreadValues = riskCells
    .map((feature) =>
      getFeatureNumber(
        feature,
        ["normalized_forecast_spread", "normalized_uncertainty"],
        null
      )
    )
    .filter((value) => value !== null);

  const highRiskCells = riskCells.filter(
    (feature) =>
      getFeatureNumber(feature, ["exposure_probability", "risk_score"], 0) >=
      0.5
  );

  const veryHighRiskCells = riskCells.filter(
    (feature) =>
      getFeatureNumber(feature, ["exposure_probability", "risk_score"], 0) >=
      0.75
  );

  const highSpreadCells = riskCells.filter(
    (feature) =>
      getFeatureNumber(
        feature,
        ["normalized_forecast_spread", "normalized_uncertainty"],
        0
      ) >= 0.67
  );

  const highRiskHighSpreadCells = riskCells.filter((feature) => {
    const exposureProbability = getFeatureNumber(
      feature,
      ["exposure_probability", "risk_score"],
      0
    );

    const normalizedForecastSpread = getFeatureNumber(
      feature,
      ["normalized_forecast_spread", "normalized_uncertainty"],
      0
    );

    return exposureProbability >= 0.5 && normalizedForecastSpread >= 0.67;
  });

  const topRiskCell =
    [...riskCells].sort(
      (a, b) =>
        getFeatureNumber(b, ["exposure_probability", "risk_score"], -1) -
        getFeatureNumber(a, ["exposure_probability", "risk_score"], -1)
    )[0] || null;

  const topSpreadCell =
    [...riskCells].sort(
      (a, b) =>
        getFeatureNumber(
          b,
          ["normalized_forecast_spread", "normalized_uncertainty"],
          -1
        ) -
        getFeatureNumber(
          a,
          ["normalized_forecast_spread", "normalized_uncertainty"],
          -1
        )
    )[0] || null;

  const topRiskHighSpreadCell =
    [...highRiskHighSpreadCells].sort((a, b) => {
      const aScore =
        getFeatureNumber(a, ["exposure_probability", "risk_score"], 0) *
        getFeatureNumber(
          a,
          ["normalized_forecast_spread", "normalized_uncertainty"],
          0
        );

      const bScore =
        getFeatureNumber(b, ["exposure_probability", "risk_score"], 0) *
        getFeatureNumber(
          b,
          ["normalized_forecast_spread", "normalized_uncertainty"],
          0
        );

      return bScore - aScore;
    })[0] || null;

  return {
    spatial_unit: "h3_hexagon",
    h3_cell_count: riskCells.length,
    grid_cell_count: riskCells.length,

    mean_exposure_probability: meanOfNumbers(exposureValues),
    max_exposure_probability:
      exposureValues.length > 0 ? Math.max(...exposureValues) : null,

    mean_heat: heatMeanValues.length > 0 ? meanOfNumbers(heatMeanValues) : null,
    max_heat: heatMeanValues.length > 0 ? Math.max(...heatMeanValues) : null,

    mean_forecast_spread:
      forecastSpreadValues.length > 0
        ? meanOfNumbers(forecastSpreadValues)
        : null,
    max_forecast_spread:
      forecastSpreadValues.length > 0 ? Math.max(...forecastSpreadValues) : null,

    mean_normalized_forecast_spread:
      normalizedForecastSpreadValues.length > 0
        ? meanOfNumbers(normalizedForecastSpreadValues)
        : null,

    high_risk_cell_count: highRiskCells.length,
    very_high_risk_cell_count: veryHighRiskCells.length,
    high_spread_cell_count: highSpreadCells.length,
    high_risk_high_spread_cell_count: highRiskHighSpreadCells.length,

    high_exposure_cell_count: highRiskCells.length,
    high_exposure_high_spread_cell_count: highRiskHighSpreadCells.length,
    high_uncertainty_cell_count: highSpreadCells.length,
    high_exposure_high_uncertainty_cell_count:
      highRiskHighSpreadCells.length,

    top_risk_cell: topRiskCell
      ? {
          cell_id: topRiskCell.properties?.cell_id,
          h3_index: topRiskCell.properties?.h3_index,
          exposure_probability: topRiskCell.properties?.exposure_probability,
          heat_mean: topRiskCell.properties?.heat_mean,
          forecast_spread:
            topRiskCell.properties?.forecast_spread ??
            topRiskCell.properties?.heat_uncertainty_delta,
          normalized_forecast_spread:
            topRiskCell.properties?.normalized_forecast_spread ??
            topRiskCell.properties?.normalized_uncertainty,
        }
      : null,

    top_spread_cell: topSpreadCell
      ? {
          cell_id: topSpreadCell.properties?.cell_id,
          h3_index: topSpreadCell.properties?.h3_index,
          exposure_probability: topSpreadCell.properties?.exposure_probability,
          heat_mean: topSpreadCell.properties?.heat_mean,
          forecast_spread:
            topSpreadCell.properties?.forecast_spread ??
            topSpreadCell.properties?.heat_uncertainty_delta,
          normalized_forecast_spread:
            topSpreadCell.properties?.normalized_forecast_spread ??
            topSpreadCell.properties?.normalized_uncertainty,
        }
      : null,

    top_risk_high_spread_cell: topRiskHighSpreadCell
      ? {
          cell_id: topRiskHighSpreadCell.properties?.cell_id,
          h3_index: topRiskHighSpreadCell.properties?.h3_index,
          exposure_probability:
            topRiskHighSpreadCell.properties?.exposure_probability,
          heat_mean: topRiskHighSpreadCell.properties?.heat_mean,
          forecast_spread:
            topRiskHighSpreadCell.properties?.forecast_spread ??
            topRiskHighSpreadCell.properties?.heat_uncertainty_delta,
          normalized_forecast_spread:
            topRiskHighSpreadCell.properties?.normalized_forecast_spread ??
            topRiskHighSpreadCell.properties?.normalized_uncertainty,
        }
      : null,
  };
}

function summarizePopulationOverlayFeatures(populationOverlayFeatures) {
  const totalPopulation = populationOverlayFeatures.reduce(
    (sum, feature) =>
      sum + getFeatureNumber(feature, ["population_estimate"], 0),
    0
  );

  const totalExpectedExposedPopulation = populationOverlayFeatures.reduce(
    (sum, feature) =>
      sum + getFeatureNumber(feature, ["expected_exposed_population"], 0),
    0
  );

  const highPriorityCells = populationOverlayFeatures.filter((feature) => {
    const category = feature.properties?.priority_category;
    return category === "high" || category === "very_high";
  });

  const urgentHighSpreadExposureCells = populationOverlayFeatures.filter(
    (feature) => {
      const exposureProbability = getFeatureNumber(
        feature,
        ["exposure_probability"],
        0
      );

      const normalizedForecastSpread = getFeatureNumber(
        feature,
        ["normalized_forecast_spread", "normalized_uncertainty"],
        0
      );

      return exposureProbability >= 0.5 && normalizedForecastSpread >= 0.67;
    }
  );

  const populationCacheHitCount = populationOverlayFeatures.filter(
    (feature) => feature.properties?.population_cache_hit === true
  ).length;

  const populationCacheMissCount = populationOverlayFeatures.filter(
    (feature) => feature.properties?.population_cache_hit === false
  ).length;

  const topExpectedExposedCell =
    [...populationOverlayFeatures].sort(
      (a, b) =>
        getFeatureNumber(b, ["expected_exposed_population"], -1) -
        getFeatureNumber(a, ["expected_exposed_population"], -1)
    )[0] || null;

  return {
    total_population: totalPopulation,
    expected_exposed_population: totalExpectedExposedPopulation,
    total_expected_exposed_population: totalExpectedExposedPopulation,
    exposure_percent:
      totalPopulation > 0
        ? totalExpectedExposedPopulation / totalPopulation
        : null,
    population_cache_hit_count: populationCacheHitCount,
    population_cache_miss_count: populationCacheMissCount,
    high_priority_cell_count: highPriorityCells.length,
    high_risk_high_spread_population_cell_count:
      urgentHighSpreadExposureCells.length,
    top_expected_exposed_cell: topExpectedExposedCell
      ? {
          cell_id: topExpectedExposedCell.properties?.cell_id,
          h3_index:
            topExpectedExposedCell.properties?.source_h3_index ??
            topExpectedExposedCell.properties?.h3_index,
          population_estimate:
            topExpectedExposedCell.properties?.population_estimate,
          expected_exposed_population:
            topExpectedExposedCell.properties?.expected_exposed_population,
          exposure_probability:
            topExpectedExposedCell.properties?.exposure_probability,
          forecast_spread:
            topExpectedExposedCell.properties?.forecast_spread ??
            topExpectedExposedCell.properties?.heat_uncertainty_delta,
          normalized_forecast_spread:
            topExpectedExposedCell.properties?.normalized_forecast_spread ??
            topExpectedExposedCell.properties?.normalized_uncertainty,
          priority_score: topExpectedExposedCell.properties?.priority_score,
          priority_category: topExpectedExposedCell.properties?.priority_category,
        }
      : null,
  };
}

function buildManualRiskSummary(
  riskGridFeatures,
  sampledAssets,
  populationOverlayFeatures = [],
  populationSummary = null
) {
  const exposedAssets = sampledAssets.filter(
    (feature) => feature.properties?.exposed_to_hazard === true
  );

  const unexposedAssets = sampledAssets.filter(
    (feature) => feature.properties?.exposed_to_hazard !== true
  );

  const missingValueAssets = sampledAssets.filter(
    (feature) => feature.properties?.sampled_hazard_value === null
  );

  const topAsset = sampledAssets[0] || null;

  const riskGridSummary = summarizeRiskGridFeatures(riskGridFeatures);

  const fallbackPopulationSummary = summarizePopulationOverlayFeatures(
    populationOverlayFeatures
  );

  const resolvedPopulationSummary = populationSummary
    ? {
        ...fallbackPopulationSummary,
        ...populationSummary,
        total_expected_exposed_population:
          populationSummary.total_expected_exposed_population ??
          populationSummary.expected_exposed_population ??
          fallbackPopulationSummary.total_expected_exposed_population,
      }
    : fallbackPopulationSummary;

  return {
    ...riskGridSummary,

    asset_count: sampledAssets.length,
    exposed_asset_count: exposedAssets.length,
    unexposed_asset_count: unexposedAssets.length,
    missing_value_count: missingValueAssets.length,

    asset_exposure_percent:
      sampledAssets.length > 0 ? exposedAssets.length / sampledAssets.length : null,

    exposure_percent:
      sampledAssets.length > 0 ? exposedAssets.length / sampledAssets.length : null,

    total_population: resolvedPopulationSummary.total_population ?? null,
    expected_exposed_population:
      resolvedPopulationSummary.expected_exposed_population ?? null,
    total_expected_exposed_population:
      resolvedPopulationSummary.total_expected_exposed_population ?? null,
    population_exposure_percent:
      resolvedPopulationSummary.exposure_percent ?? null,

    population_overlay: resolvedPopulationSummary,

    top_asset: topAsset
      ? {
          asset_id: topAsset.properties?.asset_id,
          asset_name: topAsset.properties?.asset_name,
          asset_type: topAsset.properties?.asset_type,
          sampled_hazard_value: topAsset.properties?.sampled_hazard_value,
          exposure_probability: topAsset.properties?.exposure_probability,
          forecast_spread:
            topAsset.properties?.forecast_spread ??
            topAsset.properties?.heat_uncertainty_delta,
          normalized_forecast_spread:
            topAsset.properties?.normalized_forecast_spread ??
            topAsset.properties?.normalized_uncertainty,
          exposed_to_hazard: topAsset.properties?.exposed_to_hazard,
          asset_rank_score: topAsset.properties?.asset_rank_score,
          source_h3_index: topAsset.properties?.source_h3_index,
        }
      : null,
  };
}

async function runManualHeatRiskMockup(body) {
  const {
    asset_types = ["hospital", "school", "port"],
    threshold = 22,
    comparison_operator = ">=",
    include_population = false,
    include_assets = true,
    h3_resolution = 7,
  } = body;

  const numericThreshold = Number(threshold);
  const numericH3Resolution = Number(h3_resolution);

  if (!Number.isFinite(numericThreshold)) {
    throw new Error(`Invalid threshold value: ${threshold}`);
  }

  if (!Number.isFinite(numericH3Resolution)) {
    throw new Error(`Invalid H3 resolution value: ${h3_resolution}`);
  }

  const boundaryContext = resolveAnalysisBoundary(body);
  const analysisBoundary = boundaryContext.boundary;

  const h3GridResult = generateH3RiskGridWithCellCap(
    analysisBoundary,
    numericH3Resolution
  );

  const gridCells = h3GridResult.gridCells;
  const actualH3Resolution = h3GridResult.h3_resolution;
  const warnings = [];

  if (h3GridResult.was_resolution_reduced) {
    warnings.push(
      `Requested H3 resolution ${h3GridResult.requested_h3_resolution} produced too many live forecast cells, so the backend used resolution ${h3GridResult.h3_resolution} for this run.`
    );
  }

  if (gridCells.length === 0) {
    warnings.push("No H3 hexagons were generated inside the analysis boundary.");
  }

  if (gridCells.length > 900) {
    warnings.push(
      `Generated ${gridCells.length} H3 hexagons. This may be slow because each hexagon is enriched with live forecast and population data.`
    );
  }

  console.log("Generated H3 heat-risk grid:", {
    request_mode: boundaryContext.request_mode,
    admin_level: boundaryContext.admin_level,
    admin_id: boundaryContext.admin_id,
    admin_name: boundaryContext.admin_name,
    requested_h3_resolution: h3GridResult.requested_h3_resolution,
    h3_resolution: actualH3Resolution,
    cell_count: gridCells.length,
    max_live_forecast_cells: h3GridResult.max_live_forecast_cells,
  });

  const riskGridFeatures = await buildHeatUncertaintySurface(
    gridCells,
    numericThreshold
  );

  for (const feature of riskGridFeatures) {
    feature.properties = {
      ...feature.properties,
      request_mode: boundaryContext.request_mode,
      country_id: boundaryContext.country_id,
      country_iso3: boundaryContext.country_iso3,
      country_name: boundaryContext.country_name,
      admin_level: boundaryContext.admin_level,
      admin_id: boundaryContext.admin_id,
      admin_name: boundaryContext.admin_name,
      boundary_source: boundaryContext.boundary_source,
    };
  }

  let populationOverlayFeatures = [];
  let populationSummary = null;

  if (include_population) {
    try {
      populationOverlayFeatures = await buildPopulationWeightedHeatRiskSurface(
        riskGridFeatures,
        analysisBoundary,
        numericThreshold
      );

      for (const feature of populationOverlayFeatures) {
        feature.properties = {
          ...feature.properties,
          request_mode: boundaryContext.request_mode,
          admin_level: boundaryContext.admin_level,
          admin_id: boundaryContext.admin_id,
          admin_name: boundaryContext.admin_name,
          boundary_source: boundaryContext.boundary_source,
        };
      }

      populationSummary = buildPopulationHeatRiskSummary(
        populationOverlayFeatures
      );

      if (populationOverlayFeatures.length === 0) {
        warnings.push("No population exposure overlay cells were generated.");
      }
    } catch (error) {
      warnings.push(
        `Population overlay failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  let assetFeatures = [];

  if (include_assets) {
    try {
      assetFeatures = await fetchOverpassAssets(analysisBoundary, asset_types);
    } catch (error) {
      warnings.push(
        `Infrastructure asset lookup failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (assetFeatures.length === 0) {
      warnings.push(
        "No requested infrastructure assets were found inside the analysis boundary."
      );
    }
  }

  const sampledAssets = include_assets
    ? sampleAssetsAgainstRiskGrid(
        assetFeatures,
        riskGridFeatures,
        numericThreshold
      )
    : [];

  const rankedAssets = include_assets ? rankSampledAssets(sampledAssets) : [];

  for (const feature of rankedAssets) {
    feature.properties = {
      ...feature.properties,
      request_mode: boundaryContext.request_mode,
      admin_level: boundaryContext.admin_level,
      admin_id: boundaryContext.admin_id,
      admin_name: boundaryContext.admin_name,
      boundary_source: boundaryContext.boundary_source,
    };
  }

  const manualSummary = buildManualRiskSummary(
    riskGridFeatures,
    rankedAssets,
    populationOverlayFeatures,
    populationSummary
  );

  return {
    type: "FeatureCollection",
    features: [
      ...riskGridFeatures,
      ...populationOverlayFeatures,
      ...rankedAssets,
    ],
    metadata: {
      analysis_type: "manual_heat_risk",
      risk_metric: "heat",
      threshold: numericThreshold,
      comparison_operator,
      include_population,
      include_assets,
      request_mode: boundaryContext.request_mode,
      admin_level: boundaryContext.admin_level,
      admin_id: boundaryContext.admin_id,
      admin_name: boundaryContext.admin_name,
      boundary_source: boundaryContext.boundary_source,

      spatial_unit: "h3_hexagon",
      requested_h3_resolution: h3GridResult.requested_h3_resolution,
      h3_resolution: actualH3Resolution,

      h3_cell_count: manualSummary.h3_cell_count,
      grid_cell_count: manualSummary.grid_cell_count,
      high_risk_cell_count: manualSummary.high_risk_cell_count,
      very_high_risk_cell_count: manualSummary.very_high_risk_cell_count,
      high_spread_cell_count: manualSummary.high_spread_cell_count,
      high_risk_high_spread_cell_count:
        manualSummary.high_risk_high_spread_cell_count,

      mean_exposure_probability: manualSummary.mean_exposure_probability,
      max_exposure_probability: manualSummary.max_exposure_probability,
      mean_forecast_spread: manualSummary.mean_forecast_spread,
      max_forecast_spread: manualSummary.max_forecast_spread,

      total_population: manualSummary.total_population,
      expected_exposed_population: manualSummary.expected_exposed_population,
      total_expected_exposed_population:
        manualSummary.total_expected_exposed_population,
      population_cache_hit_count:
        manualSummary.population_overlay?.population_cache_hit_count ?? null,
      population_cache_miss_count:
        manualSummary.population_overlay?.population_cache_miss_count ?? null,

      summary: manualSummary,
      warnings,

      provenance: {
        method: "h3_heat_risk_with_optional_population_and_assets",
        data_sources: [
          boundaryContext.request_mode === "admin"
            ? "Official admin boundary GeoJSON"
            : "Submitted custom geometry",
          "H3 hexagonal spatial index",
          "Open-Meteo Forecast API",
          ...(include_population
            ? ["WorldPop Fiji 2020 population counts"]
            : []),
          ...(include_assets ? ["Overpass API / OpenStreetMap"] : []),
        ],
        wrapper_chain: [
          "resolveAnalysisBoundary",
          "generateH3RiskGrid",
          "buildHeatUncertaintySurface",
          "addNormalizedForecastSpread",
          ...(include_population
            ? [
                "getWorldPopPopulationForRiskFeature",
                "sumWorldPopPopulationForGeometry",
                "buildPopulationWeightedHeatRiskSurface",
                "buildPopulationHeatRiskSummary",
              ]
            : []),
          ...(include_assets
            ? [
                "fetchOverpassAssets",
                "sampleAssetsAgainstRiskGrid",
                "rankSampledAssets",
              ]
            : []),
          "buildManualRiskSummary",
        ],
      },
    },
  };
}

async function runPopulationHeatRiskMockup(body) {
  const {
    threshold = 22,
    comparison_operator = ">=",
    h3_resolution = 7,
  } = body;

  const numericThreshold = Number(threshold);
  const numericH3Resolution = Number(h3_resolution);

  if (!Number.isFinite(numericThreshold)) {
    throw new Error(`Invalid threshold value: ${threshold}`);
  }

  if (!Number.isFinite(numericH3Resolution)) {
    throw new Error(`Invalid H3 resolution value: ${h3_resolution}`);
  }

  const boundaryContext = resolveAnalysisBoundary(body);
  const analysisBoundary = boundaryContext.boundary;

  const h3GridResult = generateH3RiskGridWithCellCap(
    analysisBoundary,
    numericH3Resolution
  );

  const gridCells = h3GridResult.gridCells;
  const actualH3Resolution = h3GridResult.h3_resolution;
  const warnings = [];

  if (h3GridResult.was_resolution_reduced) {
    warnings.push(
      `Requested H3 resolution ${h3GridResult.requested_h3_resolution} produced too many live forecast cells, so the backend used resolution ${h3GridResult.h3_resolution} for this run.`
    );
  }

  if (gridCells.length === 0) {
    warnings.push("No H3 hexagons were generated inside the analysis boundary.");
  }

  const heatRiskFeatures = await buildHeatUncertaintySurface(
    gridCells,
    numericThreshold
  );

  for (const feature of heatRiskFeatures) {
    feature.properties = {
      ...feature.properties,
      request_mode: boundaryContext.request_mode,
      admin_level: boundaryContext.admin_level,
      admin_id: boundaryContext.admin_id,
      admin_name: boundaryContext.admin_name,
      boundary_source: boundaryContext.boundary_source,
    };
  }

  const populationRiskFeatures = await buildPopulationWeightedHeatRiskSurface(
    heatRiskFeatures,
    analysisBoundary,
    numericThreshold
  );

  for (const feature of populationRiskFeatures) {
    feature.properties = {
      ...feature.properties,
      request_mode: boundaryContext.request_mode,
      admin_level: boundaryContext.admin_level,
      admin_id: boundaryContext.admin_id,
      admin_name: boundaryContext.admin_name,
      boundary_source: boundaryContext.boundary_source,
    };
  }

  if (populationRiskFeatures.length === 0) {
    warnings.push("No population-weighted heat-risk cells were generated.");
  }

  const riskGridSummary = summarizeRiskGridFeatures(heatRiskFeatures);
  const rawPopulationSummary = buildPopulationHeatRiskSummary(
    populationRiskFeatures
  );

  const populationSummary = {
    ...summarizePopulationOverlayFeatures(populationRiskFeatures),
    ...rawPopulationSummary,
    total_expected_exposed_population:
      rawPopulationSummary.total_expected_exposed_population ??
      rawPopulationSummary.expected_exposed_population ??
      null,
  };

  const combinedSummary = {
    ...riskGridSummary,
    ...populationSummary,
    population_overlay: populationSummary,
  };

  return {
    type: "FeatureCollection",
    features: populationRiskFeatures,
    metadata: {
      analysis_type: "population_heat_risk",
      risk_metric: "heat",
      threshold: numericThreshold,
      comparison_operator,
      request_mode: boundaryContext.request_mode,
      admin_level: boundaryContext.admin_level,
      admin_id: boundaryContext.admin_id,
      admin_name: boundaryContext.admin_name,
      boundary_source: boundaryContext.boundary_source,

      spatial_unit: "h3_hexagon",
      requested_h3_resolution: h3GridResult.requested_h3_resolution,
      h3_resolution: actualH3Resolution,

      h3_cell_count: riskGridSummary.h3_cell_count,
      grid_cell_count: riskGridSummary.grid_cell_count,
      high_risk_cell_count: riskGridSummary.high_risk_cell_count,
      very_high_risk_cell_count: riskGridSummary.very_high_risk_cell_count,
      high_spread_cell_count: riskGridSummary.high_spread_cell_count,
      high_risk_high_spread_cell_count:
        riskGridSummary.high_risk_high_spread_cell_count,

      mean_exposure_probability: riskGridSummary.mean_exposure_probability,
      max_exposure_probability: riskGridSummary.max_exposure_probability,
      mean_forecast_spread: riskGridSummary.mean_forecast_spread,
      max_forecast_spread: riskGridSummary.max_forecast_spread,

      total_population: populationSummary.total_population,
      expected_exposed_population:
        populationSummary.expected_exposed_population,
      total_expected_exposed_population:
        populationSummary.total_expected_exposed_population,
      population_cache_hit_count: populationSummary.population_cache_hit_count,
      population_cache_miss_count: populationSummary.population_cache_miss_count,

      summary: combinedSummary,
      warnings,

      provenance: {
        method: "h3_population_weighted_heat_risk",
        data_sources: [
          boundaryContext.request_mode === "admin"
            ? "Official Fiji admin boundary GeoJSON"
            : "Submitted custom geometry",
          "H3 hexagonal spatial index",
          "Open-Meteo Forecast API",
          "WorldPop Fiji 2020 population counts",
        ],
        wrapper_chain: [
          "resolveAnalysisBoundary",
          "generateH3RiskGrid",
          "buildHeatUncertaintySurface",
          "addNormalizedForecastSpread",
          "getWorldPopPopulationForRiskFeature",
                "sumWorldPopPopulationForGeometry",
          "buildPopulationWeightedHeatRiskSurface",
          "buildPopulationHeatRiskSummary",
          "summarizeRiskGridFeatures",
          "summarizePopulationOverlayFeatures",
        ],
      },
    },
  };
}


async function runAdminAssetLookup(body) {
  const { asset_types = null } = body;

  const boundaryContext = resolveAnalysisBoundary(body);
  const analysisBoundary = boundaryContext.boundary;
  const requestedAssetTypes = getDefaultAssetTypesForLookup(asset_types);
  const warnings = [];

  const adminAssetResult = await getAdminAssetFeaturesForBoundary(
    boundaryContext,
    analysisBoundary,
    requestedAssetTypes,
    { forceRefresh: body.force_refresh === true },
  );

  const assetFeatures = adminAssetResult.features;

  if (assetFeatures.length === 0) {
    warnings.push("No requested infrastructure assets were found in this area.");
  }

  const assets = sortAssetLookupOptions(assetFeatures.map(buildAssetLookupOption));

  return {
    assets,
    metadata: {
      analysis_type: "admin_asset_lookup",
      request_mode: boundaryContext.request_mode,
      admin_level: boundaryContext.admin_level,
      admin_id: boundaryContext.admin_id,
      admin_name: boundaryContext.admin_name,
      boundary_source: boundaryContext.boundary_source,
      asset_count: assets.length,
      asset_type_counts: getAssetTypeCounts(assets),
      placeholder_asset_name: assets[0]?.asset_name ?? null,
      requested_asset_types: requestedAssetTypes,
      asset_cache_status: adminAssetResult.cache_status,
      asset_cache_key: adminAssetResult.cache_key,
      asset_cache_path: adminAssetResult.cache_path,
      asset_cache_created_at: adminAssetResult.cache_created_at,
      warnings,
      provenance: {
        method: "admin_boundary_asset_lookup",
        data_sources: [
          boundaryContext.request_mode === "admin"
            ? "Official Fiji admin boundary GeoJSON"
            : "Submitted custom geometry",
          "Overpass API / OpenStreetMap",
        ],
        wrapper_chain: [
          "resolveAnalysisBoundary",
          "getAdminAssetFeaturesForBoundary",
          "fetchOverpassAssets",
          "buildAssetLookupOption",
        ],
      },
    },
  };
}

async function runAssetHeatRiskAnalysis(body) {
  const {
    asset_query,
    asset_id = null,
    asset_types = null,
    threshold = 22,
    comparison_operator = ">=",
    h3_resolution = 7,
    buffer_km = 5,
    include_population = true,
  } = body;

  if ((!asset_query || !String(asset_query).trim()) && !asset_id) {
    throw new Error("asset_query or asset_id is required.");
  }

  const numericThreshold = Number(threshold);
  const numericH3Resolution = Number(h3_resolution);
  const numericBufferKm = Number(buffer_km);

  if (!Number.isFinite(numericThreshold)) {
    throw new Error(`Invalid threshold value: ${threshold}`);
  }

  if (!Number.isFinite(numericH3Resolution)) {
    throw new Error(`Invalid H3 resolution value: ${h3_resolution}`);
  }

  const boundaryContext = resolveAnalysisBoundary(body);
  const analysisBoundary = boundaryContext.boundary;
  const warnings = [];

  const requestedAssetTypes = asset_id
    ? getDefaultAssetTypesForLookup(null)
    : inferAssetTypesFromQuery(asset_query, asset_types);

  const adminAssetResult = await getAdminAssetFeaturesForBoundary(
    boundaryContext,
    analysisBoundary,
    requestedAssetTypes,
    { forceRefresh: body.force_refresh === true },
  );

  const candidateAssets = adminAssetResult.features;

  if (candidateAssets.length === 0) {
    throw new Error(
      `No candidate assets were found for '${asset_query || asset_id}' in the selected area.`
    );
  }

  const { matchedAsset, matchScore, candidateMatches } = findBestMatchingAsset(
    candidateAssets,
    asset_query || asset_id,
    asset_id
  );

  if (!matchedAsset) {
    throw new Error(
      `Could not match '${asset_query || asset_id}' to an asset in the selected area.`
    );
  }

  if (!asset_id && matchScore < 25) {
    warnings.push(
      `The asset match for '${asset_query}' is weak. Check the returned candidate matches.`
    );
  }

  const assetPoint = getFeatureCentroid(matchedAsset);

  const gridCells = generateH3DiskAroundPoint(
    assetPoint,
    numericH3Resolution,
    Number.isFinite(numericBufferKm) ? numericBufferKm : 5,
    analysisBoundary
  );

  if (gridCells.length === 0) {
    throw new Error(
      `No H3 cells were generated around '${matchedAsset.properties?.asset_name}'.`
    );
  }

  if (gridCells.length > MAX_LIVE_FORECAST_H3_CELLS) {
    warnings.push(
      `The asset buffer generated ${gridCells.length} H3 cells. Consider reducing buffer_km or h3_resolution.`
    );
  }

  console.log("Running asset heat-risk analysis:", {
    asset_query,
    asset_id,
    matched_asset: matchedAsset.properties?.asset_name,
    match_score: matchScore,
    admin_id: boundaryContext.admin_id,
    admin_name: boundaryContext.admin_name,
    h3_resolution: numericH3Resolution,
    buffer_km: numericBufferKm,
    h3_cell_count: gridCells.length,
  });

  const riskGridFeatures = await buildHeatUncertaintySurface(
    gridCells,
    numericThreshold
  );

  for (const feature of riskGridFeatures) {
    feature.properties = {
      ...feature.properties,
      request_mode: boundaryContext.request_mode,
      admin_level: boundaryContext.admin_level,
      admin_id: boundaryContext.admin_id,
      admin_name: boundaryContext.admin_name,
      boundary_source: boundaryContext.boundary_source,
      asset_query: asset_query || matchedAsset.properties?.asset_name,
      focus_asset_id: matchedAsset.properties?.asset_id,
      focus_asset_name: matchedAsset.properties?.asset_name,
      buffer_km: Number.isFinite(numericBufferKm) ? numericBufferKm : 5,
    };
  }

  let populationOverlayFeatures = [];
  let populationSummary = null;

  if (include_population) {
    populationOverlayFeatures = await buildPopulationWeightedHeatRiskSurface(
      riskGridFeatures,
      analysisBoundary,
      numericThreshold
    );

    for (const feature of populationOverlayFeatures) {
      feature.properties = {
        ...feature.properties,
        request_mode: boundaryContext.request_mode,
        admin_level: boundaryContext.admin_level,
        admin_id: boundaryContext.admin_id,
        admin_name: boundaryContext.admin_name,
        boundary_source: boundaryContext.boundary_source,
        asset_query: asset_query || matchedAsset.properties?.asset_name,
        focus_asset_id: matchedAsset.properties?.asset_id,
        focus_asset_name: matchedAsset.properties?.asset_name,
        buffer_km: Number.isFinite(numericBufferKm) ? numericBufferKm : 5,
      };
    }

    populationSummary = buildPopulationHeatRiskSummary(
      populationOverlayFeatures
    );
  }

  const sampledFocusedAsset = sampleAssetsAgainstRiskGrid(
    [
      {
        ...matchedAsset,
        properties: {
          ...matchedAsset.properties,
          layer_name: MANUAL_HEAT_RISK_ASSET_LAYER,
          feature_role: "focus_asset",
        },
      },
    ],
    riskGridFeatures,
    numericThreshold
  );

  const rankedFocusedAsset = rankSampledAssets(sampledFocusedAsset).map(
    (asset) => ({
      ...asset,
      properties: {
        ...asset.properties,
        request_mode: boundaryContext.request_mode,
        admin_level: boundaryContext.admin_level,
        admin_id: boundaryContext.admin_id,
        admin_name: boundaryContext.admin_name,
        boundary_source: boundaryContext.boundary_source,
        asset_query: asset_query || matchedAsset.properties?.asset_name,
        focus_asset: true,
        buffer_km: Number.isFinite(numericBufferKm) ? numericBufferKm : 5,
      },
    })
  );

  const summary = buildManualRiskSummary(
    riskGridFeatures,
    rankedFocusedAsset,
    populationOverlayFeatures,
    populationSummary
  );

  const focusAsset = rankedFocusedAsset[0] ?? null;

  return {
    type: "FeatureCollection",
    features: [
      ...riskGridFeatures,
      ...populationOverlayFeatures,
      ...rankedFocusedAsset,
    ],
    metadata: {
      analysis_type: "asset_heat_risk",
      risk_metric: "heat",
      threshold: numericThreshold,
      comparison_operator,
      include_population,
      include_assets: true,

      request_mode: boundaryContext.request_mode,
      admin_level: boundaryContext.admin_level,
      admin_id: boundaryContext.admin_id,
      admin_name: boundaryContext.admin_name,
      boundary_source: boundaryContext.boundary_source,

      asset_query: asset_query || matchedAsset.properties?.asset_name,
      asset_id: matchedAsset.properties?.asset_id,
      buffer_km: Number.isFinite(numericBufferKm) ? numericBufferKm : 5,

      matched_asset: focusAsset
        ? {
            asset_id: focusAsset.properties?.asset_id,
            asset_name: focusAsset.properties?.asset_name,
            asset_type: focusAsset.properties?.asset_type,
            osm_type: focusAsset.properties?.osm_type,
            osm_id: focusAsset.properties?.osm_id,
            coordinates: focusAsset.geometry?.coordinates,
            exposure_probability: focusAsset.properties?.exposure_probability,
            heat_mean: focusAsset.properties?.heat_mean,
            heat_p10: focusAsset.properties?.heat_p10,
            heat_p90: focusAsset.properties?.heat_p90,
            forecast_spread: focusAsset.properties?.forecast_spread,
            normalized_forecast_spread:
              focusAsset.properties?.normalized_forecast_spread,
            exposed_to_hazard: focusAsset.properties?.exposed_to_hazard,
            source_h3_index: focusAsset.properties?.source_h3_index,
          }
        : null,

      match_score: matchScore,
      candidate_matches: candidateMatches,
      asset_cache_status: adminAssetResult.cache_status,
      asset_cache_key: adminAssetResult.cache_key,
      asset_cache_path: adminAssetResult.cache_path,
      asset_cache_created_at: adminAssetResult.cache_created_at,

      spatial_unit: "h3_hexagon",
      requested_h3_resolution: numericH3Resolution,
      h3_resolution: numericH3Resolution,

      h3_cell_count: summary.h3_cell_count,
      grid_cell_count: summary.grid_cell_count,
      high_risk_cell_count: summary.high_risk_cell_count,
      very_high_risk_cell_count: summary.very_high_risk_cell_count,
      high_spread_cell_count: summary.high_spread_cell_count,
      high_risk_high_spread_cell_count:
        summary.high_risk_high_spread_cell_count,

      mean_exposure_probability: summary.mean_exposure_probability,
      max_exposure_probability: summary.max_exposure_probability,
      mean_forecast_spread: summary.mean_forecast_spread,
      max_forecast_spread: summary.max_forecast_spread,

      total_population: summary.total_population,
      expected_exposed_population: summary.expected_exposed_population,
      total_expected_exposed_population:
        summary.total_expected_exposed_population,

      population_cache_hit_count:
        summary.population_overlay?.population_cache_hit_count ?? null,
      population_cache_miss_count:
        summary.population_overlay?.population_cache_miss_count ?? null,

      summary,
      warnings,

      provenance: {
        method: "asset_centered_h3_heat_risk",
        data_sources: [
          boundaryContext.request_mode === "admin"
            ? "Official Fiji admin boundary GeoJSON"
            : "Submitted custom geometry",
          "Overpass API / OpenStreetMap",
          "H3 hexagonal spatial index",
          "Open-Meteo Forecast API",
          ...(include_population
            ? ["WorldPop Fiji 2020 population counts"]
            : []),
        ],
        wrapper_chain: [
          "resolveAnalysisBoundary",
          "getAdminAssetFeaturesForBoundary",
          "fetchOverpassAssets",
          "findBestMatchingAsset",
          "generateH3DiskAroundPoint",
          "buildHeatUncertaintySurface",
          "addNormalizedForecastSpread",
          ...(include_population
            ? [
                "getWorldPopPopulationForRiskFeature",
                "sumWorldPopPopulationForGeometry",
                "buildPopulationWeightedHeatRiskSurface",
                "buildPopulationHeatRiskSummary",
              ]
            : []),
          "sampleAssetsAgainstRiskGrid",
          "rankSampledAssets",
          "buildManualRiskSummary",
        ],
      },
    },
  };
}

async function warmAdminAssetCacheOnStartup() {
  if (!ADMIN_ASSET_WARMUP_ENABLED) {
    console.log("Admin asset cache warmup disabled by ADMIN_ASSET_WARMUP=false.");
    return;
  }

  const requestedAssetTypes = getDefaultAssetTypesForLookup();

  let collection;

  try {
    collection = loadAdminBoundaryCollection("adm2");
  } catch (error) {
    console.warn(
      "Admin asset cache warmup skipped because ADM2 boundaries could not be loaded:",
      error instanceof Error ? error.message : error,
    );
    return;
  }

  console.log("Starting admin asset cache warmup:", {
    admin_level: "adm2",
    province_count: collection.features.length,
    requested_asset_types: requestedAssetTypes,
    cache_dir: ADMIN_ASSET_CACHE_DIR,
  });

  let warmedCount = 0;
  let failedCount = 0;

  for (const feature of collection.features) {
    const adminLevel = feature.properties?.admin_level || "adm2";
    const adminId = feature.properties?.admin_id;
    const adminName =
      feature.properties?.admin_name ||
      feature.properties?.display_name ||
      feature.properties?.shapeName ||
      adminId;

    if (!adminId) {
      continue;
    }

    const boundaryContext = {
      boundary: normalizeGeometryLongitudes(feature.geometry),
      request_mode: "admin",
      admin_level: adminLevel,
      admin_id: adminId,
      admin_name: adminName,
      boundary_source: "official_admin_boundary",
    };

    try {
      const result = await getAdminAssetFeaturesForBoundary(
        boundaryContext,
        boundaryContext.boundary,
        requestedAssetTypes,
      );

      warmedCount += 1;

      console.log("Admin asset cache warmed:", {
        admin_id: adminId,
        admin_name: adminName,
        asset_count: result.features.length,
        cache_status: result.cache_status,
      });
    } catch (error) {
      failedCount += 1;

      console.warn(
        `Admin asset cache warmup failed for ${adminName || adminId}:`,
        error instanceof Error ? error.message : error,
      );
    }

    await sleep(ADMIN_ASSET_WARMUP_DELAY_MS);
  }

  console.log("Admin asset cache warmup complete:", {
    warmed_count: warmedCount,
    failed_count: failedCount,
    cache_size: adminAssetLookupCache.size,
  });
}


app.get("/api/climate-catalog", (req, res) => {
  try {
    const catalog = loadClimateCatalog();
    const requestedVariable = req.query.variable
      ? String(req.query.variable)
      : null;

    const variables = listClimateVariables(catalog);
    const compatibleMetricsByVariable = Object.fromEntries(
      variables.map((variable) => [
        variable.variable_id,
        getCompatibleMetrics(variable.variable_id, catalog),
      ]),
    );

    if (requestedVariable) {
      const variable = variables.find(
        (item) => item.variable_id === requestedVariable,
      );

      if (!variable) {
        return res.status(404).json({
          error: `Unknown climate variable: ${requestedVariable}`,
          available_variables: variables.map((item) => item.variable_id),
        });
      }

      return res.json({
        version: catalog.version,
        variable,
        metrics: compatibleMetricsByVariable[requestedVariable] ?? [],
        thresholds_c:
          catalog.thresholds.variables[requestedVariable]?.thresholds_c ?? [],
        default_threshold_c:
          catalog.thresholds.variables[requestedVariable]?.default_threshold_c ??
          null,
        time_windows: catalog.indices.time_windows,
        datasets: catalog.sources.datasets.filter(
          (dataset) => dataset.variable === requestedVariable,
        ),
      });
    }

    return res.json({
      version: catalog.version,
      generated_from: catalog.generated_from,
      variables,
      thresholds: catalog.thresholds,
      metrics: catalog.indices.metrics,
      mvp_metrics: catalog.indices.mvp_metrics,
      time_windows: catalog.indices.time_windows,
      compatible_metrics_by_variable: compatibleMetricsByVariable,
      sources: catalog.sources,
      modes: {
        forecast_heat: {
          label: "Forecast heat",
          precomputed: false,
          description:
            "Current short-term heat workflow. This stays live and continues using Open-Meteo forecast data.",
        },
        climate_indices: {
          label: "Climate indices",
          precomputed: true,
          description:
            "Yearly, 5-year, and decade heat layers computed ahead of time from climate NetCDF datasets.",
        },
      },
    });
  } catch (error) {
    console.error("Climate catalog lookup failed:", error);

    return res.status(500).json({
      error: "Climate catalog lookup failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});


app.get("/api/regions", (_req, res) => {
  try {
    return res.json(buildRegionRegistryResponse());
  } catch (error) {
    console.error("Region registry failed:", error);

    return res.status(500).json({
      error: "Region registry failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/admin-boundaries", (req, res) => {
  try {
    const countryId = normalizeCountryId(req.query.country_id);
    const adminLevel = String(req.query.admin_level || "adm2").toLowerCase();
    const collection = loadAdminBoundaryCollection(adminLevel, countryId);

    return res.json({
      ...collection,
      metadata: {
        country_id: countryId,
        admin_level: adminLevel,
        normalized_admin_level: normalizeAdminLevel(adminLevel),
        feature_count: collection.features.length,
        source_path: collection.properties?.source_path ?? null,
      },
    });
  } catch (error) {
    console.error("Admin boundaries lookup failed:", error);

    return res.status(500).json({
      type: "FeatureCollection",
      features: [],
      metadata: {
        country_id: normalizeCountryId(req.query.country_id),
        admin_level: req.query.admin_level ?? null,
        feature_count: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/interpret-results", async (req, res) => {
  try {
    const { result_summary } = req.body;

    if (!result_summary) {
      return res.status(400).json({
        error: "result_summary is required",
      });
    }

    const result = await interpretResults(result_summary);

    return res.json(result);
  } catch (error) {
    console.error("Result interpretation failed:", error);

    return res.status(500).json({
      error: "Result interpretation failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});


app.post("/api/admin-assets", async (req, res) => {
  try {
    const result = await runAdminAssetLookup(req.body);
    return res.json(result);
  } catch (error) {
    console.error("Admin asset lookup failed:", error);

    return res.status(500).json({
      assets: [],
      metadata: {
        analysis_type: "admin_asset_lookup",
        request_mode: req.body.request_mode ?? req.body.mode ?? "admin",
        country_id: req.body.country_id ?? DEFAULT_COUNTRY_ID,
        admin_level: req.body.admin_level ?? null,
        admin_id: req.body.admin_id ?? null,
        admin_name: req.body.admin_name ?? null,
        asset_count: 0,
        asset_type_counts: {},
        placeholder_asset_name: null,
        asset_cache_status: "error",
        asset_cache_key: null,
        asset_cache_path: null,
        asset_cache_created_at: null,
        warnings: [error instanceof Error ? error.message : String(error)],
        provenance: {
          method: "admin_boundary_asset_lookup",
          data_sources: [],
          wrapper_chain: [],
        },
      },
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/asset-heat-risk", async (req, res) => {
  try {
    const result = await runAssetHeatRiskAnalysis(req.body);
    return res.json(result);
  } catch (error) {
    console.error("Asset heat risk failed:", error);

    return res.status(500).json({
      type: "FeatureCollection",
      features: [],
      metadata: {
        analysis_type: "asset_heat_risk",
        asset_query: req.body.asset_query ?? null,
        asset_id: req.body.asset_id ?? null,
        risk_metric: "heat",
        threshold: req.body.threshold ?? 22,
        comparison_operator: req.body.comparison_operator ?? ">=",
        request_mode: req.body.request_mode ?? req.body.mode ?? "geometry",
        admin_level: req.body.admin_level ?? null,
        admin_id: req.body.admin_id ?? null,
        admin_name: req.body.admin_name ?? null,
        spatial_unit: "h3_hexagon",
        h3_cell_count: 0,
        grid_cell_count: 0,
        matched_asset: null,
        candidate_matches: [],
        summary: null,
        warnings: [error instanceof Error ? error.message : String(error)],
        provenance: {
          method: "asset_centered_h3_heat_risk",
          data_sources: [],
          wrapper_chain: [],
        },
      },
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/spatial-query", async (req, res) => {
  const {
    drawn_boundary,
    target_layers = [],
    analysis_type,
    request_mode = "geometry",
    mode = request_mode,
    admin_level = null,
    admin_id = null,
    admin_name = null,
    h3_resolution = null,
  } = req.body;

  const normalizedMode = String(mode || request_mode || "geometry").toLowerCase();

  const hasBoundary =
    drawn_boundary ||
    (normalizedMode === "admin" && admin_level && admin_id);

  if (!hasBoundary) {
    return res.status(400).json({
      error:
        "Request requires either drawn_boundary or admin request fields admin_level/admin_id.",
    });
  }

  const loggingGeometry = drawn_boundary || {
    type: "AdminBoundary",
    coordinates: [],
  };

  const geometryType = loggingGeometry.type;
  const coordCount = drawn_boundary
    ? flattenCoordinates(drawn_boundary.coordinates).length
    : 0;

  console.log("Received spatial query:", {
    geometryType,
    coordCount,
    target_layers,
    analysis_type,
    request_mode,
    mode,
    admin_level,
    admin_id,
    admin_name,
    h3_resolution,
  });

  if (analysis_type === "population_heat_risk") {
    try {
      const result = await runPopulationHeatRiskMockup(req.body);
      return res.json(result);
    } catch (error) {
      console.error("Population heat risk failed:", error);

      return res.status(500).json({
        type: "FeatureCollection",
        features: drawn_boundary
          ? [
              {
                type: "Feature",
                geometry: drawn_boundary,
                properties: {
                  layer_name: POPULATION_EXPOSURE_OVERLAY_LAYER,
                  feature_role: "error",
                  description: `Population heat risk failed: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              },
            ]
          : [],
        metadata: {
          analysis_type: "population_heat_risk",
          risk_metric: "heat",
          threshold: req.body.threshold ?? 22,
          comparison_operator: req.body.comparison_operator ?? ">=",
          request_mode,
          admin_level,
          admin_id,
          admin_name,
          spatial_unit: "h3_hexagon",
          requested_h3_resolution: h3_resolution ?? null,
          h3_resolution: null,
          h3_cell_count: 0,
          grid_cell_count: 0,
          high_risk_cell_count: 0,
          very_high_risk_cell_count: 0,
          high_spread_cell_count: 0,
          high_risk_high_spread_cell_count: 0,
          total_population: 0,
          expected_exposed_population: 0,
          total_expected_exposed_population: 0,
          summary: {
            spatial_unit: "h3_hexagon",
            h3_cell_count: 0,
            grid_cell_count: 0,
            total_population: 0,
            expected_exposed_population: 0,
            total_expected_exposed_population: 0,
            exposure_percent: null,
            high_priority_cell_count: 0,
            high_exposure_high_uncertainty_cell_count: 0,
            high_priority_population: 0,
            top_priority_cell: null,
          },
          warnings: [error instanceof Error ? error.message : String(error)],
          provenance: {
            method: "h3_population_weighted_heat_risk",
            data_sources: [],
            wrapper_chain: [],
          },
        },
      });
    }
  }

  if (analysis_type === "manual_heat_risk") {
    try {
      const result = await runManualHeatRiskMockup(req.body);
      return res.json(result);
    } catch (error) {
      console.error("Manual heat risk failed:", error);

      return res.status(500).json({
        type: "FeatureCollection",
        features: drawn_boundary
          ? [
              {
                type: "Feature",
                geometry: drawn_boundary,
                properties: {
                  layer_name: MANUAL_HEAT_RISK_LAYER,
                  feature_role: "error",
                  description: `Manual heat risk failed: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              },
            ]
          : [],
        metadata: {
          analysis_type: "manual_heat_risk",
          risk_metric: "heat",
          threshold: req.body.threshold ?? 22,
          comparison_operator: req.body.comparison_operator ?? ">=",
          include_population: req.body.include_population ?? false,
          include_assets: req.body.include_assets ?? true,
          request_mode,
          admin_level,
          admin_id,
          admin_name,
          spatial_unit: "h3_hexagon",
          requested_h3_resolution: h3_resolution ?? null,
          h3_resolution: null,
          h3_cell_count: 0,
          grid_cell_count: 0,
          high_risk_cell_count: 0,
          very_high_risk_cell_count: 0,
          high_spread_cell_count: 0,
          high_risk_high_spread_cell_count: 0,
          total_population: null,
          expected_exposed_population: null,
          total_expected_exposed_population: null,
          summary: {
            spatial_unit: "h3_hexagon",
            h3_cell_count: 0,
            grid_cell_count: 0,
            asset_count: 0,
            exposed_asset_count: 0,
            unexposed_asset_count: 0,
            missing_value_count: 0,
            exposure_percent: null,
            top_asset: null,
          },
          warnings: [error instanceof Error ? error.message : String(error)],
          provenance: {
            method: "h3_heat_risk_with_optional_population_and_assets",
            data_sources: [],
            wrapper_chain: [],
          },
        },
      });
    }
  }

  if (!analysis_type || analysis_type === "echo") {
    const description = drawn_boundary
      ? `Successfully received geometry of type ${geometryType} with ${coordCount} coordinates.`
      : `Successfully received admin request for ${admin_level}:${admin_id}.`;

    return res.json({
      type: "FeatureCollection",
      features: drawn_boundary
        ? [
            {
              type: "Feature",
              geometry: drawn_boundary,
              properties: {
                layer_name: "Backend Received Polygon",
                description,
              },
            },
          ]
        : [],
      metadata: {
        request_mode: mode,
        admin_level,
        admin_id,
        admin_name,
      },
    });
  }

  if (!drawn_boundary) {
    return res.status(400).json({
      error: "drawn_boundary is required for this legacy analysis type.",
    });
  }

  const outputFeatures = [];

  if (analysis_type === "zonal_stats") {
    for (const feature of tasFeatures) {
      const centroid = getCentroid(feature.geometry);

      if (isPointInsideGeometry(centroid, drawn_boundary)) {
        outputFeatures.push({
          ...feature,
          properties: {
            ...feature.properties,
            layer_name: "Near-Surface Air Temp (TAS)",
            description:
              feature.properties?.description ||
              "Near-surface air temperature cell inside drawn area.",
          },
        });
      }
    }
  }

  if (analysis_type === "heat_stress") {
    for (const feature of wbFeatures) {
      const centroid = getCentroid(feature.geometry);

      if (isPointInsideGeometry(centroid, drawn_boundary)) {
        outputFeatures.push({
          ...feature,
          properties: {
            ...feature.properties,
            layer_name: "Annual Mean Wet-Bulb (WBT)",
            description:
              feature.properties?.description ||
              "Wet-bulb temperature cell inside drawn area.",
          },
        });
      }
    }
  }

  if (outputFeatures.length === 0) {
    outputFeatures.push({
      type: "Feature",
      geometry: drawn_boundary,
      properties: {
        layer_name: "No Results",
        description:
          "No matching local dataset features were found inside the drawn boundary.",
      },
    });
  }

  return res.json({
    type: "FeatureCollection",
    features: outputFeatures,
  });
});

app.listen(PORT, () => {
  console.log(`Spatial API server running at http://localhost:${PORT}`);
  void warmAdminAssetCacheOnStartup();
});