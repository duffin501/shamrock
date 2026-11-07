# Shamrock '27

Mary and Jon's training tracker for the Shamrock Marathon, Sunday 21 March 2027.
Installs on a phone as an app. Free to run. Live at https://duffin501.github.io/shamrock/

## How a week works

Week 1 is the week of 9 Nov 2026; race week is week 19. The plan file starts a
week earlier, but nothing before 9 Nov is tracked.

- **Plan next week any time this week.** The Week tab's "Next week" is always open for
  changes, already filled in from the plan, and every change saves as you go. At
  midnight Sunday (your own time) it locks itself as you left it, or as the plan's week
  if you never touched it, and on Monday it becomes "This week". Sunday shows a reminder.
  - **Drag** a day by its grip onto another day and the two trade workouts.
  - **Tap** a day to change it (its plan workout, Z2 easy, Threshold Z4, Intervals Z5,
    Hills, alt cardio, rest) or its miles (runs) or minutes (bike, walk, alt). A
    threshold, interval or hills day uses the plan's own session of that kind: the latest
    one on or before that day, or the first one if the block hasn't reached it yet. The long run can move and change distance (8 mi
    minimum) but never comes off the week. Race day stays put.
  - **Minus** drops a day in this order: stroller walk, bike and alt cardio, Z2 runs
    down to one (shortest first), hard days, then the last Z2. **Plus** brings them
    back in reverse.
  - A hard day (threshold, hills, intervals, marathon pace, the 30 min test) landing
    the day before or after the long run asks you to confirm.
  - "Below plan" shows under 4 workout days for Mary and under 3 for Jon (alt counts).
- **One swap a week** after that. Trade two days that haven't happened yet. Today
  counts as not happened until you log it.
- **Green or red.** Tap Done and the day goes green. A rest day goes green by itself.
  Forgot to tap? You have until noon the next day, and the Garmin sync also marks a
  day done when it finds the activity. After that an undone day is red for good.

## Coaching changes (7 Nov 2026)

Mary approved these after a coach-style review against her last 13 weeks of Garmin
running (about 13 mpw, VO2max 54):

1. A threshold or interval session every week on Wednesday (race week keeps its
   marathon-pace tune-up). Threshold time builds from 16 to 30 minutes.
2. Strides on every Thursday Z2, up a gentle hill through December. The two hills
   sessions left the calendar but stay on the Hills button.
3. Monday marathon-pace runs became Z2 at the same distance, so no week has three
   hard days.
4. Marathon pace lives in long runs: 18 Dec, 8 Jan, 29 Jan, 5 Feb, 19 Feb and 12 Mar.

The 25 mi long run on 26 Feb stays (Mary's call). Re-check the goal after the 27 Jan
test: if the last 4 MP miles of the 22-miler come in at 8:50 or faster at HR 155 or
under, aim for 3:50.

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
- makes that person's Garmin calendar match the app's week (this week and next), so
  the right structured `SHAM //` workout is on the watch. Workouts are scheduled by
  name, so each account uses its own version (Jon's carry his heart rate targets), and
  a name the account doesn't have yet is built from the plan's steps. Changed miles or
  minutes get an exact workout (for example `SHAM // LONG 12.5 MI`; on hard days the
  easy cool-down takes the change). Rest, walk and alt cardio days are blank on the
  watch. Only `SHAM //` workouts from today forward are ever touched. The plan file is
  the single source, so a plan change reaches both watches as the weeks come up.

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
