// Views and routing. Hash routes: #/  #/sessions  #/session/<local_id>  #/exercise/<id>  #/routine
(function () {
  const { html, tile } = window.UI;
  const { barChart, lineChart } = window.Charts;
  const F = window.Format;
  const M = window.Metrics;
  const cfg = window.REPFOLIO_CONFIG;

  const DAY = 86400;
  const app = document.getElementById("app");
  const status = document.getElementById("sync-status");
  const now = () => Math.floor(Date.now() / 1000);
  const DEMO_KEY = "repfolio.demo";

  F.configure(cfg);
  const vault = window.Vault.create({ ...cfg, keys: window.Vault.idbKeyStore() });
  const state = { data: null, updatedAt: null, demo: false };

  // ---------- helpers ----------
  const exerciseLink = (id, name) => html`<a href="#/exercise/${encodeURIComponent(id)}">${name}</a>`;
  function sessionMeta(s) {
    const v = M.sessionVolume(s);
    return `${F.fmtDuration(s.workout_time ?? s.total_time)} · ${F.plural(M.sessionSets(s), "set")}${v > 0 ? ` · ${F.fmtWeight(v, 0)}` : ""}`;
  }
  const sessionsSince = (start) => state.data.sessions.filter((s) => s.date >= start);

  // ---------- views ----------
  function dashboard() {
    const WEEKS = 12;
    const start = M.weekStart(now()) - (WEEKS - 1) * 7 * DAY;
    const sessions = sessionsSince(start);
    const last30 = sessions.filter((s) => s.date >= now() - 30 * DAY);
    const vol30 = last30.reduce((t, s) => t + M.sessionVolume(s), 0);
    const avgTime = last30.length ? last30.reduce((t, s) => t + (s.workout_time ?? s.total_time ?? 0), 0) / last30.length : 0;
    const records30 = last30.reduce((t, s) => t + (s.records_broken ?? 0), 0);

    const weeks = Array.from({ length: WEEKS }, (_, i) => start + i * 7 * DAY);
    const vol = new Map(weeks.map((w) => [w, 0]));
    const count = new Map(weeks.map((w) => [w, 0]));
    for (const s of sessions) {
      const w = M.weekStart(s.date);
      if (!vol.has(w)) continue;
      vol.set(w, vol.get(w) + M.sessionVolume(s));
      count.set(w, count.get(w) + 1);
    }
    const freq = new Map();
    for (const s of sessions) for (const l of s.logs) {
      const f = freq.get(l.exercise_id) ?? { name: l.exercise_name, n: 0 };
      f.n++;
      freq.set(l.exercise_id, f);
    }
    const top = [...freq.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);

    return html`
      <h1>Dashboard</h1>
      <p class="sub">Last ${WEEKS} weeks of training from JEFIT.</p>
      <div class="tiles">
        ${tile("Workouts (30 days)", last30.length)}
        ${tile("Volume (30 days)", F.fmtWeight(vol30, 0), "weight × reps, working sets")}
        ${tile("Avg workout time", F.fmtDuration(avgTime))}
        ${tile("Records broken (30 days)", records30)}
      </div>
      <div class="grid2 mt">
        <div class="card"><strong>Weekly volume</strong>${barChart(weeks.map((w) => ({ label: F.fmtShortDate(w), value: F.fromLbs(vol.get(w)) })), F.weightUnit())}</div>
        <div class="card"><strong>Workouts per week</strong>${barChart(weeks.map((w) => ({ label: F.fmtShortDate(w), value: count.get(w) })), "workouts", true)}</div>
      </div>
      <h2>Recent workouts</h2>
      ${sessions.length === 0 ? html`<p class="muted">No workouts logged in this period.</p>` : html`
        <div class="list">
          ${sessions.slice(0, 6).map((s) => html`
            <a class="card row" href="#/session/${s.local_id}">
              <span><strong>${F.fmtDate(s.date)}</strong> <span class="muted">· ${F.plural(s.logs.length, "exercise")}</span></span>
              <span class="muted">${sessionMeta(s)}</span>
            </a>`)}
          <a href="#/sessions">All workouts →</a>
        </div>`}
      <h2>Most trained exercises</h2>
      <div class="chips">${top.map(([id, f]) => html`<a class="chip" href="#/exercise/${encodeURIComponent(id)}">${f.name} · ${f.n}</a>`)}</div>`;
  }

  const RANGES = [30, 90, 180, 365];
  function historyView(params) {
    const days = RANGES.includes(Number(params.get("days"))) ? Number(params.get("days")) : 90;
    const sessions = sessionsSince(now() - days * DAY);
    return html`
      <h1>Workout history</h1>
      <p class="sub">${F.plural(sessions.length, "workout")} in the last ${days} days.</p>
      <div class="chips mb">
        ${RANGES.map((r) => html`<a class="chip${r === days ? " on" : ""}" href="#/sessions?days=${r}">${r} days</a>`)}
      </div>
      <div class="list">
        ${sessions.map((s) => html`
          <a class="card" href="#/session/${s.local_id}">
            <div class="row"><strong>${F.fmtDate(s.date)}</strong><span class="muted">${sessionMeta(s)}</span></div>
            <div class="muted small">${s.logs.map((l) => l.exercise_name).join(" · ")}</div>
          </a>`)}
      </div>`;
  }

  function session(localId) {
    const s = state.data.sessions.find((x) => String(x.local_id) === localId);
    if (!s) return notFound("That workout isn't in your synced data.");
    const v = M.sessionVolume(s);
    return html`
      <p><a href="#/sessions">← History</a></p>
      <h1>${F.fmtDate(s.date)}</h1>
      <p class="sub">${F.fmtDuration(s.workout_time ?? s.total_time)} workout · ${F.plural(s.logs.length, "exercise")}${v > 0 ? ` · ${F.fmtWeight(v, 0)} volume` : ""}${s.records_broken ? ` · ${F.plural(s.records_broken, "record")} broken` : ""}</p>
      <div class="list">
        ${s.logs.map((l) => html`
          <div class="card">
            <div class="row mb-s">
              <strong>${exerciseLink(l.exercise_id, l.exercise_name)}</strong>
              ${l.record_type === "weight_and_reps" ? html`<span class="muted">${F.fmtWeight(M.logVolume(l), 0)}</span>` : ""}
            </div>
            <table>
              <thead><tr><th class="w-s">Set</th><th>Performed</th><th class="w-m">Rest</th></tr></thead>
              <tbody>
                ${l.log_sets.map((set, i) => html`
                  <tr><td>${i + 1}</td>
                    <td>${F.describeSet(set, l.record_type)}${set.type !== "default" ? html`<span class="settype"> · ${set.type}</span>` : ""}</td>
                    <td class="muted">${set.interval != null ? F.fmtDuration(set.interval) : "—"}</td></tr>`)}
              </tbody>
            </table>
          </div>`)}
      </div>`;
  }

  function exercise(id) {
    const since = now() - 365 * DAY;
    const logs = [];
    for (const s of state.data.sessions) {
      if (s.date < since) continue;
      for (const l of s.logs) if (l.exercise_id === id) logs.push({ ...l, session_local_id: s.local_id });
    }
    logs.sort((a, b) => a.date - b.date);
    const name = state.data.exercises[id] ?? logs[0]?.exercise_name;
    if (!name) return notFound("That exercise isn't in your synced data.");
    if (!logs.length) return html`<p><a href="#/">← Dashboard</a></p><h1>${name}</h1><p class="muted">No logs for this exercise in the last year.</p>`;

    const counts = new Map();
    for (const l of logs) counts.set(l.record_type, (counts.get(l.record_type) ?? 0) + 1);
    const type = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const points = logs.filter((l) => l.record_type === type).map(M.progressPoint);
    const series = (key, conv = (v) => v) => points.filter((p) => p[key] !== undefined).map((p) => ({ label: F.fmtShortDate(p.date), value: conv(p[key]) }));
    const best = (key) => Math.max(0, ...points.map((p) => p[key] ?? 0));
    const u = F.weightUnit();

    const spec = {
      weight_and_reps: {
        charts: [["Estimated 1RM (Epley)", series("bestE1rm", F.fromLbs), u], ["Volume per workout", series("volume", F.fromLbs), u]],
        tiles: [["Best est. 1RM", F.fmtWeight(best("bestE1rm"))], ["Heaviest set", F.fmtWeight(best("topWeight"))], ["Best volume", F.fmtWeight(best("volume"), 0)]],
      },
      reps: {
        charts: [["Max reps in a set", series("maxReps"), "reps"], ["Total reps", series("totalReps"), "reps"]],
        tiles: [["Most reps in a set", best("maxReps")], ["Most total reps", best("totalReps")]],
      },
      reps_and_duration: {
        charts: [["Total reps", series("totalReps"), "reps"], ["Total time", series("totalDuration"), "s"]],
        tiles: [["Most total reps", best("totalReps")], ["Longest total", F.fmtDuration(best("totalDuration"))]],
      },
      duration: {
        charts: [["Total time", series("totalDuration"), "s"]],
        tiles: [["Longest total", F.fmtDuration(best("totalDuration"))]],
      },
      cardio: {
        charts: [["Duration", series("totalDuration", (v) => v / 60), "min"], ["Distance", series("distance"), ""]],
        tiles: [["Longest", F.fmtDuration(best("totalDuration"))], ["Farthest", best("distance")]],
      },
    }[type] ?? { charts: [], tiles: [] };

    return html`
      <p><a href="#/">← Dashboard</a></p>
      <h1>${name}</h1>
      <p class="sub">${F.plural(logs.length, "workout")} in the last year.</p>
      <div class="tiles">${tile("Workouts", logs.length)}${spec.tiles.map(([l, v]) => tile(l, v))}</div>
      <div class="grid2 mt">
        ${spec.charts.map(([title, data, unit]) => html`<div class="card"><strong>${title}</strong>${lineChart(data, unit)}</div>`)}
      </div>
      <h2>History</h2>
      <div class="card"><table>
        <thead><tr><th>Date</th><th>Sets</th></tr></thead>
        <tbody>${[...logs].reverse().map((l) => html`
          <tr><td class="nowrap"><a href="#/session/${l.session_local_id}">${F.fmtDate(l.date)}</a></td>
            <td>${l.log_sets.map((s) => F.describeSet(s, l.record_type) + (s.type === "warm-up" ? " (w)" : "")).join(", ")}</td></tr>`)}
        </tbody>
      </table></div>`;
  }

  /** Prescription text using only applicable_set_fields — leftovers like "8 reps @ 10 lb" on a plank are ignored. */
  function prescription(de) {
    const fields = de.applicable_set_fields;
    const has = (f) => (fields ? fields.includes(f) : f === "weight_lbs" || f === "reps");
    const one = (s) => [
      has("weight_lbs") && s.weight_lbs ? F.fmtWeight(s.weight_lbs, 0) : null,
      has("reps") && s.reps != null ? `${s.reps} reps` : null,
      has("duration") && s.duration ? F.fmtDuration(s.duration) : null,
    ].filter(Boolean).join(" × ");
    const descs = de.sets.map(one);
    const body = descs.every((x) => x === descs[0]) ? `${descs.length} × ${descs[0] || "set"}` : descs.join(", ");
    const rest = de.sets[de.sets.length - 1]?.rest_time ?? de.rest_time;
    return rest != null ? `${body} · rest ${F.fmtDuration(rest)}` : body;
  }

  function routine() {
    const r = state.data.routine;
    if (!r) return html`<h1>Current routine</h1><p class="muted">No current routine is set in JEFIT.</p>`;
    return html`
      <h1>${r.name}</h1>
      <p class="sub">${r.description || "Your current JEFIT routine."} · ${F.plural(r.days.length, "day")}</p>
      <div class="grid2">
        ${r.days.map((d) => html`
          <div class="card">
            <div class="row"><strong>${d.name}</strong>${d.estimated_duration ? html`<span class="muted">~${F.fmtDuration(d.estimated_duration)}</span>` : ""}</div>
            ${d.rest_day ? html`<p class="muted">Rest day</p>` : html`
              <table class="mt-s"><tbody>
                ${d.day_exercises.map((de) => html`
                  <tr><td>${de.exercise ? exerciseLink(de.exercise.id, de.exercise.name) : html`<span class="muted">Unknown exercise</span>`}${de.numeric_superset ? html`<span class="settype"> · superset</span>` : ""}</td>
                    <td class="muted">${prescription(de)}</td></tr>`)}
              </tbody></table>`}
          </div>`)}
      </div>`;
  }

  const notFound = (msg) => html`<h1>Not found</h1><p class="muted">${msg}</p><p><a href="#/">← Dashboard</a></p>`;

  function unlockView(message) {
    return html`
      <div class="card unlock">
        <h1>Unlock your training data</h1>
        <p class="sub">Your JEFIT data is stored encrypted in this site's GitHub repository. Enter the passphrase you set as the <code>VAULT_PASSPHRASE</code> secret.</p>
        <form id="unlock-form">
          <label for="passphrase">Passphrase</label>
          <input id="passphrase" name="passphrase" type="password" autocomplete="current-password" required autofocus>
          <button type="submit">Unlock</button>
        </form>
        ${message ? html`<p class="error" role="alert">${message}</p>` : ""}
        <p class="muted small">This device remembers the unlock key until you press “Lock”.
          Or <a href="#" data-action="demo">try it with sample data</a>.</p>
      </div>`;
  }

  // ---------- router ----------
  const routes = [
    [/^\/$/, "dashboard", () => dashboard()],
    [/^\/sessions$/, "sessions", (_, q) => historyView(q)],
    [/^\/session\/(\d+)$/, "sessions", (m) => session(m[1])],
    [/^\/exercise\/([du]_\d+)$/, null, (m) => exercise(m[1])],
    [/^\/routine$/, "routine", () => routine()],
  ];

  function render() {
    document.body.classList.toggle("locked", !state.data);
    if (!state.data) {
      app.innerHTML = String(unlockView(state.unlockMessage));
      return;
    }
    const [path, query = ""] = (location.hash.slice(1) || "/").split("?");
    let match = null;
    for (const [re, nav, view] of routes) {
      const m = path.match(re);
      if (m) { match = { m, nav, view }; break; }
    }
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", match?.nav === a.dataset.nav));
    let out;
    try {
      out = match ? match.view(match.m, new URLSearchParams(query)) : notFound("No such page.");
    } catch (e) {
      console.error(e);
      out = html`<div class="error" role="alert">Something went wrong showing this page.</div>`;
    }
    app.innerHTML = String(out);
    updateStatus();
  }

  function updateStatus() {
    document.getElementById("demo-badge").hidden = !state.demo;
    document.getElementById("lock-btn").hidden = !state.data;
    document.getElementById("lock-btn").textContent = state.demo ? "Exit sample" : "Lock";
    status.textContent = state.data && !state.demo && state.updatedAt ? `Synced ${F.fmtAgo(state.updatedAt)}` : "";
    if (state.updatedAt) status.title = new Date(state.updatedAt).toLocaleString();
  }

  function show(result, { demo = false } = {}) {
    state.data = result.data;
    state.updatedAt = result.updatedAt;
    state.demo = demo;
    state.unlockMessage = null;
    render();
  }

  async function backgroundRefresh() {
    try {
      const r = await vault.refresh();
      if (r.status === "updated" && !state.demo) show(r);
      // Only meaningful if we were showing data: the vault was re-keyed with a new passphrase.
      if (r.status === "locked" && state.data && !state.demo) { state.data = null; state.unlockMessage = "Your data was re-encrypted with a new passphrase. Enter it to continue."; render(); }
    } catch (e) {
      // Offline or rate-limited: keep showing the cached copy.
      if (state.data && !state.demo) status.textContent = `Synced ${F.fmtAgo(state.updatedAt)} · offline copy`;
    }
  }

  // ---------- events ----------
  document.addEventListener("submit", async (ev) => {
    if (ev.target.id !== "unlock-form") return;
    ev.preventDefault();
    const btn = ev.target.querySelector("button");
    const input = ev.target.querySelector("#passphrase");
    btn.disabled = true;
    btn.textContent = "Unlocking…"; // PBKDF2 with 600,000 rounds takes a moment
    try {
      show(await vault.unlock(input.value));
    } catch (e) {
      state.unlockMessage = e.message || "Couldn't unlock.";
      render();
    }
  });

  document.addEventListener("click", async (ev) => {
    const a = ev.target.closest("[data-action]");
    if (!a) return;
    ev.preventDefault();
    if (a.dataset.action === "demo") {
      try { sessionStorage.setItem(DEMO_KEY, "1"); } catch { /* ignore */ }
      history.replaceState(null, "", "#/");
      show({ data: window.Sample.snapshot(), updatedAt: null }, { demo: true });
    }
    if (a.dataset.action === "lock") {
      if (state.demo) { try { sessionStorage.removeItem(DEMO_KEY); } catch { /* ignore */ } }
      else await vault.lock();
      state.data = null;
      state.demo = false;
      history.replaceState(null, "", "#/");
      render();
      updateStatus();
    }
  });

  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.data && !state.demo) backgroundRefresh(); });

  // ---------- boot ----------
  (async () => {
    let demo = false;
    try { demo = sessionStorage.getItem(DEMO_KEY) === "1"; } catch { /* ignore */ }
    if (demo) return show({ data: window.Sample.snapshot(), updatedAt: null }, { demo: true });
    const local = await vault.load();
    if (!local) { render(); updateStatus(); return; } // locked: wait for the passphrase
    show(local); // instant, offline-first
    backgroundRefresh();
  })();
})();
