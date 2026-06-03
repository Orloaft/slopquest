#!/usr/bin/env python3
"""Searing Canyon M0 carve: HAND-AUTHORED geometric tier maze (replaces brightness-noise).

The mockup gives the *layout* (teal water / sandy path / red ground, hue-classified) but
its brightness is too speckly to drive elevation -- a canyon's identity is coherent
plateaus + channels, not per-pixel noise. So elevation here is built from explicit
geometry: a mid-tier canyon floor (2), HIGH mesas/ridges (3) whose edges become the sheer
walls the baker renders from elevation deltas (S/E/W), and LOW corridors (1) carved as
deliberate path channels that guide the player between the river bridges, the central
ritual circle, and the camp zones. Water is pinned to tier 0. The four set-piece anchors
are flattened to level pads so landmarks never sit mid-cliff.

Outputs (assetsources/searing-canyon/): layout-authored.txt, elevation.txt, _m0_falsecolor.png
"""
import colorsys
from PIL import Image, ImageDraw

COLS, ROWS = 110, 72
BASE = "assetsources/searing-canyon/"
SRC = BASE + "searing-canyon-mockup.jpg"

# ---------------------------------------------------------------- layout (from mockup)
img = Image.open(SRC).convert("RGB")
small = img.resize((COLS, ROWS), Image.BOX)
sp = small.load()

