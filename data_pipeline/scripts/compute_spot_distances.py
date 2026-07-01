"""
Computes transit_dist, city_facility_dist, water_fountain_dist, streams_oakland_dist,
and grocery_dist (new) for every INDIVIDUAL parking spot in
data/polygons/parking_polygons_latest.geojson (84,474 spots), using the fresh OSM feature
layers saved by fetch_osm_features.py under data/features/.

This is step 2 of 2. Run fetch_osm_features.py first.

Why this operates on the polygons file, not the candidates file: generate_parking_polygons.py
packs many individual 30x10 ft spots along each street block from a single candidate point
(~8,967 candidates -> 84,474 spots, ~9.4 spots per block on average) and copies that one
parent candidate's distance values onto every spot generated from it. On a long block, a
spot at one end and a spot 90m away would show identical "distance to transit" — inaccurate.
Computing these 5 fields against each spot's own location (not the shared block-level
candidate) fixes that, and the result is written onto the file actually served to the map
(/api/polygon_map), not the candidates file.

data/candidates/candidates_with_features.geojson is NOT touched by this script. Its 13
fields stay exactly as they are, at block level, feeding the (deprecated but unmodified)
AHP/WSM ranking pages.

water_infrastructure_dist and homeless_service_dist — the other 2 fields
generate_parking_polygons.py copies onto polygon properties — have no OSM equivalent and
are left completely untouched (verified via an exact-equality check before writing).

Usage:
    python data_pipeline/scripts/compute_spot_distances.py

Outputs:
    data/polygons/parking_polygons_YYYY-MM-DD_HH-MM.geojson  (dated archive, gitignored)
    data/polygons/parking_polygons_latest.geojson             (latest, committed — what /api/polygon_map serves)
"""

import json
import shutil
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

POLYGONS_DIR = ROOT / "data" / "polygons"
LATEST_FILE = POLYGONS_DIR / "parking_polygons_latest.geojson"
FEATURES_DIR = ROOT / "data" / "features"
UTM_CRS = 26910

# feature layer filename -> distance field it feeds
FEATURE_SOURCES = {
    "transit_stops.geojson":   "transit_dist",
    "parks.geojson":           "city_facility_dist",
    "water_fountains.geojson": "water_fountain_dist",
    "streams.geojson":         "streams_oakland_dist",
    "grocery_stores.geojson":  "grocery_dist",
}

# Fields already on each polygon with no OSM equivalent — must come out byte-for-byte
# identical to the input.
UNTOUCHED_FIELDS = ["water_infrastructure_dist", "homeless_service_dist"]


def nearest_distances_m(points_gdf, features_gdf, utm_crs):
    """Distance in meters from each point to its nearest feature. Returns a list of
    floats, or a list of `None` if `features_gdf` is empty. Polygons/lines are reduced
    to their centroid first — fine for point-like categories (parks, grocery, transit,
    water fountains) at city scale. (Verbatim from add_manual_points.py.)"""
    import geopandas as gpd

    if features_gdf.empty:
        return [None] * len(points_gdf)

    pts_utm = points_gdf.to_crs(utm_crs)
    feats_utm = features_gdf.to_crs(utm_crs)
    feats_utm = feats_utm[feats_utm.geometry.notnull()]
    feats_utm["geometry"] = feats_utm.geometry.centroid

    joined = gpd.sjoin_nearest(pts_utm, feats_utm[["geometry"]], how="left", distance_col="_d")
    joined = joined[~joined.index.duplicated(keep="first")]
    return joined.loc[points_gdf.index, "_d"].tolist()


def nearest_distances_m_precise(points_gdf, features_gdf, utm_crs):
    """Like nearest_distances_m, but does NOT collapse features to centroids first —
    used for streams.geojson, where features are LineStrings and reducing to a centroid
    would distort distance for long/curved segments. sjoin_nearest computes true
    nearest-point-on-geometry distance directly for any geometry type."""
    import geopandas as gpd

    if features_gdf.empty:
        return [None] * len(points_gdf)

    pts_utm = points_gdf.to_crs(utm_crs)
    feats_utm = features_gdf.to_crs(utm_crs)
    feats_utm = feats_utm[feats_utm.geometry.notnull()]

    joined = gpd.sjoin_nearest(pts_utm, feats_utm[["geometry"]], how="left", distance_col="_d")
    joined = joined[~joined.index.duplicated(keep="first")]
    return joined.loc[points_gdf.index, "_d"].tolist()


def load_feature_layer(filename):
    import geopandas as gpd
    path = FEATURES_DIR / filename
    if not path.exists():
        print(f"  WARNING: {path} not found. Run fetch_osm_features.py first.")
        return None
    return gpd.read_file(path)


