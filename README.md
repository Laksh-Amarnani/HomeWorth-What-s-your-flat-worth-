---
title: HomeWorth
emoji: 🏠
colorFrom: yellow
colorTo: pink
sdk: docker
app_port: 8000
pinned: false
---

# HomeWorth: house price estimator for 35 Indian cities

Describe a flat (city, locality, area, bedrooms, bathrooms, condition, amenities) and get:

- an **estimated price**, with an **80% likely range** and the price per sq ft against the city median
- the **five most similar listings**
- a **market dashboard**: price per sq ft by city, price by bedrooms, what drives price, priciest localities, and where the model is least accurate

## How it works

| Step | File | What it does |
|---|---|---|
| 1. Data | `prepare_data.py` | Merges the six Kaggle city files (amenities and localities) with the 187k-row listings file (35 cities). Parses Lac/Cr prices and sqft/sqyd/sqm areas, treats amenity value `9` as "not available", removes duplicates, impossible homes and outliers. |
| 2. Model | `train.py` | Gradient boosting on log price per sq ft. City and locality are target-encoded (1,700+ localities, no one-hot columns). Two more models predict the 10th and 90th percentile for the range. |
| 3. App | `app.py`, `predictor.py` | Flask: `/` estimator, `/dashboard`, `/api/predict`, `/health`. |

### Results (held-out 20% of listings)

| | |
|---|---|
| R² (log price) | 0.80 |
| Typical error | 20% |
| 80% range contains the true price | 78.9% of the time |

Accuracy differs by city; see "Where the model is less sure" on the dashboard. Mumbai and Kolkata are weakest because the Kaggle city files are noisy. Localities are only available for the six metros in those files; other cities are estimated at city level. The held-out listings are cleaned the same way as the training data, so errors on unusual listings will be larger.

## Run locally

```bash
python -m venv .venv && source .venv/Scripts/activate      # Windows Git Bash
pip install -r requirements.txt
python app.py                                               # http://localhost:8000
```

The trained model (`models/`) and cleaned data (`data/clean/`) are in the repository, so this works straight away.

### Rebuild the data and model

Download these Kaggle datasets into `data/raw/` (not committed):

- *Housing Prices in Metropolitan Areas of India* (ruchi798): `Bangalore.csv`, `Chennai.csv`, `Delhi.csv`, `Hyderabad.csv`, `Kolkata.csv`, `Mumbai.csv`
- *House Price* (juhibhojani): `house_prices.csv`

```bash
python prepare_data.py     # -> data/clean/listings.csv.gz
python train.py            # -> models/ (fails if R² drops below 0.65)
```

## Deploy to Hugging Face Spaces (free)

The block at the top of this file tells Spaces to build the `Dockerfile` and send traffic to port 8000.

**One-time setup**

1. Create an account at [huggingface.co](https://huggingface.co), then choose *New* > *Space*. Name it `homeworth`, set the SDK to **Docker** with the **Blank** template, hardware **CPU basic (free)**, and visibility **Public**.
2. Create a token: *Settings* > *Access Tokens* > *New token*, role **Write**. Keep it private.
3. Install the uploader: `pip install -U huggingface_hub`

**Deploy** (Git Bash, from this folder)

```bash
hf auth login            # paste the token
hf upload YOUR_USERNAME/homeworth . . --repo-type=space   --exclude "practice_notebooks/*" "data/raw/*" ".git/*" ".venv/*" "__pycache__/*"
```

If `hf` is not found, use `huggingface-cli` instead. Spaces then builds the image, which takes a few minutes. Watch the *Logs* tab. The app is at `https://YOUR_USERNAME-homeworth.hf.space`.

To update after a change, run the same `hf upload` command again.

Free Spaces go to sleep after a period with no visitors, so the first load can be slow. Open the page once before a demo.

Optional local check with Docker: `docker build -t homeworth . && docker run --rm -p 8000:8000 homeworth`.

## Files

```
prepare_data.py   train.py        data pipeline and model training
app.py            predictor.py    Flask app and prediction logic
templates/ static/                pages, styles, charts (Chart.js is bundled, so it works offline)
models/                           trained model, metrics and dashboard stats
data/clean/                       cleaned listings used by the app
Dockerfile                        container used by Hugging Face Spaces
```
