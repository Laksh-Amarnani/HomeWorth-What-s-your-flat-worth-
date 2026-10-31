// lead form for the broker widget: shown once an estimate exists, sent with the estimate attached
let estimate = null;
document.addEventListener("estimate", (e) => { estimate = e.detail; $("lead").hidden = false; });

$("lead-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget, btn = form.querySelector(".cta"), msg = $("lead-msg"), i = estimate.inputs;
  btn.disabled = true; msg.hidden = true;
  try {
    const res = await fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $("lead-name").value, phone: $("lead-phone").value, website: $("lead-website").value, brand: BRAND,
        city: i.city, locality: i.locality, area_sqft: i.area, bedrooms: i.bedrooms, estimate_lakh: estimate.d.price_lakh,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
    form.replaceChildren(Object.assign(document.createElement("h2"), { textContent: `Thanks. ${BRAND} will call you soon.` }));
  } catch (ex) {
    msg.textContent = ex.message; msg.hidden = false; btn.disabled = false;
  }
});
