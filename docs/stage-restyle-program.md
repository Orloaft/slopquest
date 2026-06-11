# Stage Restyle Program — enforce the approved terrain direction on every stage

Mission: bring every game floor to the approved tuft terrain style at the bar set
by the Northwood re-material pilot (commit `f1545039`), without changing gameplay.

Reference standard (the bar): `artifacts/rematerial-pilot/crossroads-compare.png`
bottom two panels — regenerate any time with `tools/render-stage-composite.py`.

Authority chain (in order): `docs/terrain-style-bible.md` (style law) →
`docs/agent-stage-asset-brief.md` (per-agent workflow + imagen rules) →
`world_crafting_spec.md` (assembly pipeline) → this program (sequencing).

## The one rule

**Imagen makes materials and props. Code makes tiles and stages.** No agent ever
generates transition/edge/corner/Wang art with imagen, and no agent chases pixel
parity with an imagen mockup. Fills go through `tools/normalize-terrain-fill.py`
gates or are generated procedurally (`cand_tuft` recipe in
`tools/make-terrain-fill-candidates.py`).

## Stage inventory and per-stage path

Tier A — already on the generated-stage pipeline (re-material only, lowest risk;
replicate the Northwood pilot exactly):

| floor | stage | notes |
|---|---|---|
| 3 | northwood | ✅ DONE (pilot, `f1545039`) — the template |
| 0 | waystone | town: more material classes (plaza, paths, planks) |
| 5 | swamp | atlases synthesized by `tools/slice-swamp-wang.py` — retune that tool's fills to ramps instead of pixel-replacing |
| 11 | route | shares Northwood's atlases — re-bake (`npm run assets:route`) picks up the tuft atlases almost for free; do this FIRST as a smoke test |

Tier B — runtime-direct floors (`makeFloorTiles` + `makeTileTexture` crops in
`src/main.ts`). Two-step: (1) define the biome's ramps + fills, swap the floor's
ground/water/road *fill* textures at the `makeTileTexture` layer (visual-only,
zero geometry risk), (2) optionally converge onto the generated pipeline later
(option B of `SWAMP-ASSEMBLY-SPEC.md`: dump geometry → bake visuals → wire) —
step 2 is a separate approval per floor because it swaps the live floor.

| floor | stage | materials to ramp |
|---|---|---|
| 7 | desert | sand, road, oasis water, quicksand — START HERE (6 materials, `STAGE-ART-DIRECTION.md` phase-0 pilot) |
| 8 | beach | sand, shell-sand, water, cliff |
| 1 | cemetery | grave-grass, path, stone |
| 2 | crypt | floor, wall (dungeon: darker contrast budget, same rules) |
| 10 | deepmine | floor, wall, track |
| 4 | northwatch | plaza, road, roofs stay props |
| 9 | jungle | leaf-floor, river, cliff (elevation overhaul in progress — coordinate, do not collide with that work) |
| 6 | searing-canyon | hardest: hand-tuned relief passes; re-material fills only, keep the relief logic |

## Workstreams (run in this order; A-stages parallelize freely)

- **W0 — engine contact shadows (single agent, once, before stage fan-out):**
  soft ellipse under every depth-sorted object and entity (player, monsters,
  trees, props) in `src/main.ts`. Validated visually in the pilot's third panel.
  Perf gate: existing crowded-scene e2e must stay green.
- **W1 — Tier A re-materials:** route (smoke test) → waystone → swamp. Template:
  `tools/rematerial-northwood-atlases.py` (adapt per atlas set).
- **W2 — Tier B fill swaps:** desert first, then beach/cemetery/crypt/deepmine/
  northwatch, jungle + searing-canyon last (coordinate with elevation work).
- **W3 — global QA:** all-stages cohesion contact sheet at one zoom (extend
  `tools/render-stage-composite.py`); re-run editor blobset classifiers
  (`tools/classify-road-blobset.py`, `classify-water-blobset.py`) wherever a
  re-bake changed atlas indices; final pass on cliff-face re-material round.

## Per-stage task template (the manager assigns one agent per stage)

Inputs: this doc, the bible, the brief, the stage's current screenshots
(`tools/render-stage-composite.py` for Tier A; floor preview specs for Tier B).

Steps: (1) propose the biome's material ramps (anchors sampled from existing
approved art; record them in the bible's anchor section) → get manager sign-off;
(2) produce fills (imagen swatch → normalize gates, or `cand_tuft` recipe) +
variants; (3) re-material/swap; (4) re-bake/typecheck/stage-check; (5) prove
visual-only (ascii/collision/objects byte-identical where geometry was not
explicitly approved to change); (6) artifacts.

Required artifacts per stage (no review without them):
- gate report JSONs for every fill
- before/after composite at 2 fixed locations
- harmony composite: fill + that biome's tree/props + one approved enemy
- `npm run check` output

Done means: artifacts attached, checks green, visual-only proven, committed with
the stage name in the commit subject, pushed.

## Known traps (each cost hours before — do not rediscover)

- Imagen cannot do connection contracts (road-corner saga: ~20px arm offsets).
- Lighting gradients across imagen swatches fail the seam gate — prompt for
  gradient-free, crop variants from the interior.
- Atlas tiles from baked maps carry composited context (grass on road tiles,
  shore corners on water tiles) — sample material populations from known-pure
  tiles/bands, never from arbitrary tiles.
- Re-bakes change tileset indices → editor blobsets go stale (W3).
- The full playwright suite OOMs in sandboxes; run targeted specs `--workers=1`.
- Client hardcodes ws `:8787`; e2e warps need an `E2E_TEST=1` server. Never
  restart the owner's live dev server — use `tools/render-stage-composite.py`
  for art review instead.
- Floor 9 (jungle) has an active elevation overhaul on this branch; floor 6
  relief logic is hand-tuned — re-material fills only.
- `src/generated/` is gitignored; commit sources + exports + public tilesets,
  not generated modules.
