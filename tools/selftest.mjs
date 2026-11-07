/* Assertions for core.js. Run: npm test */
import assert from "node:assert/strict";
import {
  PLAN, STEPS, addDays, weekOf, weekNo, clock, defaultWeek, countOf, planCount,
  longSlot, stepDown, stepUp, dropOrder, kindOptions, setKind, moveDay, moveLong, resolve,
  amountSpec, setAmount, hardNextToLong, garminWant, lockedDays, governing, canEdit, midnightIn,
  dayStatus, garminMatch, season, swapFirstChoices, scaleNote,
  needsAutoLock, hms, paceStr, longRunProjection, LAST_WEEK, SEASON_START, TOTAL_WEEKS
} from "../core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("FAIL", name); throw e; } };
const W1 = "2026-11-09", W2 = "2026-11-16";

t("plan covers every day, every Garmin name has steps", () => {
  for (let d = "2026-11-02"; d <= "2027-03-21"; d = addDays(d, 1)) assert.ok(PLAN[d], d);
  for (const p of Object.values(PLAN)) if (p.g) assert.ok(STEPS[p.g], p.g);
  assert.equal(Object.values(PLAN).filter((p) => p.k === "stroller").length, 0, "no stroller runs left");
  assert.equal(PLAN["2026-11-15"].t, "Z2 3 mi");
});
t("week 1 is 9 Nov, 19 weeks to race", () => {
  assert.equal(SEASON_START, W1);
  assert.equal(weekNo(W1), 1);
  assert.equal(weekNo(LAST_WEEK), 19);
  assert.equal(TOTAL_WEEKS, 19);
  assert.equal(weekOf("2026-11-08"), "2026-11-02");
});
t("clock per timezone", () => {
  const now = Date.parse("2026-11-09T05:30:00Z"); // 00:30 ET Monday, 22:30 MT Sunday
  assert.deepEqual([clock("America/New_York", now).iso, clock("America/New_York", now).hour], ["2026-11-09", 0]);
  assert.deepEqual([clock("America/Denver", now).iso, clock("America/Denver", now).dow], ["2026-11-08", 6]);
});
t("next week is editable any day until midnight Sunday", () => {
  const tue = clock("America/New_York", Date.parse("2026-11-10T14:00:00Z"));
  const sun = clock("America/New_York", Date.parse("2026-11-15T23:00:00Z"));
  const mon = clock("America/New_York", Date.parse("2026-11-16T05:30:00Z")); // Mon 00:30
  assert.equal(canEdit(tue, W2), true);
  assert.equal(canEdit(sun, W2), true);
  assert.equal(canEdit(mon, W2), false, "it's this week now");
  assert.equal(canEdit(tue, W1), false, "this week isn't editable");
  assert.equal(canEdit(clock("America/Denver", Date.parse("2026-11-16T05:30:00Z")), W2), true, "Jon: still Sunday night");
});
t("saved edits govern, then lock as left", () => {
  const edited = moveDay(defaultWeek(W2), "2026-11-20", "2026-11-21");
  const g = governing({ [W2]: { days: edited, saved: 1, closesAt: 2 } }, W2);
  assert.equal(g.draft, true); assert.equal(longSlot(g.days), "2026-11-21");
  assert.equal(needsAutoLock({ [W2]: { days: edited } }, W2, "2026-11-16"), true);
});
t("closesAt is Monday midnight in each timezone", () => {
  assert.equal(midnightIn(W1, "America/New_York"), Date.parse("2026-11-09T05:00:00Z"));
  assert.equal(midnightIn(W1, "America/Denver"), Date.parse("2026-11-09T07:00:00Z"));
  assert.equal(midnightIn("2027-03-15", "America/New_York"), Date.parse("2027-03-15T04:00:00Z"), "after DST starts");
});
t("default week: 7 days, long on Friday", () => {
  const d = defaultWeek(W1);
  assert.equal(countOf(d), 7);
  assert.equal(longSlot(d), "2026-11-13");
  assert.equal(planCount(LAST_WEEK), 7);
  assert.equal(longSlot(defaultWeek(LAST_WEEK)), "2027-03-21");
});
t("drop order: walk, bike, Z2s down to one, hard, last Z2, never long", () => {
  // Week 2: Mon Z2 4, Tue bike 40, Wed hills, Thu Z2 4, Fri long 12, Sat walk, Sun Z2 3
  const o = dropOrder(defaultWeek(W2));
  assert.deepEqual(o, ["2026-11-21", "2026-11-17", "2026-11-22", "2026-11-19", "2026-11-18", "2026-11-16"]);
  let d = defaultWeek(W2);
  for (let i = 0; i < 10; i++) d = stepDown(d);
  assert.equal(countOf(d), 1);
  assert.equal(longSlot(d), "2026-11-20");
});
t("step up brings days back in reverse", () => {
  let d = defaultWeek(W2);
  for (let i = 0; i < 6; i++) d = stepDown(d);
  d = stepUp(d, W2); assert.deepEqual(Object.keys(d).filter((x) => d[x].k !== "rest"), ["2026-11-16", "2026-11-20"]);
  d = stepUp(d, W2); assert.equal(d["2026-11-18"].k, "plan", "hard day next");
  for (let i = 0; i < 9; i++) d = stepUp(d, W2);
  assert.deepEqual(d, defaultWeek(W2));
});
t("kind options and setKind", () => {
  const d = defaultWeek(W2);
  assert.deepEqual(kindOptions(d, "2026-11-18", W2).map((o) => o.k), ["plan", "easy", "alt", "rest"]);
  assert.deepEqual(kindOptions(d, "2026-11-16", W2).map((o) => o.k), ["plan", "alt", "rest"]);
  assert.deepEqual(kindOptions(d, "2026-11-17", W2).map((o) => o.k), ["plan", "easy", "rest"]);
  assert.deepEqual(kindOptions(d, "2026-11-20", W2), [], "long run can't change kind");
  const e = setKind(d, "2026-11-18", W2, "alt");
  assert.deepEqual(e["2026-11-18"], { k: "alt" });
  assert.deepEqual(setKind(e, "2026-11-18", W2, "plan")["2026-11-18"], { k: "plan", src: "2026-11-18" });
});
t("drag swaps two days, race stays", () => {
  const d = moveDay(defaultWeek(W1), "2026-11-13", "2026-11-14");
  assert.equal(longSlot(d), "2026-11-14");
  assert.equal(d["2026-11-13"].src, "2026-11-14");
  assert.equal(moveLong(defaultWeek(W1), "2026-11-15")["2026-11-13"].src, "2026-11-15");
  const r = defaultWeek(LAST_WEEK);
  assert.deepEqual(moveDay(r, "2027-03-21", "2027-03-19"), r);
});
t("hard day next to the long run", () => {
  assert.deepEqual(hardNextToLong(defaultWeek(W2)), []);
  assert.deepEqual(hardNextToLong(moveDay(defaultWeek(W2), "2026-11-18", "2026-11-19")), ["2026-11-19"]);
  assert.deepEqual(hardNextToLong(moveDay(defaultWeek(W2), "2026-11-18", "2026-11-21")), ["2026-11-21"]);
});
t("amounts", () => {
  let d = defaultWeek(W1);
  const spec = amountSpec(d["2026-11-13"], "2026-11-13");
  assert.deepEqual([spec.unit, spec.min, spec.value], ["mi", 8, 11]);
  d = setAmount(d, "2026-11-13", 12.5);
  assert.equal(resolve(d["2026-11-13"], "2026-11-13").title, "Long 12.5 mi");
  assert.equal(setAmount(d, "2026-11-13", 4)["2026-11-13"].mi, 8, "long can't drop under 8");
  assert.deepEqual(setAmount(d, "2026-11-13", 11)["2026-11-13"], { k: "plan", src: "2026-11-13" }, "back to plan clears it");
  d = setAmount(d, "2026-11-10", 50);
  assert.equal(resolve(d["2026-11-10"], "2026-11-10").title, "Bike 50 min");
  const hills = { k: "plan", src: "2026-11-18" };
  assert.equal(amountSpec(hills, "2026-11-18").min, 4, "hills can only lose the cool-down");
  assert.equal(resolve({ ...hills, mi: 6 }, "2026-11-18").title, "Hills 6 x 60 sec · 6 mi");
  assert.equal(amountSpec(defaultWeek(LAST_WEEK)["2027-03-21"], "2027-03-21"), null, "race distance is fixed");
});
t("watch workouts", () => {
  assert.equal(garminWant({ k: "plan", src: "2026-11-13" }, "2026-11-13").name, "SHAM // LONG 11 MI");
  assert.equal(garminWant({ k: "plan", src: "2026-11-13", mi: 12.5 }, "2026-11-13").name, "SHAM // LONG 12.5 MI");
  const h = garminWant({ k: "plan", src: "2026-11-18", mi: 6 }, "2026-11-18");
  assert.equal(h.name, "SHAM // HILLS 6x60S @ 6 MI");
  assert.equal(h.def[2][2][2], 1.0 + 6 - resolve({ k: "plan", src: "2026-11-18" }, "2026-11-18").mi, "cool-down took the extra");
  assert.equal(garminWant({ k: "plan", src: "2026-11-17", min: 50 }, "2026-11-17").name, "SHAM // BIKE EASY 50 MIN");
  assert.equal(garminWant({ k: "plan", src: "2026-11-17", min: 50 }, "2026-11-17").def[2][0][2], 3000);
  assert.equal(garminWant({ k: "easy", mi: 5 }, "2026-11-16").name, "SHAM // Z2 5 MI");
  assert.equal(garminWant({ k: "alt" }, "2026-11-16"), null);
  assert.equal(garminWant({ k: "plan", src: "2026-11-21" }, "2026-11-21"), null, "walk is blank on the watch");
  const jon = garminWant({ k: "easy" }, "2026-11-16", 172);
  assert.deepEqual([jon.def[2][1][3], jon.def[2][1][4]], [129, 147], "Jon's HR scaled");
  const lm = garminWant({ k: "plan", src: "2027-01-08", mi: 19 }, "2027-01-08");
  assert.equal(lm.def[2][1][2], 15.5, "long with MP finish grows the easy part");
  assert.equal(lm.def[2][2][2], 3, "MP finish untouched");
});
t("governing: locked, else the plan's week", () => {
  assert.equal(governing({}, "2026-11-02"), null, "before week 1");
  const g = governing({}, W1);
  assert.equal(g.auto, true); assert.equal(countOf(g.days), 7);
  assert.equal(needsAutoLock({}, W1, "2026-11-09"), true);
  assert.equal(needsAutoLock({}, W1, "2026-11-08"), false);
  assert.equal(needsAutoLock({ [W1]: { lockedAt: 5 } }, W1, "2026-11-10"), false);
  const rec = { lockedAt: 1, days: defaultWeek(W1), swap: { a: "2026-11-10", b: "2026-11-12", at: 2 } };
  assert.equal(lockedDays(rec)["2026-11-10"].src, "2026-11-12");
});
t("day status", () => {
  const a = { k: "plan", src: "2026-11-09" }, rest = { k: "rest" };
  const base = { iso: "2026-11-09", a, today: "2026-11-09", hour: 9 };
  assert.equal(dayStatus(base), "today");
  assert.equal(dayStatus({ ...base, logRec: { done: true } }), "done");
  assert.equal(dayStatus({ ...base, today: "2026-11-10", hour: 11 }), "grace");
  assert.equal(dayStatus({ ...base, today: "2026-11-10", hour: 12 }), "miss");
  assert.equal(dayStatus({ ...base, today: "2026-11-10", hour: 13, gm: { r: 3.1, lr: 3.1, n: 1 } }), "done");
  assert.equal(dayStatus({ ...base, iso: "2026-11-08", today: "2026-11-10" }), "before");
  assert.equal(dayStatus({ ...base, a: rest }), "rest");
});
t("garmin match uses the changed distance", () => {
  const long = resolve({ k: "plan", src: "2026-11-13", mi: 14 }, "2026-11-13");
  assert.equal(garminMatch(long, { r: 10, lr: 10, n: 1 }), false);
  assert.equal(garminMatch(long, { r: 10.6, lr: 10.6, n: 1 }), true);
  assert.equal(garminMatch(resolve({ k: "plan", src: "2026-11-10" }, "2026-11-10"), { r: 0, lr: 0, n: 1 }), true);
});
t("season counts from week 1", () => {
  const p = { tz: "America/New_York", weeks: { [W1]: { lockedAt: 1, days: defaultWeek(W1) } },
    log: { "2026-11-09": { done: true }, "2026-11-10": { done: true } },
    garmin: { days: { "2026-11-06": { r: 10.2, lr: 10.2, n: 1 }, "2026-11-11": { r: 5.1, lr: 5.1, n: 1 } } } };
  const s = season(p, { now: Date.parse("2026-11-12T18:00:00Z") });
  assert.equal(s.status["2026-11-11"], "done");
  assert.equal(s.workouts, 3); assert.equal(s.misses, 0);
  assert.equal(s.miles, 8.1, "the 6 Nov run is before week 1");
  assert.equal(s.longest, 5.1);
  const later = season(p, { now: Date.parse("2026-11-17T18:00:00Z") });
  assert.equal(later.status["2026-11-16"], "miss", "unlocked week 2 is the plan's week");
  const none = season({ tz: "America/Denver" }, { now: Date.parse("2026-11-10T20:00:00Z") });
  assert.equal(none.status["2026-11-09"], "miss", "nobody locked: still the plan's week");
  assert.equal(none.status["2026-11-10"], "today");
});
t("garmin zero day does not erase a tapped run", () => {
  const p = { tz: "America/New_York", log: { "2026-11-09": { done: true } },
    garmin: { days: { "2026-11-09": { r: 0, lr: 0, n: 0 } } } };
  const s = season(p, { now: Date.parse("2026-11-10T15:00:00Z") });
  assert.equal(s.miles, 3); assert.equal(s.milesEst, 3);
});
t("swap choices", () => {
  const st = (d) => (d < "2026-11-11" ? "done" : "future");
  assert.deepEqual(swapFirstChoices(defaultWeek(W1), st, "2026-11-11"), ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
});
t("hr scaling", () => {
  assert.equal(scaleNote("Solo. HR 125-143.", "easy", 172), "Solo. HR 129-147.");
  assert.equal(scaleNote("HR 100-130. Plus lift.", "bike", 172), "HR 100-130. Plus lift.");
});
t("marathon projection from the latest long run", () => {
  assert.equal(hms(14280), "3:58:00");
  assert.equal(paceStr(545), "9:05");
  const days = {
    "2026-11-03": { r: 10, lr: 10, n: 1, ls: 5700 },
    "2026-11-14": { r: 11, lr: 11, n: 1, ls: 6050 },
    "2026-11-20": { r: 12, lr: 12, n: 1, ls: 0 }
  };
  const p = longRunProjection(days, "2026-11-20");
  assert.equal(p.d, "2026-11-14");
  assert.equal(p.sec, Math.round(550 * 26.2));
  assert.equal(p.change, Math.round(550 * 26.2) - Math.round(570 * 26.2));
});

console.log(`${n} checks passed`);
