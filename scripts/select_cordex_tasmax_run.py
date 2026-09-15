#!/usr/bin/env python3
"""
Select one complete CORDEX daily tasmax run from the ESGF search manifest.

Default selected run:
  Domain: AUS-44
  RCM: CCLM4-8-17-CLM3-5
  Driving model: MPI-M-MPI-ESM-LR
  Ensemble: r1i1p1
  Experiments: historical, rcp45, rcp85

Input:
  data/climate/manifests/esgf_cordex_tasmax_search_results.json

Output:
  data/climate/manifests/selected_cordex_tasmax_datasets.json

Usage:
  python scripts/select_cordex_tasmax_run.py

Inspect result:
  cat data/climate/manifests/selected_cordex_tasmax_datasets.json | jq '.summary'
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any


DEFAULT_IN = Path("data/climate/manifests/esgf_cordex_tasmax_search_results.json")
DEFAULT_OUT = Path("data/climate/manifests/selected_cordex_tasmax_datasets.json")


def is_daily_tasmax(record: dict[str, Any]) -> bool:
    dataset_id = str(record.get("dataset_id") or "")
    file_id = str(record.get("file_id") or "")
    frequency = str(record.get("frequency") or "")

    return (
        ".day.tasmax." in dataset_id
        or "_day_" in file_id
        or frequency == "day"
    )


def run_key(record: dict[str, Any]) -> str:
    return " | ".join(
        [
            str(record.get("domain") or ""),
            str(record.get("model") or ""),
            str(record.get("rcm_name") or ""),
            str(record.get("driving_model") or ""),
            str(record.get("ensemble") or ""),
        ]
    )


def filename_from_record(record: dict[str, Any]) -> str:
    file_id = str(record.get("file_id") or "")
    before_node = file_id.split("|")[0]
    candidate = before_node.split(".")[-1]

    if candidate.endswith(".nc"):
        return candidate

    for url in get_download_urls(record):
        url_name = url.rstrip("/").split("/")[-1]
        if url_name.endswith(".nc"):
            return url_name

    raise ValueError(f"Could not determine filename for file_id: {file_id}")


def get_download_urls(record: dict[str, Any]) -> list[str]:
    urls: list[str] = []

    for key in ["http_urls", "opendap_urls"]:
        value = record.get(key)
        if isinstance(value, list):
            urls.extend(str(item) for item in value if item)

    for item in record.get("all_service_urls") or []:
        if not isinstance(item, dict):
            continue

        url = item.get("url")
        if not url:
            continue

        service_type = str(item.get("service_type") or "").lower()

        if service_type in {"httpserver", "httpsserver", "opendap", "dods"}:
            urls.append(str(url))

    # Deduplicate while preserving order.
    seen: set[str] = set()
    clean_urls: list[str] = []

    for url in urls:
        if url.endswith(".html"):
            # OPeNDAP HTML pages are useful in browser but not direct downloads.
            continue

        if url not in seen:
            clean_urls.append(url)
            seen.add(url)

    return clean_urls


def extract_time_range(filename: str) -> dict[str, str | int | None]:
    match = re.search(r"_(\d{8})-(\d{8})\.nc$", filename)

    if not match:
        return {
            "start_date": None,
            "end_date": None,
            "start_year": None,
            "end_year": None,
        }

    start_date = match.group(1)
    end_date = match.group(2)

    return {
        "start_date": start_date,
        "end_date": end_date,
        "start_year": int(start_date[:4]),
        "end_year": int(end_date[:4]),
    }


def normalize_selected_record(record: dict[str, Any]) -> dict[str, Any]:
    filename = filename_from_record(record)
    urls = get_download_urls(record)
    time_range = extract_time_range(filename)

    if not urls:
        raise ValueError(f"No downloadable URL found for {filename}")

    return {
        "filename": filename,
        "download_url": urls[0],
        "alternate_urls": urls[1:],
        "experiment": record.get("experiment"),
        "domain": record.get("domain"),
        "model": record.get("model"),
        "rcm_name": record.get("rcm_name"),
        "driving_model": record.get("driving_model"),
        "ensemble": record.get("ensemble"),
        "dataset_id": record.get("dataset_id"),
        "file_id": record.get("file_id"),
        "size_bytes": record.get("size_bytes"),
        "size_mb": record.get("size_mb"),
        "checksum": record.get("checksum"),
        "checksum_type": record.get("checksum_type"),
        "data_node": record.get("data_node"),
        **time_range,
    }


def summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    by_experiment: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for record in records:
        by_experiment[str(record["experiment"])].append(record)

    summary: dict[str, Any] = {
        "file_count": len(records),
        "experiments": {},
        "estimated_total_size_mb": round(
            sum(float(record.get("size_mb") or 0) for record in records),
            2,
        ),
    }

    for experiment, items in sorted(by_experiment.items()):
        years = [
            year
            for record in items
            for year in [record.get("start_year"), record.get("end_year")]
            if isinstance(year, int)
        ]

        summary["experiments"][experiment] = {
            "file_count": len(items),
            "start_year": min(years) if years else None,
            "end_year": max(years) if years else None,
            "estimated_size_mb": round(
                sum(float(record.get("size_mb") or 0) for record in items),
                2,
            ),
        }

    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in-manifest", type=Path, default=DEFAULT_IN)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)

    parser.add_argument("--domain", default="AUS-44")
    parser.add_argument("--model", default="CCLM4-8-17-CLM3-5")
    parser.add_argument("--rcm-name", default="CCLM4-8-17-CLM3-5")
    parser.add_argument("--driving-model", default="MPI-M-MPI-ESM-LR")
    parser.add_argument("--ensemble", default="r1i1p1")
    parser.add_argument("--experiments", nargs="+", default=["historical", "rcp45", "rcp85"])

    args = parser.parse_args()

    manifest = json.loads(args.in_manifest.read_text(encoding="utf-8"))
    records = manifest.get("records") or []

    selected_raw: list[dict[str, Any]] = []

    for record in records:
        if not is_daily_tasmax(record):
            continue

        if str(record.get("domain") or "") != args.domain:
            continue

        if str(record.get("model") or "") != args.model:
            continue

        if str(record.get("rcm_name") or "") != args.rcm_name:
            continue

        if str(record.get("driving_model") or "") != args.driving_model:
            continue

        if str(record.get("ensemble") or "") != args.ensemble:
            continue

        if str(record.get("experiment") or "") not in args.experiments:
            continue

        selected_raw.append(record)

    selected = [normalize_selected_record(record) for record in selected_raw]
    selected.sort(
        key=lambda record: (
            str(record.get("experiment") or ""),
            record.get("start_year") or 9999,
            str(record.get("filename") or ""),
        )
    )

    found_experiments = sorted(set(str(record.get("experiment")) for record in selected))
    missing_experiments = [
        experiment for experiment in args.experiments if experiment not in found_experiments
    ]

    output = {
        "manifest_type": "selected_cordex_tasmax_datasets",
        "version": "0.1.0",
        "created_by": "scripts/select_cordex_tasmax_run.py",
        "source_manifest": str(args.in_manifest),
        "selection": {
            "domain": args.domain,
            "model": args.model,
            "rcm_name": args.rcm_name,
            "driving_model": args.driving_model,
            "ensemble": args.ensemble,
            "experiments_requested": args.experiments,
            "experiments_found": found_experiments,
            "missing_experiments": missing_experiments,
            "run_key": " | ".join(
                [
                    args.domain,
                    args.model,
                    args.rcm_name,
                    args.driving_model,
                    args.ensemble,
                ]
            ),
        },
        "summary": summarize(selected),
        "files": selected,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, indent=2), encoding="utf-8")

    print(f"Wrote selected manifest: {args.out}")
    print(f"Selected files: {len(selected)}")
    print(f"Experiments found: {', '.join(found_experiments)}")

    if missing_experiments:
        print(f"WARNING: Missing experiments: {', '.join(missing_experiments)}")
    else:
        print("Selection has all requested experiments.")

    print("\nSummary:")
    print(json.dumps(output["summary"], indent=2))


if __name__ == "__main__":
    main()