# Prompt for the image-generator agent — Northwood bespoke cliff set

Hand the block below to the image-gen agent. It also has the mockup
(`assetsources/mockup/northwood-mockup.jpg`) and the existing sheets for style reference.

Why this set: our cliffs currently use a tan A4 wall block that only faces south, plus an
old red-brown outline set with magenta fringe that clashes. We need ONE cohesive cliff set
in the mockup's exact style that (a) tiles in all directions and (b) slices cleanly.

---

```
Create a single top-down 2D RPG tileset sheet: a "Northwood cliff set" matching the warm,
painterly-but-crisp pixel style of the attached forest mockup (northwood-mockup.jpg). The
cliffs in the mockup are the target: SUNLIT TAN / OCHRE faceted rock with darker brown
crevices and a cool grey-brown shadow at the base, topped by a thin mossy grass overhang.
Lighting is top-down/slightly-front, flat and orthographic. Reproduce that exact material
and palette — do NOT make it red, cartoonish, or glossy.

TECHNICAL REQUIREMENTS (critical for automated slicing):
- Tile size: each tile is exactly 32×32 pixels of content.
- Background: pure magenta #FF00FF everywhere except the sprites.
- HARD EDGES ONLY. No drop shadows, glows, blur, or anti-aliasing that bleeds onto the
  magenta — the magenta must be keyed to transparency with no pink fringe. Sprite edges
  may be slightly dithered but must not fade into the magenta.
- Lay tiles on a regular grid with an even magenta gutter (≈8px) between every tile, and
  print the exact label I give each tile in small text directly ABOVE its cell.
- Tiles in the same group must be seamlessly tileable with their neighbours (edges line up
  pixel-for-pixel when placed adjacent).

Produce THREE labeled groups on the sheet:

GROUP A — "PLATEAU-TOP" (16-tile corner-Wang autotile, top surface of a raised plateau).
This is grass-on-top-of-cliff seen from above; each tile shows the grassy plateau surface
with a darkening rocky RIM on whichever edges drop off to lower ground. Use the marching-
squares corner convention: the tile index encodes which of its 4 CORNERS are raised plateau,
bit values NW=1, NE=2, SE=4, SW=8 (a set bit = that corner is high). Lay them in a 4×4 grid
in index order 0..15, left-to-right, top-to-bottom, labeled "A0".."A15":
  A0  = no corners high (fully lower ground — leave it plain low grass)
  A15 = all four corners high (solid plateau interior, no rim)
  the other 14 = partial, with the dark rocky rim drawn on the low side(s)/corner(s).
The grass color must match the mockup's warm yellow-green grass.

GROUP B — "CLIFF-FACE" (the vertical rock wall that drops below a SOUTH-facing plateau edge).
A faceted tan rock wall, tileable vertically for tall drops. Provide a 3-rows × 5-columns
grid, labeled "B_<row>_<col>":
  rows:    TOP   (grassy overhanging lip where the plateau meets the face),
           MID   (repeating rock face, can stack any number of times),
           BASE  (rock meeting the lower ground, slight rubble/grass tuft).
  columns: LEFT-CAP, STRAIGHT, RIGHT-CAP  (a wall run's left end / middle / right end),
           INNER-CORNER-LEFT, INNER-CORNER-RIGHT  (where the face turns a concave corner).
All three rows of a given column must align so TOP+MID×n+BASE stacks into a seamless wall.

GROUP C — "LADDER" (wooden plank stair set into a cliff face, matching the mockup's ladders).
Light wooden horizontal-plank steps with darker risers and side rails, 1 tile wide, sized
to overlay the cliff face. Provide 3 tiles in a column, labeled "C_TOP", "C_MID", "C_BASE"
(top landing onto the plateau / repeating rungs / bottom step onto lower ground). They must
read as wood against the tan rock and tile vertically.

Output one PNG, tightly cropped, no extra padding beyond the gutters, at 1× (32px tiles) —
not upscaled. Keep all three groups on the same sheet with the same lighting and palette.
```

---

After it's generated, slice with `tools/slice-sheet.ts` (group A as a 4×4 corner-Wang like
`water-wang`; B/C cropped by label), wire into `render-northwood-trees.ts`:
- Group A replaces the plateau-top tint with a real dual-grid corner-Wang on the elevation
  field (raised tier = "high" corners) — gives proper grassy rims on N/E/W edges (fixes the
  south-only gap: those edges stop being hard color seams).
- Group B replaces `cliff-wallblock.png` for the south rock face (now with inner corners).
- Group C replaces the procedural `paintStair`.
