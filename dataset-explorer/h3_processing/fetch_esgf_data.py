import os
import ssl
import json
import urllib.request
import urllib.parse
import xarray as xr

# Bounding box presets for slicing (using 0-360 coordinate scale for longitudes)
PRESETS = {
    "targeted_islands": {
        "description": "Minimal subset (Fiji, Kiribati (Gilbert), Tuvalu, Marshall Islands, Tonga, Samoa)",
        "lat": slice(-25, 10),
        "lon": slice(170, 190)
    },
    "broad_pacific": {
        "description": "Broad Central Pacific (Polynesia, Melanesia, Micronesia)",
        "lat": slice(-35, 30),
        "lon": slice(130, 230)
    }
}

# Configure default preset (change to "broad_pacific" if needed)
DEFAULT_PRESET = "broad_pacific"

# ESGF REST Search API base URL
ESGF_SEARCH_URL = "https://esgf-node.llnl.gov/esg-search/search"

def search_esgf_files():
    """Queries the ESGF Solr Search API for CMIP6 monthly historical temperature data."""
    params = {
        "project": "CMIP6",
        "experiment_id": "historical",
        "variable_id": "tas",
        "frequency": "mon",
        "variant_label": "r120i1p1f1",  # Specific run to avoid duplicate grids
        "type": "File",
        "latest": "true",
        "format": "application/solr+json",
        "limit": 5
    }
    
    query_string = urllib.parse.urlencode(params)
    search_url = f"{ESGF_SEARCH_URL}?{query_string}"
    
    print(f"Querying ESGF Search API: {search_url}")
    
    # Bypass SSL verification to handle Python/macOS trust store compatibility issues
    ssl_context = ssl._create_unverified_context()
    
    req = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ssl_context) as response:
        payload = json.loads(response.read().decode('utf-8'))
        
    docs = payload.get("response", {}).get("docs", [])
    if not docs:
        raise ValueError("No matching files found on ESGF.")
        
    return docs

def extract_endpoints(doc):
    """Parses the pipe-delimited url list in the Solr doc to find access endpoints."""
    opendap_url = None
    http_url = None
    
    urls = doc.get("url", [])
    for u in urls:
        parts = u.split("|")
        if len(parts) >= 3:
            url_endpoint = parts[0]
            service_type = parts[2].upper()
            
            if service_type == "OPENDAP":
                # Clean OPeNDAP URLs ending with web panel suffix
                if url_endpoint.endswith(".html"):
                    opendap_url = url_endpoint[:-5]
                elif url_endpoint.endswith(".dods"):
                    opendap_url = url_endpoint[:-5]
                else:
                    opendap_url = url_endpoint
            elif service_type == "HTTPSERVER":
                http_url = url_endpoint
                
    return opendap_url, http_url

def download_and_slice_http(http_url, file_name, lat_slice, lon_slice, output_path):
    """Downloads the full global NetCDF file, caches it locally, and slices it."""
    cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cache")
    os.makedirs(cache_dir, exist_ok=True)
    cached_file_path = os.path.join(cache_dir, file_name)
    
    if not os.path.exists(cached_file_path):
        print(f"Downloading full file via HTTP to cache: {cached_file_path} (this may take a while)...")
        ssl_context = ssl._create_unverified_context()
        req = urllib.request.Request(http_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ssl_context) as dl_response:
            with open(cached_file_path, 'wb') as f:
                while True:
                    chunk = dl_response.read(1024 * 1024)  # 1MB chunks
                    if not chunk:
                        break
                    f.write(chunk)
        print("Download complete.")
    else:
        print(f"Using cached global NetCDF file: {cached_file_path}")
        
    # Slice the cached file locally
    print("Slicing local cached NetCDF file...")
    with xr.open_dataset(cached_file_path) as ds:
        lat_name = 'lat' if 'lat' in ds.coords else 'latitude'
        lon_name = 'lon' if 'lon' in ds.coords else 'longitude'
        subset = ds.sel({lat_name: lat_slice, lon_name: lon_slice})
        subset.to_netcdf(output_path)
    print(f"Successfully saved locally sliced file to {output_path}")

def slice_remote_opendap(opendap_url, lat_slice, lon_slice, output_path):
    """Opens OPeNDAP dataset remotely, slices it, and downloads only the subset."""
    print(f"Accessing remote OPeNDAP endpoint: {opendap_url}")
    print("Opening remote dataset (lazy loading coordinate index)...")
    
    # Disable SSL checks for underlying curl/netcdf libraries
    os.environ['CURL_CA_BUNDLE'] = ''
    
    with xr.open_dataset(opendap_url) as ds:
        print("Successfully connected. Determining coordinate schemas...")
        lat_name = 'lat' if 'lat' in ds.coords else 'latitude'
        lon_name = 'lon' if 'lon' in ds.coords else 'longitude'
        
        print(f"Slicing spatial dimensions ({lat_name}, {lon_name})...")
        subset = ds.sel({lat_name: lat_slice, lon_name: lon_slice})
        
        print(f"Streaming and downloading sliced subset to: {output_path}...")
        subset.to_netcdf(output_path)
    print(f"Successfully saved subset file to {output_path}")

def main():
    preset_name = DEFAULT_PRESET
    preset = PRESETS[preset_name]
    print(f"=== ESGF Downloader ===")
    print(f"Preset: {preset_name} ({preset['description']})")
    print(f"Latitude bounds: {preset['lat'].start} to {preset['lat'].stop}")
    print(f"Longitude bounds: {preset['lon'].start} to {preset['lon'].stop}")
    print("=======================\n")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_filename = "pacific_islands_tas_historical.nc"
    output_path = os.path.join(script_dir, "..", output_filename)
    
    try:
        docs = search_esgf_files()
        doc = docs[0]
        title = doc.get("title")
        print(f"Found search result: {title}")
        
        opendap_url, http_url = extract_endpoints(doc)
        
        if opendap_url:
            try:
                slice_remote_opendap(opendap_url, preset['lat'], preset['lon'], output_path)
                print(f"OPeNDAP slice complete. File size: {os.path.getsize(output_path) / 1024:.2f} KB")
                return
            except Exception as e:
                print(f"OPeNDAP access failed: {e}. Falling back to full HTTP download...")
                
        if http_url:
            download_and_slice_http(http_url, title, preset['lat'], preset['lon'], output_path)
            print(f"HTTP download & slice complete. File size: {os.path.getsize(output_path) / 1024:.2f} KB")
        else:
            raise ValueError("No usable HTTP or OPeNDAP download links found for this dataset.")
            
    except Exception as e:
        print(f"\nExecution failed: {e}")

if __name__ == "__main__":
    main()