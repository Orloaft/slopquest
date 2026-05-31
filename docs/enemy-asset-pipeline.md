# Enemy Asset Pipeline

All new bespoke runtime enemy sprites should use the `enemy-directional-8x8-v1` contract.

The reference behavior is the in-game goblin scout directional contract, extended with a matching attack block: movement and attacks are directional animation families, not a single row mirrored or reused for every facing.

## Runtime Sheet Contract

- Sheet size: `768x768`
- Cell size: `96x96`
- Columns: `8` frames per direction
- Rows: `8`
- Row order:
  - `walk_up`
  - `walk_right`
  - `walk_down`
  - `walk_left`
  - `attack_up`
  - `attack_right`
  - `attack_down`
  - `attack_left`
- Runtime texture count per enemy: `32` walk frames and `32` attack frames

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
