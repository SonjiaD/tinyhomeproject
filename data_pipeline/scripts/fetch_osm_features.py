"""
Fetches live OSM/Overpass feature layers for the 5 proximity categories that have a
genuine OSM-tag equivalent (transit, parks, water fountains, streams, grocery), across
the full Oakland bounding box, and saves each as its own deduplicated GeoJSON file under
data/features/.

This is step 1 of 2 for refreshing distance fields. Step 2 is compute_spot_distances.py,
which reads these files + data/polygons/parking_polygons_latest.geojson and computes
transit_dist, city_facility_dist, water_fountain_dist, streams_oakland_dist, and the new
grocery_dist for every individual parking spot (not the shared block-level candidate).

Why this exists: the 13 original proximity fields in candidates_with_features.geojson
were computed from City of Oakland government GIS layers not available in this repo (see
data/README.md). Of those 13, only 4 have a real, accurate OSM-tag equivalent — those are
the ones refreshed here, plus 1 brand-new field (grocery_dist) with no legacy equivalent
at all. The other 8 fields (general_plan_dist, wildfire_dist, public_housing_dist,
assisted_housing_dist, mobile_vending_dist, sewer_collection_dist,
water_infrastructure_dist, man_water_dist) have no OSM equivalent and are left untouched
by this pipeline stage.

Usage:
    python data_pipeline/scripts/fetch_osm_features.py [--category CATEGORY]

    --category is optional; omit to fetch all 5. Pass one of:
    transit, parks, water_fountains, streams, grocery
    (useful for retrying a single category that failed/timed out without re-querying
    the rest).

Outputs:
    data/features/transit_stops.geojson       (latest)
    data/features/parks.geojson                (latest)
    data/features/water_fountains.geojson      (latest)
    data/features/streams.geojson              (latest)
    data/features/grocery_stores.geojson       (latest)
    data/features/archive/{category}_YYYY-MM-DD_HH-MM.geojson  (dated, gitignored)

Rerun this script periodically to keep these categories fresh; it is idempotent —
rerunning archives the previous "latest" for each category, then fully overwrites it
with a fresh Overpass fetch.

Next step: run data_pipeline/scripts/compute_spot_distances.py
"""

import argparse
import json
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from data_pipeline.config import OAKLAND_NE, OAKLAND_SW

FEATURES_DIR = ROOT / "data" / "features"
ARCHIVE_DIR = FEATURES_DIR / "archive"
UTM_CRS = 26910          # UTM Zone 10N — matches generate_parking_polygons.py / add_manual_points.py
WGS84_CRS = 4326
DEDUP_RADIUS_M = 15.0    # collapse same-category features within this distance
RETRY_ATTEMPTS = 3
RETRY_BACKOFF_S = [5, 15, 45]

# osmnx.features_from_bbox wants (left, bottom, right, top) = (min_lng, min_lat, max_lng, max_lat).
# config.py stores (lat, lng) pairs, so reorder here.
OAKLAND_BBOX = (OAKLAND_SW[1], OAKLAND_SW[0], OAKLAND_NE[1], OAKLAND_NE[0])

# category -> (output filename, target distance field, OSM tags, skip proximity dedup)
CATEGORIES = {
    "transit": {
        "output": "transit_stops.geojson",
        "field": "transit_dist",
        "tags": {
            "highway": "bus_stop",
            "railway": ["stop", "station", "halt"],
            "public_transport": "stop_position",
        },
        "skip_proximity_dedup": False,
    },
    "parks": {
        "output": "parks.geojson",
        "field": "city_facility_dist",   # keeps existing field name — shown as "Parks" in the UI
        "tags": {
            "leisure": ["park", "garden"],
            "landuse": "recreation_ground",
        },
        "skip_proximity_dedup": False,
    },
    "water_fountains": {
        "output": "water_fountains.geojson",
        "field": "water_fountain_dist",
        "tags": {"amenity": "drinking_water"},
        "skip_proximity_dedup": False,
    },
    "streams": {
        "output": "streams.geojson",
        "field": "streams_oakland_dist",
        "tags": {"waterway": "stream"},
        # Stream segments are LineStrings frequently split at confluences/bridges —
        # two "nearby" segments are both legitimately real, not duplicates.
        "skip_proximity_dedup": True,
    },
    "grocery": {
        "output": "grocery_stores.geojson",
        "field": "grocery_dist",
        # Excludes shop=convenience — matches Google Maps' own categorization, which
        # treats convenience stores as a distinct type from grocery stores/supermarkets.
        "tags": {"shop": ["supermarket", "grocery"]},
        "skip_proximity_dedup": False,
    },
}


def fetch_category(tags: dict, bbox: tuple):
    import osmnx as ox

    last_err = None
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            gdf = ox.features_from_bbox(bbox, tags=tags)
            print(f"    Raw features returned: {len(gdf)}")
            return gdf
        except Exception as e:  # transient Overpass hiccups (timeouts, 504s, etc.)
            last_err = e
            if attempt < RETRY_ATTEMPTS:
                wait = RETRY_BACKOFF_S[attempt - 1]
                print(f"    Attempt {attempt} failed ({e}); retrying in {wait}s …")
                time.sleep(wait)
    raise RuntimeError(f"Overpass query failed after {RETRY_ATTEMPTS} attempts") from last_err


