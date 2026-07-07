# Battle Stage Flat Compositor V1 Runtime Proof

- Dev server: http://127.0.0.1:5220
- Screenshots:
  - battle-stage-flat-compositor-desktop.png: 1440x900
  - battle-stage-flat-compositor-mobile.png: 760x1280
  - battle-stage-flat-compositor-grayscale.png: 1440x900 grayscale
- Content check: 8x8 Ruined Crossing board, Iron Guard selected, Verdant Ranger, Radiant Acolyte, Grave Skitter, Stone Brute, Grave Archer, shrine objective, enemy intent arrows, target highlights, and combat UI are all present.
- Flat-compositor pass: terrain is rendered as one prebuilt board surface plus one grid layer; ordinary ground cells are no longer individual DOM/image layers.
- Volume separation: rubble, bramble, blockers, raised blocks, shrine pads, overlays, props, units, and intent markers sit above the flat base; board side volume is limited to the perimeter skirt.
- Delivery copies: ~/.openclaw/media/tib-gathering/battle-stage-flat-compositor-v1/
