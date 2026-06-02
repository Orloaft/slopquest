# Prompt for the image-gen agent — Northwood PLATEAU-TOP autotile v2 (Group A redo)

Why v2: the v1 plateau-top tiles were a painterly *catalog*, not an indexed set — no two edges
mapped to a predictable position, several were near-duplicates, and there were no clean
vertical (E/W) or north edges. The image model does NOT reliably honor abstract "bit index
order" instructions, so this version pins every tile by **plain visual description + fixed grid
cell**. The renderer maps grid position → autotile mask itself (see table at bottom); the artist
only has to put the right-looking tile in the right cell.

Hand the artist the block below. It also has the mockup
(`assetsources/mockup/northwood-mockup.jpg`) and the existing sheets for palette reference.

---

```
Create a single top-down 2D RPG tileset sheet: the "Northwood PLATEAU-TOP autotile" — the
grassy upper surface of a raised plateau seen from above, with a rocky cliff edge wherever the
ground drops away. Match the warm, painterly-but-crisp pixel style of the attached forest
mockup (northwood-mockup.jpg) and the existing cliff sheet: the grass is the mockup's warm
yellow-green; the cliff edge is a thin mossy grass lip, then a band of SUNLIT TAN / OCHRE
faceted rock with darker brown crevices, then a thin cool grey-brown shadow at the very edge.
Flat, slightly-front orthographic lighting. Do NOT make it red, cartoonish, glossy, or blurry.

This is ONE autotile family: every tile is the SAME warm grass surface. The ONLY thing that
changes from tile to tile is WHICH SIDES have the rocky cliff edge (the drop-off). Interior
grass is identical across all tiles so they tile seamlessly; the rocky edge is drawn INSET into
the outer ~7px of each edge that drops off, and must line up pixel-for-pixel with the same edge
on a neighbouring tile. Corners where two edges meet must round/blend the rock smoothly.

TECHNICAL REQUIREMENTS (critical for automated slicing):
- Each tile is exactly 32×32 px of content. Output at 1× — do NOT upscale.
- Background: pure magenta #FF00FF everywhere except the tiles. Hard edges only — no drop
  shadows, glow, blur, or anti-aliasing bleeding onto the magenta (it gets keyed to
  transparency; no pink fringe).
- Lay the tiles on a STRICT 4×4 grid, even ~8px magenta gutter between every cell, no extra
  padding. Print the small label I give each cell in text directly ABOVE that cell.
- Read the grid left-to-right, top-to-bottom. Put EXACTLY the described tile in each cell —
  the position is the contract; do not reorder or "improve" the arrangement.

THE 16 CELLS (row by row). "edge on X" = the rocky cliff drop-off runs along that side;
every other side is plain grass that continues into the neighbour.

Row 1:
  R1C1  label "EDGE-NONE"  — solid grass, NO cliff edge on any side (plateau interior).
  R1C2  label "EDGE-N"     — cliff edge along the TOP only.
  R1C3  label "EDGE-E"     — cliff edge along the RIGHT only.
  R1C4  label "EDGE-S"     — cliff edge along the BOTTOM only.

Row 2:
  R2C1  label "EDGE-W"     — cliff edge along the LEFT only.
  R2C2  label "EDGE-NE"    — cliff edge along TOP and RIGHT (rounded top-right outer corner).
  R2C3  label "EDGE-SE"    — cliff edge along BOTTOM and RIGHT (rounded bottom-right corner).
  R2C4  label "EDGE-SW"    — cliff edge along BOTTOM and LEFT (rounded bottom-left corner).

Row 3:
  R3C1  label "EDGE-NW"    — cliff edge along TOP and LEFT (rounded top-left outer corner).
  R3C2  label "EDGE-NS"    — cliff edge along TOP and BOTTOM, grass connects left↔right
                            (a horizontal land bridge).
  R3C3  label "EDGE-EW"    — cliff edge along LEFT and RIGHT, grass connects top↔bottom
                            (a vertical land bridge).
  R3C4  label "EDGE-NES"   — cliff edge on TOP, RIGHT and BOTTOM; open grass only to the LEFT
                            (a tongue of land pointing left).

Row 4:
  R4C1  label "EDGE-NEW"   — cliff edge on TOP, RIGHT and LEFT; open grass only to the BOTTOM
                            (a tongue pointing down).
  R4C2  label "EDGE-ESW"   — cliff edge on RIGHT, BOTTOM and LEFT; open grass only to the TOP
                            (a tongue pointing up).
  R4C3  label "EDGE-NSW"   — cliff edge on TOP, BOTTOM and LEFT; open grass only to the RIGHT
                            (a tongue pointing right).
  R4C4  label "EDGE-ALL"   — cliff edge on ALL FOUR sides (an isolated little plateau top /
                            rock pillar cap, grass in the very centre).

Output one PNG, tightly cropped to the 4×4 grid + gutters, 32px tiles, 1×, all on the same
sheet with one consistent palette and light direction.
```

---

## Wiring contract (renderer side — I own this)

Slice the 4×4 grid row-major into `plateau-top-v2.png` (16 tiles, idx = row*4+col = the cell
reading order above). The renderer uses a 4-bit EDGE autotile on the elevation field: for a
plateau cell, bit set = that orthogonal neighbour is ALSO plateau (so NO edge there).

    mask = (N_plateau?1:0) | (E_plateau?2:0) | (S_plateau?4:0) | (W_plateau?8:0)

position-in-sheet → mask (rim sides are the complement of the connected sides):

    sheet idx  label       mask   (connected sides)
     0  EDGE-NONE          15     N E S W
     1  EDGE-N             14       E S W
     2  EDGE-E             13     N   S W
     3  EDGE-S             11     N E   W
     4  EDGE-W              7     N E S
     5  EDGE-NE            12         S W
     6  EDGE-SE             9     N     W
     7  EDGE-SW             3     N E
     8  EDGE-NW             6       E S
     9  EDGE-NS            10       E   W
    10  EDGE-EW             5     N   S
    11  EDGE-NES            8           W
    12  EDGE-NEW            4         S
    13  EDGE-ESW            1     N
    14  EDGE-NSW            2       E
    15  EDGE-ALL            0     (isolated)

So `maskToIdx = [11,13,14,7,12,10,8,4,6,5,9,3,5? ...]` — built in code from the table, not by
hand. This replaces the plateau-top colour tint in `render-northwood-trees.ts`. Group B
(cliff-face) still draws the tall south walls below `EDGE-S`/`EDGE-S*` cells; Group C (ladder)
unchanged. Inner concave-corner refinement (47-tile blob) is out of scope for v2.
