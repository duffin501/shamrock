/* Pure logic, no DOM and no Firebase, so tools/selftest.mjs can run it.
 *
 * A week runs Monday to Sunday. Each person's week is a map of date to an
 * assignment, and an assignment is one of:
 *
 *   { k: "plan", src }   the plan's workout from date `src` (src can differ
 *                        from the slot's own date once the long run moves)
 *   { k: "easy" }        an easy run instead
 *   { k: "alt" }         alt cardio instead
 *   { k: "rest" }        rest
 *
 * Everything time-related takes the person's own timezone, so each of you
 * gets your own midnight and your own noon. */

import { PLAN, PLAN_START, RACE_DAY, BASE_LT } from "./plan.js";

export { PLAN, PLAN_START, RACE_DAY, BASE_LT };

export const RUN_KINDS = new Set(["easy", "stroller", "quality", "long", "race", "easyrun"]);
export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const GRACE_HOUR = 12;       // yesterday stays loggable until noon
export const SUNDAY_PROMPT_HOUR = 17;

/* ===================== dates ===================== */

const noon = (iso) => Date.parse(iso + "T12:00:00Z");
export const addDays = (iso, n) => new Date(noon(iso) + n * 86400000).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((noon(b) - noon(a)) / 86400000);
export const dowIdx = (iso) => (new Date(noon(iso)).getUTCDay() + 6) % 7; // Mon = 0
export const weekOf = (iso) => addDays(iso, -dowIdx(iso));
export const weekDates = (w) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(w, i));
export const FIRST_WEEK = PLAN_START;
export const LAST_WEEK = weekOf(RACE_DAY);
export const weekNo = (w) => Math.floor(diffDays(FIRST_WEEK, w) / 7) + 1;
export const inPlan = (w) => w >= FIRST_WEEK && w <= LAST_WEEK;

