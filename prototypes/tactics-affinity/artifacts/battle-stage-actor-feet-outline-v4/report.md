# Battle Stage Actor Feet/Outline V4 Report

## Scope
- Rejection/fix pass for actor pipeline only: feet/lower silhouettes, cell slicing proof, and dark outline/halo removal.
- Terrain direction and HUD layout were left alone except the runtime actor sheet/version pointer and sprite-shadow compatibility CSS.

## Processing Changes
- Added `scripts/process-actor-feet-outline-v4.py`.
- Runtime output: `assets/generated/actor-feet-outline-v4/generated-low-res-actor-poses.png`.
- Manifest version: `battle-stage-actor-feet-outline-v4`.
- Frame contract remains `96x96`, 4 columns x 6 rows, pose order `idle`, `windup`, `hit`, `move`, centered `x=48` anchors.
- Keyed source cells now receive transparent side/top/bottom padding before slicing.
- Humanoid roles receive small bitmap foot/boot patches where the generated source sat on the crop edge.
- The V3 dilated black outline pass is removed. Dark perimeter pixels are softened into role-local edge colors instead of adding a uniform black stroke.
- Contact shadow is not baked into the sheet; runtime keeps a separate CSS ellipse below the feet.

## Validation Summary
- `processed-actor-sprite-sheet.png`: 384x576.
- `source-actor-contact-sheet.png`: 1088x826.
- `slicing-debug-contact-sheet.png`: 1324x1833.
- `final-size-actor-contact-sheet.png`: 626x540.
- Validator result: every frame stays inside its `96x96` cell.
- Human/humanoid bottom margins: Iron Guard 11px, Verdant Ranger 11px, Radiant Acolyte 11px, Grave Archer 11px.
- Non-human bottom margins: Grave Skitter 18px, Stone Brute 10px.
- Near-black perimeter/halo check: `edgeDarkRatio=0.0` for every processed frame.

## Runtime Proof
- Captured on dev server port `5220`.
- Runtime actor sheet checked in Playwright: `/assets/generated/actor-feet-outline-v4/generated-low-res-actor-poses.png`.
- All `.generated-actor` nodes reported `data-actor-sheet=actor-feet-outline-v4`.
- Screenshots show the actual Ruined Crossing tactics prototype, including board terrain, generated actors, objective, intent markers, pose preview, and HUD.

## Visual Read Against Rejection
- Dark outlines/halos: fixed. V4 removes the added V3 black outline and the runtime whole-sprite drop shadow; remaining edge contrast is local pixel art contrast.
- Slicing/cropping: fixed in the processed sheet. The debug proof shows cell boxes, blue content bounds, green baseline/foot line, red centered anchors, and numeric bottom margins.
- Missing feet: fixed for the human/humanoid actors. Source prep and processed proof show complete lower bodies/boots with visible transparent margin below.

## Verification Commands
- `git -C /mnt/nxt-dev/tib-gathering rev-parse --short HEAD` -> `001387de`.
- `python3 -m py_compile scripts/process-actor-feet-outline-v4.py` -> passed.
- `node --check scripts/capture-battle-stage-actor-feet-outline-v4.mjs` -> passed.
- `node --check src/main.js` -> passed.
- `npm run actors:v4` -> passed; generated runtime sheet, manifest, validator, and static proof PNGs.
- `npm run build` -> passed.
- `npm run screenshots:v4` -> passed; captured desktop/mobile/grayscale on port `5220`.

## Caveats
- No ImageMagick probe was used; Pillow produced and validated dimensions directly.
- No commit was made.

