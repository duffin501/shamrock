/* Shamrock '27: Mary and Jon's marathon block, side by side.
 *
 * Sunday evening each of you locks in next week: the plan arrives filled in,
 * you change what you need, you tap Lock. After that the week is fixed except
 * for one swap. Do the day's workout and it goes green; a rest day goes green
 * by itself; an undone day goes red at noon the next day and stays red.
 *
 * Miles, longest run and the marathon estimate come from Garmin, pulled each
 * night by a scheduled task on Mary's laptop (see README). When that hasn't
 * run, a tapped run counts at its plan distance so the board is never blank.
 *
 * Each person can only write their own side. The Firebase rules enforce that,
 * plus the lock itself: a locked week's days and its swap can't be rewritten. */

import { FIREBASE, PEOPLE } from "./config.js";
import {
  PLAN, RACE_DAY, BASE_LT, DOW, SEASON_START, TOTAL_WEEKS, FIRST_WEEK,
  addDays, diffDays, dowIdx, weekOf, weekDates, weekNo, inPlan, LAST_WEEK, clock, lockOpen,
  dayNum, shortDate, longDay, weekRange, fmtNum,
  resolve, scaleNote, isRest, countOf, defaultWeek, planCount, longSlot,
  stepDown, stepUp, kindOptions, setKind, moveDay, amountSpec, setAmount, hardNextToLong, garminWant,
  lockedDays, governing, needsAutoLock,
  canLog, isGreen, season, swapFirstChoices, swapSecondChoices,
  hms, paceStr, longRunProjection, easyMiles
} from "./core.js";

const SDK = "https://www.gstatic.com/firebasejs/11.10.0/";
const { initializeApp } = await import(SDK + "firebase-app.js");
const {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  onAuthStateChanged, setPersistence, browserLocalPersistence
} = await import(SDK + "firebase-auth.js");
const { getDatabase, ref, onValue, set, update, remove } = await import(SDK + "firebase-database.js");

const ROOT = "shamrock";
const DEV = !!window.__DEV__;
const Q = new URLSearchParams(location.search);
// Dev only: ?now=2026-11-08T19:00:00-05:00 pins the clock for testing.
const OFFSET = DEV && Q.get("now") ? Date.parse(Q.get("now")) - Date.now() : 0;
const now = () => Date.now() + OFFSET;

let auth, db;
const S = {
  phase: "boot",          // boot | signedout | loading | denied | ready
  user: null, me: null, data: {},
  tab: "today",
  seg: "this",            // week tab: this | next
  who: null,              // week tab: whose week
  drafts: {}, open: null, swap: null,
  sheet: null, err: null, online: true, prompted: false
};
let SEASON = {};
let drag = null;   // a planner day being dragged (see "drag and drop" below)

/* ===================== small helpers ===================== */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ids = () => PEOPLE.map((p) => p.id);
const other = (id = S.me) => ids().find((x) => x !== id);

function person(id) {
  const seed = PEOPLE.find((p) => p.id === id) || {};
  const live = S.data.people?.[id] || {};
  return {
    ...seed, ...live, id,
    tz: live.tz || seed.tz, lt: +live.lt || seed.lt || BASE_LT,
    weeks: S.data.weeks?.[id] || {}, log: S.data.log?.[id] || {},
    garmin: S.data.garmin?.[id] || null
  };
}
const nameOf = (id) => person(id).name || id;
/* Fewer workout days than this (alt cardio counts) is "below plan":
 * 4 for Mary, 3 for Jon (Mary, 7 Nov). */
const minDays = (id) => person(id).minDays || 4;
const below = (id, count) => count < minDays(id);

function compute() { for (const id of ids()) SEASON[id] = season(person(id), { now: now() }); }

function timeIn(tz, ms) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

function meta(r, lt) {
  if (r.rest) return "Rest";
  const amt = r.run ? `${r.est ? "~" : ""}${r.mi} mi` : `${r.min} min`;
  return amt;
}
const noteFor = (r, id) => scaleNote(r.note, r.kind, person(id).lt);

const STATUS_WORD = {
  done: "Done", rest: "Rest", miss: "Missed", today: "Today", grace: "Log by noon",
  future: "", "rest-future": "", before: ""
};

/* ===================== firebase ===================== */

function boot() {
  const app = initializeApp(FIREBASE);
  auth = getAuth(app);
  db = getDatabase(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  onAuthStateChanged(auth, (user) => {
    S.user = user;
    if (!user) { S.phase = "signedout"; S.me = null; return render(); }
    S.phase = "loading";
    subscribe();
    render();
  });
}

let unsub = [];
function subscribe() {
  unsub.forEach((u) => { try { u(); } catch {} });
  unsub = [
    onValue(ref(db, ROOT), (snap) => {
      S.data = snap.val() || {};
      settle();
    }, (err) => {
      S.phase = err?.code === "PERMISSION_DENIED" || /permission/i.test(err?.message || "") ? "denied" : "loading";
      if (S.phase !== "denied") S.err = `Could not load (${err?.code || err?.message}).`;
      render();
    }),
    onValue(ref(db, ".info/connected"), (snap) => { S.online = !!snap.val(); paintOnline(); })
  ];
}

/* Who you are comes from the database, never the bundle. If neither column
 * carries your address yet, the app tries to claim one and the rules decide
 * which, if either, you're allowed to have. */
let claiming = false;
async function settle() {
  const email = (S.user?.email || "").toLowerCase();
  const found = ids().find((id) => String(S.data.people?.[id]?.email || "").toLowerCase() === email);
  if (found) {
    S.me = found; S.phase = "ready";
    if (!S.who) S.who = found;
    compute();
    autoLock();
    sundayPrompt();
    return render();
  }
  if (claiming) return;
  claiming = true;
  for (const id of ids()) {
    if (S.data.people?.[id]?.email) continue;
    const seed = PEOPLE.find((p) => p.id === id);
    try {
      await set(ref(db, `${ROOT}/people/${id}`), { email, name: seed.name, tz: seed.tz, lt: seed.lt || BASE_LT });
      claiming = false;
      return;
    } catch { /* not this one */ }
  }
  claiming = false;
  S.phase = "denied";
  render();
}

async function signIn() {
  S.err = null; render();
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = e?.code || "";
    S.err = code === "auth/popup-blocked" ? "Your browser blocked the sign-in window. Allow popups for this site and try again."
      : code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" ? null
      : code === "auth/unauthorized-domain" ? `This address isn't on the Firebase allow list. Add ${location.hostname} under Authentication, Settings, Authorized domains.`
      : `Sign-in failed (${code || e.message}).`;
    render();
  }
}

