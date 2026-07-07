/**
 * Geospatial Join Coordinator
 *
 * Maps GEO_PICT ISO country codes (two-letter) to geometry shapes
 * inside data/reference/pict_regions.geojson.
 *
 * Two-letter GEO_PICT codes are mapped to three-letter iso3 codes
 * using the ISO_3166_2_TO_ISO3 lookup below.
 *
 * Falls back to region_aliases.json for atoll-specific name normalization.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapping from ISO 3166-1 alpha-2 (two-letter) to ISO 3166-1 alpha-3 (three-letter)
const ISO_3166_2_TO_ISO3 = {
  AS: "ASM", // American Samoa
  CK: "COK", // Cook Islands
  FM: "FSM", // Federated States of Micronesia
  FJ: "FJI", // Fiji
  PF: "PYF", // French Polynesia
  GU: "GUM", // Guam
  KI: "KIR", // Kiribati
  MH: "MHL", // Marshall Islands
  NR: "NRU", // Nauru
  NC: "NCL", // New Caledonia
  NU: "NIU", // Niue
  MP: "MNP", // Northern Mariana Islands
  PW: "PLW", // Palau
  PG: "PNG", // Papua New Guinea
  PN: "PCN", // Pitcairn Islands
  WS: "WSM", // Samoa
  SB: "SLB", // Solomon Islands
  TK: "TKL", // Tokelau
  TO: "TON", // Tonga
  TV: "TUV", // Tuvalu
  VU: "VUT", // Vanuatu
  WF: "WLF", // Wallis and Futuna
};

// Reference data paths (resolved relative to project root)
const REGIONS_GEOJSON_PATH = path.resolve(
  __dirname,
  "../../data/reference/pict_regions.geojson"
);
const ALIASES_PATH = path.resolve(
  __dirname,
  "../../data/reference/region_aliases.json"
);

// Cached reference data
let regionsGeoJson = null;
let regionAliases = null;

/**
 * Load the PICT regions GeoJSON, caching it.
 * @returns {Object} parsed GeoJSON FeatureCollection
 */
function loadRegionsGeoJson() {
  if (regionsGeoJson) return regionsGeoJson;
  const raw = fs.readFileSync(REGIONS_GEOJSON_PATH, "utf8");
  regionsGeoJson = JSON.parse(raw);
  return regionsGeoJson;
}

/**
 * Load the region aliases JSON, caching it.
 * @returns {Object}
 */
function loadRegionAliases() {
  if (regionAliases) return regionAliases;
  const raw = fs.readFileSync(ALIASES_PATH, "utf8");
  regionAliases = JSON.parse(raw);
  return regionAliases;
}

/**
 * Normalize an atoll/island name using region_aliases.json.
 * @param {string} name
 * @returns {string} normalized name or original if not found
 */
function normalizeName(name) {
  const aliases = loadRegionAliases();
  const lower = name.toLowerCase().trim();
  return aliases[lower] || name;
}

/**
 * Find a region feature in pict_regions.geojson by two-letter GEO_PICT code.
 * @param {string} geoPictCode - e.g. "FJ", "KI"
 * @returns {Object|null} GeoJSON feature or null
 */
function findRegionByGeoPictCode(geoPictCode) {
  const iso3 = ISO_3166_2_TO_ISO3[geoPictCode];
  if (!iso3) return null;

  const collection = loadRegionsGeoJson();
  for (const feature of collection.features) {
    const props = feature.properties || {};
    if (props.iso3 === iso3) {
      return feature;
    }
  }
  return null;
}

/**
 * Find a region feature by matching a name string (using alias normalization).
 * @param {string} rawName
 * @returns {Object|null}
 */
function findRegionByName(rawName) {
  const normalized = normalizeName(rawName);
  const collection = loadRegionsGeoJson();
  for (const feature of collection.features) {
    const props = feature.properties || {};
    if (
      props.name &&
      props.name.toLowerCase() === normalized.toLowerCase()
    ) {
      return feature;
    }
  }
  return null;
}

/**
 * Join tabular SDMX observations with region geometries.
 * Maps the GEO_PICT dimension to the matching geometry feature.
 *
 * @param {Array<Object>} observations - array of objects with geoPictCode, value, year
 * @param {string} layerName - layer identifier for property injection
 * @returns {Array<Object>} enriched GeoJSON features with indicator values
 */
function joinObservationsToRegions(observations, layerName) {
  const joined = [];

  for (const obs of observations) {
    const { geoPictCode, value, year } = obs;
    const feature = findRegionByGeoPictCode(geoPictCode);

    if (feature) {
      joined.push({
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          layer_name: layerName,
          indicator_value: value,
          observation_year: year,
          geo_pict: geoPictCode,
        },
      });
    }
    // If no matching feature, skip (returns null for missing areas per architecture)
  }

  return joined;
}

export {
  loadRegionsGeoJson,
  loadRegionAliases,
  normalizeName,
  findRegionByGeoPictCode,
  findRegionByName,
  joinObservationsToRegions,
  ISO_3166_2_TO_ISO3,
};
