#!/usr/bin/env node
/**
 * Bootstrap PICT-wide reference data + asset caches.
 *
 * Suggested location:
 *   scripts/bootstrap_pict_region_data.mjs
 *
 * Run from repository root:
 *   node scripts/bootstrap_pict_region_data.mjs
 *
 * Good breakfast run:
 *   node scripts/bootstrap_pict_region_data.mjs --delay-ms 4000 --timeout-seconds 90
 *
 * Quick metadata/boundary-only run:
 *   node scripts/bootstrap_pict_region_data.mjs --skip-assets --skip-population
 *
 * Small test:
 *   node scripts/bootstrap_pict_region_data.mjs --countries WSM,TON --admin-levels ADM0,ADM1,ADM2
 *
 * What it does:
 *   1. Downloads open admin boundaries from geoBoundaries for PICT countries/territories.
 *   2. Downloads WorldPop 2020 population rasters when available.
 *   3. Fetches OSM infrastructure assets once per country/territory through Overpass.
 *   4. Derives ADM1/ADM2/ADM3 asset caches from the country asset cache without extra Overpass calls.
 *   5. Writes a registry + manifest so the backend can be generalized later.
 *
 * Output:
 *   data/reference/pict/<iso3_lower>/adm0.geojson
 *   data/reference/pict/<iso3_lower>/adm1.geojson
 *   data/reference/pict/<iso3_lower>/adm2.geojson
 *   data/reference/pict/<iso3_lower>/worldpop/<iso3_lower>_ppp_2020.tif
 *   backend/cache/admin_assets/<adm_level>_<admin_id>_<asset_types>.json
 *   data/reference/pict_region_registry.json
 *   data/reference/pict_bootstrap_manifest.json
 *
 * Notes:
 *   - This script is resumable. Existing files are skipped unless --force-* is passed.
 *   - It intentionally avoids one Overpass request per small admin unit.
 *   - It only derives sub-admin asset caches from country-level OSM asset points.
 *   - If country-level Overpass times out, rerun later or use --countries to target it alone.
 */

import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_SCHEMA_VERSION = 1;
const MANUAL_HEAT_RISK_ASSET_LAYER = "Manual Heat Risk Assets";

const DEFAULT_ADMIN_LEVELS = ["ADM0", "ADM1", "ADM2"];
const DEFAULT_DERIVE_ASSET_LEVELS = ["ADM1", "ADM2"];
const DEFAULT_ASSET_TYPES = [
  "critical_facility",
  "hospital",
  "port",
  "power_substation",
  "school",
];

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const GE0BOUNDARIES_BASE = "https://www.geoboundaries.org/api/current/gbOpen";

const WORLDPOP_BASES = [
  "https://data.worldpop.org/GIS/Population/Global_2000_2020/2020",
  "https://worldpop-public-data.soton.ac.uk/GIS/Population/Global_2000_2020/2020",
];

/**
 * Broad PICT list for data bootstrap.
 *
 * Some are sovereign states and some are territories. Not every source has every
 * admin level or a WorldPop raster for every territory; failures are recorded.
 */
const PICT_COUNTRIES = [
  { iso3: "ASM", name: "American Samoa" },
  { iso3: "COK", name: "Cook Islands" },
  { iso3: "FJI", name: "Fiji" },
  { iso3: "FSM", name: "Micronesia (Federated States of)" },
  { iso3: "GUM", name: "Guam" },
  { iso3: "KIR", name: "Kiribati" },
  { iso3: "MHL", name: "Marshall Islands" },
  { iso3: "MNP", name: "Northern Mariana Islands" },
  { iso3: "NRU", name: "Nauru" },
  { iso3: "NCL", name: "New Caledonia" },
  { iso3: "NIU", name: "Niue" },
  { iso3: "PLW", name: "Palau" },
  { iso3: "PNG", name: "Papua New Guinea" },
  { iso3: "PYF", name: "French Polynesia" },
  { iso3: "SLB", name: "Solomon Islands" },
  { iso3: "TKL", name: "Tokelau" },
  { iso3: "TON", name: "Tonga" },
  { iso3: "TUV", name: "Tuvalu" },
  { iso3: "VUT", name: "Vanuatu" },
  { iso3: "WLF", name: "Wallis and Futuna" },
  { iso3: "WSM", name: "Samoa" },
];

