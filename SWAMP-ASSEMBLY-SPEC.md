# Sunken Marsh (Floor 5) — Assembly Spec (Northwood blueprint)

Status: DRAFT for review. Author derived this by reading the real Northwood pipeline
(`tools/build-northwood-from-authored.ts`, `tools/import-asset-forge-stage.ts`,
`src/generated/stages/northwood.ts`, runtime path in `src/main.ts` / `src/shared.ts`).

---

## 0. The core realization

Northwood is **not** assembled the way I've been doing the marsh. There are two
completely different rendering paths in this codebase:

| | Northwood (floor 3) + Waystone (floor 6 stage) | Marsh/Badlands/Desert/City (floors 4–7, current) |
|---|---|---|
| Map source | **Baked offline** from a mockup → `src/generated/stages/northwood.ts` | Hand-authored `fillRect` calls live in `makeFloorTiles()` |
| Tiles | Pre-baked, deduped **tileset** (`forest.png`) + per-cell `base`/`fringe` layer refs | Runtime hash-scatter of a few texture keys (`marshGroundTexture`, `MARSH_PURPLE`) |
| Edges | **Autotile / Wang** passes (water corner-Wang, plateau edge, road edge + dither, cliff faces, AO) | `applySwampWaterEdges` = flat one-pass `W→4` replacement |
| Props | Runtime **objects[]** (depth-sorted sprites) with reserved gameplay anchors | `addTileDecorations` sparse scatter + ad-hoc `MARSH_RUINS` table |

