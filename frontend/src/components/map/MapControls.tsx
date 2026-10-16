interface MapControlsProps {
  map: mapboxgl.Map | null;
}

const MapControls = ({ map }: MapControlsProps) => {
  return (
    <div className="absolute bottom-12 right-4 z-[1300] flex flex-col gap-1 font-sans">
      <button
        type="button"
        onClick={() => map?.zoomIn({ duration: 300 })}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-black/10 bg-white text-lg font-medium shadow-sm hover:bg-gray-50"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => map?.zoomOut({ duration: 300 })}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-black/10 bg-white text-lg font-medium shadow-sm hover:bg-gray-50"
        aria-label="Zoom out"
      >
        −
      </button>
    </div>
  );
};

export default MapControls;
