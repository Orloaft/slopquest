# Northwood Visual-Parity Pipeline

Goal: rebuild TIB's **Northwood** stage to closely match a provided mockup
(`assetsources/mockup/northwood-mockup.jpg`) — a forest island with grass, ponds, a
waterfall-fed stream, faceted cliff plateaus with stairs, dirt roads, dense conifers,
a beach, and prop vignettes (garden, cave, logs, boulders).

Working location: git worktree `/mnt/nxt-dev/tib-northwood-parity`
(branch `northwood-visual-parity`), `node_modules` symlinked from `/mnt/nxt-dev/tib`.

## Core decisions

1. **Slice real authored art** from `assetsources/*.png` instead of procedurally drawing
   tiles (the old `tools/build-northwood-rich-atlas.ts` approach). The mockup is painterly;
   only real art reaches parity.
2. **Re-author the layout to the mockup.** The old Northwood layout was a placeholder;
   derive the new layout *from the mockup image*, then apply real-art auto-tiling.
3. **Auto-tile from a terrain field; don't hand-place transition tiles.** Areas (water,
   plateau) use corner-Wang; linear features (roads, cliff walls) use edge-Wang. This art
   family is consistent: **tile index == bitmask** (verified empirically per set).

## Source art sheets (chroma-keyed magenta backgrounds)

| Sheet | Contents |
|---|---|
| `newtiles1-fixed.png` | 16-tile **water** Wang set (grass↔water) |
| `newtiles2.png` | 16-tile **road/dirt** Wang set |
| `newcliffs1.png`, `newcliff2.png` | 16-tile **cliff wall-outline** Wang sets |
| `newtiles3.png` | labeled **plateau-top** 16-set + **A4-style wall block** (top/mid/base × L/straight/R) |
| `foresttiles.png` | object & terrain library: pines, leafy trees, willow, bushes, boulders, logs, stumps, mushrooms, flowers, garden soil, cave mouth |

## Tools built (in `tools/`)

- **`slice-sheet.ts`** — slice a chroma-keyed sheet into a packed 32px atlas + a labeled
  inspection PNG. Auto-detects the magenta gutter grid; `--force NxM` divides the content
  bbox evenly for sparse sheets (e.g. cliffs, where mostly-empty tiles fool gutter detection).
  Area-downscales; chroma-keys (magenta + pink antialias fringe: `r>150 & b>130 & g<min(r,b)-40`).
  Args: `--sheet --out --inspect --cell 32 --inset N --scale N --gutter 0.85 --force NxM`.
- **`extract_objects.py`** — connected-component labeling to pull irregular object sprites
  out of an object sheet; saves transparent PNGs to `assetsources/curated/objects/` + a
  labeled contact sheet.
- **`derive_layout_from_mockup.py`** — crops the mockup's magenta frame, downsamples to the
  110×72 grid, classifies each cell (water/grass/tree/cliff/sand/road/border) into an ASCII
  layout (`assetsources/mockup/layout.txt`) + a false-color preview. Reliable for areas
  (water, trees, beach); linear features (roads, cliffs) are too color-ambiguous → authored.
- **`author-roads.ts`** — replaces noisy auto-extracted road cells with a clean waypoint
  graph traced off the mockup, rasterized as orthogonal L-paths (bend chosen to avoid water).
  Writes `assetsources/mockup/layout-authored.txt`.
- **Render / yardstick tools** (pure pngjs, no browser):
  - `render-northwood-full.ts` — composite the *current* atlas over stage layers (baseline).
  - `render-northwood-water-slice.ts` — water-only dual-grid proof.
  - `render-northwood-ground.ts` — water + roads over the original stage.
  - `render-northwood-skeleton.ts` — render the mockup-derived layout (water+roads+grass).
  - `render-northwood-trees.ts` — skeleton + water de-speckle + beach + scattered trees.

## Derived auto-tiling conventions (index == mask)

- **Water** — CORNER-Wang, rendered on the **dual grid** (marching squares). Tile drawn at
  `((j-0.5)*ts,(i-0.5)*ts)`; its 4 quadrants = cells NW=(i-1,j-1) NE=(i-1,j) SE=(i,j) SW=(i,j-1).
  `mask = NW·1 | NE·2 | SE·4 | SW·8`. Verified: tile index == this mask exactly.
- **Road** — EDGE-Wang, same grid. `mask = N·1 | E·2 | S·4 | W·8`. Verified via synthetic
  cross (clean connections + rounded dead-end caps). Needs *connected* road data (thin
  diagonal runs render as isolated blobs — hence `author-roads.ts`).
- **Cliffs** — south-facing rock WALL drawn below a height drop, from the `newtiles3`
  **A4 wall block** (`cliff-wallblock.png`, a 3×3: grassy-lip row / rock-face row / grassy-base
  row × left-cap / straight / right-cap columns). Driven by an **integer elevation field**
  (`elevation.txt`): a wall of height `Δ` tiles is placed wherever `h(r,c) > h(r+1,c)`, run-ends
  picking the cap column. `newcliffs1`/`newcliff2` are an alternative wall-OUTLINE autotile
  (perimeter rock overlaid on plateau-top fill); the A4 block reads bolder, so it is the
  primary. `plateau-top.png` (16-tile corner-Wang) is reserved for tinting the plateau surface.

## Cliff / elevation derivation

Color-classifying cliffs per-cell is too noisy (faces alias with shadowed trees — see the
brown speckle in `mockup-classified.png`). Instead derive an **elevation field** and let the
height drops place walls:

