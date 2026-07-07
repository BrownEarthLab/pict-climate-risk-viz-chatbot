import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  fetchLayerDataWithTimeout,
  getUrlSafeCacheKey,
  LAYER_CONFIGS,
} from "./services/sdmxApiClient.js";
import {
  getCached,
  setCached,
  clearCache,
  getStaleFromDisk,
} from "./services/cacheManager.js";
import {
  joinObservationsToRegions,
  findRegionByGeoPictCode,
} from "./services/coordinator.js";
import { binFeaturesToH3 } from "./services/h3Binner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Resolve paths to the frontend public folder where GeoJSONs are stored
const tasPath = path.resolve(
  __dirname,
  "../frontend/public/pacific_islands_tas.geojson"
);
const wbPath = path.resolve(
  __dirname,
  "../frontend/public/pacific_islands_wet_bulb.geojson"
);

console.log("Loading datasets on startup...");
let tasFeatures = [];
let wbFeatures = [];

try {
  if (fs.existsSync(tasPath)) {
    const tasData = JSON.parse(fs.readFileSync(tasPath, "utf8"));
    tasFeatures = tasData.features || [];
    console.log(`Successfully loaded ${tasFeatures.length} TAS features.`);
  } else {
    console.warn(`Warning: TAS dataset not found at ${tasPath}`);
  }
} catch (err) {
  console.error("Error loading TAS dataset:", err);
}

try {
  if (fs.existsSync(wbPath)) {
    const wbData = JSON.parse(fs.readFileSync(wbPath, "utf8"));
    wbFeatures = wbData.features || [];
    console.log(`Successfully loaded ${wbFeatures.length} Wet-Bulb features.`);
  } else {
    console.warn(`Warning: Wet-Bulb dataset not found at ${wbPath}`);
  }
} catch (err) {
  console.error("Error loading Wet-Bulb dataset:", err);
}

// Ray-Casting Point-in-Polygon check
function pointInPolygon(point, polygonCoords) {
  const x = point[0];
  const y = point[1];
  const ring = polygonCoords[0];
  if (!ring || ring.length === 0) return false;

  let inside = false;
  const n = ring.length;
  let p1x = ring[0][0];
  let p1y = ring[0][1];

  for (let i = 0; i <= n; i++) {
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

// Check if a point is inside a Polygon or MultiPolygon
function isPointInsideGeometry(point, geometry) {
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  } else if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polyCoords) =>
      pointInPolygon(point, polyCoords)
    );
  }
  return false;
}

// Calculate centroid of an H3 cell polygon coordinates
function getCentroid(geometry) {
  // If coordinates are deeply nested (MultiPolygon vs Polygon)
  const coords =
    geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.coordinates[0];
  const ring = coords[0];
  if (!ring || ring.length === 0) return [0, 0];

  let sumLng = 0;
  let sumLat = 0;
  const count = ring.length - 1; // last equals first
  if (count <= 0) return [0, 0];
  for (let i = 0; i < count; i++) {
    sumLng += ring[i][0];
    sumLat += ring[i][1];
  }
  return [sumLng / count, sumLat / count];
}

// ---------------------------------------------------------------
// Existing spatial query endpoint
// ---------------------------------------------------------------
app.post("/api/spatial-query", (req, res) => {
  const { drawn_boundary, target_layers, analysis_type } = req.body;

  if (!drawn_boundary) {
    return res
      .status(400)
      .json({ error: "Missing drawn_boundary in request body" });
  }

  const geometryType = drawn_boundary.type;
  const coords = drawn_boundary.coordinates;
  const coordCount = coords?.[0]?.length ?? 0;

  console.log("--- Spatial Query Received ---");
  console.log("Geometry type:", geometryType);
  console.log("Analysis type:", analysis_type);
  console.log("Target layers:", target_layers);
  console.log("--------------------------------");

  // Default Echo mode (E2E Test compliance)
  if (!analysis_type || analysis_type === "echo") {
    const description = `Successfully received geometry of type ${geometryType} with ${coordCount} coordinates.`;
    return res.json({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: drawn_boundary,
          properties: {
            layer_name: "Backend Received Polygon",
            description,
          },
        },
      ],
    });
  }

  const outputFeatures = [];

  if (analysis_type === "zonal_stats") {
    // Candidate B: Zonal Air Temperature Stats
    const matched = [];
    tasFeatures.forEach((feature) => {
      const centroid = getCentroid(feature.geometry);
      if (isPointInsideGeometry(centroid, drawn_boundary)) {
        matched.push({
          type: "Feature",
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            layer_name: "Near-Surface Air Temp (TAS)",
          },
        });
      }
    });

    if (matched.length > 0) {
      const temps = matched.map((f) => f.properties.temp_c);
      const min = Math.min(...temps);
      const max = Math.max(...temps);
      const sum = temps.reduce((a, b) => a + b, 0);
      const mean = sum / temps.length;
      const range = max - min;

      const summary = `Air Temp Zonal Stats:\n• Mean Temp: ${mean.toFixed(
        2
      )}°C\n• Max Temp: ${max.toFixed(2)}°C\n• Min Temp: ${min.toFixed(
        2
      )}°C\n• Range: ${range.toFixed(2)}°C\n• Grid cells: ${matched.length}`;

      // Inject description into the first analytical feature
      matched[0].properties.description = summary;
      outputFeatures.push(...matched);
    }
  } else if (analysis_type === "heat_stress") {
    // Candidate A: Zonal Wet-Bulb Temperature Stats
    const matched = [];
    wbFeatures.forEach((feature) => {
      const centroid = getCentroid(feature.geometry);
      if (isPointInsideGeometry(centroid, drawn_boundary)) {
        matched.push({
          type: "Feature",
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            layer_name: "Annual Mean Wet-Bulb (WBT)",
          },
        });
      }
    });

    if (matched.length > 0) {
      const wbs = matched.map((f) => f.properties.wet_bulb_c);
      const min = Math.min(...wbs);
      const max = Math.max(...wbs);
      const sum = wbs.reduce((a, b) => a + b, 0);
      const mean = sum / wbs.length;
      const range = max - min;

      const summary = `Wet-Bulb Temp Stats:\n• Mean WBT: ${mean.toFixed(
        2
      )}°C\n• Max WBT: ${max.toFixed(2)}°C\n• Min WBT: ${min.toFixed(
        2
      )}°C\n• Range: ${range.toFixed(2)}°C\n• Grid cells: ${matched.length}`;

      // Inject description into the first analytical feature
      matched[0].properties.description = summary;
      outputFeatures.push(...matched);
    }
  }

  // If no H3 cells are intersected, we still return a feature with a descriptive warning
  if (outputFeatures.length === 0) {
    outputFeatures.push({
      type: "Feature",
      geometry: drawn_boundary,
      properties: {
        layer_name: "Backend Received Polygon",
        description:
          "Warning:\n• No H3 grid cells were found within the drawn boundary.",
      },
    });
  }

  res.json({
    type: "FeatureCollection",
    features: outputFeatures,
  });
});

