#!/usr/bin/env python3
"""
generate_parking_polygons.py

One-time preprocessing script. Run from the backend/ directory:
    python generate_parking_polygons.py

Outputs: backend/parking_polygons.geojson

For each Oakland street edge that has a candidate parking point within 20 m,
packs as many 30 ft x 10 ft (9.14 m x 3.05 m) rectangles as possible.

Setback applied (California Daylighting Law AB 413 / CVC §22500):
  - 20 ft (6.10 m) from each block end (intersection / crosswalk clearance)
"""

import json
import math
import os
import sys

import geopandas as gpd
from shapely.geometry import LineString, Polygon

try:
    import osmnx as ox
except ImportError:
    print("ERROR: osmnx is not installed. Run: pip install osmnx")
    sys.exit(1)

# ── Constants ──────────────────────────────────────────────────────────────────
SPOT_LENGTH  = 9.144   # 30 ft in metres (length along the kerb)
SPOT_WIDTH   = 3.048   # 10 ft in metres (width into the road)
END_SETBACK  = 6.096   # 20 ft — California daylighting law (CVC §22500 / AB 413)
               #          No parking within 20 ft of any crosswalk / intersection
SNAP_RADIUS  = 20.0    # Max distance (m) to snap a candidate point to a street edge
UTM_CRS      = 26910   # EPSG for UTM Zone 10N — metric operations
WGS84_CRS    = 4326


# ── Helpers ────────────────────────────────────────────────────────────────────

def edge_bearing(line: LineString) -> float:
    """Bearing of a LineString in degrees (east = 0, counter-clockwise)."""
    coords = list(line.coords)
    dx = coords[-1][0] - coords[0][0]
    dy = coords[-1][1] - coords[0][1]
    return math.degrees(math.atan2(dy, dx))


def make_rectangle(cx: float, cy: float, length: float, width: float, bearing: float) -> Polygon:
    """Rectangle centred at (cx, cy), oriented to bearing (east = 0°)."""
    hl, hw = length / 2.0, width / 2.0
    rad = math.radians(bearing)
    cos_b, sin_b = math.cos(rad), math.sin(rad)
    local = [(-hl, -hw), (hl, -hw), (hl, hw), (-hl, hw)]
    return Polygon([
        (cx + lx * cos_b - ly * sin_b, cy + lx * sin_b + ly * cos_b)
        for lx, ly in local
    ])


def pack_centres(seg_len: float) -> list:
    """
    Return along-segment centre positions for parking spots.

    Valid parking zone: [END_SETBACK, seg_len - END_SETBACK]
    Spots are placed end-to-end (SPOT_LENGTH apart) within that zone.
    Returns empty list if the zone is shorter than one spot.
    """
    zone_start = END_SETBACK
    zone_end   = seg_len - END_SETBACK
    if zone_end - zone_start < SPOT_LENGTH:
        return []
    centres = []
    pos = zone_start + SPOT_LENGTH / 2.0
    while pos + SPOT_LENGTH / 2.0 <= zone_end:
        centres.append(pos)
        pos += SPOT_LENGTH
    return centres


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates_path = os.path.join(script_dir, "candidates_with_features.geojson")
    output_path     = os.path.join(script_dir, "parking_polygons.geojson")

    # 1. Load candidate points ──────────────────────────────────────────────────
    print("Loading candidate points …")
    cands = gpd.read_file(candidates_path).to_crs(UTM_CRS)
    print(f"  {len(cands):,} candidates loaded")

    # 2. Download Oakland street network ────────────────────────────────────────
    print("Downloading Oakland street network from OSM (may take ~30 s) …")
    G = ox.graph_from_place("Oakland, California, USA", network_type="drive")
    edges = ox.graph_to_gdfs(G, nodes=False).reset_index().to_crs(UTM_CRS)
    print(f"  {len(edges):,} street edges downloaded")

    # 3. Snap each candidate to its nearest street edge ─────────────────────────
    print("Snapping candidates to nearest edges …")
    edges_slim = edges[["geometry"]].copy()
    joined = gpd.sjoin_nearest(
        cands, edges_slim,
        how="left",
        max_distance=SNAP_RADIUS,
        distance_col="_snap_d",
    )
    assigned = joined.dropna(subset=["index_right"])
    active_indices = assigned["index_right"].astype(int).unique()
    print(f"  {len(active_indices):,} street edges have candidate points")

    # 4. Pack rectangles along each active edge ─────────────────────────────────
    print("Packing parking spots …")
    features = []
    total = 0
    skipped_short = 0

    for edge_idx in active_indices:
        edge_row = edges.iloc[edge_idx]
        geom = edge_row.geometry

        # Use longest piece if MultiLineString
        if geom.geom_type == "MultiLineString":
            geom = max(geom.geoms, key=lambda g: g.length)
        if geom.geom_type != "LineString":
            continue

        seg_len = geom.length
        centres = pack_centres(seg_len)
        if not centres:
            skipped_short += 1
            continue

        bearing = edge_bearing(geom)

        # Metadata from the nearest candidate on this edge
        cands_here = assigned[assigned["index_right"] == edge_idx]
        if cands_here.empty:
            continue
        ref = cands_here.iloc[0]

        for i, dist in enumerate(centres):
            pt = geom.interpolate(dist)
            rect_utm = make_rectangle(pt.x, pt.y, SPOT_LENGTH, SPOT_WIDTH, bearing)

            # Reproject to WGS84
            rect_wgs = (
                gpd.GeoDataFrame(geometry=[rect_utm], crs=UTM_CRS)
                .to_crs(WGS84_CRS)
                .geometry.iloc[0]
            )

            # GeoJSON requires closed rings: first point == last point
            exterior = list(rect_wgs.exterior.coords)  # [(lon, lat), ..., (lon, lat)]
            ring = [[lon, lat] for lon, lat in exterior]
            if ring[0] != ring[-1]:
                ring.append(ring[0])

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [ring],
                },
                "properties": {
                    "id":           f"{ref['id']}_{i}",
                    "parent_id":    str(ref["id"]),
                    "address":      str(ref.get("address", "")),
                    "spot_index":   i,
                    "bearing_deg":  round(bearing, 2),
                    "transit_dist": float(ref.get("transit_dist") or 0),
                    "water_infrastructure_dist": float(ref.get("water_infrastructure_dist") or 0),
                    "city_facility_dist":        float(ref.get("city_facility_dist") or 0),
                    "homeless_service_dist":     float(ref.get("homeless_service_dist") or 0),
                },
            })
            total += 1

    # 5. Write GeoJSON ───────────────────────────────────────────────────────────
    collection = {
        "type": "FeatureCollection",
        "total_spots": total,
        "features": features,
    }
    with open(output_path, "w") as f:
        json.dump(collection, f, separators=(",", ":"))

    print(f"\n  Skipped {skipped_short:,} edges too short for even one spot")
    print(f"\nDone! {total:,} parking spots written to {output_path}")


if __name__ == "__main__":
    main()
