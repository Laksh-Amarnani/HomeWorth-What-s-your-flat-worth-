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
$("bedrooms").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  bedrooms = +b.dataset.v;
  document.querySelectorAll("#bedrooms button").forEach((x) => {
    x.classList.toggle("on", x === b);
    x.setAttribute("aria-checked", x === b);
  });
});

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter, err = $("error");
  btn.disabled = true; btn.textContent = "Working it out…"; err.hidden = true;
  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city: $("city").value, locality: $("locality").value, area: $("area").value, bedrooms,
        bathrooms: $("bathrooms").value, condition: $("condition").value, amenities: $("amenities").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
    show(data);
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
  $("result").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

fillLocalities();
