"""
Generate approximate parking spot polygons from point data.

This script:
1. Loads parking spot points from the existing GeoJSON
2. Queries OSM for nearby street geometry to get street bearing
3. Creates rotated rectangles (standard parking spot size)
4. Optionally filters out spots near stop signs/intersections
"""

import geopandas as gpd
import pandas as pd
import numpy as np
from shapely.geometry import Point, Polygon, box
from shapely.affinity import rotate, translate
from shapely.ops import nearest_points
import requests
import json
import math
from pathlib import Path

# Visualization dimensions (meters) - scaled up 50x for visibility on map
# Actual parking spots are ~2.4m x 5.5m but too small to see at city zoom
SPOT_WIDTH = 120    # width for visualization (50x actual)
SPOT_LENGTH = 275   # length for visualization (50x actual)

# Distance threshold from stop signs (meters)
STOP_SIGN_BUFFER = 10  # Don't place parklets within 10m of stop signs


def get_street_bearing_from_osm(lat: float, lon: float, radius: int = 50) -> float:
    """
    Query OSM for nearby roads and calculate the bearing of the nearest road segment.
    Returns bearing in degrees (0-360, where 0 is North).
    """
    # Overpass query to get nearby roads
    query = f"""
    [out:json];
    way["highway"](around:{radius},{lat},{lon});
    out geom;
    """

    try:
        response = requests.post(
            "https://overpass-api.de/api/interpreter",
            data={"data": query},
            timeout=30
        )
        data = response.json()

        if not data.get("elements"):
            return 0  # Default to North if no roads found

        # Find the nearest road segment
        point = Point(lon, lat)
        min_dist = float('inf')
        best_bearing = 0

        for element in data["elements"]:
            if element.get("geometry"):
                coords = [(n["lon"], n["lat"]) for n in element["geometry"]]

                # Check each segment of the road
                for i in range(len(coords) - 1):
                    p1 = Point(coords[i])
                    p2 = Point(coords[i + 1])

                    # Distance from point to line segment
                    from shapely.geometry import LineString
                    line = LineString([coords[i], coords[i + 1]])
                    dist = point.distance(line)

                    if dist < min_dist:
                        min_dist = dist
                        # Calculate bearing of this segment
                        best_bearing = calculate_bearing(
                            coords[i][1], coords[i][0],  # lat1, lon1
                            coords[i + 1][1], coords[i + 1][0]  # lat2, lon2
                        )

        return best_bearing

    except Exception as e:
        print(f"Error querying OSM: {e}")
        return 0


