"use strict";
const { test, run, assert } = require("./harness.js");
const M = require("../js/metrics.js");

const log = (record_type, log_sets) => ({ record_type, log_sets, date: 1700000000 });

test("volume counts working sets only, and only for weight_and_reps", () => {
  const l = log("weight_and_reps", [
    { type: "warm-up", weight: 95, reps: 10 },
    { type: "default", weight: 185, reps: 8 },
    { type: "drop", weight: 135, reps: 10 },
  ]);
  assert.equal(M.logVolume(l), 185 * 8 + 135 * 10);
  assert.equal(M.logVolume(log("duration", [{ type: "default", duration: 60, weight: 10, reps: 8 }])), 0);
});

test("Epley e1RM", () => {
  assert.equal(M.e1rm(200, 1), 200);
  assert.equal(M.e1rm(150, 10), 200);
});

test("progress point per record type", () => {
  const p = M.progressPoint(log("weight_and_reps", [{ type: "default", weight: 150, reps: 10 }, { type: "default", weight: 160, reps: 5 }]));
  assert.equal(p.bestE1rm, 200);
  assert.equal(p.topWeight, 160);
  const r = M.progressPoint(log("reps", [{ type: "default", reps: 10 }, { type: "default", reps: 8 }]));
  assert.deepEqual([r.maxReps, r.totalReps], [10, 18]);
  const c = M.progressPoint(log("cardio", [{ type: "default", duration: 1800, distance: 3 }]));
  assert.deepEqual([c.totalDuration, c.distance], [1800, 3]);
});

test("weekStart is Monday 00:00 UTC", () => {
  const wed = Date.UTC(2026, 10, 18, 15) / 1000; // Wed 18 Nov 2026
  assert.equal(new Date(M.weekStart(wed) * 1000).toISOString(), "2026-11-16T00:00:00.000Z");
  const sun = Date.UTC(2026, 10, 22, 23) / 1000;
  assert.equal(new Date(M.weekStart(sun) * 1000).toISOString(), "2026-11-16T00:00:00.000Z");
});

run(__filename);
