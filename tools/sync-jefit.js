#!/usr/bin/env node
// Pull your JEFIT data, encrypt it, and write the vault file. Run by .github/workflows/sync.yml.
//
//   JEFIT_TOKEN=jfit_pat_... VAULT_PASSPHRASE=... node tools/sync-jefit.js [out-file]
//
// Env: JEFIT_TOKEN (required), VAULT_PASSPHRASE (required, 12+ chars),
//      SYNC_SINCE (first date to fetch, YYYY-MM-DD; default 2020-01-01), VAULT_FILE (default data.enc.json)
"use strict";

const fs = require("fs");
const VaultCrypto = require("../js/crypto.js");
const Snapshot = require("../js/snapshot.js");
const { createClient, JefitError } = require("./jefit-client.js");

const MIN_PASSPHRASE = 12;
// Everything from this date on is fetched; older workouts are left out.
const DEFAULT_SINCE = "2020-01-01";

/** "YYYY-MM-DD" → Unix seconds at 00:00 UTC that day. */
function sinceToUnix(since) {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(since) ? Date.parse(`${since}T00:00:00Z`) : NaN;
  if (Number.isNaN(t)) throw new Error(`SYNC_SINCE must be a date like 2020-01-01 (got "${since}").`);
  return t / 1000;
}

/**
 * @returns {{ changed: boolean, sessions: number, outFile: string }}
 */
async function sync({ token, passphrase, outFile, since = DEFAULT_SINCE, fetch, sleep, nowSec = Math.floor(Date.now() / 1000), iterations, log = () => {} }) {
  if (!passphrase || passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`VAULT_PASSPHRASE must be at least ${MIN_PASSPHRASE} characters.`);
  }
  const client = createClient({ token, fetch, sleep, log });
  const raw = await client.fetchAll({ start: sinceToUnix(since), end: nowSec + 86400 });
  const snapshot = Snapshot.build(raw);

  // Keep the existing salt so devices that already unlocked keep working,
  // and skip the write entirely if nothing changed.
  let existing = null;
  if (fs.existsSync(outFile)) {
    try { existing = VaultCrypto.validate(JSON.parse(fs.readFileSync(outFile, "utf8"))); } catch { existing = null; }
  }
  let salt, key;
  if (existing) {
    try {
      key = await VaultCrypto.keyFor(existing, passphrase);
      const old = await VaultCrypto.open(existing, key);
      if (Snapshot.fingerprint(old) === Snapshot.fingerprint(snapshot)) {
        return { changed: false, sessions: snapshot.sessions.length, outFile };
      }
      salt = VaultCrypto.fromB64(existing.kdf.salt);
      iterations = existing.kdf.iterations;
    } catch {
      key = null; // passphrase changed (or file damaged): re-key with a fresh salt
    }
  }
  if (!key) {
    salt = VaultCrypto.randomBytes(16);
    iterations = iterations || VaultCrypto.ITERATIONS;
    key = await VaultCrypto.deriveKey(passphrase, salt, iterations);
  }
  const env = await VaultCrypto.seal(snapshot, key, { salt, iterations, updatedAt: snapshot.generatedAt });
  fs.writeFileSync(outFile, JSON.stringify(env) + "\n");
  return { changed: true, sessions: snapshot.sessions.length, outFile };
}

if (require.main === module) {
  const outFile = process.argv[2] || process.env.VAULT_FILE || "data.enc.json";
  sync({
    token: process.env.JEFIT_TOKEN,
    passphrase: process.env.VAULT_PASSPHRASE,
    outFile,
    since: process.env.SYNC_SINCE || DEFAULT_SINCE,
    log: (m) => console.log(m),
  }).then((r) => {
    // Counts only — never print workout data in a public repo's Actions log.
    console.log(r.changed ? `Synced ${r.sessions} workouts → ${r.outFile}` : `No changes (${r.sessions} workouts).`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${r.changed}\n`);
  }).catch((e) => {
    console.error(`::error::${e instanceof JefitError ? `${e.message} [${e.code}]` : e.message}`);
    process.exit(1);
  });
}

module.exports = { sync, sinceToUnix, DEFAULT_SINCE };
