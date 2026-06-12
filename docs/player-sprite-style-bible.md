# Player Sprite Style Bible Draft

This document is draft/probe authority for player sprite experiments. It is not
final bulk-production authority, and it should be revised after the base player
probe proves the runtime read, registration, and outfit-variant risks.

Use `docs/enemy-sprite-style-bible.md` for the shared sheet contract, prompt
discipline, artifact review, and validation gates. Player sprites may diverge in
tone: the player should be cleaner, more appealing, and easier to identify than
hostile naturalistic enemies.

## Source Sheet Contract

- Format: `4x4`, `384x384` preferred.
- Cells: `96x96`.
- Rows, in exact order:
  - `walk_up` / back
  - `walk_right`
  - `walk_down` / front
  - `walk_left`
- Frames: `4` authored frames per row.
- Background: generate on perfectly flat pure magenta `#ff00ff` for extraction.
- Player pixels: never use magenta `#ff00ff` inside the character.
- Scope: walk sheet only. Do not request or import attack/action rows unless
  runtime requirements prove the need and a matching action-sheet process is
  documented.

## Tone Direction

- Read as a protagonist first: clear, approachable, capable, and iconic at game
  scale.
- Use old-school top-down RPG readability without copying Tibia assets, poses,
  palettes, layouts, or identifiable details.
- Keep the silhouette simpler and more stable than enemies, with cleaner outfit
  shapes and fewer noisy texture details.
- Preserve a strong dark outline, crisp pixel clusters, top-left lighting, and
  restrained colors that survive runtime scaling.
- Avoid enemy-coded hostility, mascot exaggeration, oversized weapons, ornate
  class gear, logos, capes, or details that would lock the base into one build.

## Player Stability Rules

- Baseline, center, footprint, and head height should be stricter than enemy
  tolerance because the player is always on screen.
- Front, back, and side reads must feel like the same person, not four costume
  variants.
- Walk motion should be visible but modest: enough leg/arm change to avoid a
  static slide, without bobbing that shifts the apparent collision footprint.
- The base sheet is the identity lock for later player work. Any future action
  or outfit sheet must match its proportions, outline weight, palette family,
  gear placement, and silhouette before import.

## Runtime Review

Review every probe at source scale and runtime scale before approval. The
runtime-scale contact sheet is decisive: the player must remain readable,
centered, and distinct from small enemies when reduced to gameplay size.

Manual review should check:

- Stable foot contact and baseline across all four frames in each row.
- Stable horizontal center, especially between right and left facings.
- Head/torso/legs separation at runtime scale.
- Outfit colors distinguish the player from terrain and current enemy probes.
- No magenta fringe, semi-transparent halo, blur, or soft painted edges after
  keying.

## Outfit Variant Caution

Prefer baked outfit variants for v1. Paper-doll layering should wait until
registration tests prove that separate hair, body, clothing, and gear layers can
preserve alignment, outline, lighting, and walk motion without jitter.

Each baked variant should start from the approved base player's proportions and
registration. Treat variants as identity-preserving edits, not new character
redesigns, unless the runtime has explicit support for multiple body baselines.

## Open Questions Before Bulk Rollout

- What exact runtime display size should player approval target: current `32x32`
  review scale, a larger player frame, or both?
- Should the player be slightly taller than small enemies, and if so what is the
  maximum allowed occupied height inside each `96x96` cell?
- What colors are reserved for default player identity versus future outfit
  variants?
- Does the base player need separate idle/action sheets, or is walk-only enough
  for the next playable milestone?
- How much baseline drift is acceptable once the character is rendered against
  real maps, camera movement, and multiplayer interpolation?
- What evidence is required before paper-doll layering is allowed into runtime?
