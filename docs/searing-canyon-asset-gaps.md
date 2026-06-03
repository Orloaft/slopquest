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
