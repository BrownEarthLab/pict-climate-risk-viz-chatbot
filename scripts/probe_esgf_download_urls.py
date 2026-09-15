#!/usr/bin/env python3

import argparse
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path

GOOD_CODES = {"200", "206"}

def unique(items):
    seen = set()
    out = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out

def get_urls(record):
    urls = []

    for key in ["download_url"]:
        value = record.get(key)
        if value:
            urls.append(value)

    for key in ["http_urls", "alternate_urls", "opendap_urls"]:
        value = record.get(key) or []
        if isinstance(value, str):
            value = [value]
        urls.extend(value)

    expanded = []

    for url in urls:
        expanded.append(url)

        if url.startswith("http://"):
            expanded.append("https://" + url[len("http://"):])
        elif url.startswith("https://"):
            expanded.append("http://" + url[len("https://"):])

        if "/thredds/fileServer/cordex_l02/cordex/output/" in url:
            expanded.append(
                url.replace(
                    "/thredds/fileServer/cordex_l02/cordex/output/",
                    "/thredds/fileServer/cordex/cordex/output/",
                )
            )

        if "/thredds/fileServer/cordex/cordex/output/" in url:
            expanded.append(
                url.replace(
                    "/thredds/fileServer/cordex/cordex/output/",
                    "/thredds/fileServer/cordex_l02/cordex/output/",
                )
            )

    return unique(expanded)

def run_key(record):
    return " | ".join(
        str(record.get(key) or "")
        for key in ["domain", "model", "rcm_name", "driving_model", "ensemble"]
    )

def is_daily_tasmax(record):
    text = " ".join(
        str(record.get(key) or "")
        for key in ["dataset_id", "file_id", "frequency", "time_frequency", "variable"]
    )
    return ".day.tasmax." in text or "_day_" in text or record.get("frequency") == "day"

def file_start_year(record):
    text = str(record.get("filename") or record.get("file_id") or "")
    match = re.search(r"_(\d{8})-(\d{8})\.nc", text)
    if not match:
        return 9999
    return int(match.group(1)[:4])

def choose_test_records(records, experiment, max_files):
    selected = [record for record in records if record.get("experiment") == experiment]

    if experiment == "historical":
        selected = sorted(
            selected,
            key=lambda r: (
                0 if 1981 <= file_start_year(r) <= 1990 else 1,
                abs(file_start_year(r) - 1981),
            ),
        )
    else:
        selected = sorted(selected, key=file_start_year)

    return selected[:max_files]

def probe_url(url, timeout):
    cmd = [
        "curl",
        "-L",
        "-sS",
        "--range",
        "0-0",
        "--max-time",
        str(timeout),
        "-o",
        "/tmp/esgf_probe_byte",
        "-w",
        "%{http_code}",
        url,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    code = result.stdout.strip()[-3:] if result.stdout.strip() else "000"

    return {
        "url": url,
        "http_code": code,
        "returncode": result.returncode,
        "ok": code in GOOD_CODES,
        "stderr": result.stderr.strip()[:300],
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--manifest",
        default="data/climate/manifests/esgf_cordex_tasmax_search_results.json",
    )
    parser.add_argument(
        "--out",
        default="data/climate/manifests/esgf_live_url_probe.json",
    )
    parser.add_argument("--max-files-per-experiment", type=int, default=2)
    parser.add_argument("--timeout", type=int, default=20)
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    records = manifest.get("records", [])

    groups = defaultdict(list)

    for record in records:
        if not is_daily_tasmax(record):
            continue
        groups[run_key(record)].append(record)

    run_reports = []

    for key, group in sorted(groups.items()):
        experiments = sorted(set(record.get("experiment") for record in group))

        if "historical" not in experiments or "rcp85" not in experiments:
            continue

        print("\n" + "=" * 90)
        print(key)
        print(f"experiments: {experiments}")
        print(f"records: {len(group)}")

        tested = []

        for experiment in ["historical", "rcp85"]:
            test_records = choose_test_records(
                group,
                experiment,
                args.max_files_per_experiment,
            )

            for record in test_records:
                filename = record.get("filename") or str(record.get("file_id", "")).split(".")[-1]
                print(f"\nTesting {experiment}: {filename}")

                url_results = []
                for url in get_urls(record):
                    result = probe_url(url, args.timeout)
                    url_results.append(result)
                    print(f"  {result['http_code']}  {url}")

                    if result["ok"]:
                        break

                tested.append(
                    {
                        "experiment": experiment,
                        "filename": filename,
                        "file_id": record.get("file_id"),
                        "dataset_id": record.get("dataset_id"),
                        "url_results": url_results,
                        "has_working_url": any(item["ok"] for item in url_results),
                        "working_url": next(
                            (item["url"] for item in url_results if item["ok"]),
                            None,
                        ),
                    }
                )

        historical_ok = any(
            item["experiment"] == "historical" and item["has_working_url"]
            for item in tested
        )
        rcp85_ok = any(
            item["experiment"] == "rcp85" and item["has_working_url"]
            for item in tested
        )

        run_report = {
            "run_key": key,
            "experiments": experiments,
            "record_count": len(group),
            "historical_ok": historical_ok,
            "rcp85_ok": rcp85_ok,
            "usable_for_rcp85_uncertainty": historical_ok and rcp85_ok,
            "tested": tested,
        }

        run_reports.append(run_report)

        print(
            f"\nSUMMARY: historical_ok={historical_ok}, "
            f"rcp85_ok={rcp85_ok}, "
            f"usable={historical_ok and rcp85_ok}"
        )

    out = {
        "source_manifest": args.manifest,
        "run_count": len(run_reports),
        "usable_runs": [
            report["run_key"]
            for report in run_reports
            if report["usable_for_rcp85_uncertainty"]
        ],
        "runs": run_reports,
    }

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, indent=2), encoding="utf-8")

    print("\n" + "=" * 90)
    print(f"Wrote probe report: {args.out}")
    print("Usable runs:")
    for run in out["usable_runs"]:
        print(f"  - {run}")

if __name__ == "__main__":
    main()
