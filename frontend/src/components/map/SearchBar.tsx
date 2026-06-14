import { useState } from "react";
import { getApiUrl } from "../../config/api";

interface SearchBarProps {
  map: mapboxgl.Map | null;
}

const SearchBar = ({ map }: SearchBarProps) => {
  const [query, setQuery] = useState("");

  const handleSearch = async () => {
    if (!query || !map) return;

    try {
      const res = await fetch(getApiUrl(`/api/geocode?query=${encodeURIComponent(query)}`));
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();

      if (data && data.lat && data.lon) {
        const { lat, lon, bounds } = data;
        const defaultCountryZoom = 3.5;
        const defaultCityZoom = 10;
        const globalSpanThreshold = 100;

        if (bounds && bounds.length === 4) {
          const minLon = parseFloat(bounds[0]);
          const maxLon = parseFloat(bounds[2]);
          const span = Math.abs(maxLon - minLon);

          if (span < globalSpanThreshold) {
            map.fitBounds(bounds, { padding: 50, duration: 1000, maxZoom: 15, minZoom: 5 });
            return;
          }
        }

        const zoom = bounds?.length === 4 ? defaultCountryZoom : defaultCityZoom;
        map.flyTo({ center: [lon, lat], zoom, duration: 1000 });
      } else {
        alert("Location not found.");
      }
    } catch (error) {
      console.error("Search failed:", error);
      alert(`Search failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  return (
    <div className="absolute top-3 right-3 z-[999] flex gap-1.5">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        placeholder="Search for a location..."
        className="w-[200px] rounded-md border border-blue-600 px-3 py-1.5 text-sm outline-none"
      />
      <button
        onClick={handleSearch}
        className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
      >
        Search
      </button>
    </div>
  );
};

export default SearchBar;
