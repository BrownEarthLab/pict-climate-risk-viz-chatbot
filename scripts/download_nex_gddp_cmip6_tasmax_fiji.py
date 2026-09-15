#!/usr/bin/env python3
"""
Download Fiji-only tasmax subsets from NASA NEX-GDDP-CMIP6.

Why this script exists:
  - CORDEX/ESGF links were indexed but many actual file URLs returned 404.
  - NEX-GDDP-CMIP6 has AWS S3 object listing plus NCCS THREDDS spatial subsetting.
  - We use S3 only to discover real filenames.
  - We use THREDDS NCSS to download small Fiji-only NetCDF subsets.

Default goal:
  - tasmax
  - historical baseline years: 1981-2010
  - future years: 2015-2100
  - scenarios: ssp245 and ssp585
  - Fiji split into two antimeridian-safe boxes

Outputs:
  data/climate/raw/nex_gddp_cmip6/fiji_subset/<model>/<experiment>/<year>/<box>.nc
  data/climate/manifests/nex_gddp_cmip6_fiji_tasmax_download_report.json

Run tiny dry run:
  python scripts/download_nex_gddp_cmip6_tasmax_fiji.py \
    --models ACCESS-CM2 CanESM5 GFDL-ESM4 \
    --experiments historical ssp585 \
    --historical-start 1981 --historical-end 1981 \
    --future-start 2015 --future-end 2015 \
    --dry-run

Run tiny real test:
  python scripts/download_nex_gddp_cmip6_tasmax_fiji.py \
    --models ACCESS-CM2 CanESM5 GFDL-ESM4 \
    --experiments historical ssp585 \
    --historical-start 1981 --historical-end 1981 \
    --future-start 2015 --future-end 2015

Run full first ensemble:
  python scripts/download_nex_gddp_cmip6_tasmax_fiji.py \
    --models ACCESS-CM2 CanESM5 GFDL-ESM4 MPI-ESM1-2-HR NorESM2-MM \
    --experiments historical ssp585
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


S3_BUCKET_URL = "https://nex-gddp-cmip6.s3.us-west-2.amazonaws.com"
S3_ROOT_PREFIX = "NEX-GDDP-CMIP6"
THREDDS_NCSS_ROOT = "https://ds.nccs.nasa.gov/thredds/ncss/grid/AMES/NEX/GDDP-CMIP6"

DEFAULT_MODELS = [
    "ACCESS-CM2",
    "CanESM5",
    "GFDL-ESM4",
    "MPI-ESM1-2-HR",
    "NorESM2-MM",
]

DEFAULT_EXPERIMENTS = ["historical", "ssp245", "ssp585"]

FIJI_BOXES = [
    {
        "name": "fiji_east_176_180",
        "north": -12.0,
        "south": -23.0,
        "west": 176.0,
        "east": 180.0,
    },
    {
        "name": "fiji_west_minus180_minus178",
        "north": -12.0,
        "south": -23.0,
        "west": -180.0,
        "east": -178.0,
    },
]


def http_get_bytes(url: str, *, timeout: int = 60) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "pict-climate-risk-viz/0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def s3_list_keys(prefix: str, *, timeout: int = 60) -> list[str]:
    keys: list[str] = []
    continuation_token: str | None = None

    while True:
        params = {
            "list-type": "2",
            "prefix": prefix,
            "max-keys": "1000",
        }

        if continuation_token:
            params["continuation-token"] = continuation_token

        url = f"{S3_BUCKET_URL}/?{urllib.parse.urlencode(params)}"
        data = http_get_bytes(url, timeout=timeout)

        root = ET.fromstring(data)

        namespace = ""
        if root.tag.startswith("{"):
            namespace = root.tag.split("}")[0].strip("{")

        def tag(name: str) -> str:
            return f"{{{namespace}}}{name}" if namespace else name

        for item in root.findall(tag("Contents")):
            key_el = item.find(tag("Key"))
            if key_el is not None and key_el.text:
                keys.append(key_el.text)

        truncated_el = root.find(tag("IsTruncated"))
        is_truncated = (
            truncated_el is not None
            and truncated_el.text is not None
            and truncated_el.text.lower() == "true"
        )

        if not is_truncated:
            break

        token_el = root.find(tag("NextContinuationToken"))

        if token_el is None or not token_el.text:
            break

        continuation_token = token_el.text

    return keys


def discover_tasmax_key(
    *,
    model: str,
    experiment: str,
    year: int,
    timeout: int,
) -> str | None:
    prefix = f"{S3_ROOT_PREFIX}/{model}/{experiment}/"
    keys = s3_list_keys(prefix, timeout=timeout)

    expected_middle = f"tasmax_day_{model}_{experiment}_"
    expected_year = f"_{year}"

    candidates = [
        key
        for key in keys
        if "/tasmax/" in key
        and key.endswith(".nc")
        and expected_middle in key
        and expected_year in Path(key).name
    ]

    if not candidates:
        return None

    # Prefer latest version suffix if multiple exist.
    def score(key: str) -> tuple[int, str]:
        name = Path(key).name
        if "_v1.2.nc" in name:
            return (3, name)
        if "_v1.1.nc" in name:
            return (2, name)
        return (1, name)

    return sorted(candidates, key=score, reverse=True)[0]


def thredds_dataset_path_from_s3_key(s3_key: str) -> str:
    prefix = f"{S3_ROOT_PREFIX}/"

    if not s3_key.startswith(prefix):
        raise ValueError(f"Unexpected S3 key: {s3_key}")

    return s3_key[len(prefix):]


def build_ncss_url(
    *,
    s3_key: str,
    variable: str,
    year: int,
    box: dict[str, float | str],
    accept: str,
) -> str:
    dataset_path = thredds_dataset_path_from_s3_key(s3_key)

    base = f"{THREDDS_NCSS_ROOT}/{dataset_path}"

    params = {
        "var": variable,
        "north": str(box["north"]),
        "west": str(box["west"]),
        "east": str(box["east"]),
        "south": str(box["south"]),
        "horizStride": "1",
        "time_start": f"{year}-01-01T12:00:00Z",
        "time_end": f"{year}-12-31T12:00:00Z",
        "accept": accept,
        "addLatLon": "true",
    }

    return f"{base}?{urllib.parse.urlencode(params)}"


def download_url(
    url: str,
    destination: Path,
    *,
    timeout: int,
    retries: int,
    sleep_seconds: float,
    dry_run: bool,
) -> dict[str, Any]:
    destination.parent.mkdir(parents=True, exist_ok=True)

    if destination.exists() and destination.stat().st_size > 0:
        return {
            "status": "skipped_existing",
            "path": str(destination),
            "bytes": destination.stat().st_size,
        }

    if dry_run:
        return {
            "status": "dry_run",
            "path": str(destination),
            "bytes": None,
        }

    last_error = None

    for attempt in range(1, retries + 1):
        try:
            data = http_get_bytes(url, timeout=timeout)

            if len(data) < 1000:
                raise RuntimeError(
                    f"Downloaded response too small to be NetCDF: {len(data)} bytes"
                )

            tmp_path = destination.with_suffix(destination.suffix + ".part")
            tmp_path.write_bytes(data)
            tmp_path.replace(destination)

            return {
                "status": "downloaded",
                "path": str(destination),
                "bytes": destination.stat().st_size,
            }

        except Exception as exc:
            last_error = str(exc)
            print(f"    failed attempt {attempt}/{retries}: {last_error}")

            if attempt < retries:
                time.sleep(sleep_seconds)

    return {
        "status": "failed",
        "path": str(destination),
        "bytes": None,
        "error": last_error,
    }


def years_for_experiment(
    experiment: str,
    *,
    historical_start: int,
    historical_end: int,
    future_start: int,
    future_end: int,
) -> list[int]:
    if experiment == "historical":
        return list(range(historical_start, historical_end + 1))

    return list(range(future_start, future_end + 1))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    parser.add_argument("--experiments", nargs="+", default=DEFAULT_EXPERIMENTS)
    parser.add_argument("--variable", default="tasmax")
    parser.add_argument("--out-dir", type=Path, default=Path("data/climate/raw/nex_gddp_cmip6/fiji_subset"))
    parser.add_argument("--report", type=Path, default=Path("data/climate/manifests/nex_gddp_cmip6_fiji_tasmax_download_report.json"))
    parser.add_argument("--historical-start", type=int, default=1981)
    parser.add_argument("--historical-end", type=int, default=2010)
    parser.add_argument("--future-start", type=int, default=2015)
    parser.add_argument("--future-end", type=int, default=2100)
    parser.add_argument("--accept", default="netcdf3")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--sleep-seconds", type=float, default=2.0)
    parser.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()

    print("NEX-GDDP-CMIP6 Fiji tasmax subset download")
    print("------------------------------------------")
    print(f"Models: {args.models}")
    print(f"Experiments: {args.experiments}")
    print(f"Variable: {args.variable}")
    print(f"Output dir: {args.out_dir}")
    print(f"Dry run: {args.dry_run}")
    print("")

    records: list[dict[str, Any]] = []

    for model in args.models:
        for experiment in args.experiments:
            years = years_for_experiment(
                experiment,
                historical_start=args.historical_start,
                historical_end=args.historical_end,
                future_start=args.future_start,
                future_end=args.future_end,
            )

            for year in years:
                print(f"\n{model} / {experiment} / {year}")

                try:
                    s3_key = discover_tasmax_key(
                        model=model,
                        experiment=experiment,
                        year=year,
                        timeout=args.timeout,
                    )
                except Exception as exc:
                    print(f"  S3 discovery failed: {exc}")
                    records.append(
                        {
                            "model": model,
                            "experiment": experiment,
                            "year": year,
                            "status": "s3_discovery_failed",
                            "error": str(exc),
                        }
                    )
                    continue

                if not s3_key:
                    print("  no tasmax key found")
                    records.append(
                        {
                            "model": model,
                            "experiment": experiment,
                            "year": year,
                            "status": "missing_s3_key",
                        }
                    )
                    continue

                print(f"  S3 key: {s3_key}")

                for box in FIJI_BOXES:
                    box_name = str(box["name"])
                    url = build_ncss_url(
                        s3_key=s3_key,
                        variable=args.variable,
                        year=year,
                        box=box,
                        accept=args.accept,
                    )

                    destination = (
                        args.out_dir
                        / model
                        / experiment
                        / str(year)
                        / f"{Path(s3_key).stem}_{box_name}.nc"
                    )

                    print(f"  downloading subset {box_name}")
                    print(f"    {url}")

                    result = download_url(
                        url,
                        destination,
                        timeout=args.timeout,
                        retries=args.retries,
                        sleep_seconds=args.sleep_seconds,
                        dry_run=args.dry_run,
                    )

                    print(f"    status: {result['status']}")

                    records.append(
                        {
                            "model": model,
                            "experiment": experiment,
                            "year": year,
                            "box": box_name,
                            "s3_key": s3_key,
                            "ncss_url": url,
                            **result,
                        }
                    )

    status_counts: dict[str, int] = {}

    for record in records:
        status = str(record.get("status"))
        status_counts[status] = status_counts.get(status, 0) + 1

    report = {
        "source": "NASA NEX-GDDP-CMIP6",
        "variable": args.variable,
        "models": args.models,
        "experiments": args.experiments,
        "historical_years": [args.historical_start, args.historical_end],
        "future_years": [args.future_start, args.future_end],
        "boxes": FIJI_BOXES,
        "status_counts": status_counts,
        "records": records,
    }

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\nDone.")
    print(f"Wrote report: {args.report}")
    print("Status counts:")
    print(json.dumps(status_counts, indent=2))


if __name__ == "__main__":
    main()
