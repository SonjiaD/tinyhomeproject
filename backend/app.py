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
from flask import request

import datetime

#fixing error
from decimal import Decimal
import numpy as np
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

def min_max_normalize(series):
    return (series - series.min()) / (series.max() - series.min()) if series.max() != series.min() else 0

@app.route("/api/ahp", methods=["POST"])
def calculate_ahp():
    # Load user comparisons
    data = request.json
    comparisons = data.get("comparisons", {})
    size = len(features)
    ahp_matrix = np.ones((size, size))

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
                f"{f2} more": 1 / 3,
                f"{f2} much more": 1 / 5
            }.get(val, 1)
            ahp_matrix[i][j] = scale
            ahp_matrix[j][i] = 1 / scale

    # Eigenvector
    eigvals, eigvecs = np.linalg.eig(ahp_matrix)
    max_index = np.argmax(eigvals)
    weights = np.real(eigvecs[:, max_index])
    weights = weights / weights.sum()
    mapped_weights = {
        feature_map[features[i]]: round(float(weights[i]), 4)
        for i in range(len(features))
    }

    # Load GeoJSON
    gdf = gpd.read_file("candidates_with_features.geojson")
    gdf = gdf.to_crs(epsg=4326)  # ensure lat/lon coords

    # Normalize distance columns
    norm_scores = []
    for col in score_cols:
        gdf[col] = pd.to_numeric(gdf[col], errors="coerce").fillna(gdf[col].mean())
        norm_scores.append(min_max_normalize(gdf[col]))

    # Apply AHP weights
    weight_array = np.array([mapped_weights.get(col, 0.0) for col in score_cols])
    weight_array /= weight_array.sum()

    gdf["final_score"] = sum(w * s for w, s in zip(weight_array, norm_scores))
    ranked = gdf.sort_values("final_score", ascending=True).reset_index(drop=True)
    ranked["rank"] = ranked.index + 1

    # Compute centroids for map display
    ranked["lon"] = ranked.geometry.centroid.x
    ranked["lat"] = ranked.geometry.centroid.y

    top_sites = ranked.head(500)[["lat", "lon", "rank", "final_score"]].to_dict(orient="records")

    return jsonify({
        "weights": mapped_weights,
        "top_sites": top_sites
    })

@app.route("/healthz") #for cronjobs
def healthz():
    return "OK", 200

#for dynamodb table writer
# Initialize DynamoDB client
dynamodb = boto3.resource(
    "dynamodb",
    region_name="us-west-1",
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