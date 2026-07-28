# PICT Climate Risk Visualization Tool — Progress README

The tool is currently an interactive geospatial dashboard for exploring heat exposure, forecast spread/uncertainty, expected exposed population, and infrastructure risk across Pacific Island Countries and Territories (PICTs). 

The chatbot layer will later sit on top of the same backend tools.

---

## Current product goal

The visualization tool helps answer:

- Which administrative areas are exposed to high heat in the current forecast?
- Where is forecast spread/uncertainty high?
- How many people may be exposed?
- Which hospitals, schools, ports, substations, or critical facilities are near exposed areas?
- How does risk change under different heat thresholds, H3 resolutions, and asset buffer distances?

The workflow is map-first and deterministic: select a country, select an admin scale, click an admin area, run an analysis, and view map layers plus structured metadata.

---

## Main implemented features

### 1. Heat-first map interface

The active controls are:

- country / territory,
- admin scale,
- selected admin area,
- heat threshold,
- H3 resolution,
- heat view mode,
- population overlay,
- infrastructure overlay,
- asset lookup,
- asset buffer distance.

### 2. PICT region registry

Current region coverage includes American Samoa, Cook Islands, Fiji, Federated States of Micronesia, Guam, Kiribati, Marshall Islands, Northern Mariana Islands, Nauru, New Caledonia, Niue, Palau, Papua New Guinea, French Polynesia, Solomon Islands, Tokelau, Tonga, Tuvalu, Vanuatu, Wallis and Futuna, and Samoa.


### 3. Country / territory selector

The frontend left panel has a country/territory selector. When the country changes, the app:

- loads available admin levels,
- updates the admin-scale options,
- clears the previous selected area,
- loads the new boundary layer,
- fits the map to the selected country/territory.

### 4. Dynamic admin-scale options

Admin scales come from the region registry. Countries show available levels such as:

```txt
ADM0
ADM1
ADM2
```

depending on available data.

---

## Heat-risk analysis features

### Current forecast heat analysis

The current heat workflow uses live short-term forecast data. The backend samples forecast apparent temperature over H3 cells within the selected admin area.

### Threshold-based exposure

Users can set a heat threshold in °C. Exposure probability is interpreted as the share/probability of forecast hours where apparent temperature reaches or exceeds the selected threshold.

```txt
exposure_probability = share of forecast hours above selected threshold
```

### H3 grid support

The backend generates H3 cells over the selected admin geometry. The UI supports:

```txt
H3 5 = coarse
H3 6 = balanced
H3 7 = detailed
```

The backend can downgrade overly large live forecast requests to keep analysis practical.

---

## Population exposure features

### Expected exposed population

The main population-weighted risk metric is:

```txt
expected exposed population = population × exposure probability
```

### Population overlay

The UI includes an optional expected exposed population overlay.

---

## Infrastructure / asset-risk features

### Supported asset types

The tool supports:

- hospitals,
- schools,
- ports,
- power substations,
- critical facilities.

### Smart asset lookup

The asset analyzer supports both:

- choosing an asset from the loaded dropdown,
- typing a fuzzy asset query.

### Asset buffer analysis

Users can set an asset buffer distance in kilometers. The backend analyzes heat exposure in an H3 disk/buffer around the selected asset.

### Asset result metadata

Asset heat-risk analysis returns:

- matched asset,
- match score and candidate matches,
- asset coordinates,
- buffer distance,
- H3 cell count,
- exposure metrics,
- expected exposed population,
- spread/uncertainty,
- warnings and provenance metadata.

---

## Frontend UI features

The left control panel includes:

- country/territory selector,
- admin scale selector,
- selected admin area summary,
- run area analysis button,
- heat threshold input,
- H3 resolution selector,
- heat view selector,
- asset lookup,
- asset buffer setting,
- expected exposed population toggle,
- infrastructure assets toggle.

The right result panel summarizes:

- selected admin area or matched asset,
- heat exposure result,
- H3 cell count,
- mean exposure probability,
- warnings,
- metadata/download information where available.

Settings are saved locally in the browser, including:

- default country,
- default admin level,
- heat threshold,
- H3 resolution,
- asset buffer distance,
- heat display mode,
- population overlay toggle,
- infrastructure overlay toggle.

---

## Data sources and cache strategy

Current data inputs include:

- live forecast data for current heat exposure,
- WorldPop-style population raster data,
- GeoBoundaries/local admin boundaries,
- Geofabrik/OSM-derived infrastructure assets,
- Fiji province and tikina boundary files.

---

## Climate-index work started

The visualization tool currently keeps the live forecast workflow, but a future precomputed climate-index mode has been started through the climate catalog.

Current approved thresholds:

```txt
Tmax:
30, 32, 35, 38, 40 °C

Wet-bulb temperature:
24, 26, 28, 30, 32 °C

Apparent temperature:
26, 30, 32, 35, 38, 40 °C
```

Candidate climate metrics:

```txt
days_above_threshold
share_days_above_threshold
ever_reaches_threshold
years_with_any_exceedance
max_consecutive_days_above_threshold
hot_spell_count
TXx
TX90p
WSDI
```

Candidate time windows:

```txt
5-year
decade
```

Planned projection source:

```txt
CORDEX / ESGF daily tasmax NetCDF data
ClimDEX / ETCCDI-style index definitions
```