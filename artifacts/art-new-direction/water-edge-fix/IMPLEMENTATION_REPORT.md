# Water Edge Fix Implementation Report

Status: complete

Initial HEAD: bbcd8962

Capture commit in traces: bd220126 (final committed route shoreline fix)

## Goal

Improve the Route 1 stream ford and shoreline read while preserving the restored existing TIB actor style and the route 16px source -> 32px exact nearest-neighbor runtime contract.

## Notes

- Route-focused fix only; no Waystone builder/common-builder changes were needed.
- The route stream now renders from a source-scale continuous stream profile before the exact 2x nearest-neighbor runtime scale.
- The semantic ASCII rows, route dimensions, floor id, portals, walkables, and collision semantics remain unchanged.
- The restored TIB `knight` player actor remains active; the focused runtime proof confirms `playerGbcSheet` is absent.

## Visual Verdict

Removed the visible square-block water read at the route stream/ford. The ford now has a continuous curved water body, a low-color bank, clearer water interior, and a readable shallow crossing at gameplay scale. The shoreline still preserves the route GBC palette and 8x8 source color budget, so the bank is deliberately simple rather than painterly.

## Key Proof

- `before-after-static-ford-runtime-composite.png`
- `water-shore-ford-contact-sheet.png`
- `grayscale-readability-sheet.png`
- `water-edge-gameplay-crop-contact-sheet.png`
- `runtime-01-waystone-route-gate.png`
- `runtime-02-route-south-gate.png`
- `runtime-03-route-stream-ford.png`
- `runtime-screenshot-trace.json`
- `editor-route-layers.png`

## Verification

- PASS `npm run assets:route`
- PASS `npm run assets:stage:route:check`
- PASS `npm run assets:gbc:check`
- PASS `npm run typecheck`
- PASS `TIB_E2E_PORT=5222 npx playwright test tests/e2e/water-edge-fix.spec.ts --project=chromium --workers=1`
- PASS `npm run check`
