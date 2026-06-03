# Asset Forge Stage Pipeline

This branch starts the Northwood pilot for moving tib zones from hand-built tile loops to Asset Forge-authored stages.

## Contract

- Editable Asset Forge projects live under `assetsources/asset-forge/projects/`.
- Exported stage bundles are unpacked under `assetsources/asset-forge/exports/<zone>/`.
- Zone vocabulary files live beside them as `assetsources/asset-forge/<zone>.vocab.json`.
- Runtime atlas PNGs copied from exports live under `public/tilesets/<zone>/`.
- Compiled tib modules live in `src/generated/stages/<zone>.ts`.

The Asset Forge stage owns visual tile placement and explicit collision. The vocabulary file owns tib semantics: portal chars, road behavior, LOS, blocking overrides, minimap colors, and validation points.

## Import

```bash
node tools/import-asset-forge-stage.ts \
  --stage assetsources/asset-forge/exports/northwood/northwood.stage.json \
  --vocab assetsources/asset-forge/northwood.vocab.json \
  --out src/generated/stages/northwood.ts \
  --public-dir public/tilesets/northwood
```

The importer validates dimensions, ASCII rows, required portals, required walkable approach tiles, and every referenced character in the stage vocabulary before it writes the generated module.

Use the check mode when reviewing a stage change:

```bash
npm run assets:stage:northwood:check
```

That command fails if the generated tib module or runtime atlas copy is stale. The full Northwood pilot loop is:

```bash
npm run workflow:northwood
```

It checks the Asset Forge export, typechecks tib, verifies the generated browser textures load, and reruns the road-safety behavior tests.

## Pilot

Northwood stays on floor 3 and keeps its existing portal/resource intent. The first generated stage is deliberately compatible with tib's current semantic chars so gameplay code continues to use `makeFloorTiles(3)`, `tileAt()`, `isBlockedTile()`, and `isRoadTile()` while the visual source can move to Asset Forge.

## Mockup Comparison Notes

- 2026-06-02 elevation pass: Northwood gained raised terrain, cliff faces, cliff shadows, and stair breaks. This moved the silhouette closer to the mockup, but the ledges still read as generated shelves rather than authored destinations because landmarks are not yet composed around them.
- 2026-06-02 water-bank pass: Ponds and streams gained reed/lily interiors and wet-bank stone rims. This improved shoreline texture, but the mockup still has stronger scene intent: every water or cliff pocket is paired with props, routes, and local ground material.
- 2026-06-02 next gap: POIs are the biggest remaining mismatch. The mockup uses little authored scenes: ruin/cave pockets, signs, logs, lamps, shrines, and resource clearings arranged as readable vignettes. Northwood still has loose clearings plus scattered props. The next pass should add named scene recipes that reserve terrain, object anchors, collision, and road approaches together.
- 2026-06-02 art-spec gap: Placement is now exposing the tile-art ceiling. Cliffs, walkways, and mine pockets need named, reusable tiles that match the Northwood art spec: faceted mossy cliff faces, board/stone walkway surfaces, ore-flecked mine gravel, and blocking exposed ore seams. Future parity comparisons should judge these tile categories directly before adding more POI density.
