// In-memory JEFIT API: a fetch() that answers the endpoints the sync uses, from sample data.
"use strict";
const Sample = require("../js/sample.js");

function createFakeJefit({ token = "jfit_pat_test", nowSec = Math.floor(Date.now() / 1000), raw = Sample.rawData(nowSec) } = {}) {
  const calls = [];
  const behaviour = { lapsed: false, rateLimitNext: 0, retryAfter: "0", errorNext: null };
  const json = (status, body, headers = {}) => ({
    status, ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k] ?? null },
    json: async () => body, text: async () => (body === undefined ? "" : JSON.stringify(body)),
  });

  async function fetch(url, init = {}) {
    const u = new URL(url);
    calls.push(u.pathname + u.search);
    if (init.method && init.method !== "GET") throw new Error("fake JEFIT: sync must only read");
    if ((init.headers?.Authorization ?? "") !== `Bearer ${token}`) return json(401, { error: "invalid_token", message: "bad token" });
    if (behaviour.lapsed) return json(403, { error: "entitlement_required", message: "elite" });
    if (behaviour.rateLimitNext > 0) { behaviour.rateLimitNext--; return json(429, { error: "rate_limited" }, { "Retry-After": behaviour.retryAfter }); }
    if (behaviour.errorNext) { const e = behaviour.errorNext; behaviour.errorNext = null; return json(e.status, e.body); }

    const p = u.pathname.replace(/^\/api/, "");
    const q = u.searchParams;
    if (p === "/v2/user/sessions") {
      const s = Number(q.get("startDate")), e = Number(q.get("endDate"));
      return json(200, { data: raw.sessions.filter((x) => x.date >= s && x.date < e) });
    }
    if (p === "/v2/exercises") {
      // Like the real API: anything but select/sort/ids/limit/offset is a 400; we also insist on limit.
      for (const k of q.keys()) if (!["select", "sort", "ids", "limit", "offset"].includes(k)) return json(400, { errors: [{ error: "invalid_param", message: "unknown", param: k }] });
      if (!q.get("limit")) throw new Error("fake JEFIT: /v2/exercises called without limit");
      const lim = Number(q.get("limit")), off = Number(q.get("offset") || 0);
      return json(200, { data: raw.exercises.slice(off, off + lim) });
    }
    if (p === "/v2/user/current-routine") return raw.routine ? json(200, { data: raw.routine }) : json(404, { error: "not_found" });
    return json(404, { error: "not_found" });
  }
  return { fetch, calls, behaviour, raw, token };
}

module.exports = { createFakeJefit };
