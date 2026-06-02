#!/usr/bin/env python3
"""Slice the v2 plateau-top autotile (clean 4x4 grid, 32px tiles, 8px magenta gutters) into a
packed 16x1 atlas `plateau-top-v2.png`, idx == row*4+col == the prompt's cell reading order
(EDGE-NONE, EDGE-N, EDGE-E, ... EDGE-ALL). Magenta keyed to transparency. The grid is exact
(no label offset on the clean sheet) so we crop by position, no component labelling needed."""
from PIL import Image

SRC = "assetsources/curated/bespoke/northwood-plateau-top-v2/northwood-plateau-top-v2-1x.png"
OUT = "assetsources/curated/sliced/plateau-top-v2.png"
TS, GUT = 32, 8
STEP = TS + GUT

im = Image.open(SRC).convert("RGB")
W, H = im.size
assert W >= 3 * STEP + TS and H >= 3 * STEP + TS, (W, H)
src = im.load()


def is_magenta(r, g, b):
    # pure magenta OR the antialiased purple fringe: the tell is blue >= green, which neither
    # the tan/ochre rock (b < g) nor the grass (b < g) ever does. Spare grey shadow (b ~= g).
    return b > g + 8 and b > 90


sheet = Image.new("RGBA", (16 * TS, TS), (0, 0, 0, 0))
sp = sheet.load()
for row in range(4):
    for col in range(4):
        idx = row * 4 + col
        ox, oy = col * STEP, row * STEP
        for y in range(TS):
            for x in range(TS):
                r, g, b = src[ox + x, oy + y]
                if is_magenta(r, g, b):
                    continue
                sp[idx * TS + x, y] = (r, g, b, 255)
sheet.save(OUT)
print(f"wrote {OUT} ({16*TS}x{TS}, 16 tiles)")
