# Hand-authored 3-tier elevation for Waystone (FULL terracing, option B):
#   tier 2 (high) = north house-row terrace + east shelf (windmill/watchtower/cow pen)
#   tier 1 (mid)  = village floor (default) + the central river (gentle banks)
#   tier 0 (low)  = NW sea coast (dock/beach sits below the village) + cave pocket
# Cliffs render at south-facing step-downs: north terrace & east shelf drop 1 course to the
# village; the east shelf drops 2 courses (3-layer stone face) into the cave pocket; the
# village drops 1 course to the NW coast. The central river is pinned to tier 1 so it keeps
# gentle banks instead of a stone wall on every bank.
from collections import deque
R, C = 72, 110
layout = [list(l) for l in open('assetsources/waystone/layout-authored.txt').read().rstrip('\n').split('\n')]
h = [[1] * C for _ in range(R)]
def rect(r, c, x0, y0, x1, y1): return x0 <= c <= x1 and y0 <= r <= y1

# --- tier 2: high ground -----------------------------------------------------
for r in range(R):
    for c in range(C):
        if rect(r, c, 28, 0, 73, 9):     # north house-row terrace
            h[r][c] = 2
        if rect(r, c, 74, 0, 109, 31):   # east shelf
            h[r][c] = 2
# Carve a VILLAGE-LEVEL corridor through the north terrace at the north-gate road lane
# (cols ~33-41) so the gate stays reachable (no cliff between the village and the gate
# that leads to Northwood). The terrace flanks the road on either side.
for r in range(R):
    for c in range(C):
        if rect(r, c, 33, 0, 41, 9):
            h[r][c] = 1

# --- tier 0: cave pocket -----------------------------------------------------
for r in range(R):
    for c in range(C):
        if rect(r, c, 88, 32, 109, 47):  # low cave pocket (SE, base of shelf)
            h[r][c] = 0

# --- water/void/beach default to tier 1 (gentle); the COAST is lowered below --
for r in range(R):
    for c in range(C):
        if layout[r][c] in ('~', '^', '.'):
            h[r][c] = 1

# --- tier 0: NW sea coast (flood the sea from the corner so the central river,
#     a separate water body, stays at tier 1 with gentle banks) ---------------
sea = [[False] * C for _ in range(R)]
dq = deque()
if layout[0][0] in ('~', '.'):
    sea[0][0] = True; dq.append((0, 0))
while dq:
    r, c = dq.popleft()
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nr, nc = r + dr, c + dc
        if 0 <= nr < R and 0 <= nc < C and not sea[nr][nc] and layout[nr][nc] in ('~', '.'):
            sea[nr][nc] = True; dq.append((nr, nc))
# coast-low = sea cells + the grass shore within 2 cells of the sea (the strip that
# steps down to the water). Restricted to the NW quadrant so it can't creep inland.
for r in range(R):
    for c in range(C):
        if sea[r][c]:
            h[r][c] = 0
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < R and 0 <= nc < C and layout[nr][nc] == 'F' and h[nr][nc] == 1:
                        h[nr][nc] = 0

open('assetsources/waystone/elevation.txt', 'w').write('\n'.join(''.join(str(v) for v in row) for row in h) + '\n')
# overlay preview: tint mockup by tier
from PIL import Image
from collections import Counter
PAL = {0: (40, 90, 170), 1: (110, 165, 80), 2: (210, 180, 110)}
prev = Image.new('RGB', (C, R)); pp = prev.load()
for r in range(R):
    for c in range(C): pp[c, r] = PAL[h[r][c]]
big = prev.resize((C * 8, R * 8), Image.NEAREST)
mock = Image.open('assetsources/waystone/waystone-mockup.jpg').convert('RGB').resize((C * 8, R * 8))
blend = Image.blend(mock, big, 0.5)
out = Image.new('RGB', (C * 8, R * 8 * 2 + 10), (20, 20, 20))
out.paste(mock, (0, 0)); out.paste(blend, (0, R * 8 + 10))
out.save('artifacts/_ws_elev_overlay.png')
print('tiers:', Counter(v for row in h for v in row))
