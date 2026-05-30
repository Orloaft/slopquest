# Proposal — Data-driven abilities

_Status: design proposal. No engine code changed by this document._
_Companion to `docs/scaling-audit.md` → "Scaling axis 2" (the 100× / many-more-abilities goal)._

## Why now

`useClassAbility` (`server/index.ts:646-827`) is a ~180-line `if (id === "...")` chain — one
hand-written branch per ability. Ability specs live as a hand-written `Record` in
`src/shared.ts:209+`. Today there are 11 abilities; the north star is "many more." Every ability
added as bespoke code is one that has to be re-read, re-tested, and eventually rewritten. The fix is
to express abilities as **data composed from a small set of primitives**, and replace the branch
chain with one interpreter. Then "add an ability" becomes a content edit, not an engine edit.

This is the cheapest corner-preserver in the whole roadmap precisely because it gets *monotonically*
more expensive the longer the catalog grows. Do it while there are 11, not 60.

## The model: every ability is `targeting × effects × delivery`

An ability resolves **who/where** it hits (targeting), applies one or more **effects** to that
result, and optionally wraps it in **delivery/visuals**. All current behavior decomposes into these
three small registries:

### Targeting modes — resolve `{ origin: point, targets: entity[] }`

| Mode | Resolves to | Gates |
|---|---|---|
| `self` | the caster | — |
| `enemy` | current target monster | `range`, optional `requiresLineOfSight` |
| `aoe_self` | monsters within `radius` of caster | — |
| `aoe_front` | monsters within `radius` of a point `offset` tiles along facing | — |
| `aoe_point` | monsters within `radius` of (current target if valid & in `range`, else a point `offset` ahead) | — |
| `dash` | no entities; movement only | stops at first blocked/occupied tile |

### Effect kinds — applied to the targeting result

| Kind | Params | Notes |
|---|---|---|
| `damage` | `amount: Range`, `scaleSkill`, `damageType: physical\|magic`, `conditionalBonus?` | `physical` obeys weaken; `conditionalBonus.when: behindTarget` → `multiply` |
| `heal` | `fraction?`, `flat?`, `scaleSkill?` | instant, self |
| `heal_over_time` | `fraction?`, `flat?`, `durationMs` | self buff (the `second_wind` mechanic) |
| `buff_self` | `speedMultiplier?`, `damageTakenMultiplier?`, `durationMs`, `cleanse?: ["slow"]` | stances |
| `debuff_enemy` | `status: burn\|freeze\|snare\|taunt\|inaccurate\|slow\|weaken`, `durationMs`, `params?` | per-target |
| `award_xp` | `skill`, `factor` (xp = damage × factor) | usually implicit on `damage` |

### Delivery / visuals (optional wrappers)

| Wrapper | Params |
|---|---|
| `projectile` | `kind` (e.g. `arrow`, `flask`) — emitted caster→origin before effects |
| `vfx` | `effectKind` at origin |
| `float` | `text`, `color` |

### Guards (optional preconditions, checked before mana/cooldown spend)

`requireBelowMaxHp`, `requireTarget`, … — small named predicates.

## Proposed spec shape

```ts
export interface AbilitySpec {
  id: string;
  label: string;
  description: string;
  cooldownMs: number;
  durationMs: number;          // default for buff/HoT/debuff effects
  manaCost?: number;
  guards?: string[];           // e.g. ["requireBelowMaxHp"]
  targeting: {
    mode: "self" | "enemy" | "aoe_self" | "aoe_front" | "aoe_point" | "dash";
    range?: number;
    radius?: number;
    offset?: number;           // tiles ahead for aoe_front / aoe_point
    tiles?: number;            // dash distance
    requiresLineOfSight?: boolean;
  };
  effects: AbilityEffect[];    // discriminated union by `kind`
  projectile?: { kind: string };
  vfx?: { effectKind: string };
  float?: { text: string; color: string };
}
```

