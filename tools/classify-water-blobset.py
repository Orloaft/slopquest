#!/usr/bin/env python3
"""Classify a biome atlas's water tiles into a 4-neighbour "blob" tileset, and
MERGE the result into that stage's <zone>.blobset.json (keeping road/other sets).

Same idea as classify-road-blobset.py, but water can't be found by manifest role
(our atlases mislabel water — e.g. northwood tags cliff tiles "deep-water"), so we
detect it by COLOUR: the bluest tile seeds a water reference, and every tile whose
interior is mostly water is a water-bodied tile. Its bitmask bit is set on each
edge where OPEN WATER runs off (a shore edge — land beyond — leaves that bit clear),
matching the editor's blobResolver convention (N=1 E=2 S=4 W=8).

Usage:
  python3 tools/classify-water-blobset.py --zone northwood \
      --atlas public/tilesets/northwood/forest.png \
      --manifest assetsources/asset-forge/exports/northwood/forest.tileset.json \
      --out assetsources/asset-forge/exports/northwood/northwood.blobset.json \
      --role deep-water
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image

BIT = {"N": 1, "E": 2, "S": 4, "W": 8}
NAMES = {0: "isolated", 1: "N", 2: "E", 4: "S", 8: "W", 3: "NE", 6: "SE", 12: "SW",
         9: "NW", 5: "NS (vert)", 10: "EW (horiz)", 7: "NES", 11: "NEW", 13: "NSW",
         14: "ESW", 15: "open water"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zone", required=True)
    ap.add_argument("--atlas", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--role", default="deep-water",
                    help="vocab role of this stage's legacy water tile (for editor connectivity)")
    ap.add_argument("--atlas-name", default=None)
    ap.add_argument("--interior", type=float, default=0.45,
                    help="min interior water fraction for a tile to count as water-bodied")
    args = ap.parse_args()

    man = json.load(open(args.manifest))
    ts, cols = man["tileSize"], man["columns"]
    atlas_name = args.atlas_name or man["name"]
    img = np.asarray(Image.open(args.atlas).convert("RGBA"))

    def tile(idx):
        r, c = divmod(idx, cols)
        return img[r * ts:(r + 1) * ts, c * ts:(c + 1) * ts]

    N = len(man["tiles"])
    means = np.stack([tile(i)[..., :3].reshape(-1, 3).mean(0) for i in range(N)])
    # Water = the bluest tile (max B-minus-R); land reference = the least blue.
    bscore = means[:, 2] - means[:, 0]
    water_rgb = tile(int(np.argmax(bscore)))[..., :3].reshape(-1, 3).mean(0)
    land_rgb = tile(int(np.argmin(bscore)))[..., :3].reshape(-1, 3).mean(0)

    # Water is teal/blue: blue clearly dominates red and is reasonably bright. An
    # absolute gate (not nearest-of-two) is essential — near-black tiles (canopy,
    # cliff shadow) are numerically "nearer" teal than tan and would false-positive.
    blue_margin = max(20.0, (water_rgb[2] - water_rgb[0]) * 0.4)
    blue_min = max(60.0, water_rgb[2] * 0.5)

    def wmask(t):
        p = t[..., :3].astype(float)
        return ((p[..., 2] - p[..., 0]) > blue_margin) & (p[..., 2] > blue_min)

    depth = max(2, ts // 12)
    lo, hi = int(ts * 0.34), int(ts * 0.66)

    classified = {}
    for idx in range(N):
        t = tile(idx); m = wmask(t)
        if m[lo:hi, lo:hi].mean() < args.interior:
            continue  # not a water-bodied tile
        frac = {"N": m[:depth, lo:hi].mean(), "S": m[-depth:, lo:hi].mean(),
                "W": m[lo:hi, :depth].mean(), "E": m[lo:hi, -depth:].mean()}
        bm = 0
        for e, b in BIT.items():
            if frac[e] >= 0.5:
                bm |= b
        # Clean shore tile = decisive edges (open edges very wet, shore edges very dry).
        on = [frac[e] for e in BIT if bm & BIT[e]]
        off = [frac[e] for e in BIT if not bm & BIT[e]]
        score = (np.mean(on) if on else 0.5) - (np.mean(off) if off else 0.0)
        classified.setdefault(bm, []).append({"index": idx, "score": round(float(score), 3)})

    for bm in classified:
        classified[bm].sort(key=lambda c: -c["score"])

    fill_idx = classified.get(15, [{"index": 0}])[0]["index"]
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

    water_set = {
        "group": "Water", "id": "water", "label": "\U0001F4A7 Water",
        "atlas": atlas_name, "role": args.role, "blocked": True,
        "paintBitmask": 15, "tiles": tiles, "candidates": candidates,
        "fallbackBitmasks": fallbacks,
    }

    # Merge into the existing blobset, replacing any prior water set, keeping the rest.
    if os.path.exists(args.out):
        doc = json.load(open(args.out))
    else:
        doc = {"schema": "tib/stage-blobset@1", "generatedBy": "tools/classify-*-blobset.py",
               "note": "Blob autotile sets. `tiles` maps the N|E|S|W bitmask (N=1 E=2 S=4 W=8) "
                       "to an atlas index; hand-edit to re-point. See docs/editor-autotile.md.",
               "sets": []}
    doc["sets"] = [s for s in doc.get("sets", []) if s.get("id") != "water"] + [water_set]
    json.dump(doc, open(args.out, "w"), indent=2)
    open(args.out, "a").write("\n")

    print(f"water tiles: {len(sum(classified.values(), []))} water-bodied, "
          f"covered {16 - len(fallbacks)}/16 configs")
    print(f"water_rgb={water_rgb.astype(int)} land_rgb={land_rgb.astype(int)}")
    for bm in range(16):
        tag = "  <fallback>" if bm in fallbacks else ""
        print(f"  bm={bm:2d} ({bm:04b}) {NAMES[bm]:>11}: {atlas_name}:{tiles[str(bm)]}"
              f"  alts={candidates[str(bm)][:5]}{tag}")
    print(f"merged 'water' set into {args.out} (sets now: {[s['id'] for s in doc['sets']]})")


if __name__ == "__main__":
    main()
