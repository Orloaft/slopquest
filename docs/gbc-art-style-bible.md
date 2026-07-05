# TIB GBC Art Style Bible

This direction targets an original top-down handheld RPG look: small source tiles,
hard pixel edges, compact palettes, and clear gameplay reading at 32px runtime
scale. Pokemon Crystal is a readability and restraint benchmark only. Do not copy,
rip, trace, or imitate Pokemon/Nintendo assets, symbols, map grammar, or ROM data.

## MVP Scope

- Floor 11, `route` / Waystone Trail, is the first proof slice.
- Terrain is authored as 16px source art and scaled exactly 2x to the existing
  32px runtime tile contract.
- The MVP validator is allowlist-only. Legacy assets are not part of this gate.
- Actors, props, effects, and UI may remain legacy during this proof unless they
  are explicitly added to the allowlist.

## Terrain Rules

- Use hard nearest-neighbor pixels only. No antialiasing, blur, bilinear scaling,
  AI texture noise, or high-color speckle.
- Keep each 8x8 source cell to no more than four colors including transparency.
- Use compact ramps with distinct value bands for grass, roads, water, and
  blockers so grayscale readability remains intact.
- Terrain should be quiet. Detail should support navigation, not fight actors,
  resource markers, portals, or editor overlays.
- Blocked tiles must read blocked. Walkable road, grass, and ford tiles must read
  walkable.

## Route MVP Palette

The route MVP uses `assetsources/gbc/palettes.json` palette
`route-overworld`. New integrated route terrain must stay within that palette
unless `assetsources/gbc/gbc-asset-spec.json` documents a short transition
exception.

## Validation Gates

Run `npm run assets:gbc:check` for the allowlisted MVP slice. The validator checks:

- The route stage references only manifest-listed new GBC runtime terrain.
- Source and runtime sheets exist and have matching tile-grid dimensions.
- Runtime pixels are an exact 2x nearest-neighbor scale of the source.
- Source colors are declared in the route palette.
- Each 8x8 source cell stays within the declared color budget.
- The imported public runtime copy matches the source-of-truth runtime atlas.

The validator writes JSON and Markdown reports under
`artifacts/art-new-direction/route-mvp/`.
