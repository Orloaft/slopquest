# Editor Layers: spawns, ore, herbs (and friends)

The stage editor (`/editor.html`) has a **Layers** mode that edits *point-entities*
on top of the tile grid — things placed at a tile, not painted into it. Three layers
ship today; more reuse the same UI + save pipeline:

| Layer | Base file | Overlay file | Per-entity |
|---|---|---|---|
| 👹 Enemy spawns | `content/spawns.yaml` | `content/spawns.editor.yaml` | monster `type` |
| ⛏️ Ore | `content/mining-nodes.yaml` | `content/mining-nodes.editor.yaml` | `kind` + auto `approach` |
| 🌿 Herbs | `content/herb-nodes.yaml` | `content/herb-nodes.editor.yaml` | `label` + item/level/xp preset + auto `approach` |
| 🌳 Trees / decorations *(planned)* | `stage.json objects[]` | … | sprite + sub-tile pos |

> TL;DR — pick a layer, choose a value (monster / ore kind / herb type), click empty
> tiles to place, drag a marker to move, right-click or `Del` to delete, then
> **💾 Save**. Your edits land in a `*.editor.yaml` **overlay**; the hand-authored,
> commented base files are **never** rewritten.

## How to use it

1. Open `/editor.html`, pick the stage (region) from the top dropdown.
2. Under **Layers**, click a layer (e.g. **👹 Enemy spawns** or **⛏️ Ore**). The
   header shows the stage's floor + zone (e.g. `floor 3 · woods`). No Layers
   section = the stage isn't mapped to a floor; see [Stage → floor/zone](#stage--floorzone).
3. Pick a value from the dropdown (monster type / ore kind). Then on the canvas:
   - **Click an empty tile** → place an entity there.
   - **Drag a marker** → move it to a new tile.
   - **Right-click a marker**, or select it and press **Delete/Backspace** → remove it.
4. Markers: a **filled disc ●** is an editor placement; a **hollow ring ◯** is an
   existing entity from the base file. A **yellow outline** is the current selection.
   Gathering nodes (ore) also draw a **tick line** to their auto-picked *approach*
   tile — the walkable neighbour a player stands on to gather.
5. **💾 Save & rebuild** writes the overlay file(s) and reruns `content:build`, so
   the running game tab hot-reloads. Tile edits and every dirty layer save together
   in one click. Switching layers preserves unsaved edits in the others.

## Where placements go: the overlay files

Each layer writes a small, machine-owned `*.editor.yaml`. `scripts/build-content.ts`
merges it with the base file at build time:

> **final = (base entities, minus any suppressed ones) + overlay placements**

**Spawns** — `content/spawns.editor.yaml`. Suppression is keyed by **tile**, since
spawns have no id:

```yaml
monsters:
  - { type: wolf, at: { floor: 3, x: 42, y: 33 }, zone: woods }
removed:
  - { floor: 3, x: 51, y: 65 }     # hide the spawns.yaml spawn at this tile
```

**Ore / herbs** (gathering nodes) — `content/mining-nodes.editor.yaml` /
`content/herb-nodes.editor.yaml`. Nodes carry a unique `id`, so suppression is keyed
by **id**, and coordinates are tile centres (`x.5`/`y.5`). The `approach` is
auto-picked from a walkable neighbour:

```yaml
nodes:
  - { id: mine-3-45-35, kind: iron, at: { floor: 3, x: 45.5, y: 35.5 }, approach: { x: 46.5, y: 35.5 } }
removed:
  - { floor: 3, id: mine-3-8-49 }  # hide the mining-nodes.yaml node with this id
```

**Herb types are presets.** A herb's `label` carries loosely-coupled
`item`/`requiredLevel`/`xp` knobs, so the editor's herb palette is the set of
*distinct herb types* found in `herb-nodes.yaml` (each label + its fields). Placing
copies the whole preset — you don't set level/xp by hand. **A brand-new herb type
must be added to `herb-nodes.yaml` first** (one node with the desired label/fields);
it then appears in the palette. Saved herb nodes carry the full field set:

