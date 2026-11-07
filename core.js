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

import { PLAN, LIBRARY, STEPS, PLAN_START, RACE_DAY, BASE_LT } from "./plan.js";

export { PLAN, LIBRARY, STEPS, PLAN_START, RACE_DAY, BASE_LT };

/* A session by its source: a plan date, or a library name (hills). */
export const planEntry = (src) => PLAN[src] || LIBRARY[src] || null;

export const RUN_KINDS = new Set(["easy", "quality", "long", "race", "easyrun"]);
export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const GRACE_HOUR = 12;       // yesterday stays loggable until noon
// Week 1 is the week of 9 Nov (Mary, 7 Nov). The plan file starts a week
// earlier, but nothing before this date is tracked or counted.
export const SEASON_START = "2026-11-09";

/* ===================== dates ===================== */

const noon = (iso) => Date.parse(iso + "T12:00:00Z");
export const addDays = (iso, n) => new Date(noon(iso) + n * 86400000).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((noon(b) - noon(a)) / 86400000);
export const dowIdx = (iso) => (new Date(noon(iso)).getUTCDay() + 6) % 7; // Mon = 0
export const weekOf = (iso) => addDays(iso, -dowIdx(iso));
export const weekDates = (w) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(w, i));
export const FIRST_WEEK = SEASON_START;
export const LAST_WEEK = weekOf(RACE_DAY);
export const weekNo = (w) => Math.floor(diffDays(FIRST_WEEK, w) / 7) + 1;
export const inPlan = (w) => w >= FIRST_WEEK && w <= LAST_WEEK;
export const TOTAL_WEEKS = Math.floor(diffDays(FIRST_WEEK, weekOf(RACE_DAY)) / 7) + 1;

/* Next week can be edited any day of the current week; changes save as you
 * go and the week locks itself at midnight Sunday, your time, as you left it
 * (Mary, 7 Nov). On Monday it becomes "this week". */
export const canEdit = (clk, w) => inPlan(w) && w === addDays(weekOf(clk.iso), 7);

/* The moment a date starts in a timezone, as epoch ms. A locked week stores
 * its Monday's midnight as closesAt; the database rules use it to allow an
 * unlock only before then. */
export function midnightIn(iso, tz) {
  const guess = Date.parse(iso + "T00:00:00Z");
  const c = clock(tz, guess);
  const local = Date.parse(`${c.iso}T${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}:00Z`);
  return guess - (local - guess);
}

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

export const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/* "Long 11 mi" becomes "Long 12 mi" when the number in the title is the
 * plan amount; otherwise the new amount goes on the end. */
function retitle(title, base, val, unit) {
  if (val === base) return title;
  const re = new RegExp(`\\b${String(base).replace(".", "\\.")} ${unit}\\b`);
  return re.test(title) ? title.replace(re, `${fmtNum(val)} ${unit}`) : `${title} · ${fmtNum(val)} ${unit}`;
}

/* Turns an assignment into what to show and how to judge it. An assignment
 * can carry its own amount: mi on a run, min on a bike, walk or alt day. */
