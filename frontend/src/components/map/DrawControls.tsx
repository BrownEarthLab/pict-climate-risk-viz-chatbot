import { useRef, useEffect, useState, useCallback } from "react";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

interface DrawControlsProps {
  map: mapboxgl.Map | null;
  onDrawGeometry: (geometry: GeoJSON.Geometry | null) => void;
}

const DrawControls = ({ map, onDrawGeometry }: DrawControlsProps) => {
  const draw = useRef<MapboxDraw | null>(null);
  const [drawMode, setDrawMode] = useState(false);

  const handleDrawChange = useCallback(() => {
    if (!draw.current) return;
    const features = draw.current.getAll().features;
    if (features.length > 0 && onDrawGeometry) {
      onDrawGeometry(features[features.length - 1]?.geometry ?? null);
    }
  }, [onDrawGeometry]);

  const handleDrawDelete = useCallback(() => {
    if (onDrawGeometry) onDrawGeometry(null);
  }, [onDrawGeometry]);

  useEffect(() => {
    if (!map) return;
    if (drawMode && !draw.current) {
      draw.current = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, point: true, line_string: true, trash: true },
      });
      (window as any).__mapboxDraw = draw.current;
      (window as any).__mapboxMap = map;
      map.addControl(draw.current, "top-left");
      map.on("draw.create", handleDrawChange);
      map.on("draw.update", handleDrawChange);
      map.on("draw.delete", handleDrawDelete);
    }
    return () => {
      delete (window as any).__mapboxDraw;
      delete (window as any).__mapboxMap;
      if (map && draw.current) {
        map.removeControl(draw.current);
        map.off("draw.create", handleDrawChange);
        map.off("draw.update", handleDrawChange);
        map.off("draw.delete", handleDrawDelete);
        draw.current = null;
        if (onDrawGeometry && drawMode) onDrawGeometry(null);
      }
    };
  }, [drawMode, map, handleDrawChange, handleDrawDelete, onDrawGeometry]);

  return (
    <>
      <button
        className={`absolute top-14 right-3 z-10 rounded-lg border px-3.5 py-2 text-sm font-medium cursor-pointer outline-none transition ${
          drawMode
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-gray-100 text-blue-600 border-blue-600 hover:bg-blue-50"
        }`}
        onClick={() => {
          setDrawMode((prev) => !prev);
          if (draw.current && drawMode) {
            draw.current.deleteAll();
            if (onDrawGeometry) onDrawGeometry(null);
          }
        }}
        title="Draw for Spatial Queries"
      >
        {drawMode ? "Exit Draw" : "Draw for Spatial Query"}
      </button>

      {drawMode && (
        <div className="absolute top-24 right-3 z-10 max-w-[200px] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 text-sm leading-5 text-blue-600 shadow-sm">
          Draw a polygon, line, or point.<br />
          Use the trash icon to delete.
        </div>
      )}
    </>
  );
};

export default DrawControls;
