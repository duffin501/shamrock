/* Nightly Garmin pull. Paste the whole file into a signed-in
 * https://connect.garmin.com tab (Claude in Chrome javascript tool). It returns
 * a short JSON string to hand to shamrockIngest() on the app tab.
 *
 * Reads the last 10 days for both people (Mary's own account, Jon through his
 * profile, the way the 75 Hard totals were pulled) plus each marathon race
 * prediction. Older days are already stored, and 10 days keeps the output small.
 * Endpoints are the ones Garmin Connect's own web app used in Nov 2026. */
(async () => {
  const JON = "b2cb0be6-a324-4594-879f-3169a43abde8";
  const START = "2026-11-02", END = "2027-03-21", WINDOW = 10;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  let since = iso(Date.now() - WINDOW * 86400000);
  if (since < START) since = START;
  // Days through yesterday (Eastern) count as checked even with no activity.
  const et = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const lastFull = iso(Date.parse(et + "T12:00:00Z") - 86400000);

  if (location.host !== "connect.garmin.com") return JSON.stringify({ error: "Garmin signed out (redirected to sign-in)" });
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
  const H = { Accept: "application/json", ...(csrf ? { "connect-csrf-token": csrf } : {}) };
  const j = async (u) => {
    const r = await fetch(u, { headers: H, credentials: "include" });
    if (!r.ok) throw new Error(u.split("?")[0].split("/").slice(-2).join("/") + " " + r.status);
    return r.json();
  };

  let me;
  try { me = (await j("/gc-api/userprofile-service/socialProfile")).displayName; }
  catch (e) { return JSON.stringify({ error: "Garmin signed out or profile failed: " + e.message }); }

  const notes = [];
  async function activities(who) {
    const list = [];
    for (let start = 0; start < 400; start += 100) {
      const url = who === "mary"
        ? `/gc-api/activitylist-service/activities/search/activities?startDate=${since}&start=${start}&limit=100`
        : `/gc-api/activitylist-service/activities/${JON}?start=${start}&limit=100`;
      const page = await j(url);
      const arr = Array.isArray(page) ? page : (page.activityList || []);
      list.push(...arr);
      const oldest = arr.length ? String(arr[arr.length - 1].startTimeLocal || "").slice(0, 10) : "";
      if (arr.length < 100 || oldest < since) break;
    }
    return list;
  }
  function summarize(list) {
    const days = {};
    for (let d = since; d <= lastFull; d = iso(Date.parse(d + "T12:00:00Z") + 86400000)) days[d] = [0, 0, 0];
    for (const a of list) {
      const d = String(a.startTimeLocal || "").slice(0, 10);
      if (!d || d < since || d > END) continue;
      const t = a.activityType?.typeKey || "";
      const mi = (a.distance || 0) / 1609.344;
      const x = days[d] || (days[d] = [0, 0, 0]);
      x[2]++;
      if (/running/.test(t)) { x[0] += mi; x[1] = Math.max(x[1], mi); }
    }
    for (const d in days) days[d] = [+days[d][0].toFixed(2), +days[d][1].toFixed(2), days[d][2]];
    return days;
  }
  async function marathon(name) {
    try {
      const p = await j(`/gc-api/metrics-service/metrics/racepredictions/latest/${name}`);
      const x = Array.isArray(p) ? p[p.length - 1] : p;
      return Math.round(x?.timeMarathon || x?.marathonTime || 0) || null;
    } catch (e) { notes.push("pred " + e.message); return null; }
  }

  const out = {};
  for (const [id, name] of [["mary", me], ["jon", JON]]) {
    try { out[id] = { days: summarize(await activities(id)), pred: await marathon(name) }; }
    catch (e) { notes.push(id + " " + e.message); }
  }
  out.note = notes.join("; ").slice(0, 200);
  return JSON.stringify(out);
})();
