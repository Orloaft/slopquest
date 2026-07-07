# Functional Test Sweep V1

- Dev server: http://127.0.0.1:5220
- Port: 5220
- Classification: fully functional for tested v1
- Commit at run time: 680b3445
- Screenshot: artifacts/functional-test-sweep-v1/functional-sweep-after-end-turn.png

## Commands

- `npm run build`
- `npm run smoke:combat`
- `npm run smoke:functional`

## Command Results

- PASS `npm run build`: Vite production build completed.
- PASS `npm run smoke:combat`: existing focused Iron Guard combat smoke classified the slice as working.
- PASS `npm run smoke:functional`: full functional matrix classified the slice as fully functional for tested v1.

## Checks

- PASS runtime shows Ruined Crossing / Tactics Battle Stage content with TIB Gathering combatants.
- PASS selected Iron Guard.
- PASS chose Shield Bash.
- PASS Shield Bash preview mentions damage, push, and intent effect.
- PASS Shield Bash commit changed Brute HP, position, and combat log.
- PASS Shield Bash end turn resolved coherently with shrine HP preserved.
- PASS selected Verdant Ranger.
- PASS chose Root Shot.
- PASS Root Shot preview mentions damage and root.
- PASS Root Shot commit changed Skitter HP/status and combat log.
- PASS Root Shot end turn prevented Skitter leap while other enemy intents resolved.
- PASS selected Radiant Acolyte.
- PASS chose Ward.
- PASS Ward preview mentions objective absorption.
- PASS Ward commit changed objective ward state and combat log.
- PASS Ward end turn absorbed objective hit and left other enemy intents coherent.
- PASS next-turn state is reachable and action controls still work.
- PASS screenshot captured: artifacts/functional-test-sweep-v1/functional-sweep-after-end-turn.png
- PASS full functional matrix verified.

## Caveats

- The sweep validates the scripted v1 combat slice only; it does not claim broad balance, AI, pathfinding, or save/load coverage.

## Server Log

```
VITE v6.4.2  ready in 91 ms

  ➜  Local:   http://127.0.0.1:5220/
```

## Final Git Status At Sweep Time

```
M prototypes/tactics-affinity/artifacts/playable-combat-v1/report.md
 M prototypes/tactics-affinity/package.json
?? prototypes/tactics-affinity/scripts/__pycache__/
?? prototypes/tactics-affinity/scripts/functional-test-sweep-v1.mjs
```
