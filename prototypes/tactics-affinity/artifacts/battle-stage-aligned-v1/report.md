# Battle Stage Aligned V1 Runtime Proof

- Dev server: http://127.0.0.1:5220
- Screenshots:
  - battle-stage-aligned-desktop.png: 1440x900
  - battle-stage-aligned-mobile.png: 760x1280
  - battle-stage-aligned-grayscale.png: 1440x900 grayscale
- Content check: 8x8 Ruined Crossing board, Iron Guard selected, Verdant Ranger, Radiant Acolyte, Grave Skitter, Stone Brute, Grave Archer, shrine objective, enemy intent arrows, target highlights, and combat UI are all present.
- Alignment pass: terrain sprites are normalized to a shared 160x144 transparent canvas and the runtime positions board elements from a shared cell center.
- Visual read: terrain rows and diagonals now hold a consistent tactical grid, the outer board silhouette is stable, and obvious gaps from mismatched source crops are removed.
- Caveat: the Protect intent badge intentionally sits near the shrine and overlaps a small part of the objective area, but it no longer hides the board alignment or the readable objective state.
- Delivery copies: ~/.openclaw/media/tib-gathering/battle-stage-aligned-v1/
