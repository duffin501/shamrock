"""Printable calendar PDF of the Shamrock 2027 plan, read straight from plan.js
so it always matches the app. Usage, from the repo root:

    python tools/build_pdf.py <out.pdf>

Layout follows the 1 Nov 2026 original: a summary page, then one landscape
calendar page per month. Weeks are numbered as in the app (week 1 = 9 Nov)."""
import calendar
import datetime as dt
import json
import os
import subprocess
import sys

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1]
SEASON_START = dt.date(2026, 11, 9)
RACE = dt.date(2027, 3, 21)

js = ('import { PLAN } from "./plan.js";'
      'process.stdout.write(JSON.stringify(PLAN));')
PLAN = json.loads(subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT,
                                 capture_output=True, text=True, check=True).stdout)

W, H = landscape(letter)
M = 30
INK = HexColor("#1f2933")
MUTED = HexColor("#667085")
RULE = HexColor("#d0d5dd")
HEAD = HexColor("#14532d")
CAT = {
    "long": (HexColor("#14532d"), HexColor("#dcfce7")),
    "quality": (HexColor("#b42318"), HexColor("#fee4e2")),
    "easy": (HexColor("#1570ef"), HexColor("#e0f0ff")),
    "cross": (HexColor("#667085"), HexColor("#f2f4f7")),
    "race": (HexColor("#14532d"), HexColor("#14532d")),
}
KIND_CAT = {"easy": "easy", "quality": "quality", "long": "long", "race": "race", "bike": "cross", "walk": "cross"}
LEGEND = [("long", "Long run (solo)"), ("quality", "Threshold, intervals or test (solo)"), ("easy", "Zone 2 run"),
          ("cross", "Bike or stroller walk")]
BANDS = "HR targets:  Zone 2 125-143  |  Long 130-145  |  Marathon 145-155  |  Threshold 158-168  |  Bike 100-130"
PHASES = [(1, 7, "Base"), (8, 12, "Build"), (13, 16, "Peak"), (17, 19, "Taper")]

by_date = {}
for iso, p in PLAN.items():
    d = dt.date.fromisoformat(iso)
    if d < SEASON_START:
        continue
    wk = (d - SEASON_START).days // 7 + 1
    label = "SHAMROCK MARATHON" if p["k"] == "race" else p["t"]
    by_date[d] = {"wk": wk, "cat": KIND_CAT[p["k"]], "label": label, "sub": p.get("note", ""),
                  "mi": p.get("mi", 0) or 0, "raw": p}
wk_miles = {}
for x in by_date.values():
    wk_miles[x["wk"]] = wk_miles.get(x["wk"], 0) + x["mi"]
WEEKS = max(wk_miles)

c = canvas.Canvas(OUT, pagesize=(W, H))
c.setTitle("Shamrock Marathon 2027 Training Plan")
c.setAuthor("Mary Cole")


def phase_of(wk):
    return next(p for a, b, p in PHASES if a <= wk <= b)


def para(text, x, y, width, size=8, leading=None, color=INK, bold=False):
    st = ParagraphStyle("p", fontName="Helvetica-Bold" if bold else "Helvetica", fontSize=size,
                        leading=leading or size * 1.2, textColor=color, alignment=TA_LEFT)
    p = Paragraph(text, st)
    _, h = p.wrap(width, 1000)
    p.drawOn(c, x, y - h)
    return h


def legend(y):
    x = M
    c.setFont("Helvetica", 8)
    for k, label in LEGEND:
        c.setFillColor(CAT[k][1])
        c.setStrokeColor(CAT[k][0])
        c.setLineWidth(0.6)
        c.rect(x, y - 2, 11, 9, fill=1, stroke=1)
        c.setFillColor(INK)
        c.drawString(x + 15, y, label)
        x += 15 + c.stringWidth(label, "Helvetica", 8) + 16


def heading(text, x, y):
    c.setFillColor(HEAD)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x, y, text)


