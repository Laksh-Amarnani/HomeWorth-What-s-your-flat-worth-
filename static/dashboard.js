const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
Chart.defaults.color = css("--muted");
Chart.defaults.borderColor = "rgba(255,255,255,.08)";
Chart.defaults.font.family = "Inter, system-ui, sans-serif";
Chart.defaults.plugins.legend.display = false;

const bar = (id, labels, data, { horizontal = false, color = css("--accent"), fmt = (v) => v.toLocaleString("en-IN") } = {}) =>
  new Chart(document.getElementById(id), {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 6, maxBarThickness: 26 }] },
    options: {
      indexAxis: horizontal ? "y" : "x", maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: (c) => fmt(c.parsed[horizontal ? "x" : "y"]) } } },
    },
  });

const byPps = [...STATS.cities].sort((a, b) => b.median_pps - a.median_pps);
bar("c-city", byPps.map((c) => c.city), byPps.map((c) => c.median_pps), { horizontal: true, fmt: (v) => `₹ ${v.toLocaleString("en-IN")} / sq ft` });

bar("c-imp", Object.keys(STATS.importance), Object.values(STATS.importance), { horizontal: true, color: css("--accent2"), fmt: (v) => v.toFixed(3) });

bar("c-loc", STATS.top_localities.map((l) => `${l.locality}, ${l.city}`), STATS.top_localities.map((l) => l.median_pps),
  { horizontal: true, color: "#8a6cff", fmt: (v) => `₹ ${v.toLocaleString("en-IN")} / sq ft` });

const byErr = Object.entries(ERR).sort((a, b) => b[1] - a[1]);
bar("c-err", byErr.map((e) => e[0]), byErr.map((e) => e[1]), { horizontal: true, color: "#ff8a7a", fmt: (v) => `${v}%` });

let bhk;
function drawBhk() {
  const rows = STATS.by_bedrooms.filter((r) => r.city === document.getElementById("bhk-city").value);
  bhk?.destroy();
  bhk = bar("c-bhk", rows.map((r) => `${r.bedrooms} BHK`), rows.map((r) => r.price_lakh), { fmt: (v) => `₹ ${v} lakh` });
}
document.getElementById("bhk-city").addEventListener("change", drawBhk);
drawBhk();
