# Agent Brief: Stage Asset Spec (imagen → bespoke stage assets → assembled stage)

Read this before generating stage art with imagen or assembling a stage from it.
Companion to `docs/agent-enemy-asset-brief.md` (creatures) — this brief covers
**terrain fills, transitions, decorations/props, and stage assembly**.

Style source of truth: `docs/terrain-style-bible.md`.
Assembly source of truth: `world_crafting_spec.md` (the Northwood pipeline) and
`STAGE-ART-DIRECTION.md`. Where they disagree with this brief, those win.

## The One Rule That Prevents Chaos

**Imagen makes materials and props. Code makes tiles and stages.**

You never ask imagen for a tile that has to connect to another tile (edges,
corners, Wang sets, shorelines, cliff runs) and you never ask it for a whole
scene to copy. Image models cannot honor pixel connection contracts — that is
how past stages became incohesive. Connection art is **synthesized** from
approved fills by tools, so edges match by construction.

| Asset | Imagen? | Path |
|---|---|---|
| Ground fill texture | ✅ as raw input only | imagen swatch → `tools/normalize-terrain-fill.py` → gated 32px fills |
| Transition/edge/Wang tiles | ❌ never | synthesized from two approved fills |
| Cliff faces / elevation art | ❌ never directly | built from the stage's own approved tiles (see desert relief lesson) |
| Decorations/props (bushes, stones, ruins, furniture) | ✅ | magenta-key sheet → keyed sprite objects |
| Set pieces (huts, statues, bridges) | ✅ | same prop path, placed as `objects[]` |
| Creatures | ✅ | `docs/agent-enemy-asset-brief.md` (separate pipeline) |
| Whole-scene mockups | reference only | palette/mood inspiration — never a parity target |

## Non-Negotiable Contract (terrain fills)

- 32px, seamless on a torus, deterministic tooling output — never a hand-saved crop.
- One material = one 5-step ramp (dark→light) around an approved anchor.
  Existing anchors live in `docs/terrain-style-bible.md`; new biome anchors get
  approved there first.
- Hard gates (mechanical, enforced by `tools/normalize-terrain-fill.py`):
  ≤16 colors, ≥95% ramp adherence, ≤2% isolated pixels, seam-ratio ≤1.6.
- Style: quiet 2-value base + **drawn, non-touching detail clusters** at 2–4px
  sprite grain. No noise-blob texture, no outlines on ground, top-left light.
- 3–4 variant fills per material (the tool emits variants) so the baker can
  break grid repetition by position hash.

## Frozen Imagen Prompt Templates

Fill texture swatch (the only terrain thing you may generate):

```text
A flat top-down pixel-art ground texture swatch of {MATERIAL_DESC}, seamless
organic texture, restrained palette of 5 shades of {ANCHOR_COLOR_DESC}, small
2-4px pixel clusters, even visual weight with no focal point, no objects, no
border, no lighting gradient across the image, crisp pixel-art finish, no blur.
Square image, texture fills the entire frame edge to edge.
```

(Gradient-free matters: lighting gradients across the swatch fail the seam gate.
Generate large, let the tool crop variants.)

Decoration prop (same discipline as the enemy bible):

```text
Create a single top-down RPG decoration sprite on a perfectly flat pure magenta
#ff00ff background for chroma-key extraction.
Subject: {PROP_DESC}
Style: old-school top-down RPG prop with strong dark outline, restrained 12-24
color palette, crisp pixel-art clusters, top-left lighting, readable at game
scale (~{TILES} tiles wide). Do not use magenta inside the prop. No drop shadow
(the engine renders contact shadows).
```

## Files To Start With

- Style bible: `docs/terrain-style-bible.md`
- Normalize + gates: `tools/normalize-terrain-fill.py` (`--src <imagen.png> --material <m>`)
- Candidate/recipe reference: `tools/make-terrain-fill-candidates.py` (the drawn
  tuft/stone/glint cluster recipes — `cand_tuft`)
- Review sheet: `artifacts/terrain-style/terrain-fill-candidates.png` (harmony A/B
  strips show the approved look)
- Assembly pipeline: `world_crafting_spec.md` §8 + its System Injection Prompt
- Stage baker template: `tools/build-northwood-from-authored.ts`; importer:
  `tools/import-asset-forge-stage.ts`
- Prop intake pattern: magenta key + defringe (see `defringeMagentaRim` /
  `isMagentaKey` usages in `tools/`)

## Assembling A Stage (order matters)

1. **Materials first.** Approve fills (normalize → gates → contact sheet with a
   tree + an approved enemy composited on top) BEFORE any layout work.
2. **Layout is data:** `layout-authored.txt` + `elevation.txt` semantic chars
   (collision contract — see `world_crafting_spec.md` §1/§3a). Geometry changes
   require flood-fill reachability + anchor checks.
3. **Bake:** locked passes (base fill w/ variants → water Wang → plateau/road
   edge Wang → dither bands → cliffs → AO). Transitions come from the
   synthesizer, never from imagen.
4. **Props as `objects[]`** (depth-sorted, contact-shadowed), density ~16% gate
   on open ground, spacing rules, gameplay anchors reserved from content YAML.
5. **Verify in-game, not as a PNG:** `npm run workflow:<zone>`, walk it,
   screenshot at runtime zoom next to Northwood for the cohesion contact sheet.

## Common Mistakes To Avoid

- Do not ship raw imagen output as tiles — everything goes through the
  normalize gates.
- Do not generate transition/corner/edge art with imagen. Ever. (Road-corner
  saga: ~20px arm misalignment, 6 failed fix attempts.)
- Do not chase pixel parity with an imagen mockup — match the bible, not the
  picture.
- Do not invent semantic chars or paint visuals that change collision; visual
  refs and collision chars are decoupled (base/fringe layers).
- Do not hand-edit baked atlases; edit sources and re-bake (idempotent tools).
- Do not bake drop shadows into props; the engine owns contact shadows.
- Do not accept a fill whose tiled 4×4 preview shows an obvious grid or focal
  point — regenerate variants instead.
- Do not skip the harmony composite (fill + tree + approved enemy) before
  asking for review.

## Done Means

- Every new fill passes `normalize-terrain-fill.py` gates (report committed
  next to the fills).
- Variants exist (≥3) and the baker distributes them by position hash.
- Transitions for every adjacent material pair exist and came from the
  synthesizer.
- Props are keyed clean (no magenta fringe), depth-sorted, shadowed, and
  respect gameplay anchors.
- `npm run workflow:<zone>` green; reachability/anchor checks pass.
- A runtime-zoom screenshot next to Northwood is attached for review, plus the
  harmony composite.
