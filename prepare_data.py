"""Merge the Kaggle city files and the 187k-row listings file into one clean table.

Run: python prepare_data.py   ->  data/clean/listings.csv.gz
"""
from pathlib import Path

import numpy as np
import pandas as pd

RAW, OUT = Path("data/raw"), Path("data/clean")
CITY_FILES = ["Bangalore", "Chennai", "Delhi", "Hyderabad", "Kolkata", "Mumbai"]
CITY_NAMES = {"Bangalore": "Bengaluru", "New Delhi": "Delhi"}
MIN_CITY_ROWS = 500


def city_files() -> pd.DataFrame:
    """ruchi798 files: price in rupees, locality, 0/1 amenities (9 = not available)."""
    frames = []
    for name in CITY_FILES:
        d = pd.read_csv(RAW / f"{name}.csv")
        amenities = d.iloc[:, 5:]
        frames.append(pd.DataFrame({
            "city": name,
            "locality": d["Location"].str.strip(),
            "area_sqft": d["Area"],
            "bedrooms": d["No. of Bedrooms"],
            "bathrooms": np.nan,
            "resale": d["Resale"].replace(9, np.nan),
            "amenity_count": (amenities == 1).sum(axis=1).where(~(amenities == 9).all(axis=1)),
            "price_lakh": d["Price"] / 1e5,
            "source": "city_files",
        }))
    return pd.concat(frames).drop_duplicates(["city", "locality", "area_sqft", "bedrooms", "price_lakh"])


def _to_lakh(s: pd.Series) -> pd.Series:
    m = s.str.extract(r"([\d.]+)\s*(Lac|Cr)")  # "Call for Price" rows become NaN
    return pd.to_numeric(m[0], errors="coerce") * m[1].map({"Lac": 1, "Cr": 100})


def _to_sqft(s: pd.Series) -> pd.Series:
    m = s.str.extract(r"([\d.,]+)\s*(sqft|sqyrd|sqm)")
    n = pd.to_numeric(m[0].str.replace(",", ""), errors="coerce")
    return n * m[1].map({"sqft": 1, "sqyrd": 9, "sqm": 10.764})


def listings_file() -> pd.DataFrame:
    """house_prices.csv: 187k listings across ~80 cities, no locality or amenities."""
    d = pd.read_csv(RAW / "house_prices.csv").drop_duplicates(["Title", "Description", "Amount(in rupees)"])
    # shortcut: carpet -> super-built-up uses a flat 1.25 factor, replace with a per-city ratio if accuracy matters
    area = _to_sqft(d["Super Area"]).fillna(_to_sqft(d["Carpet Area"]) * 1.25)
    return pd.DataFrame({
        "city": d["location"].str.replace("-", " ").str.title(),
        "locality": np.nan,
        "area_sqft": area,
        "bedrooms": pd.to_numeric(d["Title"].str.extract(r"^(\d+) BHK")[0], errors="coerce"),
        "bathrooms": pd.to_numeric(d["Bathroom"], errors="coerce"),
        "resale": d["Transaction"].map({"Resale": 1, "New Property": 0}),
        "amenity_count": np.nan,
        "price_lakh": _to_lakh(d["Amount(in rupees)"]),
        "source": "listings_file",
    })


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.assign(city=df["city"].replace(CITY_NAMES))
    df = df.dropna(subset=["city", "area_sqft", "bedrooms", "price_lakh"])
    df = df[
        df["area_sqft"].between(200, 10000)
        & df["bedrooms"].between(1, 8)
        & (df["area_sqft"] / df["bedrooms"] >= 200)  # no 5-bedroom homes of 600 sqft
        & df["price_lakh"].between(5, 5000)
    ]
    # drop the extreme 1% each side of price per sqft within each city
    pps = np.log(df["price_lakh"] * 1e5 / df["area_sqft"])
    g = pps.groupby(df["city"])
    df = df[(pps >= g.transform(lambda s: s.quantile(0.01))) & (pps <= g.transform(lambda s: s.quantile(0.99)))]
    return df[df.groupby("city")["city"].transform("size") >= MIN_CITY_ROWS].reset_index(drop=True)


if __name__ == "__main__":
    df = clean(pd.concat([city_files(), listings_file()], ignore_index=True))
    assert df[["city", "area_sqft", "bedrooms", "price_lakh"]].notna().all().all()
    assert df["price_lakh"].between(5, 5000).all()
    OUT.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT / "listings.csv.gz", index=False)
    print(f"{len(df):,} listings, {df['city'].nunique()} cities, {df['locality'].nunique()} localities")
    print(df.groupby("city")["price_lakh"].agg(["size", "median"]).sort_values("size", ascending=False).round(1).to_string())
