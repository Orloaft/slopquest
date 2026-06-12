# Enemy Sprite Style Bible

This document is the single source of truth for enemy sprite style. Until a
player-specific bible exists, the player sprite baseline should follow the same
sheet contract, prompt discipline, artifact review, and validation gates. The
player may read slightly cleaner, more appealing, and more immediately legible
than the enemy roster, but that is probe guidance only; a player-specific bible
is still a follow-up, not current authority.

## Approved Anchor

The approved style anchor is
`assetsources/curated/bespoke/woodland-enemies-v2/reach_vole/prototypes/reach-vole-imagen-magenta-prompt.md`
plus the approved magenta reach vole preview/GIF from that probe.

Use the anchor for silhouette language, outline weight, palette restraint,
lighting, readability, and motion expectations. Do not treat older manifests or
pipeline prompts as style authority unless they are revised and linked here.

## IP Boundary

Use readable old-school top-down RPG grammar in the broad Tibia-era tradition:
clear creature silhouettes, compact walk cycles, strong direction reads, and
crisp tile-scale presentation. Do not copy Tibia assets, creatures, poses,
palettes, layouts, or identifiable details.

## Source Sheet Contract

- Format: `4x4`, `384x384` preferred.
- Cells: `96x96`.
- Rows, in exact order:
  - `walk_up` / back
  - `walk_right`
  - `walk_down` / front
  - `walk_left`
- Frames: `4` authored frames per row.
- Facings: every row must be authored. Do not use flip, mirror, darken, or
  recolor substitutions for missing facings.
- Background: generate on pure magenta `#ff00ff` for extraction.
- Creature pixels: never use magenta `#ff00ff` inside the creature.

## Visual Rules

- Strong dark outline that survives runtime scale and motion.
- Restrained palette, roughly `12-24` colors. The review target is `24` opaque
  colors; prototype review may use `--max-colors 32` only when the extra colors
  come from imagegen edge cleanup or anti-aliasing, not painterly/noisy
  rendering. Anything above `32` is a style failure unless explicitly approved.
- Top-left lighting with consistent highlights and shadow placement.
- Top-down readability first: the creature must read clearly at gameplay size.
- Hostile/natural creature design, not mascot-like or plush.
- Crisp pixel-art finish with clean clusters and hard edges.
- No painterly blur, soft smearing, over-detail, or texture noise that collapses
  at runtime.

For the base player probe, cleaner protagonist contrast is acceptable: the
player can be slightly more appealing and readable than hostile/natural enemies.
It must still share the same sheet contract, outline discipline, top-left
lighting, palette restraint, and runtime-scale review.

## Motion Rules

- Each authored frame must show measurable paw, body, and/or head pose changes.
- Motion should feel alive while keeping stable scale, baseline, and center
  alignment.
- No row may pass review if the walk cycle is only a simple flip, mirror,
  darken, recolor, or tiny translation.

## Frozen Prompt Template

Use this template as the base prompt and replace only the variable slots.

```text
Create a 4x4 pixel-art sprite sheet on a perfectly flat pure magenta #ff00ff
background for chroma-key extraction.

Subject: {SUBJECT}
Body plan: {BODY_PLAN}
Fantasy accents: {FANTASY_ACCENTS}
Palette notes: {PALETTE_NOTES}
Scale notes: {SCALE_NOTES}

Style: old-school top-down RPG creature sprite with strong dark outline,
restrained 12-24 color-ish palette, crisp pixel-art clusters, top-left lighting,
hostile/natural tone, and clear gameplay readability. Do not copy Tibia assets.

Sheet contract: 384x384 preferred, 4 columns by 4 rows, 96x96 cells. Row order
is walk_up/back, walk_right, walk_down/front, walk_left. Author 4 unique frames
per row with visible paw/body/head pose changes and stable scale/alignment.
Do not use flip, mirror, darken, or recolor substitutions for any facing.
Do not use magenta inside the creature.
```

Variable slots:

- `SUBJECT`
- `BODY_PLAN`
- `FANTASY_ACCENTS`
- `PALETTE_NOTES`
- `SCALE_NOTES`

## Required Review Artifacts

Every candidate must produce and preserve:

- Raw magenta sheet.
- Cleaned/keyed transparent sheet.
- Source-scale contact sheet.
- Runtime-scale contact sheet.
- Walking GIF.
- Gate report.

## Validation Gates

A sprite is not runtime-ready until it passes all gates:

- Magenta purity: generation background is pure `#ff00ff`, with no fringe after
  keying.
- Grid population: all `16` cells are populated.
- Palette cap: palette remains restrained and reviewable.
- Runtime readability: the source sheet also reads in the runtime-scale contact
  sheet, not only at `96x96` source-cell scale.
- Row order: rows match `walk_up`, `walk_right`, `walk_down`, `walk_left`.
- Scale/alignment: creature scale, footprint, baseline, and center remain stable.
- Measurable motion: each walk row has visible authored motion.
- Authored facings: no simple flip, mirror, darken, or recolor substitution.
- Transparency: cleaned/keyed corners are transparent.
- Review before runtime: raw sheet, keyed sheet, source-scale contact sheet,
  runtime-scale contact sheet, GIF, and gate report must be reviewed before
  copying into `public/`.

## Rollout Plan

1. Run prototype probes first: reach vole regeneration, biped enemy, flyer or
   odd-body enemy, and base player.
2. Apply the approved process to enemies after the probes prove coverage across
   body plans.
3. Apply the same discipline to players until a player-specific bible exists.
4. Prefer baked outfit variants for v1 over paper-doll layering unless later
   registration tests prove layering can preserve alignment, outline, and motion.

## Legacy Cleanup Notes

The following files are useful historical or pipeline references, but they are
not style authority until revised and explicitly linked from this bible:

- `tools/generate_woodland_enemy_sprites_v2.py`
- `tools/validate_enemy_asset_pipeline.py`
- `assetsources/curated/bespoke/enemy-directional-4x4-v2-imagegen/PROMPT.md`
- Existing enemy-directional manifests in that legacy area.
