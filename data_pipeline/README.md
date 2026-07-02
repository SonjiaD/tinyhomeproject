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

Steps 3 and 4 each write a run record to `data/runs/<timestamp>_<script>/` right
after updating their `_latest` file — see "Run history" below.

## Periodic OSM proximity-field refresh (independent of the workflow above)

```
5. fetch_osm_features.py      → data/features/*.geojson (5 category layers)
6. compute_spot_distances.py  → data/polygons/parking_polygons_latest.geojson
   (recomputes transit_dist and city_facility_dist per INDIVIDUAL spot, not per shared
   block-level candidate — see the script's docstring for why this distinction matters)
```

This only needs to be re-run periodically to keep OSM coverage fresh, or after step 4
above produces new/changed spots (step 4's overlap guards can drop or shift spots, so
distances need recomputing against whatever spot set actually resulted). It does not
touch `data/candidates/`.

## Run history

`merge_data.py`, `generate_parking_polygons.py`, and `compute_spot_distances.py` each
write to `data/runs/<timestamp>_<script_name>/` right after updating their committed
`_latest` file: a snapshot of what they wrote (local-only, gitignored) plus a
`manifest.yaml` (committed) with counts and a diff against that same script's previous
run. See `data/README.md`'s "Versioning" section for the full shape. Pass `--notes
"..."` to any of the three to record why a run was made.

## scripts/

| Script | What it does |
|--------|-------------|
| `scrape_spotangels.py` | Navigates SpotAngels via headless browser across a grid of Oakland, captures free parking spots. Saves checkpoints every 100 tiles so crashes don't lose progress. |
| `compare_with_existing.py` | Compares a new scrape against the existing candidates file. Read-only — prints an overlap report for manual review before merging. |
| `merge_data.py` | Merges a new scrape into `data/candidates/candidates_with_features.geojson`. New data overwrites by ID; existing spots not in the new scrape are kept. Then spatially dedupes: points from different sources within 8m of each other at the same address are collapsed to one, since id-based merging can't catch duplicates across sources that never shared an id. |
| `add_manual_points.py` | Patches a known coverage gap where the SpotAngels scrape has no listings despite real-world parking existing (e.g. informal/unregulated curb or RV parking a paid parking app wouldn't catalogue). Finds the target street's OSM edges, drops one candidate per block, and computes real `transit_dist`/`city_facility_dist` via live OSM/Overpass queries. Add new streets to the `TARGET_STREETS` list in the script as new gaps are found. |
| `generate_parking_polygons.py` | Reads candidate points, snaps each to the nearest street edge, packs 30 ft × 10 ft parking rectangles. Drops duplicate directional OSM edges (a two-way street appears twice, once per direction) before packing, and skips any rectangle that would overlap one already placed on the same edge — guards against streets that curve back near themselves (e.g. hillside hairpins/switchbacks), where two along-curve-distant positions can land physically on top of each other. Updates `parking_polygons_latest.geojson`. |
| `fetch_osm_features.py` | Queries Overpass (via osmnx) for 5 proximity categories with a genuine OSM-tag equivalent (transit stops, parks, water fountains, streams, grocery stores) across the full Oakland bbox. Dedupes by OSM element id, then by ~15m proximity (except streams — linear features, nearby segments are legitimately distinct). Saves one GeoJSON per category to `data/features/`. |
| `compute_spot_distances.py` | Reads `data/features/*.geojson` + `data/polygons/parking_polygons_latest.geojson`. Computes `transit_dist`, `city_facility_dist`, `water_fountain_dist`, `streams_oakland_dist`, and `grocery_dist` for every *individual* parking spot, using each spot's own location rather than the shared parent candidate's. Only `transit_dist`/`city_facility_dist` are currently used by the frontend; the other 3 are computed but not yet wired in. `water_infrastructure_dist`/`homeless_service_dist` (no OSM equivalent) are left untouched. |
| `fix_parking_polygons.py` | One-off utility for patching bad polygon data. |
| `run_history.py` | Shared helper (not a standalone script) used by the three scripts above to write `data/runs/` snapshots and manifests. |

## output/

Raw SpotAngels scrape files — gitignored (large, intermediate). Safe to delete after merging.

## config.py

Shared settings: Oakland bounding box, grid spacing, Playwright timeouts, checkpoint interval.
