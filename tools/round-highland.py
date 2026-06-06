#!/usr/bin/env python3
"""v3 (rock-walled solid block) + rounded outer corners, done in the right order:
  1. build the block WITHOUT the cast shadow
  2. carve quarter-circles into the outer silhouette corners (walls curve)
  3. cast the contact shadow per-column from the ACTUAL (rounded) rock base,
     so the shadow hugs the curved corner instead of being notched."""
import sys, math
from PIL import Image
import importlib.util
spec = importlib.util.spec_from_file_location("v3", "tools/render-highland-ct.py")
v3 = importlib.util.module_from_spec(spec); spec.loader.exec_module(v3)

TS = v3.TS
cv = v3.build_canvas(with_shadow=False)
W, H = cv.size
px = cv.load()
gtile = v3.GRASS_TILE.convert("RGBA"); gp = gtile.load()
def grass_at(x, y): return gp[x % TS, y % TS]
def is_rock(p):
    r, g, b, a = p
    # real brown rock has R-G ~40-60; grass is R<G; a stray bright edge row sits at R-G~7
    return a > 0 and r > g + 18 and b < g

# block outer silhouettes (px). lower: cols2..21 x64..704, top rim row1 y32, foot row16 -> y544
# upper: cols7..16 x224..544, top rim row3 y96, foot row8 -> y288
BLOCKS = [
    dict(x0=2*TS, y0=1*TS, x1=22*TS, y1=17*TS),
    dict(x0=7*TS, y0=3*TS, x1=17*TS, y1=9*TS),
]
R = int(sys.argv[3]) if len(sys.argv) > 3 else 30

def carve(cxr, cyr, sx, sy):
    cx, cy = cxr + sx*R, cyr + sy*R
    for ix in range(R):
        for iy in range(R):
            x = cxr + sx*ix if sx > 0 else cxr - 1 - ix
            y = cyr + sy*iy if sy > 0 else cyr - 1 - iy
            if 0 <= x < W and 0 <= y < H and math.hypot(x - cx, y - cy) > R:
                px[x, y] = grass_at(x, y)

for b in BLOCKS:
    carve(b['x0'], b['y0'], +1, +1); carve(b['x1'], b['y0'], -1, +1)
    carve(b['x0'], b['y1'], +1, -1); carve(b['x1'], b['y1'], -1, -1)

# cast shadow per-column from the rounded rock base (only under south faces / feet)
DROP = 42
FOOT_TILES = [(x, y) for y, line in enumerate(v3.MAP) for x, ch in enumerate(line) if ch in v3.FEET]
# 1) detect each column's rock base; group by the foot-row band so upper/lower faces stay separate
base = {}   # (band, x) -> base y
for (tx, ty) in FOOT_TILES:
    band = ty
    for x in range(tx*TS, tx*TS + TS):
        for y in range(min(ty*TS + TS, H-1), max(0, ty*TS - TS), -1):
            if is_rock(px[x, y]):
                base[(band, x)] = y; break
# 2) per neighbourhood take the HIGHEST rock (min y) so the shadow can never start
#    below the true base -> no lit sliver; still follows the rounded silhouette smoothly.
bands = {}
for (band, x), y in base.items():
    bands.setdefault(band, {})[x] = y
sbase = {}
for band, cols in bands.items():
    xs = sorted(cols)
    for i, x in enumerate(xs):
        win = [cols[xs[j]] for j in range(max(0, i-2), min(len(xs), i+3))]
        sbase[(band, x)] = min(win)
# 3) cast the contact shadow: DARKEST right at the base (covers any bright tile lip),
#    fading over the band -- matches the shipping Northwood cliff-AO convention.
for (band, x), b in sbase.items():
    for dy in range(DROP):
        yy = b + dy                      # start AT the contact, no gap
        if yy >= H:
            break
        a = (1 - dy/DROP) * 0.5
        r0, g0, b0, al = px[x, yy]
        px[x, yy] = (int(r0*(1-a)), int(g0*(1-a)), int(b0*(1-a)), al)

out = sys.argv[1]; scale = int(sys.argv[2]) if len(sys.argv) > 2 else 3
if scale != 1:
    cv = cv.resize((W*scale, H*scale), Image.NEAREST)
cv.convert("RGB").save(out); print("ok", cv.size)
