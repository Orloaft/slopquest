# Authoring TIB content

This folder is where game content lives. You can add or change items, monsters, NPCs, shop entries, fishing spots, trees, and monster spawns by editing the YAML files here. **No JavaScript required.**

> Quests still live in code as of Phase 1. They move into `content/quests/` in Phase 3.

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

## Common mistakes the validator catches

- Monster drop points at an item that doesn't exist
- Monster spawn points at a monster type that doesn't exist
- Tree spawn points at a tree type that doesn't exist
- Monster spawn uses an unknown zone name
- Missing `id`, `label`, or `name` field

## Indentation

YAML is whitespace-sensitive. Use **two spaces** per indent level. Never tabs. If something looks right but the build fails, indentation is usually the culprit.

## When you're done

Run `npm run check` to confirm the world still parses, then commit your YAML changes. You don't need to commit `src/generated/catalog.js` — it's regenerated.
