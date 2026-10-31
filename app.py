import os

from flask import Flask, jsonify, render_template, request

import predictor

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html", cities=predictor.CITIES, localities=predictor.STATS["localities"],
                           stats=predictor.STATS, metrics=predictor.METRICS)


@app.get("/dashboard")
def dashboard():
    return render_template("dashboard.html", stats=predictor.STATS, metrics=predictor.METRICS)


@app.post("/api/predict")
def api_predict():
    f = request.get_json(silent=True) or {}
    try:
        city, area, bedrooms = f["city"], float(f["area"]), int(f["bedrooms"])
        bathrooms = int(f["bathrooms"]) if f.get("bathrooms") else None
        locality = f.get("locality") or None
        amenities = f.get("amenities", "unknown")
        resale = {"resale": 1, "new": 0}.get(f.get("condition"))
    except (KeyError, ValueError, TypeError):
        return jsonify(error="Please fill in city, area and bedrooms with valid numbers."), 400

    if city not in predictor.CITIES:
        return jsonify(error="Unknown city."), 400
    if not 200 <= area <= 10000:
        return jsonify(error="Area must be between 200 and 10,000 sq ft."), 400
    if not 1 <= bedrooms <= 8 or (bathrooms is not None and not 1 <= bathrooms <= 8):
        return jsonify(error="Bedrooms and bathrooms must be between 1 and 8."), 400
    if amenities not in predictor.AMENITY_LEVELS:
        return jsonify(error="Unknown amenities level."), 400
    if locality not in predictor.STATS["localities"].get(city, []):
        locality = None  # an unlisted locality is treated as unknown rather than guessed
    return jsonify(predictor.predict(city, locality, area, bedrooms, bathrooms, resale, amenities))


@app.get("/health")
def health():
    return "ok"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=False)
