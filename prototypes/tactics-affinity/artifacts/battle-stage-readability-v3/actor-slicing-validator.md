# Actor Readability V3 Validator

- Frame size: 96x96
- Frame order: idle, windup, hit, move
- Check: every runtime frame uses the same cell geometry; content bounds are anchored to the role baseline.

## Iron Guard
- Source max bounds: 183x167; scale: 0.4671; anchor: (48,84)
  - idle: rect=(0,0,96,96), content=73x70 at (12,14), bottom=84
  - windup: rect=(96,0,96,96), content=76x78 at (10,6), bottom=84
  - hit: rect=(192,0,96,96), content=85x60 at (6,24), bottom=84
  - move: rect=(288,0,96,96), content=77x58 at (10,26), bottom=84

## Verdant Ranger
- Source max bounds: 211x130; scale: 0.4360; anchor: (48,84)
  - idle: rect=(0,96,96,96), content=75x56 at (10,28), bottom=84
  - windup: rect=(96,96,96,96), content=77x57 at (10,27), bottom=84
  - hit: rect=(192,96,96,96), content=66x52 at (15,32), bottom=84
  - move: rect=(288,96,96,96), content=92x52 at (2,32), bottom=84

## Radiant Acolyte
- Source max bounds: 191x156; scale: 0.4398; anchor: (48,84)
  - idle: rect=(0,192,96,96), content=49x66 at (24,18), bottom=84
  - windup: rect=(96,192,96,96), content=71x69 at (12,15), bottom=84
  - hit: rect=(192,192,96,96), content=61x50 at (18,34), bottom=84
  - move: rect=(288,192,96,96), content=84x56 at (6,28), bottom=84

## Grave Skitter
- Source max bounds: 309x146; scale: 0.3042; anchor: (48,78)
  - idle: rect=(0,288,96,96), content=61x37 at (18,41), bottom=78
  - windup: rect=(96,288,96,96), content=57x44 at (20,34), bottom=78
  - hit: rect=(192,288,96,96), content=94x31 at (1,47), bottom=78
  - move: rect=(288,288,96,96), content=62x37 at (17,41), bottom=78

## Stone Brute
- Source max bounds: 233x145; scale: 0.4034; anchor: (48,86)
  - idle: rect=(0,384,96,96), content=81x56 at (8,30), bottom=86
  - windup: rect=(96,384,96,96), content=90x58 at (3,28), bottom=86
  - hit: rect=(192,384,96,96), content=75x48 at (10,38), bottom=86
  - move: rect=(288,384,96,96), content=94x54 at (1,32), bottom=86

## Grave Archer
- Source max bounds: 189x145; scale: 0.4974; anchor: (48,84)
  - idle: rect=(0,480,96,96), content=78x72 at (9,12), bottom=84
  - windup: rect=(96,480,96,96), content=91x72 at (2,12), bottom=84
  - hit: rect=(192,480,96,96), content=69x70 at (14,14), bottom=84
  - move: rect=(288,480,96,96), content=94x70 at (1,14), bottom=84

