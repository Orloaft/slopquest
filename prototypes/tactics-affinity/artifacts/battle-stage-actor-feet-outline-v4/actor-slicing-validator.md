# Actor Feet/Outline V4 Validator

- Frame size: 96x96
- Frame order: idle, windup, hit, move
- Source fix: each keyed source cell gets transparent side/top/bottom padding before slicing; humanoid roles receive boot/foot pixel patches where the generated source sat on the crop edge.
- Outline fix: no dilated black outline pass is used; perimeter-black pixels are softened to role-local edge colors.
- Contact shadow: separated from the body; no shadow pixels are baked into the sprite sheet.

## Iron Guard
- Source max bounds: 183x174; scale: 0.4713; anchor: (48,84)
  - idle: content=74x75 at (11,10), margins L/R/T/B=11/11/10/11, edgeDark=0.0
  - windup: content=77x83 at (10,2), margins L/R/T/B=10/9/2/11, edgeDark=0.0
  - hit: content=86x65 at (5,20), margins L/R/T/B=5/5/20/11, edgeDark=0.0
  - move: content=78x63 at (9,22), margins L/R/T/B=9/9/22/11, edgeDark=0.0

## Verdant Ranger
- Source max bounds: 211x138; scale: 0.4265; anchor: (48,84)
  - idle: content=73x59 at (12,26), margins L/R/T/B=12/11/26/11, edgeDark=0.0
  - windup: content=75x60 at (10,25), margins L/R/T/B=10/11/25/11, edgeDark=0.0
  - hit: content=65x55 at (16,30), margins L/R/T/B=16/15/30/11, edgeDark=0.0
  - move: content=90x56 at (3,29), margins L/R/T/B=3/3/29/11, edgeDark=0.0

## Radiant Acolyte
- Source max bounds: 191x163; scale: 0.4398; anchor: (48,84)
  - idle: content=49x69 at (24,16), margins L/R/T/B=24/23/16/11, edgeDark=0.0
  - windup: content=71x73 at (12,12), margins L/R/T/B=12/13/12/11, edgeDark=0.0
  - hit: content=61x53 at (18,32), margins L/R/T/B=18/17/32/11, edgeDark=0.0
  - move: content=84x61 at (6,24), margins L/R/T/B=6/6/24/11, edgeDark=0.0

## Grave Skitter
- Source max bounds: 309x146; scale: 0.2945; anchor: (48,78)
  - idle: content=59x35 at (18,43), margins L/R/T/B=18/19/43/18, edgeDark=0.0
  - windup: content=56x43 at (20,35), margins L/R/T/B=20/20/35/18, edgeDark=0.0
  - hit: content=91x30 at (2,48), margins L/R/T/B=2/3/48/18, edgeDark=0.0
  - move: content=60x35 at (18,43), margins L/R/T/B=18/18/43/18, edgeDark=0.0

## Stone Brute
- Source max bounds: 233x145; scale: 0.3863; anchor: (48,86)
  - idle: content=78x53 at (9,33), margins L/R/T/B=9/9/33/10, edgeDark=0.0
  - windup: content=86x56 at (5,30), margins L/R/T/B=5/5/30/10, edgeDark=0.0
  - hit: content=72x46 at (12,40), margins L/R/T/B=12/12/40/10, edgeDark=0.0
  - move: content=90x52 at (3,34), margins L/R/T/B=3/3/34/10, edgeDark=0.0

## Grave Archer
- Source max bounds: 189x153; scale: 0.4762; anchor: (48,84)
  - idle: content=75x73 at (10,12), margins L/R/T/B=10/11/12/11, edgeDark=0.0
  - windup: content=87x74 at (4,11), margins L/R/T/B=4/5/11/11, edgeDark=0.0
  - hit: content=66x71 at (15,14), margins L/R/T/B=15/15/14/11, edgeDark=0.0
  - move: content=90x72 at (3,13), margins L/R/T/B=3/3/13/11, edgeDark=0.0

