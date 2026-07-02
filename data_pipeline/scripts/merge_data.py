"""
Merges a fresh SpotAngels scrape into data/candidates/candidates_with_features.geojson.

Run this AFTER reviewing the compare_with_existing.py report.

- New scrape spots overwrite existing spots with the same ID (fresher data wins)
- Existing spots from other sources (govt/OSM) are preserved unchanged
- After the ID-based merge, a spatial dedup pass collapses near-duplicate points
  (within DEDUPE_RADIUS_M of each other, same address) into one — catches
  duplicates across sources that never shared an id in the first place
- Prints a summary of what changed

Usage:
    python data_pipeline/scripts/merge_data.py [path/to/scrape.geojson] [--notes "..."]

If no path is given, uses the most recent file in data_pipeline/spotangel_output/.

Outputs:
    data/candidates/candidates_with_features.geojson   (latest, committed)
    data/runs/<timestamp>_merge_data/                  (history snapshot + manifest.yaml)
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import run_history

ROOT = Path(__file__).resolve().parents[2]
CANDIDATES_DIR = ROOT / "data" / "candidates"
LATEST_FILE    = CANDIDATES_DIR / "candidates_with_features.geojson"
SCRAPE_DIR     = ROOT / "data_pipeline" / "spotangel_output"

DEDUPE_RADIUS_M = 8.0  # below one spot length (9.144m) — candidates this close
                        # sharing the same address are the same physical curb spot.
SCRIPT_NAME = "merge_data"


def dedupe_candidates(features, threshold_m=DEDUPE_RADIUS_M):
    """Collapse near-duplicate candidate points (within `threshold_m` of each
    other AND sharing the same address) into one, keeping the lowest `id`.

    Two independently-sourced points (government data vs. SpotAngels scrape)
    for the same physical curb never share an id, so id-based merging alone
    never catches this — hence a separate spatial pass.
    """
    import geopandas as gpd
    from shapely.strtree import STRtree

    if not features:
        return features, 0

    gdf = gpd.GeoDataFrame.from_features(features, crs=4326).to_crs(26910)
    geoms = list(gdf.geometry)
    tree = STRtree(geoms)

    # Union-find over candidate indices.
    parent = list(range(len(features)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[max(ri, rj)] = min(ri, rj)

    addresses = [f["properties"].get("address") for f in features]
    for i, geom in enumerate(geoms):
        nearby = tree.query(geom.buffer(threshold_m))
        for j in nearby:
            j = int(j)
            if j <= i:
                continue
            if addresses[j] != addresses[i]:
                continue
            if geom.distance(geoms[j]) <= threshold_m:
                union(i, j)

    clusters = {}
    for i in range(len(features)):
        clusters.setdefault(find(i), []).append(i)

    kept_indices = []
    removed = 0
    for members in clusters.values():
        if len(members) == 1:
            kept_indices.append(members[0])
            continue
        # Keep the lowest id (deterministic; these fields carry no output-visible
        # data beyond address, which is identical across a duplicate cluster).
        best = min(members, key=lambda i: str(features[i]["properties"]["id"]))
        kept_indices.append(best)
        removed += len(members) - 1

    deduped = [features[i] for i in sorted(kept_indices)]
    return deduped, removed


def load_geojson(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_latest_scrape():
    files = sorted(SCRAPE_DIR.glob("spotangels_*.geojson"), reverse=True)
    if not files:
        print("No scrape output found in data_pipeline/spotangel_output/. Run scrape_spotangels.py first.")
        sys.exit(1)
    return files[0]


def _parse_args(argv):
    notes = ""
    positional = []
    i = 0
    while i < len(argv):
        if argv[i] == "--notes" and i + 1 < len(argv):
            notes = argv[i + 1]
            i += 2
        else:
            positional.append(argv[i])
            i += 1
    return positional, notes


def main():
    positional, notes = _parse_args(sys.argv[1:])
    scrape_path = Path(positional[0]) if positional else get_latest_scrape()

    start_tag = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M")

    print(f"Merging: {scrape_path.name}")
    print(f"Into:    {LATEST_FILE.name}\n")

    new_data      = load_geojson(scrape_path)
    existing_data = load_geojson(LATEST_FILE)

    new_by_id      = {str(f["properties"]["id"]): f for f in new_data["features"]}
    existing_by_id = {str(f["properties"]["id"]): f for f in existing_data["features"]}

    n_updated = 0
    n_added   = 0
    n_kept    = 0
    merged    = {}

    for sid, feature in existing_by_id.items():
        if sid in new_by_id:
            merged[sid] = new_by_id[sid]
            n_updated += 1
        else:
            merged[sid] = feature
            n_kept += 1

    for sid, feature in new_by_id.items():
        if sid not in existing_by_id:
            merged[sid] = feature
            n_added += 1

    print(f"  Updated (same ID, fresher data):    {n_updated}")
    print(f"  Kept unchanged (not in new scrape): {n_kept}")
    print(f"  Added new (not in existing):        {n_added}")
    print(f"  Total spots after ID merge:         {len(merged)}")

    # Spatial dedup: catches near-duplicate points that ID-based merging can't,
    # since independently-sourced points (government data vs. SpotAngels) for the
    # same physical curb never share an id.
    deduped_features, n_spatial_dupes_removed = dedupe_candidates(list(merged.values()))
    print(f"  Spatial duplicates removed (within {DEDUPE_RADIUS_M}m, same address): {n_spatial_dupes_removed}")
    print(f"  Total candidates after dedup:       {len(deduped_features)}")

    CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)

    # Write merged+deduped result to latest
    merged_geojson = {
        "type": "FeatureCollection",
        "merged_at": datetime.now(timezone.utc).isoformat(),
        "total_spots": len(deduped_features),
        "features": deduped_features,
    }
    with open(LATEST_FILE, "w", encoding="utf-8") as f:
        json.dump(merged_geojson, f, indent=2, ensure_ascii=False)

    print(f"  Updated latest: {LATEST_FILE.name}")

    prev, prev_dir = run_history.previous_manifest(SCRIPT_NAME)
    manifest = {
        "script": SCRIPT_NAME,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scrape_source": scrape_path.name,
        "candidates": {
            "updated": n_updated,
            "kept": n_kept,
            "added": n_added,
            "total_after_id_merge": len(merged),
            "spatial_duplicates_removed": n_spatial_dupes_removed,
            "total_after_dedup": len(deduped_features),
        },
        "previous_run": None,
        "diff_vs_previous": None,
        "notes": notes,
    }
    if prev_dir is not None:
        manifest["previous_run"] = f"data/runs/{prev_dir.name}/manifest.yaml"
        prev_total = (prev or {}).get("candidates", {}).get("total_after_dedup")
        if prev_total is not None:
            manifest["diff_vs_previous"] = {
                "candidate_count_delta": len(deduped_features) - prev_total,
            }
    run_dir = run_history.write_run(
        SCRIPT_NAME, start_tag, manifest,
        snapshot_files={"candidates_with_features.geojson": LATEST_FILE},
    )
    print(f"  Run history: {run_dir}")
    print("\nNext step: run data_pipeline/scripts/generate_parking_polygons.py")


if __name__ == "__main__":
    main()
