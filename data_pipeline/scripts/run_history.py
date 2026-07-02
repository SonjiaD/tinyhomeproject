"""
Shared helper for versioned pipeline run history.

Every pipeline script that overwrites a committed data file (merge_data.py,
generate_parking_polygons.py, compute_spot_distances.py) calls `write_run()`
right after writing its `_latest` output. This snapshots that output into its
own timestamped, script-named folder under data/runs/ and writes a small
manifest.yaml describing the run (counts, what changed vs. the previous run
of that *same* script).

Only manifest.yaml is committed to git — the geojson snapshots inside each
run folder are for local rollback only (see .gitignore: data/runs/*/*.geojson).

Each script keeps its own history lane (e.g. "..._merge_data",
"..._generate_parking_polygons") so no cross-script coordination is needed —
a script only ever diffs against its own previous run.
"""

import yaml
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNS_DIR = ROOT / "data" / "runs"


def previous_manifest(script_name):
    """Return (manifest_dict, run_dir_path) for the most recent prior run of
    `script_name`, or (None, None) if there isn't one yet."""
    if not RUNS_DIR.exists():
        return None, None
    prior_runs = sorted(
        p for p in RUNS_DIR.iterdir()
        if p.is_dir() and p.name.endswith(f"_{script_name}")
    )
    if not prior_runs:
        return None, None
    run_dir = prior_runs[-1]
    manifest_path = run_dir / "manifest.yaml"
    if not manifest_path.exists():
        return None, run_dir
    with open(manifest_path, encoding="utf-8") as f:
        return yaml.safe_load(f), run_dir


def write_run(script_name, start_tag, manifest, snapshot_files):
    """
    Create data/runs/<start_tag>_<script_name>/, copy `snapshot_files` into it,
    and write manifest.yaml.

    snapshot_files: dict of {dest_filename: source_path} to copy into the run
    folder (e.g. {"parking_polygons.geojson": latest_output_path}).

    Returns the created run directory (Path).
    """
    run_dir = RUNS_DIR / f"{start_tag}_{script_name}"
    run_dir.mkdir(parents=True, exist_ok=True)

    for dest_name, src_path in snapshot_files.items():
        src_path = Path(src_path)
        if src_path.exists():
            (run_dir / dest_name).write_bytes(src_path.read_bytes())

    with open(run_dir / "manifest.yaml", "w", encoding="utf-8") as f:
        yaml.safe_dump(manifest, f, sort_keys=False, default_flow_style=False)

    return run_dir
