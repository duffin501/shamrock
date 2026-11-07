/* Assertions for core.js. Run: npm test */
import assert from "node:assert/strict";
import {
  PLAN, STEPS, addDays, weekOf, weekNo, clock, defaultWeek, countOf, planCount,
  longSlot, stepDown, stepUp, dropOrder, kindOptions, setKind, moveDay, moveLong, resolve,
  amountSpec, setAmount, hardNextToLong, garminWant, lockedDays, governing, canEdit, midnightIn, familySrc, weekDates,
  dayStatus, garminMatch, season, swapFirstChoices, scaleNote,
  needsAutoLock, hms, paceStr, longRunProjection, riegel, LAST_WEEK, SEASON_START, TOTAL_WEEKS,
  repsOf, setReps, repStep
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
  // Week 2: Mon Z2 4, Tue bike 40, Wed threshold 3x6, Thu Z2 4 + strides (~5), Fri long 12, Sat walk, Sun Z2 3
  const o = dropOrder(defaultWeek(W2));
  assert.deepEqual(o, ["2026-11-21", "2026-11-17", "2026-11-22", "2026-11-16", "2026-11-18", "2026-11-19"]);
  let d = defaultWeek(W2);
  for (let i = 0; i < 10; i++) d = stepDown(d);
  assert.equal(countOf(d), 1);
  assert.equal(longSlot(d), "2026-11-20");
});
t("step up brings days back in reverse", () => {
  let d = defaultWeek(W2);
  for (let i = 0; i < 6; i++) d = stepDown(d);
  d = stepUp(d, W2); assert.deepEqual(Object.keys(d).filter((x) => d[x].k !== "rest"), ["2026-11-19", "2026-11-20"]);
  d = stepUp(d, W2); assert.equal(d["2026-11-18"].k, "plan", "hard day next");
  for (let i = 0; i < 9; i++) d = stepUp(d, W2);
  assert.deepEqual(d, defaultWeek(W2));
});
t("kind options and setKind", () => {
  const d = defaultWeek(W2);
  assert.deepEqual(kindOptions(d, "2026-11-18", W2).map((o) => o.key), ["plan", "easy", "int", "hills", "alt", "rest"], "threshold day: no separate Threshold button");
  assert.deepEqual(kindOptions(d, "2026-11-16", W2).map((o) => o.key), ["plan", "thr", "int", "hills", "alt", "rest"]);
  assert.deepEqual(kindOptions(d, "2026-11-17", W2).map((o) => o.key), ["plan", "easy", "thr", "int", "hills", "rest"]);
  assert.deepEqual(kindOptions(d, "2026-11-20", W2), [], "long run can't change kind");
  const e = setKind(d, "2026-11-18", W2, "alt");
  assert.deepEqual(e["2026-11-18"], { k: "alt" });
  assert.deepEqual(setKind(e, "2026-11-18", W2, "plan")["2026-11-18"], { k: "plan", src: "2026-11-18" });
  // Z2 Monday to threshold: the first threshold in the plan (block hasn't got there yet)
  const thr = setKind(d, "2026-11-16", W2, "thr");
  assert.equal(resolve(thr["2026-11-16"], "2026-11-16").title, "Threshold 4 x 4 min");
  assert.equal(garminWant(thr["2026-11-16"], "2026-11-16").name, "SHAM // THRESHOLD 4x4MIN");
  // later in the block it's the latest one on or before the day
  assert.equal(resolve(setKind(defaultWeek("2027-01-18"), "2027-01-18", "2027-01-18", "thr")["2027-01-18"], "2027-01-18").title, "Threshold 2 x 12 min");
  assert.equal(resolve(setKind(defaultWeek("2027-01-18"), "2027-01-21", "2027-01-18", "int")["2027-01-21"], "2027-01-21").title, "Intervals 5 x 3 min");
  // and it's a hard day: next to the long run it needs the confirm
  assert.deepEqual(hardNextToLong(setKind(d, "2026-11-19", W2, "int")), ["2026-11-19"]);
  // back to plan restores the day's own workout
  assert.deepEqual(setKind(thr, "2026-11-16", W2, "plan")["2026-11-16"], { k: "plan", src: "2026-11-16" });
});
t("drag swaps two days, race stays", () => {
  const d = moveDay(defaultWeek(W1), "2026-11-13", "2026-11-14");
  assert.equal(longSlot(d), "2026-11-14");
  assert.equal(d["2026-11-13"].src, "2026-11-14");
  assert.equal(moveLong(defaultWeek(W1), "2026-11-15")["2026-11-13"].src, "2026-11-15");
  const r = defaultWeek(LAST_WEEK);
  assert.deepEqual(moveDay(r, "2027-03-21", "2027-03-19"), r);
});
t("coaching changes of 7 Nov are in the plan", () => {
  for (let w = W1; w <= LAST_WEEK; w = addDays(w, 7)) {
    const hard = weekDates(w).filter((d) => /THRESHOLD|INTERVALS|30 MIN TEST/.test(PLAN[d].g || ""));
    if (w !== LAST_WEEK) assert.ok(hard.length >= 1, "a threshold or interval session in week of " + w);
  }
  assert.equal(PLAN["2026-11-11"].t, "Threshold 4 x 4 min");
  assert.equal(PLAN["2026-12-14"].t, "Z2 6 mi");
  assert.equal(PLAN["2026-12-18"].g, "SHAM // LONG 15 MI LAST 2 MP");
  assert.equal(PLAN["2027-03-12"].g, "SHAM // LONG 9 MI LAST 3 MP");
  assert.equal(PLAN["2027-02-26"].mi, 25, "the 25 stays");
  assert.ok(/STRIDES/.test(PLAN["2026-11-19"].g) && /hill/.test(PLAN["2026-11-19"].note), "Thursday hill strides");
  assert.ok(/STRIDES/.test(PLAN["2027-02-11"].g) && !/hill/.test(PLAN["2027-02-11"].note));
  assert.equal(familySrc("hills", "2026-11-16"), "hills-60");
  assert.equal(familySrc("hills", "2027-01-20"), "hills-90");
  assert.equal(resolve(setKind(defaultWeek(W2), "2026-11-16", W2, "hills")["2026-11-16"], "2026-11-16").title, "Hills 6 x 60 sec");
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
  const hills = { k: "plan", src: "hills-60" };
  assert.equal(amountSpec(hills, "2026-11-18").min, 4, "hills can only lose the cool-down");
  assert.equal(resolve({ ...hills, mi: 6 }, "2026-11-18").title, "Hills 6 x 60 sec · 6 mi");
  assert.equal(amountSpec(defaultWeek(LAST_WEEK)["2027-03-21"], "2027-03-21"), null, "race distance is fixed");
});
t("watch workouts", () => {
  assert.equal(garminWant({ k: "plan", src: "2026-11-13" }, "2026-11-13").name, "SHAM // LONG 11 MI");
  assert.equal(garminWant({ k: "plan", src: "2026-11-13", mi: 12.5 }, "2026-11-13").name, "SHAM // LONG 12.5 MI");
  const h = garminWant({ k: "plan", src: "hills-60", mi: 6 }, "2026-11-18");
  assert.equal(h.name, "SHAM // HILLS 6x60S @ 6 MI");
  assert.equal(h.def[2][2][2], 1.0 + 6 - resolve({ k: "plan", src: "hills-60" }, "2026-11-18").mi, "cool-down took the extra");
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
t("hours: every Garmin activity, plan length for tapped days without one", () => {
  const p = { tz: "America/New_York", weeks: { [W1]: { lockedAt: 1, days: defaultWeek(W1) } },
    log: { "2026-11-09": { done: true }, "2026-11-10": { done: true } },
    garmin: { days: { "2026-11-06": { r: 10, lr: 10, n: 1, t: 6000 }, "2026-11-11": { r: 5, lr: 5, n: 2, t: 2700 },
      "2026-11-12": { r: 0, lr: 0, n: 1, t: 1800 } } } };
  const s = season(p, { now: Date.parse("2026-11-12T18:00:00Z") });
  // 9 Nov Z2 3 mi tapped (30 min est), 10 Nov bike 45 tapped (45 min est),
  // 11 Nov Garmin 45 min, 12 Nov a 30 min Garmin walk. 6 Nov is before week 1.
  assert.equal(s.hours, 2.5);
  assert.equal(s.hoursEst, 1.3);
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
t("own reps on threshold and interval days", () => {
  const d0 = defaultWeek(W1), D = "2026-11-11";
  const c = repsOf(d0[D]);
  assert.deepEqual([c.fam, c.n, c.s, c.r, c.custom], ["thr", 4, 240, 120, false]);
  assert.equal(repsOf(d0["2026-11-12"]), null, "a Z2 day has no reps");
  assert.equal(repsOf({ k: "plan", src: "2026-11-25" }), null, "the 30 min test has no reps");
  // A 3 x 8 preset is the plan's own 3 x 8 workout, to the step.
  let d = setReps(d0, D, { n: 3, s: 480 });
  assert.deepEqual(d[D], { k: "plan", src: D, rn: 3, rs: 480, rr: 120 });
  let r = resolve(d[D], D);
  assert.equal(r.title, "Threshold 3 x 8 min");
  assert.equal(r.mi, PLAN["2026-12-30"].mi, "same miles estimate as the plan's 3 x 8");
  const g = garminWant(d[D], D);
  assert.equal(g.name, "SHAM // THRESHOLD 3x8MIN");
  assert.deepEqual(g.def[2], STEPS["SHAM // THRESHOLD 3x8MIN"][2]);
  assert.equal(g.custom, true);
  // Steppers, and a shorter jog
  assert.equal(repStep(d[D], "n", 1), 4);
  assert.equal(repStep(d[D], "s", 1), 600);
  assert.equal(repStep(d[D], "r", -1), 90);
  d = setReps(d, D, { r: 90 });
  r = resolve(d[D], D);
  assert.equal(r.title, "Threshold 3 x 8 min, 90 sec jog");
  assert.match(r.note, /HR 158-168 with 90 sec jog/);
  assert.equal(garminWant(d[D], D).name, "SHAM // THRESHOLD 3x8MIN 90S JOG");
  // Work cap: 45 min of threshold
  d = setReps(d, D, { n: 3, s: 900 });
  assert.equal(repsOf(d[D]).s, 900);
  assert.equal(repStep(d[D], "n", 1), null, "4 x 15 would pass 45 min");
  assert.equal(repStep(d[D], "s", 1), null);
  assert.equal(setReps(d, D, { n: 4 }), d, "over the cap does nothing");
  // Back to the plan's own reps clears the fields
  d = setReps(d, D, { n: 4, s: 240, r: 120 });
  assert.deepEqual(d[D], { k: "plan", src: D });
  // Miles on top of reps: the cool-down takes the change
  d = setReps(d0, D, { n: 5, s: 300 });
  const base = resolve(d[D], D).mi;
  d = setAmount(d, D, base + 1);
  const gm = garminWant(d[D], D);
  assert.equal(gm.name, `SHAM // THRESHOLD 5x5MIN @ ${base + 1} MI`);
  assert.equal(gm.def[2][2][2], 2, "cool-down 1 mi plus 1");
  assert.match(gm.def[1], /Reps and \d+ mi set in the Shamrock app\.$/);
  assert.equal(setReps(d, D, { n: 4 })[D].mi, undefined, "a reps change clears changed miles");
  // Jon's HR scaling still applies
  const jon = garminWant(setReps(d0, D, { n: 3, s: 480 })[D], D, 172);
  assert.equal(jon.def[2][1][2][0][3], Math.round(158 * 172 / 167));
  // Intervals, with a 30 min cap
  const I = "2026-12-02", d4 = setReps(defaultWeek(weekOf(I)), I, { n: 8, s: 120 });
  assert.equal(resolve(d4[I], I).title, "Intervals 8 x 2 min");
  assert.equal(garminWant(d4[I], I).name, "SHAM // INTERVALS 8x2MIN");
  assert.equal(repStep(setReps(defaultWeek(weekOf(I)), I, { n: 6, s: 300 })[I], "n", 1), null);
  // Switching the day to something else drops the reps
  assert.deepEqual(setKind(d, D, W1, "easy")[D], { k: "easy" });
  // A hard day borrowed from another week takes reps too
  const b = setReps(setKind(defaultWeek(W2), "2026-11-16", W2, "int"), "2026-11-16", { n: 6, s: 180 });
  assert.equal(resolve(b["2026-11-16"], "2026-11-16").title, "Intervals 6 x 3 min");
  assert.equal(countOf(b), countOf(defaultWeek(W2)));
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
  assert.equal(p.sec, Math.round(6050 * Math.pow(26.2 / 11, 1.06)), "Riegel from the 11 mi run");
  assert.equal(p.change, p.sec - Math.round(5700 * Math.pow(26.2 / 10, 1.06)));
  assert.equal(p.pace, 550);
  // Same pace, longer run: the estimate gets faster.
  assert.equal(hms(riegel(12 * 630, 12)), "4:48:18");
  assert.equal(hms(riegel(20 * 630, 20)), "4:39:36");
  assert.equal(riegel(14280, 26.2), 14280, "a full marathon predicts itself");
  const same = longRunProjection({ "2026-11-13": { lr: 12, ls: 7560 }, "2026-11-20": { lr: 16, ls: 10080 } }, "2026-11-22");
  assert.ok(same.change < 0, "16 mi at the same pace as 12 reads as faster");
});

console.log(`${n} checks passed`);
