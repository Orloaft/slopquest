# Battle Stage Generated Low-Res Actors V1 Runtime Proof

- Dev server: http://127.0.0.1:5220
- Screenshots:
  - battle-stage-generated-low-res-actors-desktop.png: 1440x900
  - battle-stage-generated-low-res-actors-mobile.png: 760x1280
  - battle-stage-generated-low-res-actors-grayscale.png: 1440x900 grayscale
- Content check: 8x8 Ruined Crossing board, existing flat terrain direction, Iron Guard selected, Verdant Ranger, Radiant Acolyte, Grave Skitter, Stone Brute, Grave Archer, shrine objective, enemy intent arrows, target highlights, and combat UI are all present.
- Actor pass: all board actors now render from the generated bitmap sprite sheet at assets/generated/generated-low-res-actors-v1/generated-low-res-actor-poses.png, replacing the procedural CSS actor construction used in the rejected pass.
- Animation-readiness proof: selected-unit HUD includes idle, windup, hit, and move pose frames from the same generated Iron Guard row; enemy board sprites use their generated windup frames so threat is readable by pose/value in addition to arrows.
- Terrain preservation: the previous flat-board surface, decal, grid, and skirt stack remains in place; terrain art was not regenerated or redesigned.
- Grayscale check: player/enemy separation uses outline weight, body value, shape, threat wedges, and labels rather than hue alone.
- Source proof: actor-generation-prompt.md, generated-actor-source.png, generated-actor-contact-sheet.png, processed-actor-sprite-sheet.png, and actor-runtime-manifest.json are in this artifact folder.
- Runtime mapping: rows 0-5 map to Iron Guard, Verdant Ranger, Radiant Acolyte, Grave Skitter, Stone Brute, and Grave Archer; columns 0-3 map to idle, windup, hit, and move.
- Delivery copies: ~/.openclaw/media/tib-gathering/battle-stage-generated-low-res-actors-v1/
- Generation tool: built-in `image_gen` tool, then local Pillow processing with `scripts/process-generated-actor-sheet.py`.
- Processing command: `python3 scripts/process-generated-actor-sheet.py --source artifacts/battle-stage-generated-low-res-actors-v1/generated-actor-source.png --artifact-dir artifacts/battle-stage-generated-low-res-actors-v1 --runtime-dir assets/generated/generated-low-res-actors-v1`.
- Verification: `npm run build` passed; `npm run screenshots` passed and captured from dev server port 5220.
- Visual read: actors now read as authored low-res tactical sprites with role-specific silhouettes and generated pose frames, not procedural placeholder tokens. The source sheet is still imagegen output rather than hand-authored final pixel art, so a later production pass should tighten frame-to-frame registration before combat animation ships.
