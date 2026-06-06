#!/usr/bin/env python3
"""Render a two-tier highland mock. Map is generated in-code (fixed width) so the
outer rim can't drift, and the cast shadow hugs the rock-meets-grass line."""
import sys
from PIL import Image

TS = 32; COLS = 24
LEGEND = {'g':576,'n':577,'A':578,'B':579,'w':580,'e':581,'c':582,'v':583,'b':584,
          'h':585,'i':586,'j':587,'k':588,'l':589,'o':590,'p':591,'r':592}
FEET = set('bpr')
W = 24

def row(*spans):
    """spans = list of (char, count); auto-pads/asserts to width W."""
    s = ''.join(ch*n for ch, n in spans)
    assert len(s) == W, f"row width {len(s)} != {W}: {s!r}"
    return s

# lower plateau cols 2..21 (rim A@2 B@21), upper plateau cols 7..16 (rim A@7 B@16)
g=('g',);
def G(n): return ('g', n)
MAP = [
    'g'*W,
    row(G(2),('A',1),('n',18),('B',1),G(2)),                                   # lower N rim
    row(G(2),('w',1),G(18),('e',1),G(2)),
    row(G(2),('w',1),G(4),('A',1),('n',8),('B',1),G(4),('e',1),G(2)),          # upper N rim
    row(G(2),('w',1),G(4),('w',1),G(8),('e',1),G(4),('e',1),G(2)),             # upper+lower sides
    row(G(2),('w',1),G(4),('j',1),('c',8),('k',1),G(4),('e',1),G(2)),          # upper cliff cap
    row(G(2),('w',1),G(4),('l',1),('v',8),('o',1),G(4),('e',1),G(2)),          # upper mid
    row(G(2),('w',1),G(4),('l',1),('v',8),('o',1),G(4),('e',1),G(2)),          # upper mid
    row(G(2),('w',1),G(4),('p',1),('b',8),('r',1),G(4),('e',1),G(2)),          # upper foot
    row(G(2),('w',1),G(18),('e',1),G(2)),                                      # lower top
    row(G(2),('w',1),G(18),('e',1),G(2)),
    row(G(2),('w',1),G(18),('e',1),G(2)),
    row(G(2),('j',1),('c',18),('k',1),G(2)),                                   # lower cliff cap
    row(G(2),('l',1),('v',18),('o',1),G(2)),                                   # lower mid
    row(G(2),('l',1),('v',18),('o',1),G(2)),                                   # lower mid
    row(G(2),('l',1),('v',18),('o',1),G(2)),                                   # lower mid
    row(G(2),('p',1),('b',18),('r',1),G(2)),                                   # lower foot
    'g'*W,
    'g'*W,
]

def tile(atlas, idx):
    c, r = idx % COLS, idx // COLS
    return atlas.crop((c*TS, r*TS, c*TS+TS, r*TS+TS))

def main():
    out = sys.argv[1]; scale = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    atlas = Image.open("assetsources/asset-forge/exports/northwood/forest.png").convert("RGBA")
    h = len(MAP)
    cv = Image.new("RGBA", (W*TS, h*TS), (0,0,0,0))
    for y, line in enumerate(MAP):
        for x, ch in enumerate(line):
            cv.alpha_composite(tile(atlas, LEGEND.get(ch,576)), (x*TS, y*TS))
    # cast shadow: starts at the rock->grass line inside the foot tile (~2/3 down), hugs base
    sh = Image.new("RGBA", cv.size, (0,0,0,0))
    GRASSLINE = 20   # px into the foot tile where rock meets grass
    DROP = 40        # px the shadow falls below that line
    for y, line in enumerate(MAP):
        for x, ch in enumerate(line):
            if ch in FEET:
                top = y*TS + GRASSLINE
                for dy in range(0, DROP):
                    ty = top + dy
                    if ty >= cv.size[1]: break
                    a = int(115 * (1 - dy/DROP))
                    for px in range(x*TS, x*TS+TS):
                        r0,g0,b0,a0 = sh.getpixel((px, ty))
                        if a > a0: sh.putpixel((px, ty), (0,0,0,a))
    cv = Image.alpha_composite(cv, sh)
    if scale != 1:
        cv = cv.resize((W*TS*scale, h*TS*scale), Image.NEAREST)
    cv.convert("RGB").save(out)
    print("ok", cv.size)

if __name__ == "__main__":
    main()
