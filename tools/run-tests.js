#!/usr/bin/env node
// Runs every tools/test-*.js in its own process. Exit code 1 if any fail (blocks the Pages deploy).
"use strict";
const { readdirSync } = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");

const files = readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  console.log(`\n▶ ${f}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit" });
  if (r.status !== 0) failed++;
}
console.log(`\n${failed ? `${failed} test file(s) failed` : `All ${files.length} test files passed`}`);
process.exit(failed ? 1 : 0);
