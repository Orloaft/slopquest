# Battle Stage Flat Feature Decals V1 Runtime Proof

- Dev server: http://127.0.0.1:5220
- Screenshots:
  - battle-stage-flat-feature-decals-desktop.png: 1440x900
  - battle-stage-flat-feature-decals-mobile.png: 760x1280
  - battle-stage-flat-feature-decals-grayscale.png: 1440x900 grayscale
- Content check: 8x8 Ruined Crossing board, Iron Guard selected, Verdant Ranger, Radiant Acolyte, Grave Skitter, Stone Brute, Grave Archer, shrine objective, enemy intent arrows, target highlights, and combat UI are all present.
- Feature decal pass: rubble, bramble, spawn cracks, objective pads, rock blockers, and raised block reads are baked into one shared flat decal layer instead of individual DOM tile sprites.
- Terrain simplification: base terrain samples are smoothed toward local tile averages, grid lines are thinner, and the shrine badge/Protect marker/target overlays are reduced to lower the objective-cluster noise.
- Volume separation: only props, units, shrine object, intent markers, labels, and UI sit above the board; board side volume remains limited to the perimeter skirt.
- Delivery copies: ~/.openclaw/media/tib-gathering/battle-stage-flat-feature-decals-v1/
