// Weekly sets per muscle group, compared with hypertrophy volume landmarks.
// JEFIT's API doesn't give primary/secondary muscles, so exercises are classified by name with the rules
// below. A primary set counts as 1 set for that muscle; a secondary set counts as half.
(function (root, factory) {
  const m = factory();
  if (typeof module === "object" && module.exports) module.exports = m;
  else root.Muscles = m;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SECONDARY_WEIGHT = 0.5;

  // Weekly working-set landmarks per muscle, after Israetel, Hoffmann & Smith,
  // "Scientific Principles of Hypertrophy Training" (Renaissance Periodization):
  //   mev = minimum effective volume, mav = [low, high] maximum adaptive volume, mrv = maximum recoverable volume.
  // These are the book's typical starting points; adjust them to your own recovery.
  const GROUPS = [
    { key: "chest", name: "Chest", mev: 6, mav: [12, 20], mrv: 22 },
    { key: "back", name: "Back", mev: 10, mav: [14, 22], mrv: 25 },
    { key: "frontDelts", name: "Front delts", mev: 0, mav: [6, 8], mrv: 12 },
    { key: "sideDelts", name: "Side delts", mev: 8, mav: [16, 22], mrv: 26 },
    { key: "rearDelts", name: "Rear delts", mev: 6, mav: [12, 18], mrv: 26 },
    { key: "biceps", name: "Biceps", mev: 8, mav: [14, 20], mrv: 26 },
    { key: "triceps", name: "Triceps", mev: 6, mav: [10, 14], mrv: 18 },
    { key: "quads", name: "Quads", mev: 8, mav: [12, 18], mrv: 20 },
    { key: "hamstrings", name: "Hamstrings", mev: 4, mav: [10, 16], mrv: 20 },
    { key: "glutes", name: "Glutes", mev: 0, mav: [4, 12], mrv: 16 },
    { key: "calves", name: "Calves", mev: 8, mav: [12, 16], mrv: 20 },
    { key: "abs", name: "Abs", mev: 0, mav: [16, 20], mrv: 25 },
    { key: "traps", name: "Traps", mev: 0, mav: [12, 20], mrv: 26 },
    { key: "forearms", name: "Forearms", mev: 2, mav: [10, 20], mrv: 25 },
  ];

  // [pattern, primary muscles, secondary muscles]. First match wins, so specific names come before general ones.
  const RULES = [
    [/farmer|carry|suitcase/, ["forearms"], ["traps"]],
    // Not resistance training: ignored, never reported as unmapped.
    [/treadmill|elliptical|bike|cycling|rowing machine|stair|walk(?!ing lunge)|run\b|running|jog|swim|jump rope|stretch/, [], []],

    // Triceps-dominant presses and dips
    [/close[- ]grip (bench|press)|jm press|bench dip|tricep(s)? dip/, ["triceps"], ["chest"]],
    // Rear delts (before "fly" and "row")
    [/face pull|reverse (fly|flye|pec)|rear delt|rear deltoid/, ["rearDelts"], ["traps"]],
    [/upright row/, ["sideDelts"], ["traps"]],
    // Chest
    [/incline.*(press|bench)|(press|bench).*incline/, ["chest"], ["triceps", "frontDelts"]],
    [/bench press|chest press|floor press|decline.*press|push[- ]?up|svend/, ["chest"], ["triceps", "frontDelts"]],
    [/\bdips?\b/, ["chest"], ["triceps"]],
    [/fly|flye|pec deck|crossover|cross over/, ["chest"], []],
    [/pullover/, ["back"], ["chest"]],
    // Back
    [/pull[- ]?up|chin[- ]?up|pull[- ]?down|lat pull/, ["back"], ["biceps"]],
    [/\brows?\b|t-bar|seal row|meadows/, ["back"], ["biceps", "rearDelts"]],
    [/shrug/, ["traps"], []],
    // Hip hinges
    [/romanian|rdl|stiff[- ]leg/, ["hamstrings"], ["glutes"]],
    [/deadlift|rack pull/, ["hamstrings", "glutes"], ["back", "quads"]],
    [/good morning|back extension|hyperextension/, ["hamstrings"], ["glutes"]],
    [/hip thrust|glute bridge|glute kickback|hip abduct|abduction/, ["glutes"], ["hamstrings"]],
    // Curls: legs and wrists before arms
    [/leg curl|hamstring curl|nordic|glute[- ]ham/, ["hamstrings"], ["calves"]],
    [/wrist curl|wrist roller|reverse wrist/, ["forearms"], []],
    [/hammer curl|reverse curl|cross[- ]body curl/, ["biceps"], ["forearms"]],
    [/curl/, ["biceps"], []],
    // Shoulders
    [/lateral raise|side raise|lateral delt|y[- ]raise/, ["sideDelts"], []],
    [/front raise/, ["frontDelts"], []],
    [/overhead press|shoulder press|military press|\bohp\b|arnold|push press|landmine press/, ["frontDelts"], ["sideDelts", "triceps"]],
    // Legs
    [/leg extension/, ["quads"], []],
    [/bulgarian|split squat|lunge|step[- ]?up/, ["quads", "glutes"], ["hamstrings"]],
    [/squat|leg press|hack|sissy|belt squat/, ["quads"], ["glutes"]],
    [/sled/, ["quads"], ["glutes", "calves"]],
    [/calf|calves/, ["calves"], []],
    // Arms (extensions after leg/back extensions above)
    [/pushdown|push down|pressdown|skull ?crusher|kickback|tricep|triceps|french press|overhead extension/, ["triceps"], []],
    // Core and grip
    [/crunch|sit[- ]?up|plank|leg raise|knee raise|ab wheel|rollout|russian twist|wood ?chop|hollow|pallof|dead bug|v[- ]up|\babs?\b/, ["abs"], []],
  ];

  /** { primary: [muscle keys], secondary: [...], ignored } for an exercise name, or null if no rule matches. */
  function classify(name) {
    const n = String(name ?? "").toLowerCase();
    for (const [re, primary, secondary] of RULES) {
      if (re.test(n)) return { primary, secondary, ignored: !primary.length && !secondary.length };
    }
    return null;
  }

  const working = (s) => s.type !== "warm-up";

  /**
   * Sets per muscle over `sessions` (already filtered to the week(s) wanted), divided by `weeks` for an average.
   * @returns { rows: [{ ...group, primary, secondary, effective, exercises: [{ id, name, role, sets }] }], unmapped: [{ id, name, sets }] }
   */
  function tally(sessions, { weeks = 1 } = {}) {
    const by = new Map(GROUPS.map((g) => [g.key, { primary: 0, secondary: 0, exercises: new Map() }]));
    const unmapped = new Map();
    for (const s of sessions) for (const l of s.logs) {
      if (l.record_type === "cardio") continue;
      const sets = l.log_sets.filter(working).length;
      if (!sets) continue;
      const c = classify(l.exercise_name);
      if (!c) {
        const u = unmapped.get(l.exercise_id) ?? { id: l.exercise_id, name: l.exercise_name, sets: 0 };
        u.sets += sets;
        unmapped.set(l.exercise_id, u);
        continue;
      }
      for (const [role, keys] of [["primary", c.primary], ["secondary", c.secondary]]) {
        for (const k of keys) {
          const g = by.get(k);
          g[role] += sets;
          const ek = `${l.exercise_id}|${role}`;
          const e = g.exercises.get(ek) ?? { id: l.exercise_id, name: l.exercise_name, role, sets: 0 };
          e.sets += sets;
          g.exercises.set(ek, e);
        }
      }
    }
    const per = (v) => v / weeks;
    const rows = GROUPS.map((g) => {
      const t = by.get(g.key);
      const exercises = [...t.exercises.values()]
        .map((e) => ({ ...e, sets: per(e.sets) }))
        .sort((a, b) => (a.role === b.role ? b.sets - a.sets : a.role === "primary" ? -1 : 1));
      return { ...g, primary: per(t.primary), secondary: per(t.secondary),
        effective: per(t.primary + SECONDARY_WEIGHT * t.secondary), exercises };
    });
    return { rows, unmapped: [...unmapped.values()].map((u) => ({ ...u, sets: per(u.sets) })).sort((a, b) => b.sets - a.sets) };
  }

  /** Where `sets` falls against a group's landmarks. */
  function zone(g, sets) {
    if (sets <= 0) return "none";
    if (sets > g.mrv) return "over";
    if (sets > g.mav[1]) return "high";
    if (sets >= g.mav[0]) return "optimal";
    if (sets >= g.mev) return "low";
    return "under";
  }
  const ZONE_LABEL = { none: "Not trained", under: "Below MEV", low: "MEV–MAV", optimal: "In MAV", high: "MAV–MRV", over: "Above MRV" };

  return { SECONDARY_WEIGHT, GROUPS, RULES, classify, tally, zone, ZONE_LABEL };
});
