// Reads the encrypted JEFIT snapshot from the repo's `jefit-data` branch and keeps it on this device.
//
// Offline-first:
//   - An encrypted copy of the vault is kept in localStorage.
//   - The unlock key (a non-extractable CryptoKey) is kept in IndexedDB, so you are not
//     asked for the passphrase every visit. "Lock" deletes it.
//   - The GitHub Contents API is read without a token — the repo is public, and the file
//     is ciphertext. The site never writes; GitHub Actions does (see tools/sync-jefit.js).
(function (root, factory) {
  const m = factory(root, typeof require === "function" && typeof module === "object" ? require("./crypto.js") : root.VaultCrypto);
  if (typeof module === "object" && module.exports) module.exports = m;
  else root.Vault = m;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, VaultCrypto) {
  const { VaultError } = VaultCrypto;
  const CACHE_KEY = "repfolio.vault.v1";

  /** In-memory key store (tests, or browsers where IndexedDB is unavailable). */
  function memoryKeyStore() {
    let v = null;
    return { get: async () => v, set: async (x) => { v = x; }, clear: async () => { v = null; } };
  }

  /** IndexedDB key store. CryptoKey objects are structured-cloneable, and ours are non-extractable. */
  function idbKeyStore(name = "repfolio") {
    const fallback = memoryKeyStore();
    const db = () => new Promise((resolve, reject) => {
      const req = root.indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("keys");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = async (mode, fn) => {
      const d = await db();
      return new Promise((resolve, reject) => {
        const t = d.transaction("keys", mode);
        const r = fn(t.objectStore("keys"));
        t.oncomplete = () => resolve(r?.result);
        t.onerror = () => reject(t.error);
      });
    };
    const safe = (op, fb) => async (...a) => { try { return await op(...a); } catch { return fb(...a); } };
    return {
      get: safe(() => tx("readonly", (s) => s.get("vault")), fallback.get),
      set: safe((v) => tx("readwrite", (s) => s.put(v, "vault")).then(() => fallback.set(v)), fallback.set),
      clear: safe(() => tx("readwrite", (s) => s.delete("vault")).then(() => fallback.clear()), fallback.clear),
    };
  }

  /** localStorage wrapper that never throws (private mode, blocked storage, quota). */
  function safeStorage(ls) {
    return {
      get(k) { try { return ls?.getItem(k) ?? null; } catch { return null; } },
      set(k, v) { try { ls?.setItem(k, v); return true; } catch { return false; } },
      remove(k) { try { ls?.removeItem(k); } catch { /* ignore */ } },
    };
  }

  /**
   * @param opts.owner, opts.repo, opts.branch, opts.path  where the encrypted file lives
   * @param opts.fetch    fetch implementation (tests pass the fake GitHub)
   * @param opts.storage  { get, set, remove } — encrypted envelope cache
   * @param opts.keys     { get, set, clear } — unlock key store
   */
  function create(opts) {
    const { owner, repo, branch = "jefit-data", path = "data.enc.json" } = opts;
    const fetchImpl = opts.fetch ?? root.fetch.bind(root);
    const storage = opts.storage ?? safeStorage(root.localStorage);
    const keys = opts.keys ?? memoryKeyStore();
    const apiBase = opts.apiBase ?? "https://api.github.com";

    const url = () =>
      `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`;

    /** Latest envelope from GitHub, or null if the branch/file doesn't exist yet. */
    async function fetchRemote() {
      let res;
      try {
        res = await fetchImpl(url(), { headers: { Accept: "application/vnd.github.raw+json" }, cache: "no-store" });
      } catch {
        throw new VaultError("offline", "Couldn't reach GitHub.");
      }
      if (res.status === 404) return null;
      if (res.status === 403 || res.status === 429) throw new VaultError("rate_limited", "GitHub is rate-limiting this device. Try again in a while.");
      if (!res.ok) throw new VaultError("github_error", `GitHub returned HTTP ${res.status}.`);
      return VaultCrypto.validate(JSON.parse(await res.text()));
    }

    function cached() {
      const s = storage.get(CACHE_KEY);
      if (!s) return null;
      try { return VaultCrypto.validate(JSON.parse(s)); } catch { return null; }
    }
    const save = (env) => storage.set(CACHE_KEY, JSON.stringify(env));

    /** Unlock with the cached copy and stored key, without the network. Null if locked or nothing cached. */
    async function load() {
      const env = cached();
      const k = await keys.get();
      if (!env || !k || k.salt !== env.kdf.salt) return null;
      try {
        return { data: await VaultCrypto.open(env, k.key), updatedAt: env.updatedAt };
      } catch {
        return null;
      }
    }

    /** Unlock with a passphrase. Prefers the latest remote copy; falls back to the cached one when offline. */
    async function unlock(passphrase) {
      let env = null;
      try { env = await fetchRemote(); } catch (e) { if (!cached()) throw e; }
      env = env ?? cached();
      if (!env) throw new VaultError("no_data", "No synced data yet. Run the “Sync JEFIT” workflow in GitHub Actions first.");
      const key = await VaultCrypto.keyFor(env, passphrase);
      const data = await VaultCrypto.open(env, key); // throws wrong_passphrase
      save(env);
      await keys.set({ key, salt: env.kdf.salt });
      return { data, updatedAt: env.updatedAt };
    }

    /**
     * Check GitHub for a newer sync.
     * @returns { status: "updated", data, updatedAt } | { status: "unchanged" } | { status: "locked" }
     */
    async function refresh() {
      const env = await fetchRemote();
      if (!env) return { status: "unchanged" };
      const current = cached();
      if (current && current.updatedAt === env.updatedAt && current.iv === env.iv) return { status: "unchanged" };
      const k = await keys.get();
      if (!k || k.salt !== env.kdf.salt) return { status: "locked" }; // vault re-keyed: ask for the passphrase again
      const data = await VaultCrypto.open(env, k.key);
      save(env);
      return { status: "updated", data, updatedAt: env.updatedAt };
    }

    /** Forget the unlock key on this device (the encrypted copy stays; it's useless without the key). */
    const lock = () => keys.clear();
    /** Remove everything this app stored on this device. */
    const forget = async () => { await keys.clear(); storage.remove(CACHE_KEY); };

    return { url, fetchRemote, cached, load, unlock, refresh, lock, forget };
  }

  return { create, memoryKeyStore, idbKeyStore, safeStorage, CACHE_KEY };
});
