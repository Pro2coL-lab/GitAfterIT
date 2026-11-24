"use strict";
const { test, run, assert } = require("./harness.js");
const F = require("../js/format.js");

test("durations", () => {
  assert.equal(F.fmtDuration(45), "45s");
  assert.equal(F.fmtDuration(90), "1m 30s");
  assert.equal(F.fmtDuration(120), "2m");
  assert.equal(F.fmtDuration(3900), "1h 5m");
  assert.equal(F.fmtDuration(null), "—");
});

test("weights are pounds in, converted only for display", () => {
  F.configure({ unit: "lb" });
  assert.equal(F.fmtWeight(225, 0), "225 lb");
  F.configure({ unit: "kg" });
  assert.equal(F.fmtWeight(225, 1), "102.1 kg");
  F.configure({ unit: "lb" });
});

test("describeSet only uses fields that apply to the record type", () => {
  const set = { weight: 10, reps: 8, duration: 60, distance: 3.1, calories: 300 };
  assert.equal(F.describeSet(set, "weight_and_reps"), "10 lb × 8");
  assert.equal(F.describeSet(set, "reps"), "8 reps");
  assert.equal(F.describeSet(set, "duration"), "1m");
  assert.equal(F.describeSet(set, "reps_and_duration"), "8 reps · 1m");
  assert.equal(F.describeSet(set, "cardio"), "1m · 3.1 dist · 300 cal");
});

test("plural and relative time", () => {
  assert.equal(F.plural(1, "set"), "1 set");
  assert.equal(F.plural(3, "set"), "3 sets");
  const now = Date.parse("2026-01-02T12:00:00Z");
  assert.equal(F.fmtAgo("2026-01-02T11:59:30Z", now), "just now");
  assert.equal(F.fmtAgo("2026-01-02T09:00:00Z", now), "3 h ago");
});

run(__filename);
