# PICT Climate Risk Visualization Tool — Progress README

The tool is currently an interactive geospatial dashboard for exploring heat exposure, forecast spread/uncertainty, expected exposed population, infrastructure risk, precomputed climate heat indices, and tropical cyclone hazard layers across Pacific Island Countries and Territories (PICTs).

The chatbot layer will later sit on top of the same backend tools. For now, the workflow is map-first and deterministic: select a country, select an admin scale, click an admin area, run an analysis, and view map layers plus structured metadata.

---

## Current product goal

The visualization tool helps answer:

- Which administrative areas are exposed to high heat in the current forecast?
- Where is forecast spread/uncertainty high?
- How many people may be exposed?
- Which hospitals, schools, ports, substations, or critical facilities are near exposed areas?
- How does risk change under different heat thresholds, H3 resolutions, and asset buffer distances?
- How does projected extreme heat change under precomputed climate-index layers?
- Where are tropical cyclone hazard values highest across Fiji and the wider PICT region?

---

## Main implemented features

### 1. Heat-first map interface

The active controls include:

- country / territory,
- admin scale,
- selected admin area,
- heat threshold,
- H3 resolution,
- heat view mode,
- population overlay,
- infrastructure overlay,
- asset lookup,
- asset buffer distance,
- climate-index controls,
- tropical cyclone hazard controls.

### 2. PICT region registry

Current region coverage includes American Samoa, Cook Islands, Fiji, Federated States of Micronesia, Guam, Kiribati, Marshall Islands, Northern Mariana Islands, Nauru, New Caledonia, Niue, Palau, Papua New Guinea, French Polynesia, Solomon Islands, Tokelau, Tonga, Tuvalu, Vanuatu, Wallis and Futuna, and Samoa.

The registry is stored at:

```txt
data/reference/pict_region_registry.json
```

Boundary files are stored under:

```txt
data/reference/pict/<country_id>/
```

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
Province
Tikina
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

### Forecast spread / uncertainty

Forecast spread is calculated from the hourly apparent-temperature values sampled in each H3 cell and is normalized across the current analysis. It is a cell-level spread measure, not a formal long-term climate-model uncertainty estimate.

---

## Population exposure features

### Expected exposed population

The main population-weighted risk metric is:

```txt
expected exposed population = population × exposure probability
```

### Population overlay

The UI includes an optional expected exposed population overlay.

Population rasters are treated as large local/generated inputs and should normally stay out of git.

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

## Climate-index features

The app now supports a precomputed climate-index mode in addition to the live forecast workflow.

### Current implemented climate index

The main implemented climate index is:

```txt
TX90p
```

TX90p is interpreted in this project as the share/percent of days exceeding the local historical 90th percentile of daily maximum temperature.

Current projection source:

```txt
NEX-GDDP-CMIP6 daily tasmax
```

Current baseline:

```txt
1981–2010
```

Current supported scenarios:

```txt
SSP2-4.5
SSP5-8.5
```

Current supported time windows:

```txt
yearly
5_year
decade
```

### Climate-index styling

The current TX90p layer uses a bivariate risk/reliability style:

- value/risk is based on ensemble mean TX90p,
- reliability is based on inverse normalized inter-model spread,
- color encodes both risk and reliability,
- opacity is kept mostly fixed so the layer remains legible.

### Climate-index backend cache

Generated climate-index GeoJSON files are stored under:

```txt
backend/cache/climate_indices/
```

Example path:

```txt
backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble/yearly/ssp585_2030.geojson
```

These generated cache files are large and are not required to be committed. For local Docker testing, make sure the cache files exist before building the image if you want climate layers to work inside the container.

---

## Tropical cyclone hazard features

The app now supports a tropical cyclone hazard layer derived from the EMPIRIC_TC/STORM-style 0.5° South Pacific grid.

### Current implemented TC layer

Only one tropical cyclone layer is currently enabled:

```txt
TC hazard
```

The current committed ASC source is:

```txt
data/hazards/tropical_cyclone/raw/TC_200_year.asc
```

The previously supplied `TC_500_year.asc` file was byte-identical to `TC_200_year.asc`, so it is intentionally not used as a separate layer until the corrected file is available.

### TC grid handling

The TC layer is displayed at the native 0.5° grid resolution. It should not be upsampled to H3 because that would imply finer precision than the original data supports.

