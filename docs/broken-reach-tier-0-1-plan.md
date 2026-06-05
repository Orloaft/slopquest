# Broken Reach Tier 0-1 Plan

Broken Reach is the first full regional arc. It should take a new player from a blank-slate Adventurer through Tier 0 survival, early Tier 1 faction work, and a late Tier 1 dungeon chain that proves they are ready for Tier 2.

## Regional Spine

The Broken Reach used to be one stable crossroad region held together by Waystones and buried anchor sites. The player learns that the Waystones are not just travel stones: they are seals. Searing Core growths are rising along fault-lines and disrupting each outer arm of the region.

Progression should read as:

- Tier 0: survive, map, scavenge, and learn the Reach.
- Early Tier 1: resolve east/west faction crises and unlock first class paths.
- Late Tier 1: descend through the southern collapse and test class mastery.
- Tier 2 exit: recover a route map beyond the mountains.

## Act 1: Gathering the Leftovers

Tier: 0, roughly levels 1-5.

Primary locations:

- Waystone Hub
- Tumbled Market
- Old Surveyor's Cellar
- Gravemarker Fields
- Gravemarker Crypt
- Bell-Tower Ruin

Main beats:

1. The player arrives at Waystone Hub.
2. Sage Ellwyn needs old cartography tools from the southern graveyard.
3. The player finds those tools and the first Searing Core shard.
4. Ellwyn realizes the region is structurally sick, not just dangerous.
5. The player is sent north to warn Northwatch.

Implementation target:

- Keep the starter graveyard readable and approachable.
- Use the first shard as the mystery hook.
- Return the player to Waystone Hub after the first graveyard quest.

## Act 2: The Two Fronts

Tier: early Tier 1, roughly levels 5-10.

Northwatch is the pressure point. Fence Corbin has three practical problems: rotting timber from the west, Scavenger pressure from the east, and patrols disappearing around old ruins. He does not accept Ellwyn's theory until the player brings evidence from both fronts.

### West Branch: Mira and the Marsh

Primary locations:

- Glowmire Piers
- The Lilyfen
- Bog Lantern Hamlet
- Saint Orra's Drowned Chapel
- The Drowned Reliquary

Quest spine:

1. Find Mira Gravewatch in the Sunken Marsh.
2. Gather glowing marsh lilies.
3. Fight skitterers, mire spitters, and rot-touched creatures.
4. Learn that the blight reacts to Searing Core fragments.
5. Brew an anti-blight poultice for Northwatch.

Class payoff:

- Completing Mira's marsh cure quest unlocks Apothecary.
- The unlock should feel like training: field kit, poultices, cleanse logic, and settlement-scale medicine.

### East Branch: Kael and the Badlands

Primary locations:

- Redknife Ravine
- Ash Cart Camp
- Dustburrow Fields
- Cinderjaw Mine
- The Glassfall

Quest spine:

1. Corbin wants the Canyon Scavengers stopped.
2. Kael Brookfoot reveals they are fleeing the Cinderjaw Mine.
3. Dust Burrowers are feeding on crimson mineral veins.
4. The player retrieves proof from Scavenger ledgers and burrower tunnels.
5. The player can push toward truce, crackdown, or uneasy compromise.

Class payoff:

- Helping Kael and resolving the ledger path unlocks Thief.
- Holding the line for Corbin unlocks Vanguard.
- Both can eventually be earned, but the player's first unlock should reflect who they helped first.

## Act 3: The Ominous Depths — Beyond the Reach (early Tier 2)

Tier: **early Tier 2, ~36-55.** This is *not* the back half of Broken Reach —
Broken Reach is Tier 1 (levels 1-35) and ends at the Searing Badlands frontier
(floor 6). The southern descent is the first region *beyond* the Reach: it picks
up where the badlands leave off and climbs to the Verdant Faultwarden capstone at
L55. Deep Tier 2 (the `jungle_ready` L58 profile and up) is future content for
the next region beyond the mountains.

After the west and east problems are resolved, the evidence points south. Searing
Cores are not spreading outward; they are being pulled up from below the southern
collapse. The Reach gives way; the player crosses into Tier 2.

Southern route (floors 7-10, the descent):

1. Mourner's Gate: opens beneath or beyond the graveyard after the outer branches are proven — the seam between Tier 1 and Tier 2.
2. Sunken Desert (floor 7, **L36-42**): the step-up off the badlands. Sand-swift dune skitterers and heat-warped sun wraiths.
3. Sunken Beach (floor 8, **L42-46**): drowned road, salt ruins, washed-up Searing Core fragments. Fast reef prowlers harry the open sand; drowned marauders rise heavy off the salt-ruin road.
4. Deepdelve Mine (floor 10, **L32-53**): optional parallel mining dungeon, danger rising with depth (RuneScape-style — deeper chambers hold nastier variants).
5. Untamed Jungle (floor 9, **L46-55**): tight overgrowth, old machinery, ambush paths, climbing to the Vault.
6. Jungle Vault: the early-Tier-2 capstone and the gate to deep Tier 2.

