/* Garmin sync for Shamrock '27. Runs on a signed-in https://connect.garmin.com
 * tab through the Claude in Chrome javascript tool, for whichever person owns
 * that Garmin account. docs/sync_task.md is the full procedure.
 *
 * Before pasting this file, set the input from the app tab:
 *   window.SHAM_INPUT = <the string window.shamrockSyncInput() returned>;
 *
 * It does two things and returns one short JSON string for shamrockIngest():
 *
 * 1. Pulls the last 10 days of activities for the account owner (and, on
 *    Mary's account, Jon through his profile as a fallback). Each day is
 *    [run miles, longest run miles, activity count, longest run seconds].
 *
 * 2. Makes the Garmin calendar match each locked week, so the right
 *    structured workout is on the watch. Only "SHAM //" workouts are touched,
 *    only from today forward. The first time it sees a locked week it records
 *    what that week's calendar already had (the "base") and changes nothing;
 *    the app stores the base and the next pass moves those same workouts
 *    around. That keeps each person's own versions (Mary's 45 min bikes,
 *    Jon's HR-scaled runs). A day whose miles or minutes were changed in the
 *    app, or an easy run, comes with an exact workout ("want") and its steps
 *    ("def"); if that workout doesn't exist yet in this Garmin account it is
 *    created. Old "STROLLER Z2" workouts are replaced by the plain "Z2" ones
 *    (Mary dropped the stroller label, 7 Nov). Rest, alt cardio and walk days
 *    are left blank on the watch.
 *
 * Set dry: true in the input to get the planned changes without making them.
 * Starts with a top-level await so the javascript tool waits for the result.
 * Endpoints are the ones Garmin Connect's web app used in Nov 2026. */
