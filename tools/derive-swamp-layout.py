# PATH A: derive floor-5 geometry from the target mockup (artifacts/swamp-mockup-TARGET.jpg).
# Classify each 110x72 cell into water(W) / lichen-land(m) / dirt-path(k), de-speckle,
# then STAMP gameplay guarantees (anchors stay walkable / spitters on water) + connect.
# Outputs assetsources/mockup/swamp-layout-derived.txt + a color preview for review.
import numpy as np
from PIL import Image, ImageDraw
from collections import deque, Counter
C, R = 110, 72
im = Image.open("artifacts/swamp-mockup-TARGET.jpg").convert("RGB").resize((C, R), Image.BOX)
a = np.asarray(im).astype(int)
r, g, b = a[:,:,0], a[:,:,1], a[:,:,2]
V = a.max(axis=2)
# HUE-based classification (mockup is dim, so brightness can't separate land/water):
#   lichen = violet/magenta (green is the min channel) — purple even when dark
#   path   = warm brown/tan, ordered r>g>b
#   water  = neutral/green dark mire (everything else)
lichen = (r > g + 4) & (b > g + 2)
path   = (~lichen) & (r > g) & (g >= b) & (r - b > 22)
verydark = (V < 26)
lichen = lichen & ~verydark
grid = np.where(lichen, "m", np.where(path, "k", "W")).astype("U1")

# de-speckle: isolated cells (no orthogonal like-neighbour) flip to local majority
for _ in range(2):
    ng = grid.copy()
    for y in range(R):
        for x in range(C):
            counts={}
            for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                yy,xx=y+dy,x+dx
                if 0<=yy<R and 0<=xx<C: counts[grid[yy][xx]]=counts.get(grid[yy][xx],0)+1
            if counts.get(grid[y][x],0)==0:
                ng[y][x]=max(counts,key=counts.get)
    grid=ng

# ---- stamp gameplay anchors ----
PORTALS={"L":(7,16),"M":(68,28)}
SPITTERS=[(71,31),(37,24),(24,38)]
SKITTER=[(59,24),(43,22),(32,26),(18,31),(17,42)]
NODES=[(44,19,44,20,0),(17,42,17,43,0),(26,46,26,47,0),(80,34,80,35,0),
       (49,27,49,28,0),(62,37,62,38,0),(28,34,26,34,0),(31,11,31,12,0),
       (51,29,51,28,1)]
def setc(x,y,ch):
    if 0<=y<R and 0<=x<C: grid[y][x]=ch
for x,y in SPITTERS: setc(x,y,"W")
for x,y in SKITTER: setc(x,y,"m")
for ax,ay,px,py,onwater in NODES:
    setc(px,py,"m"); setc(ax,ay,"W" if onwater else "m")
for ch,(x,y) in PORTALS.items(): setc(x,y,ch)

# ---- connectivity: flood from M; carve k/B spurs to stranded anchors ----
WALK=set("mkBML")
def walkable(y,x): return 0<=y<R and 0<=x<C and grid[y][x] in WALK
def flood(seed):
    seen=[[False]*C for _ in range(R)]; q=deque([seed]); seen[seed[1]][seed[0]]=True
    while q:
        x,y=q.popleft()
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx,ny=x+dx,y+dy
            if walkable(ny,nx) and not seen[ny][nx]: seen[ny][nx]=True; q.append((nx,ny))
    return seen
seed=PORTALS["M"]; seen=flood(seed)
must=[PORTALS["L"]]+SKITTER+[(px,py) for _,_,px,py,_ in NODES]
carved=0
for (tx,ty) in must:
    if seen[ty][tx]: continue
    cx,cy=tx,ty; guard=0
    while not seen[cy][cx] and guard<400:
        if grid[cy][cx]=="W": grid[cy][cx]="B"
        elif grid[cy][cx] not in WALK: grid[cy][cx]="k"
        if cx!=seed[0]: cx+= 1 if seed[0]>cx else -1
        elif cy!=seed[1]: cy+= 1 if seed[1]>cy else -1
        guard+=1
    seen=flood(seed); carved+=1
seen=flood(seed)
unreached=[(tx,ty) for (tx,ty) in must if not seen[ty][tx]]

open("assetsources/mockup/swamp-layout-derived.txt","w").write("\n".join("".join(row) for row in grid)+"\n")
hist=Counter("".join("".join(row) for row in grid))
print("derived chars:", dict(hist), "carved:", carved, "still-unreached:", unreached)

# ---- color preview (5x) with anchor overlay ----
COL={"W":(34,46,46),"m":(120,60,120),"k":(150,110,70),"B":(150,110,60),"L":(80,220,120),"M":(80,220,120)}
prev=Image.new("RGB",(C,R))
for y in range(R):
    for x in range(C): prev.putpixel((x,y),COL.get(str(grid[y][x]),(120,60,120)))
prev=prev.resize((C*5,R*5),Image.NEAREST); d=ImageDraw.Draw(prev)
def dot(x,y,col): d.ellipse([x*5-3,y*5-3,x*5+3,y*5+3],fill=col)
for x,y in SPITTERS: dot(x,y,(255,80,80))
for x,y in SKITTER: dot(x,y,(255,200,0))
for _,_,px,py,_ in NODES: dot(px,py,(0,200,255))
for ch,(x,y) in PORTALS.items(): dot(x,y,(0,255,0))
prev.save("/tmp/swamp_derived_preview.png"); print("preview -> /tmp/swamp_derived_preview.png")
