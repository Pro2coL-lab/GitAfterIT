// Deterministic sample data in the exact shapes the JEFIT API returns.
// Powers "Try sample data" in the app and the fake JEFIT used by the tests.
(function (root, factory) {
  const m = factory(typeof require === "function" && typeof module === "object" ? require("./snapshot.js") : root.Snapshot);
  if (typeof module === "object" && module.exports) module.exports = m;
  else root.Sample = m;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Snapshot) {
function rawData(nowSec = Math.floor(Date.now() / 1000)) {

const rawExercises = [
  { id: "d_000000000002", local_id: "d_000000000002", name: "Barbell Bench Press", body_parts: ["Chest"], input_format: "weight_and_reps" },
  { id: "d_000000000003", local_id: "d_000000000003", name: "Barbell Squat", body_parts: ["Upper Legs"], input_format: "weight_and_reps" },
  { id: "d_000000000004", local_id: "d_000000000004", name: "Barbell Deadlift", body_parts: ["Back"], input_format: "weight_and_reps" },
  { id: "d_000000000005", local_id: "d_000000000005", name: "Pull Up", body_parts: ["Back"], input_format: "reps" },
  { id: "d_000000000006", local_id: "d_000000000006", name: "Overhead Press", body_parts: ["Shoulders"], input_format: "weight_and_reps" },
  { id: "d_000000000007", local_id: "d_000000000007", name: "Plank", body_parts: ["Abs"], input_format: "duration" },
  { id: "d_000000000008", local_id: "d_000000000008", name: "Treadmill Run", body_parts: ["Cardio"], input_format: "cardio" },
  // A custom exercise: id and local_id differ.
  { id: "u_000023628601", local_id: "u_000000000001", name: "Sled Push", body_parts: ["Upper Legs"], input_format: "duration" },
];
const exercises = rawExercises.map((e) => ({
  ...e,
  numeric_local_id: Number(e.local_id.slice(2)),
}));

// Small seeded PRNG so the sample data is stable between reloads.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);

const DAY = 86400;
const now = nowSec;
const today = now - (now % DAY) + 18 * 3600;

let logId = 1;
let setId = 1;

function log(exId, type, date, sessionLocal, sets) {
  const id = logId++;
  const log_sets = sets.map((s, i) => ({ ...s, local_id: setId++, exercise_log_id: id, index: i, date }));
  const l = {
    local_id: id, exercise_id: exId, session_id: sessionLocal, local_session_id: sessionLocal,
    date, record_type: type, is_system_exercise: exId.startsWith("d_"), log_sets,
  };
  if (type === "weight_and_reps") l.record = Math.max(...log_sets.map((s) => (s.weight ?? 0) * (1 + (s.reps ?? 0) / 30)));
  if (type === "reps") l.record = Math.max(...log_sets.map((s) => s.reps ?? 0));
  return l;
}

const wr = (w, r, type = "default") => ({ type, weight: Math.round(w / 5) * 5, reps: r, interval: 90 });

function build() {
  const out = [];
  let local = 1;
  // ~12 weeks, Mon/Wed/Fri/Sat-ish, with progressive overload.
  for (let d = 84; d >= 0; d--) {
    const date = today - d * DAY;
    const dow = new Date(date * 1000).getUTCDay();
    if (![1, 3, 5, 6].includes(dow) || rand() < 0.1) continue;
    const week = (84 - d) / 7;
    const p = 1 + week * 0.012;
    const id = local++;
    const logs = [];
    if (dow === 1 || dow === 5) {
      logs.push(log("d_000000000002", "weight_and_reps", date, id, [wr(95, 10, "warm-up"), wr(165 * p, 8), wr(165 * p, 8), wr(165 * p, 7)]));
      logs.push(log("d_000000000006", "weight_and_reps", date + 900, id, [wr(95 * p, 8), wr(95 * p, 8), wr(95 * p, 6)]));
      logs.push(log("d_000000000005", "reps", date + 1500, id, [10, 9, 8].map((r) => ({ type: "default", reps: r + Math.floor(week / 4), interval: 120 }))));
      logs.push(log("d_000000000007", "duration", date + 2100, id, [{ type: "default", duration: 60 + Math.round(week * 3) }, { type: "default", duration: 50 + Math.round(week * 3) }]));
    } else if (dow === 3) {
      logs.push(log("d_000000000003", "weight_and_reps", date, id, [wr(135, 8, "warm-up"), wr(225 * p, 5), wr(225 * p, 5), wr(225 * p, 5)]));
      logs.push(log("d_000000000004", "weight_and_reps", date + 1200, id, [wr(275 * p, 5), wr(275 * p, 5)]));
      logs.push(log("u_000023628601", "duration", date + 2000, id, [{ type: "default", duration: 40 }, { type: "default", duration: 40 }, { type: "default", duration: 35 }]));
    } else {
      logs.push(log("d_000000000008", "cardio", date, id, [{ type: "default", duration: 1800 + Math.round(rand() * 600), distance: +(3 + week * 0.05).toFixed(2), calories: 320, speed: 6.2, laps: 0 }]));
    }
    const workout = 2400 + Math.round(rand() * 1500);
    const total_weight = logs.flatMap((l) => l.log_sets).reduce((t, s) => t + (s.weight ?? 0) * (s.reps ?? 0), 0);
    out.push({
      id: 1000 + id, local_id: id, date, day_id: null, numeric_day_id: null,
      total_time: workout + 600, workout_time: workout, rest_time: 600,
      exercise_count: logs.length, total_weight, records_broken: rand() < 0.3 ? 1 : 0,
      mode: "traditional", calories: 0, avg_heart_rate: null, unit_system: "imperial", logs,
    });
  }
  return out;
}

const sessions = build();

const currentRoutine = {
  id: "u_003922327403", local_id: "u_000000000006", name: "Upper / Lower Strength",
  description: "Sample routine (mock data).",
  days: [
    {
      id: "u_000000000045", local_id: "u_000000000045", name: "Upper", index: 0,
      day_exercises: [
        { id: "u_007894839167", local_id: "u_001776789097", index: 0, exercise_id: 2, is_system_exercise: true, applicable_set_fields: ["weight_lbs", "reps"],
          sets: [1, 2, 3].map((i) => ({ index: i - 1, type: "default", weight_lbs: 175, reps: 8, rest_time: 120 })) },
        { id: "u_007894839004", local_id: "u_001776789098", index: 1, exercise_id: 5, is_system_exercise: true, applicable_set_fields: ["reps"],
          // Stored weight is a leftover default — applicable_set_fields says to ignore it.
          sets: [1, 2, 3].map((i) => ({ index: i - 1, type: "default", weight_lbs: 10, reps: 10, rest_time: 90 })) },
        { id: "u_007894839005", local_id: "u_001776789099", index: 2, exercise_id: 7, is_system_exercise: true, applicable_set_fields: ["duration"],
          sets: [1, 2].map((i) => ({ index: i - 1, type: "default", weight_lbs: 10, reps: 8, duration: 60, rest_time: 60 })) },
      ],
    },
    {
      id: "u_000000000046", local_id: "u_000000000046", name: "Lower", index: 1,
      day_exercises: [
        { id: "u_007894839006", local_id: "u_001776789100", index: 0, exercise_id: 3, is_system_exercise: true, applicable_set_fields: ["weight_lbs", "reps"],
          sets: [1, 2, 3].map((i) => ({ index: i - 1, type: "default", weight_lbs: 235, reps: 5, rest_time: 180 })) },
        { id: "u_007894839007", local_id: "u_001776789101", index: 1, exercise_id: 1, is_system_exercise: false, applicable_set_fields: ["duration"],
          sets: [1, 2, 3].map((i) => ({ index: i - 1, type: "default", weight_lbs: 10, reps: 8, duration: 40, rest_time: 90 })) },
      ],
    },
  ],
};
return { sessions, exercises, routine: currentRoutine };
}

/** A ready-to-display snapshot of the sample data. */
const snapshot = (nowSec) => Snapshot.build(rawData(nowSec), { source: "sample" });

return { rawData, snapshot };
});