def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the bearing between two points in degrees."""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])

    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)

    bearing = math.atan2(x, y)
    bearing = math.degrees(bearing)
    bearing = (bearing + 360) % 360

    return bearing


def create_parking_polygon(lat: float, lon: float, bearing: float,
                          width: float = SPOT_WIDTH, length: float = SPOT_LENGTH) -> Polygon:
    """
    Create a rotated rectangle polygon representing a parking spot.

    Args:
        lat, lon: Center point of the parking spot
        bearing: Street bearing in degrees (0 = North)
        width, length: Parking spot dimensions in meters

    Returns:
        Shapely Polygon in WGS84 coordinates
    """
    # Convert meters to approximate degrees at this latitude
    # 1 degree latitude ≈ 111,320 meters
    # 1 degree longitude ≈ 111,320 * cos(latitude) meters
    lat_rad = math.radians(lat)
    meters_per_deg_lat = 111320
    meters_per_deg_lon = 111320 * math.cos(lat_rad)

    # Convert dimensions to degrees
    width_deg = width / meters_per_deg_lon
    length_deg = length / meters_per_deg_lat

    # Create a rectangle centered at origin
    half_w = width_deg / 2
    half_l = length_deg / 2

    rect = box(-half_w, -half_l, half_w, half_l)

    # Rotate by bearing (parking spots are perpendicular to street)
    # Street bearing + 90 degrees = parking spot orientation
    rotation_angle = -(bearing + 90)  # Negative because shapely rotates counter-clockwise
    rotated = rotate(rect, rotation_angle, origin=(0, 0), use_radians=False)

    # Translate to actual location
    final = translate(rotated, xoff=lon, yoff=lat)

    return final


def load_stop_signs(stop_signs_file: str = None) -> gpd.GeoDataFrame:
    """Load stop sign locations from OSM export."""
    if stop_signs_file and Path(stop_signs_file).exists():
        with open(stop_signs_file) as f:
            data = json.load(f)

        stop_signs = []
        for element in data.get("elements", []):
            if element.get("type") == "node" and element.get("tags", {}).get("highway") == "stop":
                stop_signs.append({
                    "geometry": Point(element["lon"], element["lat"]),
                    "id": element["id"]
                })

        if stop_signs:
            return gpd.GeoDataFrame(stop_signs, crs="EPSG:4326")

    return gpd.GeoDataFrame(columns=["geometry", "id"], crs="EPSG:4326")


def is_near_stop_sign(point: Point, stop_signs_gdf: gpd.GeoDataFrame,
                      buffer_meters: float = STOP_SIGN_BUFFER) -> bool:
    """Check if a point is within buffer distance of any stop sign."""
    if stop_signs_gdf.empty:
        return False

    # Convert to UTM for accurate distance calculation
    # UTM zone 10N for Oakland area
    point_gdf = gpd.GeoDataFrame(geometry=[point], crs="EPSG:4326")
    point_utm = point_gdf.to_crs("EPSG:26910")
    stop_signs_utm = stop_signs_gdf.to_crs("EPSG:26910")

    # Check distance to all stop signs
    for _, stop_sign in stop_signs_utm.iterrows():
        if point_utm.iloc[0].geometry.distance(stop_sign.geometry) < buffer_meters:
            return True

    return False


def process_parking_spots(input_geojson: str, output_geojson: str,
                         stop_signs_file: str = None,
                         use_osm_bearings: bool = True,
                         sample_size: int = None) -> gpd.GeoDataFrame:
    """
    Main processing function to convert parking spot points to polygons.

    Args:
        input_geojson: Path to input GeoJSON with point geometries
        output_geojson: Path to save output GeoJSON with polygon geometries
        stop_signs_file: Optional path to OSM stop signs export
        use_osm_bearings: Whether to query OSM for street bearings (slower but more accurate)
        sample_size: If set, only process this many spots (for testing)

    Returns:
        GeoDataFrame with polygon geometries
    """
    print(f"Loading input data from {input_geojson}...")
    gdf = gpd.read_file(input_geojson)
    print(f"Loaded {len(gdf)} parking spots")

    # Sample if requested
    if sample_size and sample_size < len(gdf):
        print(f"Sampling {sample_size} spots for processing...")
        gdf = gdf.sample(n=sample_size, random_state=42)

    # Load stop signs
    stop_signs = load_stop_signs(stop_signs_file)
    print(f"Loaded {len(stop_signs)} stop signs")

    # Process each point
    polygons = []
    filtered_count = 0

    for idx, row in gdf.iterrows():
        # Get centroid if geometry is not a point
        if row.geometry.geom_type == 'Point':
            point = row.geometry
        else:
            point = row.geometry.centroid

        lat, lon = point.y, point.x

        # Check if near stop sign
        if is_near_stop_sign(point, stop_signs):
            filtered_count += 1
            continue

        # Get street bearing
        if use_osm_bearings:
            bearing = get_street_bearing_from_osm(lat, lon)
            if (idx + 1) % 100 == 0:
                print(f"Processed {idx + 1}/{len(gdf)} spots...")
        else:
            # Use a default bearing (North-South orientation)
            bearing = 0

        # Create polygon
        polygon = create_parking_polygon(lat, lon, bearing)

        # Copy all properties from original
        properties = row.to_dict()
        properties['geometry'] = polygon
        properties['bearing'] = bearing
        polygons.append(properties)

    print(f"Created {len(polygons)} polygons")
    print(f"Filtered out {filtered_count} spots near stop signs")

    # Create output GeoDataFrame
    result_gdf = gpd.GeoDataFrame(polygons, crs="EPSG:4326")

    # Save to file
    result_gdf.to_file(output_geojson, driver="GeoJSON")
    print(f"Saved to {output_geojson}")

    return result_gdf


def quick_process_without_osm(input_geojson: str, output_geojson: str,
                              default_bearing: float = 0) -> gpd.GeoDataFrame:
    """
    Quick processing without OSM queries - uses default bearing.
    Much faster but less accurate orientation.
    """
    print(f"Loading input data from {input_geojson}...")
    gdf = gpd.read_file(input_geojson)
    print(f"Loaded {len(gdf)} parking spots")

    polygons = []

    for idx, row in gdf.iterrows():
        if row.geometry.geom_type == 'Point':
            point = row.geometry
        else:
            point = row.geometry.centroid

        lat, lon = point.y, point.x

        # Create polygon with default bearing
        polygon = create_parking_polygon(lat, lon, default_bearing)

        properties = row.to_dict()
        properties['geometry'] = polygon
        properties['bearing'] = default_bearing
        polygons.append(properties)

    print(f"Created {len(polygons)} polygons")

    result_gdf = gpd.GeoDataFrame(polygons, crs="EPSG:4326")
    result_gdf.to_file(output_geojson, driver="GeoJSON")
    print(f"Saved to {output_geojson}")

    return result_gdf


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate parking spot polygons from points")
    parser.add_argument("--input", default="candidates_with_features.geojson",
                       help="Input GeoJSON file with point geometries")
    parser.add_argument("--output", default="parking_polygons.geojson",
                       help="Output GeoJSON file with polygon geometries")
    parser.add_argument("--stop-signs", default=None,
                       help="Optional OSM stop signs export file")
    parser.add_argument("--quick", action="store_true",
                       help="Quick mode: skip OSM queries, use default bearing")
    parser.add_argument("--sample", type=int, default=None,
                       help="Only process N spots (for testing)")

    args = parser.parse_args()

    if args.quick:
        quick_process_without_osm(args.input, args.output)
    else:
        process_parking_spots(
            args.input,
            args.output,
            stop_signs_file=args.stop_signs,
            use_osm_bearings=True,
            sample_size=args.sample
        )