function parseArgs(argv) {
  const args = {
    countries: PICT_COUNTRIES.filter((country) => country.iso3 !== "FJI").map(
      (country) => country.iso3,
    ),
    adminLevels: DEFAULT_ADMIN_LEVELS,
    deriveAssetLevels: DEFAULT_DERIVE_ASSET_LEVELS,
    assetTypes: DEFAULT_ASSET_TYPES,
    referenceDir: null,
    cacheDir: null,
    publicDir: null,
    copyToFrontend: false,
    skipBoundaries: false,
    skipPopulation: false,
    skipAssets: false,
    forceBoundaries: false,
    forcePopulation: false,
    forceAssets: false,
    delayMs: 3500,
    timeoutSeconds: 80,
    populationYear: 2020,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--countries") {
      const raw = String(argv[++i] || "").trim();
      args.countries =
        raw.toUpperCase() === "ALL"
          ? PICT_COUNTRIES.map((country) => country.iso3)
          : raw
              .split(",")
              .map((value) => value.trim().toUpperCase())
              .filter(Boolean);
    } else if (arg === "--include-fiji") {
      args.countries = Array.from(new Set([...args.countries, "FJI"]));
    } else if (arg === "--admin-levels") {
      args.adminLevels = String(argv[++i] || "")
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg === "--derive-asset-levels") {
      args.deriveAssetLevels = String(argv[++i] || "")
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg === "--asset-types") {
      args.assetTypes = String(argv[++i] || "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg === "--reference-dir") {
      args.referenceDir = argv[++i];
    } else if (arg === "--cache-dir") {
      args.cacheDir = argv[++i];
    } else if (arg === "--public-dir") {
      args.publicDir = argv[++i];
    } else if (arg === "--copy-to-frontend") {
      args.copyToFrontend = true;
    } else if (arg === "--skip-boundaries") {
      args.skipBoundaries = true;
    } else if (arg === "--skip-population") {
      args.skipPopulation = true;
    } else if (arg === "--skip-assets") {
      args.skipAssets = true;
    } else if (arg === "--force-boundaries") {
      args.forceBoundaries = true;
    } else if (arg === "--force-population") {
      args.forcePopulation = true;
    } else if (arg === "--force-assets") {
      args.forceAssets = true;
    } else if (arg === "--force") {
      args.forceBoundaries = true;
      args.forcePopulation = true;
      args.forceAssets = true;
    } else if (arg === "--delay-ms") {
      args.delayMs = Number(argv[++i]);
    } else if (arg === "--timeout-seconds") {
      args.timeoutSeconds = Number(argv[++i]);
    } else if (arg === "--population-year") {
      args.populationYear = Number(argv[++i]);
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Array.isArray(args.countries) || args.countries.length === 0) {
    throw new Error("No countries selected.");
  }

  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
    args.delayMs = 3500;
  }

  if (!Number.isFinite(args.timeoutSeconds) || args.timeoutSeconds < 10) {
    args.timeoutSeconds = 80;
  }

  if (!Number.isFinite(args.populationYear)) {
    args.populationYear = 2020;
  }

  return args;
}

