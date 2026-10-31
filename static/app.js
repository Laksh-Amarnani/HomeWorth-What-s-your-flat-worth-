const $ = (id) => document.getElementById(id);
const fmt = (lakh) => (lakh >= 100 ? `₹ ${(lakh / 100).toFixed(2)} Cr` : `₹ ${lakh.toFixed(1)} L`);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let bedrooms = 2;

function fillLocalities() {
  const list = LOCALITIES[$("city").value] || [];
  const sel = $("locality");
  sel.replaceChildren(new Option("Not sure", ""));
  list.forEach((l) => sel.add(new Option(l, l)));
  sel.disabled = !list.length;
  $("loc-hint").textContent = list.length ? `${list.length} to pick from` : "not available for this city yet";
}

$("city").addEventListener("change", fillLocalities);
$("area").addEventListener("input", (e) => ($("area-out").textContent = e.target.value));
function setBedrooms(n) {
  bedrooms = n;
  document.querySelectorAll("#bedrooms button").forEach((x) => {
    const on = +x.dataset.v === n;
    x.classList.toggle("on", on);
    x.setAttribute("aria-checked", on);
  });
}
$("bedrooms").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) setBedrooms(+b.dataset.v);
});

const inputs = () => ({
  city: $("city").value, locality: $("locality").value, area: $("area").value, bedrooms,
  bathrooms: $("bathrooms").value, condition: $("condition").value, amenities: $("amenities").value,
  asking: $("asking").value,
});

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.currentTarget.querySelector(".cta"), err = $("error");
  btn.disabled = true; btn.textContent = "Working it out…"; err.hidden = true;
  const sent = inputs();  // the form can change while we wait, so the answer is tied to what was sent
  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sent),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
    show(data);
    document.dispatchEvent(new CustomEvent("estimate", { detail: { d: data, inputs: sent } }));
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = "Get the price";
  }
});

