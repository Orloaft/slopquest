#!/usr/bin/env python3
"""Classify a biome atlas's road tiles into a 4-neighbour "blob" tileset.

Roads in our baked atlases exist as discrete directional tiles (straights,
curves, T/cross junctions) sliced from a hand-painted source — but the baker
only ever placed ONE flat tile, so the directional art sits in the atlas
unreferenced. This tool recovers it: for every `packed-road` tile it measures
which of the 4 edges (N/E/S/W) the road runs OFF of, turns that into the
N|E|S|W bitmask the editor's blobResolver uses (1|2|4|8), and picks the
cleanest representative tile per bitmask.

Output: <stageDir>/<zone>.blobset.json  — the SEMI-auto handoff. The mapping is
a proposal; every config also lists `candidates` so it can be re-pointed by
hand. See docs/editor-autotile.md for the hand-tuning workflow.

Usage:
  python3 tools/classify-road-blobset.py --zone northwood \
      --atlas public/tilesets/northwood/forest.png \
      --manifest assetsources/asset-forge/exports/northwood/forest.tileset.json \
      --out assetsources/asset-forge/exports/northwood/northwood.blobset.json
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image

# Bit layout MUST match editor.html blobResolver: N=1, E=2, S=4, W=8.
BIT = {"N": 1, "E": 2, "S": 4, "W": 8}
NAMES = {0: "isolated", 1: "N", 2: "E", 4: "S", 8: "W", 3: "NE", 6: "SE", 12: "SW",
         9: "NW", 5: "NS (vert)", 10: "EW (horiz)", 7: "NES", 11: "NEW", 13: "NSW",
         14: "ESW", 15: "cross"}


def load_atlas(path, cols, ts):
    img = np.asarray(Image.open(path).convert("RGBA"))
    rows = img.shape[0] // ts
    return img, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zone", required=True)
    ap.add_argument("--atlas", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--role", default="packed-road", help="manifest role to treat as road")
    ap.add_argument("--atlas-name", default=None, help="ref prefix; defaults to manifest name")
    args = ap.parse_args()

    man = json.load(open(args.manifest))
    ts, cols = man["tileSize"], man["columns"]
    atlas_name = args.atlas_name or man["name"]
    img, rows = load_atlas(args.atlas, cols, ts)

    def tile(idx):
        r, c = divmod(idx, cols)
        return img[r * ts:(r + 1) * ts, c * ts:(c + 1) * ts]

    road_idx = [t["index"] for t in man["tiles"] if t["role"] == args.role]
    if not road_idx:
        sys.exit(f"no tiles with role '{args.role}' in {args.manifest}")

    # Calibrate road vs surround colour by 2-means over every road tile's pixels:
    # the tiles are road (warm tan) on grass (green), so the pixels split cleanly
    # into two clusters. Road = the warmer cluster (higher R-minus-G). Self-
    # calibrating, so it ports to other biomes without hand-picked reference tiles.
    px = np.concatenate([tile(i)[..., :3].reshape(-1, 3) for i in road_idx]).astype(float)
    c = np.array([[200, 150, 40], [90, 140, 60]], float)
    for _ in range(25):
        a = np.linalg.norm(px[:, None, :] - c[None], axis=2).argmin(1)
        for k in range(2):
            if (a == k).any():
                c[k] = px[a == k].mean(0)
    road_rgb, grass_rgb = (c[0], c[1]) if (c[0][0] - c[0][1]) > (c[1][0] - c[1][1]) else (c[1], c[0])

    def roadness(px):
        """1.0 where pixel is road-coloured, 0.0 where grass-coloured."""
        p = px[..., :3].astype(float)
        dr = np.linalg.norm(p - road_rgb, axis=-1)
        dg = np.linalg.norm(p - grass_rgb, axis=-1)
        return dg / (dr + dg + 1e-6)  # >0.5 == nearer road

    # Sample only the central ~30% of each border, a thin band `depth` px deep, and
    # take the fraction of road-ish pixels. A road that runs straight OFF an edge
    # fills that edge's midpoint; corner bleed from a perpendicular road does not
    # reach the midpoint — so a narrow central window keeps straights from reading
    # as junctions (the dominant failure on hand-painted slices).
    depth = max(2, ts // 12)
    lo, hi = int(ts * 0.34), int(ts * 0.66)

    def edge_road_fraction(t):
        rm = roadness(t) > 0.5
        return {
            "N": rm[:depth, lo:hi].mean(),
            "S": rm[-depth:, lo:hi].mean(),
            "W": rm[lo:hi, :depth].mean(),
            "E": rm[lo:hi, -depth:].mean(),
        }, roadness(t)[lo:hi, lo:hi].mean()  # + interior roadness

    CONNECT = 0.4   # edge counts as "road runs off here" above this fraction
    INTERIOR_MIN = 0.25  # ignore tiles that are basically all-grass (mislabelled)

    classified = {}  # bitmask -> list of {index, score, frac}
    skipped = 0
    for idx in road_idx:
        frac, interior = edge_road_fraction(tile(idx))
        if interior < INTERIOR_MIN:
            skipped += 1
            continue
        bm = 0
        for e, b in BIT.items():
            if frac[e] >= CONNECT:
                bm |= b
        # score = contrast: strong on connected edges, weak on disconnected ones.
        # Higher = a cleaner, less ambiguous representative for this bitmask.
        on = [frac[e] for e in BIT if bm & BIT[e]]
        off = [frac[e] for e in BIT if not bm & BIT[e]]
        score = (np.mean(on) if on else 0.5) - (np.mean(off) if off else 0.0)
        classified.setdefault(bm, []).append(
            {"index": idx, "score": round(float(score), 3),
             "frac": {e: round(float(frac[e]), 2) for e in "NESW"}})

    for bm in classified:
        classified[bm].sort(key=lambda c: -c["score"])

    # Build the 16-entry table. Each bitmask -> best representative index.
    # Missing configs fall back to the flat road fill (so roads still render,
    # just unshaped) and are flagged for the human to draw/repoint.
    fill_idx = classified.get(15, classified.get(10, [{"index": road_idx[0]}]))[0]["index"]
    tiles, candidates, fallbacks = {}, {}, []
    for bm in range(16):
        cands = classified.get(bm, [])
        if cands:
            tiles[str(bm)] = cands[0]["index"]
            candidates[str(bm)] = [c["index"] for c in cands]
        else:
            tiles[str(bm)] = fill_idx
            candidates[str(bm)] = [fill_idx]
            fallbacks.append(bm)

    out = {
        "schema": "tib/stage-blobset@1",
        "generatedBy": "tools/classify-road-blobset.py",
        "note": "SEMI-auto proposal. `tiles` maps the N|E|S|W bitmask (N=1 E=2 S=4 W=8) "
                "to an atlas index; edit by hand to re-point. `candidates` lists other "
                "tiles that classified to each bitmask. See docs/editor-autotile.md.",
        "sets": [{
            "group": "Road",
            "id": "road",
            "label": "\U0001F6E4️ Road",
            "atlas": atlas_name,
            "role": args.role,
            "blocked": False,
            "paintBitmask": 15,
            "tiles": tiles,
            "candidates": candidates,
            "fallbackBitmasks": fallbacks,
        }],
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    json.dump(out, open(args.out, "w"), indent=2)
    open(args.out, "a").write("\n")

    print(f"road tiles: {len(road_idx)} (skipped {skipped} all-grass), "
          f"covered {16 - len(fallbacks)}/16 configs")
    print(f"road_rgb={road_rgb.astype(int)} grass_rgb={grass_rgb.astype(int)}")
    for bm in range(16):
        tag = "  <fallback>" if bm in fallbacks else ""
        cs = candidates[str(bm)]
        print(f"  bm={bm:2d} ({bm:04b}) {NAMES[bm]:>11}: {atlas_name}:{tiles[str(bm)]}"
              f"  alts={cs[:5]}{tag}")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
