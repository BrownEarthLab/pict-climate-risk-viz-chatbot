#!/usr/bin/env node
/**
 * Build Fiji tikina asset cache files without calling Overpass.
 *
 * This reads existing province/ADM2 asset cache files and spatially assigns
 * their point assets into tikina polygons. It avoids the 86 separate Overpass
 * requests that caused HTTP 429/504 errors.
 *
 * Put this file at:
 *   scripts/build_tikina_assets_from_province_cache.mjs
 *
 * Run from repo root:
 *   node scripts/build_tikina_assets_from_province_cache.mjs --force
 *
 * Dry run:
 *   node scripts/build_tikina_assets_from_province_cache.mjs --dry-run
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_SCHEMA_VERSION = 1;
const DEFAULT_ASSET_TYPES = [
  "critical_facility",
  "hospital",
  "port",
  "power_substation",
  "school",
];

function parseArgs(argv) {
  const args = {
    tikinaInput: null,
    cacheDir: null,
    outDir: null,
    force: false,
    dryRun: false,
    only: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--tikina-input") args.tikinaInput = argv[++i];
    else if (arg === "--cache-dir") args.cacheDir = argv[++i];
    else if (arg === "--out") args.outDir = argv[++i];
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--only") args.only = String(argv[++i] || "").toLowerCase();
    else if (arg === "--help" || arg === "-h") {
      console.log(`
Build tikina asset cache files from existing province asset caches.

Run:
  node scripts/build_tikina_assets_from_province_cache.mjs --force

Options:
  --tikina-input <path>  Default: data/reference/fiji_tikina.geojson
  --cache-dir <dir>     Default: backend/cache/admin_assets
  --out <dir>           Default: same as --cache-dir
  --only <text>         Only build tikinas whose id/name contains text
  --force               Rewrite existing tikina cache files
  --dry-run             Print counts without writing files
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function findRepoRoot() {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "../.."),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "data", "reference"))) return candidate;
    if (fs.existsSync(path.join(candidate, "backend"))) return candidate;
  }

  return process.cwd();
}

function resolveMaybeRelative(value, fallback, repoRoot) {
  const chosen = value || fallback;
  return path.isAbsolute(chosen) ? chosen : path.resolve(repoRoot, chosen);
}

function sanitizeCacheToken(value) {
  return (
    String(value || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  );
}

function assetTypeSuffix() {
  return DEFAULT_ASSET_TYPES.map(sanitizeCacheToken).sort().join("_");
}

function getTikinaCachePath(outDir, adminId) {
  return path.resolve(outDir, `tikina_${sanitizeCacheToken(adminId)}_${assetTypeSuffix()}.json`);
}

function normalizeLongitude(lng) {
  let x = Number(lng);
  if (!Number.isFinite(x)) return x;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

function normalizePoint(point) {
  if (!Array.isArray(point) || point.length < 2) return point;
  return [normalizeLongitude(point[0]), Number(point[1])];
}

function normalizeCoordinates(coords) {
  if (!Array.isArray(coords)) return coords;
  if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    return normalizePoint(coords);
  }
  return coords.map(normalizeCoordinates);
}

function normalizeGeometry(geometry) {
  if (!geometry) return geometry;
  return { ...geometry, coordinates: normalizeCoordinates(geometry.coordinates) };
}

function inferAdminName(feature, index) {
  const p = feature.properties || {};
  const candidates = [
    p.admin_name,
    p.tikina_name,
    p.TIKINA_NAME,
    p.tikina,
    p.TIKINA,
    p.name,
    p.NAME,
    p.Name,
    p.NAME_3,
    p.shapeName,
    p.ShapeName,
  ];
  const found = candidates.find((x) => typeof x === "string" && x.trim());
  return found ? found.trim() : `Tikina ${index + 1}`;
}

function inferAdminId(feature, index) {
  const p = feature.properties || {};
  const candidates = [p.admin_id, p.tikina_id, p.TIKINA_ID, p.id, p.ID, p.GID_3, p.shapeID, p.ShapeID];
  const found = candidates.find((x) => x !== null && x !== undefined && String(x).trim());
  return found ? sanitizeCacheToken(found) : sanitizeCacheToken(inferAdminName(feature, index));
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

function pointInPolygon(point, polygon) {
  if (!polygon || !polygon[0] || !pointInRing(point, polygon[0])) return false;
  for (const hole of polygon.slice(1)) {
    if (pointInRing(point, hole)) return false;
  }
  return true;
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  const normalized = normalizePoint(point);
  const geom = normalizeGeometry(geometry);

  if (geom.type === "Polygon") return pointInPolygon(normalized, geom.coordinates);
  if (geom.type === "MultiPolygon") return geom.coordinates.some((poly) => pointInPolygon(normalized, poly));
  return false;
}

function featurePoint(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [normalizeLongitude(lon), lat];
}

function loadTikinas(filePath) {
  const collection = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(collection.features)) throw new Error(`No features in ${filePath}`);

  return collection.features.map((feature, index) => ({
    feature: { ...feature, geometry: normalizeGeometry(feature.geometry) },
    adminId: inferAdminId(feature, index),
    adminName: inferAdminName(feature, index),
  }));
}

function loadProvinceAssets(cacheDir) {
  const files = fs
    .readdirSync(cacheDir)
    .filter((file) => file.startsWith("adm2_") && file.endsWith(".json"))
    .sort();

  const assets = [];
  const loadedFiles = [];

  for (const file of files) {
    const fullPath = path.join(cacheDir, file);

    try {
      const payload = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const features = Array.isArray(payload.features) ? payload.features : [];
      loadedFiles.push({ file, count: features.length, admin_name: payload?.metadata?.admin_name || null });

      for (const feature of features) {
        if (featurePoint(feature)) assets.push(feature);
      }
    } catch (error) {
      console.warn(`Skipping unreadable province cache ${file}:`, error.message || error);
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const asset of assets) {
    const id = String(asset?.properties?.asset_id || `${asset?.properties?.osm_type || "osm"}-${asset?.properties?.osm_id || ""}`);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(asset);
  }

  return { loadedFiles, assets: deduped };
}

function cacheLooksValid(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return payload?.schema_version === CACHE_SCHEMA_VERSION && Array.isArray(payload.features);
  } catch {
    return false;
  }
}

function writeTikinaCache(filePath, tikina, features, sourceSummary) {
  const payload = {
    schema_version: CACHE_SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    metadata: {
      admin_level: "tikina",
      admin_id: tikina.adminId,
      admin_name: tikina.adminName,
      asset_types: DEFAULT_ASSET_TYPES,
      asset_count: features.length,
      source: "derived_from_adm2_asset_cache",
      source_summary: sourceSummary,
    },
    features,
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot();
  const tikinaInput = resolveMaybeRelative(args.tikinaInput, "data/reference/fiji_tikina.geojson", repoRoot);
  const cacheDir = resolveMaybeRelative(args.cacheDir, "backend/cache/admin_assets", repoRoot);
  const outDir = resolveMaybeRelative(args.outDir, args.cacheDir || "backend/cache/admin_assets", repoRoot);

  let tikinas = loadTikinas(tikinaInput);
  if (args.only) {
    tikinas = tikinas.filter(
      (t) => t.adminId.toLowerCase().includes(args.only) || t.adminName.toLowerCase().includes(args.only),
    );
  }

  const { loadedFiles, assets } = loadProvinceAssets(cacheDir);

  console.log("Build tikina asset caches from existing ADM2/province caches");
  console.log({ tikinaInput, cacheDir, outDir, tikinaCount: tikinas.length, provinceCacheFiles: loadedFiles.length, provinceAssets: assets.length, force: args.force, dryRun: args.dryRun });

  if (loadedFiles.length === 0 || assets.length === 0) {
    throw new Error("No ADM2/province cache assets found. Start the backend once or run province warmup first.");
  }

  let written = 0;
  let skipped = 0;
  let zero = 0;

  for (let i = 0; i < tikinas.length; i += 1) {
    const tikina = tikinas[i];
    const outputPath = getTikinaCachePath(outDir, tikina.adminId);

    if (!args.force && cacheLooksValid(outputPath)) {
      const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      skipped += 1;
      console.log(`[${i + 1}/${tikinas.length}] ${tikina.adminName}: skip existing (${existing.features.length})`);
      continue;
    }

    const matched = assets
      .filter((asset) => {
        const pt = featurePoint(asset);
        return pt && pointInGeometry(pt, tikina.feature.geometry);
      })
      .map((asset) => ({
        ...asset,
        properties: {
          ...(asset.properties || {}),
          source_tikina_id: tikina.adminId,
          source_tikina_name: tikina.adminName,
        },
      }));

    if (matched.length === 0) zero += 1;

    if (args.dryRun) {
      console.log(`[${i + 1}/${tikinas.length}] ${tikina.adminName}: would write ${matched.length}`);
      continue;
    }

    writeTikinaCache(outputPath, tikina, matched, {
      province_cache_files: loadedFiles.length,
      province_asset_points: assets.length,
    });

    written += 1;
    console.log(`[${i + 1}/${tikinas.length}] ${tikina.adminName}: wrote ${matched.length}`);
  }

  const manifest = {
    created_at: new Date().toISOString(),
    method: "derived_from_adm2_asset_cache",
    tikina_input: tikinaInput,
    cache_dir: cacheDir,
    output_dir: outDir,
    province_cache_files: loadedFiles,
    province_asset_points: assets.length,
    tikina_count: tikinas.length,
    written_count: written,
    skipped_count: skipped,
    zero_asset_count: zero,
  };

  if (!args.dryRun) {
    const manifestPath = path.join(outDir, "tikina_asset_from_province_cache_manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Manifest written to: ${manifestPath}`);
  }

  console.log("Done.");
  console.log(manifest);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
