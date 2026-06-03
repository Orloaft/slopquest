# Searing Canyon — multi-direction cliff-face engine plan

## The limitation we're breaking

Today the baker renders **south-facing walls only**. In `build-waystone-from-authored.ts`:

```ts
const dropS = (r, c) => Math.max(0, eh(r, c) - eh(r + 1, c));   // south neighbour only
// if dropS>0: stack `face` tiles (5col Lcap/straight/Rcap x 3row top/mid/base) in cells
// r+1..r+total BELOW the high cell, flip them to wall/blocked, AO band at the foot.
```

Every other edge (N/E/W) gets only a **plateau-top rim** (Group A corner-Wang on the top
surface) — no tall vertical face. That's fine for a town with one south-dropping shelf; it
is **not** fine for a canyon whose identity is sheer walls facing every direction.

## Target

Tall vertical rock **faces** on **South, East, West** drops. **North stays rim-only** — in
this slightly-front top-down projection a north-facing wall is occluded by its own plateau
top, so a rim read is correct (assumption — veto if you want north faces too, but it costs
art + occlusion work for little visible gain).

## Refactor (the loop)

1. **Generalize the delta.** Replace `dropS` with `drop(r,c,dir)`:
   - `dropS = eh(r,c) - eh(r+1,c)` (existing)
   - `dropE = eh(r,c) - eh(r,c+1)`
   - `dropW = eh(r,c) - eh(r,c-1)`
   Each `>0` means a wall of height `min(CLIFF_MAX_WALL_TILES, 1+drop)`.

2. **Face placement per direction:**
   - **South** (unchanged): stack in the cells *below* the high cell, `r+1..r+total`.
   - **East/West**: render a 1-tile-wide vertical face in the **low neighbour's** column
     (`c±1`) spanning the height of the high cell's row band. These are *vertical-run*
     faces (rock columns seen side-on), a different tile orientation than the south sheet.

3. **New art the engine needs** (drives the cliff prompt, §below): the current 5×3 face
   sheet is **horizontal-run** (south). E/W need **vertical-run** column faces, left-facing
   and right-facing. So the red cliff sheet must ship S + E + W face variants, not one set.

4. **Corners** (the deferred 47-tile problem, now due): where an S face meets an E/W face at
   a convex/concave corner, we need corner-cap tiles or we get a seam. Plan: ship 4 convex
   corner caps in the sheet; treat concave (inner) corners as a v1 seam we accept, log, and
   refine later. **No silent cap** — the baker logs any unresolved corner count.

5. **Collision:** each face cell → `kind='wall'`, `blocked=true` (existing pattern), applied
   per-direction. Guard: never wall a cell that a path/anchor needs walkable (assert via the
   importer's required-walkable check, same as Waystone).

6. **Draw order / occlusion:** plateau tops → S faces (below) → E/W faces (beside) → AO band.
   Higher tiers render last so a taller wall overdraws a shorter one cleanly. Watch the case
   where a cell drops on two sides at once (corner) — draw both, corner-cap on top.

## Scope estimate

- E/W delta + vertical-face placement + collision: the bulk, mechanical once the sheet exists.
- Convex corner caps: moderate (art + 4 cases).
- Concave corners: deferred-with-a-log for v1 (honest gap, refine if it reads badly).
- Verify each step by baking terrain-only and eyeballing before adding set-pieces.
