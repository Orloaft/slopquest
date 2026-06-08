#!/usr/bin/env python3
"""Throwaway: catalog every tile/prop bbox on public/jungle-tiles.png by connected-component
labelling of the magenta-keyed sheet, so the jungle overhaul can pick exact makeTileTexture
rects instead of eyeballing. Emits a numbered-overlay PNG + a sorted rect list."""
import sys
from collections import deque
from PIL import Image, ImageDraw

SRC = "public/jungle-tiles.png"
MIN_AREA = int(sys.argv[1]) if len(sys.argv) > 1 else 1200

im = Image.open(SRC).convert("RGB")
W, H = im.size
px = im.load()


def is_bg(c):
    r, g, b = c
    return r > 55 and b > 55 and g < min(r, b) - 18


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
        if a > MIN_AREA:
            comps.append([mnx, mny, mxx, mxy, a])

# reading order: banded rows (~80px) then left-to-right
comps.sort(key=lambda c: (round(c[1] / 70), c[0]))

ov = im.convert("RGB")
dr = ImageDraw.Draw(ov)
print(f"# {len(comps)} components (min_area={MIN_AREA}), sheet {W}x{H}")
print("# idx  x    y    w    h    area")
for n, c in enumerate(comps):
    mnx, mny, mxx, mxy, a = c
    w, h = mxx - mnx + 1, mxy - mny + 1
    dr.rectangle([mnx, mny, mxx, mxy], outline=(255, 255, 0), width=2)
    dr.text((mnx + 2, mny + 1), str(n), fill=(255, 0, 0))
    print(f"{n:3d}  {mnx:4d} {mny:4d} {w:4d} {h:4d}  {a:6d}")
ov.save("/tmp/jungle-catalog.png")
print("# wrote /tmp/jungle-catalog.png")
