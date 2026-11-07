/* Nightly Garmin pull. Paste the whole file into a signed-in
 * https://connect.garmin.com tab (Claude in Chrome javascript tool). It returns
 * a short JSON string to hand to shamrockIngest() on the app tab.
 *
 * Reads the last 10 days for both people (Mary's own account, Jon through his
 * profile, the way the 75 Hard totals were pulled). Older days are already
 * stored, and 10 days keeps the output small. Each day is
 * [run miles, longest run miles, activity count, longest run seconds]; the app
 * turns the latest 8+ mile run's pace into the marathon projection.
 * Garmin's race predictor is not used: Mary's account can't read Jon's (it
 * silently returns hers), and she asked for long-run pace instead (7 Nov 2026).
 * Starts with a top-level await so the javascript tool waits for the result.
 * Endpoints are the ones Garmin Connect's own web app used in Nov 2026. */
await (async () => {
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

  try { await j("/gc-api/userprofile-service/socialProfile"); }
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
    for (let d = since; d <= lastFull; d = iso(Date.parse(d + "T12:00:00Z") + 86400000)) days[d] = [0, 0, 0, 0];
    for (const a of list) {
      const d = String(a.startTimeLocal || "").slice(0, 10);
      if (!d || d < since || d > END) continue;
      const t = a.activityType?.typeKey || "";
      const mi = (a.distance || 0) / 1609.344;
      const x = days[d] || (days[d] = [0, 0, 0, 0]);
      x[2]++;
      if (/running/.test(t)) {
        x[0] += mi;
        if (mi > x[1]) { x[1] = mi; x[3] = Math.round(a.duration || a.movingDuration || 0); }
      }
    }
    for (const d in days) days[d] = [+days[d][0].toFixed(2), +days[d][1].toFixed(2), days[d][2], days[d][3]];
    return days;
  }
  const out = {};
  for (const id of ["mary", "jon"]) {
    try { out[id] = { days: summarize(await activities(id)) }; }
    catch (e) { notes.push(id + " " + e.message); }
  }
  out.note = notes.join("; ").slice(0, 200);
  return JSON.stringify(out);
})();
