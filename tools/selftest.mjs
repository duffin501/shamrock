/* Assertions for core.js. Run: npm test */
import assert from "node:assert/strict";
import {
  PLAN, addDays, weekOf, weekDates, weekNo, clock, defaultWeek, countOf, planCount,
  longSlot, stepDown, stepUp, cycle, moveLong, resolve, lockedDays, governing,
  dayStatus, garminMatch, season, swapFirstChoices, swapSecondChoices, scaleNote,
  needsAutoLock, hms, paceStr, longRunProjection, LAST_WEEK
} from "../core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("FAIL", name); throw e; } };
const W2 = "2026-11-09";

t("plan covers every day", () => {
  for (let d = "2026-11-02"; d <= "2027-03-21"; d = addDays(d, 1)) assert.ok(PLAN[d], d);
  assert.equal(Object.keys(PLAN).length, 140);
});
t("weeks", () => {
  assert.equal(weekOf("2026-11-08"), "2026-11-02");
  assert.equal(weekOf("2026-11-09"), "2026-11-09");
  assert.equal(weekNo(W2), 2);
  assert.equal(weekNo(LAST_WEEK), 20);
  assert.equal(weekDates(W2)[6], "2026-11-15");
});
t("clock per timezone", () => {
  const now = Date.parse("2026-11-09T05:30:00Z"); // 00:30 ET Monday, 22:30 MT Sunday
  assert.deepEqual([clock("America/New_York", now).iso, clock("America/New_York", now).hour], ["2026-11-09", 0]);
  assert.deepEqual([clock("America/Denver", now).iso, clock("America/Denver", now).hour, clock("America/Denver", now).dow], ["2026-11-08", 22, 6]);
});
t("default week: 7 workouts, long on Friday", () => {
  const d = defaultWeek(W2);
  assert.equal(countOf(d), 7);
  assert.equal(longSlot(d), "2026-11-13");
  assert.equal(resolve(d["2026-11-13"], "2026-11-13").mi, 11);
  assert.equal(planCount(LAST_WEEK), 7);
  assert.equal(longSlot(defaultWeek(LAST_WEEK)), "2027-03-21");
});
t("step down: walk, then easy runs shortest first, then bike, never long", () => {
  let d = defaultWeek(W2);
  d = stepDown(d, W2); assert.equal(d["2026-11-14"].k, "rest", "walk first");
  d = stepDown(d, W2); assert.equal(countOf(d), 5);
  const gone = ["2026-11-09", "2026-11-12", "2026-11-15"].filter((x) => d[x].k === "rest");
  assert.equal(gone.length, 1, "one 3 mi easy run");
  d = stepDown(d, W2); d = stepDown(d, W2);
  assert.equal(["2026-11-09", "2026-11-12", "2026-11-15"].every((x) => d[x].k === "rest"), true);
  d = stepDown(d, W2); assert.equal(d["2026-11-11"].k, "rest", "strides run (5 mi est) after the 3s");
  d = stepDown(d, W2); assert.equal(d["2026-11-10"].k, "rest", "bike next");
  assert.equal(countOf(d), 1);
  d = stepDown(d, W2); assert.equal(countOf(d), 1, "long stays");
  assert.equal(longSlot(d), "2026-11-13");
});
t("step up brings back the best one first", () => {
  let d = defaultWeek(W2);
  for (let i = 0; i < 6; i++) d = stepDown(d, W2);
  d = stepUp(d, W2); assert.equal(d["2026-11-10"].k, "plan", "bike back first");
  for (let i = 0; i < 9; i++) d = stepUp(d, W2);
  assert.deepEqual(d, defaultWeek(W2));
});
t("cycle: plan, easy, alt, rest", () => {
  let d = defaultWeek("2026-11-16");
  const wed = "2026-11-18"; // hills
  d = cycle(d, wed, "2026-11-16"); assert.equal(d[wed].k, "easy");
  d = cycle(d, wed, "2026-11-16"); assert.equal(d[wed].k, "alt");
  d = cycle(d, wed, "2026-11-16"); assert.equal(d[wed].k, "rest");
  d = cycle(d, wed, "2026-11-16"); assert.deepEqual(d[wed], { k: "plan", src: wed });
  // easy day skips the easy option
  let e = defaultWeek(W2);
  e = cycle(e, "2026-11-09", W2); assert.equal(e["2026-11-09"].k, "alt");
  // bike day skips alt
  e = cycle(e, "2026-11-10", W2); assert.equal(e["2026-11-10"].k, "easy");
  e = cycle(e, "2026-11-10", W2); assert.equal(e["2026-11-10"].k, "rest");
  // long run doesn't cycle
  assert.deepEqual(cycle(e, "2026-11-13", W2), e);
});
t("move long run trades places", () => {
  let d = moveLong(defaultWeek(W2), "2026-11-14");
  assert.equal(longSlot(d), "2026-11-14");
  assert.equal(d["2026-11-13"].src, "2026-11-14");
  assert.equal(resolve(d["2026-11-14"], "2026-11-14").mi, 11);
  // a rest-then-restore on the old long day gets the walk back, not a second long run
  d = cycle(d, "2026-11-13", W2); d = cycle(d, "2026-11-13", W2);
  assert.equal(d["2026-11-13"].k, "rest");
  d = cycle(d, "2026-11-13", W2);
  assert.equal(d["2026-11-13"].src, "2026-11-14");
  // race day doesn't move
  const r = defaultWeek(LAST_WEEK);
  assert.deepEqual(moveLong(r, "2027-03-19"), r);
});
t("swap applies on read", () => {
  const rec = { lockedAt: 1, days: defaultWeek(W2), swap: { a: "2026-11-10", b: "2026-11-12", at: 2 } };
  const d = lockedDays(rec);
  assert.equal(d["2026-11-10"].src, "2026-11-12");
  assert.equal(d["2026-11-12"].src, "2026-11-10");
  assert.equal(lockedDays({ days: d }), null, "unlocked week is not a locked week");
});
t("governing: locked, auto, or nothing", () => {
  assert.equal(governing({}, null, W2), null);
  assert.equal(governing({}, "2026-11-09", W2), null, "first week must be locked by hand");
  const g = governing({}, "2026-11-09", "2026-11-16");
  assert.equal(g.auto, true); assert.equal(countOf(g.days), 7);
  assert.equal(needsAutoLock({}, "2026-11-09", "2026-11-16", "2026-11-16"), true);
  assert.equal(needsAutoLock({}, "2026-11-09", "2026-11-16", "2026-11-15"), false);
  assert.equal(needsAutoLock({ "2026-11-16": { lockedAt: 5 } }, "2026-11-09", "2026-11-16", "2026-11-20"), false);
});
t("day status", () => {
  const a = { k: "plan", src: "2026-11-09" }, rest = { k: "rest" };
  const base = { iso: "2026-11-09", a, today: "2026-11-09", hour: 9, start: "2026-11-09" };
  assert.equal(dayStatus(base), "today");
  assert.equal(dayStatus({ ...base, logRec: { done: true } }), "done");
  assert.equal(dayStatus({ ...base, today: "2026-11-10", hour: 11 }), "grace");
  assert.equal(dayStatus({ ...base, today: "2026-11-10", hour: 12 }), "miss");
  assert.equal(dayStatus({ ...base, today: "2026-11-10", hour: 13, gm: { r: 3.1, lr: 3.1, n: 1 } }), "done");
  assert.equal(dayStatus({ ...base, today: "2026-11-08" }), "future");
  assert.equal(dayStatus({ ...base, a: rest }), "rest");
  assert.equal(dayStatus({ ...base, a: rest, today: "2026-11-08", start: "2026-11-02" }), "rest-future");
  assert.equal(dayStatus({ ...base, start: "2026-11-10", today: "2026-11-12" }), "before");
});
t("garmin match", () => {
  const long = resolve({ k: "plan", src: "2026-11-13" }, "2026-11-13");
  assert.equal(garminMatch(long, { r: 8, lr: 8, n: 1 }), false);
  assert.equal(garminMatch(long, { r: 8.3, lr: 8.3, n: 1 }), true);
  const bike = resolve({ k: "plan", src: "2026-11-10" }, "2026-11-10");
  assert.equal(garminMatch(bike, { r: 0, lr: 0, n: 1 }), true);
  assert.equal(garminMatch(bike, { r: 0, lr: 0, n: 0 }), false);
  const alt = resolve({ k: "alt" }, "2026-11-10");
  assert.equal(garminMatch(alt, { r: 0, lr: 0, n: 1 }), true);
});
t("season numbers", () => {
  const weeks = { [W2]: { lockedAt: 1, days: defaultWeek(W2) } };
  const p = { tz: "America/New_York", start: W2, weeks,
    log: { "2026-11-09": { done: true }, "2026-11-10": { done: true } },
    garmin: { days: { "2026-11-06": { r: 10.2, lr: 10.2, n: 1 }, "2026-11-11": { r: 5.1, lr: 5.1, n: 1 } } } };
  const now = Date.parse("2026-11-12T18:00:00Z"); // Thu 1 PM ET
  const s = season(p, { now });
  assert.equal(s.today, "2026-11-12");
  assert.equal(s.status["2026-11-11"], "done", "garmin covered a forgotten tap");
  assert.equal(s.status["2026-11-12"], "today");
  assert.equal(s.workouts, 3); assert.equal(s.due, 3); assert.equal(s.misses, 0);
  assert.equal(s.miles, 18.3, "garmin miles plus the tapped run's plan miles");
  assert.equal(s.longest, 10.2);
  const later = season(p, { now: Date.parse("2026-11-14T18:00:00Z") });
  assert.equal(later.status["2026-11-12"], "miss");
  assert.equal(later.status["2026-11-13"], "miss");
  assert.equal(later.longDue, 1); assert.equal(later.longDone, 0);
  // the following week was never locked, so the full plan governs it
  const wk3 = season(p, { now: Date.parse("2026-11-17T18:00:00Z") });
  assert.equal(wk3.status["2026-11-16"], "miss");
  assert.equal(wk3.status["2026-11-17"], "today");
});
t("garmin zero day does not erase a tapped run", () => {
  const W = "2026-11-09";
  const p = { tz: "America/New_York", start: W, weeks: { [W]: { lockedAt: 1, days: defaultWeek(W) } },
    log: { "2026-11-09": { done: true } }, garmin: { days: { "2026-11-09": { r: 0, lr: 0, n: 0 }, "2026-11-10": { r: 0, lr: 0, n: 1 } } } };
  const s = season(p, { now: Date.parse("2026-11-11T15:00:00Z") });
  assert.equal(s.miles, 3); assert.equal(s.milesEst, 3);
  assert.equal(s.status["2026-11-10"], "done", "bike day backed by any activity");
});
t("swap choices", () => {
  const days = defaultWeek(W2);
  const st = (d) => (d < "2026-11-11" ? "done" : "future");
  assert.deepEqual(swapFirstChoices(days, st, "2026-11-11"), ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
  const s2 = swapSecondChoices({ ...days, "2026-11-12": { k: "rest" } }, st, "2026-11-11");
  assert.deepEqual(s2, ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
});
t("hr scaling", () => {
  assert.equal(scaleNote("Solo. HR 125-143.", "easy", 172), "Solo. HR 129-147.");
  assert.equal(scaleNote("HR 100-130. Plus lift.", "bike", 172), "HR 100-130. Plus lift.");
  assert.equal(scaleNote("Miles 1-3 HR 135-150.", "race", 160), "Miles 1-3 HR 129-144.");
});
t("marathon projection from the latest long run", () => {
  assert.equal(hms(14280), "3:58:00");
  assert.equal(paceStr(545), "9:05");
  const days = {
    "2026-11-03": { r: 10, lr: 10, n: 1, ls: 5700 },     // 9:30/mi, week 1
    "2026-11-05": { r: 9, lr: 9, n: 1, ls: 4800 },       // shorter, same week: ignored
    "2026-11-11": { r: 6, lr: 6, n: 1, ls: 3000 },       // under 8 mi: not a long run
    "2026-11-14": { r: 11, lr: 11, n: 1, ls: 6050 },     // 9:10/mi, week 2
    "2026-11-20": { r: 12, lr: 12, n: 1, ls: 0 }         // no duration: skipped
  };
  const p = longRunProjection(days, "2026-11-20");
  assert.equal(p.d, "2026-11-14"); assert.equal(p.mi, 11);
  assert.equal(p.sec, Math.round(550 * 26.2));
  assert.equal(p.change, Math.round(550 * 26.2) - Math.round(570 * 26.2));
  assert.equal(longRunProjection(days, "2026-11-13").d, "2026-11-03", "future days ignored");
  assert.equal(longRunProjection({ "2026-11-11": { lr: 6, ls: 3000 } }, "2026-11-20"), null);
});

console.log(`${n} checks passed`);
