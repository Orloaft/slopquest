#!/usr/bin/env python3
"""Derive an integer ELEVATION FIELD from the Northwood mockup.

Per-cell colour classification of cliffs is too noisy (rock faces alias with shadowed
trees). Instead we detect the dark warm-brown cliff *faces*, then integrate them into a
height field: walking each column south->north, the level rises by 1 every time we cross
a face band. The raw per-column field is median-smoothed across rows so the tiers line up
into coherent plateaus, and water/void is pinned to the lowest level. The render then
places wall art wherever the field steps down (h(r,c) > h(r+1,c)) -- so interior tiers get
cliffs, not just the island->water edge.

Output: assetsources/mockup/elevation.txt (one digit per cell) + a false-colour preview.
"""
from PIL import Image

COLS, ROWS = 110, 72
SRC = "assetsources/mockup/northwood-mockup.jpg"
LAYOUT = "assetsources/mockup/layout-authored.txt"

img = Image.open(SRC).convert("RGB")
W, H = img.size
px = img.load()


def is_mag(c):
    r, g, b = c
    return r > 170 and b > 150 and g < min(r, b) - 40


# crop the magenta frame (same logic as derive_layout_from_mockup.py)
xs0, xs1, ys0, ys1 = W, 0, H, 0
for y in range(0, H, 4):
    for x in range(0, W, 4):
        if not is_mag(px[x, y]):
            xs0 = min(xs0, x); xs1 = max(xs1, x); ys0 = min(ys0, y); ys1 = max(ys1, y)
img = img.crop((xs0, ys0, xs1 + 1, ys1 + 1))
small = img.resize((COLS, ROWS), Image.BOX)
sp = small.load()

# layout tells us where water / void / sand are (forced to lowest level)
layout = [list(l) for l in open(LAYOUT).read().rstrip("\n").split("\n")]
def low_terrain(r, c):
    ch = layout[r][c]
    return ch in ("~", "^", ".")


def br(r, c):
    rr, gg, bb = sp[c, r]
    return (rr + gg + bb) / 3
def warm(r, c):
    rr, gg, bb = sp[c, r]
    return rr - bb


def is_face(r, c):
    """A cliff face is a warm, non-water/tree cell that is markedly DARKER than the grass
    a couple rows ABOVE it (the lit plateau top) -- the south-facing rock in shadow. This
    vertical brightness-drop signature separates true faces from sunlit warm grass, which
    has no bright cell above it."""
    if r < 2:
        return False
    if layout[r][c] in ("t", ".", "~", "^"):  # road/sand/water/void are never rock faces
        return False
    rr, gg, bb = sp[c, r]
    if bb > rr + 8:            # water-ish
        return False
    if gg >= rr and br(r, c) < 70:  # dark green = tree shadow, not rock
        return False
    above = max(br(r - 2, c), br(r - 3, c) if r >= 3 else 0)
    return warm(r, c) > 14 and above - br(r, c) > 30


# 1. raw face mask
face = [[is_face(r, c) for c in range(COLS)] for r in range(ROWS)]
# keep only cells that sit in a horizontal RUN of >= MINRUN (real cliff bands are wide;
# this kills isolated brown speckle from tree shadows / dirt edges)
MINRUN = 3
runkept = [[False] * COLS for _ in range(ROWS)]
for r in range(ROWS):
    c = 0
    while c < COLS:
        if face[r][c]:
            c0 = c
            while c < COLS and face[r][c]:
                c += 1
            if c - c0 >= MINRUN:
                for cc in range(c0, c):
                    runkept[r][cc] = True
        else:
            c += 1
face = runkept

# 2. integrate height per column, south -> north (level rises after each face band).
# Cap at MAXLVL so over-counting can't run away into a smooth gradient -- the mockup
# really only has a few discrete tiers.
MAXLVL = 2
height = [[0] * COLS for _ in range(ROWS)]
for c in range(COLS):
    level = 0
    r = ROWS - 1
    while r >= 0:
        if face[r][c]:
            # consume the whole band; it sits at the top edge of the lower tier
            while r >= 0 and face[r][c]:
                height[r][c] = level
                r -= 1
            level = min(MAXLVL, level + 1)
        else:
            height[r][c] = level
            r -= 1

