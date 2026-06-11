# Terrain Style Bible

Companion to `docs/enemy-sprite-style-bible.md`. That document governs creatures;
this one governs **terrain**: ground fills, transition/edge tiles, cliffs, water,
and roads. Props and trees follow the enemy bible's spirit (outline, readability)
until a dedicated prop bible exists.

Status: direction APPROVED by Alex 2026-06-11 (tuft rendering language + contact
shadows + variant fills). Per-biome anchors remain open for tuning as stages are
piloted. Agent workflow: `docs/agent-stage-asset-brief.md`.

## Core principle: the ground is the quietest layer

Visual hierarchy, loudest to quietest:

1. Player and enemies — strong outline, saturated accents, motion.
2. Trees, props, set pieces — outlined, mid detail.
3. **Terrain — restrained ramps, soft clusters, no outlines, lowest contrast.**

Most current terrain breaks this: per-pixel hash noise (688–998 colors in a single
32px tile, measured on the live Northwood atlas) competes with sprite detail and
reads as static at runtime scale. The enemy bible already bans "texture noise that
collapses at runtime" for sprites; this bible extends that ban to the ground.

## Material rules

- **Ramp:** each material is a single ramp of 4–6 core colors (dark→light) around
  one anchor color. Hard cap after bake: **≤16 distinct colors per 32px tile**
  (review cap 24 when extra colors come from transition blending, not noise).
- **Drawn clusters, not noise:** texture detail is *drawn shapes* (grass tufts,
  stones, wave glints) with the material's light direction baked in (shadow base,
  lit top-left tip) — never thresholded noise blobs. Noise is allowed only as the
  base mottle (below). No isolated single-pixel speckle; ramp extremes stay
  sparse (roughly ≤10% of pixels each).
- **Quiet base + sparse detail (the SLYNYRD rule):** each fill = a near-flat
  2-value base mottle (large soft patches, ≤6% value difference) + scattered
  detail clusters. **Key clusters must not touch each other** (corner-touch is
  acceptable); negative space between them is mandatory. Visual weight stays
  evenly distributed so no spot in the tile draws the eye.
- **Detail scale matches sprites:** cluster elements are 2–4px, the same grain
  as the enemy roster's pixel clusters, so ground and sprites read as one
  rendering language — the ground is just *quieter*, not *flatter*.
- **Contrast budget:** terrain value range stays inside roughly half the value
  range of the enemy roster. If a ground tile would read as a sprite in grayscale,
  it is too loud.
- **No outlines on ground materials.** Outlines belong to sprites and props.
  Material boundaries are handled by transition tiles (below).
- **Light:** one global top-left light, same as the enemy bible. Applies to
  cliffs (lit top/lip, shaded face, AO at the foot) and any beveled edge.
- **Seamless by construction:** every fill must tile on a torus (verified
  mechanically, not by eye).

## Palette anchors (Northwood pilot)

- grass `#698f1c` (the approved lush green — replaces olive `#b9b23e` as the
  dominant ground), ramp `#426212 #557916 #698f1c #769e23 #86b02e`
- road `#e3a036`, ramp `#a06a22 #c4882c #e3a036 #edb14d #f5c168`
- water `#087595`, ramp `#04506e #066382 #087595 #1587a6 #2f9fb8`

New biomes: pick one anchor per material, derive the ramp the same way, and keep
saturation/value inside the band the enemy roster establishes for that zone's
palette. Anchors are recorded here per biome as they are approved.

## Making the world feel alive (not just clean)

Cohesion gets the world *quiet*; aliveness comes from three cheap, systematic
layers on top of it:

1. **Variant fills.** 3–4 seed-variants per material (same recipe, different
   scatter), distributed per cell by position hash. Kills grid repetition —
   one repeated tile always reads as a grid no matter how good it is.
2. **Contact shadows under everything.** A soft dark ellipse under every entity,
   tree, and prop (and the already-proven cliff-foot AO). This is an **engine
   render item, not an art item**, and it is the single biggest "sits in the
   world" win — validated in the harmony B strip.
3. **Decoration density.** Depth-sorted props (tufts, flowers, stones, logs,
   bushes) at Northwood's proven 16% gate, with spacing rules, each with its
   contact shadow. Ground texture stays quiet *because* the decoration layer
   carries the life.

## Edges and transitions

- Every adjacent material pair gets a **synthesized transition set** (16-tile edge
  Wang and/or corner Wang), generated from the two approved fills — never drawn
  free-hand, never generated whole by an image model. Synthesis guarantees
  pixel-identical connection points (lesson of the road-corner saga).
- **Collar:** the harder/higher material wears a 1–2px darker collar at the
  boundary (road edge, water bank, cliff lip). Collar color = darkest ramp step
  of the louder material.
- Dither is allowed only inside transition bands (shorelines, road feather),
  never as open-field texture.

## What image generation is for (and not for)

- ✅ Props, set pieces, sprites, mood/palette reference sheets.
- ✅ Fill *texture candidates* — but only as raw input to the normalize pass
  below. Raw imagen output never ships as a terrain tile.
- ❌ Transition/edge tiles, Wang sets, or anything with a connection contract.
- ❌ Whole-scene mockups as parity targets.

**Normalize pass (mandatory for any fill, imagen or procedural):** quantize to the
material ramp → mode-filter into clusters → enforce seamlessness → color-count
gate. `tools/make-terrain-fill-candidates.py` implements this pipeline and also
generates procedural candidates directly from the ramps.

## Validation gates (mechanical, per tile / per bake)

- Color count: ≤16 per fill tile (≤24 for transition tiles).
- Seamlessness: tile 2×2; edge-row pixel diff must be zero.
- Cluster check: no isolated single-pixel colors above 2% of tile area.
- Ramp adherence: ≥95% of pixels within a small distance of the material ramp.
- Contact sheet: every candidate reviewed tiled 4×4 at 2× **with** a tree sprite
  and an enemy frame composited on top (harmony check), plus an in-game
  screenshot at runtime zoom before sign-off.
- After re-bake: stage `:check`, `typecheck`, and generated-stage tile indices
  byte-identical when only materials changed (visual-only change proof).

## Pilot: Northwood re-material

Keep layout, elevation, trees, objects, collision — swap only the material fills
(grass, road, water, cliff) and regenerate transitions from them. Success = the
map visibly joins the same game as the new enemy roster, with zero gameplay diff.
Candidate fills live in `artifacts/terrain-style/fills/`; review sheet at
`artifacts/terrain-style/terrain-fill-candidates.png`. The **tuft** candidates
implement this bible's full recipe (quiet 2-value base + drawn, non-touching
clusters + sprite-scale grain) and are the recommended direction — see the
harmony A/B strips at the bottom of the sheet (proc/flat vs tuft+shadows).

## Known debts this bible does not yet cover

- Trees/props are painterly (~7k distinct colors) but read well thanks to value
  structure and outlines; they stay as-is for now. A prop bible is follow-up.
- Cliff face re-material (repetitive columnar texture) — needs its own candidate
  round after the flat materials are approved.
- The visible tile-grid seam in in-game grass rendering (sampling bleed?) is a
  renderer bug to investigate separately; no amount of material work hides it.
