#!/usr/bin/env python3
"""
Recolor existing TX90p GeoJSON cache files WITHOUT recomputing climate science.

This only changes presentation properties:
  bivariate_color
  alpha
  bivariate_class (kept consistent)
and styling metadata where present.

It does NOT change:
  TX90p values
  inter-model spread
  reliability score
  risk thresholds
  geometry
  model values

Run from repository root:
    python scripts/recolor_existing_tx90p_cache.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path("backend/cache/climate_indices/tasmax/fji/h3_res6/tx90p")

COLORS = {
    "low": "#0067B1",
    "medium": "#B89A75",
    "high": "#F47A00",
}

ALPHA = {
    "low": 0.55,
    "medium": 0.75,
    "high": 0.95,
}

def risk_class(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return "medium"
    if value < 33:
        return "low"
    if value < 66:
        return "medium"
    return "high"

def reliability_class(score):
    try:
        score = float(score)
    except (TypeError, ValueError):
        return "high"
    if score < 0.33:
        return "low"
    if score < 0.66:
        return "medium"
    return "high"

def patch_metadata(obj):
    if not isinstance(obj, dict):
        return
    # Update common styling metadata locations without deleting anything.
    for key, value in list(obj.items()):
        if key == "bivariate_color_matrix":
            obj[key] = {
                "low": {k: COLORS["low"] for k in ("low", "medium", "high")},
                "medium": {k: COLORS["medium"] for k in ("low", "medium", "high")},
                "high": {k: COLORS["high"] for k in ("low", "medium", "high")},
            }
        elif key == "reliability_alpha":
            obj[key] = dict(ALPHA)
        elif isinstance(value, dict):
            patch_metadata(value)

def patch_file(path: Path) -> tuple[int, int]:
    data = json.loads(path.read_text())
    features = data.get("features", [])
    changed = 0

    for feature in features:
        props = feature.get("properties") or {}
        if not isinstance(props, dict):
            continue

        r = props.get("risk_class") or risk_class(props.get("value"))
        rel = props.get("reliability_class")
        if not rel:
            rel = reliability_class(props.get("reliability_score"))

        if r not in COLORS:
            r = risk_class(props.get("value"))
        if rel not in ALPHA:
            rel = reliability_class(props.get("reliability_score"))

        new_color = COLORS[r]
        new_alpha = ALPHA[rel]
        new_class = f"{r}_risk_{rel}_reliability"

        before = (
            props.get("bivariate_color"),
            props.get("alpha"),
            props.get("bivariate_class"),
        )

        props["risk_class"] = r
        props["reliability_class"] = rel
        props["bivariate_color"] = new_color
        props["alpha"] = new_alpha
        props["bivariate_class"] = new_class
        props["alpha_method"] = "reliability_class_value_by_alpha_3x3"

        after = (new_color, new_alpha, new_class)
        if before != after:
            changed += 1

    patch_metadata(data.get("metadata", {}))
    path.write_text(json.dumps(data, separators=(",", ":")))

    return len(features), changed

def main() -> None:
    if not ROOT.exists():
        raise SystemExit(
            f"Cache root not found: {ROOT}\n"
            "Nothing was changed. Build or locate your TX90p cache first."
        )

    paths = sorted(ROOT.rglob("*.geojson"))
    if not paths:
        raise SystemExit(f"No GeoJSON cache files found under {ROOT}")

    files_changed = 0
    features_changed = 0
    features_seen = 0

    for path in paths:
        n_features, n_changed = patch_file(path)
        features_seen += n_features
        features_changed += n_changed
        if n_changed:
            files_changed += 1
            print(f"updated {path}: {n_changed}/{n_features} features")

    print("\nDone.")
    print(f"GeoJSON files scanned: {len(paths)}")
    print(f"Files updated: {files_changed}")
    print(f"Features scanned: {features_seen}")
    print(f"Features updated: {features_changed}")
    print("\nNo climate values, spread values, reliability scores, or geometries were recomputed.")

if __name__ == "__main__":
    main()