def dedup_by_element_id(gdf):
    """Defensive dedup by (element_type, osm_id) — should already be unique via osmnx's
    MultiIndex, but assert/enforce it explicitly rather than assuming."""
    before = len(gdf)
    gdf = gdf[~gdf.index.duplicated(keep="first")]
    removed = before - len(gdf)
    if removed:
        print(f"    Removed {removed} exact (element,id) duplicate(s)")
    return gdf


def dedup_by_proximity(gdf, utm_crs: int, radius_m: float):
    """Collapse features of the same category that are within radius_m of each other
    (in UTM meters) into a single representative feature, using union-find over a
    self-spatial-join. Two elements are considered the same real-world feature if their
    representative points (centroids for polygons/lines, the point itself for nodes) are
    within radius_m of one another — transitively, so chains of near-duplicates all
    merge into one cluster.

    Tie-break when collapsing a cluster to one row: prefer polygon/way geometry over
    point/node (a polygon represents the feature's real footprint), then the element
    with the most non-null tags.
    """
    import geopandas as gpd

    if gdf.empty:
        return gdf

    gdf = gdf.reset_index()  # element/id become normal columns

    centroids_utm = gdf.to_crs(utm_crs).geometry.centroid
    pts = gpd.GeoDataFrame({"_pos": range(len(gdf))}, geometry=centroids_utm.values, crs=utm_crs)

    buffered = pts.copy()
    buffered["geometry"] = buffered.geometry.buffer(radius_m)
    pairs = gpd.sjoin(pts, buffered[["geometry"]], predicate="within", how="inner", rsuffix="right")

    # Union-find over the pairs to build connected components (clusters of near-duplicates)
    parent = list(range(len(pts)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    right_col = "index_right" if "index_right" in pairs.columns else "_pos_right"
    for left_pos, right_pos in zip(pairs["_pos"], pairs[right_col]):
        union(left_pos, right_pos)

    clusters = {}
    for i in range(len(pts)):
        clusters.setdefault(find(i), []).append(i)

    print(f"    {len(gdf)} elements -> {len(clusters)} distinct features after "
          f"{radius_m:.0f}m proximity dedup")

    def tag_richness(row):
        return sum(1 for v in row.values if v is not None and v == v)  # non-null, non-NaN

    keep_positions = []
    multi_clusters = []
    for member_positions in clusters.values():
        if len(member_positions) == 1:
            keep_positions.append(member_positions[0])
            continue
        multi_clusters.append(member_positions)
        candidates = gdf.iloc[member_positions]
        non_point = candidates[candidates.geometry.geom_type != "Point"]
        pool = non_point if not non_point.empty else candidates
        best_idx = pool.apply(tag_richness, axis=1).idxmax()
        keep_positions.append(best_idx)

    if multi_clusters:
        print(f"    Merged clusters (element indices): {multi_clusters}")

    return gdf.loc[sorted(keep_positions)].reset_index(drop=True)


def save_category(name: str, gdf, field: str, output_name: str):
    FEATURES_DIR.mkdir(parents=True, exist_ok=True)
    out_path = FEATURES_DIR / output_name

    # Archive the existing "latest" file before overwriting (dated, gitignored).
    if out_path.exists():
        ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
        start_tag = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M")
        stem = Path(output_name).stem
        archived = ARCHIVE_DIR / f"{stem}_{start_tag}.geojson"
        shutil.copy2(out_path, archived)
        print(f"    Archived previous version to: archive/{archived.name}")

    gdf_wgs = gdf.to_crs(WGS84_CRS) if gdf.crs != WGS84_CRS else gdf
    geojson = json.loads(gdf_wgs.to_json())
    geojson["fetched_at"] = datetime.now(timezone.utc).isoformat()
    geojson["source"] = "OpenStreetMap via Overpass API (osmnx.features_from_bbox)"
    geojson["category"] = name
    geojson["target_field"] = field
    geojson["total_features"] = len(gdf_wgs)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2, ensure_ascii=False)
    print(f"    Saved {len(gdf_wgs)} deduplicated feature(s) -> {out_path.relative_to(ROOT)}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", choices=list(CATEGORIES.keys()), default=None,
                         help="Fetch only one category (default: fetch all 5)")
    args = parser.parse_args()

    targets = [args.category] if args.category else list(CATEGORIES.keys())

    print(f"Fetching OSM features for Oakland bbox: {OAKLAND_BBOX}")
    print(f"Categories: {', '.join(targets)}\n")

    for i, name in enumerate(targets, 1):
        spec = CATEGORIES[name]
        print(f"[{i}/{len(targets)}] {name} ({spec['field']})")

        gdf = fetch_category(spec["tags"], OAKLAND_BBOX)
        gdf = dedup_by_element_id(gdf)
        if spec["skip_proximity_dedup"]:
            print("    Skipping proximity dedup (linear features — nearby segments are "
                  "legitimately distinct).")
        else:
            gdf = dedup_by_proximity(gdf, UTM_CRS, DEDUP_RADIUS_M)

        save_category(name, gdf, spec["field"], spec["output"])

        if i < len(targets):
            time.sleep(2)  # be polite to the shared Overpass instance between categories

        print()

    print("Done. Next step: run data_pipeline/scripts/compute_spot_distances.py")


if __name__ == "__main__":
    main()
