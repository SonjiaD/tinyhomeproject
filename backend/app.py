from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import geopandas as gpd
import pandas as pd
import os

#for the aws s3 bucket
from dotenv import load_dotenv
import os

#dynamodb table writer
import boto3
import uuid

import datetime

#fixing error with AWS DynamoDB Decimal type
from decimal import Decimal
import json 


app = Flask(__name__)
CORS(app)

#for aws keys from .env file
load_dotenv()

aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
aws_region = os.getenv("AWS_REGION")
table_name = os.getenv("DYNAMODB_TABLE")

#helper
def to_decimal(o):
    if isinstance(o, float) or isinstance(o, np.floating):
        return Decimal(str(o))              # keep precision
    if isinstance(o, dict):
        return {k: to_decimal(v) for k, v in o.items()}
    if isinstance(o, list):
        return [to_decimal(x) for x in o]
    return o

# Map UI labels to GeoJSON columns
feature_map = {
    "Transit Access": "transit_dist",
    "Homeless Services Nearby": "homeless_service_dist",
    "Affordable Housing Nearby": "public_housing_dist",
    "Access to Water Infrastructure": "water_infrastructure_dist",
    "Nearby City Facilities": "city_facility_dist",
    "Urban Plan Priority Area": "general_plan_dist"
}
features = list(feature_map.keys())
score_cols = list(feature_map.values())

def min_max_normalize(series: pd.Series) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce")
    # Conservative: treat missing as worst (max distance)
    s = s.fillna(s.max())
    if s.notna().sum() == 0:
        # if truly all missing, return zeros so it doesn't affect ranking
        return pd.Series(np.zeros(len(s)), index=s.index)
    vmin, vmax = float(s.min()), float(s.max())
    if vmax == vmin:
        return pd.Series(np.zeros(len(s)), index=s.index)
    return (s - vmin) / (vmax - vmin)

@app.route("/api/ahp", methods=["POST"])
def calculate_ahp():
    data = request.json
    comparisons = data.get("comparisons", {})
    size = len(features)
    ahp_matrix = np.ones((size, size))

    # Build pairwise comparison matrix (5-level compressed scale)
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

    # Load GeoJSON and normalize distance features
    gdf = gpd.read_file("candidates_with_features.geojson").to_crs(epsg=4326)

    norm_scores = [min_max_normalize(gdf[col]) for col in score_cols]

    # Weighted sum using full precision weights
    weight_array = np.array([weights_for_calc.get(col, 0.0) for col in score_cols])
    weight_array = weight_array / weight_array.sum()
    gdf["final_score"] = sum(wi * si for wi, si in zip(weight_array, norm_scores))

    ranked = gdf.sort_values("final_score", ascending=True).reset_index(drop=True)
    ranked["rank"] = ranked.index + 1

    # Centroids in projected CRS → back to WGS84
    ranked_utm = ranked.to_crs(26910)
    cent = ranked_utm.geometry.centroid
    cent_ll = gpd.GeoSeries(cent, crs=26910).to_crs(4326)
    ranked["lon"] = cent_ll.x
    ranked["lat"] = cent_ll.y

    top_sites = ranked.head(500)[["lat", "lon", "rank", "final_score"]].to_dict(orient="records")

    return jsonify({
        "weights": display_weights,
        "top_sites": top_sites,
        "consistency": {
            "lambda_max": round(lambda_max, 6),
            "CI": round(CI, 6),
            "CR": round(CR, 6) if CR is not None else None
        }
    })

@app.route("/healthz") #for cronjobs
def healthz():
    return "OK", 200

#for dynamodb table writer
# Initialize DynamoDB client
dynamodb = boto3.resource(
    "dynamodb",
    region_name=aws_region or "us-west-1",
    aws_access_key_id=aws_access_key_id,
    aws_secret_access_key=aws_secret_access_key,
)
table = dynamodb.Table(table_name)

@app.route('/api/save_ahp_submission', methods=['POST'])
def save_ahp_submission():
    data = request.get_json()
    try:
        item = {
            'submission_id': str(uuid.uuid4()),
            'timestamp': datetime.datetime.utcnow().isoformat(),
            'user_name': data.get('name'),
            'occupation': data.get('occupation'),
            'location': data.get('location'),
            'feedback': data.get('feedback'),   # optional but your UI sends it
            # convert floats → Decimal recursively
            'weights': to_decimal(data.get('weights', {})),
            # keep payload modest and convert numbers
            'top_sites': to_decimal((data.get('top_sites') or [])[:300]),
        }
        table.put_item(Item=item)
        return {'status': 'success'}, 200
    except Exception as e:
        print(f"Error saving to DynamoDB: {e}")
        return {'error': str(e)}, 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))  # Use Render-provided port
    app.run(host="0.0.0.0", port=port)