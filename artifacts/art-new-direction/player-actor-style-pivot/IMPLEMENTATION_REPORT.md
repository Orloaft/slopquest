# Player Actor Style Pivot

Status: complete

## Goal

Restore the pre-GBC-experiment TIB Gathering player/actor style while keeping the Pokemon-inspired route environment work intact.

## Decisions

- Use the existing `knight` actor family from `public/player-sheet.png` for the local player again.
- Remove live `playerGbc` runtime wiring and focused proof requirements.
- Keep route terrain assets and the GBC route validator path in place.

## Proof

- `runtime-01-waystone-route-gate.png`: `#game canvas` Waystone / route gate view with restored `knight` player actor.
- `runtime-02-route-south-gate.png`: `#game canvas` route south gate view with restored `knight` player actor.
- `runtime-03-route-stream-ford.png`: `#game canvas` route stream ford view with restored `knight` player actor. Water/tile placement cleanup remains out of scope for this pivot.
- `gameplay-crop-contact-sheet.png`: close gameplay crop contact sheet showing the restored actor against Waystone and route terrain.
- `runtime-screenshot-trace.json` / `.txt`: capture coordinates and `#game canvas` trace.

## Verification

- PASS `npm run assets:gbc:check`
- PASS `TIB_E2E_PORT=5220 npx playwright test tests/e2e/player-actor-style-pivot.spec.ts --project=chromium`

## Caveats

- Historical rejected proof artifact directories remain as archived evidence only; live runtime and focused proof no longer depend on them.
- The proof asserts `playerSheet` / `knight` is active and `playerGbcSheet` is absent.