For selected admin areas, the backend/frontend should treat the TC grid as a coarse hazard layer and communicate that the displayed value comes from the original 0.5° cell.

### TC backend cache

Generated TC GeoJSON files are stored under:

```txt
backend/cache/tropical_cyclone/
```

Example paths:

```txt
backend/cache/tropical_cyclone/pict/tc_hazard.geojson
backend/cache/tropical_cyclone/fji/tc_hazard.geojson
```

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
- infrastructure assets toggle,
- climate-index controls,
- tropical cyclone hazard controls.

The right result panel summarizes:

- selected admin area or matched asset,
- heat exposure result,
- H3 cell count,
- mean exposure probability,
- climate-index summaries where available,
- tropical cyclone hazard summaries where available,
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
- Fiji province and tikina boundary files,
- NEX-GDDP-CMIP6 daily tasmax subsets for TX90p processing,
- EMPIRIC_TC/STORM-style tropical cyclone ASC hazard grid.

Large raw/generated data should normally remain local and out of git:

- raw NetCDF files,
- WorldPop rasters,
- large generated manifests,
- temporary downloaded climate files,
- experimental CORDEX/ESGF download outputs.

Cloud Storage may be useful later for large static assets, but it is not required for the current local Dockerization workflow.

---

## Repository structure

Important paths:

```txt
backend/
  server.js

frontend/
  src/api/
  src/components/map/

data/
  catalog/
  hazards/tropical_cyclone/raw/
  reference/pict/
  reference/pict_region_registry.json
  reference/pict_bootstrap_manifest.json
  reference/pict_geofabrik_asset_manifest.json

backend/cache/
  admin_assets/
  climate_indices/
  tropical_cyclone/

scripts/
  build_nex_tx90p_bivariate_fiji.py
  build_nex_tx90p_time_windows_fiji.py
  build_tropical_cyclone_hazard_layer.py
  download_nex_gddp_cmip6_tasmax_fiji.py
  inspect_climate_netcdf.py

Dockerfile
.dockerignore
.gitignore
```

---

## Local setup

### 1. Install Node dependencies

From the repository root:

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Install Python geospatial dependencies

Some data-building scripts require Python geospatial packages:

```bash
python -m pip install geopandas requests pyogrio fiona shapely numpy rasterio h3
```

Depending on your environment, some packages may already be installed.

### 3. Required local folders

Create the expected local data/cache folders:

```bash
mkdir -p data/reference/pict
mkdir -p data/osm
mkdir -p data/climate/raw/nex_gddp_cmip6
mkdir -p data/climate/processed
mkdir -p data/hazards/tropical_cyclone/raw
mkdir -p backend/cache/admin_assets
mkdir -p backend/cache/climate_indices
mkdir -p backend/cache/tropical_cyclone
```

---

## Data download / rebuild instructions

### 1. Build / download PICT region boundaries and population inputs

To download the PICT region boundary registry and population inputs, run:

```bash
node scripts/bootstrap_pict_region_data.mjs
```

This creates/updates files under:

```txt
data/reference/pict/
data/reference/pict_region_registry.json
data/reference/pict_bootstrap_manifest.json
```

To run it for only one country/territory:

```bash
node scripts/bootstrap_pict_region_data.mjs --countries WSM
```

To refresh Fiji boundary files only:

```bash
node scripts/bootstrap_pict_region_data.mjs \
  --countries FJI \
  --skip-population \
  --skip-assets
```

### 2. Build cached infrastructure assets

The app uses cached OSM/Geofabrik-derived infrastructure assets instead of live Overpass queries during normal use.

To build asset caches for all supported PICT countries/territories:

```bash
python scripts/build_pict_assets_from_geofabrik_gpkg.py
```

To build or refresh only selected countries:

```bash
python scripts/build_pict_assets_from_geofabrik_gpkg.py \
  --countries WSM,TON,VUT
```

To force-refresh existing downloaded Geofabrik files and backend cache files:

```bash
python scripts/build_pict_assets_from_geofabrik_gpkg.py \
  --countries WSM,TON,VUT \
  --force-download \
  --force-cache
```

Generated files are stored under:

```txt
data/osm/
backend/cache/admin_assets/
data/reference/pict_geofabrik_asset_manifest.json
```

### 3. Fiji tikina asset cache

For Fiji tikina-level asset lookup, build tikina caches from the province-level asset cache:

