"use strict";
const { test, run, assert } = require("./harness.js");
const M = require("../js/metrics.js");
const F = require("../js/format.js");

const key = (y, m, d) => M.dayKey({ y, m, d });
const iso = (k) => new Date(k * 1000).toISOString().slice(0, 10);

test("period starts: Monday weeks, first of month, Jan 1", () => {
  const wed = key(2026, 11, 25); // Wednesday
  assert.equal(iso(M.periodStart(wed, "day")), "2026-11-25");
  assert.equal(iso(M.periodStart(wed, "week")), "2026-11-23");
  assert.equal(iso(M.periodStart(key(2026, 11, 23), "week")), "2026-11-23"); // Monday is its own start
  assert.equal(iso(M.periodStart(key(2026, 11, 29), "week")), "2026-11-23"); // Sunday belongs to prior Monday
  assert.equal(iso(M.periodStart(wed, "month")), "2026-11-01");
  assert.equal(iso(M.periodStart(wed, "year")), "2026-01-01");
});

test("ranges end with the current period and cross month/year boundaries", () => {
  assert.deepEqual(M.periodRange(key(2026, 1, 2), "day", 3).map(iso), ["2025-12-31", "2026-01-01", "2026-01-02"]);
  assert.deepEqual(M.periodRange(key(2026, 2, 15), "month", 3).map(iso), ["2025-12-01", "2026-01-01", "2026-02-01"]);
  assert.deepEqual(M.periodRange(key(2026, 6, 1), "year", 2).map(iso), ["2025-01-01", "2026-01-01"]);
  assert.deepEqual(M.periodRange(key(2026, 3, 4), "week", 2).map(iso), ["2026-02-23", "2026-03-02"]);
});

test("dateParts uses the configured time zone", () => {
  const t = Date.UTC(2026, 10, 25, 3, 0) / 1000; // 03:00 UTC = 22:00 the previous day in New York
  F.configure({ timeZone: "America/New_York" });
  assert.deepEqual(F.dateParts(t), { y: 2026, m: 11, d: 24 });
  F.configure({ timeZone: "UTC" });
  assert.deepEqual(F.dateParts(t), { y: 2026, m: 11, d: 25 });
  F.configure({});
});

test("period labels", () => {
  assert.equal(F.fmtPeriod(key(2026, 11, 23), "week"), "Nov 23");
  assert.equal(F.fmtPeriod(key(2026, 11, 1), "month"), "Nov ’26");
  assert.equal(F.fmtPeriod(key(2026, 1, 1), "year"), "2026");
  assert.equal(F.fmtMonth(key(2026, 11, 1)), "November 2026");
});

run(__filename);
