#!/usr/bin/env python3
from pathlib import Path

FOLDERS = [
    "data/climate/raw/cordex",
    "data/climate/raw/wet_bulb",
    "data/climate/manifests",
    "data/climate/processed",
    "backend/cache/climate_indices",
]

for folder in FOLDERS:
    path = Path(folder)
    path.mkdir(parents=True, exist_ok=True)
    print(f"ready: {path}")
