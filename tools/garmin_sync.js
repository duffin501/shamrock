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
 *    Jon's HR-scaled runs). Rest and alt cardio days are left blank; an easy
 *    run gets that week's "SHAM // Z2 N MI".
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
        let want = "";
        if (a.k === "plan") want = hasBase ? (none(B[a.src]) ? "" : B[a.src]) : (a.g || "");
        else if (a.k === "easy") want = wk.easy || "";
        let kept = false;
        for (const it of (onDay[d] || [])) {
          if (want && !kept && it.title === want) { kept = true; continue; }
          actions.push(["del", d, it.id, it.title]);
        }
        if (want && !kept) {
          if (ids[want]) actions.push(["add", d, ids[want], want]);
          else missing.add(want);
        }
      }
      cal.through = add(wk.w, 6);
    }
    cal.missing = [...missing];
    if (IN.dry) {
      cal.plan = actions.map((x) => `${x[0]} ${x[1].slice(5)} ${x[3].replace("SHAM // ", "")}`);
    } else {
      // Removals first so a day never carries two workouts for long.
      for (const x of actions.sort((p, q) => (p[0] === q[0] ? 0 : p[0] === "del" ? -1 : 1))) {
        try {
          if (x[0] === "del") { await req(`/gc-api/workout-service/schedule/${x[2]}`, { method: "DELETE" }); cal.removed++; }
          else { await req(`/gc-api/workout-service/schedule/${x[2]}`, { method: "POST", body: JSON.stringify({ date: x[1] }) }); cal.added++; }
        } catch (e) { cal.failed++; notes.push(e.message); }
        await sleep(250);
      }
    }
  }
  out.cal = cal;
  out.note = notes.join("; ").slice(0, 200);
  return JSON.stringify(out);
})();
