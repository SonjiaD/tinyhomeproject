"""
Compares a fresh SpotAngels scrape against the existing candidates_with_features.geojson.

Run this BEFORE merge_data.py to review overlap and sanity-check the new data.
Prints a report — does not write any files.

Usage:
    python data_pipeline/scripts/compare_with_existing.py [path/to/scrape.geojson]

If no path is given, uses the most recent file in data_pipeline/output/.
"""

import json
import random
import sys
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

    print(f"Scrape file:   {scrape_path.name}")
    print(f"Existing file: {EXISTING_FILE.name}\n")

    new_data = load_geojson(scrape_path)
    existing_data = load_geojson(EXISTING_FILE)

    new_spots = {str(f["properties"]["id"]): f for f in new_data["features"]}
    existing_features = existing_data["features"]

    # Existing spots that look like SpotAngels IDs (large integers)
    # Government/OSM data tends to have different ID formats or no ID
    existing_spotangels = {}
    existing_other = {}
    for f in existing_features:
        props = f.get("properties", {})
        spot_id = props.get("id")
        if spot_id and str(spot_id).isdigit() and int(str(spot_id)) > 100000:
            existing_spotangels[str(spot_id)] = f
        else:
            existing_other[str(spot_id)] = f

    # Compute overlap
    overlap_ids = set(new_spots.keys()) & set(existing_spotangels.keys())
    only_in_new = set(new_spots.keys()) - set(existing_spotangels.keys())
    only_in_existing = set(existing_spotangels.keys()) - set(new_spots.keys())

    overlap_pct = (
        len(overlap_ids) / len(existing_spotangels) * 100
        if existing_spotangels
        else 0
    )

    print("=" * 55)
    print("OVERLAP REPORT")
    print("=" * 55)
    print(f"New scrape spots:                  {len(new_spots):>6}")
    print(f"Existing file total:               {len(existing_features):>6}")
    print(f"  - SpotAngels-sourced (large IDs):{len(existing_spotangels):>6}")
    print(f"  - Other sources (govt/OSM):      {len(existing_other):>6}")
    print()
    print(f"Overlapping IDs (in both):         {len(overlap_ids):>6}  ({overlap_pct:.1f}% of existing SpotAngels spots)")
    print(f"New spots not in existing:         {len(only_in_new):>6}  (spots manual process missed)")
    print(f"Existing SpotAngels not in new:    {len(only_in_existing):>6}  (may have been removed/changed)")
    print("=" * 55)

    if overlap_pct < 40:
        print("\nWARNING: Overlap is lower than expected (<40%).")
        print("This could mean the scraper missed a large area, or the existing")
        print("data came from a different source than SpotAngels. Review before merging.\n")
    elif overlap_pct >= 60:
        print("\nOverlap looks healthy. Safe to proceed with merge.\n")
    else:
        print("\nOverlap is moderate. Review the spot-check below before merging.\n")

    # Spot-check: print 10 random new spots for manual verification
    sample = random.sample(list(new_spots.values()), min(10, len(new_spots)))
    print("SPOT-CHECK — 10 random new spots (verify a few at spotangels.com/map#id=<ID>):")
    print("-" * 55)
    for f in sample:
        p = f["properties"]
        coords = f["geometry"]["coordinates"]
        print(f"  id={p['id']}  |  {p['address']}")
        print(f"    {p['name']}  |  max_stay={p['max_stay']}")
        print(f"    lat={coords[1]:.5f}, lng={coords[0]:.5f}")
        print(f"    -> spotangels.com/map?lat={coords[1]}&lng={coords[0]}&zoom=17&product=parking#id={p['id']}")
        print()

    # Show a sample of spots only in existing (missing from new scrape)
    if only_in_existing:
        sample_missing = random.sample(list(only_in_existing), min(5, len(only_in_existing)))
        print(f"SAMPLE — {len(only_in_existing)} spots in existing but NOT in new scrape:")
        print("-" * 55)
        for sid in sample_missing:
            p = existing_spotangels[sid]["properties"]
            print(f"  id={sid}  |  {p.get('address', '?')}  |  {p.get('name', '?')}")
        print()


if __name__ == "__main__":
    main()