// the price counts up from zero so a new answer is noticed
function countUp(el, target) {
  if (reduceMotion) { el.textContent = fmt(target); return; }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min((now - start) / 700, 1);
    el.textContent = fmt(target * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function show(d) {
  const city = $("city").value;
  $("empty").hidden = true; $("out").hidden = false;
  countUp($("price"), d.price_lakh);
  $("low").textContent = fmt(d.low_lakh); $("high").textContent = fmt(d.high_lakh);
  $("dot").style.left = `${((d.price_lakh - d.low_lakh) / Math.max(d.high_lakh - d.low_lakh, 0.1)) * 100}%`;
  $("pps").textContent = `₹ ${d.price_per_sqft.toLocaleString("en-IN")}`;
  $("vs").textContent = `${d.vs_city_pct > 0 ? "+" : ""}${d.vs_city_pct}%`;
  $("vs").className = d.vs_city_pct > 0 ? "up" : "down";
  $("vs-label").textContent = `${d.vs_city_pct > 0 ? "above" : "below"} the ${city} median per sq ft`;
  $("err").textContent = `±${d.typical_error_pct}%`;
  $("err-label").textContent = `how far off we usually are in ${city}`;
  $("similar").replaceChildren(...d.similar.map((s) => {
    const tr = document.createElement("tr");
    [s.locality || city, `${Math.round(s.area_sqft)} sq ft`, s.bedrooms, fmt(s.price_lakh)].forEach((v, i) => {
      const td = document.createElement("td"); td.textContent = v; if (i === 3) td.className = "r"; tr.append(td);
    });
    return tr;
  }));
  showDeal(d.deal);
  showRent(d.rent, city);
  showFactors(d.factors);
  $("result").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

const signed = (lakh) => `${lakh > 0 ? "+" : "−"}${fmt(Math.abs(lakh))}`;

function showDeal(deal) {
  const box = $("deal");
  box.hidden = !deal;
  if (!deal) return;
  const c = { under: ["Priced below the usual range", "teal"], fair: ["A fair ask", "teal"], high: ["A bit high", "gold"], over: ["Overpriced", "pink"] }[deal.verdict];
  box.className = `deal ${c[1]}`;
  $("deal-head").textContent = `${c[0]}: ${fmt(deal.asking_lakh)} is ${Math.abs(deal.diff_pct)}% ${deal.diff_pct < 0 ? "below" : "above"} our estimate`;
  $("deal-body").textContent = deal.verdict === "under"
    ? "Good news, but ask why. Age, floor, legal papers or condition could explain it."
    : `Open around ${fmt(deal.open_lakh)} and don't go above ${fmt(deal.limit_lakh)}. Our estimate is usually off by about ${$("err").textContent.replace("±", "")}, so treat this as a guide.`;
}

const fmtRent = (n) => `₹ ${Math.round(n).toLocaleString("en-IN")}`;

function showRent(r, city) {
  $("rent").hidden = !r;
  if (!r) return;
  $("rent-amt").textContent = fmtRent(r.rent);
  $("rent-range").textContent = `a month, usually ${fmtRent(r.low)} to ${fmtRent(r.high)}`;
  $("yield").textContent = `${r.yield_pct}%`;
  $("yield-label").textContent = `a year in rent, against ${r.city_yield_pct}% typical in ${city}`;
  $("repay").textContent = r.years_to_repay;
  $("rent-note").textContent = "Rent is for a semi-furnished flat, from 2022 rentals." +
    (r.shaky ? ` Treat the yield with caution in ${city}: its sale listings look cheap next to its rents.` : "");
}

function showFactors(factors) {
  const items = factors.map((f) => {
    const li = document.createElement("li");
    const name = document.createElement("span"), val = document.createElement("b");
    name.textContent = `${f.label} (vs ${f.versus})`;
    val.textContent = signed(f.effect_lakh); val.className = f.effect_lakh > 0 ? "up" : "down";
    li.append(name, val);
    return li;
  });
  if (!items.length) { const li = document.createElement("li"); li.textContent = "Pick a locality, condition or amenities to see what each one adds."; items.push(li); }
  $("factors").replaceChildren(...items);
}

// compare up to three flats side by side; kept in the page only
let saved = [], last = null;
document.addEventListener("estimate", (e) => (last = e.detail));
$("save").addEventListener("click", () => {
  if (!last) return;
  const i = last.inputs;
  saved = [...saved.slice(-2), { label: `${i.bedrooms} BHK, ${i.area} sq ft, ${i.locality || i.city}`, d: last.d }];
  renderCompare();
});

function renderCompare() {
  $("compare").hidden = !saved.length;
  const rows = [
    ["Likely price", (d) => fmt(d.price_lakh)],
    ["Usual range", (d) => `${fmt(d.low_lakh)} to ${fmt(d.high_lakh)}`],
    ["Per sq ft", (d) => `₹ ${d.price_per_sqft.toLocaleString("en-IN")}`],
    ["Vs city median", (d) => `${d.vs_city_pct > 0 ? "+" : ""}${d.vs_city_pct}%`],
    ["Monthly rent", (d) => (d.rent ? fmtRent(d.rent.rent) : "not available")],
    ["Yearly yield", (d) => (d.rent ? `${d.rent.yield_pct}%` : "not available")],
  ];
  const table = $("compare-table");
  const head = document.createElement("tr");
  head.append(document.createElement("th"));
  saved.forEach((s, n) => {
    const th = document.createElement("th"), rm = document.createElement("button");
    rm.type = "button"; rm.className = "ghost small"; rm.textContent = "Remove";
    rm.addEventListener("click", () => { saved.splice(n, 1); renderCompare(); });
    th.append(s.label, document.createElement("br"), rm);
    head.append(th);
  });
  table.replaceChildren(head, ...rows.map(([name, f]) => {
    const tr = document.createElement("tr"), th = document.createElement("th");
    th.textContent = name; tr.append(th);
    saved.forEach((s) => { const td = document.createElement("td"); td.textContent = f(s.d); tr.append(td); });
    return tr;
  }));
}

// a link carries the form, so opening it fills the form and shows the same estimate
$("share").addEventListener("click", async () => {
  const q = new URLSearchParams(Object.entries(inputs()).filter(([, v]) => v !== ""));
  const url = `${location.origin}/?${q}`, btn = $("share");
  try { await navigator.clipboard.writeText(url); btn.textContent = "Link copied"; }
  catch { $("error").textContent = url; $("error").hidden = false; }
  setTimeout(() => (btn.textContent = "Copy link"), 2000);
});

function fromLink() {
  const q = new URLSearchParams(location.search);
  if (!q.has("city")) return;
  $("city").value = q.get("city"); fillLocalities();
  for (const k of ["locality", "area", "bathrooms", "condition", "amenities", "asking"]) if (q.has(k)) $(k).value = q.get(k);
  $("area-out").textContent = $("area").value;
  setBedrooms(+q.get("bedrooms") || 2);
  $("form").requestSubmit();
}

fillLocalities();
fromLink();
