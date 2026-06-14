import { useEffect, useState } from "react";

interface SpatialQueryPanelProps {
  highlightedFeatures: GeoJSON.Feature[] | null;
  layerDisplayNames?: Record<string, string>;
}

interface GroupedFeatures {
  [layerName: string]: GeoJSON.Feature[];
}

const SpatialQueryPanel = ({ highlightedFeatures, layerDisplayNames = {} }: SpatialQueryPanelProps) => {
  const [groupedFeatures, setGroupedFeatures] = useState<GroupedFeatures>({});

  useEffect(() => {
    if (highlightedFeatures && highlightedFeatures.length > 0) {
      const grouped = highlightedFeatures.reduce<GroupedFeatures>((acc, feature) => {
        const layerName = feature.properties?.layer_name || "unknown_layer";
        if (!acc[layerName]) acc[layerName] = [];
        acc[layerName].push(feature);
        return acc;
      }, {});
      setGroupedFeatures(grouped);
    } else {
      setGroupedFeatures({});
    }
  }, [highlightedFeatures]);

  const handleDownload = (layerName: string) => {
    const features = groupedFeatures[layerName];
    if (!features || features.length === 0) return;

    const displayName = layerDisplayNames[layerName] || layerName;
    const fileName = displayName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const blob = new Blob([JSON.stringify({ type: "FeatureCollection", features }, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}_query_results.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!highlightedFeatures || highlightedFeatures.length === 0) return null;

  return (
    <div className="absolute bottom-14 right-3 z-[1000] max-w-[260px] max-h-[300px] overflow-y-auto rounded-lg bg-white/70 p-4 shadow backdrop-blur-sm">
      <h6 className="mb-2 text-sm font-semibold">Query Results</h6>
      {Object.keys(groupedFeatures).length > 0 ? (
        <ul className="space-y-2">
          {Object.entries(groupedFeatures).map(([layerName, features]) => {
            const displayName = layerDisplayNames[layerName] || layerName;
            return (
              <li key={layerName} className="text-sm">
                <strong>{displayName}</strong> ({features.length} features)
                <button
                  onClick={() => handleDownload(layerName)}
                  className="ml-2 rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700"
                >
                  Download GeoJSON
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No features found.</p>
      )}
    </div>
  );
};

export default SpatialQueryPanel;