function fail(e) {
  S.err = `That didn't save (${e?.code || e?.message || "unknown error"}).`;
  render();
  setTimeout(() => { S.err = null; render(); }, 6000);
}

/* ===================== writes ===================== */

/* A week that began without being locked becomes the plan's week, written
 * down so it can't drift if the plan file ever changes, and so the swap has a
 * record to attach to. Only ever your own weeks. */
const autoLocked = new Set();
function autoLock() {
  const p = person(S.me), s = SEASON[S.me];
  const ups = {};
  for (let w = FIRST_WEEK; w <= weekOf(s.today) && inPlan(w); w = addDays(w, 7)) {
    if (!needsAutoLock(p.weeks, w, s.today) || autoLocked.has(w)) continue;
    autoLocked.add(w);
    ups[`weeks/${S.me}/${w}`] = { days: defaultWeek(w), lockedAt: now(), auto: true, count: planCount(w) };
  }
  if (Object.keys(ups).length) update(ref(db, ROOT), ups).catch(fail);
}

async function lockWeek(w) {
  S.sheet = null; S.open = null;
  if (!lockOpen(clock(person(S.me).tz, now()), w)) {
    S.err = "Lock-in is closed. It opens Sunday for the week that starts Monday."; return render();
  }
  const days = draft(w);
  const ups = { [`weeks/${S.me}/${w}`]: { days, lockedAt: now(), count: countOf(days) } };
  try {
    await update(ref(db, ROOT), ups);
    try { localStorage.removeItem(draftKey(w)); } catch {}
    delete S.drafts[w];
  } catch (e) { fail(e); }
}

async function toggleDone(iso) {
  const s = SEASON[S.me];
  if (!canLog(iso, s.today, s.hour)) return;
  const cur = person(S.me).log[iso];
  const path = ref(db, `${ROOT}/log/${S.me}/${iso}`);
  try {
    if (cur?.done) await remove(path);
    else await set(path, iso === s.today ? { done: true, at: now() } : { done: true, at: now(), late: true });
  } catch (e) { fail(e); }
}

async function doSwap(w, a, b) {
  S.sheet = null; S.swap = null;
  try { await set(ref(db, `${ROOT}/weeks/${S.me}/${w}/swap`), { a, b, at: now() }); }
  catch (e) { fail(e); }
}

async function saveLt(v) {
  const n = Math.round(+v);
  if (!(n >= 140 && n <= 200)) { S.err = "Threshold HR should be between 140 and 200."; return render(); }
  S.sheet = null;
  try { await set(ref(db, `${ROOT}/people/${S.me}/lt`), n); } catch (e) { fail(e); }
}

/* The Garmin sync (tools/garmin_sync.js, run by a scheduled Claude task on
 * each person's computer; docs/sync_task.md) talks to the app through these.
 *
 * shamrockSyncInput(): what the Garmin side needs for the signed-in person:
 *   their local today, and each locked week from this week on, with the
 *   Garmin workout name for every plan day and the stored calendar base.
 * shamrockIngest(result): stores what came back. Days are
 *   [run miles, longest run, activity count, longest run seconds].
 *   You can only store your own result; Mary's also carries Jon's runs as a
 *   fallback. The Firebase rules enforce who writes what. */
window.shamrockSyncInput = () => {
  if (!S.me) throw new Error("not signed in");
  const p = person(S.me), s = SEASON[S.me];
  const cur = weekOf(s.today), weeks = [];
  for (const w of [cur, addDays(cur, 7)]) {
    if (!inPlan(w)) continue;
    const days = lockedDays(p.weeks[w]);
    if (!days) continue;
    const out = {};
    for (const d of weekDates(w)) {
      const a = days[d] || { k: "rest" };
      out[d] = a.k === "plan" ? { k: "plan", src: a.src, g: PLAN[a.src]?.g || "" } : { k: a.k };
      // want: a workout that must be exactly this (changed miles/minutes or an
      // easy run). def: how to build it if that Garmin account doesn't have it.
      const gw = garminWant(a, d, p.lt);
      if (gw?.custom) out[d].want = gw.name;
      if (gw) out[d].def = gw.def;
    }
    weeks.push({ w, days: out, easy: `SHAM // Z2 ${easyMiles(w)} MI`, base: p.garmin?.base?.[w] || null });
  }
  return JSON.stringify({ who: S.me, today: s.today, alsoJon: S.me === "mary", weeks });
};

window.shamrockIngest = async (payload) => {
  if (!S.me) throw new Error("not signed in");
  if (typeof payload === "string") payload = JSON.parse(payload);
  const who = payload?.who || S.me;
  if (who !== S.me) throw new Error(`signed in as ${S.me}, but this result is for ${who}`);
  const at = now(), ups = {}, out = [];
  if (payload?.error) {
    ups[`garmin/${who}/fail`] = { at, note: String(payload.error).slice(0, 200) };
    await update(ref(db, ROOT), ups);
    return "recorded failure";
  }
  for (const id of ids()) {
    const x = payload?.[id];
    if (!x || (id !== S.me && S.me !== "mary")) continue;
    let n = 0;
    for (const [d, v] of Object.entries(x.days || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Array.isArray(v)) continue;
      ups[`garmin/${id}/days/${d}`] = { r: +(+v[0] || 0).toFixed(2), lr: +(+v[1] || 0).toFixed(2), n: +v[2] || 0, ls: Math.round(+v[3] || 0) };
      n++;
    }
    ups[`garmin/${id}/at`] = at;
    out.push(`${id}:${n}d`);
  }
  ups[`garmin/${who}/fail`] = null;
  for (const [w, m] of Object.entries(payload?.base || {})) {
    ups[`garmin/${who}/base/${w}`] = Object.fromEntries(Object.entries(m).map(([d, v]) => [d, v || "-"]));
  }
  if (payload?.cal) {
    const c = payload.cal;
    ups[`garmin/${who}/cal`] = { at, added: +c.added || 0, removed: +c.removed || 0, failed: +c.failed || 0,
      missing: (c.missing || []).join(", ").slice(0, 300), through: String(c.through || "") };
  }
  if (payload?.note) ups[`garmin/${who}/note`] = String(payload.note).slice(0, 200);
  await update(ref(db, ROOT), ups);
  const c = payload?.cal;
  return "ok " + out.join(" ") + (c ? ` cal+${c.added || 0}-${c.removed || 0}${c.failed ? " failed" + c.failed : ""}${c.missing?.length ? " missing:" + c.missing.length : ""}` : "") + (payload?.again ? " again" : "");
};
window.shamrockReady = () => S.phase === "ready" && !!S.me;
window.shamrockWho = () => S.me;
window.shamrockState = () => JSON.stringify(Object.fromEntries(ids().map((id) => {
  const s = SEASON[id] || {};
  return [id, { today: s.today, workouts: s.workouts, due: s.due, misses: s.misses, miles: s.miles, longest: s.longest }];
})));

