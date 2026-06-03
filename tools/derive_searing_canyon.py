#!/usr/bin/env python3
"""Searing Canyon M0 first-pass: derive layout + a 4-tier elevation from the mockup.

FIRST PASS, not final. Layout terrain is hue-classified (teal water / bright path /
red ground); the canyon WALLS are NOT a layout char -- they come from elevation deltas
(same contract as Waystone). Elevation is brightness-quantized into tiers 0..3 (sunlit
mesa tops = high, shadowed channels = low, water = 0), then the four set-piece anchor
boxes are FLATTENED to a single tier each so landmarks sit on level ground, not mid-cliff.

Outputs (assetsources/searing-canyon/): layout-authored.txt, elevation.txt, _m0_falsecolor.png
"""
import colorsys
from PIL import Image, ImageDraw

COLS, ROWS = 110, 72
SRC = "assetsources/searing-canyon/searing-canyon-mockup.jpg"
img = Image.open(SRC).convert("RGB")
small = img.resize((COLS, ROWS), Image.BOX)
sp = small.load()

# --- set-piece anchor boxes (col0,row0,col1,row1), eyeballed from the mockup ---
ANCHORS = {
    "outpost":  (60, 0, 101, 20),   # top-right fortified camp
    "cultist":  (2, 0, 22, 13),     # top-left tent camp
    "ritual":   (46, 22, 60, 33),   # centre stone circle
    "mining":   (75, 40, 109, 68),  # bottom-right cave/scaffold
}

def classify(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    H = h * 360
    if s > 0.22 and 150 <= H <= 210:          # teal / turquoise acid water
        return "water"
    if (H < 42 or H >= 345) and v >= 0.62 and s < 0.55:   # bright sun-baked path/sand
        return "road"
    return "ground"                            # all red rock = walkable ground (walls=elevation)

CHAR = {"water": "~", "ground": "F", "road": "t"}
cls = [[classify(*sp[x, y]) for x in range(COLS)] for y in range(ROWS)]

# --- value (brightness) per cell -> 4 tiers for land; water pinned to tier 0 ---
val = [[colorsys.rgb_to_hsv(*[c / 255 for c in sp[x, y]])[2] for x in range(COLS)] for y in range(ROWS)]
land_vals = sorted(val[y][x] for y in range(ROWS) for x in range(COLS) if cls[y][x] != "water")
# tier thresholds at land-value terciles -> tiers 1,2,3 (0 reserved for water/lowest)
t1 = land_vals[len(land_vals) // 3]
t2 = land_vals[2 * len(land_vals) // 3]
def tier(x, y):
    if cls[y][x] == "water":
        return 0
    v = val[y][x]
    return 1 if v < t1 else 2 if v < t2 else 3

elev = [[tier(x, y) for x in range(COLS)] for y in range(ROWS)]

# --- flatten each set-piece anchor box to its median tier (level landmark pad) ---
def median_tier(box):
    x0, y0, x1, y1 = box
    vals = sorted(elev[y][x] for y in range(y0, y1 + 1) for x in range(x0, x1 + 1))
    return vals[len(vals) // 2]
for name, (x0, y0, x1, y1) in ANCHORS.items():
    flat = max(1, median_tier((x0, y0, x1, y1)))   # never a 0 (water) pad
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if cls[y][x] != "water":
                elev[y][x] = flat

# --- write the two authored grids ---
base = "assetsources/searing-canyon/"
with open(base + "layout-authored.txt", "w") as f:
    f.write("\n".join("".join(CHAR[cls[y][x]] for x in range(COLS)) for y in range(ROWS)) + "\n")
with open(base + "elevation.txt", "w") as f:
    f.write("\n".join("".join(str(elev[y][x]) for x in range(COLS)) for y in range(ROWS)) + "\n")

# --- false-color preview (terrain tint + tier brightness + anchor boxes) ---
TIN = {"water": (40, 170, 175), "ground": (170, 70, 45), "road": (225, 165, 95)}
SHADE = {0: 0.55, 1: 0.70, 2: 0.85, 3: 1.0}
scale = 8
out = Image.new("RGB", (COLS * scale, ROWS * scale))
op = out.load()
for y in range(ROWS):
    for x in range(COLS):
        base_c = TIN[cls[y][x]]; sh = SHADE[elev[y][x]]
        col = tuple(int(c * sh) for c in base_c)
        for dy in range(scale):
            for dx in range(scale):
                op[x * scale + dx, y * scale + dy] = col
d = ImageDraw.Draw(out)
for name, (x0, y0, x1, y1) in ANCHORS.items():
    d.rectangle([x0 * scale, y0 * scale, (x1 + 1) * scale, (y1 + 1) * scale], outline=(255, 255, 0))
    d.text((x0 * scale + 2, y0 * scale + 2), name, fill=(255, 255, 0))
out.save(base + "_m0_falsecolor.png")

# --- report ---
from collections import Counter
tc = Counter(cls[y][x] for y in range(ROWS) for x in range(COLS))
ec = Counter(elev[y][x] for y in range(ROWS) for x in range(COLS))
print("layout terrain:", dict(tc))
print("elevation tiers:", dict(sorted(ec.items())))
print("value terciles t1=%.2f t2=%.2f" % (t1, t2))
print("anchors flattened:", {n: median_tier(b) for n, b in ANCHORS.items()})
print("wrote layout-authored.txt, elevation.txt, _m0_falsecolor.png")
