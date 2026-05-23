"""
One-time script to close GeoJSON rings in parking_polygons_latest.geojson.
Each ring currently has 4 unique corners but is missing the closing duplicate
point required by RFC 7946. This script appends ring[0] to the end of each
ring, making them valid closed linear rings.

Run once from any directory:
    python data_pipeline/scripts/fix_parking_polygons.py
"""

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GEOJSON_PATH = ROOT / "data" / "polygons" / "parking_polygons_latest.geojson"

def fix_rings(path):
    print(f"Loading {path} ...")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    fixed = 0
    already_closed = 0

    for feature in features:
        coords = feature["geometry"]["coordinates"]
        for i, ring in enumerate(coords):
            if ring[0] != ring[-1]:
                ring.append(ring[0])
                fixed += 1
            else:
                already_closed += 1

    print(f"Fixed {fixed} open rings, {already_closed} were already closed.")
    print(f"Writing back to {path} ...")

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    print("Done.")

if __name__ == "__main__":
    fix_rings(GEOJSON_PATH)
