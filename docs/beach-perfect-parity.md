# Beach Perfect Parity Notes

Reference mockup pinned at `stagecraft-screenshots/beach-mockup-reference.jpg`.
Crop ledger pinned at `stagecraft-screenshots/beach-perfect-parity-crop-ledger.png`.

## Pass Criteria

- Water reads as natural ocean around the island, not square pools or repeated
  horizontal bands.
- Ledges use the source sheet's cliff/ledge family, with rock faces directly
  under raised walkable tops.
- Stairs are composed from left, middle, and right ramp pieces and cut through
  the ledge face.
- Shorelines use open water, foam edge pieces, rocky shore pieces, and sand rim
  tiles in the same visual vocabulary as the mockup.
- Generated screenshots are compared against the mockup before a commit is
  called parity.

## Approved Source Crops

| Role | Source crop |
| --- | --- |
| Open water A | `1056,92 72x72`, center-inset to avoid edge pixels |
| Open water B | `1144,92 72x72`, center-inset to avoid edge pixels |
| Foamy shore A | `1232,100 72x72` |
| Foamy shore B | `1320,100 72x72` |
| Rocky shore | `1408,100 72x72` |
| Shallow repeatable water | `1040,92 72x72`, center-inset to avoid edge pixels |
| Long cliff lip A | `528,100 128x74` |
| Long cliff lip B | `680,100 132x74` |
| Cliff lower face | `596,128 72x72` |
| Stairs left | `390,864 72x82` |
| Stairs middle | `462,864 72x82` |
| Stairs right | `606,864 72x82` |
| Coast strip A | `1056,950 140x58` |
| Coast strip B | `1144,950 140x58` |
| Coast strip C | `1232,950 140x58` |

## Current Findings

- The old central tidal lagoon was not in the mockup and made the water failure
  look worse; it has been removed from the authored beach map.
- The previous lower ledge wall crop came from the wrong visual family. It now
  uses the cliff-face pixels under the long ledge crop, but the ledge system
  still needs broader composed cliff sprites to stop reading as repeated blocks.
- Long ledge runs now use large `cliff_long_lip_A/B` overlay sprites split around
  stair mouths, with a composed four-tile stair overlay on top of the collision
  chars. This reads closer to the mockup than repeated single cliff tiles, but
  the side terminations still need their exact corner/turn pieces.
- Shore water keeps its blocked-water semantics, but its base render now uses
  clean repeatable water crops. The earlier pass mapped directional shore chars
  directly to foam/ledge crops, which made water bodies look like repeated edge
  stamps instead of blended ocean. Full parity can still add sparse shoreline
  overlay sprites later, but broad water fill must stay interior-water first.
- The island base is now authored with row spans instead of stacked rectangles.
  This makes the minimap and camera screenshots read as a sloped island outline
  before the shore resolver runs. A follow-up directional shore-crop experiment
  exposed magenta separator pixels in the vertical water-edge crops, so that
  crop swap was reverted; the next water pass should either crop/clean those
  vertical edge assets explicitly or use larger shoreline sprites sparingly.
