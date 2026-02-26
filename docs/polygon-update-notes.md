# Technical Notes: Polygon Visualization Update

## Problem Statement
Manager requested a map showing parking spots as **polygon rectangles** (not just dots) to better visualize parklet footprints, plus a total count of spots.

## Data Source Analysis
- **Input**: SpotAngel parking data in `candidates_with_features.geojson` with 5,142 Point geometries
- **Question raised**: Do we need to filter spots near stop signs, fire hydrants, intersections?
- **Conclusion**: SpotAngel is a parking app that maps *legal* parking spots — it almost certainly already excludes illegal areas. Stop sign filtering would be redundant.

## Parking Spot Dimensions
- Researched California Vehicle Code standards for parallel parking
- **Width**: 2.4m (8 feet) — standard in California
- **Length**: 5.5m (18 feet) — minimum for parallel parking
- These are codified in `generate_parking_polygons.py` as `SPOT_WIDTH` and `SPOT_LENGTH`

## Rectangle Orientation
- **Ideal approach**: Query OSM Overpass API for each spot to get the bearing of the nearest street segment, then rotate the rectangle perpendicular to the street
- **Trade-off**: Querying OSM for 5,142 spots would take hours (each query ~1-2 seconds)
- **Decision**: Use "quick mode" with default north-south orientation for initial implementation
- **Future option**: The script supports `--use_osm_bearings` flag if accurate orientation is needed for a subset

## Coordinate System Handling
- GeoJSON uses WGS84 (EPSG:4326) — degrees, not meters
- Parking dimensions are in meters
- **Solution**: Convert meters to approximate degrees at Oakland's latitude:
  - 1° latitude ≈ 111,320 meters
  - 1° longitude ≈ 111,320 × cos(latitude) meters
- Centroids calculated in UTM Zone 10N (EPSG:26910) for accuracy, then converted back to WGS84

## API Response Size
- Each polygon has 5 coordinate pairs (rectangle corners + closing point)
- Ranked view shows top 500 sites = 2,500 coordinate pairs
- Default map shows all 5,142 sites = ~25,700 coordinate pairs
- **Acceptable**: JSON payload is manageable, no pagination needed

## Frontend Rendering
- Switched from `CircleMarker` to `Polygon` component in react-leaflet
- Polygon `positions` prop accepts `[[lat, lon], ...]` arrays directly
- Legend updated to show rectangles instead of circles

## Files Structure
- **Kept both GeoJSON files** in repo:
  - `candidates_with_features.geojson` — original point data (preserved)
  - `parking_polygons.geojson` — generated polygon data (new)
- **Script**: `generate_parking_polygons.py` can regenerate polygons if dimensions or logic changes

## Summary Stats
| Metric | Value |
|--------|-------|
| Total parklet spots | 5,142 |
| Spot dimensions | 2.4m × 5.5m |
| Total parking area | 67,713 m² |
| Orientation | North-south (default) |

## Files Changed
- `backend/generate_parking_polygons.py` — new script to convert points to polygons
- `backend/parking_polygons.geojson` — generated polygon data
- `backend/app.py` — loads polygon data, returns coordinates in API
- `frontend/src/components/SiteMap.tsx` — renders Polygon instead of CircleMarker
- `frontend/src/pages/HomePage.tsx` — updated Site type to include polygon