// ---------------------------------------------------------------
// Dynamic SDMX Layer Endpoints (Tasks 4.2, 2.3)
// ---------------------------------------------------------------

/**
 * Parse SDMX-JSON observations (flat `AllDimensions` form) into a per-region array.
 *
 * With `dimensionAtObservation=AllDimensions`, the SDMX-JSON structure has no
 * `series` helper; observations live under `dataSets[0].observations` keyed by
 * a colon-joined dimension index string (e.g. "0:0:5:2023"). We:
 *   1. Resolve the position of GEO_PICT and TIME_PERIOD in the observation dims.
 *   2. For each observation, accumulate values per (geoPictCode, year), summing
 *      across all other dimensions (e.g. ENERGY_SOURCE × GRID_CONN for Power Gen).
 *   3. Keep the latest year per region so each region has one indicator value.
 *
 * @param {Object} sdmxData - parsed SDMX-JSON payload
 * @returns {Array<{geoPictCode: string, value: number, year: string}>}
 *          One entry per GEO_PICT region (latest year, summed across sub-dimensions).
 */
function parseSdmxObservations(sdmxData) {
  if (!sdmxData || !sdmxData.data || !Array.isArray(sdmxData.data.dataSets)) {
    return [];
  }
  const structure = sdmxData.data.structure;
  if (!structure || !structure.dimensions || !structure.dimensions.observation) {
    return [];
  }

  const obsDims = structure.dimensions.observation;
  let geoPos = -1;
  let timePos = -1;
  for (let i = 0; i < obsDims.length; i++) {
    if (obsDims[i].id === "GEO_PICT") geoPos = i;
    if (obsDims[i].id === "TIME_PERIOD") timePos = i;
  }
  if (geoPos === -1 || timePos === -1) return [];

  // Build lookup: dim position -> { index -> code }
  // SDMX-JSON stores dimension *values* in `values` (with id + name).
  const dimValueIdAt = (pos, idx) => {
    const vals = obsDims[pos] && obsDims[pos].values;
    if (!vals || !vals[idx]) return null;
    return vals[idx].id != null ? String(vals[idx].id) : String(idx);
  };

  // Accumulate sum per `${geo}|${year}` and track year per geo.
  // sums: { "GEO|YEAR": number }
  // latestYearPerGeo: { "GEO": year }
  const sums = {};
  const latestYearPerGeo = {};

  for (const dataSet of sdmxData.data.dataSets) {
    const obs = dataSet && dataSet.observations;
    if (!obs) continue;

    for (const [keyStr, obsValue] of Object.entries(obs)) {
      const idxs = keyStr.split(":");
      const geoCode = dimValueIdAt(geoPos, Number(idxs[geoPos]));
      const yearCode = dimValueIdAt(timePos, Number(idxs[timePos]));
      if (!geoCode || !yearCode) continue;

      const val = Array.isArray(obsValue) ? obsValue[0] : null;
      if (val === null || val === undefined || Number.isNaN(Number(val))) continue;

      const numVal = Number(val);
      const k = `${geoCode}|${yearCode}`;
      sums[k] = (sums[k] || 0) + numVal;

      const cur = latestYearPerGeo[geoCode];
      if (!cur || String(yearCode) > String(cur)) {
        latestYearPerGeo[geoCode] = yearCode;
      }
    }
  }

  const observations = [];
  for (const [geoCode, year] of Object.entries(latestYearPerGeo)) {
    const value = sums[`${geoCode}|${year}`];
    if (value === undefined) continue;
    observations.push({ geoPictCode: geoCode, value, year });
  }
  return observations;
}

