"use strict";
const { test, run, assert } = require("./harness.js");
const C = require("../js/crypto.js");

const FAST = 1000; // rounds for most tests; one test uses the real 600,000

test("round trip at the real 600,000 rounds", async () => {
  const salt = C.randomBytes(16);
  const key = await C.deriveKey("correct horse battery staple", salt);
  const env = await C.seal({ hello: "world" }, key, { salt });
  assert.equal(env.kdf.iterations, 600000);
  assert.equal(env.cipher, "AES-256-GCM");
  assert.deepEqual(await C.open(env, await C.keyFor(env, "correct horse battery staple")), { hello: "world" });
});

test("ciphertext does not contain the plaintext", async () => {
  const salt = C.randomBytes(16);
  const key = await C.deriveKey("pw-pw-pw-pw-pw", salt, FAST);
  const env = await C.seal({ exercise: "Barbell Bench Press" }, key, { salt, iterations: FAST });
  assert.ok(!JSON.stringify(env).includes("Bench"));
});

test("wrong passphrase is rejected", async () => {
  const salt = C.randomBytes(16);
  const env = await C.seal({ a: 1 }, await C.deriveKey("right-passphrase", salt, FAST), { salt, iterations: FAST });
  await assert.rejects(C.open(env, await C.keyFor(env, "wrong-passphrase")), { code: "wrong_passphrase" });
});

test("tampering with the ciphertext or the plaintext header is detected", async () => {
  const salt = C.randomBytes(16);
  const key = await C.deriveKey("pw-pw-pw-pw-pw", salt, FAST);
  const env = await C.seal({ a: 1 }, key, { salt, iterations: FAST });
  const flipped = C.fromB64(env.ciphertext); flipped[0] ^= 1;
  await assert.rejects(C.open({ ...env, ciphertext: C.toB64(flipped) }, key), { code: "wrong_passphrase" });
  await assert.rejects(C.open({ ...env, updatedAt: "2000-01-01T00:00:00Z" }, key), { code: "wrong_passphrase" });
});

test("fresh IV on every seal", async () => {
  const salt = C.randomBytes(16);
  const key = await C.deriveKey("pw-pw-pw-pw-pw", salt, FAST);
  const a = await C.seal({ a: 1 }, key, { salt, iterations: FAST });
  const b = await C.seal({ a: 1 }, key, { salt, iterations: FAST });
  assert.notEqual(a.iv, b.iv);
});

test("non-vault files are refused", () => {
  assert.throws(() => C.validate({ hello: 1 }), { code: "bad_format" });
});

run(__filename);
