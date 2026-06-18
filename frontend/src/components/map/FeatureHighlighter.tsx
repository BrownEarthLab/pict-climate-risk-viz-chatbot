import { useEffect } from "react";

interface FeatureHighlighterProps {
  mapboxMap: mapboxgl.Map | null;
  highlightedFeatures: GeoJSON.Feature[] | null;
}

const highlightSourceId = "highlight-source";
const highlightLayerPointId = "highlight-layer-points";
const highlightLayerLineId = "highlight-layer-lines";
const highlightLayerPolygonId = "highlight-layer-polygons";
const highlightLayerPolygonOutlineId = `${highlightLayerPolygonId}-outline`;

const FeatureHighlighter = ({ mapboxMap, highlightedFeatures }: FeatureHighlighterProps) => {
  useEffect(() => {
    if (!mapboxMap) return;

    const addLayerIfMissing = (id: string, type: string, source: string, filter: unknown[], paint: Record<string, unknown>) => {
      if (!mapboxMap.getLayer(id)) {
        mapboxMap.addLayer({ id, type, source, filter, paint } as any);
      }
    };

    const removeLayer = (...ids: string[]) => {
      ids.forEach((id) => {
        if (mapboxMap.getLayer(id)) mapboxMap.removeLayer(id);
      });
    };

    if (highlightedFeatures && highlightedFeatures.length > 0) {
      if (mapboxMap.getSource(highlightSourceId)) {
        (mapboxMap.getSource(highlightSourceId) as mapboxgl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: highlightedFeatures,
        });
      } else {
        mapboxMap.addSource(highlightSourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: highlightedFeatures },
        });
      }

      const hasPoints = highlightedFeatures.some(
        (f) => f.geometry && (f.geometry.type === "Point" || f.geometry.type === "MultiPoint")
      );
      const hasLines = highlightedFeatures.some(
        (f) => f.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")
      );
      const hasPolygons = highlightedFeatures.some(
        (f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
      );

      if (hasPoints) {
        addLayerIfMissing(highlightLayerPointId, "circle", highlightSourceId, ["==", "$type", "Point"], {
          "circle-radius": 5,
          "circle-color": "#00FFFF",
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 2,
          "circle-opacity": 1,
        });
      } else {
        removeLayer(highlightLayerPointId);
      }

      if (hasLines) {
        addLayerIfMissing(highlightLayerLineId, "line", highlightSourceId, ["==", "$type", "LineString"], {
          "line-color": "#00FFFF",
          "line-width": 4,
        });
      } else {
        removeLayer(highlightLayerLineId);
      }

      if (hasPolygons) {
        // Find if features belong to TAS or WBT
        const firstAnalyticalFeature = highlightedFeatures.find(f => f.properties?.layer_name);
        const layerName = firstAnalyticalFeature?.properties?.layer_name;

        let fillColor: any = "#00FFFF";
        if (layerName === "Near-Surface Air Temp (TAS)") {
          fillColor = [
            "interpolate",
            ["linear"],
            ["get", "temp_c"],
            20, "#3b82f6",
            25, "#eab308",
            30, "#ef4444"
          ];
        } else if (layerName === "Annual Mean Wet-Bulb (WBT)") {
          fillColor = [
            "interpolate",
            ["linear"],
            ["get", "wet_bulb_c"],
            15, "#10b981",
            20, "#f59e0b",
            24, "#ef4444",
            27, "#d946ef"
          ];
        }

        const paintConfig = {
          "fill-color": fillColor,
          "fill-opacity": 0.6,
        };

        addLayerIfMissing(highlightLayerPolygonId, "fill", highlightSourceId, ["==", "$type", "Polygon"], paintConfig);
        
        // Always force update the paint property if the layer already exists
        if (mapboxMap.getLayer(highlightLayerPolygonId)) {
          mapboxMap.setPaintProperty(highlightLayerPolygonId, "fill-color", fillColor);
        }

        addLayerIfMissing(highlightLayerPolygonOutlineId, "line", highlightSourceId, ["==", "$type", "Polygon"], {
          "line-color": "rgba(255, 255, 255, 0.35)",
          "line-width": 0.75,
        });
        
        // Always force update the paint properties if the layer already exists
        if (mapboxMap.getLayer(highlightLayerPolygonOutlineId)) {
          mapboxMap.setPaintProperty(highlightLayerPolygonOutlineId, "line-color", "rgba(255, 255, 255, 0.35)");
          mapboxMap.setPaintProperty(highlightLayerPolygonOutlineId, "line-width", 0.75);
        }
      } else {
        removeLayer(highlightLayerPolygonId, highlightLayerPolygonOutlineId);
      }
    } else {
      removeLayer(highlightLayerPointId, highlightLayerLineId, highlightLayerPolygonId, highlightLayerPolygonOutlineId);
      if (mapboxMap.getSource(highlightSourceId)) mapboxMap.removeSource(highlightSourceId);
    }

    return () => {
      if (mapboxMap) {
        removeLayer(highlightLayerPointId, highlightLayerLineId, highlightLayerPolygonId, highlightLayerPolygonOutlineId);
        if (mapboxMap.getSource(highlightSourceId)) mapboxMap.removeSource(highlightSourceId);
      }
    };
  }, [mapboxMap, highlightedFeatures]);

  return null;
};

export default FeatureHighlighter;
