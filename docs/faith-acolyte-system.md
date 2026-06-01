# Faith & Acolyte System

Faith is a standalone progression track alongside Magic. It powers Favor Points (FP), a non-regenerating resource earned through deeds and Acolyte combat loops.

## Favor

- Faith level sets Max Favor, starting at 30 FP and gaining +5 per Faith level until it reaches 100 FP at Faith 15.
- Favor does not regenerate passively.
- Acolyte stance grants +10% Max Favor.
- Ability content can spend Favor with `favorCost`.

## Acolyte

Acolyte is a Tier 1 class unlocked from Prior Elian in Waystone with Attack 10 and Faith 10.

The class kit is authored in `content/abilities.yaml`:

| Slot | Ability | Runtime hook |
| --- | --- | --- |
| 1 | Zealot's Strike | Holy melee damage, +8 Favor, +12 Favor against Unholy targets |
| 3 | Cleansing Flash | 20 Favor AoE Holy burst, self cleanse, self heal |
| 4 | Conviction | 30 Favor, 6s mitigation, converts 20% incoming damage into Favor |

Standard melee attacks while Acolyte also generate +2 Favor.

## Miracles

Generic miracles are Spellbook entries with `category: miracle` and `faithLevel`. They share the same hotbar/ability runtime as class abilities and generic spells, but spend Favor instead of Mana.

Initial miracles:

| Faith | Miracle |
| --- | --- |
| 1 | Minor Mend |
| 5 | Sanctify |
| 10 | Smite |
| 15 | Resurrection |

## Faith XP Deeds

Unholy monsters use `isUnholy: true` and optional `faithXp`. On kill, the server fires a global deed packet with `deedType: "unholy_slay"`, awards Faith XP, grants a small Favor amount, shows soft gold floating text, and plays a holy chime on the client.

The same `completeFaithDeed` server helper is the extension point for later shrine tithes, burial rites, and hidden shrine purification interactions.
