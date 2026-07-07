# Battle Stage Actor Feet/Outline V4 Runtime Proof

- Dev server: http://127.0.0.1:5220
- Port: 5220
- Runtime actor sheet: /assets/generated/actor-feet-outline-v4/generated-low-res-actor-poses.png
- Runtime check: every .generated-actor node has data-actor-sheet=actor-feet-outline-v4 and computed background-image points at the V4 equal-cell sheet.
- Separate shadow check: .generated-actor-shadow elements remain present as CSS ellipses below the feet; the sprite sheet does not bake shadows into the body.
- Screenshots:
  - battle-stage-actor-feet-outline-v4-desktop.png: 1440x900
  - battle-stage-actor-feet-outline-v4-mobile.png: 760x1280
  - battle-stage-actor-feet-outline-v4-grayscale.png: 1440x900 grayscale
- Content check: Ruined Crossing board, flat terrain/decal direction, generated player actors, generated enemies, shrine objective, enemy intent, selected-unit preview, and HUD remain present.
