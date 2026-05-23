"""
Merges a fresh SpotAngels scrape into data/candidates/candidates_with_features.geojson.

Run this AFTER reviewing the compare_with_existing.py report.

- New scrape spots overwrite existing spots with the same ID (fresher data wins)
- Existing spots from other sources (govt/OSM) are preserved unchanged
- Prints a summary of what changed

Usage:
    python data_pipeline/scripts/merge_data.py [path/to/scrape.geojson]

If no path is given, uses the most recent file in data_pipeline/spotangel_output/.

Outputs:
    data/candidates/candidates_with_features_YYYY-MM-DD_HH-MM.geojson  (dated archive, gitignored)
    data/candidates/candidates_with_features.geojson                    (latest, committed)
"""

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CANDIDATES_DIR = ROOT / "data" / "candidates"
LATEST_FILE    = CANDIDATES_DIR / "candidates_with_features.geojson"
SCRAPE_DIR     = ROOT / "data_pipeline" / "spotangel_output"


def load_geojson(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_latest_scrape():
    files = sorted(SCRAPE_DIR.glob("spotangels_*.geojson"), reverse=True)
    if not files:
        print("No scrape output found in data_pipeline/spotangel_output/. Run scrape_spotangels.py first.")
        sys.exit(1)
    return files[0]


def main():
    scrape_path = Path(sys.argv[1]) if len(sys.argv) > 1 else get_latest_scrape()

    start_tag    = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M")
    dated_output = CANDIDATES_DIR / f"candidates_with_features_{start_tag}.geojson"

    print(f"Merging: {scrape_path.name}")
    print(f"Into:    {LATEST_FILE.name}\n")

    new_data      = load_geojson(scrape_path)
    existing_data = load_geojson(LATEST_FILE)

    new_by_id      = {str(f["properties"]["id"]): f for f in new_data["features"]}
    existing_by_id = {str(f["properties"]["id"]): f for f in existing_data["features"]}

    n_updated = 0
    n_added   = 0
    n_kept    = 0
    merged    = {}

    for sid, feature in existing_by_id.items():
        if sid in new_by_id:
            merged[sid] = new_by_id[sid]
            n_updated += 1
        else:
            merged[sid] = feature
            n_kept += 1

    for sid, feature in new_by_id.items():
        if sid not in existing_by_id:
            merged[sid] = feature
            n_added += 1

    print(f"  Updated (same ID, fresher data):    {n_updated}")
    print(f"  Kept unchanged (not in new scrape): {n_kept}")
    print(f"  Added new (not in existing):        {n_added}")
    print(f"  Total spots after merge:            {len(merged)}")

    # Archive the current version before overwriting
    CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(LATEST_FILE, dated_output)
    print(f"\n  Archived current version to: {dated_output.name}")

    # Write merged result to latest
    merged_geojson = {
        "type": "FeatureCollection",
        "merged_at": datetime.now(timezone.utc).isoformat(),
        "total_spots": len(merged),
        "features": list(merged.values()),
    }
    with open(LATEST_FILE, "w", encoding="utf-8") as f:
        json.dump(merged_geojson, f, indent=2, ensure_ascii=False)

    print(f"  Updated latest: {LATEST_FILE.name}")
    print("\nNext step: run data_pipeline/scripts/generate_parking_polygons.py")


if __name__ == "__main__":
    main()
