"use strict";
const { test, run, assert } = require("./harness.js");
const UI = require("../js/ui.js");
const Charts = require("../js/charts.js");

test("html escapes interpolated values", () => {
  const evil = '<img src=x onerror="alert(1)">';
  assert.equal(String(UI.html`<b>${evil}</b>`), "<b>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</b>");
});

test("nested templates and arrays are not double-escaped", () => {
  const out = String(UI.html`<ul>${["a&b", "c"].map((x) => UI.html`<li>${x}</li>`)}</ul>`);
  assert.equal(out, "<ul><li>a&amp;b</li><li>c</li></ul>");
});

test("chart labels and tooltips are escaped", () => {
  const svg = String(Charts.lineChart([{ label: "<script>", value: 1 }, { label: "b", value: 2 }], "lb"));
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;script&gt;"));
});

test("nice ticks", () => {
  assert.deepEqual(Charts.niceTicks(0, 87), [0, 25, 50, 75, 100]);
  assert.deepEqual(Charts.niceTicks(0, 4), [0, 1, 2, 3, 4]);
});

run(__filename);
