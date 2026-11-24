// Safe HTML templating. Every interpolated value is escaped unless wrapped in UI.raw().
// Exercise names and other values come from your data, so never build HTML by string concat.
(function (root, factory) {
  const m = factory();
  if (typeof module === "object" && module.exports) module.exports = m;
  else root.UI = m;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

  class Raw {
    constructor(s) { this.s = s; }
    toString() { return this.s; }
  }
  const raw = (s) => new Raw(String(s));
  const render = (v) =>
    v instanceof Raw ? v.s : Array.isArray(v) ? v.map(render).join("") : v === false || v == null ? "" : esc(v);

  /** Tagged template: html`<p>${name}</p>` returns a Raw that is safe to nest. */
  function html(strings, ...values) {
    let out = strings[0];
    values.forEach((v, i) => (out += render(v) + strings[i + 1]));
    return new Raw(out);
  }

  const tile = (label, value, hint) =>
    html`<div class="card tile"><div class="label">${label}</div><div class="value">${value}</div>${hint ? html`<div class="hint">${hint}</div>` : ""}</div>`;

  return { esc, raw, html, tile };
});
