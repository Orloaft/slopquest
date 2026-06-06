#!/usr/bin/env python3
"""Survey every exported stage for road / water blob-autotile viability.

Mirrors the classifiers' detection so the reported coverage is what you'd actually
get. Roads are found by manifest role (any role containing "road"); water by colour
(teal). Prints, per stage, how many of the 16 bitmask configs each terrain covers
and whether the key shapes (straights + corners + fill) are present — the bar for
"worth wiring up a blobset". Read-only; writes nothing.

  python3 tools/survey-blobsets.py
"""
import glob, json, os
import numpy as np
from PIL import Image

BIT = {"N": 1, "E": 2, "S": 4, "W": 8}
KEY = {5, 10, 3, 9, 12, 15}  # vert, horiz, two corners, fill — the backbone of a usable set


def tiles_of(atlas, manifest):
    man = json.load(open(manifest))
    ts, cols = man["tileSize"], man["columns"]
    img = np.asarray(Image.open(atlas).convert("RGBA"))
    def tile(i):
        r, c = divmod(i, cols)
        return img[r * ts:(r + 1) * ts, c * ts:(c + 1) * ts]
    return man, ts, cols, tile


def coverage(indices, tile, ts, mask_fn, interior=0.45):
    depth = max(2, ts // 12); lo, hi = int(ts * 0.34), int(ts * 0.66)
    cov = set(); n = 0
    for i in indices:
        t = tile(i); m = mask_fn(t)
        if m[lo:hi, lo:hi].mean() < interior:
            continue
        n += 1
        frac = {"N": m[:depth, lo:hi].mean(), "S": m[-depth:, lo:hi].mean(),
                "W": m[lo:hi, :depth].mean(), "E": m[lo:hi, -depth:].mean()}
        bm = sum(b for e, b in BIT.items() if frac[e] >= 0.5)
        cov.add(bm)
    return cov, n


def road_mask(tile, ts, road_idx):
    px = np.concatenate([tile(i)[..., :3].reshape(-1, 3) for i in road_idx]).astype(float)
    c = np.array([[200, 150, 40], [90, 140, 60]], float)
    for _ in range(25):
        a = np.linalg.norm(px[:, None, :] - c[None], axis=2).argmin(1)
        for k in range(2):
            if (a == k).any(): c[k] = px[a == k].mean(0)
    road, grass = (c[0], c[1]) if (c[0][0] - c[0][1]) > (c[1][0] - c[1][1]) else (c[1], c[0])
    def m(t):
        p = t[..., :3].astype(float)
        dr = np.linalg.norm(p - road, axis=-1); dg = np.linalg.norm(p - grass, axis=-1)
        return (dg / (dr + dg + 1e-6)) > 0.5
    return m


def water_mask(tile, N):
    means = np.stack([tile(i)[..., :3].reshape(-1, 3).mean(0) for i in range(N)])
    water = tile(int(np.argmax(means[:, 2] - means[:, 0])))[..., :3].reshape(-1, 3).mean(0)
    margin = max(20.0, (water[2] - water[0]) * 0.4); bmin = max(60.0, water[2] * 0.5)
    def m(t):
        p = t[..., :3].astype(float)
        return ((p[..., 2] - p[..., 0]) > margin) & (p[..., 2] > bmin)
    return m, water


def verdict(cov, n):
    if n < 6: return "—  (too few tiles)"
    has_key = len(cov & KEY)
    tag = "VIABLE" if (len(cov) >= 8 and has_key >= 4) else ("marginal" if len(cov) >= 5 else "no")
    return f"{len(cov):2d}/16 (key {has_key}/6, {n} tiles)  -> {tag}"


def main():
    rows = []
    for d in sorted(glob.glob("assetsources/asset-forge/exports/*/")):
        zone = os.path.basename(d.rstrip("/"))
        man_path = (glob.glob(d + "*.tileset.json") or [None])[0]
        img_path = (glob.glob(f"public/tilesets/{zone}/*.png") or [None])[0]
        if not man_path or not img_path:
            continue
        man, ts, cols, tile = tiles_of(img_path, man_path)
        N = len(man["tiles"])
        roles = {}
        for t in man["tiles"]:
            roles.setdefault(t["role"], []).append(t["index"])
        road_roles = [r for r in roles if "road" in r.lower()]
        road_idx = [i for r in road_roles for i in roles[r]]
        road_line = "no road tiles"
        if road_idx:
            cov, n = coverage(road_idx, tile, ts, road_mask(tile, ts, road_idx))
            road_line = verdict(cov, n)
        wmask, wrgb = water_mask(tile, N)
        wcov, wn = coverage(range(N), tile, ts, wmask)
        water_line = verdict(wcov, wn) + f"  water_rgb={wrgb.astype(int)}"
        rows.append((zone, road_line, water_line))

    w = max(len(r[0]) for r in rows)
    print(f"{'zone'.ljust(w)}  ROAD                                WATER")
    print("-" * (w + 80))
    for zone, road, water in rows:
        print(f"{zone.ljust(w)}  {road.ljust(34)}  {water}")


if __name__ == "__main__":
    main()
