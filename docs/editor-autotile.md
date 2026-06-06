# Editor Auto-tile: roads & water blob sets

The stage editor (`/editor.html`) can paint **roads** (and, later, water) as a
4-neighbour *blob* autotile: you paint a path, and every cell picks its own
tile — straight, curve, T or cross — from which of its neighbours are also road.
This doc is the **hand-tuning manual**: how the tile picks are decided and how to
correct them when the auto-proposal gets one wrong.

> TL;DR — the per-stage file `…/exports/<zone>/<zone>.blobset.json` maps a 16-entry
> bitmask table to atlas tile indices. Edit `tiles` by hand, reload the editor,
> done. Nothing recompiles.

## Where the tiles come from

Our baked atlases were sliced from hand-painted maps, so the directional road art
already exists in the atlas (curves, junctions, straights) — it's just unlabelled.
`tools/classify-road-blobset.py` recovers it: it measures which edges of each
`packed-road` tile the road runs off of, turns that into a bitmask, and proposes
one tile per bitmask. The result is a **proposal, not gospel** — hand-painted
slices don't have perfectly normalised connection points, so some configs are
ambiguous or missing. That's what this file lets you fix.

Re-generate the proposal at any time:

```bash
python3 tools/classify-road-blobset.py --zone northwood \
  --atlas public/tilesets/northwood/forest.png \
  --manifest assetsources/asset-forge/exports/northwood/forest.tileset.json \
  --out assetsources/asset-forge/exports/northwood/northwood.blobset.json
```

Re-running **overwrites your hand-edits**, so tune in the JSON only once you're
happy with coverage, or keep your hand-tuned file and don't re-run.

## The bitmask (this is the whole model)

Each cell looks at 4 neighbours. A neighbour that is *also road* sets a bit:

```
            N = 1
             │
   W = 8 ────┼──── E = 2
             │
            S = 4
```

The cell's bitmask = sum of the bits for the sides that connect. So:

| bitmask | binary | shape it should be          |
|--------:|:------:|-----------------------------|
| 0       | 0000   | isolated stub (no neighbours)|
| 5       | 0101   | **vertical straight** (N+S) |
| 10      | 1010   | **horizontal straight** (E+W)|
| 3       | 0011   | corner connecting **N+E**   |
| 6       | 0110   | corner connecting **S+E**   |
| 12      | 1100   | corner connecting **S+W**   |
| 9       | 1001   | corner connecting **N+W**   |
| 7,11,13,14 | …   | T-junctions (3 sides)       |
| 15      | 1111   | 4-way cross                 |
| 1,2,4,8 | …      | dead-end stubs (one side)   |

This bit layout is fixed in `editor.html` (`blobResolver`) — don't change it; just
point each bitmask at the right tile.

## The file: `<zone>.blobset.json`

```jsonc
{
  "sets": [{
    "group": "Road",          // toolbar group name
    "id": "road",             // "road" tiles are walkable + flagged road:true
    "label": "🛤️ Road",       // toolbar button text
    "atlas": "forest",        // ref prefix → tiles are forest:<index>
    "blocked": false,         // are these tiles walls? (false for road)
    "paintBitmask": 15,       // which tile is stamped first when you click (then it re-resolves)
    "tiles": {                // ← THE TUNING SURFACE: bitmask → atlas index
      "5": 505,               //   vertical straight = forest:505
      "10": 563,              //   horizontal straight = forest:563
      "3": 397,               //   N+E corner = forest:397
      ...
    },
    "candidates": { "5": [505, 367, 374, ...] },  // other tiles that fit this bitmask (suggestions)
    "fallbackBitmasks": [0, 6, 8, 14]             // configs with no clean match — using the fill tile
  }]
}
```

Only `tiles` matters at runtime. `candidates` and `fallbackBitmasks` are advisory
output from the classifier to make hand-tuning faster.

## How to fix a wrong tile

1. **Open the editor**, pick the zone, click the **🛤️ Road** auto-tile button, and
   paint a test patch — a `+` and an `L` show every straight, corner, junction and
   the cross at once.
2. **Spot the bad cell.** Say the horizontal straight looks like a junction.
   Its bitmask is **10** (E+W).
3. **Find a better tile.** Open the **Atlas** panel (the `Atlas ▸` toggle) and hover
   tiles — each tooltip shows its ref, e.g. `forest:563`. Or read the `candidates`
   list for bitmask `10` in the JSON; those already classified to that shape.
   To eyeball the whole road set, regenerate with the contact-sheet helper used
   during authoring (renders every candidate per bitmask).
4. **Edit** `tiles["10"]` to the index you want, save the JSON.
5. **Reload the editor** (the blobset is read on stage load). Re-paint and check.

No build step runs — the editor reads the JSON fresh each load. Your actual map
edits (the roads you paint) are saved separately via the editor's **Save** button,
which only writes the road tiles you actually placed into the stage legend.

## Fallbacks & seams (known limits)

- **`fallbackBitmasks`** are configs the classifier found no clean tile for (often
  the isolated stub and rare 3-way Ts). They render as the cross/fill tile — road-
  coloured but not correctly shaped. Re-point them by hand to the closest tile, or
  leave them: those configs are rare in a real road network.
- **Seams** between a curve and a straight can be slightly off, because the source
  tiles were hand-painted at different road offsets. Pick `candidates` whose road
  enters/exits at a consistent position to minimise this. A perfectly seamless set
  would need purpose-drawn blob art (the alternative path we did **not** take).

## Adding water or another biome

The format is generic. To add a water blob set to a stage:

1. Write a classifier pass (clone `classify-road-blobset.py`, point `--role` at the
   water role — note some manifests label water poorly, so you may classify by
   colour instead).
2. Emit a second entry in that zone's `sets` array with `id: "water"`,
   `blocked: true`, and its own `tiles` table.
3. The editor builds a toolbar button for it automatically — no editor code change.

Plumbing: the dev server serves `<zone>.blobset.json` in `/editor/api/state`
(`vite.config.ts`); `editor.html` mints a hidden tile char per distinct atlas index
and drives them through the shared `blobResolver`. Membership is the set's own
tiles; **connectivity** also counts legacy road tiles, so new roads butt cleanly
against pre-existing ones.
