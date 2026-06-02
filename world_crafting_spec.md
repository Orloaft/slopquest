# Jib World-Crafting Specification (v1 — Northwood)

The reusable recipe for the 16-bit SNES/GBA top-down look achieved in Northwood, so future
regions (desert canyon, swamp, cave…) reproduce it without drift.

**Authoritative source of truth:** `tools/render-northwood-trees.ts`. This is a *static
compositor* — it bakes one PNG from data files; it is **not** a live engine. Every rule below was
verified against that file on 2026-06-02 (independent multi-agent audit). Where this doc and the
code ever disagree, the code wins — update this doc.

---

## 0. Read this first — corrections to common (wrong) assumptions

Earlier review notes described rules we do **not** actually implement. They are recorded here so
nobody re-introduces them as "the spec":

| Claimed rule | Reality in code |
|---|---|
| "70% canopy spawn-rate multiplier in a 3×3 radius for dense overlapping forest walls" | **False.** Trees are *thinned*, not clustered: greedy placement rejects any tree within `TREE_MIN_SPACING_CELLS` (2). Density comes from the layout's `f` cells, not a multiplier. |
| "Full 8-way directional Wang-set plateau wrapping (47-tile)" | **False.** It's a **4-bit edge autotile** (16 tiles, N/E/S/W only). Concave inner corners (47-tile) are explicitly deferred. |
| "Straight cliffs may not exceed 2 tiles without a Perlin-noise stagger" | **False.** No such rule. Cliffs follow the integer elevation field exactly; horizontal runs are intentionally kept *continuous*. |
| "water-wang tile-0 is a special grass base-fill trick" | **Partly.** Grass is simply corner-Wang tile 0 (the no-water case) drawn by the normal water pass; there's no separate fill step. |

Organic shape in Northwood comes from the **hand/derived data** (`layout`, `elevation`), not from
procedural anti-blockiness rules in the compositor. If you want less blocky terrain, author better
data or add a real noise pass — don't assume one exists.

---

## 1. Grid, perspective & scale

- **Tile size:** `TILE_SIZE = 32` px. All art is authored at 32×32 (1×, never upscaled).
- **Map size is data-driven:** `R = rows.length`, `C = rows[0].length` from
  `assetsources/mockup/layout-authored.txt` (falls back to `layout.txt`). Northwood is **72×110**
  cells → a **3520×2304** px image. Output `W = C·ts`, `H = R·ts`.
- **Projection:** flat, slightly-front orthographic top-down. Sprites (trees/props) are anchored
  **bottom-center** and drawn back-to-front; tile layers are pure top-down.
- **Sprite-to-grid scale:** trees render at `TREE_TARGET_W_PX = 60` px wide (~1.9 tiles), aspect
  preserved. This oversize-vs-tile ratio is what reads as "macro world" — props are deliberately
  much smaller (18–40 px) so the canopy dominates.
- **Layout legend (chars):** `~` water · `t` trail/road · `F` open grass · `f` tree cell ·
  `.` beach/sand · `^` border void. `elevation.txt` holds an integer height per cell.

## 2. Terrain autotiling

All autotiles index a packed atlas by a neighbour bitmask. Two conventions are in use:

- **Corner / dual-grid Wang (water):** iterate vertices `(R+1)×(C+1)`; mask =
  `NW1 | NE2 | SE4 | SW8` of the four cells touching each vertex; blit at `((j−0.5)·ts,(i−0.5)·ts)`.
  Use this for **fluid/region fills** where the boundary runs between cells.
- **4-bit edge Wang (plateaus, roads):** per cell, mask = `N1 | E2 | S4 | W8`; a **set bit means the
  neighbour is the same terrain** (ground continues → no edge there). 16 tiles.

**Plateau tops** (`plateau-top-v2.png`, 16-tile edge autotile): for each elevation tier
`L = 1..topLvl`, membership `up(r,c) = eh(r,c) ≥ L`; stamp `maskToIdx[mask]`. Higher tiers stamp
last so each step terraces with its own rocky rim. `maskToIdx` inverts the sheet's cell order
(`mask 15 → EDGE-NONE/interior`, `mask 0 → EDGE-ALL/isolated`). Cells of `~ ^ .` are skipped.
> The plateau sheet must be authored in **fixed cell order** described by visual edge content, not
> by abstract bitmask index — the image model cannot reliably honor "index 6 = 0b0110". See
> `docs/northwood-plateau-top-v2-prompt.md` for the exact, reusable tile-sheet prompt pattern.

