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
        addLayerIfMissing(highlightLayerPolygonId, "fill", highlightSourceId, ["==", "$type", "Polygon"], {
          "fill-color": "#00FFFF",
          "fill-opacity": 0.5,
        });
        addLayerIfMissing(highlightLayerPolygonOutlineId, "line", highlightSourceId, ["==", "$type", "Polygon"], {
          "line-color": "#FFFFFF",
          "line-width": 2,
        });
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
