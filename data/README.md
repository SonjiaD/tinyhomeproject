# data/

Committed data files used by the backend and data pipeline.

---

## candidates/

`candidates_with_features.geojson` — master list of free street parking locations.

- ~5,100 Points (one per street location)
- Sources: SpotAngels scrape + government/OSM data, merged together
- Each point has proximity features attached: distance to transit, water infrastructure, city facilities, homeless services
- Updated by running `data_pipeline/scripts/merge_data.py` after a new scrape

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
        +  government / OSM sources
        ↓  merge_data.py
data/candidates/candidates_with_features.geojson
        ↓  generate_parking_polygons.py
data/polygons/parking_polygons_latest.geojson
        ↓  backend /api/polygon_map
frontend map (the colored parking rectangles you see on the site)
```
