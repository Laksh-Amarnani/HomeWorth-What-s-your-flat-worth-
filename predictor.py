"""Loads the trained model once and turns a form submission into a price estimate."""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from train import FEATURES, to_price

ROOT = Path(__file__).parent
# safe: models/model.joblib is written by our own train.py, never uploaded by users
MODELS = joblib.load(ROOT / "models" / "model.joblib")
STATS = json.loads((ROOT / "models" / "stats.json").read_text())
METRICS = json.loads((ROOT / "models" / "metrics.json").read_text())
LISTINGS = pd.read_csv(ROOT / "data" / "clean" / "listings.csv.gz", low_memory=False)

CITIES = [c["city"] for c in STATS["cities"]]
CITY_PPS = {c["city"]: c["median_pps"] for c in STATS["cities"]}
AMENITY_LEVELS = {"unknown": np.nan, "basic": 2, "standard": 7, "premium": 14}  # 25th/50th/75th percentile of listings


def similar(city, locality, area, bedrooms, n=5):
    pool = LISTINGS[LISTINGS["city"] == city]
    local = pool[pool["locality"] == locality]
    if len(local) >= n:  # same locality when there is enough of it to compare against
        pool = local
    dist = np.abs(np.log(pool["area_sqft"] / area)) + 0.3 * np.abs(pool["bedrooms"] - bedrooms)
    cols = ["locality", "area_sqft", "bedrooms", "price_lakh"]
    return pool.loc[dist.nsmallest(n).index, cols].round(1).replace({np.nan: None}).to_dict("records")


def predict(city, locality, area, bedrooms, bathrooms, resale, amenities):
    """locality / bathrooms / resale may be None (unknown); the model handles missing values."""
    row = pd.DataFrame([{
        "city": city,
        "place": f"{city}|{locality or '-'}",
        "area_sqft": area,
        "bedrooms": bedrooms,
        "bathrooms": np.nan if bathrooms is None else bathrooms,
        "resale": np.nan if resale is None else resale,
        "amenity_count": AMENITY_LEVELS[amenities],
    }])[FEATURES]
    # sorted so the quantile models can never produce a low above the high
    lo, mid, hi = sorted(to_price(MODELS[k].predict(row)[0], area) for k in ("lo", "point", "hi"))
    pps = mid * 1e5 / area
    return {
        "price_lakh": round(mid, 1),
        "low_lakh": round(lo, 1),
        "high_lakh": round(hi, 1),
        "price_per_sqft": round(pps),
        "city_median_pps": round(CITY_PPS[city]),
        "vs_city_pct": round((pps / CITY_PPS[city] - 1) * 100),
        "typical_error_pct": METRICS["median_error_pct_by_city"][city],
        "similar": similar(city, locality, area, bedrooms),
    }
