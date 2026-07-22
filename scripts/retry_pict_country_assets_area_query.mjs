#!/usr/bin/env node
/**
 * Retry PICT country asset caches using Overpass AREA queries instead of hundreds of bbox chunks.
 *
 * Put in: scripts/retry_pict_country_assets_area_query.mjs
 * Run:    node scripts/retry_pict_country_assets_area_query.mjs --only-missing --delay-ms 12000 --timeout-seconds 180
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_SCHEMA_VERSION = 1;
const LAYER_NAME = "Manual Heat Risk Assets";
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const DEFAULT_TYPES = ["hospital", "school", "port", "power_substation", "critical_facility"];
const COUNTRIES = [
  ["ASM", "American Samoa"], ["COK", "Cook Islands"], ["FJI", "Fiji"],
  ["FSM", "Micronesia (Federated States of)"], ["GUM", "Guam"], ["KIR", "Kiribati"],
  ["MHL", "Marshall Islands"], ["MNP", "Northern Mariana Islands"], ["NRU", "Nauru"],
  ["NCL", "New Caledonia"], ["NIU", "Niue"], ["PLW", "Palau"],
  ["PNG", "Papua New Guinea"], ["PYF", "French Polynesia"], ["SLB", "Solomon Islands"],
  ["TKL", "Tokelau"], ["TON", "Tonga"], ["TUV", "Tuvalu"], ["VUT", "Vanuatu"],
  ["WLF", "Wallis and Futuna"], ["WSM", "Samoa"],
].map(([iso3, name]) => ({ iso3, name }));

function parseArgs(argv) {
  const args = {
    countries: [], onlyMissing: false, referenceDir: null, cacheDir: null,
    deriveLevels: ["ADM1", "ADM2"], assetTypes: DEFAULT_TYPES,
    delayMs: 12000, timeoutSeconds: 180, forceAssets: false, dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--countries") args.countries = String(argv[++i] || "").toUpperCase() === "ALL" ? COUNTRIES.map(c => c.iso3) : String(argv[i] || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    else if (a === "--only-missing") args.onlyMissing = true;
    else if (a === "--reference-dir") args.referenceDir = argv[++i];
    else if (a === "--cache-dir") args.cacheDir = argv[++i];
    else if (a === "--derive-asset-levels") args.deriveLevels = String(argv[++i] || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    else if (a === "--asset-types") args.assetTypes = String(argv[++i] || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--timeout-seconds") args.timeoutSeconds = Number(argv[++i]);
    else if (a === "--force-assets") args.forceAssets = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) args.delayMs = 12000;
  if (!Number.isFinite(args.timeoutSeconds) || args.timeoutSeconds < 30) args.timeoutSeconds = 180;
  return args;
}
function printHelp() {
  console.log(`Retry PICT country asset caches using Overpass AREA queries.

Recommended:
  node scripts/retry_pict_country_assets_area_query.mjs --only-missing --delay-ms 12000 --timeout-seconds 180

Targeted:
  node scripts/retry_pict_country_assets_area_query.mjs --countries PNG,PYF,TON,TUV,VUT,WLF,TKL,NIU

Options:
  --countries <csv|ALL>
  --only-missing
  --reference-dir <dir>        default data/reference/pict
  --cache-dir <dir>            default backend/cache/admin_assets
  --derive-asset-levels <csv>  default ADM1,ADM2
  --asset-types <csv>
  --delay-ms <n>               default 12000
  --timeout-seconds <n>        default 180
  --force-assets
  --dry-run`);
}
function repoRoot() {
  for (const p of [process.cwd(), path.resolve(process.cwd(), ".."), path.resolve(__dirname, ".."), path.resolve(__dirname, "../..")]) {
    if (fs.existsSync(path.join(p, "data")) || fs.existsSync(path.join(p, "backend"))) return p;
  }
  return process.cwd();
}
function rel(base, p, fallback) { const v = p || fallback; return path.isAbsolute(v) ? v : path.resolve(base, v); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function countryByIso(iso3) { return COUNTRIES.find(c => c.iso3 === iso3.toUpperCase()) || { iso3: iso3.toUpperCase(), name: iso3.toUpperCase() }; }
function sanitize(v) { return (String(v || "unknown").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")) || "unknown"; }
function assetTypes(types) { return (types?.length ? types : DEFAULT_TYPES).map(String).map(s => s.toLowerCase()).sort(); }
function cachePath(cacheDir, level, id, types) { return path.resolve(cacheDir, `${sanitize(level)}_${sanitize(id)}_${assetTypes(types).map(sanitize).join("_")}.json`); }
function validCache(p) { try { const j = JSON.parse(fs.readFileSync(p, "utf8")); return j?.schema_version === CACHE_SCHEMA_VERSION && Array.isArray(j.features); } catch { return false; } }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function writeCache(p, metadata, features) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify({ schema_version: CACHE_SCHEMA_VERSION, created_at: new Date().toISOString(), metadata: { ...metadata, asset_count: features.length }, features }, null, 2)); }
function wantedCountries(refDir, cacheDir, types, args) {
  if (args.countries.length) return args.countries.map(countryByIso);
  const mf = readJson(path.resolve(path.dirname(refDir), "pict_bootstrap_manifest.json"));
  if (!mf?.countries) return COUNTRIES.filter(c => c.iso3 !== "FJI");
  return mf.countries.filter(e => {
    const iso = String(e.country_iso3 || "").toUpperCase();
    if (!iso) return false;
    if (!args.onlyMissing) return true;
    return e.assets?.status !== "ready" || !validCache(cachePath(cacheDir, "adm0", `${iso.toLowerCase()}_adm0_country`, types));
  }).map(e => countryByIso(e.country_iso3));
}
function normLng(x) { let n = Number(x); if (!Number.isFinite(n)) return n; while (n > 180) n -= 360; while (n < -180) n += 360; return n; }
function normCoords(c) { if (!Array.isArray(c)) return c; if (c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number") return [normLng(c[0]), c[1]]; return c.map(normCoords); }
function normGeom(g) { if (!g) return g; return g.type === "Point" ? { ...g, coordinates: normCoords(g.coordinates) } : { ...g, coordinates: normCoords(g.coordinates) }; }
function ringCrosses(ring) { let min = Infinity, max = -Infinity; for (const p of ring || []) { const x = Number(p[0]); if (Number.isFinite(x)) { min = Math.min(min, x); max = Math.max(max, x); } } return Number.isFinite(min) && max - min > 180; }
function shiftRing(ring) { return ring.map(p => [Number(p[0]) < 0 ? Number(p[0]) + 360 : Number(p[0]), Number(p[1])]); }
function shiftPt(p) { return [Number(p[0]) < 0 ? Number(p[0]) + 360 : Number(p[0]), Number(p[1])]; }
function pointInRing(pt, ring) { const x = pt[0], y = pt[1]; let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; const hit = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi); if (hit) inside = !inside; } return inside; }
function pointInPoly(pt, rings) { const ext = rings?.[0]; if (!ext?.length) return false; const cross = ringCrosses(ext); const p = cross ? shiftPt(pt) : pt; const e = cross ? shiftRing(ext) : ext; if (!pointInRing(p, e)) return false; for (const h of rings.slice(1)) if (pointInRing(p, cross ? shiftRing(h) : h)) return false; return true; }
function inside(pt, geom) { const p = [normLng(pt[0]), pt[1]]; const g = normGeom(geom); if (g?.type === "Polygon") return pointInPoly(p, g.coordinates); if (g?.type === "MultiPolygon") return g.coordinates.some(poly => pointInPoly(p, poly)); return false; }
function insideAny(pt, features) { return features.some(f => inside(pt, f.geometry)); }
function coords(feature) { const c = feature?.geometry?.coordinates; return Array.isArray(c) && c.length >= 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1])) ? [Number(c[0]), Number(c[1])] : null; }
function filters(t) { return ({
  hospital: [["amenity","hospital"],["healthcare","hospital"],["healthcare","clinic"]],
  school: [["amenity","school"],["amenity","college"],["amenity","university"],["amenity","kindergarten"]],
  port: [["amenity","ferry_terminal"],["harbour","yes"],["man_made","pier"]],
  power_substation: [["power","substation"]],
  critical_facility: [["amenity","fire_station"],["amenity","police"],["emergency","ambulance_station"]],
}[t] || []); }
function assetType(tags) { if (["hospital","clinic"].includes(tags.amenity) || ["hospital","clinic"].includes(tags.healthcare)) return "hospital"; if (["school","college","university","kindergarten"].includes(tags.amenity)) return "school"; if (tags.harbour === "yes" || tags.amenity === "ferry_terminal" || tags.man_made === "pier") return "port"; if (tags.power === "substation") return "power_substation"; return "critical_facility"; }
function escapeQ(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function areaQuery(country, type, timeoutSeconds) {
  const lines = filters(type).map(([k,v]) => `node["${escapeQ(k)}"="${escapeQ(v)}"](area.searchArea); way["${escapeQ(k)}"="${escapeQ(v)}"](area.searchArea); relation["${escapeQ(k)}"="${escapeQ(v)}"](area.searchArea);`).join("\n");
  if (!lines) return null;
  return `[out:json][timeout:${Math.round(timeoutSeconds)}];
area["ISO3166-1"="${escapeQ(country.iso3)}"]["boundary"="administrative"]->.a1;
area["ISO3166-1:alpha3"="${escapeQ(country.iso3)}"]["boundary"="administrative"]->.a3;
area["name"="${escapeQ(country.name)}"]["boundary"="administrative"]->.an;
(.a1; .a3; .an;)->.searchArea;
(
${lines}
);
out center tags;`;
}
async function overpass(query, timeoutSeconds) {
  let last;
  for (const endpoint of ENDPOINTS) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), Math.max(30, timeoutSeconds + 30) * 1000);
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Accept: "application/json", "User-Agent": "pict-climate-risk-viz-chatbot/0.1" }, body: new URLSearchParams({ data: query }), signal: ctl.signal });
      clearTimeout(to);
      if (!res.ok) { const txt = await res.text(); last = new Error(`HTTP ${res.status} from ${endpoint}: ${txt.slice(0, 180)}`); console.warn(`    ${last.message}`); continue; }
      return await res.json();
    } catch (e) { last = e; console.warn(`    endpoint failed: ${endpoint}`, e?.message || e); }
  }
  throw last || new Error("all endpoints failed");
}
function elementFeature(el, countryFeatures, country) {
  const lon = el.lon ?? el.center?.lon, lat = el.lat ?? el.center?.lat;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !insideAny([lon, lat], countryFeatures)) return null;
  const tags = el.tags && typeof el.tags === "object" ? el.tags : {};
  const t = assetType(tags);
  return { type: "Feature", geometry: { type: "Point", coordinates: [normLng(lon), lat] }, properties: { layer_name: LAYER_NAME, feature_role: "raw_asset", country_id: country.iso3.toLowerCase(), country_iso3: country.iso3, country_name: country.name, asset_id: `${country.iso3.toLowerCase()}-${el.type}-${el.id}`, asset_name: tags.name || tags["name:en"] || tags.operator || `${t} ${el.id}`, asset_type: t, osm_type: el.type, osm_id: el.id, osm_tags: tags } };
}
function dedupe(features) { const seen = new Set(), out = []; for (const f of features) { const id = String(f?.properties?.asset_id || ""); if (!id || seen.has(id)) continue; seen.add(id); out.push(f); } return out; }
function loadCountryFeatures(refDir, country) { const p = path.resolve(refDir, country.iso3.toLowerCase(), "adm0.geojson"); const j = readJson(p); if (!j?.features?.length) throw new Error(`missing ADM0 ${p}`); return j.features.map(f => ({ ...f, geometry: normGeom(f.geometry) })); }
function loadAdmin(refDir, country, level) { const p = path.resolve(refDir, country.iso3.toLowerCase(), `${level.toLowerCase()}.geojson`); const j = readJson(p); return j?.features?.length ? { ...j, features: j.features.map(f => ({ ...f, geometry: normGeom(f.geometry) })) } : null; }
function derive(country, refDir, cacheDir, countryFeatures, types, levels, args) {
  let count = 0;
  for (const level of levels) {
    const col = loadAdmin(refDir, country, level); if (!col) continue;
    for (const admin of col.features) {
      const props = admin.properties || {};
      const adminLevel = props.admin_level || level.toLowerCase();
      const adminId = props.admin_id || sanitize(`${country.iso3}_${level}_${props.admin_name || props.shapeName || props.name || count}`);
      const adminName = props.admin_name || props.shapeName || props.name || adminId;
      const p = cachePath(cacheDir, adminLevel, adminId, types);
      if (!args.forceAssets && validCache(p)) { count++; continue; }
      const matched = dedupe(countryFeatures.filter(f => { const c = coords(f); return c && inside(c, admin.geometry); }).map(f => ({ ...f, properties: { ...f.properties, source_admin_id: adminId, source_admin_name: adminName, source_admin_level: adminLevel } })));
      if (!args.dryRun) writeCache(p, { country_id: country.iso3.toLowerCase(), country_iso3: country.iso3, country_name: country.name, admin_level: adminLevel, admin_id: adminId, admin_name: adminName, asset_types: assetTypes(types), source: "derived_from_country_osm_area_cache" }, matched);
      count++;
    }
  }
  return count;
}
async function fetchCountryAssets(country, refDir, args) {
  const countryFeatures = loadCountryFeatures(refDir, country);
  const all = [], results = [];
  for (let i = 0; i < args.assetTypes.length; i++) {
    const t = args.assetTypes[i];
    try {
      console.log(`  ${t}: area query...`);
      if (args.dryRun) { results.push({ asset_type: t, status: "dry_run", asset_count: 0 }); continue; }
      const q = areaQuery(country, t, args.timeoutSeconds);
      const data = await overpass(q, args.timeoutSeconds);
      const features = (Array.isArray(data.elements) ? data.elements : []).map(el => elementFeature(el, countryFeatures, country)).filter(Boolean);
      all.push(...features);
      results.push({ asset_type: t, status: "ready", asset_count: features.length });
      console.log(`  ${t}: ${features.length} assets`);
    } catch (e) { const msg = e?.message || String(e); results.push({ asset_type: t, status: "failed", error: msg }); console.warn(`  ${t}: failed: ${msg}`); }
    if (i < args.assetTypes.length - 1 && args.delayMs > 0) await sleep(args.delayMs);
  }
  return { features: dedupe(all), results };
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const refDir = rel(root, args.referenceDir, "data/reference/pict");
  const cacheDir = rel(root, args.cacheDir, "backend/cache/admin_assets");
  args.assetTypes = assetTypes(args.assetTypes);
  const countries = wantedCountries(refDir, cacheDir, args.assetTypes, args);
  console.log("Retry PICT assets with Overpass area queries", { countries: countries.map(c => c.iso3), refDir, cacheDir, delayMs: args.delayMs, timeoutSeconds: args.timeoutSeconds, forceAssets: args.forceAssets });
  const results = [];
  for (let i = 0; i < countries.length; i++) {
    const country = countries[i];
    console.log(`\n[${i + 1}/${countries.length}] ${country.name} (${country.iso3})`);
    const countryId = `${country.iso3.toLowerCase()}_adm0_country`;
    const cp = cachePath(cacheDir, "adm0", countryId, args.assetTypes);
    try {
      let features, assetTypeResults;
      if (!args.forceAssets && validCache(cp)) {
        const payload = readJson(cp); features = payload.features || []; assetTypeResults = payload.metadata?.asset_type_results || [];
        console.log(`  skip existing country cache (${features.length} assets)`);
      } else {
        const fetched = await fetchCountryAssets(country, refDir, args);
        features = fetched.features; assetTypeResults = fetched.results;
        if (!args.dryRun) writeCache(cp, { country_id: country.iso3.toLowerCase(), country_iso3: country.iso3, country_name: country.name, admin_level: "adm0", admin_id: countryId, admin_name: country.name, asset_types: args.assetTypes, source: "country_osm_area_cache", asset_type_results: assetTypeResults }, features);
      }
      const derived = derive(country, refDir, cacheDir, features, args.assetTypes, args.deriveLevels, args);
      results.push({ country_iso3: country.iso3, country_name: country.name, status: "ready", country_asset_count: features.length, derived_cache_count: derived, asset_type_results: assetTypeResults });
      console.log(`  ready: ${features.length} country assets, ${derived} derived admin caches`);
    } catch (e) {
      const msg = e?.message || String(e); results.push({ country_iso3: country.iso3, country_name: country.name, status: "failed", error: msg }); console.warn(`  failed: ${msg}`);
    }
    if (i < countries.length - 1 && args.delayMs > 0) await sleep(args.delayMs);
  }
  if (!args.dryRun) fs.writeFileSync(path.resolve(path.dirname(refDir), "pict_asset_area_retry_manifest.json"), JSON.stringify({ created_at: new Date().toISOString(), method: "overpass_area_query_retry", options: { countries: countries.map(c => c.iso3), asset_types: args.assetTypes, delay_ms: args.delayMs, timeout_seconds: args.timeoutSeconds, force_assets: args.forceAssets }, results }, null, 2));
  console.log("\nDone.", { country_count: results.length, ready_count: results.filter(r => r.status === "ready").length, failed_count: results.filter(r => r.status === "failed").length });
}
main().catch(e => { console.error(e?.stack || e?.message || e); process.exit(1); });
