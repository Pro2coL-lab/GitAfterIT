// Training math. All weights in pounds.
(function (root, factory) {
  const m = factory();
  if (typeof module === "object" && module.exports) module.exports = m;
  else root.Metrics = m;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const working = (s) => s.type !== "warm-up";

  /** Volume of a log: weight × reps over working sets. Only meaningful for weight_and_reps. */
  function logVolume(l) {
    if (l.record_type !== "weight_and_reps") return 0;
    return l.log_sets.filter(working).reduce((t, s) => t + (s.weight ?? 0) * (s.reps ?? 0), 0);
  }
  const sessionVolume = (s) => s.logs.reduce((t, l) => t + logVolume(l), 0);
  const sessionSets = (s) => s.logs.reduce((t, l) => t + l.log_sets.filter(working).length, 0);

  /** Epley estimated one-rep max. */
  const e1rm = (weight, reps) => (reps <= 1 ? weight : weight * (1 + reps / 30));

  /** Per-workout progress figures for one exercise log, by record type. */
  function progressPoint(l) {
    const sets = l.log_sets.filter(working);
    const sum = (f) => sets.reduce((t, s) => t + (s[f] ?? 0), 0);
    const max = (fn) => Math.max(0, ...sets.map(fn));
    const p = { date: l.date };
    switch (l.record_type) {
      case "weight_and_reps":
        p.bestE1rm = max((s) => e1rm(s.weight ?? 0, s.reps ?? 0));
        p.topWeight = max((s) => s.weight ?? 0);
        p.volume = logVolume(l);
        break;
      case "reps":
        p.maxReps = max((s) => s.reps ?? 0);
        p.totalReps = sum("reps");
        break;
      case "reps_and_duration":
        p.totalReps = sum("reps");
        p.totalDuration = sum("duration");
        break;
      case "duration":
        p.totalDuration = sum("duration");
        break;
      case "cardio":
        p.totalDuration = sum("duration");
        p.distance = sum("distance");
        break;
    }
    return p;
  }

  /** Monday 00:00 UTC of the week containing `unix`. */
  function weekStart(unix) {
    const d = new Date(unix * 1000);
    const day = (d.getUTCDay() + 6) % 7;
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) / 1000);
  }

  // ---- Calendar periods ----
  // A "day key" is the UTC-midnight timestamp of a calendar date. Callers build it from the date in the
  // user's time zone (Format.dateParts), so bucketing never depends on where the code happens to run.
  const PERIODS = ["day", "week", "month", "year"];
  const dayKey = ({ y, m, d }) => Date.UTC(y, m - 1, d) / 1000;

  /** Start (day key) of the day/week (Monday)/month/year containing `key`. */
  function periodStart(key, period) {
    const dt = new Date(key * 1000);
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth();
    if (period === "day") return key;
    if (period === "week") return key - ((dt.getUTCDay() + 6) % 7) * 86400;
    if (period === "month") return Date.UTC(y, m, 1) / 1000;
    return Date.UTC(y, 0, 1) / 1000;
  }

  /** The period start `n` periods after `start` (negative = earlier). */
  function shiftPeriod(start, period, n) {
    const dt = new Date(start * 1000);
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth(), d = dt.getUTCDate();
    if (period === "day") return Date.UTC(y, m, d + n) / 1000;
    if (period === "week") return Date.UTC(y, m, d + 7 * n) / 1000;
    if (period === "month") return Date.UTC(y, m + n, 1) / 1000;
    return Date.UTC(y + n, 0, 1) / 1000;
  }

  /** `count` consecutive period starts, oldest first, ending with the period that contains `lastKey`. */
  function periodRange(lastKey, period, count) {
    const last = periodStart(lastKey, period);
    return Array.from({ length: count }, (_, i) => shiftPeriod(last, period, i - count + 1));
  }

  return { logVolume, sessionVolume, sessionSets, e1rm, progressPoint, weekStart,
    PERIODS, dayKey, periodStart, shiftPeriod, periodRange };
});
