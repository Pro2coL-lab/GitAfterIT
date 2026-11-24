// Dependency-free SVG charts. Points: [{ label, value }].
(function (root, factory) {
  const m = factory(typeof require === "function" && typeof module === "object" ? require("./ui.js") : root.UI);
  if (typeof module === "object" && module.exports) module.exports = m;
  else root.Charts = m;
})(typeof globalThis !== "undefined" ? globalThis : this, function (UI) {
  const { html } = UI;

const W = 600, H = 240, PAD = { top: 10, right: 10, bottom: 26, left: 52 };

function niceTicks(min, max, count = 4) {
  if (min === max) { max = min + 1; min = Math.max(0, min - 1); }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

const fmtNum = (v) => (Math.abs(v) >= 10000 ? `${+(v / 1000).toFixed(1)}k` : Number(v.toFixed(1)).toLocaleString());

function frame(points, ticks, body) {
  const innerW = W - PAD.left - PAD.right, innerH = H - PAD.top - PAD.bottom;
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const y = (v) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;
  const every = Math.max(1, Math.ceil(points.length / 6));
  const xFor = (i, n) => PAD.left + (innerW * (i + 0.5)) / n;
  const grid = ticks.map((t) => html`
    <line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="tick" x="${PAD.left - 8}" y="${y(t) + 4}" text-anchor="end">${fmtNum(t)}</text>`);
  const labels = points.map((p, i) =>
    i % every === 0 || i === points.length - 1 && points.length - 1 - i >= every / 2
      ? html`<text class="tick" x="${xFor(i, points.length)}" y="${H - 6}" text-anchor="middle">${p.label}</text>` : "");
  return html`<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${grid}${labels}${body({ y, xFor, innerW, lo })}</svg></div>`;
}

function barChart(points, unit, alt = false) {
  if (!points.length) return html`<p class="muted">No data.</p>`;
  const ticks = niceTicks(0, Math.max(...points.map((p) => p.value), 0));
  return frame(points, ticks, ({ y, xFor, innerW }) => {
    const bw = (innerW / points.length) * 0.7;
    return points.map((p, i) => html`
      <rect class="bar${alt ? " alt" : ""}" rx="3" x="${xFor(i, points.length) - bw / 2}" y="${y(p.value)}"
        width="${bw}" height="${Math.max(0, y(0) - y(p.value))}"><title>${p.label}: ${fmtNum(p.value)} ${unit}</title></rect>`);
  });
}

function lineChart(points, unit) {
  if (!points.length) return html`<p class="muted">No data.</p>`;
  const vals = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals));
  return frame(points, ticks, ({ y, xFor }) => {
    const d = points.map((p, i) => `${i ? "L" : "M"}${xFor(i, points.length).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
    return html`<path class="line" d="${d}"/>${points.map((p, i) => html`
      <circle class="dot" r="3.5" cx="${xFor(i, points.length)}" cy="${y(p.value)}"><title>${p.label}: ${fmtNum(p.value)} ${unit}</title></circle>`)}`;
  });
}

  return { barChart, lineChart, niceTicks };
});
