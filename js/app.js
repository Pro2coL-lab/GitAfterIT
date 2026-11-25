// Views and routing. Hash routes: #/  #/sessions  #/session/<local_id>  #/exercise/<id>  #/routine
(function () {
  const { html, raw, tile } = window.UI;
  const { barChart, lineChart, landmarkChart } = window.Charts;
  const F = window.Format;
  const M = window.Metrics;
  const MU = window.Muscles;
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
  // JEFIT's total_time is start→finish (rest included); workout_time excludes rest, so it reads short.
  const sessionTime = (s) => s.total_time || s.workout_time || null;
  function sessionMeta(s) {
    const v = M.sessionVolume(s);
    return `${F.fmtDuration(sessionTime(s))} · ${F.plural(M.sessionSets(s), "set")}${v > 0 ? ` · ${F.fmtWeight(v, 0)}` : ""}`;
  }
  const sessionsSince = (start) => state.data.sessions.filter((s) => s.date >= start);

  // ---------- views ----------
  const PERIOD_UI = {
    day: { chip: "Daily", noun: "day", count: 14, sub: "Last 14 days" },
    week: { chip: "Weekly", noun: "week", count: 12, sub: "Last 12 weeks" },
    month: { chip: "Monthly", noun: "month", count: 12, sub: "Last 12 months" },
    year: { chip: "Yearly", noun: "year", count: null, sub: "Every year on record" },
  };
  const sessionDay = (s) => M.dayKey(F.dateParts(s.date));
  const todayKey = () => M.dayKey(F.dateParts(now()));

  function dashboard(_m, params) {
    const period = M.PERIODS.includes(params.get("view")) ? params.get("view") : "week";
    const ui = PERIOD_UI[period];
    const all = state.data.sessions; // newest first
    const today = todayKey();
    let count = ui.count;
    if (count == null) { // yearly: from the first year with data to this year
      const firstYear = all.length ? F.dateParts(all[all.length - 1].date).y : F.dateParts(now()).y;
      count = Math.min(10, Math.max(1, F.dateParts(now()).y - firstYear + 1));
    }
    const buckets = M.periodRange(today, period, count);
    const vol = new Map(buckets.map((k) => [k, 0]));
    const n = new Map(buckets.map((k) => [k, 0]));
    const inRange = [];
    for (const s of all) {
      const k = M.periodStart(sessionDay(s), period);
      if (!vol.has(k)) continue;
      inRange.push(s);
      vol.set(k, vol.get(k) + M.sessionVolume(s));
      n.set(k, n.get(k) + 1);
    }

    const last30 = all.filter((s) => s.date >= now() - 30 * DAY);
    const vol30 = last30.reduce((t, s) => t + M.sessionVolume(s), 0);
    const timed30 = last30.map(sessionTime).filter((t) => t > 0);
    const avgTime = timed30.length ? timed30.reduce((a, b) => a + b, 0) / timed30.length : null;
    const records30 = last30.reduce((t, s) => t + (s.records_broken ?? 0), 0);

    const freq = new Map();
    for (const s of inRange) for (const l of s.logs) {
      const f = freq.get(l.exercise_id) ?? { name: l.exercise_name, n: 0 };
      f.n++;
      freq.set(l.exercise_id, f);
    }
    const top = [...freq.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    const label = (k) => F.fmtPeriod(k, period);
    const cap = ui.chip; // "Daily", "Weekly", …

    return html`
      <h1>Dashboard</h1>
      <p class="sub">Training from JEFIT.</p>
      <div class="tiles">
        ${tile("Workouts (30 days)", last30.length)}
        ${tile("Volume (30 days)", F.fmtWeight(vol30, 0), "weight × reps, working sets")}
        ${tile("Avg workout time", F.fmtDuration(avgTime))}
        ${tile("Records broken (30 days)", records30)}
      </div>
      <div class="row mt period-bar">
        <div class="chips" role="group" aria-label="Chart range">
          ${M.PERIODS.map((p) => html`<a class="chip${p === period ? " on" : ""}" href="#/?view=${p}&amp;sets=${setsView(params)}"${p === period ? raw(' aria-current="true"') : ""}>${PERIOD_UI[p].chip}</a>`)}
        </div>
        <span class="muted small">${ui.sub} · ${F.plural(inRange.length, "workout")}</span>
      </div>
      <div class="grid2 mt-s">
        <div class="card"><strong>${cap} volume</strong>${barChart(buckets.map((k) => ({ label: label(k), value: F.fromLbs(vol.get(k)) })), F.weightUnit())}</div>
        <div class="card"><strong>Workouts per ${ui.noun}</strong>${barChart(buckets.map((k) => ({ label: label(k), value: n.get(k) })), "workouts", true)}</div>
      </div>
      ${muscleVolumeCard(period, params)}
      <div class="grid2 mt">
        ${calendarCard()}
        <div class="card recent">
          <strong>Recent workouts</strong>
          ${all.length === 0 ? html`<p class="muted">No workouts logged yet.</p>` : html`
            <div class="mt-s">
              ${all.slice(0, 6).map((s) => html`
                <a class="row" href="#/session/${s.local_id}">
                  <span><strong>${F.fmtShortDate(s.date)}</strong> <span class="muted">· ${F.plural(s.logs.length, "exercise")}</span></span>
                  <span class="muted small">${sessionMeta(s)}</span>
                </a>`)}
            </div>
            <a class="small" href="#/sessions">All workouts →</a>`}
        </div>
      </div>
      <h2>Most trained exercises <span class="muted small">· ${ui.sub.toLowerCase()}</span></h2>
      ${top.length ? html`<div class="chips">${top.map(([id, f]) => html`<a class="chip" href="#/exercise/${encodeURIComponent(id)}">${f.name} · ${f.n}</a>`)}</div>`
        : html`<p class="muted">No workouts in this range.</p>`}`;
  }

  // ---------- weekly sets per muscle ----------
  const SETS_UI = {
    this: { chip: "This week", weeks: 1, from: 0 },
    last: { chip: "Last week", weeks: 1, from: -1 },
    avg4: { chip: "4-week avg", weeks: 4, from: -4 }, // the 4 complete weeks before this one
  };
  const setsView = (params) => (SETS_UI[params.get("sets")] ? params.get("sets") : "this");

  function muscleVolumeCard(period, params) {
    const view = setsView(params);
    const v = SETS_UI[view];
    const thisWeek = M.periodStart(todayKey(), "week");
    const start = M.shiftPeriod(thisWeek, "week", v.from);
    const end = M.shiftPeriod(start, "week", v.weeks);
    const sessions = state.data.sessions.filter((s) => { const k = sessionDay(s); return k >= start && k < end; });
    const { rows, unmapped } = MU.tally(sessions, { weeks: v.weeks });
    const range = v.weeks === 1 ? `Week of ${F.fmtPeriod(start, "week")}` : `${F.fmtPeriod(start, "week")} – ${F.fmtPeriod(M.shiftPeriod(end, "day", -1), "day")}`;
    const n1 = (x) => Number(x.toFixed(1));
    const chartRows = rows.map((r) => {
      const zone = MU.zone(r, r.effective);
      return { ...r, zone, tip: `${r.name}: ${n1(r.effective)} sets (${n1(r.primary)} primary + ${n1(r.secondary)} secondary × ½) · MEV ${r.mev} · MAV ${r.mav[0]}–${r.mav[1]} · MRV ${r.mrv} · ${MU.ZONE_LABEL[zone]}` };
    });
    const exList = (r) => (r.exercises.length
      ? r.exercises.map((e) => `${e.name}${e.role === "secondary" ? " (2°)" : ""} ×${n1(e.sets)}`).join(", ") : "—");

    return html`
      <div class="card mt">
        <div class="row">
          <strong>Weekly sets per muscle</strong>
          <div class="chips" role="group" aria-label="Weeks counted">
            ${Object.entries(SETS_UI).map(([k, o]) => html`<a class="chip${k === view ? " on" : ""}" href="#/?view=${period}&amp;sets=${k}"${k === view ? raw(' aria-current="true"') : ""}>${o.chip}</a>`)}
          </div>
        </div>
        <p class="muted small mt-s">${range} · ${F.plural(sessions.length, "workout")}${v.weeks > 1 ? " · sets per week" : ""}. Working sets; a secondary muscle counts half a set.</p>
        ${landmarkChart(chartRows)}
        <div class="legend small muted">
          <span><i class="sw b-under"></i>Below MEV</span><span><i class="sw b-low"></i>MEV–MAV</span>
          <span><i class="sw b-mav"></i>MAV (target)</span><span><i class="sw b-high"></i>MAV–MRV</span><span><i class="sw mrv"></i>MRV</span>
        </div>
        <details class="mt-s">
          <summary class="small">Breakdown by exercise</summary>
          <div class="scroll-x"><table class="mt-s small">
            <thead><tr><th>Muscle</th><th>Exercises</th><th class="num">Primary</th><th class="num">Secondary</th><th class="num">Total</th><th class="num">MEV · MAV · MRV</th><th>Status</th></tr></thead>
            <tbody>${chartRows.map((r) => html`
              <tr><td class="nowrap"><strong>${r.name}</strong></td><td class="muted">${exList(r)}</td>
                <td class="num">${n1(r.primary)}</td><td class="num">${n1(r.secondary)}</td><td class="num"><strong>${n1(r.effective)}</strong></td>
                <td class="num nowrap muted">${r.mev} · ${r.mav[0]}–${r.mav[1]} · ${r.mrv}</td><td class="nowrap z-${r.zone}">${MU.ZONE_LABEL[r.zone]}</td></tr>`)}
            </tbody>
          </table></div>
          ${unmapped.length ? html`<p class="small muted mt-s">Not counted (no muscle rule matches the name): ${unmapped.map((u) => `${u.name} ×${n1(u.sets)}`).join(", ")}.</p>` : ""}
          <p class="small muted">Landmarks after Israetel, Hoffmann &amp; Smith, <em>Scientific Principles of Hypertrophy Training</em>. (2°) = secondary.</p>
        </details>
      </div>`;
  }

  // ---------- calendar ----------
  // Month shown is kept in state so the arrows can redraw just the calendar without a page reload.
  function calendarCard() {
    const today = todayKey();
    const thisMonth = M.periodStart(today, "month");
    const all = state.data.sessions;
    const firstMonth = all.length ? M.periodStart(sessionDay(all[all.length - 1]), "month") : thisMonth;
    let month = state.calMonth ?? thisMonth;
    month = Math.min(thisMonth, Math.max(firstMonth, month));
    state.calMonth = month;

    const nextMonth = M.shiftPeriod(month, "month", 1);
    const byDay = new Map();
    for (const s of all) {
      const k = sessionDay(s);
      if (k < month || k >= nextMonth) continue;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(s);
    }
    const days = Math.round((nextMonth - month) / DAY);
    const lead = (new Date(month * 1000).getUTCDay() + 6) % 7; // Monday-first grid
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(html`<span class="cal-day blank"></span>`);
    for (let d = 1; d <= days; d++) {
      const k = month + (d - 1) * DAY;
      const list = byDay.get(k);
      const cls = `cal-day${list ? " on" : ""}${k === today ? " today" : ""}${k > today ? " future" : ""}`;
      if (list) {
        const s = list[list.length - 1]; // earliest that day (list is newest first)
        const tip = list.length > 1 ? `${list.length} workouts` : `${F.plural(s.logs.length, "exercise")} · ${sessionMeta(s)}`;
        cells.push(html`<a class="${cls}" href="#/session/${s.local_id}" title="${tip}" aria-label="${F.fmtDate(s.date)}: ${tip}">${d}</a>`);
      } else {
        cells.push(html`<span class="${cls}">${d}</span>`);
      }
    }
    const workouts = [...byDay.values()].reduce((t, l) => t + l.length, 0);
    const off = (cond) => (cond ? raw(" disabled") : "");

    return html`
      <div class="card calendar" id="calendar">
        <div class="cal-head">
          <button type="button" class="cal-nav" data-action="cal-prev" aria-label="Previous month"${off(month <= firstMonth)}>‹</button>
          <div class="cal-title"><strong>${F.fmtMonth(month)}</strong>
            <span class="muted small">${F.plural(workouts, "workout")} · ${F.plural(byDay.size, "day")}</span></div>
          <button type="button" class="cal-nav" data-action="cal-next" aria-label="Next month"${off(month >= thisMonth)}>›</button>
        </div>
        <div class="cal-grid">
          ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => html`<span class="cal-dow">${d}</span>`)}
          ${cells}
        </div>
        ${month !== thisMonth ? html`<button type="button" class="link small mt-s" data-action="cal-today">Back to this month</button>` : ""}
      </div>`;
  }

  function moveCalendar(step) {
    const el = document.getElementById("calendar");
    if (!el || !state.data) return;
    state.calMonth = step === 0 ? null : M.shiftPeriod(state.calMonth, "month", step);
    const focused = document.activeElement?.dataset?.action;
    el.outerHTML = String(calendarCard());
    // Keep keyboard focus on the arrow that was pressed (if it's still enabled).
    const again = focused && document.querySelector(`#calendar [data-action="${focused}"]:not([disabled])`);
    (again || document.querySelector("#calendar .cal-nav:not([disabled])"))?.focus({ preventScroll: true });
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
      <p class="sub">${F.fmtDuration(sessionTime(s))} total${s.total_time && s.workout_time ? ` (${F.fmtDuration(s.workout_time)} active)` : ""} · ${F.plural(s.logs.length, "exercise")}${v > 0 ? ` · ${F.fmtWeight(v, 0)} volume` : ""}${s.records_broken ? ` · ${F.plural(s.records_broken, "record")} broken` : ""}</p>
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
    [/^\/$/, "dashboard", (m, q) => dashboard(m, q)],
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
    if (a.dataset.action === "cal-prev") moveCalendar(-1);
    if (a.dataset.action === "cal-next") moveCalendar(1);
    if (a.dataset.action === "cal-today") moveCalendar(0);
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

  // Only jump to the top when moving to a different page, not when a filter chip changes the query.
  let lastPath = (location.hash.slice(1) || "/").split("?")[0];
  window.addEventListener("hashchange", () => {
    const path = (location.hash.slice(1) || "/").split("?")[0];
    render();
    if (path !== lastPath) window.scrollTo(0, 0);
    lastPath = path;
  });

  // ← / → change the calendar month on the dashboard (ignored while typing).
  document.addEventListener("keydown", (ev) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    if (ev.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (!document.getElementById("calendar")) return;
    if (ev.key === "ArrowLeft") { ev.preventDefault(); if (!document.querySelector('#calendar [data-action="cal-prev"]').disabled) moveCalendar(-1); }
    if (ev.key === "ArrowRight") { ev.preventDefault(); if (!document.querySelector('#calendar [data-action="cal-next"]').disabled) moveCalendar(1); }
  });
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
