from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import geopandas as gpd
import pandas as pd
import os
from dotenv import load_dotenv
from supabase import create_client

app = Flask(__name__)
CORS(app, origins=[
    "https://tinyhomeproject.netlify.app",
    "http://localhost:5173",
])

# Load environment variables
load_dotenv()

# Supabase setup
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase = create_client(supabase_url, supabase_key) if supabase_url and supabase_key else None

# Map UI labels to GeoJSON columns
feature_map = {
    "Transit Access": "transit_dist",
    "Affordable Housing": "public_housing_dist",
    "Water Infrastructure": "water_infrastructure_dist",
    "Urban Plan Priority Area": "general_plan_dist"
}
features = list(feature_map.keys())
score_cols = list(feature_map.values())

# ── Load GeoJSON once at startup and pre-compute lat/lon ──
print("Loading GeoJSON data...")
_gdf = gpd.read_file("parking_polygons.geojson").to_crs(epsg=4326)

# Calculate centroids in UTM then convert back
_utm = _gdf.to_crs(26910)
_cent_ll = gpd.GeoSeries(_utm.geometry.centroid, crs=26910).to_crs(4326)
_gdf["lon"] = _cent_ll.x
_gdf["lat"] = _cent_ll.y
del _utm, _cent_ll

def get_polygon_coords(geom):
    """Extract polygon coordinates as [[lat, lon], ...] for Leaflet."""
    if geom.geom_type == 'Polygon':
        return [[coord[1], coord[0]] for coord in geom.exterior.coords]
    return []

_gdf["polygon"] = _gdf.geometry.apply(get_polygon_coords)
CACHED_GDF = _gdf

def min_max_normalize(series: pd.Series) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce")
    if s.notna().sum() == 0:
        return pd.Series(np.zeros(len(s)), index=s.index)
    s = s.fillna(s.max())
    vmin, vmax = float(s.min()), float(s.max())
    if vmax == vmin:
        return pd.Series(np.zeros(len(s)), index=s.index)
    return (s - vmin) / (vmax - vmin)

# Pre-normalize the distance columns
CACHED_NORM = {col: min_max_normalize(CACHED_GDF[col]) for col in score_cols}
print(f"Loaded {len(CACHED_GDF)} candidate sites.")

@app.route("/api/ahp", methods=["POST"])
def calculate_ahp():
    data = request.json
    comparisons = data.get("comparisons", {})
    size = len(features)
    ahp_matrix = np.ones((size, size))

    # Build pairwise comparison matrix
    for i, f1 in enumerate(features):
        for j, f2 in enumerate(features):
            if i >= j:
                continue
            key = f"{f1}__vs__{f2}"
            val = comparisons.get(key, "Equal")
            scale = {
                f"{f1} much more": 5,
                f"{f1} more": 3,
                "Equal": 1,
                f"{f2} more": 1/3,
                f"{f2} much more": 1/5,
            }.get(val, 1)
            ahp_matrix[i, j] = scale
            ahp_matrix[j, i] = 1/scale

    # Principal eigenvector weights + consistency
    eigvals, eigvecs = np.linalg.eig(ahp_matrix)
    imax = np.argmax(eigvals.real)
    w = np.abs(eigvecs[:, imax].real)
    w = w / w.sum()

    RI = {1:0,2:0,3:0.58,4:0.90,5:1.12,6:1.24,7:1.32,8:1.41,9:1.45,10:1.49}
    n = len(features)
    lambda_max = float(eigvals.real[imax])
    CI = (lambda_max - n) / (n - 1) if n > 1 else 0.0
    CR = CI / RI.get(n, 1.49) if n in RI else None

    weights_for_calc = { feature_map[features[i]]: float(w[i]) for i in range(n) }
    display_weights  = { k: round(v, 4) for k, v in weights_for_calc.items() }

    gdf = CACHED_GDF.copy()
    norm_scores = [CACHED_NORM[col] for col in score_cols]

    weight_array = np.array([weights_for_calc.get(col, 0.0) for col in score_cols])
    weight_array = weight_array / weight_array.sum()
    gdf["final_score"] = sum(wi * si for wi, si in zip(weight_array, norm_scores))

    ranked = gdf.sort_values("final_score", ascending=True).reset_index(drop=True)
    ranked["rank"] = ranked.index + 1

    top_sites = ranked.head(500)[["lat", "lon", "rank", "final_score", "polygon"]].to_dict(orient="records")

    return jsonify({
        "weights": display_weights,
        "top_sites": top_sites,
        "consistency": {
            "lambda_max": round(lambda_max, 6),
            "CI": round(CI, 6),
            "CR": round(CR, 6) if CR is not None else None
        }
    })

@app.route("/api/default_map", methods=["GET"])
def default_map():
    sites = CACHED_GDF[["lat", "lon", "polygon"]].to_dict(orient="records")
    return jsonify({"sites": sites})

@app.route("/api/wsm", methods=["POST"])
def weighted_sum_model():
    data = request.get_json()
    weights = data.get("weights", {}) or {}

    gdf = CACHED_GDF.copy()

    cols = [c for c in weights.keys() if c in gdf.columns]
    if not cols:
        return jsonify({"error": "No valid weight columns provided"}), 400

    wvals = np.array([float(weights[c]) for c in cols], dtype=float)
    if wvals.sum() < 1e-9:
        return jsonify({"error": "All weights are zero"}), 400
    wvals = wvals / wvals.sum()

    norm_scores = [CACHED_NORM.get(c, min_max_normalize(gdf[c])) for c in cols]
    gdf["final_score"] = sum(w * s for w, s in zip(wvals, norm_scores))

    ranked = gdf.sort_values("final_score", ascending=True).reset_index(drop=True)
    ranked["rank"] = ranked.index + 1

    top_sites = ranked.head(500)[["lat", "lon", "rank", "final_score", "polygon"]].to_dict(orient="records")
    display_weights = { cols[i]: round(float(wvals[i]), 4) for i in range(len(cols)) }

    return jsonify({"weights": display_weights, "top_sites": top_sites})

@app.route("/healthz")
def healthz():
    return "OK", 200

@app.route('/api/save_ahp_submission', methods=['POST'])
def save_ahp_submission():
    if not supabase:
        return {'error': 'Database not configured'}, 500

    data = request.get_json()
    try:
        # Prepare the submission data
        submission = {
            'name': data.get('name'),
            'occupation': data.get('occupation'),
            'location': data.get('location'),
            'feedback': data.get('feedback'),
            'method': data.get('method', 'AHP'),
            'consistency_ratio': data.get('consistency_ratio'),
            'weights': data.get('weights', {}),
            'top_sites': (data.get('top_sites') or [])[:300],  # Limit to 300 sites
        }

        # Insert into Supabase
        result = supabase.table('submissions').insert(submission).execute()

        return {'status': 'success'}, 200
    except Exception as e:
        print(f"Error saving to Supabase: {e}")
        return {'error': str(e)}, 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
