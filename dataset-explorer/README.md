# Pacific Island Climate Datasets

This directory contains the climate model datasets and processing scripts used to generate the hexagonal H3 overlays for the Climate Risk visualization map.

---

## 1. Near-Surface Air Temperature (TAS)

* **Source File:** `pacific_islands_tas_historical.nc`
* **Generated Overlay:** `pacific_islands_tas.geojson` (Rendered under the **Air Temp** layer)

### What the Dataset Shows
This dataset represents the standard near-surface air temperature (measured at 2 meters above the ground). It is sliced from global **CMIP6** (Phase 6 of the Coupled Model Intercomparison Project) historical climate simulations for the year **1970**. 

* **Physical Coverage:** Captures the entire tropical and subtropical Pacific region, stretching from **35°S to 30°N** (covering the subregions of Micronesia, Melanesia, and Polynesia, including Hawaii and Guam).
* **Time Slice:** Displays the monthly temperature grid for January 1970.

### Map Visualization & Legend
The data is visualized as H3 Resolution 3 hexagons. Colors are interpolated based on temperature values:
* **20°C or below:** Cool Blue (`#3b82f6`)
* **25°C:** Warm Yellow (`#eab308`)
* **30°C or above:** Hot Red (`#ef4444`)

---

## 2. Wet-Bulb Temperature (WBT)

* **Source File:** `wet_bulb_temperature.nc`
* **Generated Overlay:** `pacific_islands_wet_bulb.geojson` (Rendered under the **Wet-Bulb** layer)

### What the Dataset Shows
Wet-bulb temperature is a combined metric of **heat and relative humidity**. It represents the lowest temperature a wet surface can reach through evaporative cooling (analogous to how the human body cools itself by sweating). 

Because high humidity prevents sweat from evaporating, wet-bulb temperature is a critical indicator of human heat stress. At a wet-bulb temperature of **35°C**, the human body can no longer shed heat, which is lethal even to healthy individuals in shade. Severe health risks and labor safety thresholds begin much lower (around **24°C to 27°C**).

* **Physical Coverage:** Sourced from a regional climate model utilizing a rotated pole grid. It spans from **52°S to 10.25°N**. Because of this specific regional domain, it does not contain data for northern islands like Guam or Hawaii.
* **Time Slice:** Aggregated as the **annual mean** over 365 daily timesteps for the year **1951** to show the long-term regional heat-stress pattern.

### Map Visualization & Legend
Visualized as H3 Resolution 3 hexagons. The color ramp is designed to reflect health-safety stress thresholds:
* **15°C:** Emerald Green (`#10b981`) — Comfortable/Low risk
* **20°C:** Amber (`#f59e0b`) — Moderate heat/humidity stress during physical activity
* **24°C:** Red (`#ef4444`) — High risk (standard occupational safety threshold)
* **27°C or above:** Magenta (`#d946ef`) — Extreme hazard/physical limits

---

## Processing Workflow

Both NetCDF datasets are processed into GeoJSON vector tiles via the offline Python pipeline:
1. **Time Aggregation:** Selects a specific time step (TAS) or calculates the annual mean (WBT).
2. **Boundary Masking:** Filters out grid points falling outside a custom 10-vertex boundary of the Polynesia, Melanesia, and Micronesia subregions.
3. **Hexagonal Binning:** Assigns each coordinate point to its unique **Uber H3 Resolution 3** hexagonal cell.
4. **Date Line Wrap Correction:** Shifts hexagon vertices crossing the 180° meridian relative to their cell centers, preventing Mapbox from stretching polygons across the globe.
