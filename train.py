"""Train the price model and build the stats the dashboard shows.

Run: python train.py   ->  models/model.joblib, models/metrics.json, models/stats.json
"""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import TargetEncoder

OUT = Path("models")
NUMERIC = ["area_sqft", "bedrooms", "bathrooms", "resale", "amenity_count"]
FEATURES = ["city", "place"] + NUMERIC
MIN_LOCALITY_ROWS = 10


def to_price(lpps, area):
    """The models predict log(price per sqft); this turns that back into lakh."""
    return np.exp(lpps) * np.asarray(area) / 1e5


def add_place(df: pd.DataFrame) -> pd.DataFrame:
    """'City|Locality' lets one encoder learn locality prices; '-' means locality unknown."""
    return df.assign(place=df["city"] + "|" + df["locality"].fillna("-"))


def make_model(**kw):
    prep = ColumnTransformer(
        [("te", TargetEncoder(target_type="continuous", random_state=0), ["city", "place"])],
        remainder="passthrough",
    )
    return make_pipeline(prep, HistGradientBoostingRegressor(max_iter=500, learning_rate=0.06, early_stopping=True, random_state=0, **kw))


def fit_all(X, y):
    return {
        "point": make_model().fit(X, y),
        "lo": make_model(loss="quantile", quantile=0.1).fit(X, y),
        "hi": make_model(loss="quantile", quantile=0.9).fit(X, y),
    }


def evaluate(models, X, y, city):
    lo, p, hi = (models[k].predict(X) for k in ("lo", "point", "hi"))
    actual, pred = to_price(y, X["area_sqft"]), to_price(p, X["area_sqft"])
    ape = np.abs(pred - actual) / actual
    per_city = {c: round(float(np.median(ape[(city == c).to_numpy()])) * 100, 1) for c in city.unique()}
    return {
        "r2_log": round(r2_score(np.log(actual), np.log(pred)), 3),
        "mae_lakh": round(mean_absolute_error(actual, pred), 1),
        "median_error_pct": round(float(np.median(ape)) * 100, 1),
        "range_coverage_pct": round(float(np.mean((y >= lo) & (y <= hi))) * 100, 1),
        "median_error_pct_by_city": per_city,
    }


def build_stats(df, models, X_test, y_test):
    df = df.assign(pps=df["price_lakh"] * 1e5 / df["area_sqft"])
    cities = df.groupby("city").agg(listings=("pps", "size"), median_price_lakh=("price_lakh", "median"), median_pps=("pps", "median"))
    loc = df.dropna(subset=["locality"]).groupby(["city", "locality"])["pps"].agg(["size", "median"])
    loc = loc[loc["size"] >= MIN_LOCALITY_ROWS]
    # score in log-price terms so shuffling area is punished (the model itself predicts price per sqft)
    def neg_mae(est, X, y):
        return -np.mean(np.abs(est.predict(X) + np.log(X["area_sqft"] / 1e5) - y))
    imp = permutation_importance(models["point"], X_test[:4000], np.log(to_price(y_test[:4000], X_test["area_sqft"][:4000])),
                                 scoring=neg_mae, n_repeats=3, random_state=0)
    return {
        "total_listings": len(df),
        "cities": cities.round(1).sort_values("listings", ascending=False).reset_index().to_dict("records"),
        "by_bedrooms": df[df["bedrooms"] <= 5].groupby(["city", "bedrooms"])["price_lakh"].median().round(1).reset_index().to_dict("records"),
        "localities": {c: sorted(g.index.get_level_values("locality")) for c, g in loc.groupby(level="city")},
        "top_localities": loc.sort_values("median", ascending=False).head(15).round(0).reset_index()
                             .rename(columns={"size": "listings", "median": "median_pps"}).to_dict("records"),
        "importance": {k: round(float(v), 3) for k, v in sorted(zip(["City", "Locality", "Area", "Bedrooms", "Bathrooms", "Resale", "Amenities"], imp.importances_mean), key=lambda t: -t[1])},
        "sources": df["source"].value_counts().to_dict(),
    }


if __name__ == "__main__":
    df = add_place(pd.read_csv("data/clean/listings.csv.gz", low_memory=False))
    X, y = df[FEATURES], np.log(df["price_lakh"] * 1e5 / df["area_sqft"])
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=0)

    metrics = evaluate(fit_all(X_tr, y_tr), X_te, y_te, X_te["city"])
    print(json.dumps(metrics, indent=1))
    assert metrics["r2_log"] > 0.65, "model is worse than expected, check the data"

    models = fit_all(X, y)  # production model sees every listing
    OUT.mkdir(exist_ok=True)
    joblib.dump(models, OUT / "model.joblib", compress=3)
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=1))
    (OUT / "stats.json").write_text(json.dumps(build_stats(df, models, X_te, y_te), indent=1))
    print("saved to", OUT)
