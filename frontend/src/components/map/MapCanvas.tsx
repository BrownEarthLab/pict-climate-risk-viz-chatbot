import { useMapbox } from "../../hooks/useMapbox";
import SearchBar from "./SearchBar";
import DrawControls from "./DrawControls";
import FeatureHighlighter from "./FeatureHighlighter";
import SpatialQueryPanel from "./SpatialQueryPanel";
import MapControls from "./MapControls";

interface MapCanvasProps {
  onDrawGeometry: (geometry: GeoJSON.Geometry | null) => void;
  highlightedFeatures: GeoJSON.Feature[] | null;
  isDrawMode: boolean;
  setIsDrawMode: (mode: boolean) => void;
}

const MapCanvas = ({ onDrawGeometry, highlightedFeatures, isDrawMode, setIsDrawMode }: MapCanvasProps) => {
  const { mapContainerRef, mapboxMap } = useMapbox();

  return (
    <div className="absolute inset-0">
      <div ref={mapContainerRef} className="h-full w-full" />

      {!mapboxMap && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center bg-white/70 text-lg text-gray-800">
          Loading map...
        </div>
      )}

      {mapboxMap && (
        <>
          <SearchBar map={mapboxMap} />
          <DrawControls map={mapboxMap} onDrawGeometry={onDrawGeometry} />
          <FeatureHighlighter mapboxMap={mapboxMap} highlightedFeatures={highlightedFeatures} />
          <SpatialQueryPanel highlightedFeatures={highlightedFeatures} />
          <MapControls map={mapboxMap} />
        </>
      )}
    </div>
  );
};

export default MapCanvas;
