# Mechanics Extraction V1

- Status: implemented and verified
- Start HEAD: ad103232
- End HEAD: mechanics-extraction commit; exact hash recorded in the worker return block
- Branch: art-new-direction

## Changed Files

- `prototypes/tactics-affinity/package.json`
- `prototypes/tactics-affinity/scripts/test-mechanics.mjs`
- `prototypes/tactics-affinity/src/main.js`
- `prototypes/tactics-affinity/src/mechanics.js`
- `prototypes/tactics-affinity/artifacts/mechanics-extraction-v1/report.md`

## Mechanics Module

- Extracted affinity relation and AP cost rules.
- Extracted phase/AP/relation ability usability.
- Extracted movement validation for bounds, occupied tiles, objective tile, whitebox move distance, grounded terrain blocking, flying terrain bypass, and AP.
- Extracted current forced push destination semantics: board edge, occupied destination, objective destination, and same-tile vectors block; open terrain states are returned without adding pull or obstacle acceptance.
- Extracted damage, fire terrain damage, live enemy checks, safe-state checks, and wait resolution.
- `main.js` now calls the pure mechanics functions while preserving current MVP preview strings, solve path, and combat log behavior.

## Test Coverage Added

- Primary, secondary, and opposite affinity AP costs.
- Opposite ability unavailable.
- Flying movement can enter blocked, liquid, and fire terrain.
- Grounded movement rejects water, oil, fire, and block terrain.
- Movement rejects occupied tiles, objective tile, out-of-bounds targets, and excessive distance.
- Force push blocks on board edge, occupied destination, and objective destination.
- Force push returns the current open oil destination and terrain state.
- Fire terrain damage marks a lethal unit dead.
- Wait resolution loses with live enemies and wins when all enemies are dead.

## Verification Results

- PASS `npm run test:mechanics --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`
- PASS `npm run build --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`
- PASS `npm run smoke:mvp-affinity --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`
- PASS `npm run smoke:combat --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`
- PASS `npm run smoke:functional --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`

## Caveats

- Pull, obstacle acceptance, and generated flat-board asset integration were intentionally not implemented in this lane.
- The existing `prototypes/tactics-affinity/scripts/__pycache__/` dirt was left untouched.
- Smoke scripts rewrote `artifacts/mvp-affinity-vertical-slice-v1/report.md` during verification; that tracked generated evidence churn was restored by explicit path after the smokes passed.
- Push semantics were preserved: `block` terrain does not block forced push destination resolution unless occupied, out of bounds, or the objective.
- Push is still needed: yes, after review.
