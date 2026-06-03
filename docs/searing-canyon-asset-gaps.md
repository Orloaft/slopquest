# Searing Canyon — Asset Worklist & Forge Prompts

Target: `assetsources/searing-canyon/searing-canyon-mockup.jpg`. Pipeline rules (per
`world_crafting_spec.md` §2/§8): magenta `#FF00FF` bg, hard edges, **fixed visual cell
order**, 32px @1×, magenta key `blue ≥ green + 8`.

## Triage

| Element | Verdict |
|---|---|
| Plateau tops, paths/dither, teal water, bridges, ladders | reuse + **recolor** existing sliced sheets |
| **Multi-direction cliff faces** | engine work (`searing-canyon-engine-plan.md`) **+** new red columnar sheet (below) |
| Outpost, ritual circle, cultist camp, mine rig, desert flora | **net-new bespoke** Asset Forge loops |

---

## 1. Red columnar cliff sheet — `cliff-red.png` (GATING ART, prompt ready)

This must serve the new multi-direction renderer, so it ships S **and** E/W faces + corner caps.

```
Create a single top-down 2D RPG tileset sheet: a "Searing Canyon red-rock cliff set" matching
the painterly-but-crisp pixel style of the attached canyon mockup (searing-canyon-mockup.jpg).
The rock is SUN-BAKED RED-ORANGE SANDSTONE with a columnar/stacked-stone texture: vertical
fluted columns, darker rust-brown crevices between them, a cool purple-grey shadow at the very
base, topped by a thin baked-earth lip (NOT grass — this is desert). Flat slightly-front
orthographic lighting from upper-left. Do NOT make it green, glossy, cartoonish, or blurry.

TECHNICAL REQUIREMENTS (critical for automated slicing):
- Each tile is exactly 32x32 px of content, output at 1x (do NOT upscale).
- Background pure magenta #FF00FF; HARD edges only, no glow/blur/AA bleeding onto the magenta
  (keyed to transparency -> no pink fringe). Adjacent tiles in a group must tile pixel-for-pixel.
- Even ~8px magenta gutter between cells; print each label in small text directly ABOVE its cell.

GROUP A "PLATEAU-TOP" — 16-tile corner-Wang (NW=1,NE=2,SE=4,SW=8), 4x4 grid, labels A0..A15.
  Baked-red-earth top surface with a darkening rocky RIM on whichever corners drop away.
  A0=fully low, A15=solid interior (no rim).
GROUP B "SOUTH-FACE" — 3 rows (TOP lip / MID / BASE) x 5 cols (LEFT-CAP, STRAIGHT, RIGHT-CAP,
  INNER-L, INNER-R), labels B_<row>_<col>. Horizontal-run columnar wall, stacks vertically.
GROUP C "SIDE-FACE" — the vertical-run wall seen on an EAST or WEST drop. 2 cols (FACING-LEFT,
  FACING-RIGHT) x 3 rows (TOP / MID / BASE), labels C_<row>_<col>. Reads as a rock column wall
  turned 90 deg from Group B; tiles vertically.
GROUP D "CORNER-CAPS" — 4 convex corner tiles where a south face meets a side face, labels
  D_NE, D_NW, D_SE, D_SW.
GROUP E "STAIRS" — wooden plank stair set into the red rock, 1 tile wide, 3 tiles
  (E_TOP / E_MID / E_BASE), tiles vertically; weathered wood against red stone.

Output one PNG, tightly cropped to the grid+gutters, 1x, one consistent palette + light dir.
```

Wiring: slice A as corner-Wang, B/C/D/E by label; feed the multi-direction renderer
(`searing-canyon-engine-plan.md`). Recolor the teal water from `water-wang.png` separately.

### 1a. Per-group prompts — LOCKED (M1)

The renderer is wired to three face groups (`build-searing-canyon-from-authored.ts`: `face`
= B 5×3, `faceSide` = C 2×3, `caps` = D 4×1). A solid-colour placeholder (`tools/
make_cliff_red_placeholder.py`) already proves the `drop(r,c,dir)` math; these prompts forge
the real art into the same tile slots.

**Shared texture preamble (keeps all four directions uniform):**

