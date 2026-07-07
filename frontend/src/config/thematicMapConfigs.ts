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
  // Dynamic starter bundle layers (SDMX-sourced)
  sea_level_dynamic: {
    layerName: "sea_level_dynamic",
    attributes: [
      { id: "sea_level_anomaly", display_name: "Sea Level Anomaly (H3)", units: "meters", description: "Dynamic sea level anomalies from Pacific Data Hub, binned to H3 hexagons (Res 4/5)." },
    ],
  },
  power_gen_dynamic: {
    layerName: "power_gen_dynamic",
    attributes: [
      { id: "power_generation", display_name: "Power Generation (GWh)", units: "GWh", description: "Dynamic annual electricity generation in GWh per Pacific Island country (choropleth), summed across all energy sources from Pacific Data Hub (DF_POWER_GEN)." },
    ],
  },
  water_access_dynamic: {
    layerName: "water_access_dynamic",
    attributes: [
      { id: "safe_water_access", display_name: "Safe Water Access", units: "percentage", description: "Dynamic safely managed drinking water access by atoll/region from Pacific Data Hub." },
    ],
  },
};

export default thematicMapConfigs;