export function resolve(a, iso) {
  if (!a || a.k === "rest") {
    return { kind: "rest", title: "Rest day", short: "REST", rest: true, run: false, long: false,
      note: "Nothing scheduled. It turns green on its own." };
  }
  if (a.k === "plan" && planEntry(a.src)) {
    const p = planEntry(a.src), run = RUN_KINDS.has(p.k);
    const baseMi = p.mi || 0, baseMin = p.min || 0;
    const mi = run && a.mi ? a.mi : baseMi, min = !run && a.min ? a.min : baseMin;
    const changed = run ? mi !== baseMi : min !== baseMin;
    const unit = run ? "mi" : "min";
    return {
      kind: p.k, title: retitle(p.t, run ? baseMi : baseMin, run ? mi : min, unit),
      short: changed && /\d/.test(p.s) ? p.s.replace(/[\d.]+/, fmtNum(run ? mi : min)) : p.s,
      mi, min, baseMi, baseMin, changed, est: !!p.est && !(changed && p.k !== "quality"),
      note: p.note, rest: false, run, long: p.k === "long" || p.k === "race",
      race: p.k === "race", src: a.src, g: p.g || ""
    };
  }
  if (a.k === "easy") {
    const base = easyMiles(weekOf(iso)), mi = a.mi || base;
    return { kind: "easyrun", title: `Easy run ${fmtNum(mi)} mi`, short: `EASY ${fmtNum(mi)}`, mi, baseMi: base,
      changed: mi !== base, rest: false, run: true, long: false, note: "Your route, your call. HR 125-143." };
  }
  const min = a.min || 40;
  return { kind: "alt", title: `Alt cardio ${min} min`, short: "ALT", min, baseMin: 40, changed: min !== 40,
    rest: false, run: false, long: false, note: "Bike, row, elliptical, swim or a brisk walk. Easy, HR 100-130." };
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
const isRace = (days, d) => days[d]?.k === "plan" && PLAN[days[d].src]?.k === "race";

const usedSrcs = (days) => new Set(Object.values(days).filter((a) => a?.k === "plan").map((a) => a.src));
const unusedSrcs = (days, w) => weekDates(w).filter((d) => PLAN[d] && !usedSrcs(days).has(d));

/* ---------- dropping and adding workouts ---------- */

/* What kind of day it is for the drop order. "hard" is every quality day:
 * threshold, hills, intervals, marathon-pace runs and the 30 minute test. */
function dropClass(a, iso) {
  const r = resolve(a, iso);
  if (r.rest) return null;
  if (r.long) return "long";
  if (r.kind === "walk") return "walk";
  if (r.kind === "bike" || r.kind === "alt") return "cross";
  if (r.kind === "quality") return "hard";
  return "z2";
}

/* The order the minus button takes days away, first to last (Mary, 7 Nov):
 * stroller walk, then bike and alt cardio, then Z2 runs down to one
 * (shortest first), then hard days, then the last Z2. Within a group the day
 * nearest the long run goes first. The long run is never in the list. */
export function dropOrder(days) {
  const L = longSlot(days);
  const gap = (d) => (L ? Math.abs(diffDays(d, L)) : 9);
  const r = (d) => resolve(days[d], d);
  const by = (cls) => Object.keys(days).filter((d) => dropClass(days[d], d) === cls);
  const near = (x, y) => gap(x) - gap(y) || (x < y ? 1 : -1);
  const z2 = by("z2").sort((x, y) => (r(x).mi || 0) - (r(y).mi || 0) || near(x, y));
  const keeper = z2.length ? z2[z2.length - 1] : null;
  return [
    ...by("walk").sort(near),
    ...by("cross").sort(near),
    ...z2.filter((d) => d !== keeper),
    ...by("hard").sort(near),
    ...(keeper ? [keeper] : [])
  ];
}

export function stepDown(days) {
  const order = dropOrder(days);
  return order.length ? { ...days, [order[0]]: { k: "rest" } } : days;
}

/* Adding one back is the drop order run backwards: the last Z2 (if none is
 * left), then hard days, then more Z2s (longest first), then bike, then the
 * walk. Within a group the day farthest from the long run comes back first. */
export function stepUp(days, w) {
  const rests = Object.keys(days).filter((d) => isRest(days[d])).sort();
  if (!rests.length) return days;
  const free = unusedSrcs(days, w);
  if (!free.length) return { ...days, [rests[0]]: { k: "easy" } };
  const L = longSlot(days);
  const hasZ2 = Object.keys(days).some((d) => dropClass(days[d], d) === "z2");
  const score = (src, slot) => {
    const a = { k: "plan", src }, cls = dropClass(a, slot), r = resolve(a, slot);
    const group = { walk: 0, cross: 1, z2: hasZ2 ? 2 : 4, hard: 3 }[cls] ?? 0;
    const gap = L ? Math.abs(diffDays(slot, L)) : 0;
    return group * 1e4 + (cls === "z2" ? (r.mi || 0) * 100 : 0) + gap;
  };
  let best = null, bestScore = -1;
  for (const src of free) {
    const slot = rests.includes(src) ? src : rests[0];
    const sc = score(src, slot);
    if (sc > bestScore) { best = { ...days, [slot]: { k: "plan", src } }; bestScore = sc; }
  }
  return best || days;
}

/* ---------- editing one day ---------- */

/* Hard sessions any day can be switched to (Mary, 7 Nov): threshold (Z4),
 * intervals (Z5) and hills. The session is taken from the plan itself: the
 * latest one of that kind on or before the day, else the first one after, so
 * it fits where the block is. */
const FAMILY = { thr: /^SHAM \/\/ THRESHOLD /, int: /^SHAM \/\/ INTERVALS /, hills: /^SHAM \/\/ HILLS / };
export const FAMILY_LABEL = { thr: "Threshold", int: "Intervals", hills: "Hills" };
const FAMILY_DATES = Object.fromEntries(Object.entries(FAMILY).map(([k, re]) =>
  [k, Object.keys(PLAN).sort().filter((d) => re.test(PLAN[d].g || ""))]));
export function familySrc(fam, iso) {
  const ds = FAMILY_DATES[fam] || [];
  const before = ds.filter((d) => d <= iso);
  if (ds.length) return before.length ? before[before.length - 1] : ds[0];
  // Not on the calendar (hills since 7 Nov): the library session for this point of the block.
  const lib = Object.keys(LIBRARY).filter((k) => FAMILY[fam].test(LIBRARY[k].g || ""))
    .sort((x, y) => (LIBRARY[x].from < LIBRARY[y].from ? -1 : 1));
  const ok = lib.filter((k) => LIBRARY[k].from <= iso);
  return ok.length ? ok[ok.length - 1] : lib[0] || null;
}
export const familyOf = (src) => Object.keys(FAMILY).find((k) => FAMILY[k].test(planEntry(src)?.g || "")) || null;

/* What a day can be set to: its plan workout, Z2 easy, threshold, intervals,
 * hills, alt cardio or rest. Options that would repeat the plan are left out.
 * The long run (and race) can only move or change distance. */
export function kindOptions(days, d, w) {
  if (d === longSlot(days)) return [];
  const a = days[d];
  const inWeek = new Set(weekDates(w));
  const cur = a?.k === "plan" && inWeek.has(a.src) ? a.src : null;
  const free = unusedSrcs(days, w);
  const home = cur || (free.includes(d) ? d : free[0]) || null;
  const pk = home ? PLAN[home].k : null;
  const opts = [];
  if (home) {
    const fam = familyOf(home);
    const what = fam ? FAMILY_LABEL[fam] : { easy: "Z2", bike: "Bike", walk: "Walk", quality: "Hard day" }[pk] || "";
    opts.push({ key: "plan", k: "plan", src: home, label: what ? `Plan: ${what}` : "Plan" });
  }
  if (pk !== "easy") opts.push({ key: "easy", k: "easy", label: "Z2 easy" });
  for (const [fam, label] of [["thr", "Threshold Z4"], ["int", "Intervals Z5"], ["hills", "Hills"]]) {
    const src = familySrc(fam, d);
    if (src && src !== home) opts.push({ key: fam, k: "plan", src, label });
  }
  if (!["bike", "walk"].includes(pk)) opts.push({ key: "alt", k: "alt", label: "Alt cardio" });
  opts.push({ key: "rest", k: "rest", label: "Rest" });
  return opts;
}

export function setKind(days, d, w, key) {
  const opt = kindOptions(days, d, w).find((o) => o.key === key);
  if (!opt) return days;
  return { ...days, [d]: opt.k === "plan" ? { k: "plan", src: opt.src } : { k: opt.k } };
}

/* Drag and drop: the two days trade workouts. Race day stays put. */
export function moveDay(days, from, to) {
  if (from === to || !(from in days) || !(to in days)) return days;
  if (isRace(days, from) || isRace(days, to)) return days;
  return { ...days, [from]: days[to], [to]: days[from] };
}
export const moveLong = (days, to) => moveDay(days, longSlot(days), to);

/* The step whose length changes when the miles do: the last easy distance
 * step (a cool-down, or the main easy part of a steady or long run), never
 * the marathon-pace or threshold work. */
function adjustable(steps) {
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s[0] !== "r" && s[1] === "d" && (s[3] == null || s[3] < 145)) return s;
  }
  return null;
}