/* ===================== drafts ===================== */

const draftKey = (w) => `shamrock.draft.${S.me}.${w}`;
function draft(w) {
  if (!S.drafts[w]) {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(draftKey(w)) || "null"); } catch {}
    S.drafts[w] = d && Object.keys(d).length === 7 && weekDates(w).every((x) => d[x]) ? d : defaultWeek(w);
  }
  return S.drafts[w];
}
/* Every planner edit goes through here so a hard day landing next to the
 * long run always gets a confirm (Mary, 7 Nov). */
function change(w, next) {
  const prev = draft(w);
  if (next === prev) return;
  const before = hardNextToLong(prev), added = hardNextToLong(next).filter((d) => !before.includes(d));
  if (added.length) S.sheet = { kind: "near", w, d: added[0], prev };
  setDraft(w, next);
}

function setDraft(w, days) {
  S.drafts[w] = days;
  try { localStorage.setItem(draftKey(w), JSON.stringify(days)); } catch {}
  render();
}

/* The one week you can lock right now: next week, and only on Sunday (your
 * time). At midnight it closes and the plan's week takes over. */
function plannable(id = S.me) {
  const p = person(id), c = clock(p.tz, now());
  const next = addDays(weekOf(c.iso), 7);
  return lockOpen(c, next) && !p.weeks[next]?.lockedAt ? [next] : [];
}

function sundayPrompt() {
  if (S.prompted) return;
  const c = clock(person(S.me).tz, now());
  const next = addDays(weekOf(c.iso), 7);
  if (plannable().includes(next)) {
    S.tab = "week"; S.seg = "next"; S.who = S.me;
    S.prompted = true;
  }
}

/* ===================== render ===================== */

const root = document.getElementById("root");
let pending = false;

function render() {
  // Don't yank the keyboard away mid-typing when a sync lands.
  const ae = document.activeElement;
  if (drag || (ae && ae.tagName === "INPUT" && root.contains(ae))) { pending = true; return; }
  pending = false;
  if (S.phase === "ready") compute();
  root.innerHTML =
      S.phase === "signedout" ? screenSignedOut()
    : S.phase === "denied"    ? screenDenied()
    : S.phase === "ready"     ? screenApp()
    : screenLoading();
  paintOnline();
}

