# Water Edge Rollback To Before

## Summary

- Restored the route stream/ford/shore visuals from `bbcd8962` (`Refresh player actor pivot proof`) by reverting the rejected water-edge commits `2e9065d5` and `bd220126`.
- Preserved the current live player actor style: runtime proof confirms `playerSheet` exists and `playerGbcSheet` does not.
- Removed the stale `water-edge-fix` proof artifacts/spec that validated the rejected treatment.

## Restored Source

The restored water visuals exactly match `bbcd8962` for:

- `tools/build-route-from-authored.ts`
- `assetsources/asset-forge/exports/route/forest.png`
- `assetsources/asset-forge/exports/route/forest.tileset.json`
- `assetsources/asset-forge/exports/route/route.stage.json`
- `assetsources/asset-forge/route.vocab.json`
- `assetsources/gbc/route/forest-source.png`
- `assetsources/gbc/route/route-runtime-composite.png`
- `assetsources/gbc/route/route-source-composite.png`
- `public/tilesets/route/forest.png`

## Proof Artifacts

- `runtime-03-route-stream-ford.png` - fresh in-game ford runtime screenshot after rollback.
- `restored-route-stream-ford-runtime-crop.png` - focused crop of the restored ford.
- `rejected-vs-restored-route-stream-ford.png` - left side is the rejected `2e9065d5` proof crop, right side is the restored rollback crop.
- `route-stream-ford-gameplay-crop-contact-sheet.png` - gameplay crop/contact sheet for the restored ford.
- `runtime-screenshot-trace.json` / `runtime-screenshot-trace.txt` - capture trace and player texture residency proof.
- `editor-route-layers.png` - route editor screenshot after rollback.

## Verification

- `npm run assets:gbc:check`
  - Result: PASS, `PASS GBC asset validator: 0 findings`.
- `TIB_E2E_PORT=5223 npx playwright test tests/e2e/water-edge-rollback.spec.ts --project=chromium --workers=1`
  - Result: PASS, 2 tests passed.

## Visual Verdict

The route stream ford is back to the accepted "before" read from `bbcd8962`: the ford no longer uses the rejected continuous water-edge treatment, while the live player actor remains the restored existing `player-sheet.png` style.
