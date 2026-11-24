// Display helpers. JEFIT stores weight in pounds everywhere; convert only at display time.
(function (root, factory) {
  const m = factory();
  if (typeof module === "object" && module.exports) module.exports = m;
  else root.Format = m;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  let unit = "lb";
  let timeZone;

  function configure(cfg = {}) {
    unit = cfg.unit === "kg" ? "kg" : "lb";
    timeZone = cfg.timeZone || undefined;
  }
  const weightUnit = () => unit;
  const fromLbs = (lbs) => (unit === "kg" ? lbs * 0.45359237 : lbs);
  const fmtWeight = (lbs, digits = 1) => `${Number(fromLbs(lbs).toFixed(digits)).toLocaleString("en-US")} ${unit}`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  function fmtDuration(sec) {
    if (sec == null) return "—";
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return s ? `${m}m ${s}s` : `${m}m`;
    return `${s}s`;
  }

  const fmtDate = (unix) =>
    new Date(unix * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone });
  const fmtShortDate = (unix) =>
    new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });

  function fmtAgo(iso, now = Date.now()) {
    const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    if (s < 90) return "just now";
    if (s < 5400) return `${Math.round(s / 60)} min ago`;
    if (s < 129600) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} days ago`;
  }

  /** Describe a logged set using only the fields that apply to its record type. */
  function describeSet(s, type) {
    switch (type) {
      case "weight_and_reps": return `${fmtWeight(s.weight ?? 0)} × ${s.reps ?? 0}`;
      case "reps": return `${s.reps ?? 0} reps`;
      case "reps_and_duration": return `${s.reps ?? 0} reps · ${fmtDuration(s.duration)}`;
      case "duration": return fmtDuration(s.duration);
      case "cardio": {
        const parts = [fmtDuration(s.duration)];
        if (s.distance) parts.push(`${s.distance} dist`);
        if (s.calories) parts.push(`${s.calories} cal`);
        return parts.join(" · ");
      }
      default: return "—";
    }
  }

  /** Calendar date {y, m (1-12), d} of `unix` in the configured time zone (device zone if unset). */
  function dateParts(unix) {
    const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "numeric", day: "numeric", timeZone })
      .formatToParts(new Date(unix * 1000));
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return { y: get("year"), m: get("month"), d: get("day") };
  }

  // Period starts are calendar dates stored as UTC midnight (see Metrics.dayKey), so format them in UTC.
  const utc = (key, opts) => new Date(key * 1000).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  function fmtPeriod(key, period) {
    if (period === "year") return utc(key, { year: "numeric" });
    if (period === "month") return utc(key, { month: "short" }) + " ’" + utc(key, { year: "2-digit" });
    return utc(key, { month: "short", day: "numeric" });
  }
  const fmtMonth = (key) => utc(key, { month: "long", year: "numeric" });

  return { configure, weightUnit, fromLbs, fmtWeight, plural, fmtDuration, fmtDate, fmtShortDate, fmtAgo, describeSet,
    dateParts, fmtPeriod, fmtMonth };
});
