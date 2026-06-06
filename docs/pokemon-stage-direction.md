# Pokémon-inspired stage direction

**Status:** adopted design direction for region/stage authoring.
**Last updated:** 2026-06-06.

How to craft cohesive, visually pleasing stages for the game using the existing
tile arsenal, borrowing the parts of Pokémon's overworld craft that fit a
**top-down orthogonal, painted-relief, tile-grid** engine — and explicitly
*not* the parts that need an engine we don't have.

Read alongside `docs/map-authoring.md` (the golden rules), `docs/relief-style-guide.md`
(the 2.5D paint look + its hard limits), and `docs/editor-layers.md` (the authoring tool).

## The big reframe: you're building a *region*, not maps

Pokémon's strength isn't any single map — it's that the world reads as one
connected chain of **Towns ↔ Routes ↔ Dungeons**. We already have that topology;
it just isn't framed that way yet:

| Pokémon role | Our stages | Tileset |
|---|---|---|
| **Town hubs** (safe, NPCs) | Waystone (0), Northwatch (4) | `towntiles`, `citytiles` |
| **Routes** (the journey, encounters) | Northwood (3), Swamp (5), Badlands (6), Desert (7), Beach (8), Jungle (9) | `foresttiles`, `swamp`, `searing-canyon`, `desert`, `beach`, `jungle` |
| **Dungeons** (gated, denser, reward) | Cemetery (1), Crypt (2), Deepmine (10) | `graveyardtiles`, `crypt`, `deepmine` |

The **Portals layer** is the region wiring — the "Route 2 → Viridian Forest →
Pewter City" connective tissue. **Principle zero:** decide the region graph first
(which floor exits to which), then author each stage to its role.

## 5 principles worth stealing — and how each lands here

**1. One unmistakable read per biome.** A player should know "forest route" vs
"water route" in a single frame. Enforce with a **palette contract** (already
half-formalized in the relief guide): lit/warm/light = walkable, cool/dark =
blocker. Pick *one* hero hue per stage and keep everything else neutral.
Cohesion = every stage obeys the same *contrast rule*, even with different hues.

**2. The path *is* the cohesion.** In Pokémon the dirt route-line threads every
biome with an unchanging visual grammar — that's what makes 30 maps feel like one
world. **Our road autotile (`Road` blobset) is exactly this tool.** Use it as the
single connective trail through *every* stage. Same trail in forest, swamp, and
desert → instant family resemblance. Highest-leverage cohesion move, costs nothing new.

**3. Encounter clearings = "tall grass."** Pokémon clusters wild encounters into
visually distinct grass patches the player can enter or skirt. Map this to **spawn
clusters inside a distinct flora patch** (a tinted floor variant via the `Tint`
part, or a decoration-dense pocket). With sprite markers in the editor you can now
*compose* an encounter clearing WYSIWYG — arrange the actual creatures, not rings.

**4. A hero landmark anchors every stage.** Every Pokémon area has one memorable
feature (lighthouse, giant tree, lake). Use `MAP_OBJECTS[floor]` as a **single
composition anchor** per stage — placed off-center, visible from the entrance,
giving a navigational memory and a silhouette.

**5. Rhythm + finished edges.** Pokémon alternates open clearings with tight
chokepoints and never butts two raw tiles together. The golden rules already say
this ("wind the paths," "cluster props against walls," "dead-ends are good") and
edge framing (`FLOOR_EDGE`) + `applyCliffEdges` auto-finish borders. Enforce a
**density rhythm** — clearing → chokepoint → clearing — and let the renderer
finish the seams.

## Cohesion across the whole region

- **Palette/contrast contract** — walkable warm/light, blockers cool/dark, one
  hero hue per stage. Same rule everywhere.
- **Shared path language** — the `Road` autotile trail is the through-line in
  every biome.
- **Consistent placement grammar** — props and nodes cluster against walls/
  structures, never float; ore on the blocker with `approach` beside it.
- **Transitions** — towns sit at the seam between two route biomes; caves/gates
  bridge regions. We already have town hubs (Waystone, Northwatch) and dungeon
  bridges (Cemetery, Crypt, Deepmine) — use them as the palette cross-fades.

## The "Route Template" — repeatable per-stage recipe

1. **Entrance portal** in a small framed clearing (orient the player; reveal the landmark).
2. **A winding `Road` trail** as the spine — S-curves hugging walls, never a straight central corridor.
3. **2–3 encounter clearings** off the trail: flora-tinted pockets with clustered spawns ("tall grass").
4. **1 hero landmark** (`MAP_OBJECTS`) off-center, visible from entry.
5. **Gathering nodes clustered against walls** — ore on the blocker tile with `approach` beside it; herbs in damp/shaded pockets.
6. **1–2 reward dead-ends** — a side alcove with a rare node or a tougher spawn.
7. **Exit portal(s)** at the far end, wired to the next region in the graph.

## Workflow in the editor

1. **Terrain & trail** — paint the biome floor, then `Road`/`Water` autotile for the trail and rivers (finished shores automatic).
2. **Wire the route** — `🌀 Portals` to connect entrance/exit to neighbors.
3. **Compose encounters** — `👹 Spawns` clusters in the flora pockets, arranged by real sprite.
4. **Cluster resources** — `⛏️ Ore` / `🌿 Herbs` against walls (approach ticks show reachability).
5. **Dress it** — `🪴 Decorations` for biome flora + the hero landmark.
6. **Save & rebuild → eyeball at zoom against the Northwood (floor 3) quality bar** (the stated finished-stage benchmark).

## Two constraints to design *around*

- **Depth is paint — there is no per-entity depth sort** (relief guide). Pokémon's
  signature **ledge-hopping and grass-that-hides-you do not exist here.** Cliffs
  read as stacked terraces but are just walls; "tall grass" can't occlude the
  player. Don't design routes that *need* jump-down shortcuts or hidden-in-grass
  ambushes — gate with blockers + portals instead.
- **Cohesion is a discipline, not a feature.** The contract (one hero hue, the
  shared `Road` trail, the prop-clustering grammar, the density rhythm) only works
  if *every* stage obeys it. That is the real work.

## First reference route

Prototype this template end-to-end on **one** route and make it the reference all
others copy (the way floor 6 is the relief reference). The chosen first build is
the **Waystone → Northwood transition route** (the classic "Route 1").
