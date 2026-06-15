import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { MAPBOX_DEFAULTS } from "../config/mapbox";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? "";

export function useMapbox() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapboxMap, setMapboxMap] = useState<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapContainerRef.current && !mapboxMap) {
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAPBOX_DEFAULTS.style,
        center: MAPBOX_DEFAULTS.center,
        zoom: MAPBOX_DEFAULTS.zoom,
        projection: MAPBOX_DEFAULTS.projection,
      });

      map.on("load", () => {
        map.setFog(MAPBOX_DEFAULTS.fog);
        setMapboxMap(map);
      });

      return () => {
        map.remove();
        setMapboxMap(null);
      };
    }
  }, []);

  return { mapContainerRef, mapboxMap };
}