```bash
node scripts/build_tikina_assets_from_province_cache.mjs
```

This writes tikina asset cache files under:

```txt
backend/cache/admin_assets/
```

### 4. Download NEX-GDDP-CMIP6 tasmax data for Fiji

To download daily tasmax subsets for Fiji:

```bash
python scripts/download_nex_gddp_cmip6_tasmax_fiji.py \
  --models ACCESS-CM2 CanESM5 GFDL-ESM4 MPI-ESM1-2-HR NorESM2-MM \
  --experiments historical ssp585 \
  --future-start 2015 \
  --future-end 2100
```

To also support SSP2-4.5:

```bash
python scripts/download_nex_gddp_cmip6_tasmax_fiji.py \
  --models ACCESS-CM2 CanESM5 GFDL-ESM4 MPI-ESM1-2-HR NorESM2-MM \
  --experiments ssp245 \
  --future-start 2015 \
  --future-end 2100
```

Raw NetCDF outputs should stay out of git.

### 5. Build TX90p yearly climate-index layers

```bash
python scripts/build_nex_tx90p_bivariate_fiji.py \
  --models ACCESS-CM2 CanESM5 GFDL-ESM4 MPI-ESM1-2-HR NorESM2-MM \
  --experiments historical ssp585
```

If SSP2-4.5 data is downloaded:

```bash
python scripts/build_nex_tx90p_bivariate_fiji.py \
  --models ACCESS-CM2 CanESM5 GFDL-ESM4 MPI-ESM1-2-HR NorESM2-MM \
  --experiments historical ssp245
```

Expected generated output pattern:

```txt
backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble/yearly/<scenario>_<year>.geojson
```

### 6. Build 5-year and decade TX90p layers

```bash
python scripts/build_nex_tx90p_time_windows_fiji.py \
  --scenarios ssp245 ssp585 \
  --windows 5_year decade
```

Expected generated output pattern:

```txt
backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble/5_year/<scenario>_<year>.geojson
backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble/decade/<scenario>_<year>.geojson
```

### 7. Build tropical cyclone hazard layers

For the current single TC layer:

```bash
python scripts/build_tropical_cyclone_hazard_layer.py \
  --input data/hazards/tropical_cyclone/raw/TC_200_year.asc \
  --country-id all
```

Expected generated outputs include:

```txt
backend/cache/tropical_cyclone/pict/tc_hazard.geojson
backend/cache/tropical_cyclone/fji/tc_hazard.geojson
```

---

## Running locally without Docker

### 1. Run the backend

From the repository root:

```bash
cd backend
ADMIN_ASSET_WARMUP=false node server.js
```

The backend defaults to:

```txt
http://localhost:8000
```

To run it on the production-style port:

```bash
PORT=8080 ADMIN_ASSET_WARMUP=false node server.js
```

### 2. Run the frontend in development mode

In another terminal:

```bash
cd frontend
npm run dev
```

Then open the local Vite URL shown in the terminal.

### 3. Run production-style locally without Docker

Build the frontend:

```bash
cd frontend
npm run build
```

Then run the backend on port 8080:

```bash
cd ../backend
PORT=8080 ADMIN_ASSET_WARMUP=false node server.js
```

Open:

```txt
http://localhost:8080
```

The backend serves `frontend/dist` in production-style mode.

---

## Local Docker run

The project can be run as a single local Docker container. The container builds the React frontend and runs the Express backend, which serves both the frontend and the `/api/...` routes.

### 1. Make sure Docker Desktop is running

On macOS:

```bash
open -a Docker
```

Check Docker is available:

```bash
docker info
```

### 2. Build the image

From the repository root:

```bash
docker build -t pict-climate-risk .
```

### 3. Run the container

```bash
docker run --rm \
  -p 8080:8080 \
  -e PORT=8080 \
  -e ADMIN_ASSET_WARMUP=false \
  pict-climate-risk
```

Open:

```txt
http://localhost:8080
```

### 4. Docker API smoke tests

In another terminal:

```bash
curl -s "http://localhost:8080/api/regions" | jq '.countries | length'
```

Expected output:

```txt
21
```

Check Fiji TX90p:

```bash
curl -s "http://localhost:8080/api/climate-index?country_id=fji&variable=tasmax&metric=tx90p&scenario=ssp585&time_window=yearly&year=2030&h3_resolution=6" | jq '.features | length'
```

