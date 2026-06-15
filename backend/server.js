import express from "express";
import cors from "cors";

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.post("/api/spatial-query", (req, res) => {
  const { drawn_boundary, target_layers } = req.body;

  if (!drawn_boundary) {
    return res.status(400).json({ error: "Missing drawn_boundary in request body" });
  }

  const geometryType = drawn_boundary.type;
  const coords = drawn_boundary.coordinates;
  const coordCount = coords?.[0]?.length ?? 0;

  console.log("--- Spatial Query Received ---");
  console.log("Geometry type:", geometryType);
  console.log("Target layers:", target_layers);
  console.log("Coordinates:", JSON.stringify(coords, null, 2));
  console.log("Coordinate count:", coordCount);
  console.log("--------------------------------");

  const description = `Successfully received geometry of type ${geometryType} with ${coordCount} coordinates.`;

  const featureCollection = {
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
  };

  res.json(featureCollection);
});

app.listen(PORT, () => {
  console.log(`Mock spatial-query backend running on http://localhost:${PORT}`);
});