def classify(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    H = h * 360
    if s > 0.22 and 150 <= H <= 210:                       # teal acid water
        return "water"
    if (H < 42 or H >= 345) and v >= 0.62 and s < 0.55:    # bright sun-baked path/sand
        return "road"
    return "ground"

CHAR = {"water": "~", "ground": "F", "road": "t"}
cls = [[classify(*sp[x, y]) for x in range(COLS)] for y in range(ROWS)]
is_water = [[cls[y][x] == "water" for x in range(COLS)] for y in range(ROWS)]

# ---------------------------------------------------------------- elevation (geometry)
# anchor boxes (col0,row0,col1,row1) -- shared with derive; pads flattened at the end
ANCHORS = {
    "outpost": (60, 0, 101, 20),   # top-right fortified camp  -> mesa top (3)
    "cultist": (2, 0, 22, 13),     # top-left tent camp        -> mesa top (3)
    "ritual":  (46, 22, 60, 33),   # centre stone circle       -> mid plateau (2)
    "mining":  (75, 40, 109, 68),  # bottom-right cave basin   -> low floor (1)
}
ANCHOR_PAD = {"outpost": 3, "cultist": 3, "ritual": 2, "mining": 1}

elev = [[2 for _ in range(COLS)] for _ in range(ROWS)]     # canyon floor = mid tier 2

def rect(t, x0, y0, x1, y1):
    for y in range(max(0, y0), min(ROWS, y1 + 1)):
        for x in range(max(0, x0), min(COLS, x1 + 1)):
            elev[y][x] = t

road_cells = set()   # cells to paint as walking trail (cracked-earth road tile)

def corridor(t, pts, w, road=False):
    """Carve a channel of half-width w to tier t along the polyline `pts`.

    If road=True, the carved cells are also tagged as a walking trail so the path
    network tracks the canyon-floor geometry by design (the mockup's sandy trails
    don't hue-separate from red rock, so we inject roads programmatically here)."""
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        steps = max(abs(bx - ax), abs(by - ay)) or 1
        for i in range(steps + 1):
            cx = round(ax + (bx - ax) * i / steps)
            cy = round(ay + (by - ay) * i / steps)
            for dy in range(-w, w + 1):
                for dx in range(-w, w + 1):
                    x, y = cx + dx, cy + dy
                    if 0 <= x < COLS and 0 <= y < ROWS:
                        elev[y][x] = t
                        if road:
                            road_cells.add((x, y))

# --- HIGH mesas / ridges (tier 3): their edges become the canyon's sheer walls ---
rect(3, 0, 0, 27, 14)        # cultist mesa (top-left)
rect(3, 56, 0, 109, 20)      # outpost mesa (top-right)
rect(3, 102, 0, 109, 71)     # east canyon rim wall
rect(3, 0, 0, 7, 30)         # west canyon rim wall
rect(3, 30, 28, 41, 47)      # western fin (wall east of the river)
rect(3, 64, 28, 73, 46)      # central dividing butte (ritual | lower-right)
rect(3, 74, 35, 101, 40)     # mining back-ridge -- the cliff the cave arch cuts into

# --- LOW path corridors (tier 1): the maze the player actually walks (road=trail) ---
corridor(1, [(31, 2), (31, 10), (40, 16), (48, 20)], 2, road=True)   # top bridge -> ritual
corridor(1, [(45, 19), (50, 21)], 3, road=True)                      # chasm-mouth flare into ritual plateau
corridor(1, [(53, 18), (58, 16), (62, 17)], 2, road=True)            # ritual -> outpost gate
corridor(1, [(53, 33), (58, 40), (70, 46), (84, 48)], 2, road=True)  # ritual -> mining
corridor(1, [(20, 22), (26, 26), (34, 30), (44, 34)], 2, road=True)  # water bridge -> ritual approach
corridor(1, [(18, 40), (30, 50), (50, 56), (69, 56)], 3)             # lower basin sweep (pulled W off mining)
rect(1, 66, 48, 74, 66)                                              # flat staging apron W of the mining box

# --- WATER (tier 0): banks one tier down, then water itself ---
for y in range(ROWS):
    for x in range(COLS):
        if is_water[y][x]:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= xx < COLS and 0 <= yy < ROWS and not is_water[yy][xx]:
                        elev[yy][xx] = min(elev[yy][xx], 1)     # tier-1 bank
for y in range(ROWS):
    for x in range(COLS):
        if is_water[y][x]:
            elev[y][x] = 0

# --- flatten anchors to level pads (after everything else) ---
for name, (x0, y0, x1, y1) in ANCHORS.items():
    pad = ANCHOR_PAD[name]
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if not is_water[y][x]:
                elev[y][x] = pad

# --- inject the trail network onto the layout (paths track the carved corridors) ---
for (x, y) in road_cells:
    if not is_water[y][x]:
        cls[y][x] = "road"

# ---------------------------------------------------------------- write grids
with open(BASE + "layout-authored.txt", "w") as f:
    f.write("\n".join("".join(CHAR[cls[y][x]] for x in range(COLS)) for y in range(ROWS)) + "\n")
with open(BASE + "elevation.txt", "w") as f:
    f.write("\n".join("".join(str(elev[y][x]) for x in range(COLS)) for y in range(ROWS)) + "\n")

# ---------------------------------------------------------------- false-color preview
TIN = {"water": (40, 170, 175), "ground": (170, 70, 45), "road": (225, 165, 95)}
SHADE = {0: 0.5, 1: 0.68, 2: 0.84, 3: 1.0}
scale = 8
out = Image.new("RGB", (COLS * scale, ROWS * scale))
op = out.load()
for y in range(ROWS):
    for x in range(COLS):
        col = tuple(int(c * SHADE[elev[y][x]]) for c in TIN[cls[y][x]])
        for dy in range(scale):
            for dx in range(scale):
                op[x * scale + dx, y * scale + dy] = col
d = ImageDraw.Draw(out)
for name, (x0, y0, x1, y1) in ANCHORS.items():
    d.rectangle([x0 * scale, y0 * scale, (x1 + 1) * scale, (y1 + 1) * scale], outline=(255, 255, 0))
    d.text((x0 * scale + 2, y0 * scale + 2), name, fill=(255, 255, 0))
out.save(BASE + "_m0_falsecolor.png")

# ---------------------------------------------------------------- report
from collections import Counter
ec = Counter(elev[y][x] for y in range(ROWS) for x in range(COLS))
tc = Counter(cls[y][x] for y in range(ROWS) for x in range(COLS))
print("layout terrain:", dict(tc))
print("elevation tiers:", dict(sorted(ec.items())))
print("wrote layout-authored.txt, elevation.txt, _m0_falsecolor.png")
