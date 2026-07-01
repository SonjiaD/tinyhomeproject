# data/

Committed data files used by the backend and data pipeline.

---

## candidates/

`candidates_with_features.geojson` — master list of free street parking locations.

- ~9,000 points (one per street location), blending three sources:
  1. **Originally, manually-collected government-source data** — gathered by hand from
     various City of Oakland / government sources early in the project. This was a one-time,
     external process; the raw source layers aren't committed to this repo and the distance
     features they produced (see below) can't be regenerated from anything in this repo alone.
  2. **The ongoing SpotAngels scrape** — refreshed via `scrape_spotangels.py` +
     `merge_data.py`.
  3. **Targeted manual patches** for known coverage gaps — added via
     `data_pipeline/scripts/add_manual_points.py` when a real-world parking area (e.g.
     informal/unregulated curb or RV parking) isn't captured by the scrape. Distance features
     for these points are computed fresh via live OSM/Overpass queries rather than the
     original (unavailable) source layers.
- Each point has proximity features attached: distance to transit, water infrastructure, city facilities, homeless services, and several others. Only `transit_dist` and `city_facility_dist` are shown in the main map UI (SitePanel's "Transit Access" and "Parks" amenity bars) — the rest feed the separate AHP/WSM ranking pages.
- Updated by running `data_pipeline/scripts/merge_data.py` after a new scrape, or
  `add_manual_points.py` when patching a specific known gap.

**Used by:** `backend/app.py` loads this at startup for the ranking/scoring API endpoints:
- `/api/ahp` — AHP pairwise comparison ranking
- `/api/wsm` — linear weighting ranking
- `/api/default_map` — default map with candidate dots

> The backend requires this file to start up even if the ranking pages are not actively shown to users. If it is missing, the server crashes on boot.

---

## polygons/

Generated parking spot rectangles — derived from `candidates/`, not collected directly.

- `parking_polygons_latest.geojson` — **the file the deployed website currently uses.** Committed to git so Render can access it.
- `parking_polygons_YYYY-MM-DD_HH-MM.geojson` — dated archive copies saved each time the script runs. Gitignored (local machine only, for rollback).

Each candidate point gets snapped to its nearest OSM street edge, then packed with 30 ft × 10 ft rectangles (one per physical parking space). These are what the map renders as colored boxes.

Each spot carries 4 proximity fields: `transit_dist`, `city_facility_dist`,
`water_infrastructure_dist`, `homeless_service_dist`. As of `compute_spot_distances.py`
(see `features/` below), `transit_dist` and `city_facility_dist` are computed **per
individual spot** — each spot's own exact location, not a value copied from its shared
parent candidate/block. `water_infrastructure_dist` and `homeless_service_dist` still
come from the block-level candidate (no OSM equivalent exists to recompute them more
precisely).

**Used by:** `backend/app.py` serves this via `/api/polygon_map`. The frontend fetches that endpoint to draw the parking rectangles on the map.

### Versioning (Docker `:latest` analogy)

| Concept | This project |
|---------|-------------|
| Versioned image (`myimage:2026-05-22`) | `parking_polygons_2026-05-22_08-30.geojson` |
| `:latest` tag | `parking_polygons_latest.geojson` |
| Artifactory (stores all versions) | `data/polygons/` on your local machine |
| What gets deployed | only `_latest` is committed to git |

To roll back: copy any dated file over `_latest` and commit it.

---

## features/

Raw OSM/Overpass feature layers, fetched via `data_pipeline/scripts/fetch_osm_features.py`.
These are the source data for the 2 per-spot-accurate proximity fields on `polygons/`
(plus 2 more categories not currently surfaced anywhere in the app — see below).

| File | OSM tags queried | Feeds field |
|------|------|------|
| `transit_stops.geojson` | `highway=bus_stop`, `railway=[stop,station,halt]`, `public_transport=stop_position` | `transit_dist` |
| `parks.geojson` | `leisure=[park,garden]`, `landuse=recreation_ground` | `city_facility_dist` (shown as "Parks" in the UI) |
| `water_fountains.geojson` | `amenity=drinking_water` | `water_fountain_dist` (not currently used by the frontend) |
| `streams.geojson` | `waterway=stream` | `streams_oakland_dist` (not currently used by the frontend) |
| `grocery_stores.geojson` | `shop=[supermarket, grocery]` (excludes `shop=convenience`, matching Google Maps' own categorization) | `grocery_dist` (new field — not yet surfaced in the UI) |

Each file is deduplicated: first by exact OSM `(element_type, id)` (defensive — osmnx
already guarantees this), then by collapsing features of the same category within ~15m
of each other into one representative feature (handles e.g. a park tagged as both a
polygon and a nearby entrance node). **Exception: streams are not proximity-deduped** —
stream segments are LineStrings frequently split at confluences/bridges, so nearby
segments are legitimately distinct, not duplicates.

Only the 5 "latest" files are committed; dated archives (`archive/YYYY-MM-DD_HH-MM/`)
are local-only, same convention as `candidates/` and `polygons/`. Rerun
`fetch_osm_features.py` periodically to keep these current — it's idempotent, fully
overwriting each category with a fresh Overpass fetch.

**Used by:** `data_pipeline/scripts/compute_spot_distances.py` reads these files +
`data/polygons/parking_polygons_latest.geojson`, and computes `transit_dist`,
`city_facility_dist`, `water_fountain_dist`, `streams_oakland_dist`, and `grocery_dist`
for every individual parking spot (not the shared block-level candidate — see why in the
script's docstring). Only `transit_dist` and `city_facility_dist` are written back into
`polygons/parking_polygons_latest.geojson` today; `water_fountain_dist`,
`streams_oakland_dist`, and `grocery_dist` are computed but not yet wired into the
frontend or the polygons file (a follow-up, not part of this pipeline).

Of the 13 original proximity fields, only these 5 have a genuine OSM-tag equivalent. The
other 8 (`general_plan_dist`, `wildfire_dist`, `public_housing_dist`,
`assisted_housing_dist`, `mobile_vending_dist`, `sewer_collection_dist`,
`water_infrastructure_dist`, `man_water_dist`) are Oakland-specific zoning/hazard/
utility/registry datasets with no OSM equivalent, and are left untouched wherever they
appear (`candidates/` and the 2 corresponding fields on `polygons/`).

---

## Data flow

```
data_pipeline/output/spotangels_*.geojson   (raw SpotAngels scrape)
        +  manually-collected government sources (one-time, original)
        +  live OSM/Overpass queries (for manual patches, e.g. Mandela Parkway)
        ↓  merge_data.py  /  add_manual_points.py
data/candidates/candidates_with_features.geojson
        ↓  generate_parking_polygons.py
data/polygons/parking_polygons_latest.geojson
        +  data/features/*.geojson  (live OSM/Overpass, full-city, periodic refresh)
        ↓  fetch_osm_features.py  →  compute_spot_distances.py
data/polygons/parking_polygons_latest.geojson  (transit_dist/city_facility_dist now per-spot-accurate)
        ↓  backend /api/polygon_map
frontend map (the colored parking rectangles you see on the site)
```
