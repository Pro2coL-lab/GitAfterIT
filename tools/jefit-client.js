// JEFIT Open Training API (v2, beta) client — read-only. Runs in GitHub Actions, never in the browser.
"use strict";

const BASE = "https://www.jefit.com/api";

class JefitError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// The status alone can't tell these apart (three different 403s), so branch on the body's `error`.
const FRIENDLY = {
  entitlement_required: "Your JEFIT Elite subscription is not active. The API requires Elite for every request — renew it in JEFIT.",
  invalid_token: "The JEFIT token is invalid, expired or revoked. Create a new one and update the JEFIT_TOKEN secret.",
  insufficient_scope: "This token is read-only and a write was attempted. (The sync only reads, so this is a bug.)",
  forbidden_resource: "A request touched data belonging to another account. This is a bug in the sync.",
  missing_token: "JEFIT_TOKEN is not set. Add it as a repository secret.",
  network_error: "Could not reach jefit.com.",
};

async function parseError(res) {
  let code = `http_${res.status}`;
  let message = "";
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const body = JSON.parse(text);
      // Two shapes: { error, message, param? } or { errors: [{ error, message, param }] }
      const e = (body.errors && body.errors[0]) || body;
      if (e && e.error) code = e.error;
      message = [e && e.message, e && e.param && `(${e.param})`].filter(Boolean).join(" ");
    } catch { /* not JSON */ }
  } else if (res.status === 400) {
    message = "JEFIT rejected the request (empty 400).";
  }
  return new JefitError(res.status, code, FRIENDLY[code] || message || `JEFIT returned HTTP ${res.status}.`);
}

function createClient({ token, fetch: fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), base = BASE, log = () => {} } = {}) {
  async function get(path, params = {}) {
    if (!token) throw new JefitError(0, "missing_token", FRIENDLY.missing_token);
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));

    let rateLimitRetries = 0;
    let serverRetries = 0;
    for (;;) {
      let res;
      try {
        res = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      } catch (e) {
        throw new JefitError(0, "network_error", FRIENDLY.network_error);
      }
      if (res.ok) {
        const body = await res.json();
        return body && typeof body === "object" && "data" in body ? body.data : body;
      }
      // 429 is the one refusal worth retrying — wait exactly as long as Retry-After says.
      if (res.status === 429 && rateLimitRetries < 3) {
        rateLimitRetries++;
        const ra = Number(res.headers.get("Retry-After"));
        const wait = Number.isFinite(ra) && ra >= 0 ? ra : 5;
        log(`Rate limited; waiting ${wait}s`);
        await sleep(wait * 1000);
        continue;
      }
      // 5xx: retry at most once (safe — reads only).
      if (res.status >= 500 && serverRetries < 1) {
        serverRetries++;
        await sleep(2000);
        continue;
      }
      throw await parseError(res);
    }
  }

  /** Sessions with nested logs in [start, end), fetched in windows to keep responses small. */
  async function getSessions(start, end, windowDays = 180) {
    const out = [];
    for (let s = start; s < end; s += windowDays * 86400) {
      const e = Math.min(end, s + windowDays * 86400);
      out.push(...(await get("/v2/user/sessions", { startDate: s, endDate: e })));
    }
    return out;
  }

  /** Whole exercise library + your custom exercises, id fields and names only. Always sends `limit`. */
  async function getExercises(pageSize = 2000) {
    const all = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await get("/v2/exercises", {
        select: "id,local_id,numeric_local_id,name,input_format",
        limit: pageSize,
        offset,
      });
      all.push(...page);
      if (page.length < pageSize) break;
    }
    return all;
  }

  async function getCurrentRoutine() {
    try {
      return await get("/v2/user/current-routine");
    } catch (e) {
      if (e instanceof JefitError && e.status === 404) return null;
      throw e;
    }
  }

  async function fetchAll({ start, end }) {
    const sessions = await getSessions(start, end);
    const exercises = await getExercises();
    const routine = await getCurrentRoutine();
    return { sessions, exercises, routine };
  }

  return { get, getSessions, getExercises, getCurrentRoutine, fetchAll };
}

module.exports = { createClient, JefitError, FRIENDLY };
