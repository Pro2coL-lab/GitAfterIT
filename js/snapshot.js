// Turns raw JEFIT API responses into the compact snapshot the site displays.
// Used by tools/sync-jefit.js (in GitHub Actions) and by the sample data.
(function (root, factory) {
  const m = factory();
  if (typeof module === "object" && module.exports) module.exports = m;
  else root.Snapshot = m;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCHEMA = 1;
  const numericKey = (system, n) => `${system ? "d" : "u"}:${n}`;

  /**
   * Different JEFIT reads hand back different id shapes for the same exercise, so index all of them:
   * the global id ("u_000023628601"), the local id ("u_000000000001"), and a day_exercise's
   * bare number + is_system_exercise. Never construct ids by padding numbers.
   */
  function indexExercises(exercises) {
    const byId = new Map(), byLocalId = new Map(), byNumeric = new Map();
    for (const e of exercises) {
      byId.set(e.id, e);
      if (e.local_id) byLocalId.set(e.local_id, e);
      const n = e.numeric_local_id ?? (e.local_id ? Number(String(e.local_id).replace(/^[du]_/, "")) : null);
      if (n != null && !Number.isNaN(n)) byNumeric.set(numericKey(e.id.startsWith("d_"), n), e);
    }
    return { byId, byLocalId, byNumeric };
  }

  /**
   * @param raw { sessions, exercises, routine } as returned by the JEFIT API
   * @returns snapshot { schema, generatedAt, source, sessions[], routine, exercises{} }
   */
  function build(raw, { generatedAt = new Date().toISOString(), source = "jefit" } = {}) {
    const idx = indexExercises(raw.exercises ?? []);
    const used = {};
    const resolve = (id) => {
      const e = idx.byId.get(id) ?? idx.byLocalId.get(id);
      return e ? { id: e.id, name: e.name } : { id, name: `Exercise ${id}` };
    };

    // De-duplicate (sync fetches overlapping windows) and sort newest first.
    const byLocal = new Map();
    for (const s of raw.sessions ?? []) byLocal.set(s.local_id, s);
    const sessions = [...byLocal.values()]
      .sort((a, b) => b.date - a.date)
      .map((s) => ({
        local_id: s.local_id,
        date: s.date,
        total_time: s.total_time ?? null,
        workout_time: s.workout_time ?? null,
        records_broken: s.records_broken ?? 0,
        logs: (s.logs ?? []).map((l) => {
          const ex = resolve(l.exercise_id);
          used[ex.id] = ex.name;
          return {
            local_id: l.local_id,
            exercise_id: ex.id,
            exercise_name: ex.name,
            record_type: l.record_type,
            superset: l.superset ?? null,
            date: l.date,
            log_sets: (l.log_sets ?? []).map((set) => {
              const { exercise_log_id, date, ...keep } = set;
              return keep;
            }),
          };
        }),
      }));

    let routine = null;
    if (raw.routine) {
      routine = {
        id: raw.routine.id,
        name: raw.routine.name,
        description: raw.routine.description ?? null,
        days: [...(raw.routine.days ?? [])].sort((a, b) => a.index - b.index).map((d) => ({
          id: d.id,
          name: d.name,
          index: d.index,
          rest_day: !!d.rest_day,
          estimated_duration: d.estimated_duration ?? null,
          day_exercises: [...(d.day_exercises ?? [])].sort((a, b) => a.index - b.index).map((de) => {
            const e = idx.byNumeric.get(numericKey(de.is_system_exercise, de.exercise_id));
            return {
              id: de.id,
              index: de.index,
              exercise: e ? { id: e.id, name: e.name } : null,
              numeric_superset: de.numeric_superset ?? null,
              rest_time: de.rest_time ?? null,
              // Which set fields are real data — stored leftovers (e.g. "8 reps @ 10 lb" on a plank) are not.
              applicable_set_fields: de.applicable_set_fields ?? null,
              sets: (de.sets ?? []).map((s) => ({
                index: s.index, type: s.type, weight_lbs: s.weight_lbs, reps: s.reps, duration: s.duration, rest_time: s.rest_time,
              })),
            };
          }),
        })),
      };
    }

    return { schema: SCHEMA, generatedAt, source, sessions, routine, exercises: used };
  }

  /** Comparable form of a snapshot, ignoring when it was generated. */
  const fingerprint = (snap) => JSON.stringify({ ...snap, generatedAt: null });

  return { SCHEMA, build, fingerprint, indexExercises };
});
