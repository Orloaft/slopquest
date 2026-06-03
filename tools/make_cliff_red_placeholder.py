#!/usr/bin/env python3
"""Placeholder cliff-red.png so the multi-direction baker math can be verified before the
real Asset Forge sheet exists. Solid colour-coded tiles, packed 32px (no gutters; the
curated/sliced sheets are already keyed, so placeholder is opaque w/ transparent unused cells).

Layout (cols x rows, 6x6):
  Group B SOUTH  : cols 0-4, rows 0-2  -> RED   (row = top/mid/base, lighter -> darker)
  Group C SIDE   : cols 0-1, rows 3-5  -> ORANGE (col0 facing-left, col1 facing-right)
  Group D CAPS   : cols 2-5, row 3     -> YELLOW (NE, NW, SE, SW)
"""
from PIL import Image

ts, COLS, ROWS = 32, 6, 6
img = Image.new("RGBA", (COLS * ts, ROWS * ts), (0, 0, 0, 0))
px = img.load()

def fill(c0, r0, color):
    for y in range(r0 * ts, (r0 + 1) * ts):
        for x in range(c0 * ts, (c0 + 1) * ts):
            px[x, y] = color

# Group B SOUTH -- red, brightness by row (top lip -> base shadow)
RED = [(205, 70, 50, 255), (165, 50, 38, 255), (120, 32, 26, 255)]
for r in range(3):
    for c in range(5):
        fill(c, r, RED[r])

# Group C SIDE -- orange, slight hue split L vs R so facing is readable
ORG_L = [(240, 155, 55, 255), (205, 120, 35, 255), (150, 85, 22, 255)]
ORG_R = [(250, 130, 40, 255), (215, 100, 28, 255), (160, 72, 18, 255)]
for i, r in enumerate(range(3, 6)):
    fill(0, r, ORG_L[i])
    fill(1, r, ORG_R[i])

# Group D CAPS -- yellow, one per convex corner
CAPS = [(250, 225, 60, 255), (235, 205, 45, 255), (220, 190, 30, 255), (205, 175, 20, 255)]
for i, c in enumerate(range(2, 6)):
    fill(c, 3, CAPS[i])

out = "assetsources/curated/sliced/cliff-red.png"
img.save(out)
print("wrote", out, img.size)
