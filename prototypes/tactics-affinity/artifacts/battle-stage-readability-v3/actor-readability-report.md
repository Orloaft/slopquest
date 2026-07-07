# Actor Readability V3 Report

## Source And Processing

- Source: existing generated actor atlas at `artifacts/battle-stage-generated-low-res-actors-v1/generated-actor-source.png`.
- Regeneration: none. This pass cleaned/resliced the existing generated bitmap art.
- Processor: `scripts/process-actor-readability-v3.py`.
- Runtime output: `assets/generated/actor-readability-v3/generated-low-res-actor-poses.png`.

## Contract

- Cell size: `96x96`.
- Sheet grid: 4 columns x 6 rows.
- Pose order: `idle`, `windup`, `hit`, `move`.
- Role row order: Iron Guard, Verdant Ranger, Radiant Acolyte, Grave Skitter, Stone Brute, Grave Archer.
- Anchors: centered at `x=48`.
- Baselines: per-role locked foot baselines; validator confirms each pose bottom matches its role baseline.

## Readability Changes

- Reduced painterly texture by quantizing to fewer actor-scale value groups.
- Added stronger dark silhouettes with extra pale rim separation on Grave Skitter and Grave Archer.
- Grouped enemy values so Skitter reads as pale shell/dark legs and Archer reads as pale skull/bow over a darker body.
- Increased runtime display scale for Skitter and Archer while preserving the `96x96` sheet contract.

## Proof Files

- `source-actor-contact-sheet.png`
- `processed-actor-sprite-sheet.png`
- `slicing-debug-contact-sheet.png`
- `final-size-actor-contact-sheet.png`
- `actor-runtime-manifest.json`
- `actor-slicing-validator.md`

