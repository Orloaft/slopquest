# Combat Animation Pipeline

TIB combat effects should be referenced by stable animation ids, not renderer
implementation names. The first `combat-fx-v1` pass wraps existing slash,
projectile, missile, ring, burst, and trail renderers in `content/combat-animations.yaml`.

## Contract

Each catalog entry defines:

- `id`: stable content key, such as `projectile.bolt.arcane`
- `kind`: broad behavior group: `melee_arc`, `projectile`, `impact`, `ground`, `self`, or `trail`
- `renderer`: current client primitive or sheet family used to draw it
- `source`: `primitive`, `effects`, or future `sheet`
- `frames` and `frameMs`: timing contract for previews and validation
- `anchor`: where the effect is placed
- `orientation`: how it faces the combat direction
- `z`: intended draw band
- `impact`: optional follow-up animation id for projectiles

Ability and monster content may keep legacy `kind` values while adding ids:

```yaml
projectile: { id: projectile.bolt.arcane, kind: arcane, color: "#c8a8ff", targetEnemy: true }
animation: { id: impact.arcane.ring, kind: impact_ring, attach: target, color: "#c8a8ff" }
projectileAnimation: projectile.bolt.curse
```

The server keeps the legacy event text for compatibility and emits
`animationId` as the catalog key. The client resolves `animationId` first, then
falls back to legacy text.

Current procedural ranged/magic primitives include basic, heavy, and poison
arrows; acid spit and flasks; arcane lances; frost shards; fire orbs; curse
bolts; and matching ring/burst impacts.

## Pipeline Phases

1. Wrap current visuals in named catalog entries and validate all references.
2. Generate a first procedural library for slashes, arrows, bolts, impacts,
   trails, and ground bursts.
3. Produce contact sheets and short transparent-background previews for review.
4. Import bespoke authored sheets through the same manifest contract for bosses
   and signature abilities.

## Validation Gates

`npm run content:build` fails when:

- combat animation ids are duplicated
- a projectile references a missing `impact`
- an ability `projectile.id` or `animation.id` is missing
- a monster `projectileAnimation` is missing
- numeric timing/scale values are invalid

Future generator checks should also fail on missing frame rects, oversized
sheets, non-RGBA images, and preview/contact-sheet generation failures.
