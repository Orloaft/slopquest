#!/usr/bin/env python3
"""Slice the forged Searing Canyon red-rock cliff sheet into the packed layout the baker
reads. Source is a labelled magenta-gutter sheet (Asset Forge output, 288x188, 25 tiles);
we magenta-key each 32x32 cell to transparency and pack into a 6x6 / 192x192 grid whose
tile slots match build-searing-canyon-from-authored.ts crop() offsets:

  face     = crop(0,0,5,3)  -> Group B SOUTH  packed cols 0-4, rows 0-2
  faceSide = crop(0,3,2,3)  -> Group C SIDE   packed cols 0-1, rows 3-5
  caps     = crop(2,3,4,1)  -> Group D CAPS   packed cols 2-5, row 3

Magenta (#FF00FF) has HIGH blue; the red sandstone has LOW blue, so keying on blue is safe.
"""
from PIL import Image

ts = 32
SRC = "assetsources/curated/bespoke/searing-canyon-red-rock-cliff-v1/searing-canyon-red-rock-cliff-set-v1.png"
DST = "assetsources/curated/sliced/cliff-red.png"

src = Image.open(SRC).convert("RGBA")
sp = src.load()

# detected source grid (deterministic sheet)
YS = [7, 54, 101]            # tile rows: top / mid / base
XS_B = [0, 40, 80, 120, 160] # B cols: Lcap, straight, Rcap, innerL, innerR
XS_C = [216, 256]            # C cols: facing-left, facing-right
Y_D = 156                    # D row
XS_D = [0, 40, 80, 120]      # D cols: NE, NW, SE, SW

def is_magenta(r, g, b):
    return r > 180 and g < 100 and b > 180   # keys pure magenta + pink fringe, spares red rock

def cell(sx, sy):
    """Crop a 32x32 cell at (sx,sy) and key magenta -> transparent."""
    out = Image.new("RGBA", (ts, ts), (0, 0, 0, 0))
    op = out.load()
    for y in range(ts):
        for x in range(ts):
            r, g, b, a = sp[sx + x, sy + y]
            op[x, y] = (0, 0, 0, 0) if (a < 10 or is_magenta(r, g, b)) else (r, g, b, 255)
    return out

packed = Image.new("RGBA", (6 * ts, 6 * ts), (0, 0, 0, 0))
n = 0
def place(c, r, img):
    global n
    packed.paste(img, (c * ts, r * ts)); n += 1

# Group B SOUTH -> packed cols 0-4, rows 0-2
for ri, sy in enumerate(YS):
    for ci, sx in enumerate(XS_B):
        place(ci, ri, cell(sx, sy))
# Group C SIDE -> packed cols 0-1, rows 3-5
for ri, sy in enumerate(YS):
    for ci, sx in enumerate(XS_C):
        place(ci, 3 + ri, cell(sx, sy))
# Group D CAPS -> packed cols 2-5, row 3
for ci, sx in enumerate(XS_D):
    place(2 + ci, 3, cell(sx, Y_D))

packed.save(DST)
print(f"sliced {n} tiles -> {DST} ({packed.size[0]}x{packed.size[1]})")
assert n == 25, f"expected 25 tiles, packed {n}"
