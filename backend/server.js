import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Resolve paths to the frontend public folder where GeoJSONs are stored
const tasPath = path.resolve(__dirname, "../frontend/public/pacific_islands_tas.geojson");
const wbPath = path.resolve(__dirname, "../frontend/public/pacific_islands_wet_bulb.geojson");

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
    return geometry.coordinates.some(polyCoords => pointInPolygon(point, polyCoords));
  }
  return false;
}

// Calculate centroid of an H3 cell polygon coordinates
function getCentroid(geometry) {
  // If coordinates are deeply nested (MultiPolygon vs Polygon)
  const coords = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates[0];
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

app.post("/api/spatial-query", (req, res) => {
  const { drawn_boundary, target_layers, analysis_type } = req.body;

  if (!drawn_boundary) {
    return res.status(400).json({ error: "Missing drawn_boundary in request body" });
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
    tasFeatures.forEach(feature => {
      const centroid = getCentroid(feature.geometry);
      if (isPointInsideGeometry(centroid, drawn_boundary)) {
        matched.push({
          type: "Feature",
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            layer_name: "Near-Surface Air Temp (TAS)",
          }
        });
      }
    });

    if (matched.length > 0) {
      const temps = matched.map(f => f.properties.temp_c);
      const min = Math.min(...temps);
      const max = Math.max(...temps);
      const sum = temps.reduce((a, b) => a + b, 0);
      const mean = sum / temps.length;
      const range = max - min;

      const summary = `Air Temp Zonal Stats:\n• Mean Temp: ${mean.toFixed(2)}°C\n• Max Temp: ${max.toFixed(2)}°C\n• Min Temp: ${min.toFixed(2)}°C\n• Range: ${range.toFixed(2)}°C\n• Grid cells: ${matched.length}`;
      
      // Inject description into the first analytical feature
      matched[0].properties.description = summary;
      outputFeatures.push(...matched);
    }

  } else if (analysis_type === "heat_stress") {
    // Candidate A: Zonal Wet-Bulb Temperature Stats
    const matched = [];
    wbFeatures.forEach(feature => {
      const centroid = getCentroid(feature.geometry);
      if (isPointInsideGeometry(centroid, drawn_boundary)) {
        matched.push({
          type: "Feature",
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            layer_name: "Annual Mean Wet-Bulb (WBT)",
          }
        });
      }
    });

    if (matched.length > 0) {
      const wbs = matched.map(f => f.properties.wet_bulb_c);
      const min = Math.min(...wbs);
      const max = Math.max(...wbs);
      const sum = wbs.reduce((a, b) => a + b, 0);
      const mean = sum / wbs.length;
      const range = max - min;

      const summary = `Wet-Bulb Temp Stats:\n• Mean WBT: ${mean.toFixed(2)}°C\n• Max WBT: ${max.toFixed(2)}°C\n• Min WBT: ${min.toFixed(2)}°C\n• Range: ${range.toFixed(2)}°C\n• Grid cells: ${matched.length}`;
      
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
        description: "Warning:\n• No H3 grid cells were found within the drawn boundary.",
      },
    });
  }

  res.json({
    type: "FeatureCollection",
    features: outputFeatures,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Spatial-query backend running on http://0.0.0.0:${PORT}`);
});
