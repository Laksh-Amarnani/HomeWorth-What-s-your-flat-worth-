const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const INK = css("--ink");
Chart.defaults.color = INK;
Chart.defaults.borderColor = "rgba(31,26,92,.12)";
Chart.defaults.font.family = css("--body");
Chart.defaults.font.size = 13;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = INK;
Chart.defaults.plugins.tooltip.titleFont = { family: css("--display"), weight: "700", size: 14 };
Chart.defaults.plugins.tooltip.padding = 10;

const bar = (id, labels, data, { horizontal = false, color, outline = 0, fmt = (v) => v.toLocaleString("en-IN") }) =>
  new Chart(document.getElementById(id), {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: color, borderColor: INK, borderWidth: outline, maxBarThickness: 24 }] },
    options: {
      indexAxis: horizontal ? "y" : "x", maintainAspectRatio: false,
      scales: { [horizontal ? "y" : "x"]: { ticks: { autoSkip: false, font: { size: 12 } } } }, // show every city name
      plugins: { tooltip: { callbacks: { label: (c) => fmt(c.parsed[horizontal ? "x" : "y"]) } } },
    },
  });

const rupees = (v) => `₹ ${v.toLocaleString("en-IN")} per sq ft`;

const byPps = [...STATS.cities].sort((a, b) => b.median_pps - a.median_pps);
bar("c-city", byPps.map((c) => c.city), byPps.map((c) => c.median_pps), { horizontal: true, color: css("--pink"), fmt: rupees });

bar("c-imp", Object.keys(STATS.importance), Object.values(STATS.importance), { horizontal: true, color: css("--gold"), outline: 2, fmt: (v) => v.toFixed(3) });

bar("c-loc", STATS.top_localities.map((l) => `${l.locality}, ${l.city}`), STATS.top_localities.map((l) => l.median_pps),
  { horizontal: true, color: INK, fmt: rupees });

const byErr = Object.entries(ERR).sort((a, b) => b[1] - a[1]);
bar("c-err", byErr.map((e) => e[0]), byErr.map((e) => e[1]), { horizontal: true, color: css("--violet"), fmt: (v) => `${v}% off` });

let bhk;
function drawBhk() {
  const rows = STATS.by_bedrooms.filter((r) => r.city === document.getElementById("bhk-city").value);
  bhk?.destroy();
  bhk = bar("c-bhk", rows.map((r) => `${r.bedrooms} BHK`), rows.map((r) => r.price_lakh), { color: css("--teal"), outline: 2, fmt: (v) => `₹ ${v} lakh` });
}
document.getElementById("bhk-city").addEventListener("change", drawBhk);
drawBhk();
