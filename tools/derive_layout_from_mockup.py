#!/usr/bin/env python3
"""Downsample the Northwood mockup to the stage grid and classify each cell into a
terrain class. Emits a false-color preview (to verify the read) and an ASCII layout.
This gives a mockup-matched authoring skeleton instead of hand-guessing coordinates."""
import sys
from PIL import Image

COLS, ROWS = 110, 72
SRC = "assetsources/mockup/northwood-mockup.jpg"

img = Image.open(SRC).convert("RGB")
# crop the magenta frame off first: magenta = r>180,g<90,b>170
W, H = img.size
px = img.load()
def is_mag(c):
    r, g, b = c
    return r > 170 and b > 150 and g < min(r, b) - 40
# find content bbox by scanning for non-magenta
xs0, xs1, ys0, ys1 = W, 0, H, 0
step = 4
for y in range(0, H, step):
    for x in range(0, W, step):
        if not is_mag(px[x, y]):
            xs0 = min(xs0, x); xs1 = max(xs1, x); ys0 = min(ys0, y); ys1 = max(ys1, y)
img = img.crop((xs0, ys0, xs1 + 1, ys1 + 1))
small = img.resize((COLS, ROWS), Image.BOX)
sp = small.load()

def classify(r, g, b):
    bright = (r + g + b) / 3
    warm = r - b  # warmth: dirt/rock/sand positive, grass/water small/negative
    if is_mag((r, g, b)):
        return "border"
    # water: blue clearly dominant
    if b > r + 15 and b > g - 5 and b > 80:
        return "water"
    # sand/beach: light, warm, low saturation (r,g high and close; b moderate)
    if r > 170 and g > 145 and b > 95 and (r - g) < 45 and warm > 20:
        return "sand"
    # tree: distinctly dark green
    if g >= r and g > b and bright < 80:
        return "tree"
    # warm browns: light tan = road/dirt path; only VERY dark warm = cliff rock face
    if warm > 26 and r >= g - 6 and g >= b - 4:
        if bright < 72:
            return "cliff"
        if bright >= 118:
            return "road"
        return "grass"  # mid-brown shadowed ground reads as grass under mockup lighting
    # grass: everything else green-ish
    return "grass"

COLOR = {
    "border": (20, 20, 20), "water": (40, 120, 200), "grass": (90, 165, 70),
    "tree": (24, 80, 36), "cliff": (110, 72, 42), "sand": (225, 205, 140), "road": (200, 165, 95),
}
CHAR = {"border": "^", "water": "~", "grass": "F", "tree": "f", "cliff": "q", "sand": ".", "road": "t"}

rows_txt = []
counts = {}
classified = Image.new("RGB", (COLS, ROWS))
cp = classified.load()
for y in range(ROWS):
    line = []
    for x in range(COLS):
        cls = classify(*sp[x, y])
        counts[cls] = counts.get(cls, 0) + 1
        cp[x, y] = COLOR[cls]
        line.append(CHAR[cls])
    rows_txt.append("".join(line))

scale = 8
classified.resize((COLS * scale, ROWS * scale), Image.NEAREST).save("artifacts/mockup-classified.png")
small.resize((COLS * scale, ROWS * scale), Image.NEAREST).save("artifacts/mockup-downsample.png")
with open("assetsources/mockup/layout.txt", "w") as f:
    f.write("\n".join(rows_txt) + "\n")

print("crop bbox", (xs0, ys0, xs1, ys1), "->", img.size)
print("class counts:", counts)
print("wrote artifacts/mockup-classified.png, mockup-downsample.png, assetsources/mockup/layout.txt")
