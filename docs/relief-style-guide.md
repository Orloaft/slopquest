# TIB Relief Style Guide (2.5D painted-relief look)

**Status:** adopted art direction for floor-6 (Searing Badlands); candidate for all stages.
**Last updated:** 2026-06-04.

## The one-sentence rule

The camera is **top-down orthogonal**. We do **not** render isometric/3-quarter. Depth is a
**painted illusion** — lighting and overlay courses, never real geometry. Collision and
reachability stay tile-based on the flat grid; the relief is cosmetic.

This is the resolution to the parity problem: the old mockups were assembled in 3/4
isometric, a camera the engine cannot produce. Instead of bending the engine toward the
mockup, we bend the art language toward the engine. **Mockups are palette / content /
density / mood references — never camera or geometry targets.**

## Light

- **One fixed light, from the top** (sun high/north, slight top-left bias).
- Highlights live on **top** edges; shadows on **bottom** edges. Never mix.
- Raised surfaces are **lit**; recessed/floor surfaces are **shadowed**. The brightness
  delta is what sells elevation.

## The relief stack (an elevated massif, top → bottom)

Read top-down, this is the order of painted bands from the lit plateau down to the floor:

1. **Lit plateau top** — the ground texture brightened so raised rock reads sun-hit, distinct
   from the shadowed canyon floor. (`searingMesaTopV*` = ground `brightness(1.22) saturate(1.08)`.)
2. **Rim lip** — a bright sun-catch highlight on the **top course** where the plateau breaks
   into the drop. The single strongest depth cue. (`searingCliffLip`: `rgba(255,201,128)` fading 0.5→0 over 7px.)
3. **Face** — ribbed rock autotile painted **down-to-up from the lip**, capped at
   `SEARING_CLIFF_MAX` courses (currently **6**). 3-row atlas: `base / mid / top`; 5 cols:
   `Lcap / straight / Rcap / innerL / innerR`.
4. **Strata bench(es)** — every other interior course steps back to a flat lit ledge so a tall
   drop reads as **stacked terraces** instead of one wall. (`searingCliffBench` = lit mesa-top +
   rim on top + contact shadow at foot.) Cap 6 ⇒ tallest columns get 2 benches (3 tiers);
   4–5 tall faces get 1; faces < 4 tall and vertical flanks get none.
5. **Foot AO** — a contact-shadow band dropped on the floor cell directly **below the lip** so
   the foot reads grounded, not floating. (`searingCliffAO`: `rgba(0,0,0)` 0.42→0 over 15px.)

Water (e.g. the canyon river) is procedural: teal base + deterministic ripple + lighter foam
shore. It blocks movement, not sight.

## Authoring contract

- Author terrain as **massif bulk + lips**: solid impassable cells (`w`) with the renderer
  flipping overhanging edges to lip cells (`X`). The renderer derives every face/bench/AO
  from that — **you do not hand-place relief art.**
- Keep the **light direction identical** in every hand-authored or generated asset.
- All of the above is **procedural canvas overlay** — no per-tile relief art needs slicing.
  The cliff atlas stays the 3-row ribbed-rock sheet; tops/rim/bench/AO are generated.

## The hard limit (read before going further)

There is **no per-entity depth/height sort**. Player, enemies, and props draw **flat on top**
of everything. So this style is **terrain-relief only**:

- ✅ Static cliffs, terraces, plateaus, water — all fine.
- ❌ Characters standing *on* a ledge, being *occluded* by a rock shelf, or elevation that
  matters for gameplay (line-of-sight, jump-down).

The moment any of those ❌ items is wanted, it stops being an art style and becomes an
**engine project**: a height map + depth sorting + probably taller sprites. That is a
deliberate future decision (see "2.5D engine option" in `tibbrief.md`), **not** part of this
guide. Until then: depth is paint.

## Per-stage checklist

- [ ] Pick a biome palette (badlands = rust/teal); keep the lit-top vs shadowed-floor delta.
- [ ] Author massifs as `w` bulk + `X` lips; let the renderer derive relief.
- [ ] Verify reachability is unchanged (relief never edits collision).
- [ ] Eyeball a tall drop at zoom — it should read as stacked tiers, light from the top.
- [ ] Northwood (floor 3) is the finished-stage quality bar; match it.

## Key parameters (single source of truth)

| Knob | Value | Where |
|---|---|---|
| Camera | top-down orthogonal | engine |
| Mesa-top lift | `brightness(1.22) saturate(1.08)` | `searingMesaTopV*` |
| Rim lip | `rgba(255,201,128)` 0.5→0, 7px | `searingCliffLip` |
| Foot AO | `rgba(0,0,0)` 0.42→0, 15px | `searingCliffAO` |
| Max face courses | `SEARING_CLIFF_MAX = 6` | `searingCliffFace()` |
| Bench cadence | every other interior course (`%2`), faces ≥4 | `searingCliffFace()` |
