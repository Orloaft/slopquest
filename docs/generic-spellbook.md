# Generic Spellbook

The generic spellbook is class-agnostic magic progression. Any player unlocks these abilities by raising the Magic skill, while caster classes get more value from the same spells through larger mana pools and class-specific synergies.

Spells live in `content/abilities.yaml` beside class abilities. A spell is an ability with:

```yaml
category: spell
magicLevel: 5
```

The server appends every spell whose `magicLevel` is at or below the player's Magic level to the normal ability list. The client already renders those abilities in the Abilities panel and supports hotbar binding, so generic spells use the same drag, cooldown, and mana-cost flow as class abilities.

The Abilities panel splits class abilities and generic magic into separate tabs. Spellbook entries can be dragged into any hotbar slot and stay bound by character; the server remains authoritative on Magic-level unlocks, cooldowns, cast time, and mana requirements. If the player's maximum Mana drops below a spell's cost, the hotbar shortcut is tinted red and labelled as insufficient Mana.

## Current T0/T1 Spells

| Magic | Spell | Runtime hook |
| --- | --- | --- |
| 1 | Spark | Short-range magic projectile. Mages have a 10% chance to chain it to a nearby target. |
| 1 | Luminescence | Self buff that expands local map reveal while active. |
| 1 | Purify Water | Self cleanse for slow, weaken, and stun. |
| 5 | Ember Shot | Fire projectile with a short burn. |
| 5 | Zephyr Step | 15% movement speed buff for 6 seconds. |
| 5 | Earth-Sense | Shows nearby ore and forage nodes on the minimap. |
| 10 | Frost Shard | Ice projectile that slows the target by 40% for 3 seconds. |
| 10 | Kinetic Push | Pushes adjacent enemies away by 2 tiles. |
| 10 | Arcane Aegis | Temporary damage shield with strength based on max Mana. |
| 15 | Fissure | 1.5-second channel, then heavy earth damage in a 4-tile line. |
| 15 | Teleport: Waystone | 5-second channel that returns the player to Waystone City. |

## Authoring Notes

- Generic spells should usually use `skill: magic` on damage effects so Magic XP tracks normal use.
- Prefer catalog animation ids (`projectile.orb.fire`, `projectile.shard.frost`, `impact.shield_ring`) over legacy effect names.
- Use `castTimeMs` for channelled spells; the caster is stunned during the cast and the effect resolves after the delay.
- If a spell needs a new mechanic, add it as a composed `AbilityEffect` so future spell content stays data-driven.
