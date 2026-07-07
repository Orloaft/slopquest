# MVP Affinity Vertical Slice V1

- Start HEAD: 1714ca38
- Final HEAD/commit hash at smoke time: b6b6f86e
- Classification: good testbed
- Dev server: http://127.0.0.1:5220
- Chosen port: 5220

## Changed Files

- (none at smoke time)

## Commands Run

- `npm run build`
- `npm run smoke:combat` (superseded wrapper for MVP smoke)
- `npm run smoke:functional` (superseded wrapper for MVP smoke)
- `npm run smoke:mvp-affinity`

## Verification Output

- PASS board loads as TIB Gathering Tactics Affinity MVP with exactly two player builds.
- PASS Tortollan and Sprite expose HP, AP, primary/sub-job affinities, and racial traits.
- PASS Tortollan primary Terra costs 1 AP, sub-job Fulgur costs 2 AP, and opposite Umbra is disabled at 4 AP.
- PASS Sprite flips the same job tree: Fulgur primary is 1 AP and Terra sub-job is 2 AP.
- PASS Tortollan cannot be pushed preview is explicit.
- PASS Sprite flying movement preview ignores terrain routes.
- PASS Sprite's flying trait changes movement by reaching the off-angle perch.
- PASS fail path verifies waiting without solving causes forecast defeat.
- PASS state-setter preview shows oil/liquid chain purpose.
- PASS sub-job Oil Font costs 2 AP after Sprite's 1 AP move.
- PASS mover preview shows push destination into oil.
- PASS Tortollan primary Terra mover costs 1 AP and pushes the Wrecker into oil.
- PASS igniter preview shows oil ignition, burning tile, and neutralization.
- PASS primary Fulgur igniter costs 1 AP and neutralizes the first enemy.
- PASS sub-job mover preview shows push into fire and threat neutralization.
- PASS sub-job Terra mover costs 2 AP, never cheaper than primary, and pushes the second enemy into fire.
- PASS solved one-turn environmental puzzle and verified victory/safe state.
- PASS MVP affinity vertical slice verified.

## Screenshots

- artifacts/mvp-affinity-vertical-slice-v1/mvp-preview-chain.png
- artifacts/mvp-affinity-vertical-slice-v1/mvp-after-solve.png
- artifacts/mvp-affinity-vertical-slice-v1/mvp-fail-path.png

## Superseded Old Smoke Behavior

- The old Iron Guard / Verdant Ranger / Radiant Acolyte combat slice is intentionally superseded on this MVP screen.
- `smoke:combat` and `smoke:functional` now execute the MVP affinity smoke so legacy assertions do not conflict with the two-build roster.

## Caveats

- This is a whitebox testbed only: no save/load, recruitment, broad balance, AI pathfinding, animation polish, or campaign systems.
- The report's final commit hash is also reported by the worker after the focused commit is created.

## Server Log

```
VITE v6.4.2  ready in 85 ms

  ➜  Local:   http://127.0.0.1:5220/
```

## Final Git Status At Smoke Time

```
?? prototypes/tactics-affinity/scripts/__pycache__/
```