def main():
    import geopandas as gpd

    print("Loading existing parking spot polygons …")
    with open(LATEST_FILE, encoding="utf-8") as f:
        existing_data = json.load(f)
    existing_features = existing_data["features"]
    print(f"  {len(existing_features)} individual spots loaded")

    # Snapshot the untouched fields before mutating anything.
    before_untouched = [
        {field: f["properties"].get(field) for field in UNTOUCHED_FIELDS}
        for f in existing_features
    ]

    # Each spot is a rectangle polygon — use its centroid (computed in UTM meters, not
    # WGS84 degrees, to avoid geopandas' geographic-CRS centroid warning) as the spot's
    # exact location.
    spots_full_gdf = gpd.GeoDataFrame.from_features(existing_features, crs=4326)
    spot_gdf = gpd.GeoDataFrame(
        {"_idx": range(len(existing_features))},
        geometry=spots_full_gdf.to_crs(UTM_CRS).geometry.centroid,
        crs=UTM_CRS,
    )

    # Keep transit_dist/city_facility_dist "before" values (block-level copies) for the
    # distribution comparison printed below.
    before_block_level = {
        field: [f["properties"].get(field) for f in existing_features]
        for field in ("transit_dist", "city_facility_dist")
    }

    computed = {}
    for filename, field in FEATURE_SOURCES.items():
        print(f"\nComputing {field} from {filename} …")
        layer = load_feature_layer(filename)
        if layer is None:
            computed[field] = [None] * len(existing_features)
            continue

        if filename == "streams.geojson":
            dists = nearest_distances_m_precise(spot_gdf, layer, UTM_CRS)
        else:
            dists = nearest_distances_m(spot_gdf, layer, UTM_CRS)

        computed[field] = dists
        valid = [d for d in dists if d is not None]
        if valid:
            print(f"  {len(valid)}/{len(dists)} spots matched; "
                  f"min={min(valid):.1f}m max={max(valid):.1f}m mean={sum(valid)/len(valid):.1f}m")
            if field in before_block_level:
                old_valid = [d for d in before_block_level[field] if d is not None]
                if old_valid:
                    print(f"  (previous block-level-copied values: "
                          f"min={min(old_valid):.1f}m max={max(old_valid):.1f}m "
                          f"mean={sum(old_valid)/len(old_valid):.1f}m)")
        else:
            print("  WARNING: no features matched for this category — all values will be None.")

    # Hard-fail rather than silently writing nulls into the committed file.
    missing = {field: sum(1 for d in vals if d is None) for field, vals in computed.items()}
    if any(count > 0 for count in missing.values()):
        print("\nERROR: some spots have no computed distance for at least one field:")
        for field, count in missing.items():
            if count > 0:
                print(f"  {field}: {count} missing")
        print("Aborting without writing — investigate the missing feature layer(s) above.")
        sys.exit(1)

    # Apply computed fields; every other key (including the 2 untouched fields, id,
    # parent_id, address, spot_index, side, bearing_deg) is left as-is.
    for i, feature in enumerate(existing_features):
        for field in FEATURE_SOURCES.values():
            feature["properties"][field] = computed[field][i]

    # Integrity check: the 2 untouched fields must be exactly unchanged.
    for i, feature in enumerate(existing_features):
        for field in UNTOUCHED_FIELDS:
            if feature["properties"].get(field) != before_untouched[i][field]:
                print(f"ERROR: untouched field '{field}' changed for spot "
                      f"{feature['properties'].get('id')} — this should never happen. Aborting.")
                sys.exit(1)
    print("\nIntegrity check passed: water_infrastructure_dist and homeless_service_dist "
          "are byte-for-byte unchanged.")

    # Within-block variation check — proves the per-spot fix actually did something.
    by_parent = defaultdict(list)
    for f in existing_features:
        by_parent[f["properties"]["parent_id"]].append(f["properties"]["transit_dist"])
    multi_spot_blocks = {pid: vals for pid, vals in by_parent.items() if len(vals) > 5}
    varying = sum(1 for vals in multi_spot_blocks.values() if max(vals) - min(vals) > 1.0)
    print(f"\nWithin-block variation check: {varying}/{len(multi_spot_blocks)} blocks with "
          f"6+ spots now show transit_dist varying by more than 1m across their spots "
          f"(previously identical for every spot on a block).")

    # Archive current version before overwriting — same pattern as merge_data.py.
    start_tag = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M")
    dated_output = POLYGONS_DIR / f"parking_polygons_{start_tag}.geojson"
    POLYGONS_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(LATEST_FILE, dated_output)
    print(f"\nArchived current version to: {dated_output.name}")

    updated_geojson = {
        "type": "FeatureCollection",
        "total_spots": len(existing_features),
        "features": existing_features,
    }
    with open(LATEST_FILE, "w", encoding="utf-8") as f:
        json.dump(updated_geojson, f, indent=2, ensure_ascii=False)

    print(f"Computed {len(FEATURE_SOURCES)} fields for {len(existing_features)} individual spots.")
    print(f"Updated latest: {LATEST_FILE.name}")


if __name__ == "__main__":
    main()
