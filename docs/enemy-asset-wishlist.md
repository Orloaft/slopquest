# Enemy roster stock-take & asset wishlist

_Generated 2026-06-08. Source of truth: `src/main.ts` (`monsterActorSpec`, `createActorFrames`,
`WOODLAND_BESPOKE_FAMILIES`), `src/generated/catalog.ts` (`MONSTERS`, `MONSTER_SPAWNS`).
Quality tiers below were assessed by EYE from rendered contact sheets
(`artifacts/enemy-contact/fam-*.png`), not by frame count._

## Roster at a glance

- **~43 enemy types** across **12 floors (0–11)**, drawn by **33 sprite families**.
- Three art pipelines of **very different quality** — frame count does NOT track quality.

## Sheet format (target for any new asset) — `enemy-directional-4x4-v2`

- **384×384 px**, **96 px cells**, **4 columns × 4 rows (walk only)**, transparent background.
- Rows in order: `walk_up, walk_right, walk_down, walk_left`. **No attack rows** — attacks reuse the
  walk pose + the shared slash/missile effect overlays.
- 4 frames per row. Side art faces LEFT; right is mirrored. Validated by `npm run assets:enemies:check`.
- **Style:** simpler painterly pixel — strong silhouette, limited palette (~8–16 colours, hard cap 64),
  one clear key/rim light, low interior noise. Full spec in `docs/enemy-asset-pipeline.md`.
- ~16 cells per creature (was 64). See `docs/enemy-asset-pipeline.md` for the authoritative contract.

---

## Quality tiers (the honest version)

### TIER A — real pixel art, keep as-is
Hand-authored montage sheets, 4-direction × 4-frame walk. Look good.

| Family | Types it draws | Area |
|---|---|---|
| skeleton | skeleton, grave_shambler, boss (Ashen Warden, tinted) | cemetery/crypt |
| rat | rat, reach_hen, meadow_hopper, reach_vole | woods/route |
| spider | spider | woods |
| wisp | wisp | woods |
| greyWolf | wolf | woods |
| goblin / goblinScout / goblinShaman | goblin, goblin_scout, goblin_shaman | woods |

### TIER B — good art, weak animation (upgrade later, not urgent)
The `/new-enemies.png` montage families. Art is solid detailed pixel art, but each is
effectively **single-pose** — the same facing is shown for all four directions, and walk/attack
cycles are short (3–4 frames). They read fine in motion but lack real directional turns.

`skitterer, mire_spitter, canyon_scavenger, dust_burrower (+crimson_burrower, tinted),
dune_skitterer, sun_wraith, reef_prowler, venomous_stalker, totem_wraith`

### TIER C — PLACEHOLDERS, replace first ⚠️
The 16 `WOODLAND_BESPOKE_FAMILIES`. **These have full 64-frame rigs (8-dir, walk+attack) but the
art is procedurally drawn by `tools/generate_woodland_enemy_sprites_v2.py` — flat geometric
blobs with dot eyes.** Examples seen: dire_wolf is a grey rectangle-on-legs; ancient_treant is a
brown box with a green slab; ghoul/orc are green blocks. This is what "avg placeholder sprites"
means here. **22 of the ~43 types render on these.**

---

## P0 wishlist — replace the 16 placeholder families

One sheet per family (768×768, format above). Brief is the art direction; "feeds" = types that
inherit it (so one good sheet fixes several enemies).

| # | Family | Art brief | Feeds (types) | Floor(s) |
|---|---|---|---|---|
| 1 | **ghoul** | hunched rotting undead, grey-green flesh, lank limbs | ghoul, restless_husk, drowned_marauder (tinted) | cemetery 1 / beach 8 |
| 2 | **grave_revenant** | armored undead warrior, tattered cloak, faint glow | grave_revenant, bound_wight, deepdelve_wight (tinted) | cemetery 1 / crypt 2 / mine 10 |
| 3 | **pale_banshee** | floating wailing ghost, pale tattered shroud | pale_banshee | cemetery 1 |
| 4 | **crypt_sentinel** | heavy armored tomb guardian, stone+iron, glowing eyes | crypt_sentinel | crypt 2 / mine 10 |
| 5 | **dire_wolf** | large dark winter wolf, layered fur, snarl | dire_wolf | woods 3 |
| 6 | **orc** | green-skinned brute, leather + crude blade | orc | woods 3 |
| 7 | **wild_boar** | bristled tusked boar, charging stance | wild_boar | woods 3 |
| 8 | **thorn_hedgehog** | oversized spined hedgehog, thorny quills | thorn_hedgehog | woods 3 |
| 9 | **forest_spider** | dark woodland arachnid, banded legs | forest_spider | woods 3 |
| 10 | **forest_slime** | translucent green ooze, wobble, leaf bits inside | forest_slime | woods 3 |
| 11 | **sapling_deer** | spirit deer, bark-skin, moss antlers | sapling_deer | woods 3 |
| 12 | **mushroom_brute** | fungal colossus, cap-helmet, spore puffs | mushroom_brute | woods 3 |
| 13 | **ancient_treant** | walking tree guardian, gnarled bark, leaf crown | ancient_treant, verdant_faultwarden (boss, tinted) | woods 3 / jungle 9 |
| 14 | **bone_druid** | skeletal caster, antler staff, ritual robes | bone_druid | woods 3 |
| 15 | **forest_pixie** | tiny winged fae, glow trail | forest_pixie | woods 3 |
| 16 | **bog_wraith** | dripping marsh spirit, muddy vapor body | bog_wraith | woods 3 |

> Note for the imagen agent: image models struggle to emit a clean 8×8 sprite grid directly. Two
> workable routes — (a) generate a single 96px hero frame + a style sheet per family, then rig/animate
> in the existing pipeline; or (b) generate per-frame and assemble. Decide before batch-running.

## P1 wishlist — directional/animation upgrade for Tier B (9 families)
Re-pose the `new-enemies.png` creatures into true 4-direction + walk/attack cycles. Same sheet
format. Lower priority — art quality is already acceptable.

## P2 — roster expansion (gaps, not quality)

- **Floor 4 "Northwatch" has ZERO enemies** — biggest content hole. Needs a 3–5 enemy set.
- **Floors 5–8 (marsh, badlands, desert, beach) have only 2 enemy types each** — thin; +2–3 each.
- **Floor 3 "Northwood" has 22 types** — massively overstuffed vs every other floor. Candidate to
  redistribute some woodland enemies up to Northwatch (4) once it's themed.
- Floor 0 (Waystone hub) and the route are intentionally light/safe — leave.

### Suggested expansion direction
Bias new enemies toward the **under-served biomes** (4–8) so difficulty pacing has variety, and
theme floor 4 first since it's empty. Aim for ~4–6 enemies per combat floor as the target band.
