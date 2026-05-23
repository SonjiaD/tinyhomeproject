"""
Shared configuration for the SpotAngels data pipeline.
"""

# Oakland bounding box
OAKLAND_SW = (37.632, -122.355)   # (lat, lng) southwest corner
OAKLAND_NE = (37.885, -122.114)   # (lat, lng) northeast corner

# Grid spacing — ~400m steps, giving ~3,100 query points across Oakland
GRID_LAT_STEP = 0.004
GRID_LNG_STEP = 0.005

# Playwright settings
WAIT_MS = 3000          # ms to wait per tile for the API call to fire
PAGE_TIMEOUT_MS = 15000 # max ms to wait for page to load before skipping tile

# Save a checkpoint every N tiles so a crash doesn't lose all progress
CHECKPOINT_EVERY = 100

# SpotAngels map zoom level — 15 is the level that triggers the parking API
ZOOM = 15
