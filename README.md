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

## Deploy to AWS (ECS Fargate behind a load balancer)

**One-time setup**

1. Create an AWS account and an IAM user with programmatic access (AdministratorAccess is simplest for a course project). Keep the keys private.
2. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and the [AWS CLI v2](https://aws.amazon.com/cli/).
3. Run `aws configure` and enter the keys, region `ap-south-1` (Mumbai), output `json`.

**Deploy** (Git Bash, from this folder)

```bash
# 1. test the container on your PC first
docker build -t homeworth .
docker run --rm -p 8000:8000 homeworth        # open http://localhost:8000, Ctrl+C to stop

# 2. build, push to Amazon ECR and create the whole stack
export AWS_REGION=ap-south-1
./scripts/deploy_ecs.sh                       # prints: Website: http://....elb.amazonaws.com
```

The first deploy takes 5 to 10 minutes. Open the printed address; the page may take a minute more to respond while the container starts. To update after a change, commit and run `./scripts/deploy_ecs.sh` again.

**What gets created:** a VPC with two public subnets, an Application Load Balancer, an ECS cluster and Fargate service (0.5 vCPU, 1 GB), a CloudWatch log group and an ECR repository. All of it is described in `infra/ecs-fargate.yaml`.

**Cost:** roughly US$1 to 2 per day while running (the load balancer is the largest part). Delete everything when you are done:

```bash
export AWS_REGION=ap-south-1
./scripts/cleanup_ecs.sh                      # asks you to type yes
```

Optional HTTPS: get a domain and an ACM certificate, then `export CERTIFICATE_ARN=...` before running `deploy_ecs.sh`.

## Files

```
prepare_data.py   train.py        data pipeline and model training
app.py            predictor.py    Flask app and prediction logic
templates/ static/                pages, styles, charts (Chart.js is bundled, so it works offline)
models/                           trained model, metrics and dashboard stats
data/clean/                       cleaned listings used by the app
Dockerfile  infra/  scripts/      container and AWS deployment
```
