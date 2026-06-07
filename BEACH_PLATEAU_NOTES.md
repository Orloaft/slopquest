# Beach (floor 8) plateau rework — working notes

Goal (Alex, 2026-06-07): give The Sunken Beach **proper plateaus** like the
improved stages (searing-canyon floor 6, northwood floor 3).

## How the improved stages do plateaus (reference)
- Generated stages bake a **multi-row cliff FACE** (canyon/northwood: `q`/`o`
  face tiles stacked in a column = tall wall) + a **lit plateau TOP** (`L`) +
  **stairs** (`m`).
- `createMapChunk` then adds two depth cues (main.ts ~2542):
  - `searingCliffLip` on the TOP course (sand/face cell with no face above) —
    warm sun-catch rim where the plateau breaks into the drop. STRONGEST cue.
  - `searingCliffAO` on the lower ground directly below a cliff foot.
- Height comes from STACKING 32px face tiles vertically (each tile is 32px;
  `makeTileTexture` squashes any crop to 32×32, so a tall wall = N stacked rows).

## Beach specifics
- Beach is a **direct char->texture** stage (no autotiling). Pipeline:
  `assetsources/beach/beach-layout-authored.txt`
  -> `npm run assets:bridge:beach` (tools/build-beach-from-authored.ts)
  -> `npm run assets:stage:beach` (tools/import-asset-forge-stage.ts)
  -> `src/generated/stages/beach.ts`.  (`npm run assets:beach` does both.)
- Beach cliff tiles already exist: `x` cliff face, `0`/`1` left/right end caps,
  `|` rock-wall, `[`/`2`/`]` stairs. All bake to flat 32px (no overflow).
- Current layout = flat sand island + winding path + 3 stray 2-row cliff
  fragments (`0xx[22]xx1`/`||||`) floating in flat sand = the "stairs to nowhere".

## Plan
1. Redesign `beach-layout-authored.txt`: 1-2 coherent plateaus (northern bluff
   where hut/ruin/cave content already sits), south edge = multi-row stacked
   cliff face (`0xxx1` run, `|` for the 2nd course) with `[2..2]` stair gaps.
2. Render add (floor 8, createMapChunk): **rim lip** on sand cells that have a
   cliff face directly below (mirror searingCliffLip). Foot AO already done
   (beachCliffShadow cast-shadow, committed 61efcfd).
3. Reposition MAP_OBJECTS[8] high-content props onto plateau tops; keep low
   content (dock/boat/barrels) on the low beach.
4. `npm run assets:beach`, then e2e tour (tests/e2e/beach-overview-preview.spec.ts)
   to verify. Reuse-server gotcha: kill stale vite(:5173)+game(:8787) first.

## Done so far
- 61efcfd: registered 18 missing prop textures + beachCliffShadow foot-AO.
