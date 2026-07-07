# Pull Forced Movement V1

## Status

- Status: PASS
- Starting HEAD: `a2a6e7c7`
- Ending HEAD before final commit: `a2a6e7c7`
- Final implementation commit: reported in worker return block. The committed report cannot embed its own final commit hash without changing that hash.
- Branch: `art-new-direction`

## What Changed

- Mechanics: added `forcedMovementDestination()` with explicit `push` and `pull` intents, plus `pushDestination()` / `pullDestination()` wrappers for the current call sites.
- Gameplay/UI: added playable `Arc Pull`, a Fulgur unit-target mover that mirrors Force Push by dealing 1 damage, moving the target one tile toward the caster when legal, then resolving terrain.
- Rules alignment: push and pull now consistently reject board bounds, occupied destinations, the Signal Beacon objective, and raised `block` terrain. Oil/fire/plain destinations remain legal, with fire resolving burn damage after displacement.
- Smoke coverage: `smoke:combat` now runs dedicated forced-movement browser checks, and `smoke:functional` runs a separate functional sweep instead of importing the generic MVP solve path.

## Forced Movement Semantics Covered

- Push direction: target moves one signed step away from the actor.
- Pull direction: target moves one signed step toward the actor.
- Blocked destination: action still spends AP and applies the mover's 1 damage, but displacement is skipped and the combat log names the blocker.
- Terrain resolution: legal fire destination applies 3 terrain damage after the 1 mover damage; legal oil/plain destinations move without immediate terrain damage.
- Immovable targets still resist displacement before destination resolution.

## Commands Run

- PASS `npm run test:mechanics --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`
- PASS `npm run build --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`
- PASS `npm run smoke:mvp-affinity --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`
- PASS `npm run smoke:combat --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`
- PASS `npm run smoke:functional --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`
- NOT RUN `build:flat-board`: this task changed abilities, mechanics, UI, and smoke scripts, but did not touch shared board/objective data or the flat-board compositor contract.

## Screenshot Proof

- `artifacts/pull-forced-movement-v1/combat-pull-after.png`
- `artifacts/pull-forced-movement-v1/combat-blocked-forced-move.png`
- Existing MVP smoke also recaptured runtime screenshots during verification, then the generated churn in `artifacts/mvp-affinity-vertical-slice-v1/` was restored.

## Caveats

- Pull is an MVP combat action, not a fully tuned rules direction. It has no animation, range UI, AI use, or bespoke VFX yet.
- The current one-turn solve path still uses the original oil, push, ignite, push chain; pull is testable as a counterpart action and covered by combat smoke edge cases.
- Known pre-existing untracked caveat remains untouched: `prototypes/tactics-affinity/scripts/__pycache__/`.

## Final Git Status Before Staging

```text
 M prototypes/tactics-affinity/scripts/functional-test-sweep-v1.mjs
 M prototypes/tactics-affinity/scripts/smoke-combat-loop.mjs
 M prototypes/tactics-affinity/scripts/smoke-mvp-affinity.mjs
 M prototypes/tactics-affinity/scripts/test-mechanics.mjs
 M prototypes/tactics-affinity/src/battle-data.js
 M prototypes/tactics-affinity/src/main.js
 M prototypes/tactics-affinity/src/mechanics.js
?? prototypes/tactics-affinity/scripts/__pycache__/
```
