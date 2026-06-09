# Agent Brief: Enemy Asset Spec

Read this before changing enemy sprites, enemy texture registration, or enemy asset generation.

## Non-Negotiable Contract

All bespoke runtime enemy sprites use `enemy-directional-4x4-v2`.

- Sheet: `384x384`
- Cell: `96x96`
- Columns: `4` frames per direction
- Rows, in exact order:
  - `walk_up`
  - `walk_right`
  - `walk_down`
  - `walk_left`
- Runtime output per enemy: `16` walk textures
- Palette/style: simpler painterly pixel, roughly `8-16` intentional colours per creature, with a hard cap of `64` distinct opaque colours per sheet enforced by `tools/validate_enemy_asset_pipeline.py`

The reference is the in-game goblin scout directional movement contract, simplified to four walk frames per direction. There are no bespoke attack rows: attacks reuse the walk pose plus shared slash/missile effect overlays from `effects.png`, matching keeper-family behavior.

## Files To Start With

- Spec and workflow: `docs/enemy-asset-pipeline.md`
- Generator: `tools/generate_woodland_enemy_sprites_v2.py`
- Validator: `tools/validate_enemy_asset_pipeline.py`
- Client registration/slicing: `src/main.ts`
- Texture coverage: `tests/e2e/tib-features.spec.ts`
- Generated manifest: `assetsources/curated/bespoke/woodland-enemies-v2/woodland_bespoke_v2_manifest.json`
- Visual contact sheet: `assetsources/curated/bespoke/woodland-enemies-v2/woodland_bespoke_v2_contact.png`

## Commands

Regenerate the pipeline and validate it:

```sh
npm run assets:enemies
```

Validate existing generated outputs without regenerating:

```sh
npm run assets:enemies:check
```

Run the project check, including the enemy asset validator:

```sh
npm run check
```

## When Adding Or Changing An Enemy

1. Add or update the enemy in `ENEMIES` in `tools/generate_woodland_enemy_sprites_v2.py`.
2. If the game should load the sheet at runtime, include its slug in `PUBLIC_COPY_SLUGS`.
3. Add the family to `WOODLAND_BESPOKE_FAMILIES` in `src/main.ts`.
4. Add or update its `monsterActorSpec` entry in `src/main.ts`.
5. Update spawn/content data if needed.
6. Run `npm run assets:enemies`.
7. Run `npm run check`.
8. Inspect the contact sheet and per-row GIFs before calling the work done.
9. Send or surface the new enemy's per-row GIF previews for review. Each preview must animate exactly one walk/direction row, never multiple directions at once.

## Common Mistakes To Avoid

- Do not hand-copy partial or temporary sheets into `public/`.
- Do not reuse one directional row for all facings.
- Do not add bespoke attack rows for this pipeline.
- Do not use multi-direction animated previews for inspection; they make direction problems too easy to miss.
- Do not accept any shape other than `384x384` for this pipeline.
- Do not exceed the `64` opaque-colour sheet cap.
- Do not skip `assets:enemies:check`; it is the guardrail that keeps the repo on spec.

## Done Means

- `woodland_bespoke_v2_manifest.json` records `enemy-directional-4x4-v2`.
- Every public bespoke runtime sheet is `384x384` RGBA.
- Every public bespoke runtime enemy has 4 row GIFs with 4 frames each.
- The reviewer has one-at-a-time GIF previews for the changed enemy's walk rows.
- `npm run check` passes.
- The game texture registry exposes `16` walk frames and no bespoke attack family for each bespoke runtime enemy.
