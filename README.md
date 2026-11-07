# Shamrock '27

Mary and Jon's training tracker for the Shamrock Marathon, Sunday 21 March 2027.
Installs on a phone as an app. Free to run. Live at https://duffin501.github.io/shamrock/

## How a week works

- **Sunday evening, lock in next week.** From 5 PM Sunday (your own time) the app
  opens on next week, already filled in from the plan. Tap minus to drop a workout
  (stroller walk goes first, then easy runs, shortest first, then the bike, never the
  long run). Tap any day to cycle it: plan, easy run, alt cardio, rest. Tap the long
  run to move it to another day. Then Lock.
- **Miss the lock-in and the full plan locks for you** when the week starts.
- **One swap a week.** Trade two days that haven't happened yet. Today counts as not
  happened until you log it.
- **Green or red.** Tap Done and the day goes green. A rest day goes green by itself.
  Forgot to tap? You have until noon the next day, and the nightly Garmin pull also
  marks a day done when it finds the activity. After that an undone day is red for good.

## The numbers

Workouts done on the day, missed days, miles since 2 Nov, longest single run, long
runs done, and Garmin's marathon race predictor with the change over the last week.

Miles, longest run and the predictor come from Garmin. A scheduled Claude task on
Mary's laptop reads both Garmin accounts each morning and calls `shamrockIngest()` on
this page while she is signed in. Until a day has Garmin data, a tapped run counts at
its plan distance and the board says "part est."

## Files

| File | What it is |
|---|---|
| `plan.js` | The 20-week plan, one entry per day. Matches the Garmin calendar and the PDF. |
| `core.js` | All the rules: weeks, trimming, swaps, day status, season totals. No DOM. |
| `app.js` | Screens, Firebase, the Garmin ingest hook. |
| `tools/selftest.mjs` | `npm test` checks core.js. Run it after touching core or plan. |
| `tools/build-rules.mjs` | Builds the `/shamrock` branch of the Firebase rules. |

## Firebase

Same project as 75 Hard (`hard-1599c`), so the same Google sign-ins work. Everything
lives under `/shamrock`. Publishing rules replaces the whole ruleset, so only ever
add or replace the `shamrock` key in the console; never paste over the rest, which
carries 75 Hard and the NAVS 302 form.

Local testing: run `_dev/serve.py 8737` and open `/_dev/index.html?scenario=week2&now=2026-11-12T09:00:00-05:00`.
`_dev/` is gitignored.