**South cliff faces** (`cliff-face.png`, Group B: 5 cols `[Lcap, straight, Rcap, inner-L, inner-R]`
× 3 rows `[lip, mid, base]`, `idx = row*5 + col`): a wall is drawn wherever the elevation steps
*down* to the south (`dropS = max(0, eh(r,c) − eh(r+1,c)) > 0`). Wall height
`total = min(CLIFF_MAX_WALL_TILES, 1 + drop)`, drawn in the lower cells `r+1 … r+total`. Column =
Lcap/Rcap at run ends, else straight. (inner-L/inner-R columns exist in art but aren't selected yet
— that's the future 47-tile work.)

**Ladders/stairs** (`ladder.png`, Group C: 1×3 `[top, mid, base]`): each contiguous run of wall
cells whose lip touches a road collapses into **one** ladder at the run centre. A clearing box is
added to `noTree` so trees don't bury it.

## 3. Vegetation

- **Sources:** `TREE_IDS = [7,8,84,89,6,85,90]` (conifer + leafy variety), random per placement.
- **Placement = thinning, not clustering.** Scan `f` cells in reading order; keep a tree only if no
  already-kept tree is within `TREE_MIN_SPACING_CELLS` (Chebyshev). This guarantees breathing room
  and avoids a stamped-grid look. Forest *density* is therefore controlled by how many `f` cells the
  layout paints, not by a spawn multiplier.
- **Anti-clipping:** sprites anchored bottom-center (`dy0 = baseY − dh`, `baseY` = cell bottom),
  small ±5px horizontal jitter, and **painter's order** (sort placements by row ascending) so nearer
  trees overlap farther ones correctly. Residual purple drop-shadow pixels are chroma-keyed out.

## 4. Static compositor rendering order

Strict layer stack (later layers draw over earlier):

1. **Water** — corner-Wang dual-grid (also paints grass via tile 0).
2. **Plateau tops** — 4-bit edge autotile, per elevation tier.
3. **Roads** — 4-bit edge autotile.
4. **Road edge dither** — see §5.
5. **Beach** — noise sand fill on `.` cells.
6. **Border void** — flat dark fill on `^` cells.
7. **Cliffs** — south wall faces + ladders/stairs.
8. **Cliff-base AO shadow** — see §5.
9. **Trees** — thinned scatter, painter's order.
10. **Decoration props** — see §6.

## 5. Engineered micro-blends

- **Cliff-base contact shadow (AO):** a soft, **dithered** dark band at each wall foot
  (`baseY = (r+total+1)·ts − 4`). Height `CLIFF_AO_BAND_PX = 14`. A pixel is darkened by
  `(1 − dy/SH) · CLIFF_AO_MAX_DARKEN · strength`, `strength = min(1, drop/2)`. Dither keeps ~98% of
  the top row and tapers to a sparse tail via a per-pixel hash — no hard 1px line.
- **Road edge dither (weathered trail):** on each road side facing open grass (`F`/`f`), stipple the
  outer `ROAD_DITHER_EDGE_PX = 3` px, copying the grass colour across the seam with probability
  `ROAD_DITHER_PROB_BY_DEPTH = [0.20, 0.10, 0.04]` (edge → inward).
- **Determinism:** both use `hrand(px,py)` — a position-keyed integer hash, so dithering is identical
  every render and independent of draw order. Never use `Math.random()` here.

## 6. Decoration scatter

- **Density:** `ENVIRO_PROP_DENSITY_GATE = 0.16` — per `F`-cell acceptance chance. Locked at 16% in
  production review (sweet spot: breaks up green fields without cluttering trails).
- **Placement rules:** open grass `F` only; reject if in `noTree` (stair/wall clearings), if within
  `PROP_MIN_SPACING_CELLS` of another prop, or if any 3×3 neighbour is a tree cell. Painter's order.
- **Prop groups** (id → scaled width): leafy shrubs/rock `[22,24,25,70]`@26 · flower tufts
  `[33,34,35,49,105,107]`@22 · logs/stump `[39,53,115]`@40 · small plants `[54,97]`@18.
- **Scale-audit rule:** blacklist any prop that reads out-of-scale vs the 32px grid. `obj 116`
  (mushroom/stump dome) was removed for this reason. When adding props, eyeball them at 1–1.3 tiles
  max; oversize "hero" props break the macro read.

## 7. Tunables (the only knobs)

All live in one block at the top of `tools/render-northwood-trees.ts`:

```ts
const TILE_SIZE = 32;
const TREE_TARGET_W_PX = 60;            // ~1.9 tiles
const TREE_MIN_SPACING_CELLS = 2;       // thinning, not clustering
const ENVIRO_PROP_DENSITY_GATE = 0.16;  // locked per production review
const PROP_MIN_SPACING_CELLS = 2;
const ROAD_DITHER_EDGE_PX = 3;
const ROAD_DITHER_PROB_BY_DEPTH = [0.20, 0.10, 0.04];
const CLIFF_AO_BAND_PX = 14;
const CLIFF_AO_MAX_DARKEN = 0.4;
const CLIFF_MAX_WALL_TILES = 4;
```

## 8. Asset-sheet pipeline (per region)

1. Author region data: `layout(-authored).txt` + `elevation.txt` (e.g. via `derive_*` tools).
2. Generate bespoke autotile/cliff sheets with the **visual-cell-order** prompt pattern
   (`docs/northwood-plateau-top-v2-prompt.md`): magenta `#FF00FF` bg, hard edges, fixed grid,
   labels above cells, 32px tiles at 1×.
3. Slice on the fixed grid (`tools/slice-plateau-v2.py` is the template). Magenta key:
   `blue ≥ green + 8` (rock/grass never satisfy that → kills purple fringe).
4. Wire the atlas into the compositor; the renderer owns the `maskToIdx` mapping.
5. Render, eyeball at 1× and zoomed, iterate. `tsc --noEmit` must stay clean.

## 9. Deferred (next phase — live engine)

- 47-tile concave inner corners for plateaus & cliffs (cliff-face inner-L/inner-R already in art).
- Diagonal roads — needs diagonal **path data** in the layout, not new art.
- True per-region palette swaps and weather/time-of-day lighting.

---

## System Injection Prompt — hand this to a fresh agent starting a new region

```
You are building a new region for the game "Jib" using its established static-compositor world-
crafting pipeline. Match the existing 16-bit SNES/GBA top-down aesthetic EXACTLY. Read
world_crafting_spec.md and tools/render-northwood-trees.ts first; the code is the source of truth.

Hard rules (do not invent behavior the code doesn't have):
- 32px tiles, authored at 1×, magenta #FF00FF background, hard edges (no AA bleed). Map size is
  data-driven from layout(-authored).txt; elevation.txt holds integer per-cell heights.
- Terrain autotiles: corner-Wang (NW1|NE2|SE4|SW8) for fluid region fills; 4-bit EDGE Wang
  (N1|E2|S4|W8, set bit = same terrain continues) for plateaus and roads. Plateau tops are a
  16-tile EDGE set (NOT 8-way/47-tile). Author tile sheets in FIXED VISUAL CELL ORDER described by
  edge content — never by abstract bitmask index; the renderer owns position->mask.
- Vegetation is THINNED, not clustered: greedy spacing of TREE_MIN_SPACING_CELLS; sprites ~1.9
  tiles, bottom-center anchor, painter's-order draw. Density comes from how many tree cells the
  layout paints.
- Render order: Water -> Plateau tops -> Roads -> Road dither -> Beach -> Border void -> Cliffs
  (south faces + ladders) -> Cliff-base AO shadow -> Trees -> Decoration props.
- Micro-blends use a deterministic position-hash (hrand), never Math.random: dithered cliff-foot
  AO contact shadow; weathered road edges (stipple outer 3px into grass).
- Decoration: 16% density gate on open-grass cells only, spaced, clear of stairs/paths/trees;
  blacklist any prop that reads out of scale (>~1.3 tiles).

Be honest about gaps. If a requested effect (e.g. Perlin cliff stagger, 8-way wrapping, diagonal
roads, tree clustering) is NOT in the code, say so and either implement it for real or flag it —
do not pretend it exists or claim it's done without verifying the render. Always keep
`tsc --noEmit` clean and confirm the baked PNG visually before declaring success.
```
