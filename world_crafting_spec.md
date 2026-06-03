# Jib World-Crafting Specification (v2 — Northwood)

The reusable recipe for the 16-bit SNES/GBA top-down look **and the in-game stage data** achieved
in Northwood, so future regions (Waystone, desert canyon, swamp, cave…) reproduce both the aesthetic
*and* a functional, collidable, skillable map without drift.

## ⚠️ Source of truth — read before anything else

There are **two** Northwood bakers. They are NOT interchangeable:

| File | What it makes | Ships in-game? |
|---|---|---|
| `tools/render-northwood-trees.ts` | One standalone **preview PNG** (`artifacts/…`) | **No.** Nothing in `src/` imports it. |
| `tools/build-northwood-from-authored.ts` | The **in-game stage**: a tileset PNG + `northwood.stage.json` + `northwood.vocab.json` | **Yes** → importer → generated module |

**The authoritative in-game chain is:**

```
tools/build-northwood-from-authored.ts      # bakes tileset + stage JSON + vocab
  → tools/import-asset-forge-stage.ts        # validates + emits the generated module
  → src/generated/stages/northwood.ts        # export NORTHWOOD_STAGE
  → consumed by src/shared.ts makeFloorTiles()/tileAt()/isBlockedTile() and src/main.ts
```

Run it with **`npm run assets:northwood`** (bake + import); verify with **`npm run workflow:northwood`**.

`render-northwood-trees.ts` is an **offline preview only**. Do not cite it as the source of truth, do
not retune it expecting the game to change, and do not verify rules against it. The two bakers *mirror*
the same tunable block and "locked passes", but the in-game baker **deliberately diverges** (its own
header says so):

- **Noise is TILE-LOCAL** in-game: `hrand(px % ts, py % ts)` — repeats per 32px tile so identical tile
  configs dedupe into one tileset entry. The preview uses absolute `hrand(px, py)`.
- **Elevation-0 land gets an explicit interior-grass base-fill** (plateau-top tile 0) so the ground is
  never see-through. The preview leaves it transparent.
- The in-game baker additionally emits **collision, semantic ascii chars, a base/fringe layer split, a
  vocab file, and depth-sorted sprite objects** — none of which the preview produces.

Where this doc and `build-northwood-from-authored.ts` disagree, **the baker wins — update this doc.**

---

## 0. Corrections to common (wrong) assumptions

