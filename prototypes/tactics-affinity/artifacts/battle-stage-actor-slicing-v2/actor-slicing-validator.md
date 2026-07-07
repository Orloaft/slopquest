# Actor Slicing V2 Validator

- Frame size: 96x96
- Frame order: idle, windup, hit, move
- Check: every runtime frame uses the same cell geometry; content bounds are anchored to the role baseline.

## Iron Guard
- Source max bounds: 183x167; scale: 0.4551; anchor: (48,84)
  - idle: rect=(0,0,96,96), content=71x68 at (12,16), bottom=84
  - windup: rect=(96,0,96,96), content=74x76 at (11,8), bottom=84
  - hit: rect=(192,0,96,96), content=83x58 at (6,26), bottom=84
  - move: rect=(288,0,96,96), content=75x56 at (10,28), bottom=84

## Verdant Ranger
- Source max bounds: 211x130; scale: 0.4265; anchor: (48,84)
  - idle: rect=(0,96,96,96), content=73x55 at (12,29), bottom=84
  - windup: rect=(96,96,96,96), content=75x55 at (10,29), bottom=84
  - hit: rect=(192,96,96,96), content=65x51 at (16,33), bottom=84
  - move: rect=(288,96,96,96), content=90x51 at (3,33), bottom=84

## Radiant Acolyte
- Source max bounds: 191x156; scale: 0.4293; anchor: (48,84)
  - idle: rect=(0,192,96,96), content=48x64 at (24,20), bottom=84
  - windup: rect=(96,192,96,96), content=70x67 at (13,17), bottom=84
  - hit: rect=(192,192,96,96), content=59x49 at (18,35), bottom=84
  - move: rect=(288,192,96,96), content=82x55 at (7,29), bottom=84

## Grave Skitter
- Source max bounds: 309x146; scale: 0.2977; anchor: (48,77)
  - idle: rect=(0,288,96,96), content=59x36 at (18,41), bottom=77
  - windup: rect=(96,288,96,96), content=56x43 at (20,34), bottom=77
  - hit: rect=(192,288,96,96), content=92x31 at (2,46), bottom=77
  - move: rect=(288,288,96,96), content=61x36 at (18,41), bottom=77

## Stone Brute
- Source max bounds: 233x145; scale: 0.3948; anchor: (48,86)
  - idle: rect=(0,384,96,96), content=80x54 at (8,32), bottom=86
  - windup: rect=(96,384,96,96), content=88x57 at (4,29), bottom=86
  - hit: rect=(192,384,96,96), content=74x47 at (11,39), bottom=86
  - move: rect=(288,384,96,96), content=92x53 at (2,33), bottom=86

## Grave Archer
- Source max bounds: 189x145; scale: 0.4828; anchor: (48,84)
  - idle: rect=(0,480,96,96), content=76x70 at (10,14), bottom=84
  - windup: rect=(96,480,96,96), content=88x70 at (4,14), bottom=84
  - hit: rect=(192,480,96,96), content=67x68 at (14,16), bottom=84
  - move: rect=(288,480,96,96), content=91x68 at (2,16), bottom=84