const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor">
<circle cx="16" cy="9.2" r="5.6"/><circle cx="9.4" cy="16.6" r="5.6"/><circle cx="22.6" cy="16.6" r="5.6"/>
<circle cx="16" cy="15" r="3.2"/><path d="M15 17.5h2.2l2.6 11.5h-2.4z"/></g></svg>`;

function screenLoading() {
  return `<main class="center"><div class="splash">${MARK}<p class="eyebrow">Loading</p>${S.err ? `<p class="err">${esc(S.err)}</p>` : ""}</div></main>`;
}

function screenSignedOut() {
  return `<main class="center"><div class="splash">
    ${MARK}
    <h1 class="disp">Shamrock <span>'27</span></h1>
    <p class="lede">Mary and Jon, 21 March 2027, Virginia Beach.</p>
    <button class="primary big" data-act="signin">Sign in with Google</button>
    ${S.err ? `<p class="err">${esc(S.err)}</p>` : ""}
  </div></main>`;
}

function screenDenied() {
  return `<main class="center"><div class="splash">
    ${MARK}
    <h1 class="disp">Not on the list</h1>
    <p class="lede">${esc(S.user?.email || "This account")} isn't one of the two accounts this app is for.</p>
    <button class="ghost" data-act="signout">Sign out</button>
  </div></main>`;
}

function screenApp() {
  const s = SEASON[S.me];
  const days = Math.max(0, diffDays(s.today, RACE_DAY));
  const w = weekOf(s.today);
  const wk = inPlan(w) ? `Wk ${weekNo(w)}` : s.today < SEASON_START ? "Starts 9 Nov" : "Done";
  const body = S.tab === "week" ? tabWeek() : S.tab === "us" ? tabUs() : tabToday();
  return `<div id="app">
    <header class="top">
      <div class="brand">${MARK}<span class="disp">Shamrock</span><span class="yr disp">'27</span></div>
      <div class="count mono">${s.today < SEASON_START ? "Week 1 starts 9 Nov" : `${esc(wk)}<span class="sep">/</span>${s.today <= RACE_DAY ? `${days} days` : "Finished"}`}</div>
      <span class="dot-online" title="Connection"></span>
    </header>
    ${lockBanner()}
    <main class="view">${body}</main>
    <nav class="nav">
      ${navBtn("today", "Today")}${navBtn("week", "Week")}${navBtn("us", "Us")}
    </nav>
    ${S.sheet ? sheet() : ""}
    ${S.err ? `<div class="toast" role="alert">${esc(S.err)}</div>` : ""}
  </div>`;
}

function navBtn(tab, label) {
  return `<button class="${S.tab === tab ? "on" : ""}" data-act="tab" data-tab="${tab}">${label}</button>`;
}

function lockBanner() {
  if (S.tab === "week" && S.seg === "next" && S.who === S.me) return "";
  const s = SEASON[S.me];
  const next = addDays(weekOf(s.today), 7);
  if (!plannable().includes(next)) return "";
  const urgent = s.hour >= 17;
  const msg = urgent ? `Lock in week ${weekNo(next)} before midnight` : `Lock-in is open: week ${weekNo(next)}`;
  return `<button class="banner ${urgent ? "urgent" : ""}" data-act="go-plan"><span>${esc(msg)}</span><span class="arrow">Lock in</span></button>`;
}

/* ---------- Today ---------- */

function tabToday() {
  const s = SEASON[S.me], p = person(S.me);
  const y = addDays(s.today, -1);
  const out = [];

  if (s.today > RACE_DAY) {
    out.push(`<section class="hero done-hero"><p class="eyebrow">Shamrock Marathon</p><h2 class="disp">Finished</h2>
      <p class="note">${TOTAL_WEEKS} weeks, ${SEASON[S.me].workouts} workouts, ${SEASON[S.me].miles} miles.</p></section>`);
    return out.join("");
  }

  if (s.status[y] === "grace") {
    const r = resolve(s.assign[y], y);
    out.push(`<section class="grace">
      <div><p class="eyebrow">Yesterday</p><p class="g-title">${esc(r.title)} isn't logged</p>
      <p class="g-sub">You have until noon. After that it stays red.</p></div>
      <button class="primary" data-act="done" data-d="${y}">Log it</button>
    </section>`);
  }

  out.push(hero());

  const w = weekOf(s.today);
  if (inPlan(w)) {
    out.push(`<section class="block"><div class="block-head"><p class="eyebrow">This week</p>
      <p class="eyebrow">${esc(weekRange(w))}</p></div>${strip(S.me, w)}</section>`);
  }
  out.push(partnerCard());
  return out.join("");
}

function hero() {
  const s = SEASON[S.me], p = person(S.me), d = s.today;
  const a = s.assign[d], st = s.status[d];

  if (st === "before" || !a) {
    const next = addDays(weekOf(d), 7);
    const open = plannable().includes(next);
    const lockedNext = p.weeks[next]?.lockedAt;
    const startTxt = `Week 1 starts ${longDay(SEASON_START)}.` + (lockedNext ? " You're locked in."
      : open ? " Lock-in is open today until midnight." : " Lock-in opens Sunday.");
    const cta = open ? `<button class="primary big" data-act="go-plan">Lock in week 1</button>` : "";
    const planToday = PLAN[d] ? `<p class="note">The plan has <b>${esc(PLAN[d].t)}</b> today if you want a head start.</p>` : "";
    return `<section class="hero"><p class="eyebrow">Today · ${esc(longDay(d))}</p>
      <h2 class="disp">Almost time</h2><p class="note">${esc(startTxt)}</p>${planToday}${cta}</section>`;
  }

  const r = resolve(a, d);
  const logged = p.log[d]?.done;
  let action;
  if (st === "rest") action = `<div class="state green"><b>Rest day.</b> Already green.</div>`;
  else if (st === "done" && logged) action = `<div class="state green"><b>Done.</b> Today is green.</div>
      <button class="link" data-act="done" data-d="${d}">Undo</button>`;
  else if (st === "done") action = `<div class="state green"><b>Garmin saw it.</b> Today is green.</div>`;
  else action = `<button class="primary huge" data-act="done" data-d="${d}">Mark done</button>`;

  return `<section class="hero k-${r.kind} ${r.long ? "is-long" : ""}">
    <p class="eyebrow">Today · ${esc(longDay(d))}${r.long ? ' · <span class="tag long">Long run</span>' : ""}</p>
    <h2 class="disp">${esc(r.title)}</h2>
    <p class="meta mono">${esc(meta(r))}</p>
    <p class="note">${esc(noteFor(r, S.me))}</p>
    ${action}
  </section>`;
}

function strip(id, w, opts = {}) {
  const s = SEASON[id];
  return `<div class="strip ${opts.small ? "small" : ""}">${weekDates(w).map((d, i) => {
    const a = s.assign[d], st = s.status[d], r = a ? resolve(a, d) : null;
    const late = st === "done" && person(id).log[d]?.late;
    return `<div class="cell st-${st} ${d === s.today ? "is-today" : ""} ${r?.long ? "is-long" : ""}" title="${esc(r ? r.title : "")}">
      <span class="cd">${DOW[i][0]}</span><span class="cn mono">${dayNum(d)}</span>
      ${opts.small ? "" : `<span class="cl mono">${esc(r ? cellLabel(r) : "")}</span>`}${late ? '<span class="late" title="Logged the next morning"></span>' : ""}
    </div>`;
  }).join("")}</div>`;
}

/* Six characters fit a phone-width cell. */
const cellLabel = (r) => r.race ? "RACE" : r.long ? `LR ${r.mi}` : r.kind === "bike" ? "BIKE" : r.short;

function partnerCard() {
  const id = other(), p = person(id), s = SEASON[id];
  const c = clock(p.tz, now());
  const a = s.assign[s.today], st = s.status[s.today];
  const r = a ? resolve(a, s.today) : null;
  const w = weekOf(s.today);
  const nextW = addDays(w, 7);
  const line = !p.email ? `${esc(p.name)} hasn't signed in yet.`
    : st === "before" ? (p.weeks[nextW]?.lockedAt ? `${esc(p.name)} is locked in for week 1.` : `${esc(p.name)} hasn't locked week 1 yet.`)
    : r ? `${esc(r.title)}${st === "done" || st === "rest" ? ' <span class="tag ok">Green</span>' : st === "today" ? ' <span class="tag">Not yet</span>' : ""}`
    : "Nothing today";
  return `<section class="block partner p-${id}">
    <div class="block-head"><p class="eyebrow who">${esc(p.name)} · ${esc(p.place || "")} · ${esc(timeIn(p.tz, now()).replace(/^\w+ /, ""))}</p></div>
    <p class="p-line">${line}</p>
    ${inPlan(w) ? strip(id, w) : ""}
  </section>`;
}

/* ---------- Week ---------- */

