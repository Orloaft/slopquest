#!/usr/bin/env python3
"""Waystone terrain read (v2, HUE-based) -> 110x72 authored grid + elevation + false-color.

Calibrated against the mockup palette (see commit notes):
  water  = blue       H 185..235, S>0.35
  road   = orange-dirt H <48 (sand/path/wood), bright -> path
  cliff  = stone       H <48 AND desaturated (S<0.30) AND mid-dark V
  grass  = green/olive  H 48..150 (default; trees flatten to grass terrain)

Buildings / crops / fences / trees are NOT terrain: roofs read warm (-> road) and
get hand-flattened to grass; they re-enter as sprite OBJECTS in the placement pass.
Output legend matches build-northwood-from-authored.ts: ~ water, . beach, t road,
F grass, q cliff-grass, ^ void."""
import colorsys
from collections import Counter
from PIL import Image

COLS, ROWS = 110, 72
SRC = "assetsources/waystone/waystone-mockup.jpg"
img = Image.open(SRC).convert("RGB")
small = img.resize((COLS, ROWS), Image.BOX)
sp = small.load()


def classify(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    H = h * 360
    if s > 0.30 and 180 <= H <= 240:
        return "water"
    if H < 48 or H >= 345:                       # warm: dirt / sand / stone / wood
        if s < 0.30 and 0.18 <= v <= 0.52:
            return "cliff"                       # desaturated stone / rock wall
        if v >= 0.50:
            return "road"                        # BRIGHT tan = actual path / sand
        return "grass"                           # dull/shaded warm = grass under canopy/dirt
    return "grass"                               # greens + olive + dark foliage


CHAR = {"water": "~", "grass": "F", "cliff": "q", "road": "t", "beach": ".", "void": "^"}
COLOR = {"water": (40, 120, 200), "grass": (96, 158, 64), "cliff": (120, 110, 96),
         "road": (200, 165, 95), "beach": (232, 214, 150), "void": (20, 20, 28)}

cls = [[classify(*sp[x, y]) for x in range(COLS)] for y in range(ROWS)]

# --- beach: road/sand cells that touch water become beach '.' ---
for y in range(ROWS):
    for x in range(COLS):
        if cls[y][x] == "road":
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < COLS and 0 <= ny < ROWS and cls[ny][nx] == "water":
                    cls[y][x] = "beach"
                    break

# --- elevation: UNIFORM flat (Waystone is a flat farming town). A uniform tier
# means NO cliff faces are generated, so the river/pond render as gentle shores
# (matching the mockup's footbridged stream) instead of canyon walls. The rocky
# sea-coast + cave hill get tier overrides by hand in the bake pass if wanted. ---
elev = [["2" for _x in range(COLS)] for _y in range(ROWS)]

counts = Counter()
layout_rows, elev_rows = [], []
for y in range(ROWS):
    line = []
    for x in range(COLS):
        k = cls[y][x]; counts[k] += 1
        line.append(CHAR[k])
    layout_rows.append("".join(line))
    elev_rows.append("".join(elev[y]))

with open("assetsources/waystone/layout-authored.txt", "w") as f:
    f.write("\n".join(layout_rows) + "\n")
with open("assetsources/waystone/elevation.txt", "w") as f:
    f.write("\n".join(elev_rows) + "\n")

scale = 8
fc = Image.new("RGB", (COLS, ROWS))
fp = fc.load()
for y in range(ROWS):
    for x in range(COLS):
        fp[x, y] = COLOR[cls[y][x]]
fc.resize((COLS * scale, ROWS * scale), Image.NEAREST).save("assetsources/waystone/waystone-terrain-classified.png")
small.resize((COLS * scale, ROWS * scale), Image.NEAREST).save("assetsources/waystone/waystone-downsample.png")
print("class counts:", dict(counts))
