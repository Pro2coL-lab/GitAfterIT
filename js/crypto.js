// Vault encryption with WebCrypto (browser and Node 20+):
// passphrase → PBKDF2-SHA256 (600,000 rounds) → AES-256-GCM key.
// GitHub only ever stores the envelope produced by seal(); without the passphrase it is unreadable.
(function (root, factory) {
  const m = factory(root);
  if (typeof module === "object" && module.exports) module.exports = m;
  else root.VaultCrypto = m;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const FORMAT = "repfolio-vault";
  const VERSION = 1;
  const ITERATIONS = 600000;
  const subtle = () => root.crypto.subtle;
  const te = new TextEncoder();
  const td = new TextDecoder();

  function toB64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(b64) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  const randomBytes = (n) => root.crypto.getRandomValues(new Uint8Array(n));

  class VaultError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }

  /** Derive a non-extractable AES-GCM key. Safe to store in IndexedDB (it cannot be exported). */
  async function deriveKey(passphrase, salt, iterations = ITERATIONS) {
    const base = await subtle().importKey("raw", te.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return subtle().deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  // The plaintext header is bound to the ciphertext as additional data, so it can't be altered.
  const aad = (env) => te.encode(JSON.stringify([env.format, env.v, env.kdf.iterations, env.kdf.salt, env.updatedAt]));

  function validate(env) {
    if (!env || env.format !== FORMAT || env.v !== VERSION || !env.kdf?.salt || !env.iv || !env.ciphertext) {
      throw new VaultError("bad_format", "The data file is not a Repfolio vault (or is from a newer version).");
    }
    return env;
  }

  /** Encrypt a JSON-serialisable value into an envelope. */
  async function seal(value, key, { salt, iterations = ITERATIONS, updatedAt = new Date().toISOString() }) {
    const env = {
      format: FORMAT, v: VERSION,
      kdf: { name: "PBKDF2-SHA256", iterations, salt: toB64(salt) },
      cipher: "AES-256-GCM",
      updatedAt,
      iv: toB64(randomBytes(12)),
      ciphertext: "",
    };
    const ct = await subtle().encrypt(
      { name: "AES-GCM", iv: fromB64(env.iv), additionalData: aad(env) }, key, te.encode(JSON.stringify(value)));
    env.ciphertext = toB64(new Uint8Array(ct));
    return env;
  }

  /** Decrypt an envelope. Throws VaultError("wrong_passphrase") if the key is wrong or the data was altered. */
  async function open(env, key) {
    validate(env);
    let pt;
    try {
      pt = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(env.iv), additionalData: aad(env) }, key, fromB64(env.ciphertext));
    } catch {
      throw new VaultError("wrong_passphrase", "Wrong passphrase, or the data was changed.");
    }
    return JSON.parse(td.decode(pt));
  }

  /** Derive the key for an existing envelope from a passphrase. */
  const keyFor = (env, passphrase) => deriveKey(passphrase, fromB64(validate(env).kdf.salt), env.kdf.iterations);

  return { FORMAT, VERSION, ITERATIONS, VaultError, deriveKey, keyFor, seal, open, validate, randomBytes, toB64, fromB64 };
});
