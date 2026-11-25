"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test, run, assert } = require("./harness.js");
const { sync } = require("./sync-jefit.js");
const { createFakeJefit } = require("./fake-jefit.js");
const { createClient, JefitError } = require("./jefit-client.js");
const C = require("../js/crypto.js");

const NOW = Math.floor(Date.UTC(2026, 10, 20) / 1000);
const PASS = "a long test passphrase";
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "repfolio-")), "data.enc.json");
const noSleep = async () => {};
const opts = (fake, outFile, extra = {}) => ({ token: fake.token, passphrase: PASS, outFile, fetch: fake.fetch, sleep: noSleep, nowSec: NOW, iterations: 1000, ...extra });

test("sync writes an encrypted vault that decrypts to the snapshot", async () => {
  const fake = createFakeJefit({ nowSec: NOW });
  const out = tmp();
  const r = await sync(opts(fake, out));
  assert.equal(r.changed, true);
  const env = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.ok(!fs.readFileSync(out, "utf8").includes("Bench"));
  const snap = await C.open(env, await C.keyFor(env, PASS));
  assert.equal(snap.sessions.length, fake.raw.sessions.length);
  assert.equal(snap.exercises["u_000023628601"], "Sled Push");
});

test("only GETs, always with limit on /v2/exercises", async () => {
  const fake = createFakeJefit({ nowSec: NOW });
  await sync(opts(fake, tmp()));
  assert.ok(fake.calls.some((c) => c.startsWith("/api/v2/exercises?") && c.includes("limit=")));
  assert.ok(fake.calls.some((c) => c.startsWith("/api/v2/user/sessions?")));
});

test("fetches sessions from SYNC_SINCE (default 1 Jan 2020) up to now", async () => {
  const fake = createFakeJefit({ nowSec: NOW });
  await sync(opts(fake, tmp()));
  const starts = fake.calls.filter((c) => c.startsWith("/api/v2/user/sessions?"))
    .map((c) => Number(new URLSearchParams(c.split("?")[1]).get("startDate")));
  assert.equal(Math.min(...starts), Date.UTC(2020, 0, 1) / 1000);
  assert.ok(Math.max(...starts) <= NOW);
  const fake2 = createFakeJefit({ nowSec: NOW });
  await sync(opts(fake2, tmp(), { since: "2025-06-01" }));
  const first = fake2.calls.find((c) => c.startsWith("/api/v2/user/sessions?"));
  assert.equal(Number(new URLSearchParams(first.split("?")[1]).get("startDate")), Date.UTC(2025, 5, 1) / 1000);
});

test("a malformed SYNC_SINCE fails loudly instead of syncing nothing", async () => {
  const fake = createFakeJefit({ nowSec: NOW });
  await assert.rejects(sync(opts(fake, tmp(), { since: "Jan 2020" })), /SYNC_SINCE/);
});

test("second sync with no new data does not rewrite the file", async () => {
  const fake = createFakeJefit({ nowSec: NOW });
  const out = tmp();
  await sync(opts(fake, out));
  const before = fs.readFileSync(out, "utf8");
  const r = await sync(opts(fake, out));
  assert.equal(r.changed, false);
  assert.equal(fs.readFileSync(out, "utf8"), before);
});

test("new data keeps the salt (devices stay unlocked); new passphrase re-keys", async () => {
  const fake = createFakeJefit({ nowSec: NOW });
  const out = tmp();
  await sync(opts(fake, out));
  const salt1 = JSON.parse(fs.readFileSync(out, "utf8")).kdf.salt;
  fake.raw.sessions.pop();
  assert.equal((await sync(opts(fake, out))).changed, true);
  assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).kdf.salt, salt1);
  await sync(opts(fake, out, { passphrase: "a different passphrase" }));
  assert.notEqual(JSON.parse(fs.readFileSync(out, "utf8")).kdf.salt, salt1);
});

test("short passphrases are refused", async () => {
  await assert.rejects(sync(opts(createFakeJefit({ nowSec: NOW }), tmp(), { passphrase: "short" })), /at least 12/);
});

test("errors branch on the body's error code, not the status", async () => {
  const fake = createFakeJefit({ nowSec: NOW });
  fake.behaviour.lapsed = true;
  await assert.rejects(sync(opts(fake, tmp())), (e) => e instanceof JefitError && e.code === "entitlement_required" && /Elite/.test(e.message));
  await assert.rejects(sync(opts(fake, tmp(), { token: "wrong" })), { code: "invalid_token" });
});

test("both 400 shapes and an empty 400 are understood", async () => {
  const fake = createFakeJefit({ nowSec: NOW });
  const client = createClient({ token: fake.token, fetch: fake.fetch, sleep: noSleep });
  fake.behaviour.errorNext = { status: 400, body: { errors: [{ error: "invalid_param", message: "Unknown parameter", param: "name" }] } };
  await assert.rejects(client.get("/v2/user/routines"), (e) => e.code === "invalid_param" && /name/.test(e.message));
  fake.behaviour.errorNext = { status: 400, body: { error: "invalid_request", message: "bad", param: "data.name" } };
  await assert.rejects(client.get("/v2/user/routines"), (e) => e.code === "invalid_request" && /data\.name/.test(e.message));
  fake.behaviour.errorNext = { status: 400, body: undefined };
  await assert.rejects(client.get("/v2/user/routines"), (e) => e.code === "http_400" && /empty 400/.test(e.message));
});

test("429 waits exactly Retry-After (including 0) and then succeeds", async () => {
  const fake = createFakeJefit({ nowSec: NOW });
  const waits = [];
  fake.behaviour.rateLimitNext = 2;
  fake.behaviour.retryAfter = "0";
  const client = createClient({ token: fake.token, fetch: fake.fetch, sleep: async (ms) => waits.push(ms) });
  const routine = await client.getCurrentRoutine();
  assert.equal(routine.name, "Upper / Lower Strength");
  assert.deepEqual(waits, [0, 0]);
});

test("a 5xx is retried once, then reported", async () => {
  let n = 0;
  const flaky = async () => ({ status: 503, ok: false, headers: { get: () => null }, text: async () => "", json: async () => ({}) });
  const client = createClient({ token: "t", fetch: async (...a) => (n++, flaky(...a)), sleep: noSleep });
  await assert.rejects(client.get("/v2/user/routines"), { status: 503 });
  assert.equal(n, 2);
});

run(__filename);