await (async () => {
  let IN = window.SHAM_INPUT;
  if (typeof IN === "string") IN = JSON.parse(IN);
  if (!IN || !IN.who) return JSON.stringify({ error: "no SHAM_INPUT set" });
  const who = IN.who;
  if (location.host !== "connect.garmin.com") return JSON.stringify({ who, error: "Garmin signed out (redirected to sign-in)" });

  const JON = "b2cb0be6-a324-4594-879f-3169a43abde8";
  const START = "2026-11-02", END = "2027-03-21", WINDOW = 10;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const add = (d, n) => iso(Date.parse(d + "T12:00:00Z") + n * 86400000);
  let since = add(IN.today, -WINDOW);
  if (since < START) since = START;
  const lastFull = add(IN.today, -1);

  const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
  const H = { Accept: "application/json", "Content-Type": "application/json", ...(csrf ? { "connect-csrf-token": csrf } : {}) };
  const req = async (u, opt = {}) => {
    const r = await fetch(u, { headers: H, credentials: "include", ...opt });
    if (!r.ok) throw new Error(u.split("?")[0].split("/").slice(-2).join("/") + " " + r.status);
    return r.status === 204 ? null : r.json().catch(() => null);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Same workout format as the Garmin load file used (proven 1 Nov 2026).
  const SPORT = { running: { sportTypeId: 1, sportTypeKey: "running" }, cycling: { sportTypeId: 2, sportTypeKey: "cycling" } };
  const STEP = { warmup: 1, cooldown: 2, interval: 3, recovery: 4 };
  function expand(name, def) {
    const [sport, desc, steps] = def;
    let order = 0, child = 0;
    const conv = (arr, cid) => arr.map((st) => {
      order++;
      if (st[0] === "r") {
        const c = ++child, so = order;
        return { type: "RepeatGroupDTO", stepOrder: so, stepType: { stepTypeId: 6, stepTypeKey: "repeat" }, childStepId: c,
          numberOfIterations: st[1], smartRepeat: false, endCondition: { conditionTypeId: 7, conditionTypeKey: "iterations" },
          endConditionValue: st[1], workoutSteps: conv(st[2], c) };
      }
      const isD = st[1] === "d";
      const o = { type: "ExecutableStepDTO", stepOrder: order, stepType: { stepTypeId: STEP[st[0]], stepTypeKey: st[0] }, description: st[5] || "",
        endCondition: isD ? { conditionTypeId: 3, conditionTypeKey: "distance" } : { conditionTypeId: 2, conditionTypeKey: "time" },
        endConditionValue: isD ? Math.round(st[2] * 1609.344 * 100) / 100 : st[2],
        preferredEndConditionUnit: isD ? { unitKey: "mile" } : null,
        targetType: st[3] ? { workoutTargetTypeId: 4, workoutTargetTypeKey: "heart.rate.zone" } : { workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target" },
        targetValueOne: st[3] || null, targetValueTwo: st[4] || null, zoneNumber: null };
      if (cid) o.childStepId = cid;
      return o;
    });
    return { sportType: SPORT[sport], workoutName: name, description: desc,
      workoutSegments: [{ segmentOrder: 1, sportType: SPORT[sport], workoutSteps: conv(steps, null) }] };
  }

  try { await req("/gc-api/userprofile-service/socialProfile"); }
  catch (e) { return JSON.stringify({ who, error: "Garmin signed out or profile failed: " + e.message }); }
  const notes = [];
  const out = { who };

  /* ---------- 1. activities ---------- */
  async function activities(self) {
    const list = [];
    for (let start = 0; start < 400; start += 100) {
      const url = self
        ? `/gc-api/activitylist-service/activities/search/activities?startDate=${since}&start=${start}&limit=100`
        : `/gc-api/activitylist-service/activities/${JON}?start=${start}&limit=100`;
      const page = await req(url);
      const arr = Array.isArray(page) ? page : (page?.activityList || []);
      list.push(...arr);
      const oldest = arr.length ? String(arr[arr.length - 1].startTimeLocal || "").slice(0, 10) : "";
      if (arr.length < 100 || oldest < since) break;
    }
    return list;
  }
  function summarize(list) {
    const days = {};
    for (let d = since; d <= lastFull; d = add(d, 1)) days[d] = [0, 0, 0, 0];
    for (const a of list) {
      const d = String(a.startTimeLocal || "").slice(0, 10);
      if (!d || d < since || d > END) continue;
      const mi = (a.distance || 0) / 1609.344;
      const x = days[d] || (days[d] = [0, 0, 0, 0]);
      x[2]++;
      if (/running/.test(a.activityType?.typeKey || "")) {
        x[0] += mi;
        if (mi > x[1]) { x[1] = mi; x[3] = Math.round(a.duration || a.movingDuration || 0); }
      }
    }
    for (const d in days) days[d] = [+days[d][0].toFixed(2), +days[d][1].toFixed(2), days[d][2], days[d][3]];
    return days;
  }
  try { out[who] = { days: summarize(await activities(true)) }; } catch (e) { notes.push("pull " + e.message); }
  if (who === "mary" && IN.alsoJon) {
    try { out.jon = { days: summarize(await activities(false)) }; } catch (e) { notes.push("jon pull " + e.message); }
  }

  /* ---------- 2. calendar ---------- */
  const weeks = (IN.weeks || []).filter((wk) => add(wk.w, 6) >= IN.today);
  const cal = { added: 0, removed: 0, failed: 0, missing: [], through: "" };
  out.base = {};
  if (weeks.length) {
    const ids = {};
    for (const w of (await req("/gc-api/workout-service/workouts?start=1&limit=500&myWorkoutsOnly=true")) || []) {
      if ((w.workoutName || "").startsWith("SHAM //")) ids[w.workoutName] = w.workoutId;
    }
    const onDay = {}, seen = {};
    const months = new Set();
    for (const wk of weeks) for (let i = 0; i < 7; i++) { const d = add(wk.w, i); months.add(d.slice(0, 7)); }
    for (const ym of months) {
      const c = await req(`/gc-api/calendar-service/year/${+ym.slice(0, 4)}/month/${+ym.slice(5, 7) - 1}`);
      for (const it of (c?.calendarItems || [])) {
        if (it.itemType !== "workout" || seen[it.id] || !(it.title || "").startsWith("SHAM //")) continue;
        seen[it.id] = 1;
        (onDay[it.date] = onDay[it.date] || []).push({ id: it.id, title: it.title });
      }
    }
    const actions = [], missing = new Set();
    for (const wk of weeks) {
      const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => add(wk.w, i));
      if (!wk.base) {
        // First sight of this locked week: record it, change nothing yet.
        out.base[wk.w] = Object.fromEntries(dates.map((d) => [d, onDay[d]?.[0]?.title || ""]));
        out.again = true;
        continue;
      }
      const B = wk.base, none = (v) => !v || v === "-";
      const hasBase = Object.values(B).some((v) => !none(v));
      for (const d of dates) {
        if (d < IN.today) continue;
        const a = wk.days[d] || { k: "rest" };
        let want = "", def = null;
        if (a.want) { want = a.want; def = a.def || null; }
        else if (a.k === "plan") {
          want = hasBase && a.src in B ? (none(B[a.src]) ? "" : B[a.src]) : (a.g || "");
          want = want.replace("SHAM // STROLLER Z2 ", "SHAM // Z2 ");
          if (want && want === a.g) def = a.def || null;
        } else if (a.k === "easy") want = wk.easy || "";
        let kept = false;
        for (const it of (onDay[d] || [])) {
          if (want && !kept && it.title === want) { kept = true; continue; }
          actions.push(["del", d, it.id, it.title]);
        }
        if (want && !kept) {
          if (ids[want] || def) actions.push(["add", d, want, def]);
          else missing.add(want);
        }
      }
      cal.through = add(wk.w, 6);
    }
    cal.missing = [...missing];
    const label = (x) => x[0] === "del" ? x[3] : x[2];
    if (IN.dry) {
      cal.plan = actions.map((x) => `${x[0]} ${x[1].slice(5)} ${label(x).replace("SHAM // ", "")}${x[0] === "add" && !ids[x[2]] ? " (new)" : ""}`);
    } else {
      cal.created = 0;
      // Removals first so a day never carries two workouts for long.
      for (const x of actions.sort((p, q) => (p[0] === q[0] ? 0 : p[0] === "del" ? -1 : 1))) {
        try {
          if (x[0] === "del") { await req(`/gc-api/workout-service/schedule/${x[2]}`, { method: "DELETE" }); cal.removed++; }
          else {
            if (!ids[x[2]]) {
              const made = await req("/gc-api/workout-service/workout", { method: "POST", body: JSON.stringify(expand(x[2], x[3])) });
              if (!made?.workoutId) throw new Error("create " + x[2]);
              ids[x[2]] = made.workoutId; cal.created++;
              await sleep(250);
            }
            await req(`/gc-api/workout-service/schedule/${ids[x[2]]}`, { method: "POST", body: JSON.stringify({ date: x[1] }) });
            cal.added++;
          }
        } catch (e) { cal.failed++; notes.push(e.message); }
        await sleep(250);
      }
    }
  }
  out.cal = cal;
  out.note = notes.join("; ").slice(0, 200);
  return JSON.stringify(out);
})();