function printHelpAndExit() {
  console.log(`
Bootstrap PICT-wide reference data and asset caches.

Default:
  node scripts/bootstrap_pict_region_data.mjs

Default countries:
  All listed PICT countries/territories except Fiji, because this repo already
  has Fiji-specific files. Add Fiji with --include-fiji or use --countries ALL.

Options:
  --countries <csv|ALL>        ISO3 list, e.g. WSM,TON,VUT or ALL
  --include-fiji              Add FJI to the default country list
  --admin-levels <csv>        Default: ADM0,ADM1,ADM2
  --derive-asset-levels <csv> Default: ADM1,ADM2
  --asset-types <csv>         Default: critical_facility,hospital,port,power_substation,school

  --reference-dir <dir>       Default: data/reference/pict
  --cache-dir <dir>           Default: backend/cache/admin_assets
  --public-dir <dir>          Default: frontend/public/pict
  --copy-to-frontend          Also copy downloaded boundaries to frontend/public/pict

  --skip-boundaries           Do not download boundaries
  --skip-population           Do not download WorldPop rasters
  --skip-assets               Do not fetch/cache OSM assets

  --force-boundaries          Redownload boundaries
  --force-population          Redownload population rasters
  --force-assets              Refetch/rewrite asset caches
  --force                     Force all of the above

  --delay-ms <number>         Delay after each country asset fetch. Default: 3500
  --timeout-seconds <number>  Overpass timeout. Default: 80
  --population-year <year>    Default: 2020
  --dry-run                   Print planned actions without writing/downloading

Examples:
  node scripts/bootstrap_pict_region_data.mjs --skip-assets --skip-population
  node scripts/bootstrap_pict_region_data.mjs --countries WSM,TON,VUT
  node scripts/bootstrap_pict_region_data.mjs --countries ALL --delay-ms 5000 --timeout-seconds 120
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
      fs.existsSync(path.join(candidate, "data")) ||
      fs.existsSync(path.join(candidate, "backend")) ||
      fs.existsSync(path.join(candidate, "frontend"))
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
    return DEFAULT_ASSET_TYPES;
  }

  return assetTypes.map((type) => String(type).toLowerCase()).sort();
}

function getAdminAssetCachePath(cacheDir, adminLevel, adminId, assetTypes) {
  const normalizedLevel = sanitizeCacheToken(adminLevel);
  const normalizedAdminId = sanitizeCacheToken(adminId);
  const normalizedAssetTypes = normalizeAssetTypesForCache(assetTypes)
    .map(sanitizeCacheToken)
    .join("_");

  return path.resolve(
    cacheDir,
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

function ringLooksAntimeridianCrossing(ring) {
  const xs = ring
    .map((point) => Number(point[0]))
    .filter((value) => Number.isFinite(value));

  if (xs.length === 0) return false;

  return Math.max(...xs) - Math.min(...xs) > 180;
}

function shiftRingForAntimeridian(ring) {
  return ring.map((point) => [
    Number(point[0]) < 0 ? Number(point[0]) + 360 : Number(point[0]),
    Number(point[1]),
  ]);
}

function shiftPointForAntimeridian(point) {
  return [Number(point[0]) < 0 ? Number(point[0]) + 360 : Number(point[0]), Number(point[1])];
}

function pointInRingRaw(point, ring) {
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

  if (!exterior || exterior.length === 0) return false;

  const crossesAntimeridian = ringLooksAntimeridianCrossing(exterior);
  const testPoint = crossesAntimeridian
    ? shiftPointForAntimeridian(point)
    : point;

  const normalizedExterior = crossesAntimeridian
    ? shiftRingForAntimeridian(exterior)
    : exterior;

  if (!pointInRingRaw(testPoint, normalizedExterior)) return false;

  const holes = polygonCoords.slice(1);

  for (const hole of holes) {
    const normalizedHole = crossesAntimeridian
      ? shiftRingForAntimeridian(hole)
      : hole;

    if (pointInRingRaw(testPoint, normalizedHole)) {
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

function isPointInsideAnyFeature(point, features) {
  return features.some((feature) => isPointInsideGeometry(point, feature.geometry));
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

function normalizeOsmTags(tags) {
  if (!tags || typeof tags !== "object") {
    return {};
  }

  return tags;
}

function elementToAssetFeature(element, countryFeatures, country) {
  const lon = element.lon ?? element.center?.lon;
  const lat = element.lat ?? element.center?.lat;

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }

  if (!isPointInsideAnyFeature([lon, lat], countryFeatures)) {
    return null;
  }

  const tags = normalizeOsmTags(element.tags);
  const assetType = inferAssetType(tags);
  const uniqueId = `${String(country.iso3).toLowerCase()}-${element.type}-${element.id}`;

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [normalizeLongitude(lon), lat],
    },
    properties: {
      layer_name: MANUAL_HEAT_RISK_ASSET_LAYER,
      feature_role: "raw_asset",
      country_id: String(country.iso3).toLowerCase(),
      country_iso3: country.iso3,
      country_name: country.name,
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

function featureCoordinates(feature) {
  const coordinates = feature?.geometry?.coordinates;

  if (
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    Number.isFinite(Number(coordinates[0])) &&
    Number.isFinite(Number(coordinates[1]))
  ) {
    return [Number(coordinates[0]), Number(coordinates[1])];
  }

  return null;
}

function dedupeAssetFeatures(features) {
  const seen = new Set();
  const deduped = [];

  for (const feature of features) {
    const id =
      String(feature?.properties?.asset_id || "") ||
      `${feature?.properties?.osm_type || "osm"}-${feature?.properties?.osm_id || ""}`;

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    deduped.push(feature);
  }

  return deduped;
}

function collectionForBboxes(features) {
  return {
    type: "MultiPolygon",
    coordinates: features.flatMap((feature) => {
      const geometry = normalizeGeometryLongitudes(feature.geometry);

      if (geometry.type === "Polygon") return [geometry.coordinates];
      if (geometry.type === "MultiPolygon") return geometry.coordinates;

      return [];
    }),
  };
}

async function fetchOverpassForCountry(countryFeatures, assetTypes, timeoutSeconds, country) {
  const filters = getOverpassFilters(assetTypes);

  if (filters.length === 0) {
    return [];
  }

  const overpassGeometry = collectionForBboxes(countryFeatures);
  const overpassBboxes = getOverpassBboxesForGeometry(overpassGeometry, 0.01);

  if (overpassBboxes.length > 1) {
    console.log(`  antimeridian split bboxes: ${overpassBboxes.length}`);
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
        Math.max(15, timeoutSeconds + 20) * 1000,
      );

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
          "User-Agent":
            "pict-climate-risk-viz-chatbot/0.1 (Brown University research prototype; PICT cache builder)",
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
        .map((element) => elementToAssetFeature(element, countryFeatures, country))
        .filter(Boolean);

      return dedupeAssetFeatures(features);
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

async function fetchJson(url, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "pict-climate-risk-viz-chatbot/0.1 (Brown University research prototype)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadFile(url, outputPath, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "pict-climate-risk-viz-chatbot/0.1 (Brown University research prototype)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(outputPath));

    return {
      bytes: fs.statSync(outputPath).size,
      url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadWorldPopRaster(country, countryDir, args) {
  const iso3 = country.iso3.toUpperCase();
  const isoLower = iso3.toLowerCase();
  const populationDir = path.resolve(countryDir, "worldpop");
  const outputPath = path.resolve(
    populationDir,
    `${isoLower}_ppp_${args.populationYear}.tif`,
  );

  if (!args.forcePopulation && fs.existsSync(outputPath)) {
    return {
      status: "skipped_existing",
      path: outputPath,
      bytes: fs.statSync(outputPath).size,
    };
  }

  if (args.dryRun) {
    return {
      status: "dry_run",
      path: outputPath,
    };
  }

  const candidateUrls = WORLDPOP_BASES.map(
    (base) => `${base}/${iso3}/${isoLower}_ppp_${args.populationYear}.tif`,
  );

  let lastError = null;

  for (const url of candidateUrls) {
    try {
      const result = await downloadFile(url, outputPath, 10 * 60 * 1000);
      return {
        status: "downloaded",
        path: outputPath,
        url: result.url,
        bytes: result.bytes,
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    status: "failed",
    path: outputPath,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

function inferGeoBoundariesName(properties = {}) {
  return (
    properties.shapeName ||
    properties.shapeName_1 ||
    properties.NAME ||
    properties.Name ||
    properties.name ||
    properties.admin_name ||
    properties.NAME_1 ||
    properties.NAME_2 ||
    properties.NAME_3 ||
    "Unknown"
  );
}

function inferGeoBoundariesId(properties = {}, country, admLevel, fallbackIndex) {
  const rawId =
    properties.shapeID ||
    properties.shapeISO ||
    properties.GID_0 ||
    properties.GID_1 ||
    properties.GID_2 ||
    properties.GID_3 ||
    properties.id ||
    properties.ID ||
    properties.ADM_ID ||
    properties.ADM_CODE ||
    `${country.iso3}_${admLevel}_${inferGeoBoundariesName(properties)}_${fallbackIndex}`;

  return sanitizeCacheToken(`${country.iso3}_${admLevel}_${rawId}`);
}

function enrichBoundaryCollection(collection, country, admLevel) {
  const normalizedAdmLevel = String(admLevel).toLowerCase();

  return {
    type: "FeatureCollection",
    name: `pict_${country.iso3.toLowerCase()}_${normalizedAdmLevel}`,
    properties: {
      country_id: country.iso3.toLowerCase(),
      country_iso3: country.iso3,
      country_name: country.name,
      admin_level: normalizedAdmLevel,
      source: "geoBoundaries gbOpen",
    },
    features: (collection.features || []).map((feature, index) => {
      const adminName = inferGeoBoundariesName(feature.properties || {});
      const adminId = inferGeoBoundariesId(
        feature.properties || {},
        country,
        admLevel,
        index,
      );

      return {
        ...feature,
        geometry: normalizeGeometryLongitudes(feature.geometry),
        properties: {
          ...(feature.properties || {}),
          country_id: country.iso3.toLowerCase(),
          country_iso3: country.iso3,
          country_name: country.name,
          admin_level: normalizedAdmLevel,
          admin_id: adminId,
          admin_name: adminName,
        },
      };
    }),
  };
}

async function downloadBoundary(country, admLevel, countryDir, args) {
  const normalizedAdmLevel = String(admLevel).toLowerCase();
  const outputPath = path.resolve(countryDir, `${normalizedAdmLevel}.geojson`);

  if (!args.forceBoundaries && fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      return {
        status: "skipped_existing",
        path: outputPath,
        feature_count: Array.isArray(existing.features)
          ? existing.features.length
          : 0,
        collection: existing,
      };
    } catch {
      // fall through to redownload corrupt file
    }
  }

  if (args.dryRun) {
    return {
      status: "dry_run",
      path: outputPath,
      feature_count: 0,
      collection: null,
    };
  }

  const metadataUrl = `${GE0BOUNDARIES_BASE}/${country.iso3}/${admLevel}/`;
  const metadata = await fetchJson(metadataUrl);

  const downloadUrl =
    metadata.gjDownloadURL ||
    metadata.simplifiedGeometryGeoJSON ||
    metadata.geoJSONURL;

  if (!downloadUrl) {
    throw new Error(
      `No GeoJSON download URL found for ${country.iso3} ${admLevel}`,
    );
  }

  const rawCollection = await fetchJson(downloadUrl, 90_000);
  const enriched = enrichBoundaryCollection(rawCollection, country, admLevel);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(enriched));

  return {
    status: "downloaded",
    path: outputPath,
    feature_count: enriched.features.length,
    metadata_url: metadataUrl,
    download_url: downloadUrl,
    collection: enriched,
  };
}

function writeCacheFile(cachePath, metadata, features) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  const payload = {
    schema_version: CACHE_SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    metadata: {
      ...metadata,
      asset_count: features.length,
    },
    features,
  };

  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));

  return payload;
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

function deriveAdminAssetCache(country, collection, countryAssetFeatures, assetTypes, cacheDir, args) {
  if (!collection || !Array.isArray(collection.features)) {
    return [];
  }

  const results = [];

  for (const feature of collection.features) {
    const adminId = feature.properties?.admin_id;
    const adminName = feature.properties?.admin_name || adminId;
    const adminLevel = feature.properties?.admin_level || "admin";
    const cachePath = getAdminAssetCachePath(cacheDir, adminLevel, adminId, assetTypes);

    if (!args.forceAssets && cacheFileLooksValid(cachePath)) {
      const payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      results.push({
        admin_level: adminLevel,
        admin_id: adminId,
        admin_name: adminName,
        status: "skipped_existing",
        cache_path: cachePath,
        asset_count: payload.features.length,
      });
      continue;
    }

    const matchedAssets = countryAssetFeatures.filter((assetFeature) => {
      const coords = featureCoordinates(assetFeature);
      return coords && isPointInsideGeometry(coords, feature.geometry);
    });

    const dedupedAssets = dedupeAssetFeatures(matchedAssets).map((assetFeature) => ({
      ...assetFeature,
      properties: {
        ...(assetFeature.properties || {}),
        source_admin_id: adminId,
        source_admin_name: adminName,
        source_admin_level: adminLevel,
      },
    }));

    if (!args.dryRun) {
      writeCacheFile(
        cachePath,
        {
          country_id: country.iso3.toLowerCase(),
          country_iso3: country.iso3,
          country_name: country.name,
          admin_level: adminLevel,
          admin_id: adminId,
          admin_name: adminName,
          asset_types: normalizeAssetTypesForCache(assetTypes),
          source: "derived_from_country_osm_asset_cache",
        },
        dedupedAssets,
      );
    }

    results.push({
      admin_level: adminLevel,
      admin_id: adminId,
      admin_name: adminName,
      status: args.dryRun ? "dry_run" : "written",
      cache_path: cachePath,
      asset_count: dedupedAssets.length,
    });
  }

  return results;
}

function copyBoundaryToFrontend(sourcePath, referenceDir, publicDir) {
  const relative = path.relative(referenceDir, sourcePath);
  const destinationPath = path.resolve(publicDir, relative);

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);

  return destinationPath;
}

function countryByIso(iso3) {
  return (
    PICT_COUNTRIES.find(
      (country) => country.iso3.toUpperCase() === iso3.toUpperCase(),
    ) || { iso3: iso3.toUpperCase(), name: iso3.toUpperCase() }
  );
}

function summarizeAssetDerivations(derivations) {
  const summary = {
    cache_count: derivations.length,
    total_asset_assignments: 0,
    zero_asset_cache_count: 0,
  };

  for (const item of derivations) {
    summary.total_asset_assignments += item.asset_count || 0;
    if ((item.asset_count || 0) === 0) {
      summary.zero_asset_cache_count += 1;
    }
  }

  return summary;
}

async function processCountry(country, paths, args) {
  const isoLower = country.iso3.toLowerCase();
  const countryDir = path.resolve(paths.referenceDir, isoLower);

  fs.mkdirSync(countryDir, { recursive: true });

  const countryResult = {
    country_iso3: country.iso3,
    country_name: country.name,
    reference_dir: countryDir,
    boundaries: {},
    population: null,
    assets: null,
    errors: [],
  };

  const boundaryCollections = {};

  if (!args.skipBoundaries) {
    for (const admLevel of args.adminLevels) {
      try {
        console.log(`  boundary ${admLevel}: downloading/loading...`);
        const result = await downloadBoundary(country, admLevel, countryDir, args);

        boundaryCollections[admLevel.toUpperCase()] = result.collection;

        countryResult.boundaries[admLevel.toUpperCase()] = {
          status: result.status,
          path: result.path,
          feature_count: result.feature_count,
          metadata_url: result.metadata_url || null,
          download_url: result.download_url || null,
        };

        if (
          args.copyToFrontend &&
          !args.dryRun &&
          result.path &&
          fs.existsSync(result.path)
        ) {
          countryResult.boundaries[admLevel.toUpperCase()].public_path =
            copyBoundaryToFrontend(result.path, paths.referenceDir, paths.publicDir);
        }

        console.log(
          `  boundary ${admLevel}: ${result.status}, ${result.feature_count} features`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        countryResult.boundaries[admLevel.toUpperCase()] = {
          status: "failed",
          error: message,
        };
        countryResult.errors.push({
          stage: `boundary_${admLevel}`,
          error: message,
        });
        console.warn(`  boundary ${admLevel}: failed: ${message}`);
      }
    }
  } else {
    for (const admLevel of args.adminLevels) {
      const existingPath = path.resolve(countryDir, `${admLevel.toLowerCase()}.geojson`);
      if (fs.existsSync(existingPath)) {
        boundaryCollections[admLevel.toUpperCase()] = JSON.parse(
          fs.readFileSync(existingPath, "utf8"),
        );
      }
    }
  }

  if (!args.skipPopulation) {
    try {
      console.log("  population: downloading/loading...");
      const populationResult = await downloadWorldPopRaster(country, countryDir, args);
      countryResult.population = populationResult;
      console.log(`  population: ${populationResult.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      countryResult.population = {
        status: "failed",
        error: message,
      };
      countryResult.errors.push({
        stage: "population",
        error: message,
      });
      console.warn(`  population: failed: ${message}`);
    }
  }

  if (!args.skipAssets) {
    const adm0 = boundaryCollections.ADM0;

    if (!adm0 || !Array.isArray(adm0.features) || adm0.features.length === 0) {
      countryResult.assets = {
        status: "skipped_no_adm0_boundary",
      };
    } else {
      const countryAdminId = `${isoLower}_adm0_country`;
      const countryCachePath = getAdminAssetCachePath(
        paths.cacheDir,
        "adm0",
        countryAdminId,
        args.assetTypes,
      );

      let countryAssetFeatures = null;

      if (!args.forceAssets && cacheFileLooksValid(countryCachePath)) {
        const payload = JSON.parse(fs.readFileSync(countryCachePath, "utf8"));
        countryAssetFeatures = Array.isArray(payload.features)
          ? payload.features
          : [];

        console.log(
          `  assets country cache: skipped existing (${countryAssetFeatures.length} assets)`,
        );
      } else if (args.dryRun) {
        countryAssetFeatures = [];
        console.log("  assets country cache: dry run");
      } else {
        try {
          console.log("  assets country cache: fetching country OSM assets...");
          countryAssetFeatures = await fetchOverpassForCountry(
            adm0.features,
            args.assetTypes,
            args.timeoutSeconds,
            country,
          );

          writeCacheFile(
            countryCachePath,
            {
              country_id: isoLower,
              country_iso3: country.iso3,
              country_name: country.name,
              admin_level: "adm0",
              admin_id: countryAdminId,
              admin_name: country.name,
              asset_types: normalizeAssetTypesForCache(args.assetTypes),
              source: "country_osm_asset_cache",
            },
            countryAssetFeatures,
          );

          console.log(
            `  assets country cache: fetched ${countryAssetFeatures.length} assets`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          countryResult.assets = {
            status: "failed_country_asset_fetch",
            error: message,
            country_cache_path: countryCachePath,
          };
          countryResult.errors.push({
            stage: "country_assets",
            error: message,
          });
          console.warn(`  assets country cache: failed: ${message}`);
          countryAssetFeatures = null;
        }
      }

      if (countryAssetFeatures) {
        const derivations = [];

        for (const admLevel of args.deriveAssetLevels) {
          const collection = boundaryCollections[admLevel.toUpperCase()];

          if (!collection || !Array.isArray(collection.features)) {
            continue;
          }

          const levelDerivations = deriveAdminAssetCache(
            country,
            collection,
            countryAssetFeatures,
            args.assetTypes,
            paths.cacheDir,
            args,
          );

          derivations.push(...levelDerivations);
        }

        countryResult.assets = {
          status: "ready",
          country_cache_path: countryCachePath,
          country_asset_count: countryAssetFeatures.length,
          derived_admin_caches: summarizeAssetDerivations(derivations),
        };

        console.log(
          `  assets derived caches: ${derivations.length} admin caches`,
        );
      }

      if (args.delayMs > 0) {
        await sleep(args.delayMs);
      }
    }
  }

  return {
    countryResult,
    boundaryCollections,
  };
}

function buildRegistry(manifest) {
  const countries = {};

  for (const countryResult of manifest.countries) {
    const isoLower = countryResult.country_iso3.toLowerCase();

    countries[isoLower] = {
      country_id: isoLower,
      country_iso3: countryResult.country_iso3,
      country_name: countryResult.country_name,
      reference_dir: countryResult.reference_dir,
      boundaries: countryResult.boundaries,
      population: countryResult.population,
      assets: countryResult.assets,
    };
  }

  return {
    schema_version: 1,
    created_at: new Date().toISOString(),
    description:
      "PICT region registry generated by scripts/bootstrap_pict_region_data.mjs.",
    countries,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot();

  const paths = {
    repoRoot,
    referenceDir: resolvePathMaybeRelative(
      args.referenceDir,
      "data/reference/pict",
      repoRoot,
    ),
    cacheDir: resolvePathMaybeRelative(
      args.cacheDir,
      "backend/cache/admin_assets",
      repoRoot,
    ),
    publicDir: resolvePathMaybeRelative(
      args.publicDir,
      "frontend/public/pict",
      repoRoot,
    ),
  };

  const selectedCountries = args.countries.map(countryByIso);

  const manifest = {
    schema_version: 1,
    created_at: new Date().toISOString(),
    script: "scripts/bootstrap_pict_region_data.mjs",
    paths,
    options: {
      countries: selectedCountries.map((country) => country.iso3),
      admin_levels: args.adminLevels,
      derive_asset_levels: args.deriveAssetLevels,
      asset_types: normalizeAssetTypesForCache(args.assetTypes),
      skip_boundaries: args.skipBoundaries,
      skip_population: args.skipPopulation,
      skip_assets: args.skipAssets,
      copy_to_frontend: args.copyToFrontend,
      delay_ms: args.delayMs,
      timeout_seconds: args.timeoutSeconds,
      population_year: args.populationYear,
      dry_run: args.dryRun,
    },
    countries: [],
  };

  console.log("PICT region bootstrap");
  console.log(manifest.options);
  console.log(paths);

  if (!args.dryRun) {
    fs.mkdirSync(paths.referenceDir, { recursive: true });
    fs.mkdirSync(paths.cacheDir, { recursive: true });
    if (args.copyToFrontend) {
      fs.mkdirSync(paths.publicDir, { recursive: true });
    }
  }

  for (let i = 0; i < selectedCountries.length; i += 1) {
    const country = selectedCountries[i];

    console.log(
      `\n[${i + 1}/${selectedCountries.length}] ${country.name} (${country.iso3})`,
    );

    try {
      const { countryResult } = await processCountry(country, paths, args);
      manifest.countries.push(countryResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      manifest.countries.push({
        country_iso3: country.iso3,
        country_name: country.name,
        status: "failed_country",
        error: message,
      });
      console.warn(`Country failed: ${country.iso3}: ${message}`);
    }

    if (!args.dryRun) {
      const manifestPath = path.resolve(
        path.dirname(paths.referenceDir),
        "pict_bootstrap_manifest.partial.json",
      );
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  }

  const registry = buildRegistry(manifest);

  if (!args.dryRun) {
    const manifestPath = path.resolve(
      path.dirname(paths.referenceDir),
      "pict_bootstrap_manifest.json",
    );
    const registryPath = path.resolve(
      path.dirname(paths.referenceDir),
      "pict_region_registry.json",
    );

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    console.log(`\nManifest written to: ${manifestPath}`);
    console.log(`Registry written to: ${registryPath}`);
  }

  const summary = {
    country_count: manifest.countries.length,
    countries_with_errors: manifest.countries.filter(
      (country) => Array.isArray(country.errors) && country.errors.length > 0,
    ).length,
    countries_with_ready_assets: manifest.countries.filter(
      (country) => country.assets?.status === "ready",
    ).length,
    countries_with_population_downloaded_or_existing: manifest.countries.filter(
      (country) =>
        country.population?.status === "downloaded" ||
        country.population?.status === "skipped_existing",
    ).length,
  };

  console.log("\nDone.");
  console.log(summary);

  if (summary.countries_with_errors > 0) {
    console.log(
      "Some countries had missing data or temporary network failures. Rerun the same command later; existing successful files will be skipped.",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
