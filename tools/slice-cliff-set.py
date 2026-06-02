#!/usr/bin/env python3
"""Slice the bespoke Northwood cliff set (one labeled sheet, 3 groups) into three packed
32px atlases the renderer can index directly:
  plateau-wang.png  16 tiles in a row   (corner-Wang, idx == NW1|NE2|SE4|SW8)
  cliff-face.png     5 cols x 3 rows     (cols: Lcap,straight,Rcap,inner-L,inner-R; rows: top,mid,base)
  ladder.png         1 col x 3 rows      (top, mid, base)

Tiles are found by connected-component labelling (tiles are big solid blocks; the baked-in
labels are small text, filtered by area). Each crop is alpha-aware area-downscaled to 32px
(magenta/purple keyed to transparency BEFORE averaging, so no pink fringe)."""
import os
from collections import deque
from PIL import Image

SRC = "assetsources/curated/bespoke/northwood-cliff-set-v1/northwood-cliff-set-v1.png"
OUT = "assetsources/curated/sliced"
TS = 32
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGB")
W, H = im.size
px = im.load()


def is_bg(c):
    r, g, b = c
    return r > 55 and b > 55 and g < min(r, b) - 18


# --- component labelling, keep big blocks (tiles), drop small ones (label text) ---
fg = bytearray(W * H)
for y in range(H):
    for x in range(W):
        fg[y * W + x] = 0 if is_bg(px[x, y]) else 1
seen = bytearray(W * H)
comps = []
for y in range(H):
    for x in range(W):
        i = y * W + x
        if not fg[i] or seen[i]:
            continue
        q = deque([(x, y)]); seen[i] = 1; mnx = mxx = x; mny = mxy = y; a = 0
        while q:
            cx, cy = q.popleft(); a += 1
            mnx = min(mnx, cx); mxx = max(mxx, cx); mny = min(mny, cy); mxy = max(mxy, cy)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < W and 0 <= ny < H:
                        j = ny * W + nx
                        if fg[j] and not seen[j]:
                            seen[j] = 1; q.append((nx, ny))
        if a > 3000:
            comps.append([mnx, mny, mxx, mxy, a])

# --- bucket into groups by position/area ---
groupA = [c for c in comps if c[0] < 700]                          # 16, left block
groupBC = [c for c in comps if c[0] >= 700]
groupB = [c for c in groupBC if c[4] > 14000]                      # 15, tall rock faces
groupC = [c for c in groupBC if c[4] <= 14000]                     # 3, ladder
groupA.sort(key=lambda c: (round(c[1] / 100), c[0]))               # reading order -> A0..A15
groupB.sort(key=lambda c: (round(c[1] / 100), c[0]))               # row-major -> row*5+col
groupC.sort(key=lambda c: c[1])                                    # top, mid, base
assert len(groupA) == 16 and len(groupB) == 15 and len(groupC) == 3, (len(groupA), len(groupB), len(groupC))


def downscale(bbox):
    """Alpha-aware area-downscale of one tile crop to TSxTS RGBA."""
    mnx, mny, mxx, mxy, _ = bbox
    w, h = mxx - mnx + 1, mxy - mny + 1
    out = Image.new("RGBA", (TS, TS), (0, 0, 0, 0))
    op = out.load()
    for ty in range(TS):
        for tx in range(TS):
            x0 = mnx + tx * w // TS; x1 = mnx + (tx + 1) * w // TS
            y0 = mny + ty * h // TS; y1 = mny + (ty + 1) * h // TS
            x1 = max(x1, x0 + 1); y1 = max(y1, y0 + 1)
            rs = gs = bs = n = 0
            for yy in range(y0, y1):
                for xx in range(x0, x1):
                    c = px[xx, yy]
                    if is_bg(c):
                        continue
                    rs += c[0]; gs += c[1]; bs += c[2]; n += 1
            tot = (y1 - y0) * (x1 - x0)
            if n > tot * 0.4:  # majority foreground -> opaque averaged colour
                op[tx, ty] = (rs // n, gs // n, bs // n, 255)
    return out


def pack(tiles, cols, name):
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * TS, rows * TS), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * TS, (i // cols) * TS))
    sheet.save(f"{OUT}/{name}.png")
    print(f"wrote {OUT}/{name}.png ({cols*TS}x{rows*TS}, {len(tiles)} tiles)")


pack([downscale(c) for c in groupA], 16, "plateau-wang")
pack([downscale(c) for c in groupB], 5, "cliff-face")
pack([downscale(c) for c in groupC], 1, "ladder")
