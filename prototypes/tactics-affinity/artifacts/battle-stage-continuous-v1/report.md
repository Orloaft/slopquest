# Battle Stage Continuous V1 Runtime Proof

- Dev server: http://127.0.0.1:5220
- Screenshots:
  - battle-stage-continuous-desktop.png: 1440x900
  - battle-stage-continuous-mobile.png: 760x1280
  - battle-stage-continuous-grayscale.png: 1440x900 grayscale
- Content check: 8x8 Ruined Crossing board, Iron Guard selected, Verdant Ranger, Radiant Acolyte, Grave Skitter, Stone Brute, Grave Archer, shrine objective, enemy intent arrows, target highlights, and combat UI are all present.
- Continuous-surface pass: terrain sprites use generated top-face variants across interior cells with a separate perimeter skirt for outer board volume; grid steps are tuned to the visible top diamonds.
- Visual read: the interior no longer reads as separate raised blocks with dark cracks; the board reads as one coherent isometric surface with the volume preserved on the outside edge.
- Delivery copies: ~/.openclaw/media/tib-gathering/battle-stage-continuous-v1/