The display fields the client already reads (`label`, `description`, `cooldownMs`, `durationMs`,
`manaCost`) are unchanged — see [Client impact](#client-impact).

### Example (YAML, Phase 2 form)

```yaml
flame_burst:
  label: Flame Burst
  description: Ignite a 3x3 area in front of you with a burning DoT.
  cooldownMs: 5000
  durationMs: 4000
  manaCost: 12
  targeting: { mode: aoe_front, offset: 1.5, radius: 1.6 }
  effects:
    - { kind: damage, amount: [10, 16], scaleSkill: magic, damageType: magic }
    - { kind: debuff_enemy, status: burn, durationMs: 4000, params: { perTick: 3 } }
  vfx: { effectKind: flare }
  float: { text: Flame Burst, color: "#ff8a3d" }
```

## Coverage proof — all 11 current abilities as data

This is the test of the design: every existing branch must express purely as `targeting + effects`
with **no bespoke code**.

| Ability | targeting | effects (+ delivery) |
|---|---|---|
| `sprint` | self | `buff_self{speedMultiplier:1.5, durationMs:10000}` |
| `second_wind` | self | guard `requireBelowMaxHp`; `heal_over_time{fraction:0.5, durationMs:5000}` |
| `provoke` | aoe_self r1.8 | `debuff_enemy{status:taunt, durationMs:6000}`; vfx flare |
| `iron_clad` | self | `buff_self{damageTakenMultiplier:0.7, speedMultiplier:0.85, durationMs:6000}` |
| `pinning_shot` | enemy range5, LoS | projectile arrow; `damage{[10,16],ranged,physical}`; `debuff_enemy{status:snare, 2500}` |
| `fleet_foot` | self | `buff_self{speedMultiplier:1.25, durationMs:4000, cleanse:[slow]}` |
| `quick_step` | dash tiles:2 | — (movement only) |
| `backstab` | enemy range1.6 | `damage{[12,18],attack,physical, conditionalBonus:{when:behindTarget, multiply:2.5}}` |
| `flame_burst` | aoe_front off1.5 r1.6 | `damage{[10,16],magic,magic}`; `debuff_enemy{burn,4000,{perTick:3}}`; vfx flare |
| `frost_nova` | aoe_self r2.2 | `damage{[6,10],magic,magic}`; `debuff_enemy{freeze,3000}`; vfx frost |
| `volatile_flask` | aoe_point off2.5 r1.6 | projectile flask; `damage{magic}`; `debuff_enemy{inaccurate,4000}` |
| `healing_poultice` | self | guard `requireBelowMaxHp`; `heal{fraction:.., scaleSkill:alchemy}`; `heal_over_time{fraction:0.12}` |

12/11 branches covered (healing_poultice is two effects). **Zero residual special cases** — `backstab`
and `pinning_shot`, the two that were special-cased *inside* the generic damage branch, become a
`conditionalBonus` field and a `debuff_enemy` effect respectively.

## The interpreter (replaces the 180-line branch chain)

```ts
function useClassAbility(player: ServerPlayer, id: string): void {
  if (player.dead || isStunned(player)) return;
  const spec = ABILITIES[id];
  const classSpec = CLASSES[player.classKey ?? "adventurer"] ?? CLASSES["adventurer"]!;
  if (!spec || !classSpec.abilities?.includes(id)) return;
  const now = performance.now();
  if (now < (player.abilityCooldowns?.[id] ?? 0)) return;

  // 1. resolve targeting (origin + affected entities), honoring range/LoS/target gates
  const res = TARGETING[spec.targeting.mode](player, spec, now);
  if (!res.valid) return;                                  // no cooldown/mana spent on a miss
  // 2. guards + mana
  if (!(spec.guards ?? []).every((g) => GUARDS[g](player, res))) return;
  if (player.mana < (spec.manaCost ?? 0)) return;

  // 3. commit
  player.abilityCooldowns[id] = now + spec.cooldownMs;
  player.mana -= spec.manaCost ?? 0;

  // 4. delivery + effects + vfx
  if (spec.projectile) event("projectile", spec.projectile.kind, res.origin.x, res.origin.y, player.floor, null, player.id, res.targetId ?? null, { fromX: player.x, fromY: player.y });
  for (const effect of spec.effects) EFFECTS[effect.kind](player, res, effect, spec, now);
  if (spec.vfx) event("effect", spec.vfx.effectKind, res.origin.x, res.origin.y, player.floor, null, player.id);
  if (spec.float) event("float", spec.float.text, res.origin.x, res.origin.y - 0.5, player.floor, spec.float.color);
}
```

`TARGETING`, `GUARDS`, `EFFECTS` are small string-keyed registries (one function each). The bodies
are lifted almost verbatim from the existing branches — e.g. `EFFECTS.damage` is the
`roll + skillLevel + wellFedPower → physicalMult → damageMonster` logic already in the file, the
`debuff_enemy` handlers are the existing `applyBurn` / `freezeUntil` / `snareUntil` / taunt writes.

**Net:** ~6 targeting fns + ~6 effect fns + ~3 guards ≈ 60-80 lines of registry, and the per-ability
branch chain (~180 lines) is deleted. After that, **adding an ability that composes existing
primitives is data-only.**

## Payoff — new abilities with zero engine code

| New ability | Composed entirely from existing primitives |
|---|---|
| **Whirlwind** (melee AoE) | `aoe_self` + `damage{physical}` |
| **Poison Dart** | `enemy`+LoS + projectile + `damage{ranged}` + `debuff_enemy{burn}` |
| **Battle Cry** (rally) | `aoe_self` + `debuff_enemy{taunt}` + `buff_self{damageTakenMultiplier}` |
| **Blink Strike** | `dash` then `enemy` … (or two abilities) |

Genuinely novel mechanics (e.g. lifesteal = heal from damage dealt, chain-bounce) still need **one**
new effect handler + the data — but that's the only time you touch engine code, and every future
lifesteal ability after the first is free.

## Migration plan

**Phase 1 — in-code refactor, behavior-preserving (recommended first step).**
Change `AbilitySpec` to the composed shape and port the 11 abilities to data **in `src/shared.ts`**
(data stays where it is, still imported by client + server). Add the interpreter + registries in
`server/index.ts`; delete the branch chain. No new files, no build-pipeline change, no client change.
The existing E2E combat tests (`tests/e2e/`) are the safety net — behavior is identical, so green
tests prove the port.

**Phase 2 — move data into the content pipeline (do later).**
Add `content/abilities.yaml` + `content/schema/abilities.schema.json`, fold into
`scripts/build-content.ts` (same pattern as items/monsters), and re-export from `shared.ts` so both
sides still import one symbol. Now designers author abilities in YAML with schema validation,
consistent with the rest of the content. This is the end-state that makes "many more abilities" a
pure content task.

Phase 1 delivers ~90% of the maintainability win; Phase 2 is polish/consistency.

## Client impact

Minimal. The client renders abilities from **display fields only** — `CLASSES[key].abilities` →
`ABILITIES[id]` for `label`/`description`, plus the server-built `AbilityView`
(`cooldownRemainingMs`/`activeRemainingMs`). The composed spec preserves `label`, `description`,
`cooldownMs`, `durationMs`, `manaCost`; the new `targeting`/`effects` fields are server-only behavior
the client ignores. **Verify the handful of client reads** (`main.ts:1722` and the abilities panel)
touch only those display fields during implementation — expected to need no client change.

## Testing

- **Refactor guard:** Phase 1 is behavior-preserving → existing E2E combat specs must stay green
  with zero edits. That's the primary correctness proof.
- **Add a per-ability golden test** as you port each one (damage dealt, debuff applied, cooldown/mana
  spent, miss-spends-nothing) so future content edits can't silently regress a primitive.
- **`forceDodge`/E2E determinism** already exists for combat — reuse it so ability damage rolls stay
  deterministic under test.

## Risks / what stays in code

- **Novel primitives still need a handler** — by design. The registry is the seam; keep it small and
  composable rather than adding one-off flags.
- **`durationMs` overloading** — it currently defaults buff/HoT/debuff length. If an ability needs a
  buff and a debuff of *different* lengths, put the length on the effect (`effect.durationMs`) and let
  the top-level be the default. The schema above already allows per-effect `durationMs`.
- **Balance drift** — moving to data makes tuning trivial, which also makes accidental balance changes
  trivial. The per-ability golden tests catch unintended numeric drift.