function tabWeek() {
  const id = S.who || S.me;
  const mine = id === S.me;
  const s = SEASON[id];
  const cur = weekOf(s.today), next = addDays(cur, 7);
  const w = S.seg === "next" ? next : cur;
  const head = `<div class="seg-row">
      <div class="seg">
        <button class="${S.seg === "this" ? "on" : ""}" data-act="seg" data-seg="this">This week</button>
        <button class="${S.seg === "next" ? "on" : ""}" data-act="seg" data-seg="next">Next week</button>
      </div>
      <div class="seg who">${ids().map((x) => `<button class="${id === x ? "on" : ""} p-${x}" data-act="who" data-who="${x}">${esc(nameOf(x))}</button>`).join("")}</div>
    </div>`;

  if (!inPlan(w)) {
    return head + `<section class="block"><p class="note">${w > LAST_WEEK ? "That's past race day." : "Week 1 starts 9 November. This week isn't tracked."}</p></section>`;
  }
  if (mine && plannable().includes(w)) return head + planner(w);
  return head + weekLocked(id, w, governing(person(id).weeks, w));
}

function weekLocked(id, w, g) {
  const s = SEASON[id], p = person(id), mine = id === S.me;
  const rec = p.weeks[w];
  const days = g.days;
  const statusOf = (d) => s.status[d];
  const count = countOf(days);
  let miles = 0;
  for (const d of weekDates(w)) { const r = resolve(days[d], d); if (r.run) miles += r.mi || 0; }
  const future = w > weekOf(s.today);

  const sw = S.swap && S.swap.w === w && mine ? S.swap : null;
  const firsts = sw ? swapFirstChoices(days, statusOf, s.today) : [];
  const seconds = sw?.first ? swapSecondChoices(days, statusOf, sw.first) : [];

  const rows = weekDates(w).map((d, i) => {
    const a = days[d], r = resolve(a, d), st = s.status[d];
    let act = "", cls = "";
    if (sw && !sw.first && firsts.includes(d)) { act = `data-act="swap-pick" data-d="${d}"`; cls = "target"; }
    if (sw && sw.first === d) { act = `data-act="swap-cancel-first"`; cls = "picked"; }
    if (sw && sw.first && seconds.includes(d)) { act = `data-act="swap-pick" data-d="${d}"`; cls = "target"; }
    const tag = STATUS_WORD[st] || "";
    const late = st === "done" && p.log[d]?.late ? " (late)" : "";
    return `<li><${act ? "button" : "div"} class="row st-${st} k-${r.kind} ${r.rest ? "is-rest" : ""} ${r.long ? "is-long" : ""} ${cls}" ${act}>
      <span class="dcol"><span class="dow">${DOW[i]}</span><span class="dn mono">${dayNum(d)}</span></span>
      <span class="mid"><span class="ttl">${esc(r.title)}</span><span class="sub">${esc(meta(r))}${r.rest ? "" : " · " + esc(noteFor(r, id))}</span></span>
      <span class="badge st-${st}">${esc(tag + late)}</span>
    </${act ? "button" : "div"}></li>`;
  }).join("");

  let swapUi = "";
  if (mine && w === weekOf(s.today) && rec?.lockedAt) {
    if (rec.swap) {
      swapUi = `<p class="note small">Swap used: ${DOW[dowIdx(rec.swap.a)]} ${dayNum(rec.swap.a)} traded with ${DOW[dowIdx(rec.swap.b)]} ${dayNum(rec.swap.b)}.</p>`;
    } else if (sw) {
      swapUi = `<div class="swap-bar"><span>${sw.first ? "Now tap the day to trade with." : "Tap the first day to swap."}</span>
        <button class="link" data-act="swap-off">Cancel</button></div>`;
    } else if (swapFirstChoices(days, statusOf, s.today).some((d) => swapSecondChoices(days, statusOf, d).length)) {
      swapUi = `<button class="ghost wide" data-act="swap-on">Use this week's swap</button>
        <p class="note small">One trade between two days that haven't happened yet. Today counts until you log it.</p>`;
    }
  }

  const who = mine ? "you" : esc(nameOf(id));
  const lockedTxt = g.locked
    ? (g.auto ? "Not locked in time, so the plan's week locked itself." : `Locked ${esc(timeIn(p.tz, rec.lockedAt))}.`)
    : future ? `Lock-in opens Sunday${mine ? "" : ` (${esc(nameOf(id))}'s time)`}. If it isn't locked by midnight Sunday, this plan week is the week.`
    : "Not locked in time, so the plan's week governs it.";
  return `<section class="block">
    <div class="block-head"><p class="eyebrow">Week ${weekNo(w)} · ${esc(weekRange(w))}</p>
    <p class="eyebrow">${count} workouts${below(id, count) ? ' · <span class="tag below">Below plan</span>' : ""}</p></div>
    <p class="note small">${lockedTxt} About ${Math.round(miles)} run miles.</p>
    ${sw ? swapUi : ""}
    <ol class="rows">${rows}</ol>
    ${sw ? "" : swapUi}
  </section>`;
}

function planner(w) {
  const days = draft(w), count = countOf(days), pc = planCount(w);
  const long = longSlot(days);
  let miles = 0;
  for (const d of weekDates(w)) { const r = resolve(days[d], d); if (r.run) miles += r.mi || 0; }
  const near = new Set(hardNextToLong(days));

  const rows = weekDates(w).map((d, i) => {
    const a = days[d], r = resolve(a, d), isLong = d === long, open = S.open === d;
    const chip = isLong ? (r.race ? "Race" : "Long run") : r.rest ? "Rest"
      : a.k === "easy" ? "Easy" : a.k === "alt" ? "Alt" : r.changed ? "Changed" : "Plan";
    const grip = r.race ? `<span class="grip off"></span>`
      : `<span class="grip" data-grip="${d}" data-w="${w}" aria-label="Drag ${DOW[i]} to another day">${GRIP}</span>`;
    return `<li class="prow ${open ? "open" : ""}" data-drop="${d}">
      <div class="row k-${r.kind} ${r.rest ? "is-rest" : ""} ${isLong ? "is-long" : ""} ${near.has(d) ? "is-near" : ""}">
        ${grip}
        <button class="rowmain" data-act="edit" data-d="${d}" data-w="${w}" aria-expanded="${open}">
          <span class="dcol"><span class="dow">${DOW[i]}</span><span class="dn mono">${dayNum(d)}</span></span>
          <span class="mid"><span class="ttl">${esc(r.title)}</span><span class="sub">${esc(meta(r))}${r.rest ? "" : " · " + esc(noteFor(r, S.me))}</span></span>
          <span class="chip c-${isLong ? "long" : r.changed && a.k === "plan" ? "changed" : a.k}">${chip}</span>
        </button>
      </div>
      ${open ? editor(days, d, w) : ""}
    </li>`;
  }).join("");

  const otherId = other(), op = person(otherId), orec = op.weeks[w];
  const partner = orec?.lockedAt ? `${esc(op.name)} locked ${countOf(orec.days)} workouts.`
    : `${esc(op.name)} hasn't locked week ${weekNo(w)} yet.`;
  const changed = JSON.stringify(days) !== JSON.stringify(defaultWeek(w));

  return `<section class="planner">
    <p class="eyebrow">Week ${weekNo(w)} of ${TOTAL_WEEKS} · ${esc(weekRange(w))}</p>
    <h2 class="disp">Lock in your week</h2>
    <div class="counter">
      <button class="step" data-act="down" data-w="${w}" ${count <= 1 ? "disabled" : ""} aria-label="One fewer workout">&minus;</button>
      <div class="num"><b class="mono">${count}</b><span>workouts</span></div>
      <button class="step" data-act="up" data-w="${w}" ${count >= 7 ? "disabled" : ""} aria-label="One more workout">+</button>
    </div>
    <p class="plan-note">Plan: ${pc}${below(S.me, count) ? ' · <span class="tag below">Below plan</span>' : ""} · About ${Math.round(miles)} run miles</p>
    <ol class="rows">${rows}</ol>
    <p class="hint">Drag ${GRIP_INLINE} to move a workout to another day. Tap a day to change it or its miles.${changed ? ` <button class="link" data-act="reset" data-w="${w}">Reset to plan</button>` : ""}</p>
    <button class="primary big" data-act="lock" data-w="${w}">Lock in week ${weekNo(w)}</button>
    <p class="note small center-t">${partner} Lock-in closes at midnight tonight; after that the plan's week is your week.</p>
  </section>`;
}

const GRIP = `<svg viewBox="0 0 12 18" width="12" height="18" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></g></svg>`;
const GRIP_INLINE = `<span class="grip-inline">${GRIP}</span>`;

/* The open day: what it is, and how far or how long. */
function editor(days, d, w) {
  const a = days[d], opts = kindOptions(days, d, w), spec = amountSpec(a, d);
  const isLong = d === longSlot(days);
  const kinds = opts.length ? `<div class="kinds">${opts.map((o) => {
    const on = o.k === a.k && (o.k !== "plan" || o.src === a.src);
    return `<button class="kbtn ${on ? "on" : ""}" data-act="kind" data-k="${o.k}" data-d="${d}" data-w="${w}">${o.k === "plan" ? "Plan" : esc(o.label)}</button>`;
  }).join("")}</div>` : "";
  const amt = spec ? `<div class="amt">
      <button class="step sm" data-act="amt" data-dir="-1" data-d="${d}" data-w="${w}" ${spec.value <= spec.min ? "disabled" : ""} aria-label="Less">&minus;</button>
      <b class="mono">${fmtNum(spec.value)} ${spec.unit}</b>
      <button class="step sm" data-act="amt" data-dir="1" data-d="${d}" data-w="${w}" ${spec.value >= spec.max ? "disabled" : ""} aria-label="More">+</button>
      ${spec.value !== spec.base ? `<button class="link" data-act="amt-reset" data-d="${d}" data-w="${w}">Plan: ${fmtNum(spec.base)} ${spec.unit}</button>` : ""}
    </div>` : "";
  const note = isLong ? `<p class="small">The long run can move and change distance (8 mi minimum). It can't come off the week.</p>`
    : resolve(a, d).race ? `<p class="small">Race day stays put.</p>` : "";
  return `<div class="editor">${kinds}${amt}${note}</div>`;
}

/* ---------- Us ---------- */

function tabUs() {
  const [a, b] = ids();
  const sa = SEASON[a], sb = SEASON[b];
  const pa = longRunProjection(person(a).garmin?.days, sa.today);
  const pb = longRunProjection(person(b).garmin?.days, sb.today);

  const cmp = (x, y, better) => better === "high" ? (x > y ? "a" : y > x ? "b" : "") : (x < y ? "a" : y < x ? "b" : "");
  const row = (label, va, vb, lead, sub) => `<div class="h2h-row">
      <div class="v ${lead === "a" ? "lead" : ""} p-${a}">${va}</div>
      <div class="lbl"><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>
      <div class="v ${lead === "b" ? "lead" : ""} p-${b}">${vb}</div>
    </div>`;
  const started = (s) => !!s.start;
  const n = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString();
  const predCell = (p) => p
    ? `${hms(p.sec)}<small>${paceStr(p.pace)}/mi</small><small>${(Math.round(p.mi * 10) / 10)} mi, ${esc(shortDate(p.d))}</small>${p.change ? `<small class="${p.change < 0 ? "up" : "down"}">${p.change < 0 ? "faster" : "slower"} ${shortDelta(p.change)}</small>` : ""}`
    : "<span class='dim'>no long run yet</span>";

  const rows = [
    row("Workouts", started(sa) ? `${sa.workouts}<small>of ${sa.due}</small>` : "–", started(sb) ? `${sb.workouts}<small>of ${sb.due}</small>` : "–", cmp(sa.workouts, sb.workouts, "high"), "done on the day"),
    row("Missed days", started(sa) ? sa.misses : "–", started(sb) ? sb.misses : "–", started(sa) && started(sb) ? cmp(sa.misses, sb.misses, "low") : "", "red days"),
    row("Miles", `${n(sa.miles)}${sa.milesEst ? "<small>part est.</small>" : ""}`, `${n(sb.miles)}${sb.milesEst ? "<small>part est.</small>" : ""}`, cmp(sa.miles, sb.miles, "high"), "since 9 Nov"),
    row("Longest run", `${n(sa.longest)}<small>mi</small>`, `${n(sb.longest)}<small>mi</small>`, cmp(sa.longest, sb.longest, "high"), "single run"),
    row("Long runs", started(sa) ? `${sa.longDone}<small>of ${sa.longDue}</small>` : "–", started(sb) ? `${sb.longDone}<small>of ${sb.longDue}</small>` : "–", cmp(sa.longDone, sb.longDone, "high"), "the non-negotiable"),
    row("Marathon pace", predCell(pa), predCell(pb), pa && pb ? cmp(pa.sec, pb.sec, "low") : "", "long run pace × 26.2")
  ].join("");

  const tz = person(S.me).tz;
  const garminLine = (id) => {
    const g = person(id).garmin || {}, nm = esc(nameOf(id));
    const at = g.at || (id === "mary" ? S.data.garmin?.meta?.at : 0) || 0;
    const fail = g.fail?.at && g.fail.at > at ? g.fail : null;
    const parts = [];
    if (fail) parts.push(`<span class="warn">last try ${esc(timeIn(tz, fail.at))} failed: ${esc(fail.note)}</span>`);
    parts.push(at ? `runs synced ${esc(timeIn(tz, at))}${now() - at > 36 * 3600000 ? ' <span class="warn">(over a day old)</span>' : ""}` : "runs not synced yet");
    if (g.cal?.at) {
      parts.push(`watch calendar ${esc(timeIn(tz, g.cal.at))}${g.cal.through ? ` through ${esc(shortDate(g.cal.through))}` : ""}`);
      if (g.cal.missing) parts.push(`<span class="warn">missing on Garmin: ${esc(g.cal.missing.replace(/SHAM \/\/ /g, ""))}</span>`);
      if (g.cal.failed) parts.push(`<span class="warn">${g.cal.failed} calendar change(s) failed</span>`);
    } else {
      parts.push(id === "jon" ? "watch calendar not linked yet" : "watch calendar not synced yet");
    }
    return `<li><b class="p-${id}">${nm}</b> ${parts.join(" · ")}</li>`;
  };

  const me = person(S.me);

  return `<section class="block h2h">
      <div class="h2h-head"><span class="p-${a}">${esc(nameOf(a))}</span><span></span><span class="p-${b}">${esc(nameOf(b))}</span></div>
      ${rows}
      <ul class="gsync">${ids().map(garminLine).join("")}</ul>
    </section>
    <section class="block">
      <div class="block-head"><p class="eyebrow">The season</p><p class="eyebrow legend"><i class="lg done"></i>green <i class="lg miss"></i>red</p></div>
      ${seasonGrid()}
    </section>
    <section class="block settings">
      <p class="eyebrow">Your settings</p>
      <div class="set-row"><span>Threshold HR <b class="mono">${me.lt}</b><small>Run HR bands scale from this. The plan assumes 167.</small></span><button class="ghost" data-act="sheet" data-sheet="lt">Edit</button></div>
      <div class="set-row"><span>Signed in as <b>${esc(S.user?.email || "")}</b></span><button class="ghost" data-act="signout">Sign out</button></div>
    </section>`;
}

function shortDelta(sec) {
  sec = Math.abs(Math.round(sec));
  return sec >= 3600 ? hms(sec) : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function seasonGrid() {
  const [a, b] = ids();
  const maxToday = SEASON[a].today > SEASON[b].today ? SEASON[a].today : SEASON[b].today;
  const lastShown = addDays(weekOf(maxToday), 7);
  const rows = [];
  for (let w = "2026-11-02"; w <= LAST_WEEK && w <= lastShown; w = addDays(w, 7)) {
    const cells = (id) => weekDates(w).map((d) => `<i class="sq st-${SEASON[id].status[d]}"></i>`).join("");
    rows.push(`<div class="sg-row ${w === weekOf(SEASON[S.me].today) ? "now" : ""}"><span class="mono wk">${weekNo(w)}</span><span class="sqs">${cells(a)}</span><span class="sqs">${cells(b)}</span></div>`);
  }
  return `<div class="sg"><div class="sg-row head"><span></span><span class="p-${a}">${esc(nameOf(a))}</span><span class="p-${b}">${esc(nameOf(b))}</span></div>${rows.reverse().join("")}</div>`;
}

/* ---------- sheets ---------- */

function sheet() {
  const x = S.sheet;
  let inner = "";
  if (x.kind === "lock") {
    const days = draft(x.w), long = longSlot(days);
    const lr = long ? resolve(days[long], long) : null;
    const count = countOf(days);
    inner = `<h3 class="disp">Lock in week ${weekNo(x.w)}?</h3>
      <p>${count} workouts${below(S.me, count) ? `, under your ${minDays(S.me)}-day minimum` : ""}. ${lr ? `${esc(lr.title)} on ${DOW[dowIdx(long)]}.` : ""}</p>
      <p class="small">After this you get one swap and nothing else. Each day you don't finish turns red. Your watch calendar follows at the next Garmin sync (0500 or 2130); rest and alt cardio days are blank on the watch.</p>
      <button class="primary big" data-act="lock-yes" data-w="${x.w}">Lock it in</button>
      <button class="ghost wide" data-act="close">Not yet</button>`;
  } else if (x.kind === "swap") {
    const id = S.me, days = governing(person(id).weeks, x.w).days;
    const ra = resolve(days[x.a], x.a), rb = resolve(days[x.b], x.b);
    inner = `<h3 class="disp">Use your swap?</h3>
      <p>${DOW[dowIdx(x.a)]} becomes <b>${esc(rb.title)}</b>. ${DOW[dowIdx(x.b)]} becomes <b>${esc(ra.title)}</b>.</p>
      <p class="small">That's the only swap this week.</p>
      <button class="primary big" data-act="swap-yes">Swap them</button>
      <button class="ghost wide" data-act="close">Cancel</button>`;
  } else if (x.kind === "near") {
    const days = draft(x.w), L = longSlot(days);
    const h = resolve(days[x.d], x.d), lr = resolve(days[L], L);
    const when = x.d < L ? "the day before" : "the day after";
    inner = `<h3 class="disp">Hard day next to your long run?</h3>
      <p><b>${esc(h.title)}</b> on ${DOW[dowIdx(x.d)]} is ${when} your <b>${esc(lr.title)}</b> on ${DOW[dowIdx(L)]}.</p>
      <p class="small">Back-to-back hard days are where injuries come from. Keep it only if you mean it.</p>
      <button class="primary big" data-act="near-keep">Keep it there</button>
      <button class="ghost wide" data-act="near-undo">Undo</button>`;
  } else if (x.kind === "lt") {
    inner = `<h3 class="disp">Threshold HR</h3>
      <p class="small">From your 30 minute test: the average HR of the last 20 minutes. Run bands in the app scale from it.</p>
      <form data-form="lt"><input name="v" type="number" inputmode="numeric" min="140" max="200" value="${person(S.me).lt}" class="field mono" autocomplete="off">
      <button class="primary big" type="submit">Save</button></form>
      <button class="ghost wide" data-act="close">Cancel</button>`;
  }
  return `<div class="scrim" data-act="close-scrim"><div class="sheet" role="dialog" aria-modal="true">${inner}</div></div>`;
}

function paintOnline() {
  const el = document.querySelector(".dot-online");
  if (el) el.classList.toggle("off", !S.online);
}

/* ===================== events ===================== */

root.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const act = el.dataset.act, d = el.dataset.d, w = el.dataset.w;
  switch (act) {
    case "signin": return signIn();
    case "signout": S.sheet = null; return signOut(auth);
    case "tab": S.tab = el.dataset.tab; S.swap = null; S.open = null; window.scrollTo(0, 0); return render();
    case "seg": S.seg = el.dataset.seg; S.swap = null; S.open = null; return render();
    case "who": S.who = el.dataset.who; S.swap = null; S.open = null; return render();
    case "go-plan": {
      const pl = plannable();
      S.tab = "week"; S.who = S.me;
      S.seg = "next";
      window.scrollTo(0, 0);
      return render();
    }
    case "done": return toggleDone(d);
    case "down": return change(w, stepDown(draft(w)));
    case "up": return change(w, stepUp(draft(w), w));
    case "edit": S.open = S.open === d ? null : d; return render();
    case "kind": return change(w, setKind(draft(w), d, w, el.dataset.k));
    case "amt": {
      const spec = amountSpec(draft(w)[d], d);
      return spec ? change(w, setAmount(draft(w), d, spec.value + spec.step * +el.dataset.dir)) : undefined;
    }
    case "amt-reset": { const spec = amountSpec(draft(w)[d], d); return spec ? change(w, setAmount(draft(w), d, spec.base)) : undefined; }
    case "near-keep": S.sheet = null; return render();
    case "near-undo": { const x = S.sheet; S.sheet = null; return setDraft(x.w, x.prev); }
    case "reset": S.open = null; return setDraft(w, defaultWeek(w));
    case "lock": S.sheet = { kind: "lock", w }; return render();
    case "lock-yes": return lockWeek(w);
    case "swap-on": S.swap = { w: weekOf(SEASON[S.me].today), first: null }; return render();
    case "swap-off": S.swap = null; return render();
    case "swap-cancel-first": S.swap.first = null; return render();
    case "swap-pick":
      if (!S.swap.first) { S.swap.first = d; return render(); }
      S.sheet = { kind: "swap", w: S.swap.w, a: S.swap.first, b: d };
      return render();
    case "swap-yes": return doSwap(S.sheet.w, S.sheet.a, S.sheet.b);
    case "sheet": S.sheet = { kind: el.dataset.sheet }; render(); setTimeout(() => root.querySelector(".sheet input")?.focus(), 30); return;
    case "close": S.sheet = null; S.err = null; return render();
    case "close-scrim": if (e.target === el) { S.sheet = null; render(); } return;
  }
});