/* Miles for a run, minutes for anything else. A long run can't go under 8
 * miles, so trimming it never quietly removes it. A hard day can't lose
 * more than its easy cool-down. */
export function amountSpec(a, iso) {
  if (isRest(a)) return null;
  const r = resolve(a, iso);
  if (r.race) return null;
  if (!r.run) return { unit: "min", step: 5, min: 10, max: 180, value: r.min, base: r.baseMin };
  let min = r.long ? 8 : 1;
  if (r.kind === "quality" && r.g && STEPS[r.g]) {
    const adj = adjustable(STEPS[r.g][2]);
    if (adj) min = Math.max(1, Math.ceil((r.baseMi - adj[2] + 0.25) * 2) / 2);
  }
  return { unit: "mi", step: 0.5, min, max: r.long ? 30 : 20, value: r.mi, base: r.baseMi };
}

export function setAmount(days, d, value) {
  const a = days[d], spec = amountSpec(a, d);
  if (!spec) return days;
  const v = Math.min(spec.max, Math.max(spec.min, Math.round(value / spec.step) * spec.step));
  const next = { ...a };
  delete next.mi; delete next.min;
  if (v !== spec.base) next[spec.unit] = v;
  return { ...days, [d]: next };
}

/* Hard days the day before or after the long run (Mary confirms those). */
export function hardNextToLong(days) {
  const L = longSlot(days);
  if (!L) return [];
  return Object.keys(days).sort().filter((d) => Math.abs(diffDays(d, L)) === 1 && dropClass(days[d], d) === "hard");
}

