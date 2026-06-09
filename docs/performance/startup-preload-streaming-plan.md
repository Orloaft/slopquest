# Startup Preload Streaming Plan

## Goal

Keep first launch bounded as the MMO content set grows. Startup should load the shell, player-critical readability assets, and the first playable context. Zone art, generated-stage sources, direct stage props, event packs, and cosmetics should be cataloged as play-context/background assets instead of drifting into preload.

## Runtime Tiers

- `startup`: required before the Phaser scene can create the initial client safely.
- `play-context`: required before revealing a destination floor or generated stage.
- `background`: safe to warm after the current floor is stable.

The client exposes residency evidence through `window.__TIB_E2E__.assetResidency()` in e2e mode, including startup images, lazy generated-stage groups, pending play-context loads, pending background loads, and which trigger loaded each generated stage.

## Current Contract

- Core actor/effect sheets remain startup assets.
- Gathering resource art no longer lives in startup preload. Ore veins use slim runtime sprites loaded with floors that expose mining nodes; herb and campfire sprites load with destination floors; fishing ripples are procedural, so the old water interaction source sheet is no longer a runtime asset.
- Legacy hand-authored biome sheets no longer live in startup preload. Their derived texture baking is split by floor.
- Northwatch city, Southgate Cemetery, Ashen Crypt grave props, Sunken Marsh, Searing Badlands, Sunken Desert, Sunken Beach, Untamed Jungle, and Deepdelve Mine art are now hand-authored floor-context slices: their source sheets load on the destination floor transition, then their derived tiles and props are baked before reveal.
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

The old `preloaded-biomes` and `startup-gathering-props` buckets have been eliminated. The next reductions should target shared startup art that is still genuinely global today: broad actor sheets or first-spawn town/forest sources. Any follow-up should keep the same pattern: load the destination floor's source sheets before reveal, build derived textures idempotently, and prove residency in browser tests.