Expected output:

```txt
920
```

Check Fiji TC hazard:

```bash
curl -s "http://localhost:8080/api/tropical-cyclone-hazard?country_id=fji&layer_id=tc_hazard" | jq '.metadata | {country_id, feature_count}'
```

Expected output:

```json
{
  "country_id": "fji",
  "feature_count": 56
}
```

### 5. Docker image sanity checks

Confirm raw NetCDF files are not inside the image:

```bash
docker run --rm pict-climate-risk sh -c "find /app -name '*.nc' | head"
```

Expected output: no files.

Confirm climate cache files are present if you built them locally before the Docker build:

```bash
docker run --rm pict-climate-risk sh -c "ls -lh /app/backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p/ensemble/yearly | head"
```

Confirm TC cache files are present:

```bash
docker run --rm pict-climate-risk sh -c "ls -lh /app/backend/cache/tropical_cyclone/fji"
```

### 6. Notes on image size

The Docker image may be large during local development if generated GeoJSON caches are copied into the image. This is acceptable for local testing.

For deployment or production, large static/generated datasets should eventually be moved to a Cloud Storage Bucket or another external data store instead of being bundled directly into the image.

---

## Useful backend checks

### Region registry

```bash
curl -s http://localhost:8000/api/regions | jq '.countries | length'
```

### Admin boundaries

```bash
curl -s 'http://localhost:8000/api/admin-boundaries?country_id=fji&admin_level=tikina' | jq '.metadata'
```

### Climate catalog

```bash
curl -s http://localhost:8000/api/climate-catalog | jq '{variables,mvp_metrics,time_windows:.time_windows}'
```

### Climate-index layer

```bash
curl -s "http://localhost:8000/api/climate-index?country_id=fji&variable=tasmax&metric=tx90p&scenario=ssp585&time_window=yearly&year=2030&h3_resolution=6" | jq '.features | length'
```

### Tropical cyclone hazard layer

```bash
curl -s "http://localhost:8000/api/tropical-cyclone-hazard?country_id=fji&layer_id=tc_hazard" | jq '.metadata'
```

### All-PICT tropical cyclone layer

```bash
curl -s "http://localhost:8000/api/tropical-cyclone-hazard?country_id=pict&layer_id=tc_hazard" | jq '.metadata'
```

---

## Files intentionally not committed

The following are generated or large local data files and should normally stay out of git:

```txt
backend/cache/
data/osm/
data/climate/raw/
data/climate/processed/
data/climate/manifests/
data/reference/pict/*/worldpop/*.tif
data/hazards/tropical_cyclone/raw/TC_500_year.asc
*.nc
*.tif
*.tiff
*.grib
*.grib2
*.zarr/
*.gpkg
*.gpkg.zip
```

Files that may be committed because they are lightweight project inputs/configuration:

```txt
Dockerfile
.dockerignore
.gitignore
data/reference/pict/**/*.geojson
data/reference/pict_region_registry.json
data/reference/pict_bootstrap_manifest.json
data/reference/pict_geofabrik_asset_manifest.json
data/hazards/tropical_cyclone/raw/TC_200_year.asc
scripts/build_nex_tx90p_bivariate_fiji.py
scripts/build_nex_tx90p_time_windows_fiji.py
scripts/build_tropical_cyclone_hazard_layer.py
scripts/download_nex_gddp_cmip6_tasmax_fiji.py
scripts/inspect_climate_netcdf.py
```

---

## Current validation status

Latest local validation:

```txt
/api/regions returned 21 countries
/api/climate-index for Fiji SSP5-8.5 yearly 2030 returned 920 features
/api/tropical-cyclone-hazard for Fiji returned 56 features
Docker image contained no .nc files
Docker image included generated climate and TC cache files for local testing
```

---

## Known limitations / next steps

- The currently supplied `TC_500_year.asc` file matched `TC_200_year.asc`, so only one TC hazard layer is currently used.
- TC data is coarse 0.5° grid data; the UI should not imply finer resolution than that.
- The current TX90p implementation uses a practical local 90th-percentile baseline approach, not a full ETCCDI calendar-day/bootstrap TX90p implementation.
- Generated climate cache files can make local Docker images large.
- Cloud Storage Bucket support may be useful later for large static/generated data, but is not required for current local Docker testing.
- The chatbot layer has not yet been integrated.
