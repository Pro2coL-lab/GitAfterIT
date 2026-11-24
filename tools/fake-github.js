// In-memory GitHub Contents API (read side), so vault sync can be tested without the real repo.
"use strict";

function createFakeGitHub() {
  const files = new Map(); // "owner/repo@branch:path" -> string
  const state = { offline: false, rateLimited: false, calls: 0 };
  const key = (o, r, b, p) => `${o}/${r}@${b}:${p}`;
  const res = (status, text) => ({ status, ok: status >= 200 && status < 300, text: async () => text, json: async () => JSON.parse(text) });

  async function fetch(url, init = {}) {
    state.calls++;
    if (state.offline) throw new TypeError("Failed to fetch");
    if (state.rateLimited) return res(403, '{"message":"API rate limit exceeded"}');
    const u = new URL(url);
    const m = u.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
    if (!m || (init.method && init.method !== "GET")) return res(404, '{"message":"Not Found"}');
    if (init.headers?.Authorization) throw new Error("fake GitHub: the site must read without a token");
    if (init.headers?.Accept !== "application/vnd.github.raw+json") throw new Error("fake GitHub: expected raw media type");
    const k = key(decodeURIComponent(m[1]), decodeURIComponent(m[2]), u.searchParams.get("ref") || "main", decodeURIComponent(m[3]));
    return files.has(k) ? res(200, files.get(k)) : res(404, '{"message":"Not Found"}');
  }
  const put = (o, r, b, p, text) => files.set(key(o, r, b, p), text);
  return { fetch, put, state };
}

/** A localStorage stand-in. */
function memoryStorage() {
  const m = new Map();
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => (m.set(k, v), true), remove: (k) => m.delete(k), _map: m };
}

module.exports = { createFakeGitHub, memoryStorage };
