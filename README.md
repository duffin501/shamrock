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
  - **Threshold and interval days** also open a reps panel: presets (4 x 4, 3 x 8,
    2 x 15 min and so on; 10 x 1 up to 4 x 5 min for intervals), then steppers for reps,
    rep length and jog. Warm-up and cool-down stay the plan's, and the miles estimate
    follows the reps. Work time is capped at 45 min of threshold or 30 min of intervals.
    The day stores them as `rn`, `rs` and `rr` (reps, rep seconds, jog seconds), only
    when they differ from the plan's own, and the watch gets a matching workout
    (`SHAM // THRESHOLD 4x8MIN 90S JOG`; with a 2 min jog the name is the plan's own).
  - **Minus** drops a day in this order: stroller walk, bike and alt cardio, Z2 runs
    down to one (shortest first), hard days, then the last Z2. **Plus** brings them
    back in reverse.
  - A hard day (threshold, hills, intervals, marathon pace, the 30 min test) landing
    the day before or after the long run asks you to confirm.
  - "Below plan" shows under 4 workout days for Mary and under 3 for Jon (alt counts).
- **One swap a week** after that. Trade two days that haven't happened yet. Today
  counts as not happened until you log it.
- **Season calendar** at the bottom of the Week tab, for whoever you're looking at:
  every week to race day as a row, like the PDF. Each day shows its planned workout
  in short form ("THR 4x4", "Z2 4 +S", "LR 15") with the PDF's colour on its edge
  (long green, hard red, Z2 blue, bike and walk grey). Once a day has passed it shows
  what was done (Garmin miles, else Garmin minutes, else "done" for a tap, or "miss")
  and turns green or red. The right column is planned miles, then actual miles for
  weeks that have started. Your own next week follows your edits live. Tap a day for
  the full workout, notes and what Garmin saw.
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

Workouts done on the day, missed days, miles since 9 Nov, hours logged, longest
single run, long runs done, and a marathon estimate from the latest long run, with
the change since the long run before it. A week's long run is its longest Garmin run
if that was 8 miles or more.

Hours are every Garmin activity since 9 Nov (runs, walks, bike, alt cardio, anything
on the watch), from the day's total activity time the sync stores as `t`. A day
tapped done with no Garmin time counts at its plan length (minutes for a bike, walk
or alt day, about 10 minutes a mile for a run) and the board says "part est."
Mary's sync stores Jon's time too, so Jon's older copy of the script doesn't matter;
the app writes Garmin days field by field so his runs never wipe it.

## Daily photo

The 75 Hard progress photo carries on (Mary, 7 Nov). The Today tab has today's photo
for both of you, with Add, Replace and Remove for your own. The Us tab has a photo
log, a week at a time (Earlier and Later), and a tap shows the full photo. Photos
live where 75 Hard kept them, `/pics/{person}/{date}` as `{ full, thumb }` (a ~900 px
JPEG and a 220 px thumb), so the log runs on from day 75 with no gap. 75 Hard's rules
already cover it: each person writes their own, both read. Nothing about a photo
turns a day green or red.

The estimate is Riegel's formula, the one most online race-time calculators use:
time x (26.2 / miles)^1.06. It counts the distance as well as the pace, so the same
10:30 pace reads 4:48 off a 12-miler and 4:40 off a 20-miler. Long runs are easy
effort, so the number runs slow next to race-day pace; it's for the trend and the
head-to-head. It works from the runs the sync already saved, with no extra Garmin
pull.

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
| `plan.js` | The plan, one entry per day from 2 Nov (the app counts from 9 Nov). Matches the Garmin calendar and the PDF. |
| `tools/build_pdf.py` | `python tools/build_pdf.py out.pdf` prints the plan calendar from plan.js. Rerun it after any plan change. |
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
