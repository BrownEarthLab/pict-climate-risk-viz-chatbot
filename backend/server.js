import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fromArrayBuffer } from "geotiff";
import { interpretResults } from "./interpretResults.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Resolve paths to the frontend public folder where GeoJSONs are stored.
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

const MANUAL_HEAT_RISK_LAYER = "Manual Heat Risk";
const MANUAL_HEAT_RISK_ASSET_LAYER = "Manual Heat Risk Assets";
const POPULATION_EXPOSURE_OVERLAY_LAYER = "Population Exposure Overlay";

const OVERPASS_ASSET_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const overpassAssetCache = new Map();

const WORLDPOP_FJI_2020_URL =
  "https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/FJI/fji_ppp_2020.tif";

const WORLDPOP_CACHE_DIR = path.resolve(__dirname, "cache");
const WORLDPOP_FJI_2020_PATH = path.resolve(
  WORLDPOP_CACHE_DIR,
  "fji_ppp_2020.tif"
);

let worldPopFijiRasterCache = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Ray-casting point-in-polygon check.
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

function isPointInsideGeometry(point, geometry) {
  if (!geometry) return false;

  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polyCoords) =>
      pointInPolygon(point, polyCoords)
    );
  }

  return false;
}

function getCentroid(geometry) {
  const coords =
    geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates[0];

  const ring = coords[0];

  if (!ring || ring.length === 0) return [0, 0];

  let sumLng = 0;
  let sumLat = 0;
  const count = ring.length - 1;

  if (count <= 0) return [0, 0];

  for (let i = 0; i < count; i++) {
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
  const points = flattenCoordinates(geometry.coordinates);

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

function makeCellPolygon(centerLng, centerLat, width, height) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return {
    type: "Polygon",
    coordinates: [
      [
        [centerLng - halfWidth, centerLat - halfHeight],
        [centerLng + halfWidth, centerLat - halfHeight],
        [centerLng + halfWidth, centerLat + halfHeight],
        [centerLng - halfWidth, centerLat + halfHeight],
        [centerLng - halfWidth, centerLat - halfHeight],
      ],
    ],
  };
}

function generateManualRiskGrid(drawnBoundary, gridSize = 10) {
  const bbox = getGeometryBbox(drawnBoundary);

  const lngSpan = Math.max(bbox.east - bbox.west, 0.05);
  const latSpan = Math.max(bbox.north - bbox.south, 0.05);

  const cellWidth = lngSpan / gridSize;
  const cellHeight = latSpan / gridSize;

  const cells = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const lng = bbox.west + cellWidth * (col + 0.5);
      const lat = bbox.south + cellHeight * (row + 0.5);

      if (!isPointInsideGeometry([lng, lat], drawnBoundary)) {
        continue;
      }

      cells.push({
        id: `risk_cell_${row}_${col}`,
        centroid: [lng, lat],
        geometry: makeCellPolygon(lng, lat, cellWidth, cellHeight),
      });
    }
  }

  return cells;
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

