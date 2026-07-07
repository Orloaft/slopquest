# Playable Combat V1 Smoke

- Dev server: http://127.0.0.1:5220
- Port: 5220
- Classification: working
- Commit at run time: 697fea22
- Screenshot: artifacts/playable-combat-v1/playable-combat-after-end-turn.png

## Commands

- `npm run smoke:combat`

## Checks

- PASS selected Iron Guard by accessible button.
- PASS chose Shield Bash.
- PASS preview mentions damage, push, and shrine-line intent miss.
- PASS commit changed Stone Brute HP, position, and combat log.
- PASS end turn resolved enemy intents and preserved shrine HP after push.
- PASS screenshot captured: artifacts/playable-combat-v1/playable-combat-after-end-turn.png
- PASS playable combat loop verified.

## Final Git Status At Smoke Time

```
M prototypes/tactics-affinity/scripts/smoke-combat-loop.mjs
 M prototypes/tactics-affinity/src/main.js
 M prototypes/tactics-affinity/src/styles.css
?? prototypes/tactics-affinity/scripts/__pycache__/
```
