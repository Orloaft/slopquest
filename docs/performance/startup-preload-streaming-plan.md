# Startup Preload Streaming Plan

## Goal

Keep first launch bounded as the MMO content set grows. Startup should load the shell, player-critical readability assets, and the first playable context. Zone art, generated-stage sources, direct stage props, event packs, and cosmetics should be cataloged as play-context/background assets instead of drifting into preload.

## Runtime Tiers

- `startup`: required before the Phaser scene can create the initial client safely.
- `play-context`: required before revealing a destination floor or generated stage.
- `background`: safe to warm after the current floor is stable.

The client exposes residency evidence through `window.__TIB_E2E__.assetResidency()` in e2e mode, including startup images, lazy generated-stage groups, pending play-context loads, pending background loads, and which trigger loaded each generated stage.

## Current Contract

- Core actor/effect/gathering sheets remain startup assets.
- Legacy hand-authored biome sheets remain in `preloaded-biomes` until their derived texture baking is split by floor.
- Northwatch city art and Sunken Marsh art are now hand-authored floor-context slices: their source sheets load on the destination floor transition, then their derived tiles and props are baked before reveal.
- Generated-stage tilesets, Waystone direct props, and Northwood direct object sprites are non-startup play-context assets.
- Adjacent generated stages warm in the background only after the active floor is settled, and warmups cancel if the player changes floors or a transition is active.

## CI Guardrails

`npm run assets:budget` enforces:

- total runtime asset budget
- startup preload budget
- lazy/play-context bundle budget
- named startup groups
- named lazy classifications
- failures for unclassified startup or lazy drift
- failures for dynamic lazy/preload groups without explicit policy budgets

The budget report calls out the largest preload candidates by policy group so the next reductions are obvious.

## Next Reduction

The largest remaining startup bucket is `preloaded-biomes`. Shrinking it safely requires continuing to split the old scene-wide texture baking in `create()` into idempotent floor-specific texture builders. Northwatch/city and Sunken Marsh are now split; next candidates are cemetery, desert, beach, jungle, and deepmine. Searing canyon also needs a separate floor-context pass for its ground, cliff, flora, and landmark kits.
