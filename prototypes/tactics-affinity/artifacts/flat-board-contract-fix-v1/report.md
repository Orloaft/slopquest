# Flat Board Contract Fix V1

- Starting commit: `a2ed199d`
- Branch: `art-new-direction`
- Status: pass

## Summary

Updated the flat-board compositor to consume the current affinity MVP combat data contract. The compositor now derives its 8x8 art board from `BOARD_SIZE`, authored `terrain` states, and the `objective` coordinate instead of importing removed legacy board exports.

The terrain-to-art mapping is local to the compositor and written into the generated flat-board manifest so asset-pipeline output stays traceable without adding dead combat exports back to `battle-data.js`.

## Verification

- PASS `npm run build:flat-board --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`
- PASS `npm run build --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`
- PASS `npm run smoke:mvp-affinity --prefix /mnt/nxt-dev/tib-gathering/prototypes/tactics-affinity`

The smoke run refreshed the MVP proof report and runtime screenshots in `artifacts/mvp-affinity-vertical-slice-v1/`. The report identifies the TIB Gathering Tactics Affinity MVP, and the inspected victory screenshot shows the affinity board, Sprite/Tortollan roster, Signal Beacon objective, and victory state.

## Caveats

- Combat behavior was not redesigned in this lane.
- The known untracked `prototypes/tactics-affinity/scripts/__pycache__/` directory was left untouched.
