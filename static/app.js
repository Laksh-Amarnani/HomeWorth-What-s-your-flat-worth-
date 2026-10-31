const $ = (id) => document.getElementById(id);
const fmt = (lakh) => (lakh >= 100 ? `₹ ${(lakh / 100).toFixed(2)} Cr` : `₹ ${lakh.toFixed(1)} L`);

let bedrooms = 2;

function fillLocalities() {
  const list = LOCALITIES[$("city").value] || [];
  const sel = $("locality");
  sel.replaceChildren(new Option("Not sure", ""));
  list.forEach((l) => sel.add(new Option(l, l)));
  sel.disabled = !list.length;
  $("loc-hint").textContent = list.length ? `(${list.length} known)` : "(not available for this city yet)";
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
  btn.disabled = true; btn.textContent = "Estimating…"; err.hidden = true;
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
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    show(data);
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = "Estimate price";
  }
});

function show(d) {
  $("empty").hidden = true; $("out").hidden = false;
  $("price").textContent = fmt(d.price_lakh);
  $("low").textContent = fmt(d.low_lakh); $("high").textContent = fmt(d.high_lakh);
  $("dot").style.left = `${((d.price_lakh - d.low_lakh) / Math.max(d.high_lakh - d.low_lakh, 0.1)) * 100}%`;
  $("pps").textContent = `₹ ${d.price_per_sqft.toLocaleString("en-IN")}`;
  $("vs").textContent = `${d.vs_city_pct > 0 ? "+" : ""}${d.vs_city_pct}%`;
  $("vs").className = d.vs_city_pct > 0 ? "up" : "down";
  $("err").textContent = `±${d.typical_error_pct}%`;
  $("similar").replaceChildren(...d.similar.map((s) => {
    const tr = document.createElement("tr");
    [s.locality || "—", `${Math.round(s.area_sqft)} sq ft`, s.bedrooms, fmt(s.price_lakh)].forEach((v, i) => {
      const td = document.createElement("td"); td.textContent = v; if (i === 3) td.className = "r"; tr.append(td);
    });
    return tr;
  }));
  if (window.innerWidth < 900) $("result").scrollIntoView({ behavior: "smooth" });
}

fillLocalities();
