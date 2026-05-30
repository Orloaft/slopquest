# Jib map-authoring guide ("Golden Rules")

How to hand-author a zone so it reads as a layered, organic world instead of a
flat tile grid. Every floor is being moved to a **bespoke 90×60 layout** (no more
nearest-neighbour upscaling). The Searing Badlands (floor 6) is the reference —
read its block in `src/shared.ts` (`if (floor === 6)`) alongside this.

## 1. The bespoke-90×60 convention

A floor is "authored at target size" when its number is in **two** sets:

- `AUTHORED_AT_TARGET` in `src/shared.ts`
- `SCALE_AUTHORED_AT_TARGET` in `scripts/build-content.ts`

When a floor is in those sets:

- `makeFloorTiles(floor)` builds the grid directly at **90 cols × 60 rows**
  (use literal coords up to x≤89, y≤59). The floor block runs inside
  `makeFloorTiles`; author with `fillRect(rows, x, y, w, h, ch)` and
  `setTile(rows, x, y, ch)`.
- Its **content coordinates are NOT scaled** — every coordinate that touches this
  floor must be written directly in 90×60 space:
  - `content/spawns.yaml`, `content/*-nodes.yaml` entries
  - `content/npcs.yaml` entries
  - `MAP_OBJECTS[floor]` in `src/map-objects.ts` (composed sprites)
  - `portalForRaw` destinations that ARRIVE on this floor
  - the `isSafeZone` rect for this floor (passed as raw 90×60 bounds to `inRect`)
  - any e2e test that teleports onto this floor

## 2. Tile palette per biome

`isBlockedTile` (movement) and `isSightBlocked` (ranged LOS) live in
`src/shared.ts`; `tileBaseTexture` (char→texture) and minimap colours live in
`src/main.ts`. Use the chars your biome already defines:

| Biome (floor)      | Walkable floor | Walls / blockers (sight)         | Walls (sight-open)      | Other |
| ------------------ | -------------- | -------------------------------- | ----------------------- | ----- |
| Waystone town (0)  | `.` grass `s` stone `p` townfloor `t`/`d` dirt | `r` rock, `~` water | — | buildings via `MAP_OBJECTS` |
| Cemetery (1)       | `g` gravedirt `c` gravepath `b` path | `q` fence | — | `h` grave decoration; `T`/`C`/`G` portals |
| Crypt (2)          | `c` crypt floor `d` dirt `b` floor | `#` wall | — | `T` portal (enclosed dungeon) |
| Northwatch town (4)| same as Waystone | same | — | buildings via `MAP_OBJECTS` |
| Sunken Marsh (5)   | `m` marsh `k` swampdirt `B` bridge | `o` boulder | `W` swamp water | `M` portal, `L` cliff ledge |
| Searing Badlands(6)| `R` canyon floor `J` rock `A` ramp | `w` massif, `X` cliff face | `P` pit | `D`/`Z` portals |
| Sunken Desert (7)  | `a` sand | `U` ruin | `Q` quicksand, `V` oasis water | `G`/`H`/`Y` portals |
| Sunken Beach (8)   | `e` beach sand | — | `I` ocean | `Y` portal, `j` jungle portal |
| Untamed Jungle (9) | `y` jungle floor | `E` jungle wall | `i` river | `K` vault landmark, `j` portal |

The whole-map border ring is auto-filled per `FLOOR_EDGE` (treeline / water /
cliff / sea / canopy), so you do **not** need to wall the outer edge yourself —
but the `frameFloorEdge` step only replaces leftover `#`, so if you fill the
whole grid with a blocker (e.g. `w`), the edge is already solid.

## 3. The layered-cliff system (badlands, desert canyons, any cliff)

Never fill a big area with the cliff-face tile — that's the flat-stacked look.
Instead:

1. Fill the impassable bulk with the **massif** tile (`w`, dark flat rock).
2. **Carve** the walkable canyon floors (`R`) out of it with `fillRect`.
3. Call **`applyCliffEdges(rows)`** at the end. It turns every massif tile sitting
   directly above a floor tile into a 1-tile **south-facing cliff face** (`X`).
   Faces stay one tile tall and terminate at the lip — exactly the guide's rule.

So a cliff is always: walkable floor below, a single `X` face row, massif above.
`applyCliffEdges(rows, floorChar, massifChar, faceChar)` is parameterisable if a
biome wants its own chars (e.g. sandstone), but default `R/w/X` covers badlands.

## 4. Organic-layout rules (all zones)

- **Wind the paths.** No straight central corridors. Use S-curves and bends that
  hug the base of walls. The canyon in floor 6 climbs/drops/turns repeatedly.
- **Cluster props against walls.** Resource nodes (ore veins, herb patches),
  barrels, boulders, mushrooms go **adjacent to a wall or structure**, never
  floating in open floor. Ore veins sit ON the blocker tile (cliff/rock) with the
  `approach` on the walkable tile beside them — see `mining-nodes.yaml` floor 6.
- **Ring pits/crevices with boulders.** A `P` pit alone looks like a missing
  texture; place boulder sprites (`MAP_OBJECTS`) around it so it reads as a
  tectonic tear. Keep pits at a wall edge, not mid-floor.
- **Dead-ends and pockets are good.** Side canyons, alcoves, and cover create
  tactical layout. Don't make everything a thoroughfare.
- **Safe outposts** (towns, camps, huts) are open clearings with the structure
  sprites + NPCs; mark them in `isSafeZone` and place their building in
  `MAP_OBJECTS` (collision auto-stamps for keys in `BLOCKING_OBJECT_KEYS`).

## 5. Buildings & collision

Solid structures are composed sprites listed in `MAP_OBJECTS[floor]`
(`src/map-objects.ts`), authored bottom-centre at a tile coord with px `w`/`h`.
Keys in `BLOCKING_OBJECT_KEYS` get a tight collision footprint stamped under them
automatically by `stampBuildingCollision` — do **not** hand-place `O` tiles. Put
NPCs (in `npcs.yaml`) on walkable tiles just outside the building footprints.

## 6. Validate before you commit

For each floor, run an offline check (Node, `.ts` runs directly):

```ts
import { makeFloorTiles, isBlockedTile, floorCols, floorRows, MONSTER_SPAWNS,
  HERB_NODES, MINING_NODES, FISHING_NODES, NPCS } from "../src/shared.ts";
```

Confirm:
- **Flood-fill** from each inbound portal-arrival tile reaches every other portal,
  every NPC, and every node `approach` (nothing walled off).
- Every monster spawn tile is walkable (turret/anchored ranged spawns on water are
  intentional — note them).
- Each mining vein `at` is a blocker and its `approach` is walkable+reachable;
  fishing `at` is water; herb/quartz `at` is walkable.
- Render the grid to a PNG (map char→colour) and eyeball the shape.

Then `npm run content:build` → `npx tsc --noEmit` → `npx playwright test <zone>`.