### Beyond the Reach level bands (authoritative — mirrors `ZONE_LEVEL_BANDS`)

| Floor | Zone | Band | Notable |
|---|---|---|---|
| 7 | Sunken Desert | 36-42 | dune_skitterer 36, sun_wraith 40 |
| 8 | Sunken Beach | 42-46 | reef_prowler 42, drowned_marauder 46 (new) |
| 9 | Untamed Jungle | 46-55 | totem_wraith 46, venomous_stalker 49, **verdant_faultwarden 55 (capstone)** |
| 10 | Deepdelve Mine | 32-53 | canyon_scavenger 32 / dust_burrower 35 (mouth) → deepdelve_wight 47 (new), crypt_sentinel 48, crimson_burrower 53 |

## Deepdelve Mine (the desert caves)

Role: optional preparation dungeon (floor 10), parallel to the jungle route.

Core mechanics:

- Mining cave-ins.
- Breaking crimson mineral nodes.
- Fighting mutated Dust Burrowers.
- Collecting resonant key components.

Rewards:

- Vault key components.
- Mining materials for early Tier 2 gear upgrades.
- Lore proving that Searing Cores are part of a buried sealing engine.

## Jungle Vault

Role: early-Tier-2 capstone exam (the gate from early to deep Tier 2).

Class expression:

- Apothecary: neutralize toxic vents, cleanse spore rot, weaken boss regeneration.
- Thief: bypass trap halls, open sealed side chambers, sabotage mechanisms.
- Vanguard: survive pressure rooms, hold ritual circles, break shielded enemies.

Boss concept:

The Verdant Faultwarden is an ancient guardian fused with jungle roots, Searing Core crystal, and broken Waystone machinery. It was built to seal tectonic tears, but corruption has made it widen them.

Final rewards:

- Reach Keystone.
- Tier 2 route map.
- Stabilized Waystone Hub state.
- Access to the next region beyond the mountains.

## Implementation Rules

- Class toggles should be earned through quests, not all available immediately.
- Track regional reputation in a simple future-friendly way: Waystone, Northwatch, Marsh, Scavenger.
- NPC dialogue should react to completed branches.
- Layouts should foreshadow danger before combat: broken carts at canyon entrances, warning charms in marshes, drowned roads in the south.
- Mining can gate the Sunken Desert Caves, but Apothecary/Thief/Vanguard should provide advantages rather than hard-blocking the main story.
- Return the player to Waystone or Northwatch after major branch completions so the world state feels responsive.

## Level Tiering & Balance (decided 2026-06-05)

Broken Reach is **Tier 1, levels 1–35** — one contiguous home landmass that teaches
the basics but keeps dangerous "menace edges" near the safe parts (stakes by design,
not a tutorial sandbox). The cap at 35 falls naturally on the existing deep gates.

**In Broken Reach (band-checked):**

| Zone (floor) | Level band | Notes |
| --- | --- | --- |
| Northwood woods (3) | 1–25 | main ladder 1–16 kept; deep-north tail (orc→treant) is the 17–25 edge |
| Cemetery (1) | 11–28 | entry husk/shambler 11–14; deep undead a 23–28 "don't go yet" pocket |
| Ashen Crypt (2) | 11–21 | first dungeon (capstone) |
| Sunken Marsh (5) | 18–27 | |
| Searing Badlands (6) | 32–35 | the frontier; hardest T1 content (dust_burrower L35) |

**Beyond the Reach (Tier 2+, NOT yet re-tiered, not band-checked):** Sunken Desert (7),
Beach (8), Jungle (9), Deepdelve Mine (10). Reached *through* the Reach's frontier gates
(Mourner's Gate, the Badlands descent). The Jungle Faultwarden (L126) stays high — it is
no longer early-region content.

**Balance method:** monster stats are derived from `level + role`, not hand-set. A
monster's level is `monsterCombatLevel()` (src/balance.ts). The 2026-06-05 re-tier rescaled
17–18 Broken Reach monsters to their target levels, preserving each monster's attack rhythm
and hp:damage character; xp/gold were restandardized only for monsters whose level moved.
`ZONE_LEVEL_BANDS` in src/balance.ts is the single source of truth, and `npm run
balance:bands` (wired into `npm run check`) fails the build if any spawned monster drifts
outside its zone band — the balance equivalent of the asset budget.

**Beyond-the-Reach follow-ups (tracked, out of scope for the 1–35 pass):**

- Split the monsters shared with the Deepmine (skeleton, ghoul, canyon_scavenger,
  dust_burrower) into stronger deepmine variants — RuneScape-style same-name/higher-level.
  Until then those deepmine spawns ride the (now weaker) Tier-1 base stats.
- Re-tier the Desert/Beach **up** (~35–50): they are currently low-level (10–22) but sit
  behind the mid-game Mourner's Gate, so today they read easier than where the player came
  from. Add `ZONE_LEVEL_BANDS` entries for the Beyond zones when this is done.
