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

  return { logVolume, sessionVolume, sessionSets, e1rm, progressPoint, weekStart };
});
