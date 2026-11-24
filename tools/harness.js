// Minimal test harness: no framework, just node:assert.
"use strict";
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
async function run(file) {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${t.name}\n      ${String(e && e.stack || e).split("\n").slice(0, 4).join("\n      ")}`);
    }
  }
  console.log(`${failed ? "FAIL" : "ok"}  ${file}  (${tests.length - failed}/${tests.length})`);
  if (failed) process.exitCode = 1;
}
module.exports = { test, run, assert: require("node:assert/strict") };