> Sun-baked **red-orange sandstone**, **vertical fluted columns** with darker rust-brown
> crevices between them, fine horizontal **striation banding** across the rock, a cool
> purple-grey shadow pooling at the very base, capped by a thin baked-earth lip (NOT grass —
> desert). Flat slightly-front orthographic light from upper-left. 32×32 content @1× (no
> upscale), pure magenta `#FF00FF` bg, hard edges, no AA/glow bleed, ~8px gutter, label above
> each cell. Not green, glossy, cartoonish, or blurry.

**Group B — SOUTH FACE** (horizontal-run, stacks vertically; fills `face`):
> 3 rows × 5 cols = 15 tiles. Rows = **TOP lip / MID course / BASE** (purple-grey contact
> shadow on BASE). Cols = **LEFT-CAP, STRAIGHT, RIGHT-CAP, INNER-L, INNER-R**. Rock columns
> run vertically within each tile (wall seen head-on); STRAIGHT tiles tile seamlessly
> left↔right; CAPs round the wall ends; INNER-L/R turn the corner back into the plateau.
> Labels `B_top_Lcap` … `B_base_innerR`.

**Group C — SIDE FACE** (vertical-run, E/W drops — the net-new art the engine needs; fills `faceSide`):
> 3 rows × 2 cols = 6 tiles. Same sandstone, but the **columns run horizontally** — the wall
> seen edge-on, rotated 90° from Group B. Cols = **FACING-LEFT** (west drop, lit edge on its
> right) and **FACING-RIGHT** (east drop, lit edge on its left). Rows = **TOP / MID / BASE**.
> Tiles seamlessly top↔bottom so a tall E/W wall stacks cleanly. Labels `C_top_left` …
> `C_base_right`.

**Group D — CORNER CAPS** (convex S↔side junctions; fills `caps`):
> 1 row × 4 cols = 4 tiles, `D_NE, D_NW, D_SE, D_SW`. Each blends a south face into a side
> face at a plateau's outer corner so the L-join shows no seam. Same palette + light dir.

---

### 1b. Bespoke set-piece landmarks — LOCKED (M2)

Four landmark **kit sheets**, one per M0 flat pad. Rigid contract: pure magenta `#FF00FF`
bg, hard edges (clean RGBA key), each sprite **bottom-center-anchored** at 1×, ~8px gutter,
label above each cell, painterly-crisp, sun-baked palette, upper-left light. Anchors are the
`tools/author_searing_canyon.py` pads; placement API is `B(key, file, nativeW, nativeH, tx,
ty, dispW, block)` in `tools/build-searing-canyon-from-authored.ts`.

**Outpost kit — `outpost-kit.png`** · pad cols 60–101 × rows 0–20 (tier-3 mesa, center 80)
> `tent_chief` (200×280) massive central chieftain's tent, bone/skull totems, war-banners ·
> `tent_raider` (120×176) smaller red canvas tent · `watchtower` (112×224) banner-draped log
> tower, spiked top · `palisade_seg` (64×80) spiked-log fence segment, tiles H+V seamlessly ·
> `skull_totem` (40×112) stacked-skull totem pole.

| sprite | tx,ty | dispW | block |
|---|---|---|---|
| palisade_seg | perimeter ring of 60–101 × 0–20 (every cell) | 64 | perimeter `blockCell` |
| tent_chief | 80,12 | 200 | [5,3] |
| tent_raider | 69,7 / 92,8 | 120 | [3,2] |
| watchtower | 63,5 / 98,6 | 112 | [2,3] |
| skull_totem | 75,9 / 86,10 | 36 | — |

**Cultist camp kit — `cultist-kit.png`** · pad cols 2–22 × rows 0–13 (tier-3 mesa, center 12)
> `tent_cult` (120×176) dark-red cult tent, bone fetishes · `campfire` (56×56) active glowing
> campfire, emissive embers · `skull_totem_tall` (40×128) tall skull/bone totem.

| sprite | tx,ty | dispW | block |
|---|---|---|---|
| tent_cult | 12,9 | 120 | [3,2] |
| campfire | 8,11 | 48 | — |
| skull_totem_tall | 5,7 / 18,8 | 36 | — |