def page_one():
    c.setFillColor(HEAD)
    c.setFont("Helvetica-Bold", 21)
    c.drawString(M, H - 42, "Shamrock Marathon 2027")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 10.5)
    c.drawString(M, H - 58, f"Sub-4:00 plan for Mary Cole. Sunday, 21 March 2027, 7:30 AM, Virginia Beach. "
                            f"{WEEKS} weeks from 9 November 2026. Updated 7 November 2026.")

    col1 = 355
    y = H - 78
    heading("The week", M, y)
    rows = [["Mon", "Zone 2 run, solo"],
            ["Tue", "Easy bike, plus lift"],
            ["Wed", "Threshold or intervals, solo, every week"],
            ["Thu", "Zone 2 run, then 6 strides"],
            ["Fri", "Long run, solo. Some finish at marathon HR"],
            ["Sat", "Stroller walk, plus lift (upper body and core)"],
            ["Sun", "Zone 2 run, 9 mi max"]]
    t = Table(rows, colWidths=[32, col1 - 32], rowHeights=15)
    t.setStyle(TableStyle([("FONT", (0, 0), (0, -1), "Helvetica-Bold", 8.5), ("FONT", (1, 0), (1, -1), "Helvetica", 8.5),
                           ("TEXTCOLOR", (0, 0), (-1, -1), INK), ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
                           ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 2)]))
    _, th = t.wrap(col1, 200)
    t.drawOn(c, M, y - 6 - th)
    y2 = y - 6 - th - 18

    heading("Heart rate targets", M, y2)
    rows = [["Effort", "bpm", "Use"],
            ["Zone 2", "125-143", "Easy runs"],
            ["Long", "130-145", "Long runs. A slow fade near the top is fine"],
            ["Marathon", "145-155", "Race effort. Cap 155 until mile 20"],
            ["Threshold", "158-168", "Comfortably hard reps"],
            ["Intervals, strides", "effort", "Reps are too short for HR to catch up"],
            ["Bike", "100-130", "Recovery only"]]
    t = Table(rows, colWidths=[82, 50, col1 - 132], rowHeights=15)
    t.setStyle(TableStyle([("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5), ("FONT", (0, 1), (-1, -1), "Helvetica", 8.5),
                           ("TEXTCOLOR", (0, 0), (-1, -1), INK), ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
                           ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 2)]))
    _, th = t.wrap(col1, 200)
    t.drawOn(c, M, y2 - 6 - th)
    y3 = y2 - 6 - th - 16

    heading("Rules", M, y3)
    mp_longs = sorted(d for d, x in by_date.items() if x["cat"] == "long" and "marathon" in x["label"].lower())
    mp_txt = ", ".join(f"{d.day} {d:%b}" for d in mp_longs)
    rules = [
        "The Shamrock app is the live version. What you set there is what the watch gets.",
        "Garmin running zones match this plan: Z2 125-143, Z3 144-157, Z4 158-168, Z5 169+. "
        "TrainingPeaks and Strava use their own zones, so go by the bpm above.",
        "The 25 Nov and 27 Jan 30-minute tests set your real threshold. Garmin says 169, TrainingPeaks says 162, "
        "and this plan assumes 167. If your test differs by more than 3 bpm, shift every band by the difference.",
        f"Marathon pace is practiced inside the long runs: {mp_txt}.",
        "Thursday strides go up a gentle hill through December, then on the flat.",
        "Sick, in pain, or two bad nights of sleep in a row: swap the day for a stroller walk. Missed miles "
        "do not get made up.",
        "Stroller walks and lifting are not on the watch. Start your normal Walk or Strength activity. "
        "Lifting drops to Tuesday only from 2 March and stops race week.",
        "Long runs need a Friday block: about 3:20 for 20 mi, 3:40 for 22 mi and 4:15 for 25 mi.",
    ]
    yy = y3 - 6
    for r in rules:
        h = para("&bull;&nbsp; " + r, M, yy, col1, size=8.5, leading=10.6)
        yy -= h + 3

    x2 = M + col1 + 24
    wr = W - M - x2
    heading("Week by week", x2, H - 78)
    rows = [["Wk", "Starts", "Phase", "Wednesday", "Friday long", "Miles"]]
    styles = [("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7.6), ("FONT", (0, 1), (-1, -1), "Helvetica", 7.6),
              ("TEXTCOLOR", (0, 0), (-1, -1), INK), ("LINEBELOW", (0, 0), (-1, -1), 0.35, RULE),
              ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 2),
              ("RIGHTPADDING", (0, 0), (-1, -1), 2), ("ALIGN", (5, 0), (5, -1), "RIGHT"),
              ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]
    for w in range(1, WEEKS + 1):
        mon = SEASON_START + dt.timedelta(days=7 * (w - 1))
        qual = by_date[mon + dt.timedelta(days=2)]
        lng = by_date[mon + dt.timedelta(days=4)]
        if w < WEEKS:
            long_txt = lng["label"].replace("Long ", "").replace("marathon HR", "MP")
        else:
            long_txt = "Race Sun 21 Mar"
        rows.append([str(w), f"{mon:%d %b}", phase_of(w), qual["label"].replace("Marathon HR", "MP"), long_txt,
                     f"{wk_miles[w]:.0f}"])
        i = len(rows) - 1
        if lng["cat"] == "long" and lng["mi"] >= 20:
            styles.append(("BACKGROUND", (4, i), (4, i), CAT["long"][1]))
            styles.append(("FONT", (4, i), (4, i), "Helvetica-Bold", 7.6))
    t = Table(rows, colWidths=[17, 37, 30, 108, wr - 17 - 37 - 30 - 108 - 25, 25], rowHeights=[15] * len(rows))
    t.setStyle(TableStyle(styles))
    _, th = t.wrap(wr, 500)
    t.drawOn(c, x2, H - 84 - th)
    peak = max(v for k, v in wk_miles.items() if k < WEEKS)
    big = next(x for x in by_date.values() if x["cat"] == "long" and x["mi"] >= 25)
    note = (f"MP = marathon heart rate, 145-155. Miles include estimates for timed reps and strides. "
            f"The biggest week is about {peak:.0f} mi, and the {big['mi']:.0f}-mile week is about "
            f"{wk_miles[big['wk']]:.0f}.")
    para(note, x2, H - 84 - th - 6, wr, size=7.6, leading=9.4, color=MUTED)

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(M, 16, "Heart rate targets are estimates from your Strava, Garmin and TrainingPeaks data. "
                        "Confirm the race date on the official race site.")
    c.showPage()


