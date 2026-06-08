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

Current per-floor counts (live, from `MONSTER_SPAWNS`): 1 Cemetery **6**, 2 Crypt **4**,
3 Northwood **22**, **4 Northwatch 0**, 5 Marsh **2**, 6 Badlands **2**, 7 Desert **2**,
8 Beach **2**, 9 Jungle **3**, 10 Mine **5**. Target band: **~4–6 per combat floor.**

- **Floor 4 Northwatch has ZERO enemies** — biggest content hole, theme it first.
- **Floors 5–8 have only 2 types each** — thin; +2–3 each.
- **Floor 3 Northwood has 22 types** — overstuffed; some (dire_wolf, orc) could migrate up to the
  Northwatch frontier instead of authoring net-new there.
- Floor 0 (Waystone) and 11 (Route) are intentionally safe — leave.

### Lore hook for cohesion
Floors 5/7/8/9 are all **"Sunken"** zones and already carry a drowned-civilization motif
(`sun_wraith`, `drowned_marauder`, `totem_wraith`). New enemies below lean into a **fallen empire
swallowed by marsh/sand/sea/jungle** — its dead, its guardians, and the beasts that nest in the ruins.

### Concrete expansion wishlist (inspired by fantasy-RPG bestiaries)
Same sheet format as P0 (`enemy-directional-4x4-v2`, 384×384). `role` matches the existing vocab
(`trash` / `elite` / `turret`=ranged caster / `ambush` / `boss`). ~20 net-new across 6 floors.

#### Floor 4 — Northwatch (frontier watch-fort; **author first**)
A fortified pass besieged from the north and rotting from within — human antagonists + northern beasts.

| Enemy | Role | Art brief | Inspiration |
|---|---|---|---|
| **frontier_marauder** | trash | leather-clad deserter, hand-axe, fur half-cloak | bandit (RuneScape/Skyrim) |
| **watch_defector** | elite | corrupted ex-watchman, torn tabard, spear + kite shield | fallen knight |
| **frost_warg** | trash (pack) | pale ice-matted wolf, frost breath, paler than dire_wolf | warg (LotR) |
| **raid_houndmaster** | turret | horn-blowing raider, throws bolas/whistles in the warg pack | beastmaster |
| **iron_sentinel** | elite | animated suit of watch-plate, hollow glow, halberd | animated armor (Dark Souls) |
| **Warlord Korrun** | boss | hulking raid warlord, horned helm, two-handed cleaver | warband chief |

#### Floor 5 — The Sunken Marsh (+3)
| Enemy | Role | Art brief | Inspiration |
|---|---|---|---|
| **bog_leech** | ambush | giant blood-leech, lunges from murk, glossy segmented body | swamp leech |
| **marsh_hag** | turret | hunched bog-witch, ragged shawl, hurls green hexbolts | witch (Diablo) |
| **gloom_toad** | trash | bloated venom toad, warty, tongue-lash, faint poison haze | giant toad (DnD) |

#### Floor 6 — The Searing Badlands (+3)
| Enemy | Role | Art brief | Inspiration |
|---|---|---|---|
| **magma_hound** | trash (pack) | obsidian-skinned beast, glowing lava cracks, ember drool | hellhound |
| **cinder_shade** | turret | floating ember-spirit, ash robes, lobs fire motes | fire wraith |
| **basalt_brute** | elite | slab-rock golem, cracked molten core, slow heavy slam | rock elemental |

#### Floor 7 — The Sunken Desert (+3)
| Enemy | Role | Art brief | Inspiration |
|---|---|---|---|
| **bone_scorpion** | ambush | giant pale scorpion, burrows + bursts, raised stinger | desert scorpion |
| **dune_reaver** | trash | mummified tomb-raider undead, wrapped, rusted khopesh | mummy (DQ/ES) |
| **mirage_shade** | turret | shimmering sand-djinn, half-formed torso, sand-blast | djinn/sand mage |

#### Floor 8 — The Sunken Beach (+3)
| Enemy | Role | Art brief | Inspiration |
|---|---|---|---|
| **tide_lurker** | trash | anglerfish-headed humanoid, dripping, barnacled spear | deep one (Lovecraft) |
| **brine_siren** | turret | pale sea-spirit, kelp hair, sings a luring sonic blast | siren/harpy |
| **coral_crab** | elite | armored giant crab, coral-crusted shell, big pincer guard | giant crab (tank) |

#### Floor 9 — The Untamed Jungle (+2)
| Enemy | Role | Art brief | Inspiration |
|---|---|---|---|
| **canopy_stalker** | ambush | sleek jungle panther, drops from above, spotted dark coat | hunting cat |
| **blowpipe_headhunter** | turret | feral ruin-tribe hunter, bone mask, ranged dart blowpipe | jungle tribal |

> Author order: **Floor 4 set first** (it's empty), then one caster + one melee per Sunken floor
> (5→8) to lift each to ~4–5 types, then the Jungle pair. Bosses (Korrun) last. Reuse the P0
> tinting trick where a palette swap yields a second type from one sheet (e.g. frost_warg → a
> darker timber variant) to stretch coverage.
