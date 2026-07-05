# Art New Direction Route MVP Implementation Report

- Started: 2026-07-05
- Initial HEAD: 84b84cb5
- Branch: art-new-direction
- Status: in progress

## Dirty State

- Initial `git status --short`: clean.

## Work Log

- Created early report stub before implementation.

- Captured baseline offline route composite at `artifacts/art-new-direction/route-mvp/route-before-offline-composite.png`.

- Rebaked route with original 16px source terrain scaled 2x to runtime.
- Generated proof contact sheets, tiled previews, grayscale readability sheet, after composites, and traversal trace.

## Implementation Notes

- Added route-only GBC style docs, palette file, asset spec, and allowlisted validator.
- Reworked `tools/build-route-from-authored.ts` so the route terrain source is authored at 16px and scaled exactly 2x into the existing 32px generated-stage contract.
- Preserved route dimensions, semantic ASCII rows, portals, collision semantics, road flags, content ids, editor layers, object placement flow, and public tileset import path.
- Kept actors, props, nodes, UI, and effects as legacy assets for this proof slice.
- The new terrain uses an original limited-palette look. Visual review found no copied Pokemon/Nintendo assets, no ROM-derived data, and no Pokemon-like symbols.

## Checks

- PASS `npm run assets:gbc:check`
- PASS `npm run assets:route`
- PASS `npm run assets:stage:route:check`
- PASS `npm run content:build`
- PASS `npm run typecheck`
- PASS `TIB_E2E_PORT=5220 npx playwright test tests/e2e/route-mvp-screenshot.spec.ts --project=chromium --workers=1`
- PASS `npm run check`

Notes:

- An earlier typecheck run failed because the new Playwright spec referenced the editor test seam without a local type cast. Fixed in `tests/e2e/route-mvp-screenshot.spec.ts`; final typecheck passed.
- Full e2e was not run because it is known red outside this MVP gate. The targeted route/editor/runtime Chromium spec passed and did not exercise unrelated known-red surfaces.

## Proof Artifacts

- `route-before-offline-composite.png`
- `route-after-offline-composite.png`
- `route-after-terrain-composite.png`
- `terrain-contact-source.png`
- `terrain-contact-runtime.png`
- `preview-4x4-grass-source.png`
- `preview-4x4-grass-runtime.png`
- `preview-4x4-road-source.png`
- `preview-4x4-road-runtime.png`
- `preview-4x4-water-source.png`
- `preview-4x4-water-runtime.png`
- `preview-4x4-edge-ford-source.png`
- `preview-4x4-edge-ford-runtime.png`
- `preview-4x4-blocker-source.png`
- `preview-4x4-blocker-runtime.png`
- `grayscale-readability-sheet.png`
- `runtime-01-waystone-north-gate.png`
- `runtime-02-route-south-gate.png`
- `runtime-03-route-encounter-clearing.png`
- `runtime-04-route-stream-ford.png`
- `runtime-05-northwood-south-arrival.png`
- `editor-route-layers.png`
- `gbc-validator-report.json`
- `gbc-validator-report.md`
- `route-traversal-trace.json`
- `route-traversal-trace.md`
- `runtime-screenshot-trace.txt`

## Caveats

- The MVP intentionally covers terrain only. Legacy tree sprites and player/enemy sprites remain visually higher-color than the new terrain.
- The stream edge is readable and validator-compliant, but future polish should add more transition tile variety once additional GBC terrain families are allowlisted.
