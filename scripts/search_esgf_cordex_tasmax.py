#!/usr/bin/env python3
"""
Search ESGF for CORDEX daily tasmax files for the PICT climate-index workflow.

Goal:
  Find candidate CORDEX daily Tmax / tasmax NetCDF files for:
    - Domain: AUS-22 first, AUS-44 fallback
    - Variable: tasmax
    - Experiments: historical, rcp45, rcp85
    - Model keywords: ICTP / RegCM / RegCM4 / RegCM4-7

This script DOES NOT download files.
It writes a manifest that we can inspect before choosing exact datasets.

Usage:
  python scripts/search_esgf_cordex_tasmax.py

More verbose:
  python scripts/search_esgf_cordex_tasmax.py --verbose

Search only AUS-22:
  python scripts/search_esgf_cordex_tasmax.py --domains AUS-22

Search with broader RCM keywords:
  python scripts/search_esgf_cordex_tasmax.py --rcm-keywords ICTP RegCM RegCM4

Output:
  data/climate/manifests/esgf_cordex_tasmax_search_results.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_SEARCH_ENDPOINTS = [
    # DKRZ is closest to the MetaGrid link we have been using.
    "https://esgf-data.dkrz.de/esg-search/search",
    # LLNL is a common ESGF index endpoint.
    "https://esgf-node.llnl.gov/esg-search/search",
    # IPSL is another common ESGF node.
    "https://esgf-node.ipsl.upmc.fr/esg-search/search",
]

DEFAULT_OUT = Path("data/climate/manifests/esgf_cordex_tasmax_search_results.json")


@dataclass(frozen=True)
class SearchAttempt:
    endpoint: str
    domain: str
    experiment: str
    frequency_param_name: str | None
    offset: int


def build_url(endpoint: str, params: dict[str, Any]) -> str:
    clean_params: dict[str, Any] = {}

    for key, value in params.items():
        if value is None:
            continue
        clean_params[key] = value

    query = urllib.parse.urlencode(clean_params, doseq=True)
    return f"{endpoint}?{query}"


def fetch_json(url: str, timeout_seconds: int, verbose: bool = False) -> dict[str, Any]:
    if verbose:
        print(f"GET {url}", file=sys.stderr)

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "pict-climate-risk-viz-chatbot-esgf-search/0.1",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        raw = response.read()

    return json.loads(raw.decode("utf-8"))


def get_docs(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    response = payload.get("response", {})
    docs = response.get("docs", [])
    num_found = int(response.get("numFound", len(docs)))
    return docs, num_found


def parse_esgf_urls(doc: dict[str, Any]) -> list[dict[str, str | None]]:
    """
    ESGF file docs often store URL entries like:
      url|mime_type|service_type

    Example service types can include:
      HTTPServer
      OPENDAP
      GridFTP
      Globus
    """
    raw_urls = doc.get("url") or []
    if isinstance(raw_urls, str):
        raw_urls = [raw_urls]

    parsed: list[dict[str, str | None]] = []

    for item in raw_urls:
        if not isinstance(item, str):
            continue

        parts = item.split("|")
        url = parts[0] if len(parts) >= 1 else item
        mime_type = parts[1] if len(parts) >= 2 else None
        service_type = parts[2] if len(parts) >= 3 else None

        parsed.append(
            {
                "url": url,
                "mime_type": mime_type,
                "service_type": service_type,
            }
        )

    return parsed


def get_first(doc: dict[str, Any], keys: list[str], default: Any = None) -> Any:
    for key in keys:
        value = doc.get(key)
        if value is not None:
            if isinstance(value, list):
                return value[0] if value else default
            return value
    return default


def text_blob_for_filtering(doc: dict[str, Any]) -> str:
    values: list[str] = []

    for key, value in doc.items():
        if isinstance(value, str):
            values.append(value)
        elif isinstance(value, list):
            values.extend(str(item) for item in value)

    return " ".join(values).lower()


def matches_keywords(doc: dict[str, Any], keywords: list[str], mode: str) -> bool:
    if not keywords:
        return True

    blob = text_blob_for_filtering(doc)
    lowered_keywords = [keyword.lower() for keyword in keywords]

    if mode == "any":
        return any(keyword in blob for keyword in lowered_keywords)

    if mode == "all":
        return all(keyword in blob for keyword in lowered_keywords)

    raise ValueError(f"Unknown keyword match mode: {mode}")


def normalize_doc(
    doc: dict[str, Any],
    endpoint: str,
    domain: str,
    experiment: str,
    frequency_param_name: str | None,
) -> dict[str, Any]:
    parsed_urls = parse_esgf_urls(doc)
    http_urls = [
        item["url"]
        for item in parsed_urls
        if (item.get("service_type") or "").lower() in {"httpserver", "httpsserver"}
        and item.get("url")
    ]
    opendap_urls = [
        item["url"]
        for item in parsed_urls
        if (item.get("service_type") or "").lower() in {"opendap", "dods"}
        and item.get("url")
    ]

    dataset_id = get_first(
        doc,
        ["dataset_id", "dataset_id_template_", "instance_id", "master_id"],
    )

    file_id = get_first(doc, ["id", "file_id", "title"])

    size_value = get_first(doc, ["size", "size_in_bytes"], default=None)

    try:
        size_bytes = int(size_value) if size_value is not None else None
    except (TypeError, ValueError):
        size_bytes = None

    return {
        "file_id": file_id,
        "dataset_id": dataset_id,
        "title": get_first(doc, ["title"]),
        "project": get_first(doc, ["project"]),
        "domain": get_first(doc, ["domain"], domain),
        "experiment": get_first(doc, ["experiment"], experiment),
        "variable": get_first(doc, ["variable", "variable_id"]),
        "frequency": get_first(doc, ["time_frequency", "frequency"]),
        "model": get_first(doc, ["model", "model_id", "rcm_name", "rcm_model"]),
        "rcm_name": get_first(doc, ["rcm_name", "rcm_model"]),
        "rcm_version": get_first(doc, ["rcm_version", "version"]),
        "driving_model": get_first(doc, ["driving_model", "driving_model_id"]),
        "ensemble": get_first(doc, ["ensemble", "member", "member_id", "driving_model_ensemble_member"]),
        "time_range": get_first(doc, ["datetime_stop", "datetime_start", "time_range"]),
        "size_bytes": size_bytes,
        "size_mb": round(size_bytes / (1024 * 1024), 2) if size_bytes else None,
        "checksum": get_first(doc, ["checksum"]),
        "checksum_type": get_first(doc, ["checksum_type"]),
        "data_node": get_first(doc, ["data_node"]),
        "index_node": endpoint,
        "search_domain": domain,
        "search_experiment": experiment,
        "search_frequency_param_name": frequency_param_name,
        "http_urls": http_urls,
        "opendap_urls": opendap_urls,
        "all_service_urls": parsed_urls,
        "raw_doc": doc,
    }


def search_page(
    endpoint: str,
    *,
    project: str,
    domain: str,
    variable: str,
    experiment: str,
    frequency: str,
    frequency_param_name: str | None,
    offset: int,
    limit: int,
    timeout_seconds: int,
    verbose: bool,
) -> tuple[list[dict[str, Any]], int, str]:
    params: dict[str, Any] = {
        "format": "application/solr+json",
        "type": "File",
        "latest": "true",
        "distrib": "true",
        "project": project,
        "domain": domain,
        "variable": variable,
        "experiment": experiment,
        "limit": limit,
        "offset": offset,
    }

    if frequency_param_name:
        params[frequency_param_name] = frequency

    url = build_url(endpoint, params)
    payload = fetch_json(url, timeout_seconds, verbose=verbose)
    docs, num_found = get_docs(payload)
    return docs, num_found, url


def search_with_retries(
    attempt: SearchAttempt,
    *,
    project: str,
    variable: str,
    frequency: str,
    limit: int,
    timeout_seconds: int,
    retries: int,
    retry_sleep_seconds: float,
    verbose: bool,
) -> tuple[list[dict[str, Any]], int, str | None, str | None]:
    last_error: str | None = None
    last_url: str | None = None

    for retry_index in range(retries + 1):
        try:
            docs, num_found, url = search_page(
                attempt.endpoint,
                project=project,
                domain=attempt.domain,
                variable=variable,
                experiment=attempt.experiment,
                frequency=frequency,
                frequency_param_name=attempt.frequency_param_name,
                offset=attempt.offset,
                limit=limit,
                timeout_seconds=timeout_seconds,
                verbose=verbose,
            )
            return docs, num_found, url, None
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = str(exc)
            last_url = build_url(
                attempt.endpoint,
                {
                    "format": "application/solr+json",
                    "type": "File",
                    "latest": "true",
                    "distrib": "true",
                    "project": project,
                    "domain": attempt.domain,
                    "variable": variable,
                    "experiment": attempt.experiment,
                    "limit": limit,
                    "offset": attempt.offset,
                    attempt.frequency_param_name or "_no_frequency_param": frequency
                    if attempt.frequency_param_name
                    else None,
                },
            )

            if verbose:
                print(
                    f"Search failed ({retry_index + 1}/{retries + 1}): {last_error}",
                    file=sys.stderr,
                )

            if retry_index < retries:
                time.sleep(retry_sleep_seconds)

    return [], 0, last_url, last_error


def group_records(records: list[dict[str, Any]]) -> dict[str, Any]:
    by_domain: dict[str, int] = defaultdict(int)
    by_experiment: dict[str, int] = defaultdict(int)
    by_dataset: dict[str, int] = defaultdict(int)
    by_modelish_key: dict[str, int] = defaultdict(int)

    total_size_bytes = 0

    for record in records:
        by_domain[str(record.get("domain") or record.get("search_domain") or "unknown")] += 1
        by_experiment[str(record.get("experiment") or record.get("search_experiment") or "unknown")] += 1

        dataset_id = str(record.get("dataset_id") or "unknown")
        by_dataset[dataset_id] += 1

        modelish = " | ".join(
            str(record.get(key) or "")
            for key in ["driving_model", "model", "rcm_name", "rcm_version", "ensemble"]
        ).strip(" |")
        by_modelish_key[modelish or "unknown"] += 1

        size_bytes = record.get("size_bytes")
        if isinstance(size_bytes, int):
            total_size_bytes += size_bytes

    return {
        "record_count": len(records),
        "estimated_total_size_mb": round(total_size_bytes / (1024 * 1024), 2)
        if total_size_bytes
        else None,
        "by_domain": dict(sorted(by_domain.items())),
        "by_experiment": dict(sorted(by_experiment.items())),
        "dataset_count": len(by_dataset),
        "top_datasets": sorted(
            [{"dataset_id": key, "file_count": value} for key, value in by_dataset.items()],
            key=lambda item: item["file_count"],
            reverse=True,
        )[:25],
        "top_modelish_groups": sorted(
            [{"modelish_key": key, "file_count": value} for key, value in by_modelish_key.items()],
            key=lambda item: item["file_count"],
            reverse=True,
        )[:25],
    }


def propose_sample_candidates(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """
    Pick a few small-ish candidates per experiment for manual inspection.
    This does not guarantee completeness; it is only to speed up choosing one
    historical and one future scenario file.
    """
    by_experiment: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for record in records:
        experiment = str(record.get("experiment") or record.get("search_experiment") or "unknown")
        by_experiment[experiment].append(record)

    proposed: dict[str, list[dict[str, Any]]] = {}

    for experiment, items in by_experiment.items():
        sorted_items = sorted(
            items,
            key=lambda item: (
                item.get("size_bytes") is None,
                item.get("size_bytes") or 10**30,
                str(item.get("dataset_id") or ""),
            ),
        )

        proposed[experiment] = [
            {
                "file_id": item.get("file_id"),
                "dataset_id": item.get("dataset_id"),
                "domain": item.get("domain"),
                "experiment": item.get("experiment"),
                "model": item.get("model"),
                "rcm_name": item.get("rcm_name"),
                "driving_model": item.get("driving_model"),
                "ensemble": item.get("ensemble"),
                "size_mb": item.get("size_mb"),
                "http_url": item.get("http_urls", [None])[0]
                if item.get("http_urls")
                else None,
                "opendap_url": item.get("opendap_urls", [None])[0]
                if item.get("opendap_urls")
                else None,
            }
            for item in sorted_items[:5]
        ]

    return proposed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default="CORDEX")
    parser.add_argument("--variable", default="tasmax")
    parser.add_argument("--frequency", default="day")
    parser.add_argument("--domains", nargs="+", default=["AUS-22", "AUS-44"])
    parser.add_argument("--experiments", nargs="+", default=["historical", "rcp45", "rcp85"])
    parser.add_argument(
        "--frequency-param-names",
        nargs="+",
        default=["time_frequency", "frequency", "none"],
        help="Try these ESGF facet names for daily frequency. Use 'none' to omit frequency constraint.",
    )
    parser.add_argument(
        "--rcm-keywords",
        nargs="+",
        default=["ICTP", "RegCM", "RegCM4"],
        help="Client-side keywords used to identify ICTP/RegCM-related candidates.",
    )
    parser.add_argument(
        "--keyword-mode",
        choices=["any", "all"],
        default="any",
        help="Whether candidate docs must match any or all RCM keywords.",
    )
    parser.add_argument("--endpoints", nargs="+", default=DEFAULT_SEARCH_ENDPOINTS)
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--max-pages-per-query", type=int, default=4)
    parser.add_argument("--timeout-seconds", type=int, default=60)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--retry-sleep-seconds", type=float, default=2.0)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--include-unfiltered", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    all_records_by_key: dict[str, dict[str, Any]] = {}
    all_unfiltered_by_key: dict[str, dict[str, Any]] = {}
    search_log: list[dict[str, Any]] = []

    frequency_param_names = [
        None if item.lower() == "none" else item for item in args.frequency_param_names
    ]

    for endpoint in args.endpoints:
        for domain in args.domains:
            for experiment in args.experiments:
                for frequency_param_name in frequency_param_names:
                    for page_index in range(args.max_pages_per_query):
                        offset = page_index * args.limit
                        attempt = SearchAttempt(
                            endpoint=endpoint,
                            domain=domain,
                            experiment=experiment,
                            frequency_param_name=frequency_param_name,
                            offset=offset,
                        )

                        docs, num_found, url, error = search_with_retries(
                            attempt,
                            project=args.project,
                            variable=args.variable,
                            frequency=args.frequency,
                            limit=args.limit,
                            timeout_seconds=args.timeout_seconds,
                            retries=args.retries,
                            retry_sleep_seconds=args.retry_sleep_seconds,
                            verbose=args.verbose,
                        )

                        search_log.append(
                            {
                                "endpoint": endpoint,
                                "domain": domain,
                                "experiment": experiment,
                                "frequency_param_name": frequency_param_name,
                                "offset": offset,
                                "url": url,
                                "num_found": num_found,
                                "docs_returned": len(docs),
                                "error": error,
                            }
                        )

                        if error:
                            continue

                        for doc in docs:
                            normalized = normalize_doc(
                                doc,
                                endpoint=endpoint,
                                domain=domain,
                                experiment=experiment,
                                frequency_param_name=frequency_param_name,
                            )

                            key = str(normalized.get("file_id") or normalized.get("title") or json.dumps(doc, sort_keys=True))
                            all_unfiltered_by_key[key] = normalized

                            if matches_keywords(doc, args.rcm_keywords, args.keyword_mode):
                                all_records_by_key[key] = normalized

                        # Stop paging when this page has fewer results than limit.
                        if len(docs) < args.limit:
                            break

    filtered_records = list(all_records_by_key.values())
    unfiltered_records = list(all_unfiltered_by_key.values())

    manifest: dict[str, Any] = {
        "manifest_type": "esgf_cordex_tasmax_search_results",
        "version": "0.1.0",
        "created_by": "scripts/search_esgf_cordex_tasmax.py",
        "query": {
            "project": args.project,
            "variable": args.variable,
            "frequency": args.frequency,
            "domains": args.domains,
            "experiments": args.experiments,
            "frequency_param_names_tried": [
                item if item is not None else "none" for item in frequency_param_names
            ],
            "rcm_keywords": args.rcm_keywords,
            "keyword_mode": args.keyword_mode,
            "endpoints": args.endpoints,
        },
        "summary": {
            "filtered": group_records(filtered_records),
            "unfiltered": group_records(unfiltered_records),
        },
        "proposed_sample_candidates": propose_sample_candidates(filtered_records),
        "search_log": search_log,
        "records": filtered_records,
    }

    if args.include_unfiltered:
        manifest["unfiltered_records"] = unfiltered_records

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Wrote manifest: {args.out}")
    print(f"Filtered candidate files: {len(filtered_records)}")
    print(f"Unfiltered candidate files: {len(unfiltered_records)}")

    filtered_summary = manifest["summary"]["filtered"]
    print("\nFiltered by experiment:")
    for experiment, count in filtered_summary["by_experiment"].items():
        print(f"  {experiment}: {count}")

    print("\nTop dataset groups:")
    for item in filtered_summary["top_datasets"][:10]:
        print(f"  {item['file_count']:>4}  {item['dataset_id']}")

    if not filtered_records:
        print(
            "\nNo filtered ICTP/RegCM candidates found. Try a broader search, for example:\n"
            "  python scripts/search_esgf_cordex_tasmax.py --rcm-keywords ICTP RegCM RegCM4 RegCM4-7 --keyword-mode any --include-unfiltered\n"
            "or inspect unfiltered results in the manifest.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()