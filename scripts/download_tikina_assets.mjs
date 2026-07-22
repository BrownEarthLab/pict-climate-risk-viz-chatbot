#!/usr/bin/env node
/**
 * Download/cache OSM infrastructure assets for each Fiji tikina without starting the backend server.
 *
 * Suggested location:
 *   scripts/download_tikina_assets.mjs
 *
 * Run from the repository root:
 *   node scripts/download_tikina_assets.mjs
 *
 * Useful variants:
 *   node scripts/download_tikina_assets.mjs --limit 5
 *   node scripts/download_tikina_assets.mjs --only ba
 *   node scripts/download_tikina_assets.mjs --force
 *   node scripts/download_tikina_assets.mjs --delay-ms 2500
 *   node scripts/download_tikina_assets.mjs --input data/reference/fiji_tikina.geojson --out backend/cache/admin_assets
 *
 * The output files are compatible with the backend admin asset disk cache:
 *   backend/cache/admin_assets/tikina_<admin_id>_critical_facility_hospital_port_power_substation_school.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_SCHEMA_VERSION = 1;
const MANUAL_HEAT_RISK_ASSET_LAYER = "Manual Heat Risk Assets";

const DEFAULT_ASSET_TYPES = [
  "hospital",
  "school",
  "port",
  "power_substation",
  "critical_facility",
];

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function parseArgs(argv) {
  const args = {
    input: null,
    out: null,
    assetTypes: DEFAULT_ASSET_TYPES,
    delayMs: 1500,
    timeoutSeconds: 40,
    force: false,
    limit: null,
    only: null,
    startAt: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--force") {
      args.force = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--asset-types") {
      args.assetTypes = String(argv[++i] || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg === "--delay-ms") {
      args.delayMs = Number(argv[++i]);
    } else if (arg === "--timeout-seconds") {
      args.timeoutSeconds = Number(argv[++i]);
    } else if (arg === "--limit") {
      args.limit = Number(argv[++i]);
    } else if (arg === "--only") {
      args.only = String(argv[++i] || "").toLowerCase();
    } else if (arg === "--start-at") {
      args.startAt = String(argv[++i] || "").toLowerCase();
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
    args.delayMs = 1500;
  }

  if (!Number.isFinite(args.timeoutSeconds) || args.timeoutSeconds < 5) {
    args.timeoutSeconds = 40;
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    args.limit = null;
  }

  return args;
}

function printHelpAndExit() {
  console.log(`
Download/cache OSM infrastructure assets for Fiji tikinas.

Run:
  node scripts/download_tikina_assets.mjs

Options:
  --input <path>             Default: data/reference/fiji_tikina.geojson
  --out <dir>                Default: backend/cache/admin_assets
  --asset-types <csv>        Default: hospital,school,port,power_substation,critical_facility
  --delay-ms <number>        Delay between tikina requests. Default: 1500
  --timeout-seconds <number> Overpass timeout. Default: 40
  --limit <number>           Process only first N matching tikinas
  --only <text>              Process tikinas whose id/name contains text
  --start-at <text>          Skip until id/name contains text
  --force                    Re-fetch even if cache file already exists
  --dry-run                  Print planned work without making Overpass requests
`);
  process.exit(0);
}

function findRepoRoot() {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "../.."),
  ];

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "data", "reference")) ||
      fs.existsSync(path.join(candidate, "backend"))
    ) {
      return candidate;
    }
  }

  return process.cwd();
}

function resolvePathMaybeRelative(value, fallbackRelativePath, repoRoot) {
  const requested = value || fallbackRelativePath;

  if (path.isAbsolute(requested)) {
    return requested;
  }

  return path.resolve(repoRoot, requested);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeCacheToken(value) {
  return (
    String(value || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  );
}

function normalizeAssetTypesForCache(assetTypes) {
  if (!Array.isArray(assetTypes) || assetTypes.length === 0) {
    return ["hospital", "school", "port"];
  }

  return assetTypes.map((type) => String(type).toLowerCase()).sort();
}

function getAdminAssetCachePath(outDir, adminLevel, adminId, assetTypes) {
  const normalizedLevel = sanitizeCacheToken(adminLevel || "tikina");
  const normalizedAdminId = sanitizeCacheToken(adminId);
  const normalizedAssetTypes = normalizeAssetTypesForCache(assetTypes)
    .map(sanitizeCacheToken)
    .join("_");

  return path.resolve(
    outDir,
    `${normalizedLevel}_${normalizedAdminId}_${normalizedAssetTypes}.json`,
  );
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
    Math.min(...latitudes) - paddingDegrees,
  );
  const north = clampLatitudeForOverpass(
    Math.max(...latitudes) + paddingDegrees,
  );

  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const rawLongitudeSpan = maxLng - minLng;

  if (rawLongitudeSpan > 180) {
    const wrappedLongitudes = longitudes.map((lng) =>
      lng < 0 ? lng + 360 : lng,
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

    const validSplitBboxes = splitBboxes.filter((bbox) => bbox.east > bbox.west);

    if (validSplitBboxes.length > 0) {
      return validSplitBboxes;
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
      pointInPolygon(normalizedPoint, polyCoords),
    );
  }

  return false;
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

function inferAssetType(tags = {}) {
  if (
    tags.amenity === "hospital" ||
    tags.healthcare === "hospital" ||
    tags.amenity === "clinic" ||
    tags.healthcare === "clinic"
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

  return "critical_facility";
}

function inferAdminName(feature, index) {
  const props = feature?.properties || {};
  const candidates = [
    props.admin_name,
    props.tikina_name,
    props.TIKINA_NAME,
    props.tikina,
    props.TIKINA,
    props.name,
    props.NAME,
    props.Name,
    props.NAME_3,
    props.shapeName,
    props.ShapeName,
  ];

  const found = candidates.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  return found ? found.trim() : `Tikina ${index + 1}`;
}

function inferAdminId(feature, index) {
  const props = feature?.properties || {};
  const candidates = [
    props.admin_id,
    props.tikina_id,
    props.TIKINA_ID,
    props.id,
    props.ID,
    props.GID_3,
    props.shapeID,
    props.ShapeID,
  ];

  const found = candidates.find(
    (value) => value !== null && value !== undefined && String(value).trim(),
  );

  if (found !== null && found !== undefined) {
    return sanitizeCacheToken(found);
  }

  return sanitizeCacheToken(inferAdminName(feature, index));
}

function normalizeOsmTags(tags) {
  if (!tags || typeof tags !== "object") {
    return {};
  }

  return tags;
}

function elementToAssetFeature(element, boundaryGeometry) {
  const lon = element.lon ?? element.center?.lon;
  const lat = element.lat ?? element.center?.lat;

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }

  if (!isPointInsideGeometry([lon, lat], boundaryGeometry)) {
    return null;
  }

  const tags = normalizeOsmTags(element.tags);
  const assetType = inferAssetType(tags);
  const uniqueId = `${element.type}-${element.id}`;

  return {
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
  };
}

function dedupeFeatures(features) {
  const seen = new Set();
  const deduped = [];

  for (const feature of features) {
    const id = String(feature?.properties?.asset_id || "");

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    deduped.push(feature);
  }

  return deduped;
}

async function fetchOverpassForBoundary(boundaryGeometry, assetTypes, timeoutSeconds) {
  const filters = getOverpassFilters(assetTypes);

  if (filters.length === 0) {
    return [];
  }

  const overpassBboxes = getOverpassBboxesForGeometry(boundaryGeometry, 0.01);

  if (overpassBboxes.length > 1) {
    console.log("  antimeridian split bboxes:", overpassBboxes.length);
  }

  const clauses = overpassBboxes
    .flatMap((bbox) =>
      filters.map((filter) => buildOverpassClause(filter.key, filter.value, bbox)),
    )
    .join("\n");

  const query = `
    [out:json][timeout:${Math.round(timeoutSeconds)}];
    (
      ${clauses}
    );
    out center tags;
  `;

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(10, timeoutSeconds + 15) * 1000,
      );

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
          "User-Agent":
            "pict-climate-risk-viz-chatbot/0.1 (Brown University research prototype; tikina cache builder)",
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(
          `HTTP ${response.status} from ${endpoint}: ${errorText.slice(0, 220)}`,
        );
        console.warn(`  ${lastError.message}`);
        continue;
      }

      const data = await response.json();
      const elements = Array.isArray(data.elements) ? data.elements : [];
      const features = elements
        .map((element) => elementToAssetFeature(element, boundaryGeometry))
        .filter(Boolean);

      return dedupeFeatures(features);
    } catch (error) {
      lastError = error;
      console.warn(
        `  endpoint failed: ${endpoint}`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  throw lastError || new Error("All Overpass endpoints failed.");
}

function writeCacheFile(cachePath, adminLevel, adminId, adminName, assetTypes, features) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  const createdAt = new Date().toISOString();
  const payload = {
    schema_version: CACHE_SCHEMA_VERSION,
    created_at: createdAt,
    metadata: {
      admin_level: adminLevel,
      admin_id: adminId,
      admin_name: adminName,
      asset_types: normalizeAssetTypesForCache(assetTypes),
      asset_count: features.length,
    },
    features,
  };

  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));

  return createdAt;
}

function cacheFileLooksValid(cachePath) {
  if (!fs.existsSync(cachePath)) {
    return false;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    return payload?.schema_version === CACHE_SCHEMA_VERSION && Array.isArray(payload.features);
  } catch {
    return false;
  }
}

function loadTikinaFeatures(inputPath) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Tikina boundary file not found: ${inputPath}`);
  }

  const collection = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  if (!Array.isArray(collection.features) || collection.features.length === 0) {
    throw new Error(`Tikina boundary file has no features: ${inputPath}`);
  }

  return collection.features;
}

function filterFeatures(features, args) {
  let selected = features.map((feature, index) => ({
    feature,
    index,
    adminId: inferAdminId(feature, index),
    adminName: inferAdminName(feature, index),
  }));

  if (args.startAt) {
    const startNeedle = args.startAt.toLowerCase();
    const startIndex = selected.findIndex((entry) => {
      return (
        entry.adminId.toLowerCase().includes(startNeedle) ||
        entry.adminName.toLowerCase().includes(startNeedle)
      );
    });

    if (startIndex >= 0) {
      selected = selected.slice(startIndex);
    } else {
      console.warn(`--start-at '${args.startAt}' did not match any tikina; processing all.`);
    }
  }

  if (args.only) {
    const needle = args.only.toLowerCase();
    selected = selected.filter((entry) => {
      return (
        entry.adminId.toLowerCase().includes(needle) ||
        entry.adminName.toLowerCase().includes(needle)
      );
    });
  }

  if (args.limit) {
    selected = selected.slice(0, args.limit);
  }

  return selected;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot();

  const inputPath = resolvePathMaybeRelative(
    args.input,
    "data/reference/fiji_tikina.geojson",
    repoRoot,
  );
  const outDir = resolvePathMaybeRelative(
    args.out,
    "backend/cache/admin_assets",
    repoRoot,
  );

  const assetTypes = normalizeAssetTypesForCache(args.assetTypes);
  const features = filterFeatures(loadTikinaFeatures(inputPath), args);

  console.log("Tikina asset cache download");
  console.log({
    inputPath,
    outDir,
    tikinaCount: features.length,
    assetTypes,
    delayMs: args.delayMs,
    timeoutSeconds: args.timeoutSeconds,
    force: args.force,
    dryRun: args.dryRun,
  });

  if (features.length === 0) {
    console.log("No matching tikinas.");
    return;
  }

  const failures = [];
  let skippedCount = 0;
  let fetchedCount = 0;
  let zeroAssetCount = 0;

  for (let position = 0; position < features.length; position += 1) {
    const { feature, adminId, adminName } = features[position];
    const cachePath = getAdminAssetCachePath(outDir, "tikina", adminId, assetTypes);
    const label = `[${position + 1}/${features.length}] ${adminName} (${adminId})`;

    if (!args.force && cacheFileLooksValid(cachePath)) {
      const payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      skippedCount += 1;
      console.log(`${label}: skip existing cache (${payload.features.length} assets)`);
      continue;
    }

    if (args.dryRun) {
      console.log(`${label}: would write ${cachePath}`);
      continue;
    }

    try {
      console.log(`${label}: fetching...`);
      const normalizedGeometry = normalizeGeometryLongitudes(feature.geometry);
      const assetFeatures = await fetchOverpassForBoundary(
        normalizedGeometry,
        assetTypes,
        args.timeoutSeconds,
      );

      writeCacheFile(cachePath, "tikina", adminId, adminName, assetTypes, assetFeatures);

      fetchedCount += 1;

      if (assetFeatures.length === 0) {
        zeroAssetCount += 1;
      }

      console.log(`${label}: cached ${assetFeatures.length} assets`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ admin_id: adminId, admin_name: adminName, error: message });
      console.warn(`${label}: failed: ${message}`);
    }

    if (position < features.length - 1 && args.delayMs > 0) {
      await sleep(args.delayMs);
    }
  }

  const manifestPath = path.resolve(outDir, "tikina_asset_download_manifest.json");
  const manifest = {
    created_at: new Date().toISOString(),
    input_path: inputPath,
    output_dir: outDir,
    asset_types: assetTypes,
    tikina_count: features.length,
    skipped_count: skippedCount,
    fetched_count: fetchedCount,
    zero_asset_count: zeroAssetCount,
    failed_count: failures.length,
    failures,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("Done.");
  console.log(manifest);
  console.log(`Manifest written to: ${manifestPath}`);

  if (failures.length > 0) {
    console.log("Some tikinas failed because Overpass timed out or rejected the request.");
    console.log("You can rerun the same script later; existing successful caches will be skipped.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