/* ---------- drag and drop (planner) ----------
 * Grab a day by its grip and drop it on another day: the two trade
 * workouts. Pointer events, so it works with a finger on a phone; the grip
 * has touch-action: none so the page doesn't scroll instead. */
root.addEventListener("pointerdown", (e) => {
  const g = e.target.closest("[data-grip]");
  if (!g || drag) return;
  e.preventDefault();
  const li = g.closest(".prow"), box = li.getBoundingClientRect();
  const ghost = li.cloneNode(true);
  ghost.classList.add("ghost-row");
  Object.assign(ghost.style, { left: box.left + "px", top: box.top + "px", width: box.width + "px" });
  document.body.appendChild(ghost);
  li.classList.add("dragging");
  try { g.setPointerCapture(e.pointerId); } catch {}
  drag = { from: g.dataset.grip, w: g.dataset.w, li, ghost, dy: e.clientY - box.top, over: null, y: e.clientY, raf: 0 };
  const tick = () => {
    if (!drag) return;
    // Scroll when the finger nears the top or bottom edge.
    if (drag.y < 90) window.scrollBy(0, -10);
    else if (drag.y > window.innerHeight - 110) window.scrollBy(0, 10);
    drag.raf = requestAnimationFrame(tick);
  };
  drag.raf = requestAnimationFrame(tick);
});
root.addEventListener("pointermove", (e) => {
  if (!drag) return;
  e.preventDefault();
  drag.y = e.clientY;
  drag.ghost.style.top = (e.clientY - drag.dy) + "px";
  const under = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-drop]");
  const to = under && under !== drag.li ? under.dataset.drop : null;
  if (to !== drag.over) {
    root.querySelectorAll(".prow.drop-here").forEach((x) => x.classList.remove("drop-here"));
    if (to) under.classList.add("drop-here");
    drag.over = to;
  }
});
function endDrag(apply) {
  if (!drag) return;
  const { from, w, over, ghost, raf } = drag;
  cancelAnimationFrame(raf);
  ghost.remove();
  drag = null;
  S.open = null;
  if (apply && over && over !== from) change(w, moveDay(draft(w), from, over));
  else render();
}
root.addEventListener("pointerup", () => endDrag(true));
root.addEventListener("pointercancel", () => endDrag(false));

root.addEventListener("submit", (e) => {
  const f = e.target.closest("form[data-form]");
  if (!f) return;
  e.preventDefault();
  const v = f.querySelector("input")?.value;
  document.activeElement?.blur();
  if (f.dataset.form === "lt") saveLt(v);
});
root.addEventListener("focusout", () => { if (pending) setTimeout(() => { if (pending) render(); }, 0); });

// Day rollover, noon, and the Sunday prompt all happen on the clock, not on
// data, so repaint each minute.
setInterval(() => { if (S.phase === "ready") { sundayPrompt(); render(); } }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.phase === "ready") { autoLock(); render(); } });

if ("serviceWorker" in navigator && !DEV) navigator.serviceWorker.register("sw.js").catch(() => {});

render();
boot();
