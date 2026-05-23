"""
Full Oakland SpotAngels scraper.

Navigates a headless Chromium browser across a grid of points covering Oakland,
intercepts the parking API responses, and saves all free spots to GeoJSON.

Usage:
    python data_pipeline/scripts/scrape_spotangels.py

Output:
    data_pipeline/output/spotangels_YYYY-MM-DD_HH-MM.geojson

The script saves a checkpoint every 100 tiles so a crash doesn't lose progress.
Re-running after a crash will resume from the last checkpoint automatically.
"""

import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Allow running from any directory
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from data_pipeline.config import (
    CHECKPOINT_EVERY,
    GRID_LAT_STEP,
    GRID_LNG_STEP,
    OAKLAND_NE,
    OAKLAND_SW,
    PAGE_TIMEOUT_MS,
    WAIT_MS,
    ZOOM,
)

OUTPUT_DIR = ROOT / "data_pipeline" / "output"
START_TAG = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M")
OUTPUT_FILE = OUTPUT_DIR / f"spotangels_{START_TAG}.geojson"
CHECKPOINT_FILE = OUTPUT_DIR / f"checkpoint_{START_TAG}.json"


def generate_grid():
    points = []
    lat = OAKLAND_SW[0]
    while lat <= OAKLAND_NE[0]:
        lng = OAKLAND_SW[1]
        while lng <= OAKLAND_NE[1]:
            points.append((round(lat, 6), round(lng, 6)))
            lng += GRID_LNG_STEP
        lat += GRID_LAT_STEP
    return points


def load_checkpoint():
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE, encoding="utf-8") as f:
            data = json.load(f)
        spots = data.get("spots", {})
        done_tiles = set(tuple(t) for t in data.get("done_tiles", []))
        print(f"Resuming from checkpoint: {len(done_tiles)} tiles done, {len(spots)} spots so far.")
        return spots, done_tiles
    return {}, set()


def save_checkpoint(spots, done_tiles):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(
            {"spots": spots, "done_tiles": list(done_tiles)},
            f,
            # compact to keep checkpoint file smaller
            separators=(",", ":"),
        )


def spots_to_geojson(spots):
    features = []
    for spot in spots.values():
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": spot["id"],
                    "address": spot.get("address", ""),
                    "max_stay": spot.get("max_stay_fmt", ""),
                    "name": spot.get("name", ""),
                    "type": spot.get("type", ""),
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [spot["lng"], spot["lat"]],
                },
            }
        )
    return {
        "type": "FeatureCollection",
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "total_spots": len(features),
        "features": features,
    }


def fmt_duration(seconds):
    """Format a number of seconds as h:mm or m:ss."""
    if seconds >= 3600:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        return f"{h}h {m:02d}m"
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}m {s:02d}s"


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def scrape():
    from playwright.sync_api import sync_playwright

    grid = generate_grid()
    total_tiles = len(grid)

    spots, done_tiles = load_checkpoint()
    remaining = [p for p in grid if p not in done_tiles]
    n_remaining = len(remaining)

    est_seconds = n_remaining * 2.0  # ~2s per tile measured in test
    print("=" * 60)
    print("  SpotAngels Oakland Scraper")
    print("=" * 60)
    print(f"  Total tiles:      {total_tiles}")
    print(f"  Already done:     {total_tiles - n_remaining}")
    print(f"  Remaining:        {n_remaining}")
    print(f"  Est. time:        ~{fmt_duration(est_seconds)}")
    print(f"  Output:           {OUTPUT_FILE.name}")
    print(f"  Checkpoint every: {CHECKPOINT_EVERY} tiles")
    print("=" * 60)
    print()

    errors = 0
    no_data = 0   # tiles where SpotAngels had no parking API response (expected for water/port areas)
    tiles_since_checkpoint = 0
    start_time = time.time()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            for i, (lat, lng) in enumerate(remaining):
                tile_spots = []
                url = (
                    f"https://www.spotangels.com/map"
                    f"?lat={lat}&lng={lng}&zoom={ZOOM}&product=parking"
                )
                got_response = False
                try:
                    # Proceed as soon as the parking API responds (faster than fixed sleep).
                    # Times out if SpotAngels doesn't call the API — normal for water/port areas.
                    with page.expect_response(
                        lambda r: "regulations/radius/options" in r.url,
                        timeout=WAIT_MS,
                    ) as resp_info:
                        page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)

                    got_response = True
                    data = resp_info.value.json()
                    for spot in data.get("results", []):
                        if spot.get("type") == "free":
                            tile_spots.append(spot)
                except KeyboardInterrupt:
                    raise  # let outer handler catch it
                except Exception:
                    if got_response:
                        errors += 1  # real error (bad JSON, page crash, etc.)
                    else:
                        no_data += 1  # no API call = empty area, expected

                new_this_tile = 0
                for spot in tile_spots:
                    sid = str(spot["id"])
                    if sid not in spots:
                        new_this_tile += 1
                    spots[sid] = spot

                done_tiles.add((lat, lng))
                tiles_since_checkpoint += 1

                # Progress line for every tile
                pct = (i + 1) / n_remaining * 100
                elapsed = time.time() - start_time
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                eta_sec = (n_remaining - i - 1) / rate if rate > 0 else 0
                bar_filled = int(pct / 5)
                bar = "#" * bar_filled + "-" * (20 - bar_filled)
                status = " [CHECKPOINT SAVED]" if tiles_since_checkpoint >= CHECKPOINT_EVERY else ""
                empty_note = " (no parking data)" if not got_response else ""
                log(
                    f"[{bar}] {pct:5.1f}%  tile {i+1}/{n_remaining}"
                    f"  +{new_this_tile} spots  total={len(spots)}"
                    f"  ETA {fmt_duration(eta_sec)}{empty_note}{status}"
                )

                if tiles_since_checkpoint >= CHECKPOINT_EVERY:
                    save_checkpoint(spots, done_tiles)
                    tiles_since_checkpoint = 0

        except KeyboardInterrupt:
            log("Interrupted — saving checkpoint before exit...")
            save_checkpoint(spots, done_tiles)
            log(f"Checkpoint saved. {len(done_tiles)} tiles done, {len(spots)} spots. Re-run to continue.")
            browser.close()
            return None

        browser.close()

    # Final save
    save_checkpoint(spots, done_tiles)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    geojson = spots_to_geojson(spots)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2, ensure_ascii=False)

    elapsed_total = time.time() - start_time
    print()
    print("=" * 60)
    print(f"  DONE in {fmt_duration(elapsed_total)}")
    print(f"  Free spots saved:       {len(spots)}")
    print(f"  Tiles with data:        {n_remaining - errors - no_data}/{n_remaining}")
    print(f"  Tiles with no parking:  {no_data}  (water/port/empty areas, expected)")
    print(f"  Tiles with real errors: {errors}")
    print(f"  Output: {OUTPUT_FILE}")
    print("=" * 60)

    return OUTPUT_FILE


if __name__ == "__main__":
    scrape()
