# Enemy Asset Pipeline

All new bespoke runtime enemy sprites should use the `enemy-directional-4x4-v2` contract.

## Art Style: simpler painterly pixel

The roster target is a **simplified painterly pixel-art** look — lower interior detail than a
fully-rendered pixel sheet, but the same painterly family as the keeper sprites (skeleton, goblins).
The point is small-screen readability (sprites render ~60–130px tall) and frame-to-frame
consistency for image-model generation.

- **Strong silhouette** first — the shape reads at a glance.
- **Limited palette** — roughly 8–16 intentional colours per creature; soft painterly shading
  within that. The pipeline enforces a hard cap of `64` distinct opaque colours per sheet
  (`MAX_SHEET_COLORS` in `tools/validate_enemy_asset_pipeline.py`); over-detailed or heavily
  anti-aliased art is rejected at the gate.
- **One clear key/rim light**, minimal interior noise.
- Side art faces **LEFT**; right is mirrored at runtime.

## Runtime Sheet Contract

- Sheet size: `384x384`
- Cell size: `96x96`
- Columns: `4` frames per direction
- Rows: `4` (walk only)
- Row order:
  - `walk_up`
  - `walk_right`
  - `walk_down`
  - `walk_left`
- **No attack rows.** Attacks reuse the walk pose plus the shared slash/missile effect overlays
  (`effects.png`), matching the keeper families which have no bespoke attack art.
- Runtime texture count per enemy: `16` walk frames (4 directions × 4 frames).

## Commands

Generate or regenerate the full pipeline:

```sh
npm run assets:enemies
```

Validate generated outputs without changing assets:

```sh
npm run assets:enemies:check
```

Run the regular project check plus the enemy asset contract:

```sh
npm run check
```

## Outputs To Inspect

- Contact sheet: `assetsources/curated/bespoke/woodland-enemies-v2/woodland_bespoke_v2_contact.png`
- Machine manifest: `assetsources/curated/bespoke/woodland-enemies-v2/woodland_bespoke_v2_manifest.json`
- Per-row review GIFs: `assetsources/curated/bespoke/woodland-enemies-v2/<enemy>/<enemy>_<row>_inspection.gif`
  These are the human inspection previews. Each GIF must show exactly one row/action/direction at a time; do not replace them with an animated contact sheet or any preview that animates multiple directions together.
- Runtime sheets: `public/<enemy>-sheet.png`

## Adding An Enemy

1. Add the enemy to `ENEMIES` in `tools/generate_woodland_enemy_sprites_v2.py`.
2. If it should be loaded by the game, add the slug to `PUBLIC_COPY_SLUGS`.
3. Add its family to `WOODLAND_BESPOKE_FAMILIES` in `src/main.ts`.
4. Add or update the spawn/spec mapping in `monsterActorSpec`.
5. Run `npm run assets:enemies`.
6. Run `npm run check`.
7. Provide the changed enemy's one-row inspection GIFs for review.

Do not hand-copy partial sheets into `public/`. The public runtime sheet should be copied from the cleaned alpha output recorded in the manifest.
