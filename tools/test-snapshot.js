"use strict";
const { test, run, assert } = require("./harness.js");
const Snapshot = require("../js/snapshot.js");
const Sample = require("../js/sample.js");

const raw = Sample.rawData(Date.UTC(2026, 10, 20) / 1000);

test("custom exercises resolve by global id, local id and day_exercise number", () => {
  const snap = Snapshot.build(raw);
  const sled = snap.sessions.flatMap((s) => s.logs).find((l) => l.exercise_id === "u_000023628601");
  assert.equal(sled.exercise_name, "Sled Push");
  // a log read from /v2/logs/{id} carries the LOCAL id for a custom exercise
  const viaLocal = Snapshot.build({ ...raw, sessions: [{ ...raw.sessions[0], logs: [{ ...sled, exercise_id: "u_000000000001" }] }] });
  assert.equal(viaLocal.sessions[0].logs[0].exercise_id, "u_000023628601");
  // day_exercise: exercise_id 1 + is_system_exercise false
  const lower = snap.routine.days.find((d) => d.name === "Lower");
  assert.deepEqual(lower.day_exercises[1].exercise, { id: "u_000023628601", name: "Sled Push" });
});

test("d_ and u_ with the same number are different exercises", () => {
  const ex = [
    { id: "d_000000000001", local_id: "d_000000000001", name: "Library One" },
    { id: "u_000000000099", local_id: "u_000000000001", name: "Custom One" },
  ];
  const routine = { id: "r", name: "R", days: [{ id: "d", name: "D", index: 0, day_exercises: [
    { id: "a", index: 0, exercise_id: 1, is_system_exercise: true, sets: [] },
    { id: "b", index: 1, exercise_id: 1, is_system_exercise: false, sets: [] },
  ] }] };
  const snap = Snapshot.build({ sessions: [], exercises: ex, routine });
  assert.deepEqual(snap.routine.days[0].day_exercises.map((d) => d.exercise.name), ["Library One", "Custom One"]);
});

test("overlapping sync windows are de-duplicated and sorted newest first", () => {
  const snap = Snapshot.build({ ...raw, sessions: [...raw.sessions, ...raw.sessions.slice(0, 5)] });
  assert.equal(snap.sessions.length, raw.sessions.length);
  for (let i = 1; i < snap.sessions.length; i++) assert.ok(snap.sessions[i - 1].date >= snap.sessions[i].date);
});

test("applicable_set_fields is carried through for the routine", () => {
  const snap = Snapshot.build(raw);
  const plank = snap.routine.days[0].day_exercises.find((d) => d.exercise.name === "Plank");
  assert.deepEqual(plank.applicable_set_fields, ["duration"]);
});

test("fingerprint ignores generatedAt", () => {
  const a = Snapshot.build(raw, { generatedAt: "2026-01-01T00:00:00Z" });
  const b = Snapshot.build(raw, { generatedAt: "2026-02-01T00:00:00Z" });
  assert.equal(Snapshot.fingerprint(a), Snapshot.fingerprint(b));
});

run(__filename);
