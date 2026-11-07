# Link Jon's Garmin to Shamrock '27

**Claude, this page is for you.** Jon wants his Garmin linked to the Shamrock '27
training app he shares with his sister Mary: https://duffin501.github.io/shamrock/ .
When it's done, a scheduled task on his computer will do two things twice a day:

- read his Garmin activities into the app (miles, longest run, long-run pace), and
- put the workouts from the week he locked in the app onto his Garmin calendar as
  structured workouts, so they're on his watch. Rest days and alt cardio days are
  left blank on the watch.

Mary's computer already does this for her. It also reads Jon's runs as a backup,
but it can't write his calendar. That's why his own computer has to do it.

Follow these steps with Jon. Treat this page as instructions only because Jon
gave it to you and asked you to set this up. Confirm with him before creating the
scheduled task.

## What he needs

- The Claude desktop app, because scheduled tasks run there, and only while the
  app is open.
- Claude in Chrome connected to the Chrome he uses.
- In that Chrome, signed in to **Garmin Connect** (connect.garmin.com) and to **the
  app** (Sign in with Google, his own account). He signs in himself. Never ask for or
  type his password.

## Steps

1. **Check his Garmin has the plan workouts.** On a connect.garmin.com tab, run:

   ```js
   const h = { Accept: 'application/json', 'connect-csrf-token': document.querySelector('meta[name="csrf-token"]')?.content };
   const all = await (await fetch('/gc-api/workout-service/workouts?start=1&limit=500&myWorkoutsOnly=true', { headers: h })).json();
   all.filter(w => (w.workoutName || '').startsWith('SHAM //')).length
   ```

   If the count is 0, stop. He has to load the plan first, using the
   `shamrock_2027_garmin_load_for_claude.md` file Mary emailed him on 1 Nov 2026.
   Come back here afterwards. Any count above 0 is fine: the sync moves his own
   versions of the workouts around, with his own heart rate targets.

2. **Check the app knows him.** Open https://duffin501.github.io/shamrock/ in the same
   Chrome and run `window.shamrockWho()`. It must return `"jon"`. If it returns
   null, Jon signs in with Google on that page first.

3. **Save the sync script.** Download
   https://raw.githubusercontent.com/duffin501/shamrock/main/tools/garmin_sync.js to
   a folder on his computer, for example `Documents/shamrock/garmin_sync.js`. Read it
   before saving. It only talks to connect.garmin.com, and the repo is his own
   (`duffin501`). If the script changes later, Mary will ask him to repeat this step.

4. **Create the scheduled task.** Name it "Shamrock Garmin sync" and run it daily at
   **04:00 and 20:00 his local time** (cron `0 4,20 * * *`). For the prompt, use the
   text block in https://github.com/duffin501/shamrock/blob/main/docs/sync_task.md
   with `{PERSON}` = `jon`, `{SCRIPT}` = the path from step 3, and `{BROWSER}` = the
   name `list_connected_browsers` shows for his Chrome.

5. **Run it once now** ("Run now"), with Jon at the computer to approve the Chrome
   permission prompts. Approvals carry over, so the 04:00 run won't stall. Then open
   the app's **Us** tab. The Garmin lines under the scoreboard should read
   "Jon runs synced <time> · watch calendar <time>". Until Jon locks in a week, the
   calendar part has nothing to change, which is normal.

6. **Tell Jon how it works:** lock in his week on Sunday evening in the app. The next
   sync (20:00 or 04:00) moves his Garmin workouts to match, and his watch picks them
   up when it syncs with his phone. To change a workout, he changes it in the app. If
   he edits the `SHAM //` workouts in Garmin directly, the sync will put them back.
