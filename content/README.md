# Authoring TIB content

This folder is where game content lives. You can add or change items, monsters, NPCs, shop entries, fishing spots, trees, monster spawns, **and quests** by editing the YAML files here. **No JavaScript required.**

## How it works

1. You edit a `.yaml` file under `content/`.
2. The next time anyone runs `npm run dev`, `npm run check`, or `npm run server`, a small build script reads the YAML and regenerates `src/generated/catalog.js`. That file is what the game actually loads.
3. If you make a typo or reference something that doesn't exist (e.g. a monster drops an item that isn't defined), the build fails with a clear message. **Fix the YAML, rerun.**

You can also run the build by itself:

```
npm run content:build
```

## Files at a glance

| File                  | What it holds                                              |
| --------------------- | ---------------------------------------------------------- |
| `items.yaml`          | Every item that can exist in a player's inventory          |
| `monsters.yaml`       | Stats for every monster type + what they drop              |
| `npcs.yaml`           | Every NPC — vendors, quest givers, guides                  |
| `tree-types.yaml`     | Tree species and their woodcutting parameters              |
| `fishing-nodes.yaml`  | Where in the world fishing is possible                     |
| `shop.yaml`           | What the trader sells and at what prices                   |
| `spawns.yaml`         | Monster placements + manually placed trees                 |
| `quests/*.yaml`       | One file per quest — objective, reward, and dialogue       |

## Adding a new item

Open `items.yaml` and add an entry at the bottom:

```yaml
- id: pumpkin
  label: Heavy Pumpkin
  icon: Pk
  iconUrl: /icons/item-pumpkin.png   # null is fine if no icon yet
  stackable: true
  tags: [food, raw]
```

Rules of thumb:

- `id` is the internal name. Use `snake_case`. Once it's used by a drop, a quest, or a save file, **don't rename it** — you'll break old saves.
- `label` is what players see.
- `stackable: true` means many of this item share one inventory slot.
- `tags` are free-form. Use them however helps you. They don't drive behavior yet.

## Adding a new monster

```yaml
- id: bog_lurker
  name: Bog Lurker
  maxHp: 70
  speed: 2.1
  damage: [8, 14]      # min/max damage per attack
  attackMs: 1100       # cooldown between attacks
  xp: 48               # xp awarded on kill
  gold: [8, 18]        # min/max gold dropped
  aggro: 6             # tiles away it will notice you
  range: 1.05          # melee reach in tiles
  drops:
    - item: raw_fish   # must exist in items.yaml
      chance: 0.25     # 25% chance per kill
```

To actually place it in the world, add a line in `spawns.yaml`:

```yaml
monsters:
  - { type: bog_lurker, at: { floor: 3, x: 22, y: 17 }, zone: woods }
```

`zone` must be one of: `southTown`, `cemetery`, `crypt`, `woods`, `northTown`.

## Adding an NPC

```yaml
- id: bog-mystic
  name: Old Hessa
  role: quest           # vendor | quest | guide
  at: { floor: 3, x: 28.5, y: 18.5 }
  idleDialogue: "The marsh whispers if you listen long enough."
```

`role`:
- `vendor` opens the shop panel when the player interacts. (There's only one vendor today — the trader.)
- `quest` is a quest giver. The `id` must match a quest's `giver` field once quests move to YAML.
- `guide` just speaks `idleDialogue` and nothing else.

## Adding a quest

Each quest is a single file under `content/quests/`. Use a descriptive filename — it doesn't drive anything, just makes the file easy to find.

```yaml
id: bog_mystic            # snake_case. Never rename once shipped — saves reference this.
title: Whispers in the Marsh
giver: bog-mystic         # must match an npc id whose role is "quest"

objective:
  kind: kill              # kill | gather | fetch
  monsters: [bog_lurker]  # kill only — list of monster ids in zone "in"
  in: woods               # kill only — zone name (see Adding a new monster)
  count: 4
reward:
  gold: 80
  xp: 110

dialogue:
  intro:
    - npc: "Something stirs in the marsh."
    - player: "I will look."
    - npc: "Cull {target.count} lurkers and come back to me."
  progress:
    - npc: "{progress}/{target.count} so far. Keep going."
  turnIn:
    - npc: "Good work."
    - player: "Anytime."
  claimed:
    - npc: "The marsh is quieter now."
```

For `gather` or `fetch` quests, replace the objective with `item:` + `count:` and add a `missingItems:` phase that fires if the player tries to turn in without the items:

```yaml
objective:
  kind: gather            # gather = player chops/picks it up; fetch = monster drop
  item: pine_logs
  count: 5

dialogue:
  # ...intro, progress, turnIn, claimed as above...
  missingItems:
    - npc: "Bring the {target.item.label} to my hands, not your pack alone."
```

### Template variables you can use in dialogue text

| `{key}`                | What it becomes                                                |
| ---------------------- | -------------------------------------------------------------- |
| `{progress}`           | How many the player has killed / picked up so far              |
| `{target.count}`       | The full quest count (e.g. 5)                                  |
| `{target.remaining}`   | `count - progress`, never below 0                              |
| `{target.item.label}`  | The item's display label — only for gather/fetch quests        |
| `{reward.gold}`        | Gold reward                                                    |
| `{reward.xp}`          | XP reward                                                      |
| `{player.name}`        | Whatever the player named their character                      |
| `{npc.name}`           | The giver's display name                                       |

### Dialogue rules

- Each line is a single-key object: either `- npc: "..."` or `- player: "..."`. Mix them freely.
- `intro`, `progress`, `turnIn`, and `claimed` are required for every quest.
- `missingItems` is required for gather/fetch quests, optional for kill quests.
- If a template variable doesn't resolve (e.g. `{target.item.label}` on a kill quest), it stays as literal text — that's the validator's hint to remove or fix it.

## Common mistakes the validator catches

- Monster drop points at an item that doesn't exist
- Monster spawn points at a monster type that doesn't exist
- Tree spawn points at a tree type that doesn't exist
- Monster spawn uses an unknown zone name
- Missing `id`, `label`, or `name` field
- Quest giver isn't an NPC, or is an NPC with `role` other than `quest`
- Quest objective references an unknown monster, item, or zone
- Quest dialogue is missing a required phase, or a line isn't `npc:` / `player:`

## Indentation

YAML is whitespace-sensitive. Use **two spaces** per indent level. Never tabs. If something looks right but the build fails, indentation is usually the culprit.

## When you're done

Run `npm run check` to confirm the world still parses, then commit your YAML changes. You don't need to commit `src/generated/catalog.js` — it's regenerated.
