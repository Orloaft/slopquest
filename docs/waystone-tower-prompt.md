# Prompt for the image-gen agent — Waystone TOWN TOWER (`tower-waystone.png`)

Why: Waystone's main structural landmark currently reuses Northwood's `watchtower.png`
(a grey round stone turret + red cone roof), which breaks regional identity. This is a
single **bespoke hero-structure sprite** (not an autotile family), so unlike the
plateau-top sheet there is no grid — it's one upright sprite on a magenta field, sliced by
the magenta key and placed as a depth-sorted runtime object.

Hand the artist the block below, plus the mockup
(`assetsources/waystone/waystone-mockup.jpg`, see its top-right tower) and the existing
`watchtower.png` **as the thing to deliberately differ from**.

---

```
Create a single top-down 2D RPG hero-structure sprite: the "Waystone Town Tower" — the main
structural landmark of a cozy starting village, viewed from a flat, slightly-front orthographic
top-down angle (the same camera as the attached village mockup, waystone-mockup.jpg). Match that
mockup's warm, painterly-but-crisp 16-bit SNES/GBA pixel style and palette. Flat lighting from
the upper-left. Do NOT make it glossy, cartoonish, neon, or blurry.

This tower must read as a WARM, lived-in TOWN landmark, deliberately DIFFERENT from a cold
military border watchtower (a plain grey round stone turret with a red conical roof — do NOT make
that). Bespoke design cues that establish the town identity:
- A stout SQUARE stone base of rounded river-stone masonry in warm grey-tan, mossy at the footing,
  with a warm-lit arched wooden door and one or two shuttered windows with a soft interior glow.
- An upper TIMBER-FRAMED gallery / hoarding storey that oversails the stone base — exposed dark-oak
  beams over warm plaster infill, matching the village's half-timbered cottages. THIS is the key
  differentiator from the round military turret.
- A wooden-shingled HIP roof in weathered TEAL-BLUE or warm brown (NOT a red cone), topped with a
  small pennant/banner flag.
- Optional warmth: a hanging lantern or a bell under the gallery eave.
The silhouette is tall and proud but town-friendly, not fortress-grim.

TECHNICAL REQUIREMENTS (critical for automated slicing):
- ONE sprite, drawn upright, standing on the ground: its base is the BOTTOM-CENTER of the content.
- Authored at 1× — do NOT upscale, tile, or add a frame/border. Target content footprint about
  112 px wide x 256 px tall; keep the whole tower inside that box.
- Background: pure magenta #FF00FF everywhere except the tower. HARD edges only — no drop shadow,
  glow, blur, or anti-aliasing bleeding onto the magenta. Magenta is keyed to transparency, so any
  semi-transparent pink fringe leaves halos in-game. A contact shadow at the base is fine only if
  it is fully opaque pixels, never blended onto the magenta.
- One consistent palette and a single light direction across the whole sprite.
- Output one PNG, tightly cropped to the tower + a minimal magenta margin, 1×.
```

---

## Wiring contract (renderer side — I own this)

1. Save the result to `assetsources/curated/bespoke/fantasy-village-assets-v1/tower-waystone.png`.
2. Magenta-key + trim to content on slice (key: `blue >= green + 8`, mirrors the pipeline's slicers
   and `preview-stage-waystone.ts isMagentaKey`). No pink fringe.
3. Swap the existing watchtower placement to the new file, keeping its map position (col 104, row 11).
   In `tools/build-waystone-from-authored.ts:64`:

   ```ts
   // before:
   B("spriteWatchtower", `${BESPOKE}/watchtower.png`,     96, 224, 104, 11, 120, [2, 2]),
   // after (set nw/nh to the TRIMMED png's actual px):
   B("spriteWatchtower", `${BESPOKE}/tower-waystone.png`, 112, 256, 104, 11, 140, [3, 2]),
   ```

   - `nw/nh` = native trimmed content px. `dispW=140` renders ~4.4 tiles wide (the watchtower was
     `120`/~3.75 — the town tower is meant to read grander). `block [3,2]` = a 3-wide × 2-deep
     collision footprint anchored bottom-center (c0 = 104 − floor((3−1)/2) = 103 → cols 103–105,
     rows 10–11, all on the tier-2 shelf).
   - It is a depth-sorted runtime **object** sprite (bottom-center anchored), NOT a tile pass.
4. Rebake + verify: `npm run assets:waystone && npm run workflow:waystone`, then eyeball the
   top-right corner of `artifacts/waystone-from-stage.png`.
