# Player Actor Gen 2 Quality Implementation Report

Status: complete.
Started from rejected baseline at dispatch HEAD: 05acac6e.

## Actor Contract

- Source: `assetsources/gbc/actors/player-source.png`
- Runtime: `assetsources/gbc/actors/player-runtime.png`
- Public runtime: `public/sprites/actors/player-gbc-runtime.png`
- Sheet: 4 rows (`walk_up`, `walk_right`, `walk_down`, `walk_left`) by 4 frames.
- Source frame: 20x24, exact 2x nearest runtime frame: 40x48.
- Palette: 6 declared opaque colors plus transparency; source cells stay within the 4-color 8x8 validator budget.
- Runtime family: `playerGbc`; legacy `knight`/`caster` NPC users stay on `public/player-sheet.png`.
- Character concept: original TIB trail scout with ochre cap/hair mass, teal jacket, dark trousers, and compact boots.

## Iteration Notes

- Iteration 1: replaced the pawn baseline with a cap/hair silhouette, larger face cluster, split jacket/arm/leg blocks, and directional step poses.
- Iteration 2: widened the cap brim, added collar/neck pixels, tightened the shoulder-to-waist body shape, and exaggerated arm/leg counter-swing while preserving the validator palette budget.

## Proof Links

- Validator reports: `gbc-validator-report.md` and `gbc-validator-report.json`.
- Old-vs-new source comparison: `player-old-vs-new-source-comparison.png`
- Source contact: `player-source-contact-sheet.png`
- Runtime contact: `player-runtime-contact-sheet.png`
- Grayscale contact: `player-grayscale-readability-contact-sheet.png`
- Gameplay crop contact sheet: `gameplay-crop-contact-sheet.png`
- Gameplay screenshots: `runtime-01-waystone-route-gate.png`, `runtime-02-route-south-gate.png`, `runtime-03-route-stream-ford.png`
- Screenshot trace: `runtime-screenshot-trace.json`, `runtime-screenshot-trace.txt`

## Quality Rubric Notes

- Weak silhouette: replaced the simple pawn/mannequin outline with a wide ochre cap/hair mass, visible brim, narrower waist, split legs, and compact boot shapes.
- Bland down-facing read: down frames now have a face-sized skin cluster, clear eyes, hair/forehead band, collar pixels, and visible hands.
- Poor clothing clusters: jacket, collar, hands, trousers, and boots are separated with the declared six-color palette and strong dark outline.
- Low walk-frame charm: authored frames shift arms and legs against each other while keeping foot contact and baseline stable.
- Gameplay-scale visibility: full 1280x720 canvas screenshots are paired with 4x nearest-neighbor crops taken from those screenshots.

## Verification

- PASS `npm run assets:gbc:check`
- PASS `npm run assets:stage:route:check`
- PASS `npm run content:build`
- PASS `npm run typecheck`
- PASS `TIB_E2E_PORT=5220 npx playwright test tests/e2e/player-actor-gen2-quality.spec.ts --project=chromium`
