interface MapControlsProps {
  map: mapboxgl.Map | null;
}

const MapControls = ({ map }: MapControlsProps) => {
  return (
    <div className="absolute bottom-6 left-4 z-10 flex flex-col gap-1">
      <button
        onClick={() => map?.zoomIn({ duration: 300 })}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm border border-black/10 text-lg font-medium hover:bg-gray-50 cursor-pointer"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        onClick={() => map?.zoomOut({ duration: 300 })}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm border border-black/10 text-lg font-medium hover:bg-gray-50 cursor-pointer"
        aria-label="Zoom out"
      >
        −
      </button>
    </div>
  );
};

export default MapControls;
