# Waystone grass-variation tileset v1 — image-gen spec

**Goal:** replace the single flat lime grass tile in the Waystone (floor-0) town with a small set
of **seamless, tileable dark-olive grass variants**, so the ground reads like the mockup's rich,
textured green instead of one uniform bright fill.

## The #1 requirement: TONE
The current in-engine grass is bright yellow-lime (~RGB 185/178/62). **That is wrong.** The mockup
grass is a **dark, muted, painterly olive-green**. Match this palette:

- Deep shadow clumps: `#1E2410` (≈30,36,16)
- **Dominant midtone (most of every tile):** `#4F4B1A` (≈79,75,26) — dark khaki-olive green
- Lit blade highlights: `#6E7A30` (≈110,122,48) — muted, never neon/lime

Overall feel: top-down 2D RPG grass, hand-painted, slightly desaturated, earthy. Think classic
"Tibia / Graphic-style" forest-town turf. NOT cartoon, NOT bright, NOT high-saturation.

## Format (match our proven plateau-top-v2 sheet exactly)
- **8 tiles**, laid out on a **4-columns × 2-rows grid**.
- Each tile is exactly **32×32 px** of seamless ground.
- **8 px magenta gutters BETWEEN tiles only — no border gutter.** Tiles are flush to the top-left
  corner; an 8px magenta (`#FF00FF`) strip separates the columns and the two rows (we key it out).
  (This matches the proven `northwood-plateau-top-v2` sheet exactly: pixel (0,0) is tile content.)
- So the sheet is **152 px wide × 72 px tall** (`4*32 + 3*8` × `2*32 + 1*8`). Deliver at 1× (no upscale).
- No transparency inside tiles — every tile is a full opaque 32×32 ground square. Magenta only in gutters.

## Seamlessness (hard constraint — this is what tripped the crop tiles in v1)
1. **Each tile must tile seamlessly with ITSELF** (wrap left↔right and top↔bottom edges).
2. **All 8 tiles must share the SAME base green at their edges** so any tile can sit next to any
   other tile with no visible seam or tone jump. Keep features (flowers, patches) in the tile
   INTERIOR, never touching an edge.
3. We will scatter these randomly across the map, so they must blend in any arrangement.

## The 8 cells (describe each by its VISUAL content + fixed grid position)
We own the index→meaning mapping in code by grid position (row-major: idx = row*4 + col). Paint
exactly this, in this order:

| idx | grid cell | content |
|----|-----------|---------|
| 0 | row0 col0 | **Plain base turf.** Even dark-olive grass, fine blade texture only. (This is the dominant fill — make it look good repeated.) |
| 1 | row0 col1 | Base turf with a slightly **denser blade/tuft texture**, same tone. |
| 2 | row0 col2 | Base turf with **2–3 tiny pale wildflowers** (white/cream dots) in the interior. |
| 3 | row0 col3 | Base turf with **a small cluster of yellow flowers** (3–4 tiny dots) in the interior. |
| 4 | row1 col0 | Base turf with a **small darker shadowed patch** (deeper olive, like grass in shade). |
| 5 | row1 col1 | Base turf with a **small mossy/lighter green patch** (subtle, still muted). |
| 6 | row1 col2 | Base turf with a **few tiny pebbles / a twig** scattered (earthy brown specks, interior). |
| 7 | row1 col3 | Base turf with a **small bare-earth scuff** (warm brown soil showing through, interior, edges stay grass). |

Keep every accent SUBTLE and small — these tiles repeat across a whole town, so anything loud
becomes an obvious repeating pattern. Variation should read as natural texture, not as "stamps."

## Deliverables
Drop into `assetsources/curated/bespoke/waystone-grass-v1/`:
- `waystone-grass-v1-1x.png` — the 152×72 sheet described above (this exact filename; the slicer reads it).
- (optional) a labeled/contact-sheet copy for review.

Once it lands: `python3 tools/slice-grass-v1.py` → `assetsources/curated/sliced/grass-v1.png`, then
`npm run assets:waystone` picks it up automatically (baker is already wired with a fallback).
