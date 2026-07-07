# Battle Stage Readability V3

Status: complete.

This report stub was created before long asset processing and screenshot loops.

## Scope

- Preserved the accepted Ruined Crossing flat-board terrain/compositor direction.
- Updated runtime actors from `actor-slicing-v2` to `actor-readability-v3`.
- Kept the V2 equal-cell contract: `96x96` cells, 4 columns, 6 rows, poses in `idle`, `windup`, `hit`, `move` order, centered anchors, locked per-role baselines.
- Cleaned and resliced the existing generated low-res actor source; no actor art was regenerated.
- Reduced shrine/intent visual competition by lowering objective badge/glow weight, putting intent strokes behind actors, and replacing red-dominant intent strokes with high-value outlined arrow shapes that survive grayscale.

## Actor Contract

- Runtime sheet: `assets/generated/actor-readability-v3/generated-low-res-actor-poses.png`
- Runtime manifest: `assets/generated/actor-readability-v3/manifest.json`
- Artifact manifest: `artifacts/battle-stage-readability-v3/actor-runtime-manifest.json`
- Validator: `artifacts/battle-stage-readability-v3/actor-slicing-validator.md`
- Source used: `artifacts/battle-stage-generated-low-res-actors-v1/generated-actor-source.png`
- Frame size: `96x96`
- Grid: 4 columns x 6 rows
- Frame order: `idle`, `windup`, `hit`, `move`
- Anchor/baseline: each role uses `anchor.x=48`; role baseline is locked and every pose content bottom validates against that baseline.

## Actor Changes

- Simplified painterly interior texture through lower color counts and harder value grouping.
- Strengthened dark outer silhouettes and pale rims, especially on Grave Skitter and Grave Archer.
- Increased Grave Skitter/Grave Archer board-scale runtime frame sizing in CSS so their silhouettes do not disappear into terrain values.
- Preserved generated bitmap sprites; no CSS/procedural actors or icon stand-ins were introduced.

## Shrine And Intent Changes

- Objective shrine art and badge are dimmer and less saturated, reducing competition with units.
- Enemy intent arrows now use pale high-value bodies with dark strokes and arrowheads, reducing red-only dependency.
- Intent z-index was lowered so arrows sit behind actors instead of cutting across unit silhouettes.
- Enemy chip/ring styling was quieted so labels and red threat badges compete less with the shrine cluster.

## Proof

- Source/contact sheet: `source-actor-contact-sheet.png`
- Processed runtime sprite sheet: `processed-actor-sprite-sheet.png`
- Slicing/debug proof: `slicing-debug-contact-sheet.png`
- Final-size color/grayscale proof: `final-size-actor-contact-sheet.png`
- Desktop runtime: `battle-stage-readability-v3-desktop.png`
- Mobile runtime: `battle-stage-readability-v3-mobile.png`
- Grayscale runtime: `battle-stage-readability-v3-grayscale.png`
- Runtime proof report: `runtime-proof.md`
- Media copies: `~/.openclaw/media/tib-gathering/battle-stage-readability-v3/`

## Verification

- `git -C /mnt/nxt-dev/tib-gathering rev-parse --short HEAD`: passed, `001387de`
- `python3 scripts/process-actor-readability-v3.py --source artifacts/battle-stage-generated-low-res-actors-v1/generated-actor-source.png --artifact-dir artifacts/battle-stage-readability-v3 --runtime-dir assets/generated/actor-readability-v3`: passed.
- `npm run build`: passed.
- `node scripts/capture-battle-stage-readability-v3.mjs`: passed, used port `5220`; script stopped the dev server.

## Visual Read

- Compared with `battle-stage-actor-slicing-v2`, board-scale actors are more readable because interiors are simpler, outlines are stronger, and the weakest enemies have clearer light/dark separation.
- Grayscale intent is improved: arrows remain visible as shapes/values rather than red hue.
- Shrine cluster is less overloaded than V2 because intent is behind actors and badge/glow weight is reduced, though it remains the densest part of the board by design.

## Caveats

- Grave Archer is intentionally high-contrast and warmer than V2 to break it out of brown terrain; it may be slightly aggressive stylistically but is much more legible at board scale.
- The shrine tile still carries objective, attack, and unit context in one region; this pass reduces competition without removing tactical information.
