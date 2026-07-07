# Battle Stage Low-Res Actors V1 Runtime Proof

- Dev server: http://127.0.0.1:5220
- Screenshots:
  - battle-stage-low-res-actors-desktop.png: 1440x900
  - battle-stage-low-res-actors-mobile.png: 760x1280
  - battle-stage-low-res-actors-grayscale.png: 1440x900 grayscale
- Content check: 8x8 Ruined Crossing board, existing flat terrain direction, Iron Guard selected, Verdant Ranger, Radiant Acolyte, Grave Skitter, Stone Brute, Grave Archer, shrine objective, enemy intent arrows, target highlights, and combat UI are all present.
- Actor pass: all board actors now render as CSS low-res tactics tokens with chunky outlines, role silhouettes, larger value blocks, and faction separation instead of high-resolution static cutouts.
- Animation-readiness proof: selected-unit HUD includes idle, windup, hit, and move token poses from the same actor component; enemies on the board use windup silhouettes so threat is readable by pose/value in addition to arrows.
- Terrain preservation: the previous flat-board surface, decal, grid, and skirt stack remains in place; terrain art was not regenerated or redesigned.
- Grayscale check: player/enemy separation uses outline weight, body value, shape, threat wedges, and labels rather than hue alone.
- Delivery copies: ~/.openclaw/media/tib-gathering/battle-stage-low-res-actors-v1/
