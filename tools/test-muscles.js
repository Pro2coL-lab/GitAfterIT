"use strict";
const { test, run, assert } = require("./harness.js");
const MU = require("../js/muscles.js");
const Charts = require("../js/charts.js");

const c = (name) => MU.classify(name);
const is = (name, primary, secondary = []) =>
  assert.deepEqual(c(name) && [c(name).primary, c(name).secondary], [primary, secondary], name);

test("classifies the exercises from the training plan", () => {
  is("Incline DB Press", ["chest"], ["triceps", "frontDelts"]);
  is("Low-to-High Cable Fly", ["chest"]);
  is("Barbell Bench Press", ["chest"], ["triceps", "frontDelts"]);
  is("Weighted Dips", ["chest"], ["triceps"]);
  is("Overhead Tricep Extension", ["triceps"]);
  is("Rope Pushdown", ["triceps"]);
  is("Seated Overhead Press", ["frontDelts"], ["sideDelts", "triceps"]);
  is("Barbell Curl", ["biceps"]);
  is("Hammer Curl", ["biceps"], ["forearms"]);
  is("Standing Calf Raise", ["calves"]);
  is("Seated Calf Raise", ["calves"]);
  is("Single-Leg RDL", ["hamstrings"], ["glutes"]);
  is("Single-Leg Hip Thrust", ["glutes"], ["hamstrings"]);
  is("Lying Leg Curl", ["hamstrings"], ["calves"]);
  is("Bulgarian Split Squat", ["quads", "glutes"], ["hamstrings"]);
  is("Walking Lunges", ["quads", "glutes"], ["hamstrings"]);
});

test("specific names win over general ones", () => {
  is("Reverse Pec Deck Fly", ["rearDelts"], ["traps"]);
  is("Close-Grip Bench Press", ["triceps"], ["chest"]);
  is("Leg Extension", ["quads"]);
  is("Back Extension", ["hamstrings"], ["glutes"]);
  is("Upright Row", ["sideDelts"], ["traps"]);
  is("Seated Cable Row", ["back"], ["biceps", "rearDelts"]);
  is("Farmer's Walk", ["forearms"], ["traps"]);
  is("Cable Crunch", ["abs"]);
});

test("cardio is ignored and unknown names are unmapped", () => {
  assert.equal(c("Treadmill Run").ignored, true);
  assert.equal(c("Zottman Thing"), null);
});

const session = (logs) => ({ date: 0, logs });
const log = (id, name, sets, record_type = "weight_and_reps") => ({
  exercise_id: id, exercise_name: name, record_type,
  log_sets: sets.map((type) => ({ type, weight: 100, reps: 8 })),
});

test("secondary sets count half, warm-ups don't count", () => {
  const { rows } = MU.tally([session([
    log("d_1", "Barbell Bench Press", ["warm-up", "default", "default", "default", "default"]),
    log("d_2", "Rope Pushdown", ["default", "default", "default"]),
  ])]);
  const tri = rows.find((r) => r.key === "triceps");
  assert.equal(tri.primary, 3);
  assert.equal(tri.secondary, 4);
  assert.equal(tri.effective, 5);
  assert.equal(rows.find((r) => r.key === "chest").effective, 4);
  assert.deepEqual(tri.exercises.map((e) => [e.name, e.role, e.sets]), [["Rope Pushdown", "primary", 3], ["Barbell Bench Press", "secondary", 4]]);
});

test("averages over several weeks and lists unmapped exercises", () => {
  const { rows, unmapped } = MU.tally([
    session([log("d_1", "Barbell Squat", ["default", "default", "default", "default"])]),
    session([log("d_1", "Barbell Squat", ["default", "default", "default", "default"]), log("u_9", "Mystery Machine", ["default", "default"])]),
    session([log("d_8", "Treadmill Run", ["default"], "cardio")]),
  ], { weeks: 2 });
  assert.equal(rows.find((r) => r.key === "quads").effective, 4);
  assert.equal(rows.find((r) => r.key === "glutes").effective, 2);
  assert.deepEqual(unmapped, [{ id: "u_9", name: "Mystery Machine", sets: 1 }]);
});

test("zones follow the landmarks", () => {
  const chest = MU.GROUPS.find((g) => g.key === "chest"); // MEV 6, MAV 12–20, MRV 22
  assert.deepEqual([0, 4, 8, 12, 20, 21, 23].map((n) => MU.zone(chest, n)), ["none", "under", "low", "optimal", "optimal", "high", "over"]);
});

test("landmark chart escapes names and draws a row per muscle", () => {
  const rows = MU.GROUPS.slice(0, 2).map((g, i) => ({ ...g, name: i ? g.name : "<b>", effective: 10, zone: "low", tip: "x" }));
  const svg = String(Charts.landmarkChart(rows));
  assert.ok(!svg.includes("<b>") && svg.includes("&lt;b&gt;"));
  assert.equal((svg.match(/class="sets /g) || []).length, 2);
});

run(__filename);