/* The wall clock for one person: their date, hour and weekday right now. */
export function clock(tz, now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  return { iso, hour: +parts.hour % 24, minute: +parts.minute, dow: dowIdx(iso) };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayNum = (iso) => +iso.slice(8, 10);
export const shortDate = (iso) => `${dayNum(iso)} ${MON[+iso.slice(5, 7) - 1]}`;
export const longDay = (iso) => `${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][dowIdx(iso)]}, ${shortDate(iso)}`;
export const weekRange = (w) => {
  const e = addDays(w, 6);
  return w.slice(5, 7) === e.slice(5, 7) ? `${dayNum(w)} to ${shortDate(e)}` : `${shortDate(w)} to ${shortDate(e)}`;
};

/* ===================== workouts ===================== */

/* The easy-run swap is the size of that week's Thursday Z2 run, which is the
 * plan's own idea of a short easy day. */
export function easyMiles(w) {
  const thu = PLAN[addDays(w, 3)];
  const m = thu && /Z2 ([\d.]+)/.exec(thu.t);
  return m ? +m[1] : 3;
}

/* Run HR bands scale with the person's threshold, the same way the Garmin
 * load script scaled them for Jon. Bike, walk and alt bands stay put. */
export function scaleNote(note, kind, lt) {
  if (!note || !lt || lt === BASE_LT || !RUN_KINDS.has(kind)) return note || "";
  return note.replace(/\b(1\d\d)-(1\d\d)\b/g, (m, a, b) =>
    `${Math.round(+a * lt / BASE_LT)}-${Math.round(+b * lt / BASE_LT)}`);
}

/* Turns an assignment into what to show and how to judge it. */
export function resolve(a, iso) {
  if (!a || a.k === "rest") {
    return { kind: "rest", title: "Rest day", short: "REST", rest: true, run: false, long: false,
      note: "Nothing scheduled. It turns green on its own." };
  }
  if (a.k === "plan" && PLAN[a.src]) {
    const p = PLAN[a.src];
    return { kind: p.k, title: p.t, short: p.s, mi: p.mi || 0, est: !!p.est, min: p.min || 0,
      note: p.note, rest: false, run: RUN_KINDS.has(p.k), long: p.k === "long" || p.k === "race",
      race: p.k === "race", src: a.src };
  }
  if (a.k === "easy") {
    const mi = easyMiles(weekOf(iso));
    return { kind: "easyrun", title: `Easy run ${mi} mi`, short: `EASY ${mi}`, mi, rest: false,
      run: true, long: false, note: "Your route, your call. HR 125-143." };
  }
  return { kind: "alt", title: "Alt cardio 30 to 45 min", short: "ALT", min: 40, rest: false,
    run: false, long: false, note: "Bike, row, elliptical, swim or a brisk walk. Easy, HR 100-130." };
}

export const isRest = (a) => !a || a.k === "rest";
export const countOf = (days) => Object.values(days || {}).filter((a) => !isRest(a)).length;

/* The plan's week, untouched. */
export function defaultWeek(w) {
  const days = {};
  for (const d of weekDates(w)) days[d] = PLAN[d] ? { k: "plan", src: d } : { k: "rest" };
  return days;
}
export const planCount = (w) => countOf(defaultWeek(w));

export function longSlot(days) {
  return Object.keys(days).sort().find((d) => days[d]?.k === "plan" && ["long", "race"].includes(PLAN[days[d].src]?.k)) || null;
}

const usedSrcs = (days) => new Set(Object.values(days).filter((a) => a?.k === "plan").map((a) => a.src));
const unusedSrcs = (days, w) => weekDates(w).filter((d) => PLAN[d] && !usedSrcs(days).has(d));

/* Which day goes first when the count drops. Lower goes first: stroller
 * walks, then easy runs (shortest first), then the bike, then quality. The
 * long run never goes. */
export function trimRank(a, iso) {
  const r = resolve(a, iso);
  if (r.rest) return -1;
  if (r.long) return Infinity;
  if (r.kind === "walk") return 1;
  if (["easy", "stroller", "easyrun"].includes(r.kind)) return 2 + (r.mi || 0) / 100;
  if (r.kind === "bike" || r.kind === "alt") return 3;
  return 4;
}

export function stepDown(days, w) {
  const cands = Object.keys(days).filter((d) => !isRest(days[d]) && trimRank(days[d], d) !== Infinity);
  if (!cands.length) return days;
  cands.sort((x, y) => trimRank(days[x], x) - trimRank(days[y], y) || (y < x ? -1 : 1));
  return { ...days, [cands[0]]: { k: "rest" } };
}

export function stepUp(days, w) {
  const rests = Object.keys(days).filter((d) => isRest(days[d])).sort();
  if (!rests.length) return days;
  const free = unusedSrcs(days, w);
  if (!free.length) return { ...days, [rests[0]]: { k: "easy" } };
  // Bring back the most valuable workout first, on its own day when that day is free.
  free.sort((x, y) => trimRank({ k: "plan", src: y }, y) - trimRank({ k: "plan", src: x }, x) || (x < y ? -1 : 1));
  const src = free[0];
  const slot = rests.includes(src) ? src : rests[0];
  return { ...days, [slot]: { k: "plan", src } };
}

/* One tap on a day steps it through plan, easy run, alt cardio, rest. Steps
 * that would repeat the plan (an easy run on an easy day, alt cardio on a
 * bike day) are skipped. The long run doesn't cycle; it moves. */
export function cycleOptions(days, d, w) {
  const a = days[d];
  const cur = a?.k === "plan" ? a.src : null;
  const free = unusedSrcs(days, w);
  const home = cur || (free.includes(d) ? d : free[0]) || null;
  const pk = home ? PLAN[home].k : null;
  const opts = [];
  if (home) opts.push({ k: "plan", src: home });
  if (!["easy", "stroller"].includes(pk)) opts.push({ k: "easy" });
  if (!["bike", "walk"].includes(pk)) opts.push({ k: "alt" });
  opts.push({ k: "rest" });
  return opts;
}

export function cycle(days, d, w) {
  if (d === longSlot(days)) return days;
  const opts = cycleOptions(days, d, w);
  const a = days[d] || { k: "rest" };
  const i = opts.findIndex((o) => o.k === a.k && (o.k !== "plan" || o.src === a.src));
  return { ...days, [d]: opts[(i + 1) % opts.length] };
}

/* Moving the long run trades places with whatever was on the target day. */
export function moveLong(days, to) {
  const from = longSlot(days);
  if (!from || from === to || !(to in days)) return days;
  if (PLAN[days[from].src]?.k === "race") return days;
  return { ...days, [from]: days[to], [to]: days[from] };
}

/* ===================== locked weeks ===================== */

/* What a stored week actually says, swap applied. Returns null if the week
 * was never locked. */
export function lockedDays(rec) {
  if (!rec?.lockedAt || !rec.days) return null;
  const days = { ...rec.days };
  if (rec.swap?.a && rec.swap?.b && rec.swap.a in days && rec.swap.b in days) {
    [days[rec.swap.a], days[rec.swap.b]] = [days[rec.swap.b], days[rec.swap.a]];
  }
  return days;
}

/* The week that governs a date for one person: their locked week, or the
 * full plan if they started before that week and never locked it. */
export function governing(weeks, start, w) {
  const rec = weeks?.[w];
  const locked = lockedDays(rec);
  if (locked) return { days: locked, locked: true, auto: !!rec.auto, rec };
  if (start && w > weekOf(start) && inPlan(w)) return { days: defaultWeek(w), locked: false, auto: true, rec: null };
  return null;
}

/* Whether a past week should be written down as auto-locked now. Only weeks
 * that have already begun, after the person's first week. */
export function needsAutoLock(weeks, start, w, today) {
  return !!start && w > weekOf(start) && w <= weekOf(today) && inPlan(w) && !weeks?.[w]?.lockedAt;
}

/* ===================== judging a day ===================== */

/* Garmin backs up a forgotten tap. A run day needs a run of a mile or more,
 * the long run needs three quarters of its distance, anything else needs any
 * recorded activity. */
export function garminMatch(r, gm) {
  if (!gm || r.rest) return false;
  if (r.long) return (gm.lr || 0) >= 0.75 * (r.mi || 0);
  if (r.run) return (gm.r || 0) >= 1;
  return (gm.n || 0) >= 1;
}

export const canLog = (iso, today, hour) =>
  iso === today || (iso === addDays(today, -1) && hour < GRACE_HOUR);

/* before | rest-future | future | today | grace | done | rest | miss */
export function dayStatus({ iso, a, today, hour, logRec, gm, start }) {
  if (!start || iso < start) return "before";
  if (!a) return iso > today ? "future" : "before";
  const r = resolve(a, iso);
  if (r.rest) return iso <= today ? "rest" : "rest-future";
  if (logRec?.done || garminMatch(r, gm)) return "done";
  if (iso > today) return "future";
  if (iso === today) return "today";
  if (iso === addDays(today, -1) && hour < GRACE_HOUR) return "grace";
  return "miss";
}
export const isGreen = (s) => s === "done" || s === "rest";

/* ===================== one person, whole season ===================== */

/* Everything about one person in one pass: the status of every date, the
 * head-to-head numbers, and each week's row of dots. */
export function season(p, { now = Date.now() } = {}) {
  const { iso: today, hour } = clock(p.tz, now);
  const start = p.start || null;
  const weeks = p.weeks || {}, log = p.log || {}, gdays = p.garmin?.days || {};
  const status = {}, assign = {};
  const out = { today, hour, start, status, assign, workouts: 0, due: 0, misses: 0,
    miles: 0, milesEst: 0, longest: 0, longestEst: false, longDone: 0, longDue: 0 };

  const last = today < RACE_DAY ? today : RACE_DAY;
  for (let w = FIRST_WEEK; w <= LAST_WEEK; w = addDays(w, 7)) {
    const g = governing(weeks, start, w);
    for (const d of weekDates(w)) {
      const a = g ? g.days[d] : null;
      assign[d] = a;
      const s = dayStatus({ iso: d, a, today, hour, logRec: log[d], gm: gdays[d], start });
      status[d] = s;
      if (d > last) continue;
      const r = a ? resolve(a, d) : null;
      if (s === "done") out.workouts++;
      if (s === "done" || s === "miss") out.due++;
      if (s === "miss") out.misses++;
      if (r?.long && (s === "done" || s === "miss")) { out.longDue++; if (s === "done") out.longDone++; }
      // Garmin wins, unless it saw no run on a day you tapped a run done
      // (watch died, forgot to start it): then the plan distance stands in.
      const gm = gdays[d];
      if (gm && ((gm.r || 0) > 0 || !(s === "done" && r?.run))) {
        out.miles += gm.r || 0;
        if ((gm.lr || 0) > out.longest) { out.longest = gm.lr; out.longestEst = false; }
      } else if (s === "done" && r?.run) {
        out.miles += r.mi || 0; out.milesEst += r.mi || 0;
        if ((r.mi || 0) > out.longest) { out.longest = r.mi; out.longestEst = true; }
      }
    }
  }
  out.miles = Math.round(out.miles * 10) / 10;
  out.longest = Math.round(out.longest * 10) / 10;
  return out;
}

/* ===================== swap ===================== */

export function swapFirstChoices(days, statusOf, today) {
  return Object.keys(days).sort().filter((d) => d >= today && statusOf(d) !== "done");
}
export function swapSecondChoices(days, statusOf, first) {
  const same = (x, y) => JSON.stringify(x || { k: "rest" }) === JSON.stringify(y || { k: "rest" });
  return Object.keys(days).sort().filter((d) => d > first && statusOf(d) !== "done" && !same(days[d], days[first]));
}

/* ===================== marathon projection ===================== */

export const LONG_MIN = 8; // miles: a week's longest run counts as its long run from here up

export function hms(sec) {
  if (!sec && sec !== 0) return "";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
export const paceStr = (secPerMile) => {
  const s = Math.round(secPerMile);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/* Marathon time if the latest long run's average pace were held for 26.2.
 * The long run is each week's longest Garmin run, if it was 8 miles or more,
 * so a long run moved off Friday still counts. Change is against the long run
 * before it; negative means faster. */
export function longRunProjection(gdays, today) {
  const best = {};
  for (const [d, g] of Object.entries(gdays || {})) {
    if (d > today || !((g?.lr || 0) >= LONG_MIN) || !((g?.ls || 0) > 0)) continue;
    const w = weekOf(d);
    if (!best[w] || g.lr > best[w].mi) best[w] = { d, mi: g.lr, sec: g.ls };
  }
  const runs = Object.keys(best).sort().reverse().map((w) => best[w]);
  if (!runs.length) return null;
  const proj = (x) => Math.round((x.sec / x.mi) * 26.2);
  const cur = runs[0];
  return { sec: proj(cur), pace: cur.sec / cur.mi, mi: cur.mi, d: cur.d,
    change: runs[1] ? proj(cur) - proj(runs[1]) : null };
}
