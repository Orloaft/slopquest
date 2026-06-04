# Waystone packed-dirt path tileset v1 — image-gen spec

**Goal:** replace the bright, slightly-orange procedural dirt currently used for Waystone's paths and
town plaza with a **seamless, muted packed-earth** tile set that matches the mockup's warm-brown dirt
and tiles cleanly over large areas (no repeating-grid artifact).

## Context
The roads use an edge-Wang set (`road-wang`) for the grass→path *edges*; that stays. THIS set is the
solid **interior fill** that sits under the paths and fills the open town plaza. It must read as
trodden, packed dirt — flat enough to walk a town on, with only subtle texture.

## Tone
Current fill is too bright/orange (~RGB 230/166/64). The mockup paths are a **muted, desaturated warm
brown** — earthy, slightly dark, sits calmly next to the dark-olive grass. Match this:

- Shadow / ruts: `#50402080` → about `#503E20` (80,62,32)
- **Dominant midtone (most of every tile):** `#8C6E3C` (≈140,110,60) — muted packed brown
- Dry highlight: `#B89A60` (≈184,154,96) — soft, NOT bright clay/orange

Earthy and slightly desaturated. NOT orange, NOT saturated terracotta, NOT pale sand.

## Format (same convention as waystone-grass-v1)
- **4 tiles**, on a **2-columns × 2-rows grid**.
- Each tile exactly **32×32 px**.
- **8 px PURE MAGENTA (`#FF00FF`) gutters BETWEEN tiles only — no outer border.** Tiles flush to the
  top-left corner. Final sheet size **72 × 72 px** (`2*32 + 1*8`). 1× pixels, crisp.
- No transparency inside tiles — every tile is a full opaque 32×32 dirt square. Magenta only in gutters.

## Seamlessness (hard constraint)
1. Each tile must tile seamlessly with **itself** (wrap L↔R and T↔B).
2. All 4 tiles must share the **same dirt tone at their edges** so they blend in any arrangement
   (they get scattered across paths and the plaza). Keep features in the interior, off the edges.

## The 4 tiles (visual + fixed grid position; idx = row*2 + col)
| idx | grid cell | content |
|----|-----------|---------|
| 0 | row0 col0 | **Plain packed dirt.** Even muted-brown trodden earth, very fine texture. (Dominant fill.) |
| 1 | row0 col1 | Packed dirt with a **slightly rougher / scuffed** texture, same tone. |
| 2 | row1 col0 | Packed dirt with **a few tiny embedded pebbles / small stones** (interior, subtle). |
| 3 | row1 col1 | Packed dirt with **faint footpath ruts / dry cracks** (low-contrast, interior). |

Keep every accent subtle — this fills whole paths and a plaza, so loud detail becomes an obvious
repeat.

## Deliverables
Into `assetsources/curated/bespoke/waystone-dirt-v1/`:
- `waystone-dirt-v1-1x.png` — the 72×72 sheet (this exact filename; the slicer reads it).

Once it lands: `python3 tools/slice-dirt-v1.py` → `assetsources/curated/sliced/dirt-v1.png`, then
`npm run assets:waystone`. The baker is already wired with a procedural fallback, so it just upgrades.
**Save it in the BUILD WORKTREE: `/mnt/nxt-dev/tib-northwood-parity/...` (not the codex-dev checkout).**