/* ---------- the workout that goes on the watch ---------- */

const scaleHr = (v, lt) => (v == null ? v : Math.round(v * lt / BASE_LT));
function scaleSteps(steps, lt) {
  return steps.map((s) => s[0] === "r" ? ["r", s[1], scaleSteps(s[2], lt)]
    : [s[0], s[1], s[2], scaleHr(s[3], lt), scaleHr(s[4], lt), s[5]]);
}

/* What one day should put on the watch: { name, custom, def } or null for
 * rest, alt cardio and walk days. def is [sport, description, steps] for
 * building that workout if the person's Garmin doesn't have it yet. custom
 * means the miles or minutes were changed, so the plan's own version can't
 * be used. */
export function garminWant(a, iso, lt = BASE_LT) {
  if (isRest(a)) return null;
  const r = resolve(a, iso);
  if (a.k === "easy") {
    const steps = [["warmup", "d", 0.5, null, null, "Settle in"], ["interval", "d", Math.max(0.25, r.mi - 0.5), 125, 143, "HR only"]];
    return { name: `SHAM // Z2 ${fmtNum(r.mi)} MI`, custom: true,
      def: ["running", "Hold HR 125 to 143 and let pace fall where it falls.", scaleSteps(steps, lt)] };
  }
  if (a.k !== "plan" || !r.g || !STEPS[r.g]) return null;
  const [sport, desc, steps0] = STEPS[r.g];
  const steps = JSON.parse(JSON.stringify(steps0));
  const run = sport === "running";
  if (!r.changed) return { name: r.g, custom: false, def: [sport, desc, run ? scaleSteps(steps, lt) : steps] };
  let name;
  if (!run) {
    for (const s of steps) if (s[1] === "t") s[2] = r.min * 60;
    name = /BIKE EASY \d+ MIN$/.test(r.g) ? r.g.replace(/\d+ MIN$/, `${r.min} MIN`) : `${r.g} @ ${r.min} MIN`;
  } else {
    const adj = adjustable(steps);
    if (adj) adj[2] = Math.max(0.25, Math.round((adj[2] + r.mi - r.baseMi) * 100) / 100);
    name = /^SHAM \/\/ (Z2|LONG) [\d.]+ MI$/.test(r.g) ? r.g.replace(/[\d.]+ MI$/, `${fmtNum(r.mi)} MI`) : `${r.g} @ ${fmtNum(r.mi)} MI`;
  }
  return { name, custom: true, def: [sport, `${desc} Set to ${fmtNum(run ? r.mi : r.min)} ${run ? "mi" : "min"} in the Shamrock app.`,
    run ? scaleSteps(steps, lt) : steps] };
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

/* The week that governs a date: the locked week; else the saved edits (they
 * lock themselves at midnight Sunday); else the plan's week. */
export function governing(weeks, w) {
  const rec = weeks?.[w];
  const locked = lockedDays(rec);
  if (locked) return { days: locked, locked: true, auto: !!rec.auto, rec };
  if (!inPlan(w)) return null;
  if (rec?.days) return { days: rec.days, locked: false, auto: false, draft: true, rec };
  return { days: defaultWeek(w), locked: false, auto: true, rec: null };
}

/* Whether a week that has already begun should be written down as the
 * plan's week (so the swap has a record to attach to). */
export function needsAutoLock(weeks, w, today) {
  return inPlan(w) && w <= weekOf(today) && !weeks?.[w]?.lockedAt;
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
export function dayStatus({ iso, a, today, hour, logRec, gm, start = SEASON_START }) {
  if (iso < start) return "before";
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
  const start = SEASON_START;
  const weeks = p.weeks || {}, log = p.log || {}, gdays = p.garmin?.days || {};
  const status = {}, assign = {};
  const out = { today, hour, start, status, assign, workouts: 0, due: 0, misses: 0,
    miles: 0, milesEst: 0, longest: 0, longestEst: false, longDone: 0, longDue: 0 };

  const last = today < RACE_DAY ? today : RACE_DAY;
  for (let w = FIRST_WEEK; w <= LAST_WEEK; w = addDays(w, 7)) {
    const g = governing(weeks, w);
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

/* Riegel's formula, the one most online race-time calculators use:
 * T2 = T1 x (D2 / D1)^1.06. The 1.06 is the slow-down for going farther, so
 * the shorter the run, the more it adds on: 12 mi at 10:30 gives 4:48, but
 * 20 mi at the same 10:30 gives 4:40. */
export const RIEGEL = 1.06;
export const riegel = (sec, mi, toMi = 26.2) => Math.round(sec * Math.pow(toMi / mi, RIEGEL));

/* Marathon estimate from the latest long run, its time and its distance put
 * through Riegel. It reads the runs the 0500 and 2130 sync already saved, so
 * nothing is pulled from Garmin to show it. The long run is each week's
 * longest Garmin run, if it was 8 miles or more, so a long run moved off
 * Friday still counts. Change is against the long run before it; negative
 * means faster. */
export function longRunProjection(gdays, today) {
  const best = {};
  for (const [d, g] of Object.entries(gdays || {})) {
    if (d > today || !((g?.lr || 0) >= LONG_MIN) || !((g?.ls || 0) > 0)) continue;
    const w = weekOf(d);
    if (!best[w] || g.lr > best[w].mi) best[w] = { d, mi: g.lr, sec: g.ls };
  }
  const runs = Object.keys(best).sort().reverse().map((w) => best[w]);
  if (!runs.length) return null;
  const proj = (x) => riegel(x.sec, x.mi);
  const cur = runs[0];
  return { sec: proj(cur), pace: cur.sec / cur.mi, mi: cur.mi, d: cur.d,
    change: runs[1] ? proj(cur) - proj(runs[1]) : null };
}
