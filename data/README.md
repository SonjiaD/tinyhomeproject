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

## Data flow

```
data_pipeline/output/spotangels_*.geojson   (raw SpotAngels scrape)
        +  manually-collected government sources (one-time, original)
        +  live OSM/Overpass queries (for manual patches, e.g. Mandela Parkway)
        ↓  merge_data.py  /  add_manual_points.py
data/candidates/candidates_with_features.geojson
        ↓  generate_parking_polygons.py
data/polygons/parking_polygons_latest.geojson
        ↓  backend /api/polygon_map
frontend map (the colored parking rectangles you see on the site)
```
