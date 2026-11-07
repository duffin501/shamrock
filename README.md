# Shamrock '27

Mary and Jon's training tracker for the Shamrock Marathon, Sunday 21 March 2027.
Installs on a phone as an app. Free to run. Live at https://duffin501.github.io/shamrock/

## How a week works

Week 1 is the week of 9 Nov 2026; race week is week 19. The plan file starts a
week earlier, but nothing before 9 Nov is tracked.

- **Lock in next week on Sunday.** Lock-in is open all of Sunday, your own time, for
  the Monday to Sunday week ahead. The app opens on it, already filled in from the plan.
  - **Drag** a day by its grip onto another day and the two trade workouts.
  - **Tap** a day to change it (plan, easy run, alt cardio, rest) or its miles (runs)
    or minutes (bike, walk, alt). The long run can move and change distance (8 mi
    minimum) but never comes off the week. Race day stays put.
  - **Minus** drops a day in this order: stroller walk, bike and alt cardio, Z2 runs
    down to one (shortest first), hard days, then the last Z2. **Plus** brings them
    back in reverse.
  - A hard day (threshold, hills, intervals, marathon pace, the 30 min test) landing
    the day before or after the long run asks you to confirm.
  - "Below plan" shows under 4 workout days for Mary and under 3 for Jon (alt counts).
- **Miss the lock-in and the plan's week is your week** at midnight Sunday.
- **One swap a week** after that. Trade two days that haven't happened yet. Today
  counts as not happened until you log it.
- **Green or red.** Tap Done and the day goes green. A rest day goes green by itself.
  Forgot to tap? You have until noon the next day, and the Garmin sync also marks a
  day done when it finds the activity. After that an undone day is red for good.

## The numbers

Workouts done on the day, missed days, miles since 9 Nov, longest single run, long
runs done, and a marathon projection: the latest long run's average pace held for
26.2 miles, with the change since the long run before it. A week's long run is its
longest Garmin run if that was 8 miles or more.

Garmin's own race predictor isn't used: Mary's account can't read Jon's (Garmin
quietly returns hers instead).

Miles, longest run and long-run pace come from Garmin. Until a day has Garmin data, a
tapped run counts at its plan distance and the board says "part est."

## Garmin sync and the watch

Each person's computer runs a scheduled Claude task twice a day ([docs/sync_task.md](docs/sync_task.md)):
Mary at 0500 and 2130 Eastern, Jon at 0400 and 2000 Mountain ([docs/jon_setup.md](docs/jon_setup.md)).
It runs [tools/garmin_sync.js](tools/garmin_sync.js) on a signed-in Garmin Connect tab, which

- reads the last 10 days of activities into the app, and
- makes that person's Garmin calendar match the weeks they locked, so the right
  structured `SHAM //` workout is on the watch. The first time it sees a locked week it
  records what the calendar already had (the "base"), then moves those same workouts.
  That keeps each person's own versions, like Mary's 45 min bikes or Jon's HR-scaled runs.
  Rest, walk and alt cardio days are blank on the watch. A day with changed miles or
  minutes, or an easy run, gets an exact workout (built in Garmin if it doesn't exist,
  for example `SHAM // LONG 12.5 MI`; on hard days the easy cool-down takes the change).
  Old `STROLLER Z2` workouts are swapped for plain `Z2` ones. Only `SHAM //` workouts
  from today forward are ever touched.

Mary's run also reads Jon's activities as a backup. Garmin only lets each person
change their own calendar, so Jon's watch needs his own task.

## Files

| File | What it is |
|---|---|
| `plan.js` | The 20-week plan, one entry per day. Matches the Garmin calendar and the PDF. |
| `core.js` | All the rules: weeks, trimming, swaps, day status, season totals. No DOM. |
| `app.js` | Screens, Firebase, the Garmin ingest hook. |
| `tools/selftest.mjs` | `npm test` checks core.js. Run it after touching core or plan. |
| `tools/build-rules.mjs` | Builds the `/shamrock` branch of the Firebase rules. |
| `tools/garmin_sync.js` | Garmin activity pull plus watch-calendar sync, run by the scheduled task. |
| `docs/` | The scheduled-task prompt and Jon's setup page. |

## Firebase

Same project as 75 Hard (`hard-1599c`), so the same Google sign-ins work. Everything
lives under `/shamrock`. Publishing rules replaces the whole ruleset, so only ever
add or replace the `shamrock` key in the console; never paste over the rest, which
carries 75 Hard and the NAVS 302 form.

Local testing: run `_dev/serve.py 8737` and open `/_dev/index.html?scenario=week2&now=2026-11-12T09:00:00-05:00`.
`_dev/` is gitignored.
