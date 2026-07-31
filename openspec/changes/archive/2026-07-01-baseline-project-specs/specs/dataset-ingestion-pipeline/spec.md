## ADDED Requirements

### Requirement: ESGF Datasets Retrieval
The ingestion scripts SHALL query CMIP6 climate models from Earth System Grid Federation (ESGF) nodes and download NetCDF outputs locally.

#### Scenario: Download model NetCDF grid
- **WHEN** `fetch_esgf_data.py` runs with a target variable and country boundary config
- **THEN** it downloads the corresponding `.nc` data file to the local directory.

### Requirement: NetCDF to H3 Hexagonal Binning
The conversion tools SHALL process multidimensional NetCDF grids and output H3 binned polygons mapping climate projections.

#### Scenario: Convert air temperature grid to H3 GeoJSON
- **WHEN** `netcdf_to_geojson.py` is run on `pacific_islands_tas_historical.nc`
- **THEN** it extracts temperature variables, projects coordinate coordinates into H3 hexagons at resolution level 5, and outputs `pacific_islands_tas.geojson`.
