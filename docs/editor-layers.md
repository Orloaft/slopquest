# Editor Layers: enemy spawns (and friends)

The stage editor (`/editor.html`) has a **Layers** mode that edits *point-entities*
on top of the tile grid — things placed at a tile, not painted into it. The first
layer is **enemy spawns**; herbs, ore, and tree/decoration layers slot in later
behind the same UI + save pipeline.

> TL;DR — pick **👹 Enemy spawns**, choose a monster, click empty tiles to place,
> drag a marker to move, right-click or `Del` to delete, then **💾 Save**. Your
> placements land in `content/spawns.editor.yaml`; the hand-authored, commented
> `content/spawns.yaml` is **never** rewritten.

## How to use it

1. Open `/editor.html`, pick the stage (region) you want from the top dropdown.
2. Under **Layers**, click **👹 Enemy spawns**. The header shows the stage's
   floor + zone (e.g. `floor 3 · woods`). If a stage has no Layers section, it
   isn't mapped to a floor yet — see [Stage → floor/zone](#stage--floorzone).
3. Pick a monster from the dropdown. Then on the canvas:
   - **Click an empty tile** → place that monster there.
   - **Drag a marker** → move a spawn to a new tile.
   - **Right-click a marker**, or select it and press **Delete/Backspace** → remove it.
4. Markers: a **filled disc ●** is an editor placement; a **hollow ring ◯** is an
   existing spawn from `spawns.yaml`. A **yellow outline** is the current selection.
5. **💾 Save & rebuild** writes the overlay file and reruns `content:build`, so the
   running game tab hot-reloads with the new spawns. (Tile edits and spawn edits
   save independently in the same click.)

## Where placements go: the overlay file

Editor spawn edits are written to **`content/spawns.editor.yaml`** — a small,
machine-owned file:

```yaml
monsters:                                  # editor placements
  - { type: wolf, at: { floor: 3, x: 42, y: 33 }, zone: woods }
removed:                                   # suppress a spawns.yaml spawn at this tile
  - { floor: 3, x: 51, y: 65 }
```

`scripts/build-content.ts` merges it with `spawns.yaml` at build time:

> **final spawns = (spawns.yaml minus every `removed` tile) + overlay `monsters`**

Two consequences worth knowing:

- **`spawns.yaml` is never touched by the editor.** Your hand-authored comments and
  carefully-tiered placements stay exactly as you wrote them. The overlay only
  *adds* placements and *suppresses* specific base tiles.
- **Moving or deleting a base (◯) spawn** records a `removed` entry for its original
  tile. A move also adds a fresh placement at the new tile. So a moved base spawn =
  one suppression + one placement; you'll see it flip from ◯ to ● after the move.

The overlay file is **authoritative content** (committed, like `spawns.yaml`) — not
a scratch file. Don't hand-edit it while the editor is open; the editor rewrites it
wholesale on each spawn save. To stop the editor managing a spawn entirely, move the
placement into `spawns.yaml` by hand and delete the corresponding overlay/`removed`
lines.

## Stage → floor/zone

`spawns.yaml` keys spawns by **floor number** and **zone id**, but a stage's
`stage.json` carries neither. The mapping lives in **`STAGE_META`** in
`vite.config.ts` (it mirrors `ZONES` in `src/shared.ts`):

| stage | floor | zone |
|---|---|---|
| waystone | 0 | southTown |
| cemetery | 1 | cemetery |
| crypt | 2 | crypt |
| northwood | 3 | woods |
| northwatch | 4 | northTown |
| swamp | 5 | marsh |
| searing-canyon | 6 | badlands |
| desert | 7 | desert |
| beach | 8 | beach |
| jungle | 9 | jungle |
| deepmine | 10 | deepMine |

A stage absent from `STAGE_META` simply shows no Layers section. Spawn coordinates
are 1:1 with the editor grid (every floor is authored at its target size — see
`SCALE_AUTHORED_AT_TARGET` in `build-content.ts`), so the tile you click *is* the
spawn tile.

## Adding the next layer (herbs / ore / trees)

The plan is one layer per content file, all behind this same UI:

| Layer | File | Build step |
|---|---|---|
| 👹 Enemy spawns | `content/spawns.editor.yaml` | `content:build` |
| ⛏️ Ore | `content/mining-nodes.yaml` (overlay) | `content:build` |
| 🌿 Herbs | `content/herb-nodes.yaml` (overlay) | `content:build` |
| 🌳 Trees / decorations | `stage.json objects[]` | stage import |

The server side is the pattern to copy: `/editor/api/spawns/save` reads the optional
overlay, replaces **only the current floor's** entries (other floors stay intact),
writes it back, and reruns the build. The client side is the `layerMode` machinery
in `editor.html` (`initLayers` / `setLayer` / `placeSpawn` / `moveSpawnTo` /
`deleteSpawn` / `drawSpawns`). A new layer adds a button, a palette, a marker
renderer, and a save endpoint — the place/move/delete interaction is shared.

## Tests

`tests/e2e/editor-spawns.spec.ts` drives the layer through the `?__test` seam and
asserts the working set + the exact save payload (place, move-suppresses-base,
delete) without writing files. Run with `npx playwright test editor-spawns`.