Runtime proof: `src/shared.ts:260` — for floor 3 `makeFloorTiles` just returns
`NORTHWOOD_STAGE.rows`; it never runs `fillRect`. `GENERATED_STAGES_BY_FLOOR`
(`src/main.ts:7028`) routes floors 3 + the Waystone floor to the baked path.
**Everything I've been shipping on the marsh is the OLD path.** To hit Northwood
quality we port floor 5 onto the generated-stage pipeline. Waystone is the proof
this is a repeatable recipe (it's the 2nd stage built this exact way) — the swamp
is the 3rd.

---

## 1. Pipeline architecture (what we're replicating)

```
  artifacts/swamp-mockup-TARGET.jpg          public/swamp-tiles.png (1536x1024, magenta-keyed)
            │                                          │
   derive layout (+depth)                       slice Wang atlases  (asset prep, one-time)
            ▼                                          ▼
  assetsources/mockup/swamp-layout-authored.txt   assetsources/curated/sliced/swamp-*.png
  assetsources/mockup/swamp-depth.txt (optional)
            │                                          │
            └──────────────┬───────────────────────────┘
                           ▼
        tools/build-swamp-from-authored.ts   ← THE BRIDGE BAKER (mirror of Northwood's)
          • runs locked autotile passes onto a canvas
          • slices canvas → 32px cells, dedupes → swamp.png tileset
          • emits swamp.stage.json + swamp.vocab.json
                           ▼
        tools/import-asset-forge-stage.ts  (EXISTING — reuse as-is)
                           ▼
        src/generated/stages/swamp.ts  (SWAMP_STAGE constant)
                           ▼
        register in GENERATED_STAGES (src/main.ts:7027) + index.ts
        → makeFloorTiles(5) returns SWAMP_STAGE.rows; old fillRect block deleted
```

npm scripts to add (mirror `assets:*:northwood`, package.json:27–35):
```
"assets:bridge:swamp": "node tools/build-swamp-from-authored.ts",
"assets:stage:swamp":  "node tools/import-asset-forge-stage.ts --stage .../swamp.stage.json --vocab .../swamp.vocab.json --out src/generated/stages/swamp.ts --public-dir public/tilesets/swamp",
"assets:swamp":        "npm run assets:bridge:swamp && npm run assets:stage:swamp",
"workflow:swamp":      "npm run assets:stage:swamp:check && npm run typecheck && playwright test tests/e2e/asset-forge-stage.spec.ts <swamp-reachability>.spec.ts --project=chromium"
```

---

## 2. The locked autotile passes — Northwood → Swamp mapping

Northwood's baker runs these passes in order (file:line in `build-northwood-from-authored.ts`).
For each, here's the swamp equivalent. **A flat swamp is SIMPLER than Northwood** — if depth
is uniform there are no cliff faces or plateau tiers, so the two hardest passes drop out.

| # | Northwood pass | Line | Swamp version |
|---|---|---|---|
| 1 | Ground fill (grass idx0 on all land) | 102–108 | **Purple lichen base** on all land. `GRASS_IDX0` → lichen-top idx0. This replaces `marshGroundTexture` scatter. |
| 2 | Water corner-Wang dual-grid (0.5-offset 4-corner mask) | 110–114 | **Swamp-water pools** with feathered shores. THE big upgrade — real corner-blended banks instead of `applySwampWaterEdges`'s flat `W→4`. Needs a `swamp-water-wang.png` atlas. |
| 3 | Plateau-top edge autotile per tier | 116–126 | **Only if depth used.** For raised lichen banks / ruined platforms: same NESW `maskToIdx` autotile on a `swamp-bank-wang.png`. v1: skip (depth all-0). |
| 4 | Road edge-Wang + dither | 128–150 | **Tan dirt trails.** Winding causeways become a `swamp-path-wang.png` with the same 4-neighbour mask + tile-local dither feathering into lichen. Replaces the `m`/`k` fillRect causeways. |
| 5 | Beach noise | 152–160 | Optional shore mud band where water meets path. |
| 6 | Void fill | 162–165 | Map border (dark). |
| 7 | Cliff faces (south drops, 3 col variants, AO) | 167–218 | **Only if depth used** (low mud banks / ruin walls). v1: skip. If wanted later, reuse the exact `dropS`/`col`/`rowKind` logic with a `swamp-bank-face.png`. |
| — | Ladders | 189–206 | N/A for flat swamp. |
| — | Contact-shadow AO | 207–218 | Keep a soft version under banks/ruins for grounding. |

**Recommendation for v1: depth-field all-0** (flat swamp). That removes passes 3 & 7 entirely.
The swamp's whole identity is passes 1+2+4: a cohesive purple lichen carpet, organically
edged water pools, and winding tan dirt trails — which is exactly what the mockup shows and
exactly what the current code fakes badly. Add depth later only if the mockup has raised
stone platforms worth terracing.

---

## 3. Asset prep (the real labor) — slice Wang atlases from the swamp sheet

Northwood consumed pre-sliced Wang atlases from `assetsources/curated/sliced/`
(`water-wang.png`, `road-wang.png`, `plateau-top-v2.png`, `cliff-face.png`, `ladder.png`).
The swamp needs its own, sliced from `public/swamp-tiles.png`:

- `swamp-water-wang.png` — 16-tile corner-Wang set for the purple/teal swamp water ↔ land
  boundary. (Corner-Wang = 16 entries indexed by the 4-corner mask, see line 112.)
- `swamp-lichen-top.png` — at minimum idx0 (surrounded lichen). 16-entry NESW set if we want
  variation/edges; idx0 alone is enough for a flat carpet.
- `swamp-path-wang.png` — 16-tile edge-Wang for tan dirt trails (line 131 mask).
- (deferred) `swamp-bank-face.png` + bank-top if we ever enable depth.

This slicing is a one-time tool (model on whatever produced the curated/sliced set). The
swamp sheet is magenta-keyed; reuse the existing `isMagentaKey` + `defringeMagentaHalo`
logic already proven on this sheet. We already know good swamp tile coords from the current
`marshGroundTexture` work (purple variants at 255,256 / 97,177 / 18,256 / 333,256; path at
252,261; ruins arch 1043,635 / pillar 827,635).

---

## 4. Gameplay-anchor preservation (critical — don't break floor 5)

Northwood pins gameplay contracts as overlays AFTER the visual passes, so collision is never
hostage to the autotiler:
- `PORTAL[]` (line 284) — fixed char + grass tile at exact coords.
- `REQUIRED_WALKABLE[]` (line 290) — forces walkable, un-blocks if the autotiler walled it.
- Tree/prop placement reserves gameplay anchors read straight from the content YAML
  (`spawns/herb/mining/fishing.yaml`, lines 387–397) so nothing spawns on a node.
- Collision is resolved by **semantic chars** via `shared.ts isBlockedTile` on the ascii rows,
  while the exact look lives in a separate **fringe layer** (lines 275–283, 355–366). Char and
  pixel are decoupled — that's how it keeps both quality and correct collision.

Floor 5's existing contracts to pin the same way:
- Portals: `M` (east edge → forest, currently 68,28) and `L` (one-way ledge → Waystone, 7,16).
- Mire-Spitter turret anchors (on open water), boulder `o` LOS-cover positions, the
  Alchemist's Hut clearing, the 3 bridge `B` chokepoints — all currently in the floor-5
  fillRect block (`shared.ts` ~820–875). These are gameplay-tuned; treat as `REQUIRED_*`
  overlays, not autotiler output.

---

## 5. KEY DECISION (needs your call) — layout source

Northwood **derived** its layout char grid from the mockup
(`tools/derive_layout_from_mockup.py`). Floor 5 already has gameplay-tuned geometry. Two ways:

- **(A) Mockup-derived layout** — derive `swamp-layout-authored.txt` from
  `swamp-mockup-TARGET.jpg` (land/water/path masses straight from the art), then pin gameplay
  anchors as overlays. *Closest to mockup; changes map geometry → must re-validate reachability
  & re-place turrets/hut/bridges. Higher effort, true Northwood method.*
- **(B) Convert existing geometry** — mechanically dump current `makeFloorTiles(5)` to a
  char grid as `swamp-layout-authored.txt`, keep geometry identical, run it through the swamp
  compositor for VISUALS only. *Preserves all gameplay/reachability; just upgrades the look.
  Lower risk. Map won't match mockup shapes, only its palette/material treatment.*

My recommendation: **(B) first** (lock in the Northwood-quality *rendering* with zero gameplay
risk), then optionally **(A)** as a follow-up once the look is proven. This also lets us ship
incrementally and A/B the new tile assembly against the current marsh.

---

## 6. Work plan (ordered)

1. **Asset prep** — write `tools/slice-swamp-wang.ts`: slice `swamp-water-wang.png`,
   `swamp-lichen-top.png`, `swamp-path-wang.png` from `public/swamp-tiles.png` into
   `assetsources/curated/sliced/`. Verify each tile keys clean (no magenta halo).
2. **Layout** — produce `assetsources/mockup/swamp-layout-authored.txt` (path A or B) +
   `swamp-depth.txt` (all-0 for v1). 110×72 to match the floor.
3. **Bridge baker** — `tools/build-swamp-from-authored.ts` = copy of the Northwood baker,
   stripped to passes 1/2/4 (+6, +AO), swamp atlases, swamp `CHAR_VOCAB`
   (`W`,`m`,`k`,`B`,`o`,`M`,`L`,`3`,`4` mapped to roles the engine's `isBlockedTile`
   already understands), swamp `PORTAL`/`REQUIRED_WALKABLE`, swamp objects (ruins, compounds,
   undergrowth) with anchor reservation.
4. **Import** — run existing `import-asset-forge-stage.ts` → `src/generated/stages/swamp.ts`.
5. **Wire-up** — add `SWAMP_STAGE` to `GENERATED_STAGES` (`src/main.ts:7027`) and
   `src/generated/stages/index.ts`; delete the floor-5 `fillRect` block + retire
   `marshGroundTexture`/`MARSH_PURPLE`/`MARSH_RUINS`/`applySwampWaterEdges` for floor 5.
6. **Validate** — `npm run workflow:swamp`: stage check + `tsc` + e2e
   (`asset-forge-stage.spec` + a new swamp reachability spec asserting all portals/anchors
   walkable + flood-fill connectivity). Screenshot overview vs mockup.

---

## 7. What this buys us vs the current marsh

- Organically corner-blended water banks (Wang) instead of flat `W→4` edges.
- Cohesive deduped lichen carpet from a real tileset instead of per-cell hash quilt.
- Tan trails that feather into lichen (dither) instead of hard `m`/`k` causeway rectangles.
- Ruins/compounds as proper depth-sorted objects that sort against the player.
- Same authoring loop as Northwood/Waystone → reproducible, mockup-driven, regen-able.
