# Stage Art Direction — toward a clean Pokémon / Chrono Trigger look

Goal: every stage reads as a deliberate, cohesive SNES/GBA-era JRPG map — crisp terrain
edges, readable silhouettes, consistent light, tight palettes — rather than flat-color
blocks slammed together.

## Diagnosis: two tiers of stage

Tile counts per stage (export tileset manifests), which expose the split:

| Tier | Stage | Tiles | Autotiled (blobset) | Read |
|------|-------|------:|:---:|------|
| **Rich** | northwood | 572 | ✅ | the quality bar (incl. cliffs) |
| | swamp | 885 | — | busy / over-textured |
| | waystone | 353 | ✅ | good |
| | searing-canyon | 309 | — | good |
| **Flat** | route | 64 | road Wang only | edges fixed (road corners) |
| | beach | 24 | ❌ | blocky |
| | cemetery | 11 | ❌ | blocky |
| | desert | 9 | ❌ | blocky |
| | northwatch | 7 | ❌ | blocky |
| | crypt | 6 | ❌ | blocky |
| | deepmine | 6 | ❌ | blocky |
| | jungle | 5 | ❌ | blocky |

The flat tier is flat-color terrain **blocks with hard edges and no transition tiles**.
That is the dominant reason they don't read as Pokémon/CT — those games are mostly
*transition* and *edge* tiles, not fills.

## Leverage: fix transitions in the bake pipeline, not by hand

The road-corner fix (`tools/harmonize-road-corners.ts`) is the template: define the
correct transition by **construction** in the asset tool and it propagates to every stage
that uses the tileset. We do not hand-paint 12 maps. We generalize that synthesis into a
reusable **terrain-transition generator** (autotile/blobset edges per material pair) and
run it per biome.

`northwood` is the reference for both **transitions** and **cliffs/depth** — match its bar,
don't reinvent.

## Craft levers (priority order)

1. **Terrain transitions / autotiling.** Edge tiles for every adjacent material pair
   (grass↔sand, sand↔water, dirt↔stone, …). Biggest single win. Generalize the road
   Wang/synthesis approach.
2. **Consistent edge collar.** The 1–2px collar from roads, applied to every terrain
   border. Clean JRPGs read clean largely because every edge has a deliberate collar.
3. **Depth — cliffs + drop shadows.** Lit top + shaded vertical face + 1px cast shadow.
   **northwood already nails this; use it as the model.** Apply to desert/beach/canyon etc.
4. **Per-biome palette cohesion.** Clamp each stage to a tight ramp; *reduce* the noisy
   ones (swamp at 885 tiles is likely over-busy — simplify, don't add).
5. **Light direction + object shadows.** One global light angle; soft elliptical drop
   shadow under every prop/tree (only northwood has sprites today).
6. **Dithering discipline.** Dither for gradients/shorelines, never as texture noise.
7. **Water.** Shoreline foam line + darker depth band — instantly reads as JRPG water.

## Sequence

- **Phase 0 — pilot (in progress):** build the transition generator, prove it end-to-end
  on **desert** (only 6 materials → fast to validate). Set the new bar; get sign-off.
- **Phase 1:** roll transitions + collars across the other flat stages (beach, cemetery,
  crypt, deepmine, northwatch, jungle).
- **Phase 2:** depth pass (cliffs/shadows, modeled on northwood) + one global light angle.
- **Phase 3:** palette-cohesion pass on the rich-but-noisy stages (swamp, searing-canyon).

## Guardrails (learned from the road work)

- Source of truth is the committed `*.src` / authored tiles; generators are idempotent.
- Transition tiles must be **pixel-identical at connecting edges** to their neighbours
  (synthesis from the base materials guarantees this; warping authored art does not).
- After any tileset change: re-bake stages, `typecheck`, stage `:check`, and confirm the
  generated stage `.ts` are **byte-identical** (tile indices unchanged ⇒ collision /
  walkability / reachability provably unaffected — appearance-only change).
