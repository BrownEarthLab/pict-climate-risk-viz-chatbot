import os
import xarray as xr
import json
import math
import h3

# Uber H3 Grid resolution (Resolution 3 corresponds to ~100km spacing, matching CMIP6 grids)
H3_RESOLUTION = 3

# Custom non-rectangular boundary coordinates for Micronesia, Melanesia, and Polynesia
# Values use the CMIP6 0-360 longitude scale (where 130W is 360 - 130 = 230)
REGION_BOUNDARY = [
    [130.0, 0.0],    # West Micronesia (Palau area)
    [130.0, 22.0],   # North-West Micronesia (Guam/Mariana)
    [160.0, 22.0],   # Micronesia/Polynesia transition
    [180.0, 28.0],   # Mid North (Hawaiian ridge approach)
    [205.0, 28.0],   # Hawaii (approx 155° W = 205°)
    [230.0, -10.0],  # East Polynesia (approx 130° W = 230°)
    [230.0, -30.0],  # South-East Polynesia (Pitcairn area)
    [170.0, -30.0],  # South Polynesia (Tonga area)
    [140.0, -25.0],  # South-West Melanesia (New Caledonia/PNG)
    [130.0, 0.0]     # Close loop
]

def point_in_polygon(x, y, poly):
    """Ray-Casting algorithm to check if point (x, y) is inside the polygon."""
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def netcdf_to_geojson():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    nc_path = os.path.join(script_dir, "pacific_islands_tas_historical.nc")
    
    # Path to frontend public directory
    geojson_out = os.path.join(script_dir, "..", "pict-climate-risk-viz-chatbot", "frontend", "public", "pacific_islands_tas.geojson")
    os.makedirs(os.path.dirname(geojson_out), exist_ok=True)
    
    print(f"Reading NetCDF: {nc_path}")
    if not os.path.exists(nc_path):
        print(f"Error: {nc_path} does not exist. Please run fetch_esgf_data.py first.")
        return
        
    with xr.open_dataset(nc_path) as ds:
        # Get variable names dynamically
        lat_name = 'lat' if 'lat' in ds.coords else 'latitude'
        lon_name = 'lon' if 'lon' in ds.coords else 'longitude'
        
        # We will extract the first month (index 0)
        time_slice = ds.isel(time=0)
        tas_data = time_slice['tas']
        
        lats = tas_data[lat_name].values
        lons = tas_data[lon_name].values
        values = tas_data.values # 2D array of shape (lat, lon)
        
        # Step 1: Perform Spatial Aggregation using H3 cell indices
        h3_cells = {}
        for i, lat in enumerate(lats):
            for j, lon in enumerate(lons):
                val = values[i, j]
                
                # Skip nan values (ocean/missing grid points)
                if math.isnan(val):
                    continue
                
                # Clip to custom boundary mask (Ray-Casting check in 0-360 system)
                if not point_in_polygon(float(lon), float(lat), REGION_BOUNDARY):
                    continue
                
                # Convert longitude to WGS84 -180 to 180 for standard H3 indexing
                mapbox_lon = float(lon)
                if mapbox_lon > 180:
                    mapbox_lon -= 360
                
                # Resolve unique H3 cell index for this point
                cell = h3.latlng_to_cell(float(lat), mapbox_lon, H3_RESOLUTION)
                
                if cell not in h3_cells:
                    h3_cells[cell] = []
                h3_cells[cell].append(val)
                
        # Step 2: Convert H3 cells to GeoJSON Polygon features
        features = []
        for cell, val_list in h3_cells.items():
            # Average temperature inside the hexagon, cast to standard Python float
            avg_k = float(sum(val_list) / len(val_list))
            temp_c = float(avg_k - 273.15)
            
            # Retrieve H3 cell center and boundary coordinates
            cell_lat, cell_lng = h3.cell_to_latlng(cell)
            mapbox_lon = cell_lng
            
            boundary = h3.cell_to_boundary(cell)
            
            polygon_coords = []
            for pt_lat, pt_lon in boundary:
                norm_lon = pt_lon
                if norm_lon > 180:
                    norm_lon -= 360
                    
                # Date Line wrap correction: keep vertices contiguous with cell center
                if norm_lon - mapbox_lon > 180:
                    norm_lon -= 360
                elif norm_lon - mapbox_lon < -180:
                    norm_lon += 360
                    
                polygon_coords.append([norm_lon, pt_lat])
                
            # Close polygon loop
            if polygon_coords:
                polygon_coords.append(polygon_coords[0])
                
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [polygon_coords]
                },
                "properties": {
                    "h3_index": cell,
                    "temp_c": round(temp_c, 2),
                    "temp_k": round(avg_k, 2),
                    "point_count": len(val_list)
                }
            }
            features.append(feature)
            
        geojson = {
            "type": "FeatureCollection",
            "features": features
        }
        
        with open(geojson_out, 'w') as f:
            json.dump(geojson, f, indent=2)
            
        print(f"Successfully converted NetCDF to GeoJSON H3 Hexagons (Boundary Clipped)!")
        print(f"Output saved to: {geojson_out}")
        print(f"Total H3 cells exported: {len(features)}")

if __name__ == "__main__":
    netcdf_to_geojson()
