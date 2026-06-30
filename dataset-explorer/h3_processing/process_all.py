import sys
import os

# Add current directory to path so python can find the scripts
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fetch_esgf_data import main as fetch_main
from netcdf_to_geojson import netcdf_to_geojson as convert_tas
from wet_bulb_to_geojson import netcdf_to_geojson as convert_wb

def main():
    print("=== Processing All H3 Datasets ===")
    
    # 1. Fetch CMIP6 air temperature dataset
    print("\n[Step 1/3] Fetching CMIP6 TAS dataset from ESGF...")
    try:
        fetch_main()
    except Exception as e:
        print(f"Error fetching ESGF data: {e}")
        print("Continuing to conversion steps using existing cached datasets...")

    # 2. Convert TAS NetCDF to GeoJSON
    print("\n[Step 2/3] Converting Air Temperature (TAS) NetCDF to H3 GeoJSON...")
    try:
        convert_tas()
    except Exception as e:
        print(f"Error converting TAS NetCDF: {e}")

    # 3. Convert WBT NetCDF to GeoJSON
    print("\n[Step 3/3] Converting Wet-Bulb Temperature (WBT) NetCDF to H3 GeoJSON...")
    try:
        convert_wb()
    except Exception as e:
        print(f"Error converting WBT NetCDF: {e}")

    print("\n=== Processing Complete ===")

if __name__ == "__main__":
    main()