Still-true corrections (these rules genuinely do **not** exist — don't reintroduce them):

| Claimed rule | Reality |
|---|---|
| "70% canopy spawn multiplier in a 3×3 radius for dense forest walls" | **False.** Trees are *thinned*, not clustered (`TREE_MIN_SPACING_CELLS = 2`). Density comes from how many `f` cells the layout paints. |
| "Full 8-way / 47-tile plateau wrapping" | **False.** 4-bit **edge** autotile (16 tiles, N/E/S/W). 47-tile concave corners are deferred. |
| "Cliffs may not exceed 2 tiles without a Perlin stagger" | **False.** Cliffs follow the integer elevation field exactly; horizontal runs are intentionally continuous. |

Corrected since v1 (v1 was right *for the preview*, wrong for the shipped stage):

| v1 claim | Reality in the in-game baker |
|---|---|
| "water-Wang tile-0 is the grass base; **no separate fill step**" | **The in-game baker HAS a separate grass base-fill** (plateau-top idx 0 on every land cell, before water). `build-northwood-from-authored.ts:102-108`. |
| "micro-blends use position-keyed `hrand(px,py)`" | In-game it's **tile-local** `hrand(px%ts, py%ts)`. |

Organic shape comes from the **authored data** (`layout-authored.txt`, `elevation.txt`), not from
procedural anti-blockiness rules. Want less blocky terrain? Author better data — don't assume a noise
pass exists.

---

## 1. Grid, perspective & scale

- **Tile size:** `ts = 32` px, authored at 1× (never upscaled).
- **Map size is data-driven:** `R = rows.length`, `C = rows[0].length` from
  `assetsources/mockup/layout-authored.txt` (falls back to `layout.txt`). Northwood is **72×110** →
  a **3520×2304** px tileset source. `elevation.txt` holds an integer height per cell.
- **Projection:** flat, slightly-front orthographic top-down. Tile layers are pure top-down; sprite
  objects (trees/props) are anchored **bottom-center** and depth-sorted at runtime.
- **Sprite-to-grid scale:** trees render at `TREE_TARGET_W_PX = 60` px (~1.9 tiles); props 18–40 px.
  This oversize-vs-tile ratio reads as "macro world".
- **In-game framing is ALSO set by the camera** (not just the PNG ratio): floor 3 uses
  `NORTHWOOD_CAMERA_ZOOM = 1.8` via `cameraZoomForFloor()` (`src/main.ts`), applied on floor entry and
  multiplied by a clamped player zoom factor (0.45–1.5, wheel/pinch/`±` keys). A region that bakes a
  correct PNG can still be mis-framed in-game if its floor isn't given a camera zoom.

### Semantic-char legend (this is a COLLISION contract, not just colors)

Each cell's ascii char must be a **semantic char the engine's hard-coded functions already
understand** — collision/sight/road are resolved **char-by-char** (see §3), not from the numeric
collision grid. `KIND_CHAR` (`build-northwood-from-authored.ts:300-302`) enforces this:

| char | role | walkable? | sight? |
|---|---|---|---|
| `F` | forest-floor / open grass | yes | clear |
| `t` | packed road/trail | yes (road) | clear |
| `.` | sand/beach | yes | clear |
| `m` | mossy stone stairs/ladder | yes | clear |
| `~` | deep water | **blocked** | clear |
| `^` | border-void canopy | **blocked** | **blocks** |
| `q` | woodland cliff-face | **blocked** | **blocks** |
| `y` | **tree-trunk (choppable node)** | **blocked** | **blocks** |
| `S N M D` | portals | yes | clear |

Inventing a "pretty" char with no entry in `src/shared.ts` `isBlockedTile/isSightBlocked/isRoadTile`
yields a tile that is silently walkable/blocked-wrong in-game.

## 2. Terrain autotiling

- **Corner / dual-grid Wang (water):** iterate vertices `(R+1)×(C+1)`; mask = `NW1|NE2|SE4|SW8`;
  blit at `((j−0.5)·ts,(i−0.5)·ts)`. Use for fluid region fills (boundary runs between cells).
- **4-bit edge Wang (plateaus, roads):** per cell, mask = `N1|E2|S4|W8`; **set bit = neighbour is the
  same terrain** (no edge there). 16 tiles.

**Grass base-fill (layer 0, in-game only):** before water, blit plateau-top idx 0 (EDGE-NONE) on every
non-water/void/beach cell so elevation-0 land is opaque (`build…:102-108`).

**Plateau tops** (`plateau-top-v2.png`, 16-tile edge set): for tiers `L=1..topLvl`, membership
`up(r,c)=eh(r,c)≥L`; stamp `maskToIdx[mask]`, higher tiers last. `~ ^ .` skipped.
> Author the sheet in **fixed visual cell order** by edge content — the image model cannot honor
> "index 6 = 0b0110". See `docs/northwood-plateau-top-v2-prompt.md`.

**South cliff faces** (`cliff-face.png`, 5 cols `[Lcap,straight,Rcap,inner-L,inner-R]` × 3 rows
`[lip,mid,base]`, `idx=row*5+col`): wall where elevation steps down south
(`dropS=max(0,eh(r,c)−eh(r+1,c))>0`); height `total=min(CLIFF_MAX_WALL_TILES,1+drop)` in cells
`r+1…r+total`. inner-L/R unused (future 47-tile).

**Ladders/stairs** (`ladder.png`, 1×3 `[top,mid,base]`): contiguous runs of cliff-**lip** cells whose
lip touches a road (`stairCand`, `build…:187`) collapse per row into **one** ladder at the run centre;
ladder tiles are drawn in the wall cells below and become `kind='ladder'`, **walkable** (`build…:202`).
A clearing box (`dr∈[-1,total+2], dc∈[-1,1]`) is added to `noTree`.

## 3. In-game integration (the part v1 omitted entirely)

A pretty PNG is not a stage. The in-game baker emits four coupled artifacts; all four matter.

### 3a. Semantic-char collision contract
Movement/sight/road are resolved **char-by-char** by hard-coded `src/shared.ts` functions
(`isBlockedTile`, `isSightBlocked`, `isRoadTile`, `tileAt`) reading the stage's **ascii rows**
(`makeFloorTiles()`), **NOT** the numeric `collision[][]` grid (that grid is exported for parity/
validation only). See the big comment at `build…` §"CHARS/LAYERS". Every cell char must be one of the
semantic chars in §1's table.

### 3b. base / fringe two-layer ground
- `base[r][c]` = canonical **semantic ref** (`legend[char]`) — the validator anchor + fallback.
- `fringe[r][c]` = the exact per-cell dedup tile (or `null` when identical to base).
- The client draws each cell from the **layer `ref`** (`src/main.ts` `createMapChunk`), so the visual
  is **decoupled from the collision char**. This is precisely why a trunk cell can carry char `y`
  (blocks movement) while keeping a forest-floor `base` ref (still looks like ground).

### 3c. asset-forge stage + vocab schema, and importer invariants
Stage (`asset-forge/stage@1`): `{ tileSize, cols, rows, tilesets[], layers:[base,fringe],
collision[][], objects[], ascii:{legend,rows} }`.
Vocab: `{ zone, floor, chars: char→{role,blocked,sightBlocked,road,minimapColor},
requiredPortals, requiredWalkable }`.
`tools/import-asset-forge-stage.ts` **hard-aborts** unless: ascii rows == `stage.rows`; every row is
`cols` chars; `collision[y][x] === vocab.chars[char].blocked` for every cell; every char has a legend
ref `'<tileset>:<index>'`; required portals are unblocked at their coords; required-walkable approach
tiles are walkable.

### 3d. Engine wiring (hand-wired — the importer does NOT do this for you)
The importer only writes `src/generated/stages/<zone>.ts` and copies the tileset PNG to
`public/tilesets/<zone>/` (`--public-dir`). To make a floor *use* the stage you must:
1. import `NORTHWOOD_STAGE` in `src/shared.ts` and return its `rows` from `makeFloorTiles()` for that
   floor (`shared.ts:260-264`), so collision/`tileAt` use its ascii rows; and
2. add it to `GENERATED_STAGES` / `GENERATED_STAGES_BY_FLOOR` in `src/main.ts` so the client renders
   its layers/tilesets/objects.
Skip either and you get a valid module but an empty/old floor.

### 3e. Resource / gameplay bridge (trees → choppable woodcutting nodes; built 2026-06-02)
Authored `f` tree cells become **choppable, blocking** nodes that reuse the authored sprite:
1. The baker tags each placed tree object `resource:{kind:'tree',tx,ty}` and flips its **trunk tile's
   char to `y`** (blocked + sight-blocking) while keeping the forest-floor `base`/`fringe` **visual**.
2. `src/shared.ts isBlockedTile/isSightBlocked` treat `y` as solid.
3. `server/index.ts isGeneratedTreeTile` materialises a respawning woodcutting node on `y` (and legacy
   `f`); type via `treeTypeForTile`.
4. The client (`main.ts northwoodTreeSpriteByTile`) maps the node back to the **authored sprite**, and
   `addComposedMapObjects` **skips** `resource.kind==='tree'` so the depth-sorted chop-able entity
   owns it (no duplicate static decoration).
A new region's choppable trees won't work without this `y` + `resource` contract. Other skills
(herbs/mining/fishing) come from `content/*.yaml` nodes rendered independently.

### 3f. Gameplay-anchor reservation
Because trunks are **blocking**, the baker reads `content/{spawns,herb-nodes,mining-nodes,
fishing-nodes}.yaml`, and for every floor-3 node adds its **`at` AND `approach`** tile to `noTree`
(`build…:387-397`) so a tree never spawns on/beside a spawn or skilling node and seals it off. Pair
with `REQUIRED_WALKABLE` (`build…:290-296`), which the importer asserts stays walkable. Omitting this
walls off floor-3 mining/herb/fishing.

## 4. Bake order (tile passes) + runtime objects

Tile canvas, later over earlier: **0** grass base-fill → **1** water (corner-Wang dual-grid) →
**2** plateau tops → **3** roads → **4** road-edge dither → **5** beach → **6** border void →
**7** cliff faces → **8** ladders → **9** cliff-base AO shadow.

**Trees and props are NOT in this stack.** They are emitted as **runtime sprite `objects[]`** (sprite
key, w/h, `blocking`, `resource`), **depth-sorted against the player at runtime** and drawn over the
whole baked tile canvas. (Decision 2a.)

## 5. Engineered micro-blends (TILE-LOCAL hashing)

- **Cliff-base AO:** dithered dark band at `baseY=(r+total+1)·ts−4`, height `CLIFF_AO_BAND_PX=14`,
  darken `(1−dy/SH)·CLIFF_AO_MAX_DARKEN·strength`, `strength=min(1,drop/2)`. Keep ~98% of the top row,
  taper via `hrand(px%ts, py%ts)` (`build…:212`).
- **Road-edge dither:** on each road side facing **grass — `F`, `f`, OR `q`** (`build…:135`), stipple
  the outer `ROAD_DITHER_EDGE_PX=3` px, copying the neighbour pixel with prob
  `ROAD_DITHER_PROB_BY_DEPTH=[0.20,0.10,0.04]` when `hrand(px%ts,py%ts) ≤ prob[d]` (`build…:145`).
- **Beach noise:** `((y*73 + x*31) % 17) − 8` per pixel (`build…:156`), deterministic, not `hrand`.
- **Determinism:** all use **tile-local** position hashing (so identical tile configs dedupe into one
  tileset entry). Never `Math.random()`.

## 6. Decoration scatter

- **Density:** `ENVIRO_PROP_DENSITY_GATE = 0.16` per `F`-cell (locked in review).
- **Rules:** open grass `F` only; reject if in `noTree`, within `PROP_MIN_SPACING_CELLS` of another
  prop, or if any 3×3 neighbour is a tree cell. Painter's order.
- **Prop groups** (id→scaled width): shrubs/rock `[22,24,25,70]`@26 · flower tufts
  `[33,34,35,49,105,107]`@22 · logs/stump `[39,53,115]`@40 · small plants `[54,97]`@18.
- **Scale rule:** blacklist props that read out-of-scale (>~1.3 tiles). `obj 116` removed for this.

## 7. Tunables (mirrored in BOTH bakers — edit the in-game one)

The block lives at the top of **`tools/build-northwood-from-authored.ts:30-39`** (and is mirrored in
the preview). Changing the in-game look = edit the baker + `npm run assets:northwood`:

```ts
const TREE_TARGET_W_PX = 60;            // ~1.9 tiles
const TREE_MIN_SPACING_CELLS = 2;       // thinning, not clustering
const ENVIRO_PROP_DENSITY_GATE = 0.16;
const PROP_MIN_SPACING_CELLS = 2;
const ROAD_DITHER_EDGE_PX = 3;
const ROAD_DITHER_PROB_BY_DEPTH = [0.20, 0.10, 0.04];
const CLIFF_AO_BAND_PX = 14;
const CLIFF_AO_MAX_DARKEN = 0.4;
const CLIFF_MAX_WALL_TILES = 4;
// TREE_IDS = [7, 8, 84, 89, 6, 85, 90]   // conifer + leafy variety, random per placement
```

## 8. Per-region pipeline (end to end)

1. **Author data:** `layout-authored.txt` + `elevation.txt` (via `derive_layout_from_mockup.py` +
   `derive_elevation.py`, which downsample the mockup to the grid). Use the §1 semantic chars.
2. **Generate bespoke sheets** with the **visual-cell-order** prompt pattern
   (`docs/northwood-plateau-top-v2-prompt.md`): magenta `#FF00FF` bg, hard edges, fixed grid, 32px @1×.
3. **Slice** on the fixed grid (`slice-plateau-v2.py` template; magenta key `blue ≥ green + 8`).
4. **Bake the in-game stage:** adapt `build-northwood-from-authored.ts` for the region — emit tileset
   PNG + `<zone>.stage.json` (base/fringe layers, collision, objects, semantic ascii) + `<zone>.vocab.json`
   (chars, portals, required-walkable). Reserve gameplay anchors (§3f).
5. **Import + validate:** `import-asset-forge-stage.ts` → `src/generated/stages/<zone>.ts`. Fix any
   invariant abort (§3c).
6. **Wire the engine** (§3d): `makeFloorTiles` + `GENERATED_STAGES` + camera zoom for the floor.
7. **Verify:** `tsc` clean, `npm run workflow:<zone>` (stage check + typecheck + browser-texture + the
   behavior e2e), and **eyeball in-browser** — walk the map, confirm collision, chop a tree, hit each
   portal. The render is not done until it's verified *in the game*, not just as a PNG.

## 9. Deferred (genuine feature gaps — the engine path itself is NOT deferred)

The live in-game stage pipeline already exists and ships (it feeds `makeFloorTiles`/`tileAt`/
collision and depth-sorts object sprites). What's still TODO:

- 47-tile concave inner corners for plateaus & cliffs (inner-L/R art already exists).
- Diagonal roads — needs diagonal **path data** in the layout, not new art.
- Herb/mining/fishing **collision** (currently approach-based, non-blocking node tiles).
- Per-region palette swaps and weather/time-of-day lighting.

---

## System Injection Prompt — hand this to a fresh agent starting a new region

```
You are building a new region for the game "Jib". Match Northwood's 16-bit SNES/GBA top-down look AND
produce a FUNCTIONAL in-game stage (collidable, skillable), not just a pretty PNG.

SOURCE OF TRUTH: tools/build-northwood-from-authored.ts -> tools/import-asset-forge-stage.ts ->
src/generated/stages/<zone>.ts (consumed by src/shared.ts makeFloorTiles/isBlockedTile/tileAt and
src/main.ts). Read those + world_crafting_spec.md first. tools/render-northwood-trees.ts is an OFFLINE
PREVIEW PNG that never ships — do NOT use it as truth. Build/verify with `npm run assets:<zone>` and
`npm run workflow:<zone>`.

Hard rules (do not invent behavior the code lacks):
- 32px tiles @1×, magenta #FF00FF sheets, hard edges. Map size data-driven from layout-authored.txt;
  elevation.txt = integer per-cell heights.
- COLLISION IS CHAR-BY-CHAR: the engine reads the stage ASCII rows via shared.ts isBlockedTile/
  isSightBlocked/isRoadTile/tileAt, NOT the numeric collision grid. Every cell char MUST be a semantic
  char those functions know (F grass, t road, . beach, m stairs, ~ water, ^ void, q cliff, y tree-trunk,
  portals S/N/M/D). A char with no shared.ts entry is silently broken in-game.
- GROUND IS TWO LAYERS: base = canonical semantic ref (validator/fallback), fringe = exact per-cell
  visual (null if redundant). The client renders from layer refs, so VISUAL is decoupled from the
  COLLISION char (that's how a 'y' trunk looks like grass but blocks).
- Terrain autotiles: corner-Wang (NW1|NE2|SE4|SW8) for fluid fills; 4-bit EDGE Wang (N1|E2|S4|W8,
  set bit = same terrain) for plateaus/roads (16-tile, NOT 47-tile). Author sheets in FIXED VISUAL
  CELL ORDER; the renderer owns position->mask.
- Bake order (TILE passes): grass base-fill -> water -> plateau tops -> roads -> road dither -> beach
  -> void -> cliff faces -> ladders -> cliff-base AO. Trees/props are NOT baked — they are runtime
  sprite objects[] depth-sorted against the player.
- Micro-blends use TILE-LOCAL hrand(px%ts,py%ts) (dedupe-friendly), never Math.random.
- Vegetation is THINNED not clustered (TREE_MIN_SPACING_CELLS); density = how many tree cells the
  layout paints. Decoration: 16% gate on open grass, spaced, clear of stairs/paths/trees, <~1.3 tiles.
- CHOPPABLE TREES: tag tree objects resource:{kind:'tree',tx,ty} and flip the trunk char to 'y'
  (blocked+sight) while keeping a grass base ref; the server makes 'y' a woodcutting node and the
  client renders the authored sprite + skips it from static decoration.
- RESERVE GAMEPLAY ANCHORS: read content/*.yaml for the floor and add every node at+approach tile to
  noTree, or blocking trees will wall off spawns/skilling.
- WIRE THE ENGINE: importer does NOT edit shared.ts/main.ts. Add the stage to makeFloorTiles +
  GENERATED_STAGES and give the floor a camera zoom, or the floor renders empty/mis-framed.

Be honest about gaps. If an effect (Perlin cliff stagger, 8-way wrapping, diagonal roads, tree
clustering, herb/mining collision) is NOT in the code, say so — implement it for real or flag it. Keep
tsc clean and confirm the result IN THE BROWSER (walk it, chop a tree, hit every portal), not as a PNG.
```
