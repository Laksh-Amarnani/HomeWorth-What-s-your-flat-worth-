# HomeWorth: house price estimator for 35 Indian cities

Describe a flat (city, locality, area, bedrooms, bathrooms, condition, amenities) and get:

- an **estimated price**, with an **80% likely range** and the price per sq ft against the city median
- a **deal check**: add an asking price and it says if it is fair, with where to open and where to stop
- **what moved the price**: what the locality, condition, amenities and bathrooms each add
- the **five most similar listings**, a **compare** table for up to three flats, and a **link** that reopens the same estimate
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

## Broker widget

`/for-brokers` gives a one-line `<iframe>` that puts the estimator on a broker's own site. Visitors who get an estimate can leave a name and number; the lead is saved and sent to a webhook.

| Setting | What it does |
|---|---|
| `LEAD_WEBHOOK_URL` | A Slack or Discord incoming-webhook URL. Each lead is posted there. This is the copy that survives restarts. |
| `ADMIN_KEY` | The password for `/leads.csv`, which downloads every lead. Your browser asks for it (type any username). Without `ADMIN_KEY` set, the page returns 404. |
| `LEADS_DB` | Where the SQLite file lives. The default is the temp folder, which Render's free plan wipes on restart. |

Leads are limited to 5 per IP per hour, and a hidden field catches simple bots.

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

## Deploy to Render (free)

Render builds the `Dockerfile` straight from a GitHub repository, and `render.yaml` holds the settings (free plan, Singapore region, health check on `/health`).

**1. Put the code on GitHub** (once). Create an empty repository on github.com, without a README or `.gitignore`, then run this from the project folder:

```bash
git remote add origin https://github.com/YOUR_USERNAME/homeworth.git
git push -u origin main
```

**2. Create the service on Render**

1. Sign up at [render.com](https://render.com) with your GitHub account.
2. Choose *New* > *Blueprint*, pick the `homeworth` repository and press *Apply*.
3. Wait for the first build, which takes a few minutes. Watch the *Logs* tab.
4. The site is at `https://homeworth.onrender.com`, or a similar name if that one is taken.

Every later `git push` redeploys automatically.

**Free plan limits**

- The service goes to sleep after about 15 minutes with no visitors. The next visit takes up to a minute to wake it. Open the page before a demo.
- It has 512 MB of memory. The app uses about 200 MB.

Optional local check with Docker: `docker build -t homeworth . && docker run --rm -p 8000:8000 homeworth`.

## Files

```
prepare_data.py   train.py        data pipeline and model training
app.py            predictor.py    Flask app and prediction logic
templates/ static/                pages, styles, charts (Chart.js is bundled, so it works offline)
models/                           trained model, metrics and dashboard stats
data/clean/                       cleaned listings used by the app
leads.py                          lead storage and webhook for the broker widget
Dockerfile  render.yaml           container and Render settings
```
