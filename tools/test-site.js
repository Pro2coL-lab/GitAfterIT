// Validators for the static site: every referenced file exists, the manifest is valid,
// scripts load in dependency order, and nothing secret is committed.
"use strict";
const fs = require("fs");
const path = require("path");
const { test, run, assert } = require("./harness.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const indexHtml = read("index.html");

test("every script, stylesheet and icon referenced by index.html exists", () => {
  const refs = [...indexHtml.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 5);
  for (const r of refs) assert.ok(fs.existsSync(path.join(ROOT, r)), `missing ${r}`);
});

test("scripts load after their dependencies", () => {
  const order = [...indexHtml.matchAll(/<script src="js\/([^"]+)"/g)].map((m) => m[1]);
  const before = (a, b) => assert.ok(order.indexOf(a) < order.indexOf(b), `${a} must load before ${b}`);
  before("ui.js", "charts.js");
  before("snapshot.js", "sample.js");
  before("crypto.js", "vault.js");
  before("config.js", "app.js");
  assert.equal(order[order.length - 1], "app.js");
});

test("manifest.json is valid and its icons exist", () => {
  const m = JSON.parse(read("manifest.json"));
  assert.ok(m.name && m.start_url && m.display);
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), `missing ${i.src}`);
});

test("no inline scripts or styles (the CSP forbids them)", () => {
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(indexHtml));
  assert.ok(!/\sstyle="/.test(indexHtml + read("js/app.js")));
  assert.ok(!/\son[a-z]+="/.test(indexHtml + read("js/app.js")));
});

test("config points at a repo", () => {
  const cfg = read("js/config.js");
  assert.match(cfg, /owner: "[^"]+"/);
  assert.match(cfg, /repo: "[^"]+"/);
});

test("no tokens, passphrases or vault files are committed", () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    [".git", "node_modules"].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(ROOT)) {
    if (/\.(png|ico)$/.test(f)) continue;
    const text = fs.readFileSync(f, "utf8");
    assert.ok(!/jfit_pat_[A-Za-z0-9]{8,}/.test(text), `token-like string in ${path.relative(ROOT, f)}`);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, "data.enc.json")), "the vault belongs on the jefit-data branch, not main");
});

run(__filename);
