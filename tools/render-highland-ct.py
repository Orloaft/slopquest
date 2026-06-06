#!/usr/bin/env python3
"""CT-quality two-tier highland. Derives improved tiles from the base atlas in-memory
(no game-pipeline changes — this is a look-dev preview):
  - lit overhang lip: bright sun-catch on the grass edge + dark undershadow on the rock
  - W/E side rock-face slivers (so tall sides aren't a flat grass line)
  - deeper face contrast + a soft cast shadow at the base
"""
import sys
from PIL import Image

TS=32; COLS=24
LEGEND={'g':576,'n':577,'A':578,'B':579,'w':580,'e':581,'c':582,'v':583,'b':584,
        'h':585,'i':586,'j':587,'k':588,'l':589,'o':590,'p':591,'r':592}
FEET=set('bpr')
W=24
GRASS_ROCK_Y=10   # cap grass->rock boundary

atlas=Image.open("assetsources/asset-forge/exports/northwood/forest.png").convert("RGBA")
def base(idx):
    c,r=idx%COLS,idx//COLS
    return atlas.crop((c*TS,r*TS,c*TS+TS,r*TS+TS)).copy()

def clamp(v): return max(0,min(255,int(v)))

def overhang(t, y0=GRASS_ROCK_Y):
    """bright lip on the 2 grass rows above y0, dark undershadow fading over 5 rock rows below."""
    px=t.load()
    for x in range(TS):
        # sun-catch highlight on grass lip
        for dy,amt in ((1,1.32),(2,1.18)):
            y=y0-dy
            if 0<=y<TS:
                r,g,b,a=px[x,y]; px[x,y]=(clamp(r*amt),clamp(g*amt),clamp(b*amt),a)
        # dark overhang shadow on the rock just below the lip
        for dy in range(0,6):
            y=y0+dy
            if 0<=y<TS:
                f=1-(0.55*(dy/6))  # darkest at the lip
                k=1-(0.42*(1-dy/6))
                r,g,b,a=px[x,y]; px[x,y]=(clamp(r*k),clamp(g*k),clamp(b*k),a)
    return t

def contrast_face(t, amt=1.18, lift=-8):
    """deepen rock-face modelling: push contrast + slight darken for depth."""
    px=t.load()
    for y in range(TS):
        for x in range(TS):
            r,g,b,a=px[x,y]
            r=(r-128)*amt+128+lift; g=(g-128)*amt+128+lift; b=(b-128)*amt+128+lift
            px[x,y]=(clamp(r),clamp(g),clamp(b),a)
    return t

def side_face(grass, rockface, side):
    """grass tile with a vertical rock-face sliver on the outer edge + lip highlight.
    side='w' -> rock on LEFT (west), 'e' -> rock on RIGHT (east)."""
    t=grass.copy(); gp=t.load(); rp=rockface.load()
    STRIP=11
    for y in range(TS):
        for d in range(STRIP):
            x = d if side=='w' else TS-1-d
            r,g,b,a=rp[x,y]
            # feather the inner edge of the strip into grass
            if d>=STRIP-3:
                gr,gg,gb,ga=gp[x,y]; w=(STRIP-d)/3
                r,g,b=r*w+gr*(1-w),g*w+gg*(1-w),b*w+gb*(1-w)
            gp[x,y]=(clamp(r),clamp(g),clamp(b),a)
    return t

# build improved tile set (keyed by map char)
g=base(LEGEND['g']); vrock=contrast_face(base(LEGEND['v']))
T={
 'g':g, 'n':overhang(base(LEGEND['n']),4), 'A':overhang(base(LEGEND['A']),4),
 'B':overhang(base(LEGEND['B']),4),
 'w':side_face(g,vrock,'w'), 'e':side_face(g,vrock,'e'),
 'c':overhang(contrast_face(base(LEGEND['c']))), 'v':vrock,
 'b':contrast_face(base(LEGEND['b'])),
 'j':overhang(contrast_face(base(LEGEND['j']))), 'k':overhang(contrast_face(base(LEGEND['k']))),
 'l':contrast_face(base(LEGEND['l'])), 'o':contrast_face(base(LEGEND['o'])),
 'p':contrast_face(base(LEGEND['p'])), 'r':contrast_face(base(LEGEND['r'])),
}
def T_get(ch): return T.get(ch, g)

def G(n): return ('g',n)
def row(*spans):
    s=''.join(ch*n for ch,n in spans); assert len(s)==W, f"{len(s)}: {s}"; return s
MAP=['g'*W,
 row(G(2),('A',1),('n',18),('B',1),G(2)),
 row(G(2),('w',1),G(18),('e',1),G(2)),
 row(G(2),('w',1),G(4),('A',1),('n',8),('B',1),G(4),('e',1),G(2)),
 row(G(2),('w',1),G(4),('w',1),G(8),('e',1),G(4),('e',1),G(2)),
 row(G(2),('w',1),G(4),('j',1),('c',8),('k',1),G(4),('e',1),G(2)),
 row(G(2),('w',1),G(4),('l',1),('v',8),('o',1),G(4),('e',1),G(2)),
 row(G(2),('w',1),G(4),('l',1),('v',8),('o',1),G(4),('e',1),G(2)),
 row(G(2),('w',1),G(4),('p',1),('b',8),('r',1),G(4),('e',1),G(2)),
 row(G(2),('w',1),G(18),('e',1),G(2)),
 row(G(2),('w',1),G(18),('e',1),G(2)),
 row(G(2),('w',1),G(18),('e',1),G(2)),
 row(G(2),('j',1),('c',18),('k',1),G(2)),
 row(G(2),('l',1),('v',18),('o',1),G(2)),
 row(G(2),('l',1),('v',18),('o',1),G(2)),
 row(G(2),('l',1),('v',18),('o',1),G(2)),
 row(G(2),('p',1),('b',18),('r',1),G(2)),
 'g'*W,'g'*W]

def build_canvas(with_shadow=True):
    h=len(MAP); cv=Image.new("RGBA",(W*TS,h*TS),(0,0,0,0))
    for y,line in enumerate(MAP):
        for x,ch in enumerate(line):
            cv.alpha_composite(T_get(ch).convert("RGBA"),(x*TS,y*TS))
    if not with_shadow:
        return cv
    sh=Image.new("RGBA",cv.size,(0,0,0,0)); GL=20; DROP=42
    for y,line in enumerate(MAP):
        for x,ch in enumerate(line):
            if ch in FEET:
                for dy in range(DROP):
                    ty=y*TS+GL+dy
                    if ty>=cv.size[1]: break
                    a=int(120*(1-dy/DROP))
                    for px in range(x*TS,x*TS+TS):
                        if a>sh.getpixel((px,ty))[3]: sh.putpixel((px,ty),(0,0,0,a))
    return Image.alpha_composite(cv,sh)

# expose the grass tile for rounding fills
GRASS_TILE=g

def main():
    out=sys.argv[1]; scale=int(sys.argv[2]) if len(sys.argv)>2 else 3
    cv=build_canvas()
    if scale!=1: cv=cv.resize((cv.width*scale,cv.height*scale),Image.NEAREST)
    cv.convert("RGB").save(out); print("ok",cv.size)

if __name__=="__main__":
    main()