async function buildHeatUncertaintySurface(gridCells, threshold) {
  if (gridCells.length === 0) {
    return [];
  }

  const latitudes = gridCells
    .map((cell) => cell.centroid[1].toFixed(5))
    .join(",");

  const longitudes = gridCells
    .map((cell) => cell.centroid[0].toFixed(5))
    .join(",");

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${latitudes}` +
    `&longitude=${longitudes}` +
    "&hourly=temperature_2m,apparent_temperature" +
    "&forecast_days=3" +
    "&timezone=UTC";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Open-Meteo hourly forecast request failed with HTTP ${response.status}`
    );
  }

  const data = await response.json();
  const records = Array.isArray(data) ? data : [data];

  return gridCells.map((cell, index) => {
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

    return {
      type: "Feature",
      geometry: cell.geometry,
      properties: {
        layer_name: MANUAL_HEAT_RISK_LAYER,
        feature_role: "risk_grid",
        cell_id: cell.id,
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
          "Heat-risk uncertainty grid cell from Open-Meteo hourly forecast spread.",
      },
    };
  });
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

  const col = (lng - originX) / resolutionX;
  const row = (lat - originY) / resolutionY;

  return [col, row];
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
  const raster = await loadWorldPopFijiRaster();
  const window = getRasterWindowForGeometry(geometry, raster);

  if (!window) {
    return 0;
  }

  const rasters = await raster.image.readRasters({ window });
  const values = rasters[0];

  let total = 0;

  for (const value of values) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      continue;
    }

    if (raster.noData !== null && numericValue === raster.noData) {
      continue;
    }

    if (numericValue < 0) {
      continue;
    }

    total += numericValue;
  }

  return total;
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
  _drawnBoundary,
  threshold
) {
  const enrichedCells = [];
  let maxPopulation = 0;
  let maxExpectedExposedPopulation = 0;
  let maxUncertaintyDelta = 0;

  for (const feature of riskGridFeatures) {
    const rawPopulationEstimate = await sumWorldPopPopulationForGeometry(
      feature.geometry
    );

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

    const heatUncertaintyDelta = Math.max(
      0,
      Number(feature.properties?.heat_uncertainty_delta ?? 0)
    );

    const expectedExposedPopulation =
      populationEstimate * exposureProbability;

    maxPopulation = Math.max(maxPopulation, populationEstimate);
    maxExpectedExposedPopulation = Math.max(
      maxExpectedExposedPopulation,
      expectedExposedPopulation
    );
    maxUncertaintyDelta = Math.max(
      maxUncertaintyDelta,
      heatUncertaintyDelta
    );

    enrichedCells.push({
      feature,
      populationEstimate,
      exposureProbability,
      heatUncertaintyDelta,
      expectedExposedPopulation,
    });
  }

  return enrichedCells.map((cell, index) => {
    const normalizedPopulation =
      maxPopulation > 0 ? cell.populationEstimate / maxPopulation : 0;

    const normalizedExpectedExposed =
      maxExpectedExposedPopulation > 0
        ? cell.expectedExposedPopulation / maxExpectedExposedPopulation
        : 0;

    const normalizedUncertainty =
      maxUncertaintyDelta > 0
        ? cell.heatUncertaintyDelta / maxUncertaintyDelta
        : 0;

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
        cell_id: cellId,
        source_cell_id: cellId,
        threshold,
        population_estimate: cell.populationEstimate,
        expected_exposed_population: cell.expectedExposedPopulation,
        population_exposure_percent: cell.exposureProbability,
        exposure_probability: cell.exposureProbability,
        heat_uncertainty_delta: cell.heatUncertaintyDelta,
        normalized_population: normalizedPopulation,
        normalized_expected_exposed: normalizedExpectedExposed,
        normalized_uncertainty: normalizedUncertainty,
        priority_score: priorityScore,
        priority_category: getPriorityCategory(priorityScore),
        risk_uncertainty_quadrant: getRiskUncertaintyQuadrant(
          cell.exposureProbability,
          normalizedUncertainty
        ),
        population_source: "WorldPop Fiji 2020 population counts",
        description:
          "Population exposure marker using WorldPop Fiji 2020 population counts and the current heat-exposure grid.",
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

  const topPriorityCell =
    [...populationRiskFeatures].sort(
      (a, b) =>
        Number(b.properties?.priority_score || 0) -
        Number(a.properties?.priority_score || 0)
    )[0] || null;

  return {
    total_population: totalPopulation,
    expected_exposed_population: expectedExposedPopulation,
    exposure_percent:
      totalPopulation > 0 ? expectedExposedPopulation / totalPopulation : null,
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
          population_estimate: topPriorityCell.properties?.population_estimate,
          expected_exposed_population:
            topPriorityCell.properties?.expected_exposed_population,
          exposure_probability:
            topPriorityCell.properties?.exposure_probability,
          heat_uncertainty_delta:
            topPriorityCell.properties?.heat_uncertainty_delta,
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

function buildOverpassClause(key, value, bbox) {
  const safeKey = escapeOverpassString(key);
  const safeValue = escapeOverpassString(value);
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

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

async function fetchOverpassAssets(drawnBoundary, assetTypes) {
  const cacheKey = getOverpassAssetCacheKey(drawnBoundary, assetTypes);
  const cachedAssets = getCachedOverpassAssets(cacheKey);

  if (cachedAssets) {
    console.log(
      `Using cached Overpass assets: ${cachedAssets.length} features`
    );
    return cachedAssets;
  }

  const bbox = getGeometryBbox(drawnBoundary);

  const paddedBbox = {
    west: bbox.west - 0.01,
    south: bbox.south - 0.01,
    east: bbox.east + 0.01,
    north: bbox.north + 0.01,
  };

  const filters = getOverpassFilters(assetTypes);

  if (filters.length === 0) {
    return [];
  }

  const clauses = filters
    .map((filter) => buildOverpassClause(filter.key, filter.value, paddedBbox))
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
            coordinates: [lon, lat],
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

function sampleAssetsAgainstRiskGrid(assetFeatures, riskGridFeatures, threshold) {
  return assetFeatures.map((asset) => {
    const assetPoint = getFeatureCentroid(asset);

    const nearestRiskFeature =
      [...riskGridFeatures].sort((a, b) => {
        const aDistance = distanceSquared(assetPoint, getFeatureCentroid(a));
        const bDistance = distanceSquared(assetPoint, getFeatureCentroid(b));
        return aDistance - bDistance;
      })[0] || null;

    const heatValue = Number(nearestRiskFeature?.properties?.heat_value);
    const heatMean = Number(nearestRiskFeature?.properties?.heat_mean);
    const heatP10 = Number(nearestRiskFeature?.properties?.heat_p10);
    const heatP90 = Number(nearestRiskFeature?.properties?.heat_p90);
    const uncertaintyDelta = Number(
      nearestRiskFeature?.properties?.heat_uncertainty_delta
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
        threshold,
        sampled_hazard_value: safeHeatValue,
        heat_value: safeHeatValue,
        heat_mean: Number.isFinite(heatMean) ? heatMean : null,
        heat_p10: Number.isFinite(heatP10) ? heatP10 : null,
        heat_p90: Number.isFinite(heatP90) ? heatP90 : null,
        heat_uncertainty_delta: Number.isFinite(uncertaintyDelta)
          ? uncertaintyDelta
          : null,
        exposure_probability: safeExposureProbability,
        risk_score: safeExposureProbability,
        exposed_to_hazard: exposed,
        exposure_difference: exposureDifference,
        source_risk_cell_id: nearestRiskFeature?.properties?.cell_id || null,
        description: `${asset.properties.asset_name} sampled against nearest heat-risk grid cell.`,
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

function buildManualRiskSummary(riskGridFeatures, sampledAssets) {
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

  return {
    asset_count: sampledAssets.length,
    exposed_asset_count: exposedAssets.length,
    unexposed_asset_count: unexposedAssets.length,
    missing_value_count: missingValueAssets.length,
    exposure_percent:
      sampledAssets.length > 0 ? exposedAssets.length / sampledAssets.length : null,
    grid_cell_count: riskGridFeatures.length,
    top_asset: topAsset
      ? {
          asset_id: topAsset.properties?.asset_id,
          asset_name: topAsset.properties?.asset_name,
          asset_type: topAsset.properties?.asset_type,
          sampled_hazard_value: topAsset.properties?.sampled_hazard_value,
          exposure_probability: topAsset.properties?.exposure_probability,
          exposed_to_hazard: topAsset.properties?.exposed_to_hazard,
          asset_rank_score: topAsset.properties?.asset_rank_score,
        }
      : null,
  };
}

async function runManualHeatRiskMockup(body) {
  const {
    drawn_boundary,
    asset_types = ["hospital", "school", "port"],
    threshold = 22,
    comparison_operator = ">=",
    include_population = false,
    include_assets = true,
  } = body;

  const numericThreshold = Number(threshold);

  if (!drawn_boundary) {
    throw new Error("Missing drawn_boundary for manual heat-risk analysis.");
  }

  if (!Number.isFinite(numericThreshold)) {
    throw new Error(`Invalid threshold value: ${threshold}`);
  }

  const gridCells = generateManualRiskGrid(drawn_boundary, 10);
  const warnings = [];

  if (gridCells.length === 0) {
    warnings.push("No grid cells were generated inside the drawn boundary.");
  }

  const riskGridFeatures = await buildHeatUncertaintySurface(
    gridCells,
    numericThreshold
  );

  let populationOverlayFeatures = [];
  let populationSummary = null;

  if (include_population) {
    try {
      populationOverlayFeatures = await buildPopulationWeightedHeatRiskSurface(
        riskGridFeatures,
        drawn_boundary,
        numericThreshold
      );

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
      assetFeatures = await fetchOverpassAssets(drawn_boundary, asset_types);
    } catch (error) {
      warnings.push(
        `Infrastructure asset lookup failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (assetFeatures.length === 0) {
      warnings.push(
        "No requested infrastructure assets were found inside the drawn boundary."
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

  const manualSummary = buildManualRiskSummary(riskGridFeatures, rankedAssets);

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
      summary: {
        ...manualSummary,
        population_overlay: populationSummary,
      },
      warnings,
      provenance: {
        method: "manual_heat_risk_with_optional_population_overlay",
        data_sources: [
          "Open-Meteo Forecast API",
          ...(include_population
            ? ["WorldPop Fiji 2020 population counts"]
            : []),
          ...(include_assets ? ["Overpass API / OpenStreetMap"] : []),
        ],
        wrapper_chain: [
          "generateManualRiskGrid",
          "buildHeatUncertaintySurface",
          ...(include_population
            ? [
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
    drawn_boundary,
    threshold = 22,
    comparison_operator = ">=",
  } = body;

  const numericThreshold = Number(threshold);

  if (!drawn_boundary) {
    throw new Error("Missing drawn_boundary for population heat-risk analysis.");
  }

  if (!Number.isFinite(numericThreshold)) {
    throw new Error(`Invalid threshold value: ${threshold}`);
  }

  const gridCells = generateManualRiskGrid(drawn_boundary, 10);
  const warnings = [];

  if (gridCells.length === 0) {
    warnings.push("No grid cells were generated inside the drawn boundary.");
  }

  const heatRiskFeatures = await buildHeatUncertaintySurface(
    gridCells,
    numericThreshold
  );

  const populationRiskFeatures = await buildPopulationWeightedHeatRiskSurface(
    heatRiskFeatures,
    drawn_boundary,
    numericThreshold
  );

  if (populationRiskFeatures.length === 0) {
    warnings.push("No population-weighted heat-risk cells were generated.");
  }

  const summary = buildPopulationHeatRiskSummary(populationRiskFeatures);

  return {
    type: "FeatureCollection",
    features: populationRiskFeatures,
    metadata: {
      analysis_type: "population_heat_risk",
      risk_metric: "heat",
      threshold: numericThreshold,
      comparison_operator,
      summary,
      warnings,
      provenance: {
        method: "population_weighted_heat_risk",
        data_sources: [
          "Open-Meteo Forecast API",
          "WorldPop Fiji 2020 population counts",
        ],
        wrapper_chain: [
          "generateManualRiskGrid",
          "buildHeatUncertaintySurface",
          "sumWorldPopPopulationForGeometry",
          "buildPopulationWeightedHeatRiskSurface",
          "buildPopulationHeatRiskSummary",
        ],
      },
    },
  };
}

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

app.post("/api/spatial-query", async (req, res) => {
  const {
    drawn_boundary,
    target_layers = [],
    analysis_type,
  } = req.body;

  if (!drawn_boundary) {
    return res.status(400).json({ error: "drawn_boundary is required" });
  }

  const geometryType = drawn_boundary.type;
  const coordCount = flattenCoordinates(drawn_boundary.coordinates).length;

  console.log("Received spatial query:", {
    geometryType,
    coordCount,
    target_layers,
    analysis_type,
  });

  if (analysis_type === "population_heat_risk") {
    try {
      const result = await runPopulationHeatRiskMockup(req.body);
      return res.json(result);
    } catch (error) {
      console.error("Population heat risk failed:", error);

      return res.status(500).json({
        type: "FeatureCollection",
        features: [
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
        ],
        metadata: {
          analysis_type: "population_heat_risk",
          risk_metric: "heat",
          threshold: req.body.threshold ?? 22,
          comparison_operator: req.body.comparison_operator ?? ">=",
          summary: {
            total_population: 0,
            expected_exposed_population: 0,
            exposure_percent: null,
            high_priority_cell_count: 0,
            high_exposure_high_uncertainty_cell_count: 0,
            high_priority_population: 0,
            top_priority_cell: null,
          },
          warnings: [error instanceof Error ? error.message : String(error)],
          provenance: {
            method: "population_weighted_heat_risk",
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
        features: [
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
        ],
        metadata: {
          analysis_type: "manual_heat_risk",
          risk_metric: "heat",
          threshold: req.body.threshold ?? 22,
          comparison_operator: req.body.comparison_operator ?? ">=",
          summary: {
            asset_count: 0,
            exposed_asset_count: 0,
            unexposed_asset_count: 0,
            missing_value_count: 0,
            exposure_percent: null,
            grid_cell_count: 0,
            top_asset: null,
          },
          warnings: [error instanceof Error ? error.message : String(error)],
          provenance: {
            method: "manual_heat_risk_mockup",
            data_sources: [],
            wrapper_chain: [],
          },
        },
      });
    }
  }

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
});