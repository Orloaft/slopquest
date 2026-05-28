# TIB Content Pipeline — Proposal

**Status:** Approved 2026-05-28. Phase 1 in progress.
**Goal:** Let non-coders author quests, items, monsters, NPCs, and spawns by editing simple text files — no engine code, no JavaScript.

---

## Recommendation: YAML, not JSON

YAML wins for non-coders: comments, no quote noise, no trailing-comma traps, multiline strings for dialogue. Keep JSON Schema files alongside so VS Code gives inline validation and autocomplete. The engine reads YAML at boot (server) or at build time (client bundle), validates, and fails loud with `file:line` on bad data.

## Repo layout

```
tib/
├─ content/
│  ├─ items.yaml
│  ├─ monsters.yaml
│  ├─ npcs.yaml
│  ├─ tree-types.yaml
│  ├─ fishing-nodes.yaml
│  ├─ shop.yaml
│  ├─ spawns.yaml          # monster placements
│  ├─ quests/              # one quest per file (Phase 3)
│  │  ├─ southgate.yaml
│  │  ├─ pine-logs.yaml
│  │  └─ ...
│  ├─ schema/              # JSON Schema for editor autocomplete
│  │  ├─ item.schema.json
│  │  └─ quest.schema.json
│  └─ README.md            # authoring guide for content writers
└─ src/generated/
   └─ catalog.js           # built artifact — DO NOT EDIT BY HAND
```

One quest per file is the single biggest authoring win — writers stop tripping over each other in git, and a quest can be reviewed as a self-contained unit.

## Item schema

```yaml
- id: cooked_fish
  label: Cooked Fish
  icon: cF
  iconUrl: /icons/item-cooked-fish.png
  stackable: true
  tags: [food, consumable]
  use:
    kind: eat
    restoreHp: 6
    buffs:
      - id: well_fed
        durationSec: 90
      - id: food_regen
        kind: hp_regen
        amountPerTick: 1
        tickSec: 3
        durationSec: 18

- id: flint_steel
  label: Flint and Steel
  icon: F
  iconUrl: /icons/item-flint-steel.png
  stackable: false
  tags: [tool]
  use:
    kind: light_fire
    consumes: [{ item: logs, qty: 1 }]
    skill: firemaking

- id: axe
  label: Bronze Axe
  stackable: false
  tags: [tool]
  capabilities: [chop_tree]    # declarative — engine asks "do you have something with this capability?"
```

The critical move: **authors compose from a fixed vocabulary of effect verbs** (`eat`, `light_fire`, `cook_on_fire`, `apply_buff`, `restore_mana`, …). The engine still owns the verbs; authors just wire them up. A new verb requires an engineer once, then content writers reuse it forever.

## Quest schema

```yaml
id: southgate
title: Thin the Cemetery
giver: cemetery-warden
objective:
  kind: kill
  monster: [skeleton, ghoul]
  in: cemetery
  count: 3
reward:
  gold: 45
  xp: 60

dialogue:
  intro:
    - npc:    "Southgate Cemetery is restless again. The dead are testing the gate."
    - player: "What do you need from me?"
    - npc:    "Defeat {target.count} undead beyond the south gate, then return to me."
  progress:
    - npc:    "Keep thinning the undead beyond the south gate."
    - player: "{progress}/{target.count} so far. I will return when it is done."
  turnIn:
    - npc:    "Good. The gate breathes easier tonight."
    - player: "I will keep an eye on the road south."
  claimed:
    - npc:    "The cemetery is quieter because of you."
```

Notes:
- `who:` is `npc` or `player` — no retyping names, no name drift.
- Template variables (`{progress}`, `{target.count}`, `{target.item.label}`, `{reward.gold}`, `{player.name}`) generalize the four currently-hardcoded interpolations.
- `objective.kind` is the extension point. Today: `kill | gather | fetch`. Future: `talk_to`, `visit`, `use_on`, and `all_of: [...]` for multi-step.
- Drops live next to the monster, not the quest:

```yaml
# content/monsters.yaml
- id: orc
  name: Orc
  maxHp: 84
  damage: [10, 18]
  drops:
    - item: stolen_goods
      chance: 0.10
```

## NPCs & spawns

```yaml
# content/npcs.yaml
- id: cemetery-warden
  name: Cemetery Warden
  role: quest
  at: { floor: 0, x: 22.5, y: 28.5 }
  idleDialogue: "Stand at the south gate long enough and you hear them murmur."

# content/spawns.yaml
monsters:
  - { type: skeleton, at: { floor: 1, x: 13, y: 12 }, zone: cemetery }
trees:
  - { type: oak, at: { floor: 0, x: 12.8, y: 10.7 } }
fishing:
  - { at: { floor: 0, x: 5.35, y: 9.5 }, approach: { x: 7.5, y: 9.5 } }
```

## Engine changes

1. **Build script** `scripts/build-content.js` — loads every YAML file under `content/`, validates against schemas, validates cross-references, emits `src/generated/catalog.js` as a plain ES module that exports the same shape today's hardcoded constants have.
2. **Replace** the hardcoded constants in `server/index.js:40-122` and `src/shared.js:6-101` with imports from the generated catalog. Game logic stays put.
3. **Generic effect dispatcher** replaces today's hand-rolled `eatItem` / `cookFish` / `makeFire` branches — each `use.kind` maps to one handler. (Phase 2.)
4. **Boot fails loud** with a readable error on any unresolved reference (quest pointing at a missing NPC, drop pointing at a missing item, spawn pointing at a missing monster type). Quest writers will trip this constantly — it's the safety net.
5. **Hot reload (optional, dev only):** rerun the build on `content/**/*.yaml` change; restart server. Massive QoL for writers.

## Rollout

Four small PRs, each independently shippable:

1. **Phase 1 — pure data move (this PR).** Items, monsters, NPCs, shop, tree types, fishing nodes, monster spawns. Zero behavior change. Lowest risk, biggest payoff.
2. **Phase 2 — effect dispatcher.** Replace `eatItem` / `cookFish` / `makeFire` / `usePotion` / tool-capability checks with the data-driven `use.kind` dispatcher. Item authoring becomes fully self-serve.
3. **Phase 3 — quests.** Move QUESTS + quest dialogue. Introduce the objective and template-variable systems. The interesting PR.
4. **Phase 4 — polish.** JSON Schema files for editor autocomplete, `npm run content:check` standalone validator, dev-mode hot reload, `content/README.md` authoring guide.

## Non-goals (be opinionated)

- **No quest scripting language.** The moment you add `if`/`when`/`script:` blocks to YAML, non-coders bounce. Keep the schema declarative; if a quest needs custom logic, that quest gets a code hook keyed by `id` — escape hatch, not the default.
- **No branching dialogue in v1.** Linear lines per phase covers every existing quest. Add branches only when an actual quest needs them.
- **No content-driven map data.** Tiles stay procedural. Only point-placements (monsters, NPCs, trees, fishing nodes) move to YAML.
