#!/usr/bin/env python3
"""
generate_parking_polygons.py

Run from any directory:
    python data_pipeline/scripts/generate_parking_polygons.py

Outputs:
    data/polygons/parking_polygons_YYYY-MM-DD_HH-MM.geojson  (dated archive)
    data/polygons/parking_polygons_latest.geojson             (latest tag — what the backend serves)

For each Oakland street edge that has a candidate parking point within 20 m,
packs as many 30 ft x 10 ft (9.14 m x 3.05 m) rectangles as possible.

Setback applied (California Daylighting Law AB 413 / CVC §22500):
  - 20 ft (6.10 m) from each block end (intersection / crosswalk clearance)
"""

import json
import math
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
START_TAG = datetime.now().strftime("%Y-%m-%d_%H-%M")

import geopandas as gpd
from shapely.geometry import LineString, Polygon

try:
    import osmnx as ox
except ImportError:
    print("ERROR: osmnx is not installed. Run: pip install osmnx")
    sys.exit(1)

def _safe_float(val, default=0.0):
    try:
        v = float(val)
        return default if math.isnan(v) else v
    except (TypeError, ValueError):
        return default

# ── Constants ──────────────────────────────────────────────────────────────────
SPOT_LENGTH  = 9.144   # 30 ft in metres (length along the kerb)
SPOT_WIDTH   = 3.048   # 10 ft in metres (width into the road)
END_SETBACK  = 10.668  # 35 ft from OSM edge endpoint (= intersection centerline).
               #          OSM nodes sit at the intersection center, not the kerb.
               #          20 ft (6.096 m) California daylighting clearance from the
               #          near kerb of the cross-street, plus ~4.5 m cross-street
               #          half-width = ~10.6 m total from centerline-to-centerline.
SNAP_RADIUS  = 20.0    # Max distance (m) to snap a candidate point to a street edge
UTM_CRS      = 26910   # EPSG for UTM Zone 10N — metric operations
WGS84_CRS    = 4326

# Road types that never have on-street parking (freeways, ramps, etc.)
NO_PARKING_TYPES = {
    "motorway", "motorway_link", "trunk", "trunk_link",
    "busway", "raceway", "escape",
}

# Half road width (m) by OSM highway type — used to place spot centers at the kerb.
# OSM edges are road centerlines; kerbs are ~half-width away.
HALF_WIDTHS: dict[str, float] = {
    "primary": 6.5, "primary_link": 5.5,
    "secondary": 5.5, "secondary_link": 5.0,
    "tertiary": 5.0, "tertiary_link": 4.5,
    "residential": 4.5, "unclassified": 4.5,
    "living_street": 4.0, "service": 3.5,
}


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


def classify_side(edge_geom: LineString, cands_gdf) -> 'pd.Series':
    """Returns boolean Series: True = left of directed edge, False = right."""
    coords = list(edge_geom.coords)
    ax, ay = coords[0]
    bx, by = coords[-1]
    dx, dy = bx - ax, by - ay
    px = cands_gdf.geometry.x - ax
    py = cands_gdf.geometry.y - ay
    cross = dx * py - dy * px   # >0 → left of direction, <0 → right
    return cross >= 0


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
    candidates_path = ROOT / "data" / "candidates" / "candidates_with_features.geojson"
    dated_output    = ROOT / "data" / "polygons" / f"parking_polygons_{START_TAG}.geojson"
    latest_output   = ROOT / "data" / "polygons" / "parking_polygons_latest.geojson"
    dated_output.parent.mkdir(parents=True, exist_ok=True)

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
    edges_slim = edges[["geometry", "highway"]].copy()
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

        highway_val = edge_row.get("highway", "residential")
        if isinstance(highway_val, list):
            highway_val = highway_val[0]
        highway_val = str(highway_val)
        if highway_val in NO_PARKING_TYPES:
            continue  # freeways, ramps — no street parking

        lateral = HALF_WIDTHS.get(highway_val, 4.5)  # metres from centerline to kerb

        # Metadata from the nearest candidates on this edge
        cands_here = assigned[assigned["index_right"] == edge_idx]
        if cands_here.empty:
            continue

        # Classify each candidate as left or right of the directed edge using
        # the overall edge direction (first→last point).
        is_left     = classify_side(geom, cands_here)
        left_cands  = cands_here[is_left]
        right_cands = cands_here[~is_left]

        sides = []
        if not right_cands.empty: sides.append((+1, "R", right_cands))
        if not left_cands.empty:  sides.append((-1, "L", left_cands))
        if not sides:             sides = [(+1, "R", cands_here)]  # fallback

        for side_sign, side_label, side_cands in sides:
            ref = side_cands.iloc[0]

            for i, dist in enumerate(centres):
                pt = geom.interpolate(dist)

                # Local tangent at this position — handles curved roads correctly.
                # Sample 0.5 m ahead and behind; clamp to segment bounds.
                pt_a = geom.interpolate(min(dist + 0.5, seg_len))
                pt_b = geom.interpolate(max(dist - 0.5, 0.0))
                local_bearing = math.degrees(math.atan2(
                    pt_a.y - pt_b.y, pt_a.x - pt_b.x
                ))
                local_rad = math.radians(local_bearing)
                local_sin = math.sin(local_rad)
                local_cos = math.cos(local_rad)

                # Perpendicular offset: right=(sin,−cos), left=(−sin,cos)
                cx = pt.x + lateral * side_sign * local_sin
                cy = pt.y + lateral * (-side_sign) * local_cos
                rect_utm = make_rectangle(cx, cy, SPOT_LENGTH, SPOT_WIDTH, local_bearing)

                # Reproject to WGS84
                rect_wgs = (
                    gpd.GeoDataFrame(geometry=[rect_utm], crs=UTM_CRS)
                    .to_crs(WGS84_CRS)
                    .geometry.iloc[0]
                )

                # GeoJSON requires closed rings: first point == last point
                exterior = list(rect_wgs.exterior.coords)  # [(lon, lat), ...]
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
                        "id":           f"{ref['id']}_{side_label}_{i}",
                        "parent_id":    str(ref["id"]),
                        "address":      str(ref.get("address", "")),
                        "spot_index":   i,
                        "side":         side_label,
                        "bearing_deg":  round(local_bearing, 2),
                        "transit_dist": _safe_float(ref.get("transit_dist")),
                        "water_infrastructure_dist": _safe_float(ref.get("water_infrastructure_dist")),
                        "city_facility_dist":        _safe_float(ref.get("city_facility_dist")),
                        "homeless_service_dist":     _safe_float(ref.get("homeless_service_dist")),
                    },
                })
                total += 1

    # 5. Write GeoJSON ───────────────────────────────────────────────────────────
    collection = {
        "type": "FeatureCollection",
        "total_spots": total,
        "features": features,
    }
    with open(dated_output, "w") as f:
        json.dump(collection, f, separators=(",", ":"))
    shutil.copy2(dated_output, latest_output)

    print(f"\n  Skipped {skipped_short:,} edges too short for even one spot")
    print(f"\nDone! {total:,} parking spots written.")
    print(f"  Dated:  {dated_output}")
    print(f"  Latest: {latest_output}")


if __name__ == "__main__":
    main()
