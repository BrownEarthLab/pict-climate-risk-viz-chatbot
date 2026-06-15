interface ThematicLayer {
  id: string;
  display_name: string;
  units: string;
  description: string;
}

interface ThematicConfig {
  layerName: string;
  attributes: ThematicLayer[];
}

const thematicMapConfigs: Record<string, ThematicConfig> = {
  // Pacific climate data layers — placeholder until backend is connected
  sea_level_rise: {
    layerName: "sea_level_rise",
    attributes: [
      { id: "projected_slr", display_name: "Projected Sea Level Rise", units: "meters", description: "Projected sea level rise under various emissions scenarios for Pacific Island regions." },
      { id: "coastal_inundation", display_name: "Coastal Inundation Risk", units: "index", description: "Coastal inundation risk index for low-lying Pacific Islands." },
    ],
  },
  precipitation: {
    layerName: "precipitation",
    attributes: [
      { id: "rainfall_anomaly", display_name: "Rainfall Anomaly", units: "mm", description: "Projected changes in precipitation patterns across the Pacific." },
      { id: "drought_index", display_name: "Drought Index", units: "index", description: "Drought severity and frequency projections for Pacific Island Countries and Territories." },
    ],
  },
};

export default thematicMapConfigs;
