#!/usr/bin/env python3
"""Slice the Waystone packed-dirt sheet (clean 2x2 grid, 32px tiles, 8px magenta gutters) into a
packed 4x1 atlas `dirt-v1.png`, idx == row*2+col == the prompt's cell reading order. Magenta keyed
to transparency (gutters only; tile interiors are fully opaque dirt). Mirrors slice-grass-v1.py."""
from PIL import Image

SRC = "assetsources/curated/bespoke/waystone-dirt-v1/waystone-dirt-v1-1x.png"
OUT = "assetsources/curated/sliced/dirt-v1.png"
TS, GUT = 32, 8
STEP = TS + GUT
COLS, ROWS = 2, 2

im = Image.open(SRC).convert("RGB")
W, H = im.size
assert W >= (COLS - 1) * STEP + TS and H >= (ROWS - 1) * STEP + TS, (W, H)
src = im.load()


def is_magenta(r, g, b):
    # gutter is pure magenta / antialiased purple: blue >= green is the tell. Brown dirt
    # (b < g) and pebbles never satisfy it, so interiors are safe.
    return b > g + 8 and b > 90


sheet = Image.new("RGBA", (COLS * ROWS * TS, TS), (0, 0, 0, 0))
sp = sheet.load()
for row in range(ROWS):
    for col in range(COLS):
        idx = row * COLS + col
        ox, oy = col * STEP, row * STEP
        for y in range(TS):
            for x in range(TS):
                r, g, b = src[ox + x, oy + y]
                if is_magenta(r, g, b):
                    continue
                sp[idx * TS + x, y] = (r, g, b, 255)
sheet.save(OUT)
print(f"wrote {OUT} ({COLS*ROWS*TS}x{TS}, {COLS*ROWS} tiles)")