/**
 * Handle a dynamic layer request.
 * Fetches from PDH (or cache), joins with regions, and returns enriched GeoJSON.
 * @param {string} layerName - 'sea_level', 'power_gen', or 'water_access'
 */
async function handleLayerRequest(layerName, res) {
  const cacheKey = getUrlSafeCacheKey(layerName);

  try {
    // 1. Check cache first
    let sdmxData = getCached(cacheKey);

    if (!sdmxData) {
      // 2. Cache miss — fetch from API
      sdmxData = await fetchLayerDataWithTimeout(layerName, 10000);
      // 3. Store in cache
      setCached(cacheKey, sdmxData);
    }

    // 4. Parse observations
    const observations = parseSdmxObservations(sdmxData);

    // 5. Join with region geometries
    const regionFeatures = joinObservationsToRegions(observations, layerName);

    let result;
    if (layerName === "sea_level") {
      // H3 bin for sea level rise
      result = binFeaturesToH3(regionFeatures);
    } else {
      // For power_gen (points) and water_access (choropleth), return region geometry directly
      result = {
        type: "FeatureCollection",
        features: regionFeatures,
      };
    }

    return res.json({
      layer: layerName,
      status: "available",
      data: result,
    });
  } catch (err) {
    console.error(`Error fetching layer "${layerName}":`, err.message);

    // 5. Fallback: try stale cache
    const staleData = getStaleFromDisk(cacheKey);
    if (staleData) {
      const observations = parseSdmxObservations(staleData);
      const regionFeatures = joinObservationsToRegions(observations, layerName);

      let result;
      if (layerName === "sea_level") {
        result = binFeaturesToH3(regionFeatures);
      } else {
        result = {
          type: "FeatureCollection",
          features: regionFeatures,
        };
      }

      return res.json({
        layer: layerName,
        status: "stale",
        data: result,
        warning: "Using cached data — PDH unreachable",
      });
    }

    // 6. No cache — return error contract (503)
    return res.status(503).json({
      layer: layerName,
      status: "unavailable",
      data: null,
      error: `PDH unreachable, no cache: ${err.message}`,
    });
  }
}

// GET /api/layers/:layer — serve dynamic layer data
app.get("/api/layers/:layer", async (req, res) => {
  const { layer } = req.params;

  if (!["sea_level", "power_gen", "water_access"].includes(layer)) {
    return res.status(400).json({ error: `Unknown layer: ${layer}` });
  }

  await handleLayerRequest(layer, res);
});

// POST /api/refresh — admin endpoint to trigger manual cache refresh (Task 2.3)
app.post("/api/refresh", async (req, res) => {
  const { layer } = req.query;

  if (!layer || !["sea_level", "power_gen", "water_access"].includes(layer)) {
    return res
      .status(400)
      .json({
        error:
          "Missing or invalid 'layer' query param. Must be one of: sea_level, power_gen, water_access",
      });
  }

  const cacheKey = getUrlSafeCacheKey(layer);

  try {
    // Force-fetch from API, bypassing cache
    const freshData = await fetchLayerDataWithTimeout(layer, 10000);
    // Update cache with fresh data
    setCached(cacheKey, freshData);

    return res.json({
      layer,
      status: "refreshed",
      message: `Cache for "${layer}" refreshed successfully.`,
    });
  } catch (err) {
    console.error(`Cache refresh failed for "${layer}":`, err.message);
    return res.status(503).json({
      layer,
      status: "refresh_failed",
      error: `Failed to refresh cache: ${err.message}`,
    });
  }
});

// GET /api/layers — list available dynamic layers from registry
app.get("/api/layers", (req, res) => {
  const registryPath = path.resolve(
    __dirname,
    "../data/layers/climate_layer_registry.json"
  );
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const dynamicLayers = registry.filter(
      (entry) => entry.artifact_type && entry.artifact_type.startsWith("dynamic_")
    );
    res.json(dynamicLayers);
  } catch (err) {
    res.status(500).json({ error: "Failed to read layer registry" });
  }
});

// GET /api/chatbot-context — inject dynamic layer status for chatbot prompts
app.get("/api/chatbot-context", async (req, res) => {
  const context = {
    available_layers: [],
    unavailable_layers: [],
  };

  const layerNames = ["sea_level", "power_gen", "water_access"];

  for (const layerName of layerNames) {
    const cacheKey = getUrlSafeCacheKey(layerName);
    const cached = getCached(cacheKey);
    if (cached) {
      context.available_layers.push(layerName);
    } else {
      context.unavailable_layers.push(layerName);
    }
  }

  res.json(context);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Spatial-query backend running on http://0.0.0.0:${PORT}`);
});
