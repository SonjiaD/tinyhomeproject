"""
Quick test: open SpotAngels for one downtown Oakland tile via Playwright,
intercept the parking API response, and print free spots found.
"""
import json
from playwright.sync_api import sync_playwright

TEST_LAT = 37.8057
TEST_LNG = -122.2767
WAIT_MS = 5000  # ms to wait for API calls to fire


def main():
    captured = []

    def on_response(response):
        if "regulations/radius/options" in response.url:
            try:
                data = response.json()
                results = data.get("results", [])
                free = [r for r in results if r.get("type") == "free"]
                captured.extend(free)
                print(f"  -> API response: {len(results)} total spots, {len(free)} free")
            except Exception as e:
                print(f"  -> Failed to parse response: {e}")

    url = (
        f"https://www.spotangels.com/map"
        f"?lat={TEST_LAT}&lng={TEST_LNG}&zoom=15&product=parking"
    )

    print(f"Opening SpotAngels at lat={TEST_LAT}, lng={TEST_LNG}...")
    print(f"URL: {url}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("response", on_response)

        page.goto(url, wait_until="domcontentloaded")
        print(f"Page loaded. Waiting {WAIT_MS}ms for API calls...")
        page.wait_for_timeout(WAIT_MS)

        browser.close()

    print(f"\n--- Results ---")
    if not captured:
        print("No free spots captured. Check if Playwright loaded the page correctly.")
    else:
        # Deduplicate by id
        seen = {}
        for spot in captured:
            seen[spot["id"]] = spot
        unique = list(seen.values())
        print(f"Captured {len(unique)} unique free spots near downtown Oakland.\n")
        print("Sample (first 5):")
        for spot in unique[:5]:
            print(
                f"  id={spot['id']} | {spot['address']} | {spot.get('name')} | max_stay={spot.get('max_stay_fmt')}"
            )


if __name__ == "__main__":
    main()
