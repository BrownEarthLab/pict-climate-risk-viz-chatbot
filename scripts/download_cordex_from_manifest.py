#!/usr/bin/env python3
"""
Download CORDEX files from selected_cordex_tasmax_datasets.json.

Input:
  data/climate/manifests/selected_cordex_tasmax_datasets.json

Output:
  data/climate/raw/cordex/<run_slug>/<experiment>/*.nc
  data/climate/manifests/downloaded_cordex_tasmax_files.json

Safe first run:
  python scripts/download_cordex_from_manifest.py --dry-run --max-files-per-experiment 1

Download one sample per experiment:
  python scripts/download_cordex_from_manifest.py --max-files-per-experiment 1

Download all selected files:
  python scripts/download_cordex_from_manifest.py
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_SELECTED = Path("data/climate/manifests/selected_cordex_tasmax_datasets.json")
DEFAULT_REPORT = Path("data/climate/manifests/downloaded_cordex_tasmax_files.json")
DEFAULT_OUT_DIR = Path("data/climate/raw/cordex")


def slugify(text: str) -> str:
    clean = []
    for char in text.lower():
        if char.isalnum():
            clean.append(char)
        elif char in {"-", "_", "."}:
            clean.append(char)
        else:
            clean.append("_")

    slug = "".join(clean)
    while "__" in slug:
        slug = slug.replace("__", "_")

    return slug.strip("_")


def build_run_slug(selection: dict[str, Any]) -> str:
    parts = [
        selection.get("domain"),
        selection.get("model"),
        selection.get("driving_model"),
        selection.get("ensemble"),
    ]

    return slugify("_".join(str(part) for part in parts if part))


def load_selected(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Missing selected manifest: {path}")

    return json.loads(path.read_text(encoding="utf-8"))


def choose_files(
    files: list[dict[str, Any]],
    experiments: list[str] | None,
    max_files: int | None,
    max_files_per_experiment: int | None,
) -> list[dict[str, Any]]:
    filtered = []

    for file_record in files:
        experiment = str(file_record.get("experiment") or "")

        if experiments and experiment not in experiments:
            continue

        filtered.append(file_record)

    filtered.sort(
        key=lambda record: (
            str(record.get("experiment") or ""),
            record.get("start_year") or 9999,
            str(record.get("filename") or ""),
        )
    )

    if max_files_per_experiment is not None:
        counts: dict[str, int] = {}
        limited: list[dict[str, Any]] = []

        for record in filtered:
            experiment = str(record.get("experiment") or "")
            current_count = counts.get(experiment, 0)

            if current_count >= max_files_per_experiment:
                continue

            limited.append(record)
            counts[experiment] = current_count + 1

        filtered = limited

    if max_files is not None:
        filtered = filtered[:max_files]

    return filtered


def urlopen_with_headers(url: str, headers: dict[str, str], timeout: int):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "pict-climate-risk-viz-chatbot-cordex-downloader/0.1",
            **headers,
        },
    )

    return urllib.request.urlopen(request, timeout=timeout)


def download_file(
    url: str,
    destination: Path,
    *,
    expected_size_bytes: int | None,
    timeout: int,
    retries: int,
    retry_sleep_seconds: float,
    chunk_size: int,
) -> dict[str, Any]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    part_path = destination.with_suffix(destination.suffix + ".part")

    if destination.exists():
        size = destination.stat().st_size

        if expected_size_bytes is None or size == expected_size_bytes:
            return {
                "status": "skipped_existing",
                "path": str(destination),
                "bytes": size,
            }

        print(
            f"Existing file size mismatch; redownloading: {destination}",
            file=sys.stderr,
        )
        destination.unlink()

    start_byte = part_path.stat().st_size if part_path.exists() else 0

    last_error: str | None = None

    for attempt in range(retries + 1):
        try:
            headers = {}

            mode = "wb"

            if start_byte > 0:
                headers["Range"] = f"bytes={start_byte}-"
                mode = "ab"

            with urlopen_with_headers(url, headers, timeout) as response:
                status = getattr(response, "status", None)

                # If server ignores Range, restart from zero.
                if start_byte > 0 and status == 200:
                    mode = "wb"
                    start_byte = 0

                with part_path.open(mode) as out_file:
                    shutil.copyfileobj(response, out_file, length=chunk_size)

            final_size = part_path.stat().st_size

            if expected_size_bytes is not None and final_size != expected_size_bytes:
                raise RuntimeError(
                    f"Downloaded size mismatch for {destination.name}: "
                    f"got {final_size}, expected {expected_size_bytes}"
                )

            part_path.rename(destination)

            return {
                "status": "downloaded",
                "path": str(destination),
                "bytes": final_size,
            }

        except Exception as exc:
            last_error = str(exc)

            if attempt < retries:
                print(
                    f"Download failed ({attempt + 1}/{retries + 1}) for {destination.name}: {last_error}",
                    file=sys.stderr,
                )
                time.sleep(retry_sleep_seconds)

    return {
        "status": "failed",
        "path": str(destination),
        "error": last_error,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selected-manifest", type=Path, default=DEFAULT_SELECTED)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--experiments", nargs="+", default=None)
    parser.add_argument("--max-files", type=int, default=None)
    parser.add_argument("--max-files-per-experiment", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--retry-sleep-seconds", type=float, default=3.0)
    parser.add_argument("--chunk-size-mb", type=int, default=8)

    args = parser.parse_args()

    manifest = load_selected(args.selected_manifest)
    selection = manifest["selection"]
    run_slug = build_run_slug(selection)

    selected_files = choose_files(
        manifest.get("files") or [],
        experiments=args.experiments,
        max_files=args.max_files,
        max_files_per_experiment=args.max_files_per_experiment,
    )

    print(f"Selected manifest: {args.selected_manifest}")
    print(f"Run: {selection['run_key']}")
    print(f"Output run folder: {args.out_dir / run_slug}")
    print(f"Files to download: {len(selected_files)}")

    results: list[dict[str, Any]] = []

    for index, file_record in enumerate(selected_files, start=1):
        experiment = str(file_record["experiment"])
        filename = str(file_record["filename"])
        url = str(file_record["download_url"])

        destination = args.out_dir / run_slug / experiment / filename

        expected_size_bytes = file_record.get("size_bytes")
        if expected_size_bytes is not None:
            expected_size_bytes = int(expected_size_bytes)

        print(f"\n[{index}/{len(selected_files)}] {experiment} / {filename}")
        print(f"URL: {url}")
        print(f"Destination: {destination}")

        if args.dry_run:
            result = {
                "status": "dry_run",
                "filename": filename,
                "experiment": experiment,
                "url": url,
                "path": str(destination),
                "size_mb": file_record.get("size_mb"),
            }
        else:
            download_result = download_file(
                url,
                destination,
                expected_size_bytes=expected_size_bytes,
                timeout=args.timeout,
                retries=args.retries,
                retry_sleep_seconds=args.retry_sleep_seconds,
                chunk_size=args.chunk_size_mb * 1024 * 1024,
            )

            result = {
                "filename": filename,
                "experiment": experiment,
                "url": url,
                "size_mb": file_record.get("size_mb"),
                **download_result,
            }

        print(f"Status: {result['status']}")
        results.append(result)

    report = {
        "manifest_type": "downloaded_cordex_tasmax_files",
        "version": "0.1.0",
        "selected_manifest": str(args.selected_manifest),
        "run_slug": run_slug,
        "dry_run": args.dry_run,
        "file_count": len(results),
        "results": results,
    }

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"\nWrote download report: {args.report}")

    status_counts: dict[str, int] = {}

    for result in results:
        status = str(result.get("status"))
        status_counts[status] = status_counts.get(status, 0) + 1

    print("Status counts:")
    print(json.dumps(status_counts, indent=2))

    if any(result.get("status") == "failed" for result in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()