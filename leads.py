"""Saves a lead from the broker widget and forwards it to the broker's webhook (Slack, Discord, Zapier...)."""
import json
import os
import sqlite3
import tempfile
import time
import urllib.request

# shortcut: SQLite in the temp folder is wiped when Render restarts the free plan; the webhook copy is the durable one, upgrade to Postgres for real use
DB = os.environ.get("LEADS_DB", os.path.join(tempfile.gettempdir(), "leads.db"))
WEBHOOK = os.environ.get("LEAD_WEBHOOK_URL")
COLUMNS = ["created", "brand", "name", "phone", "city", "locality", "area_sqft", "bedrooms", "estimate_lakh"]


def _db():
    con = sqlite3.connect(DB)
    con.execute(f"CREATE TABLE IF NOT EXISTS leads ({', '.join(c + ' TEXT' for c in COLUMNS)})")
    return con


def save(lead: dict):
    lead = {**lead, "created": time.strftime("%Y-%m-%d %H:%M:%S")}
    with _db() as con:
        con.execute(f"INSERT INTO leads VALUES ({','.join('?' * len(COLUMNS))})", [lead.get(c) for c in COLUMNS])
    if WEBHOOK:
        msg = (f"New lead for {lead['brand']}: {lead['name']}, {lead['phone']}. "
               f"{lead['bedrooms']} BHK, {lead['area_sqft']} sq ft in {lead['locality'] or lead['city']}, estimate ₹{lead['estimate_lakh']} L")
        req = urllib.request.Request(WEBHOOK, json.dumps({"content": msg, "text": msg, "allowed_mentions": {"parse": []}}).encode(),
                                     {"Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=4).close()
        except OSError as e:  # the lead is already saved; a dead webhook must not lose it or fail the visitor
            print("lead webhook failed:", e)


def all_rows():
    with _db() as con:
        return con.execute(f"SELECT {', '.join(COLUMNS)} FROM leads ORDER BY created DESC").fetchall()