- **`derive_elevation.py`** — downsamples the mockup, detects the dark warm-brown cliff *faces*
  (`bright<95 & r≥g & (r−b)>18` — separates brown rock from dark-green trees), then per column
  walks south→north integrating a height level (`+1` after each face band crossed). The raw
  per-column field is median-smoothed across rows so tiers align into coherent plateaus, water/
  void is pinned to the lowest level, and the result is written as digit-per-cell
  `assetsources/mockup/elevation.txt`. The render reads this field, not the raw cliff pixels.

## Recreate from scratch

```bash
cd /mnt/nxt-dev/tib-northwood-parity   # worktree with art sheets present

# 1. Slice terrain Wang sets
node tools/slice-sheet.ts --sheet assetsources/newtiles1-fixed.png \
  --out assetsources/curated/sliced/water-wang.png \
  --inspect assetsources/curated/sliced/water-wang-inspect.png --inset 14 --gutter 0.85
node tools/slice-sheet.ts --sheet assetsources/newtiles2.png \
  --out assetsources/curated/sliced/road-wang.png \
  --inspect assetsources/curated/sliced/road-wang-inspect.png --inset 16 --gutter 0.85

# 2. Extract object sprites (trees, etc.)
python3 tools/extract_objects.py            # -> assetsources/curated/objects/, contact sheet

# 3. Derive layout from the mockup, then author clean roads
python3 tools/derive_layout_from_mockup.py  # -> assetsources/mockup/layout.txt + previews
node tools/author-roads.ts                  # -> assetsources/mockup/layout-authored.txt

# 4. Slice the A4 cliff wall block + plateau-top set from newtiles3
node tools/slice-sheet.ts --sheet assetsources/newtiles3.png \
  --out assetsources/curated/sliced/plateau-top.png \
  --inspect assetsources/curated/sliced/plateau-top-inspect.png --force 4x4   # + a manual wall-block crop

# 5. Derive the elevation field from the mockup's cliff faces
python3 tools/derive_elevation.py           # -> assetsources/mockup/elevation.txt + preview

# 6. Render the parity yardstick (terrain + trees + cliffs)
node tools/render-northwood-trees.ts        # -> artifacts/northwood-trees.png
```

## Status

- Done (offline render, parity-grade): island silhouette, water bodies + shores, grass base,
  dense conifer forest, connected dirt roads, first-pass beach.
- In progress: **cliffs** — A4 wall block sliced (`cliff-wallblock.png`) and proven via a
  synthetic plateau (`artifacts/_synthetic-cliff.png`); render currently draws south-facing
  walls only at land→water/void edges (binary elevation). Replacing that with the integer
  **elevation field** (`derive_elevation.py`) so interior tiers get walls too.
- Done: **plateau-top tint** — the raised top tier is lifted toward the plateau art's
  lit warm-grass colour (sampled mean, lerped over the base grass; *not* tile-stamped, which
  grid-patterned), faded at wall-less tier edges. Reads as raised vs the greener basin.
- Done: **stairs/ladders** — wooden-plank steps drawn procedurally (no matching art in the
  sheets; town stairs are grey stone) and inset into the rock wall wherever a road crosses a
  cliff drop (`at(r,c)=='t' || at(r-1,c)=='t'`, ~18 spots). Tread = road tan so the path reads
  as continuous; rung phase keyed to absolute y so steps align across stacked wall cells.
- Done: **bespoke cliff art wired in** — `tools/slice-cliff-set.py` slices the generated
  `assetsources/curated/bespoke/northwood-cliff-set-v1/` sheet (connected-component extraction
  + alpha-aware downscale, no fringe) into `cliff-face.png` (5col×3row), `ladder.png` (3),
  `plateau-wang.png` (16). The render now uses the bespoke **cliff-face** (Group B) for south
  walls and the wooden **ladder** (Group C) for stairs — replaces the old `cliff-wallblock` and
  the procedural `paintStair`. Big style upgrade; matches the mockup's tan faceted rock.
- ⚠️ **Group A (plateau-top corner-Wang) is NOT usable as generated** — the agent didn't follow
  the `NW1|NE2|SE4|SW8` convention: only 9/16 corner configs present, with duplicates. So N/E/W
  grassy plateau rims are still NOT done; the plateau still uses the colour tint. Needs a Group-A
  regen with an explicit per-tile corner spec (or a different rim approach).
- Done: **tree magenta halo** — extractor chroma key floor lowered (`r>55&b>55&g<min-18`, was
  `r>140`) to catch dark purple drop-shadows; render's sprite blit also skips residual purple.
- Done: **wall continuity** — the per-column integrator left ragged boundaries and thin
  vertical "fingers" (each only walls at its south tip → fragmented lines). `derive_elevation.py`
  now cleans the field per level: morphological close (fill pin-holes) + open×2, then a strong
  **wide-horizontal median** (±6, ×3) that outvotes 3-4-cell fingers while preserving long
  horizontal tiers. Drop-edges now run as long lines. Render also keeps trees off wall-face cells
  so the cliff line reads unbroken.
- Remaining: south-only walls still gap where a tier boundary runs N–S for a few cells (no E/W
  wall art); could add a 3rd tier; proper sand-water shoreline, grass variation/flowers, prop
  vignettes (garden/cave/boulders/logs), then **bake into the engine** (atlas rebuild from sliced
  art + auto-tiling in `src/main.ts` + import + tests + in-game verification).
```
