#!/usr/bin/env python3
"""Extract individual object sprites from a chroma-keyed (magenta) object sheet via
connected-component labeling. Saves each component as a transparent PNG and builds a
labeled contact sheet for identification."""
import sys, os
from collections import deque
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "assetsources/foresttiles.png"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "assetsources/curated/objects"
MIN_AREA = int(sys.argv[3]) if len(sys.argv) > 3 else 180
os.makedirs(OUTDIR, exist_ok=True)

im = Image.open(SRC).convert("RGB")
W, H = im.size
px = im.load()

def is_bg(c):
    r, g, b = c
    # magenta background + pink antialias fringe + dark PURPLE drop-shadow: red & blue both
    # present, green the distinctly low channel. The r>55/b>55 floor (was 140/120) is what
    # catches the dark purple shadow baked under sprites that used to survive as a halo.
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
        # BFS flood (8-conn)
        q = deque([(x, y)]); seen[i] = 1
        minx = maxx = x; miny = maxy = y; area = 0
        while q:
            cx, cy = q.popleft(); area += 1
            if cx < minx: minx = cx
            if cx > maxx: maxx = cx
            if cy < miny: miny = cy
            if cy > maxy: maxy = cy
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < W and 0 <= ny < H:
                        j = ny * W + nx
                        if fg[j] and not seen[j]:
                            seen[j] = 1; q.append((nx, ny))
        if area >= MIN_AREA:
            comps.append((minx, miny, maxx, maxy, area))

# sort top-to-bottom, left-to-right (reading order)
comps.sort(key=lambda c: (c[1] // 48, c[0]))
print(f"found {len(comps)} components (>= {MIN_AREA}px)")

def crop_rgba(b):
    minx, miny, maxx, maxy, area = b
    w, h = maxx - minx + 1, maxy - miny + 1
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for yy in range(h):
        for xx in range(w):
            c = px[minx + xx, miny + yy]
            op[xx, yy] = (0, 0, 0, 0) if is_bg(c) else (c[0], c[1], c[2], 255)
    return out, w, h

metas = []
for idx, b in enumerate(comps):
    out, w, h = crop_rgba(b)
    out.save(f"{OUTDIR}/obj_{idx:03d}.png")
    metas.append((idx, w, h, b[4]))

# contact sheet
cols = 12
cellw = 96
rowsn = (len(comps) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cellw, rowsn * cellw), (50, 50, 60))
from PIL import ImageDraw
d = ImageDraw.Draw(sheet)
for idx, b in enumerate(comps):
    out, w, h = crop_rgba(b)
    sc = min((cellw - 16) / w, (cellw - 16) / h, 2.0)
    ow, oh = max(1, int(w * sc)), max(1, int(h * sc))
    thumb = out.resize((ow, oh), Image.NEAREST)
    cx = (idx % cols) * cellw; cy = (idx // cols) * cellw
    sheet.paste(thumb, (cx + (cellw - ow) // 2, cy + (cellw - oh) // 2), thumb)
    d.text((cx + 2, cy + 2), str(idx), fill=(255, 255, 0))
sheet.save("artifacts/foresttiles-objects-contact.png")
with open(f"{OUTDIR}/index.txt", "w") as f:
    for idx, w, h, a in metas:
        f.write(f"{idx}\t{w}x{h}\tarea={a}\n")
print("wrote contact sheet artifacts/foresttiles-objects-contact.png and", len(comps), "sprites")
