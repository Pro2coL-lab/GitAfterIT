"use strict";
const { test, run, assert } = require("./harness.js");
const Vault = require("../js/vault.js");
const C = require("../js/crypto.js");
const { createFakeGitHub, memoryStorage } = require("./fake-github.js");

const REPO = { owner: "someone", repo: "site", branch: "jefit-data", path: "data.enc.json" };
const PASS = "a long test passphrase";

async function publish(gh, value, { salt = C.randomBytes(16), pass = PASS, updatedAt = new Date().toISOString() } = {}) {
  const key = await C.deriveKey(pass, salt, 1000);
  const env = await C.seal(value, key, { salt, iterations: 1000, updatedAt });
  gh.put(REPO.owner, REPO.repo, REPO.branch, REPO.path, JSON.stringify(env));
  return { env, salt };
}
const setup = () => {
  const gh = createFakeGitHub();
  const storage = memoryStorage();
  const keys = Vault.memoryKeyStore();
  const device = () => Vault.create({ ...REPO, fetch: gh.fetch, storage, keys });
  return { gh, storage, keys, device };
};

test("unlock reads from GitHub without a token and caches only ciphertext", async () => {
  const { gh, storage, device } = setup();
  await publish(gh, { sessions: [1, 2, 3] });
  const r = await device().unlock(PASS);
  assert.deepEqual(r.data, { sessions: [1, 2, 3] });
  const cachedText = [...storage._map.values()].join("");
  assert.ok(cachedText.includes('"ciphertext"') && !cachedText.includes("sessions"));
});

test("wrong passphrase stores nothing", async () => {
  const { gh, storage, keys, device } = setup();
  await publish(gh, { a: 1 });
  await assert.rejects(device().unlock("not the passphrase"), { code: "wrong_passphrase" });
  assert.equal(await keys.get(), null);
  assert.equal(storage._map.size, 0);
});

test("after unlocking once, load() works offline with no passphrase", async () => {
  const { gh, device } = setup();
  await publish(gh, { a: 1 });
  await device().unlock(PASS);
  gh.state.offline = true;
  const r = await device().load();
  assert.deepEqual(r.data, { a: 1 });
  await assert.rejects(device().refresh(), { code: "offline" });
});

test("refresh picks up a newer sync with the same salt", async () => {
  const { gh, device } = setup();
  const { salt } = await publish(gh, { v: 1 }, { updatedAt: "2026-01-01T00:00:00Z" });
  await device().unlock(PASS);
  assert.equal((await device().refresh()).status, "unchanged");
  await publish(gh, { v: 2 }, { salt, updatedAt: "2026-01-02T00:00:00Z" });
  const r = await device().refresh();
  assert.equal(r.status, "updated");
  assert.deepEqual(r.data, { v: 2 });
  assert.deepEqual((await device().load()).data, { v: 2 });
});

test("a re-keyed vault (new passphrase) asks to unlock again", async () => {
  const { gh, device } = setup();
  await publish(gh, { v: 1 });
  await device().unlock(PASS);
  await publish(gh, { v: 2 }, { pass: "brand new passphrase" });
  assert.equal((await device().refresh()).status, "locked");
});

test("lock forgets the key; forget clears the cache too", async () => {
  const { gh, storage, device } = setup();
  await publish(gh, { a: 1 });
  await device().unlock(PASS);
  await device().lock();
  assert.equal(await device().load(), null);
  assert.ok(storage._map.size > 0);
  await device().forget();
  assert.equal(storage._map.size, 0);
});

test("no data yet gives a helpful message", async () => {
  const { device } = setup();
  await assert.rejects(device().unlock(PASS), (e) => e.code === "no_data" && /Sync JEFIT/.test(e.message));
});

test("rate limiting from GitHub is reported, cached copy still used", async () => {
  const { gh, device } = setup();
  await publish(gh, { a: 1 });
  await device().unlock(PASS);
  gh.state.rateLimited = true;
  await assert.rejects(device().refresh(), { code: "rate_limited" });
  assert.deepEqual((await device().unlock(PASS)).data, { a: 1 });
});

run(__filename);