# 3. consolidate tiers into coherent regions with LONG, continuous drop-edges.
# (a) one wide-horizontal median to align columns; then
# (b) per-level MORPHOLOGY: close (fill 1-cell holes) + open x2 (remove the thin vertical
#     "fingers" the per-column integrator leaves behind). Opening on each height>=t mask is
#     what turns ragged, spur-covered boundaries into smooth lines -> walls run unbroken.
def median(vals):
    s = sorted(vals)
    return s[len(s) // 2]
for _ in range(2):
    nh = [row[:] for row in height]
    for r in range(ROWS):
        for c in range(COLS):
            win = [height[r][cc] for cc in range(max(0, c - 3), min(COLS, c + 4))]
            nh[r][c] = median(win)
    height = nh

def erode(m):
    o = [[False] * COLS for _ in range(ROWS)]
    for r in range(ROWS):
        for c in range(COLS):
            if not m[r][c]:
                continue
            ok = True
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    rr, cc = r + dr, c + dc
                    if not (0 <= rr < ROWS and 0 <= cc < COLS and m[rr][cc]):
                        ok = False
            o[r][c] = ok
    return o

def dilate(m):
    o = [[False] * COLS for _ in range(ROWS)]
    for r in range(ROWS):
        for c in range(COLS):
            hit = m[r][c]
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < ROWS and 0 <= cc < COLS and m[rr][cc]:
                        hit = True
            o[r][c] = hit
    return o

masks = []
for t in range(1, MAXLVL + 1):
    m = [[height[r][c] >= t for c in range(COLS)] for r in range(ROWS)]
    m = erode(dilate(m))            # closing: fill pin-holes -> continuous fill
    m = dilate(erode(erode(dilate(m))))  # opening x2: strip 1-2 cell vertical fingers/spurs
    masks.append(m)
# enforce nesting (a level-2 cell must also be level-1) then rebuild integer height
for i in range(len(masks) - 2, -1, -1):
    for r in range(ROWS):
        for c in range(COLS):
            if masks[i + 1][r][c]:
                masks[i][r][c] = True
height = [[sum(1 for m in masks if m[r][c]) for c in range(COLS)] for r in range(ROWS)]
# (c) strong WIDE-horizontal median: a 3-4 wide vertical finger sitting in level-1 is
# outvoted by its horizontal neighbours and flattens, while long horizontal tiers (most of
# the window agrees) are preserved. This is what forces drop-edges to run as long lines.
for _ in range(3):
    nh = [row[:] for row in height]
    for r in range(ROWS):
        for c in range(COLS):
            win = [height[r][cc] for cc in range(max(0, c - 6), min(COLS, c + 7))]
            nh[r][c] = median(win)
    height = nh

# 4. pin low terrain (water/void/sand) to the global minimum so island edges still wall
mn = min(min(row) for row in height)
for r in range(ROWS):
    for c in range(COLS):
        if low_terrain(r, c):
            height[r][c] = mn
# clamp to 0..9 for single-digit output
mn = min(min(row) for row in height)
for r in range(ROWS):
    for c in range(COLS):
        height[r][c] = min(9, height[r][c] - mn)

mx = max(max(row) for row in height)
with open("assetsources/mockup/elevation.txt", "w") as f:
    f.write("\n".join("".join(str(h) for h in row) for row in height) + "\n")

# false-colour preview: darker = lower
PAL = [(28, 40, 56), (96, 120, 80), (140, 150, 90), (175, 160, 95),
       (200, 175, 110), (220, 195, 130), (235, 215, 160), (245, 235, 200),
       (250, 245, 230), (255, 255, 255)]
prev = Image.new("RGB", (COLS, ROWS))
pp = prev.load()
for r in range(ROWS):
    for c in range(COLS):
        pp[c, r] = PAL[min(len(PAL) - 1, height[r][c])]
prev.resize((COLS * 8, ROWS * 8), Image.NEAREST).save("artifacts/mockup-elevation.png")

# debug: overlay detected faces (red) on the downsample so detection can be eyeballed
dbg = small.resize((COLS * 8, ROWS * 8), Image.NEAREST).convert("RGB")
dp = dbg.load()
for r in range(ROWS):
    for c in range(COLS):
        if face[r][c]:
            for yy in range(8):
                for xx in range(8):
                    dp[c * 8 + xx, r * 8 + yy] = (255, 0, 0)
dbg.save("artifacts/mockup-faces.png")

print(f"levels used: 0..{mx}  faces: {sum(sum(row) for row in face)} cells")
print("wrote elevation.txt + artifacts/mockup-elevation.png + artifacts/mockup-faces.png")
