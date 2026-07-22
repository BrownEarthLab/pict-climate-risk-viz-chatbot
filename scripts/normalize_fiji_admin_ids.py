import json
import re
import shutil
from pathlib import Path

FILES = [
    Path("data/reference/fiji_admin_adm1.geojson"),
    Path("data/reference/fiji_admin_adm2.geojson"),
    Path("data/reference/fiji_tikina.geojson"),
]


def slugify(value):
    value = str(value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_") or "unknown"


def normalize_file(path):
    if not path.exists():
        print(f"Missing: {path}")
        return

    with path.open(encoding="utf-8") as f:
        data = json.load(f)

    seen = {}

    for feature in data.get("features", []):
        props = feature.setdefault("properties", {})
        level = props.get("admin_level", "admin")
        name = props.get("admin_name") or props.get("shapeName") or props.get("Tikina")

        if level == "tikina":
            province = props.get("Province", "")
            tid = props.get("tid17", "")
            base = slugify(f"{province}_{name}_{tid}" if tid else f"{province}_{name}")
        else:
            base = slugify(name)

        count = seen.get(base, 0)
        seen[base] = count + 1

        admin_id = base if count == 0 else f"{base}_{count + 1}"

        props["admin_id"] = admin_id
        props["admin_name"] = str(name)
        props["display_name"] = str(name)

    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f)

    public_path = Path("frontend/public") / path.name
    public_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, public_path)

    names = [
        feature["properties"]["admin_id"]
        for feature in data.get("features", [])
    ]

    print(f"\nNormalized {path}")
    print(f"Feature count: {len(names)}")
    print("First 20 ids:")
    for name in names[:20]:
        print(f"  - {name}")


def main():
    for path in FILES:
        normalize_file(path)


if __name__ == "__main__":
    main()