**Ritual circle kit — `ritual-kit.png`** · pad cols 46–60 × rows 22–33 (tier-2, center 53,28)
> `floor_stone` (32×32 tileable) basalt floor w/ faint magma cracks · `floor_edge` (32×32)
> rune-etched border ring · `rune_core` (112×112) central glowing fiery magma rune, emissive ·
> `arch_stone` (88×144) curved standing bone/stone arch.

| element | tx,ty / cells | dispW | block / overlay |
|---|---|---|---|
| floor_stone / floor_edge | disc r≈6 around 53,28 (edge on rim, stone interior) | — | fringe overlay |
| rune_core | 53,28 | 96 | — (walkable center) |
| arch_stone | 47,26 / 59,27 / 53,23 | 80 | [2,2] |

**Mining facility kit — `mine-kit.png`** · pad cols 75–109 × rows 40–68 (tier-1; rear cliff row ~40, center 92)
> `cave_mouth` (128×128) red-sandstone cave arch, timber lintel (×2 = dual entry) ·
> `scaffold_crane` (176×208) timber scaffold + rope crane hoist · `minecart` (56×48) loaded
> ore cart · `barrel_stack` (56×64) stacked barrels/crates · `track_seg` (32×32 tileable) rail.

| element | tx,ty / cells | dispW | block / overlay |
|---|---|---|---|
| cave_mouth ×2 | 84,42 / 98,43 (against rear cliff) | 120 | [3,2] |
| scaffold_crane | 90,52 | 168 | [5,3] |
| minecart | 88,58 | 52 | — |
| barrel_stack | 95,60 / 80,55 | 50 | [1,1] |
| track_seg | cave_mouth → scaffold line | — | fringe overlay |

**Wiring contract:** object sprites → `PLACEMENTS.push(B(...))` (bottom-center `tx,ty`,
`block=[w,h]` flips the footprint to `'B'`). Pads are M0-flattened so bottom-center anchoring
never floats mid-cliff. Outpost palisade via a `fenceRing`-style loop + perimeter `blockCell`
(interior walkable). Tile overlays (ritual floor, mine track) via a generic `overlayTiles`
helper that appends tileset entries and writes `fringe[r][c]`. Re-add a `vReserve` halo around
footprints when the desert-flora scatter returns, so props don't spawn on a tent.

---

## 2. Set-piece bespoke sprites (full prompts written JIT, tower-style)

Specs locked now; I'll expand each into a full Forge prompt right before we generate it
(the just-in-time pattern that worked for the Waystone tower). All are depth-sorted object
sprites, bottom-center anchored, magenta bg.

- [ ] **Spiked outpost** — palisade fence segment (spiked logs), big skull-totem center tent
  (red canvas), banner watchtower. Tent ~`128x224`, block `[3,2]`; fence segment ~`64x80`
  tiling like the Waystone `fenceRing`. Anchor box ~cols 60–101, rows 0–20.
- [ ] **Ritual circle** — tile-overlay (stone ring on the ground, like the crop-field fill)
  **+** a glowing magma-rune center object with emissive orange. Flanking standing stones.
  Anchor ~cols 46–60, rows 22–33.
- [ ] **Cultist camp** — red canvas tent (~`96x160`), skull totem pole (~`32x96`); reuse the
  beach campfire for the fire. Anchor ~cols 2–22, rows 0–13.
- [ ] **Mine rig** — cave-mouth (recolor Waystone `cave_entrance.png` to red) + wooden
  scaffold/crane (~`128x160`, block `[4,2]`), minecart + track props, barrels. Anchor
  ~cols 75–109, rows 40–68.

## 3. Desert flora prop sheet — `desert-props.png`

- [ ] One sheet, fixed-cell order (like the `obj_NNN` props): **saguaro cactus** (2–3 size
  variants, multi-arm), **dead shrub/bush**, **bone/skull pile**, **red scree boulder**
  (2 variants). Placed by the existing prop-scatter pass (`PROP_IDS`/`PROP_W`); scale each
  to <~1.3 tiles except saguaro (~1.5–2 tiles, like trees).

---

_Anchor boxes match `tools/derive_searing_canyon.py`. M0 elevation is a brightness-derived
first pass and needs hand-authoring into coherent tiers — see session notes._