```yaml
nodes:
  - { id: herb-5-60-40, label: "Glowing Marsh Lily", item: marsh_lily, requiredLevel: 5, xp: 30, at: { floor: 5, x: 60.5, y: 40.5 }, approach: { x: 61.5, y: 40.5 } }
```

Two consequences worth knowing:

- **Base files are never touched by the editor.** Your hand-authored comments and
  carefully-tuned placements stay exactly as written. The overlay only *adds*
  placements and *suppresses* specific base entities.
- **Moving or deleting a base (◯) entity** records a suppression (by tile for
  spawns, by id for nodes). A move also re-emits it as an overlay placement — so a
  moved base entity flips from ◯ to ● and keeps its id.

Overlay files are **authoritative content** (committed, like the base files), not
scratch files. Don't hand-edit one while the editor is open — the editor rewrites
that floor's entries wholesale on save. To stop the editor managing an entity, move
it into the base file by hand and drop the corresponding overlay/`removed` lines.
The auto-derived `approach` is a plain neighbour pick — hand-tune it in YAML if a
node needs a specific standing tile.

## Stage → floor/zone

The content files key entities by **floor number** (and spawns also by **zone id**),
but a stage's `stage.json` carries neither. The mapping lives in **`STAGE_META`** in
`vite.config.ts` (it mirrors `ZONES` in `src/shared.ts`):

| stage | floor | zone | stage | floor | zone |
|---|---|---|---|---|---|
| waystone | 0 | southTown | swamp | 5 | marsh |
| cemetery | 1 | cemetery | searing-canyon | 6 | badlands |
| crypt | 2 | crypt | desert | 7 | desert |
| northwood | 3 | woods | beach | 8 | beach |
| northwatch | 4 | northTown | jungle | 9 | jungle |
| | | | deepmine | 10 | deepMine |

A stage absent from `STAGE_META` simply shows no Layers section. Spawn coordinates
are 1:1 with the editor grid; gathering nodes sit at tile centres (`+0.5`). Every
floor is authored at its target size (see `SCALE_AUTHORED_AT_TARGET` in
`build-content.ts`), so the tile you click *is* the entity tile.

## Architecture (adding the next layer)

The layer system is data-driven on both sides:

- **Client** (`editor.html`): a `LAYERS` array of configs. Each declares its
  palette, coordinate convention (`int` vs `center`), suppression key (`tile` vs
  `id`), whether it has an `approach`, and its save API. The interaction
  (place/select/drag-move/delete), marker drawing, and per-layer working sets are
  all shared (`placeEntity` / `moveEntityTo` / `deleteEntity` / `drawEntities` /
  `buildPayload`). A new layer is a new entry in `LAYERS` + a button/panel in the
  sidebar HTML.
- **Server** (`vite.config.ts`): spawns have a bespoke `/editor/api/spawns/save`
  (tile suppression); gathering nodes share a **generic** `/editor/api/nodes/save?layer=<id>`
  driven by the `NODE_LAYERS` table — each row lists the per-node `fields` to carry
  (ore `["kind"]`, herbs `["label","item","requiredLevel","xp"]`). The state endpoint
  also serves each layer's data + palette.
- **Build** (`scripts/build-content.ts`): `loadOptional` reads each overlay; the
  merge filters base by suppression then appends overlay placements.

Adding a node layer = one `NODE_LAYERS` row + one `LAYERS` entry + a sidebar
button/panel + the matching overlay merge in `build-content.ts`. Trees/decorations
is the genuinely different remaining layer — it edits `stage.json objects[]` (sprite
+ sub-tile position) rather than a content-YAML node, so it needs its own save path.

## Tests

`tests/e2e/editor-spawns.spec.ts`, `editor-ore.spec.ts`, and `editor-herbs.spec.ts`
drive the layers through the `?__test` seam and assert the working set + the exact
save payload (place, move-suppresses-base, delete; herbs also check preset copy)
without writing files. Run with `npx playwright test editor`.