def month_page(year, month):
    first = dt.date(year, month, 1)
    last = dt.date(year, month, calendar.monthrange(year, month)[1])
    start = first - dt.timedelta(days=first.weekday())
    weeks = []
    d = start
    while d <= last:
        if any((d + dt.timedelta(days=j)) in by_date for j in range(7)):
            weeks.append(d)
        d += dt.timedelta(days=7)

    c.setFillColor(HEAD)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(M, H - 38, first.strftime("%B %Y"))
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawRightString(W - M, H - 30, BANDS)
    legend(H - 50)

    total_w = W - 2 * M
    wk_col = 40
    day_w = (total_w - wk_col) / 7
    top = H - 62
    head_h = 14
    c.setFillColor(HEAD)
    c.rect(M, top - head_h, total_w, head_h, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 8.5)
    for i, n in enumerate(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]):
        c.drawCentredString(M + day_w * i + day_w / 2, top - head_h + 4, n)
    c.drawCentredString(M + day_w * 7 + wk_col / 2, top - head_h + 4, "Week")

    bottom = 28
    avail = top - head_h - bottom
    row_h = min(avail / len(weeks), 125)
    for r, w0 in enumerate(weeks):
        y_top = top - head_h - r * row_h
        for j in range(7):
            cur = w0 + dt.timedelta(days=j)
            x = M + j * day_w
            item = by_date.get(cur)
            c.setStrokeColor(RULE)
            c.setLineWidth(0.5)
            if item:
                edge, fill = CAT[item["cat"]]
                c.setFillColor(fill)
                c.rect(x, y_top - row_h, day_w, row_h, fill=1, stroke=1)
                c.setFillColor(edge)
                c.rect(x, y_top - row_h, 3.5, row_h, fill=1, stroke=0)
                is_race = item["cat"] == "race"
                c.setFillColor(white if is_race else (INK if cur.month == month else MUTED))
                c.setFont("Helvetica-Bold", 8.5)
                c.drawString(x + 7, y_top - 11, f"{cur.day}" if cur.month == month else f"{cur:%b} {cur.day}")
                txt_col = white if is_race else INK
                h = para(item["label"], x + 7, y_top - 15, day_w - 11, size=8.8, leading=10.2, color=txt_col, bold=True)
                if item["sub"]:
                    para(item["sub"], x + 7, y_top - 15 - h - 2, day_w - 11, size=7.8, leading=9.4, color=txt_col)
            else:
                c.setFillColor(white)
                c.rect(x, y_top - row_h, day_w, row_h, fill=1, stroke=1)
                c.setFillColor(MUTED)
                c.setFont("Helvetica", 8.5)
                c.drawString(x + 7, y_top - 11, str(cur.day))
        x = M + 7 * day_w
        c.setFillColor(HexColor("#f9fafb"))
        c.setStrokeColor(RULE)
        c.rect(x, y_top - row_h, wk_col, row_h, fill=1, stroke=1)
        wk_no = next((by_date[w0 + dt.timedelta(days=j)]["wk"] for j in range(7) if (w0 + dt.timedelta(days=j)) in by_date), None)
        if wk_no:
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 7.5)
            c.drawCentredString(x + wk_col / 2, y_top - 12, f"Wk {wk_no}")
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 12)
            c.drawCentredString(x + wk_col / 2, y_top - row_h / 2 - 5, f"{wk_miles[wk_no]:.0f}")
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 7)
            c.drawCentredString(x + wk_col / 2, y_top - row_h / 2 - 14, "miles")
    c.showPage()


page_one()
for y, m in [(2026, 11), (2026, 12), (2027, 1), (2027, 2), (2027, 3)]:
    month_page(y, m)
c.save()
print("wrote", OUT, f"({WEEKS} weeks)")
