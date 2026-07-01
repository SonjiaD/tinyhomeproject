# data_pipeline/

Scripts for collecting and processing parking data. Run these manually (or via GitHub Actions) to refresh the dataset.

## Workflow (in order)

```
1. scrape_spotangels.py       → output/spotangels_YYYY-MM-DD_HH-MM.geojson
2. compare_with_existing.py   → review report (read-only, no files written)
3. merge_data.py              → data/candidates/candidates_with_features.geojson
   (or add_manual_points.py, for patching a specific known coverage gap — see below)
4. generate_parking_polygons.py → data/polygons/parking_polygons_latest.geojson
```

## scripts/

| Script | What it does |
|--------|-------------|
| `scrape_spotangels.py` | Navigates SpotAngels via headless browser across a grid of Oakland, captures free parking spots. Saves checkpoints every 100 tiles so crashes don't lose progress. |
| `compare_with_existing.py` | Compares a new scrape against the existing candidates file. Read-only — prints an overlap report for manual review before merging. |
| `merge_data.py` | Merges a new scrape into `data/candidates/candidates_with_features.geojson`. New data overwrites by ID; existing spots not in the new scrape are kept. |
| `add_manual_points.py` | Patches a known coverage gap where the SpotAngels scrape has no listings despite real-world parking existing (e.g. informal/unregulated curb or RV parking a paid parking app wouldn't catalogue). Finds the target street's OSM edges, drops one candidate per block, and computes real `transit_dist`/`city_facility_dist` via live OSM/Overpass queries (the only two proximity fields shown in the UI). Add new streets to the `TARGET_STREETS` list in the script as new gaps are found. |
| `generate_parking_polygons.py` | Reads candidate points, snaps each to the nearest street edge, packs 30 ft × 10 ft parking rectangles. Outputs a dated file + updates `parking_polygons_latest.geojson`. |
| `fix_parking_polygons.py` | One-off utility for patching bad polygon data. |

## output/

Raw SpotAngels scrape files — gitignored (large, intermediate). Safe to delete after merging.

## config.py

Shared settings: Oakland bounding box, grid spacing, Playwright timeouts, checkpoint interval.
