# Battle Stage Actor Slicing V2

Status: complete.

## Summary

- Source: existing `battle-stage-generated-low-res-actors-v1/generated-actor-source.png`.
- Art path: resliced and cleaned from existing art only; no actor regeneration.
- Runtime sheet: `assets/generated/actor-slicing-v2/generated-low-res-actor-poses.png`.
- Runtime manifest: `assets/generated/actor-slicing-v2/manifest.json`.
- Artifact manifest: `actor-runtime-manifest.json`.
- Frame size: 96x96 px.
- Frame order: `idle`, `windup`, `hit`, `move`.
- Anchor contract: every role uses equal 96x96 cells; each role locks `anchor.x=48` and a per-role `baseline.y`; all pose content is placed so the opaque bounds end on that baseline.

## Baselines

- Iron Guard: baseline y 84.
- Verdant Ranger: baseline y 84.
- Radiant Acolyte: baseline y 84.
- Grave Skitter: baseline y 77.
- Stone Brute: baseline y 86.
- Grave Archer: baseline y 84.

## Static Proof

- `source-actor-contact-sheet.png`: source sheet with explicit 4x6 role/pose grid.
- `processed-actor-sprite-sheet.png`: final transparent runtime sheet, 4 columns x 6 rows of equal 96x96 frames.
- `slicing-debug-contact-sheet.png`: frame boxes, cyan content bounds, green baselines, red anchors.
- `final-size-actor-contact-sheet.png`: expected board-scale color and grayscale thumbnail proof.
- `actor-slicing-validator.md`: validator listing frame size, frame order, content bounds, and baseline checks.
- `actor-runtime-manifest.json`: runtime role/frame manifest with rects, grid coordinates, anchors, baselines, source bounds, and scale.

## Runtime Proof

- `battle-stage-actor-slicing-desktop.png`: normal desktop runtime.
- `battle-stage-actor-slicing-mobile.png`: mobile runtime.
- `battle-stage-actor-slicing-grayscale.png`: grayscale runtime.
- `runtime-proof.md`: screenshot capture summary and runtime asset assertion.

The screenshot harness asserted that every `.generated-actor` node has `data-actor-sheet=actor-slicing-v2` and that the computed CSS background image points at `/assets/generated/actor-slicing-v2/generated-low-res-actor-poses.png`.

## Visual Read

The source row-bleed that produced detached slivers in adjacent actor rows is filtered by connected-component cleanup before scaling. The processed sheet now has equal cells and locked per-role baselines, so poses no longer depend on detected per-pose cell heights. Grave Archer and Stone Brute are noticeably more legible at board scale after using body-focused component cleanup, stronger contrast, and a heavier outline/rim pass. Grave Skitter is stable and readable by silhouette in color and grayscale, though it remains the most terrain-adjacent enemy because the original creature body is squat and close to rubble values.

## Verification

- `python3 scripts/process-actor-slicing-v2.py --source ... --artifact-dir ... --runtime-dir ...`: passed.
- `npm run build`: passed.
- `node scripts/capture-actor-slicing-v2.mjs`: passed; used port 5220 and stopped the dev server.
