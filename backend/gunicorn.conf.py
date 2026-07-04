# Gunicorn configuration — auto-loaded from the current working directory (backend/) by the
# existing `gunicorn app:app` start command, so no Render dashboard change is required.
#
# Why this exists: app.py holds a ~52 MB parking-polygon GeoJSON string (POLY_RAW) plus a
# geopandas GeoDataFrame in memory. On Render's 512 MB free tier, running multiple gunicorn
# workers would load a separate ~52 MB+ copy PER worker and OOM the instance. Pinning a
# single worker and preloading keeps that memory loaded once (pre-fork; any future extra
# workers share it copy-on-write) instead of duplicating it.
import os

# One worker by default; overridable via env if the instance is ever upsized.
workers = int(os.environ.get("WEB_CONCURRENCY", "1"))

# Load the app (and its 52 MB payload) once before forking workers.
preload_app = True

# The initial GeoJSON load + first request can be slow on a cold free-tier instance.
timeout = 120

# NOTE: intentionally not setting `bind` here — the current deployment already binds
# correctly, and a CLI --bind (if present) would override this anyway.
