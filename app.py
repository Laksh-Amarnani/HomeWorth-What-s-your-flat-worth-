import csv
import hmac
import io
import os
import re
import time
from collections import defaultdict

from flask import Flask, Response, abort, jsonify, render_template, request
from werkzeug.middleware.proxy_fix import ProxyFix

import leads
import predictor

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)  # Render sits behind a proxy; this gives the real IP, scheme and host
SAFE_TEXT = re.compile(r"[\w .'-]{2,60}")  # letters, digits, space . ' - only: no markup, mentions or links reach the webhook
SENT = defaultdict(list)  # ip -> times of recent leads; in memory, so per worker (we run one)


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
        asking = float(f["asking"]) if f.get("asking") else None
    except (KeyError, ValueError, TypeError):
        return jsonify(error="Please fill in city, area and bedrooms with valid numbers."), 400

    if city not in predictor.CITIES:
        return jsonify(error="Unknown city."), 400
    if not 200 <= area <= 10000:
        return jsonify(error="Area must be between 200 and 10,000 sq ft."), 400
    if not 1 <= bedrooms <= 8 or (bathrooms is not None and not 1 <= bathrooms <= 8):
        return jsonify(error="Bedrooms and bathrooms must be between 1 and 8."), 400
    if asking is not None and not 1 <= asking <= 100000:
        return jsonify(error="Asking price must be between 1 and 100,000 lakh."), 400
    if amenities not in predictor.AMENITY_LEVELS:
        return jsonify(error="Unknown amenities level."), 400
    if locality not in predictor.STATS["localities"].get(city, []):
        locality = None  # an unlisted locality is treated as unknown rather than guessed
    return jsonify(predictor.predict(city, locality, area, bedrooms, bathrooms, resale, amenities, asking))


@app.get("/embed")
def embed():
    return render_template("embed.html", cities=predictor.CITIES, localities=predictor.STATS["localities"], stats=predictor.STATS, brand=request.args.get("brand", "")[:40] or "HomeWorth")


@app.get("/for-brokers")
def for_brokers():
    return render_template("for_brokers.html", stats=predictor.STATS)


@app.post("/api/lead")
def api_lead():
    f = request.get_json(silent=True) or {}
    if f.get("website"):  # hidden field only bots fill in
        return jsonify(ok=True)
    name = str(f.get("name", "")).strip()
    phone = re.sub(r"[\s-]", "", str(f.get("phone", ""))).removeprefix("+91")
    if not SAFE_TEXT.fullmatch(name) or not re.fullmatch(r"[6-9]\d{9}", phone):
        return jsonify(error="Enter your name and a 10-digit mobile number."), 400
    # everything else comes from the estimate, so anything that doesn't fit it is rejected rather than cleaned
    try:
        city, locality, area, bedrooms = f["city"], f.get("locality") or "", float(f["area_sqft"]), int(f["bedrooms"])
        estimate = float(f["estimate_lakh"])
    except (KeyError, ValueError, TypeError):
        return jsonify(error="Get an estimate before leaving your number."), 400
    if (city not in predictor.CITIES or (locality and locality not in predictor.STATS["localities"].get(city, []))
            or not 200 <= area <= 10000 or not 1 <= bedrooms <= 8 or not 0 < estimate <= 100000):
        return jsonify(error="Get an estimate before leaving your number."), 400
    brand = str(f.get("brand", ""))
    recent = [t for t in SENT[request.remote_addr] if time.time() - t < 3600]
    if len(recent) >= 5:
        return jsonify(error="Too many requests. Please try again in an hour."), 429
    SENT[request.remote_addr] = recent + [time.time()]
    leads.save({"brand": brand if SAFE_TEXT.fullmatch(brand) else "HomeWorth", "name": name, "phone": phone, "city": city,
                "locality": locality, "area_sqft": area, "bedrooms": bedrooms, "estimate_lakh": estimate})
    return jsonify(ok=True)


@app.get("/leads.csv")
def leads_csv():
    key = os.environ.get("ADMIN_KEY")
    if not key:
        abort(404)
    # Basic auth keeps the key out of the URL, which gunicorn's access log would print; any username works
    auth = request.authorization
    if not auth or not hmac.compare_digest((auth.password or "").encode(), key.encode()):
        return Response("Password required", 401, {"WWW-Authenticate": 'Basic realm="HomeWorth leads"'})
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(leads.COLUMNS)
    # a leading = + - @ would make Excel run the cell as a formula
    w.writerows([("'" + v if v and str(v)[0] in "=+-@\t\r" else v for v in row) for row in leads.all_rows()])
    return Response(out.getvalue(), mimetype="text/csv", headers={"Cache-Control": "no-store"})


@app.get("/health")
def health():
    return "ok"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=False)
