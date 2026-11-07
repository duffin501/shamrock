# Shamrock '27 Garmin sync: the scheduled-task prompt

This is the prompt each person's scheduled Claude task runs, twice a day, on
their own computer. Fill in the three blanks and paste the block below into the
task. Mary: `{PERSON}` = mary, `{SCRIPT}` = `C:\Users\colem\Agent_Workspace\shamrock\tools\garmin_sync.js`,
`{BROWSER}` = Browser 2. Jon: `{PERSON}` = jon, `{SCRIPT}` = wherever setup saved
`garmin_sync.js`, `{BROWSER}` = the Chrome window he uses for Garmin.

What one run does: reads the last 10 days of activities from that person's
Garmin into the app (miles, longest run, long-run pace), and makes their Garmin
calendar match the weeks they locked in the app, so the right structured
workout is on the watch. It only ever adds or removes `SHAM //` workouts from
today forward.

---

```text
You are running the Shamrock '27 Garmin sync for {PERSON}. The app is https://duffin501.github.io/shamrock/ , a training tracker {PERSON} shares for the Shamrock Marathon (21 March 2027). This run reads {PERSON}'s Garmin activities into the app and makes {PERSON}'s Garmin calendar match the weeks locked in the app.

If today is after 2027-03-22, do nothing and say the season is over.

Rules:
- Never sign in anywhere, never type a password, never click sign-out. A sign-in page means signed out.
- The only changes allowed are the ones the sync script makes (adding or removing "SHAM //" workouts on the Garmin calendar from today forward) and the shamrockIngest() calls below. Do not click anything in the app or in Garmin.
- Use Claude in Chrome. Load its tools in ONE ToolSearch call: select:mcp__claude-in-chrome__list_connected_browsers,mcp__claude-in-chrome__select_browser,mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool
- Close every tab you open before you finish.

1. Find Garmin. list_connected_browsers. Try "{BROWSER}" first, then any others. In each: select_browser, open a new tab to https://connect.garmin.com/modern/ , wait 4 seconds, run javascript `location.host`. "connect.garmin.com" means signed in: use this browser and keep this tab (the GARMIN tab). Anything else: close the tab and try the next browser. If none is signed in, remember GARMIN_OUT and use "{BROWSER}" for the next step.

2. Open the app in the same browser: new tab to https://duffin501.github.io/shamrock/ (the APP tab). Every 2 seconds for up to 20 seconds run `typeof window.shamrockReady === "function" && window.shamrockReady()` until it is true. Then run `window.shamrockWho()`; it must return "{PERSON}". If it never gets ready or returns someone else, try the other browser once; if that fails too, close your tabs and report "app not signed in as {PERSON}". Stop there.

3. If GARMIN_OUT: on the APP tab run `await window.shamrockIngest(JSON.stringify({ who: "{PERSON}", error: "Garmin signed out" }))`, close your tabs, and report in two lines that {PERSON} needs to sign in to Garmin Connect in Chrome once. Stop there.

4. On the APP tab run `window.shamrockSyncInput()`. It returns a JSON string: INPUT.

5. Read the file {SCRIPT}. On the GARMIN tab run javascript made of exactly two parts: first the line `window.SHAM_INPUT = <INPUT as a JavaScript string literal>;` then the file's full text unchanged. It returns a JSON string: RESULT. If the tool returns {} or an error, retry once after 5 seconds; if it still fails, use RESULT = JSON.stringify({ who: "{PERSON}", error: "sync script failed: <short reason>" }).

6. On the APP tab run `await window.shamrockIngest(<RESULT as a string literal>)`. It returns "ok ..." or "recorded failure".

7. If RESULT contained "again":true (a newly locked week was just recorded), wait 3 seconds and do steps 4 to 6 once more. The second pass makes the calendar changes.

8. Close the tabs you opened.

Report: on success one line only, for example "Shamrock sync ok: mary:10d jon:10d cal+2-3". If the result says missing:N, add one line naming the missing workouts (they need to exist in that Garmin account). Never include email addresses, cookies or tokens.
```
