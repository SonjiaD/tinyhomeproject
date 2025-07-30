from flask import Flask, request, jsonify
import numpy as np
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # enable cross-origin requests from React

# Map friendly names to internal keys
feature_map = {
    "Transit Access": "transit_dist",
    "Homeless Services Nearby": "homeless_service_dist",
    "Affordable Housing Nearby": "public_housing_dist",
    "Access to Water Infrastructure": "water_infrastructure_dist",
    "Nearby City Facilities": "city_facility_dist",
    "Urban Plan Priority Area": "general_plan_dist"
}
features = list(feature_map.keys())

@app.route("/api/ahp", methods=["POST"])
def calculate_ahp():
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
                f"{f2} more": 1/3,
                f"{f2} much more": 1/5
            }.get(val, 1)
            ahp_matrix[i][j] = scale
            ahp_matrix[j][i] = 1 / scale

    # Eigenvector
    eigvals, eigvecs = np.linalg.eig(ahp_matrix)
    max_index = np.argmax(eigvals)
    weights = np.real(eigvecs[:, max_index])
    weights = weights / weights.sum()

    # Return weights mapped to internal names
    mapped_weights = {
        feature_map[features[i]]: round(float(weights[i]), 4)
        for i in range(len(features))
    }

    return jsonify({
        "weights": mapped_weights
    })

if __name__ == "__main__":
    app.run(debug=True)
