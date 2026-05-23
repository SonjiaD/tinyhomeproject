"""
Merges a fresh SpotAngels scrape into backend/candidates_with_features.geojson.

Run this AFTER reviewing the compare_with_existing.py report.

- New scrape spots overwrite existing spots with the same ID (fresher data wins)
- Existing spots from other sources (govt/OSM) are preserved unchanged
- Prints a summary of what changed

Usage:
    python data_pipeline/scripts/merge_data.py [path/to/scrape.geojson]

If no path is given, uses the most recent file in data_pipeline/output/.
"""

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXISTING_FILE = ROOT / "data" / "candidates" / "candidates_with_features.geojson"
OUTPUT_DIR = ROOT / "data_pipeline" / "output"


def load_geojson(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_latest_scrape():
    files = sorted(OUTPUT_DIR.glob("spotangels_*.geojson"), reverse=True)
    if not files:
        print("No scrape output found in data_pipeline/output/. Run scrape_spotangels.py first.")
        sys.exit(1)
    return files[0]


def main():
    scrape_path = Path(sys.argv[1]) if len(sys.argv) > 1 else get_latest_scrape()

    print(f"Merging: {scrape_path.name}")
    print(f"Into:    {EXISTING_FILE}\n")

    new_data = load_geojson(scrape_path)
    existing_data = load_geojson(EXISTING_FILE)

    new_by_id = {str(f["properties"]["id"]): f for f in new_data["features"]}
    existing_by_id = {str(f["properties"]["id"]): f for f in existing_data["features"]}

    n_updated = 0
    n_added = 0
    n_kept = 0

    merged = {}

    # Keep all existing spots, overwrite with new scrape data where IDs match
    for sid, feature in existing_by_id.items():
        if sid in new_by_id:
            merged[sid] = new_by_id[sid]
            n_updated += 1
        else:
            merged[sid] = feature
            n_kept += 1

    # Add truly new spots that weren't in the existing file at all
    for sid, feature in new_by_id.items():
        if sid not in existing_by_id:
            merged[sid] = feature
            n_added += 1

    print(f"  Updated (same ID, fresher data):  {n_updated}")
    print(f"  Kept unchanged (not in new scrape): {n_kept}")
    print(f"  Added new (not in existing):        {n_added}")
    print(f"  Total spots after merge:            {len(merged)}")

    # Back up the existing file before overwriting
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    backup_path = OUTPUT_DIR / f"candidates_backup_{timestamp}.geojson"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(EXISTING_FILE, backup_path)
    print(f"\n  Backup saved to: {backup_path.name}")

    # Write merged result
    merged_geojson = {
        "type": "FeatureCollection",
        "merged_at": datetime.now(timezone.utc).isoformat(),
        "total_spots": len(merged),
        "features": list(merged.values()),
    }
    with open(EXISTING_FILE, "w", encoding="utf-8") as f:
        json.dump(merged_geojson, f, indent=2, ensure_ascii=False)

    print(f"  Written to: {EXISTING_FILE.name}")
    print("\nNext step: re-run backend/generate_parking_polygons.py to regenerate parking polygons.")


if __name__ == "__main__":
    main()
