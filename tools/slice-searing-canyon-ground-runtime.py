#!/usr/bin/env python3
"""Slice the M3 painterly cracked-earth contact sheet into a HIGH-RES runtime ground
atlas for the LIVE (hand-authored) Searing Badlands floor 6.

Same magenta-gutter grid profiling as tools/slice-searing-canyon-m3.py, but emits
72x72 tiles (vs the baker's 32x32) so makeTileTexture's inset/overlap can hide seams
and the ground stays crisp when the camera zooms in. Output is consumed directly by
the engine (src/main.ts preload), NOT by the asset-forge baker.

Output: public/tilesets/searing-canyon-ground.png  (16x1 strip, 1152x72)
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assetsources/curated/bespoke/searing-canyon-m3-assets/cracked-earth-desert.png")
OUT = os.path.join(ROOT, "public/tilesets/searing-canyon-ground.png")
TS = 72


def magenta_mask(arr):
    r, g, b = arr[..., 0].astype(int), arr[..., 1].astype(int), arr[..., 2].astype(int)
    return (r > 200) & (g < 90) & (b > 200)


def runs(active, min_len, merge_gap):
    idx = np.where(active)[0]
    if len(idx) == 0:
        return []
    out, s, p = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - p <= merge_gap:
            p = i
            continue
        out.append((s, p)); s = i; p = i
    out.append((s, p))
    return [(a, b) for a, b in out if b - a + 1 >= min_len]


def main():
    arr = np.array(Image.open(SRC).convert("RGBA"))
    H, W = arr.shape[:2]
    content = ~magenta_mask(arr)
    col_runs = runs(content.sum(axis=0) > H * 0.2, min_len=W // 12, merge_gap=4)
    row_runs = runs(content.sum(axis=1) > W * 0.2, min_len=H // 12, merge_gap=4)
    assert len(col_runs) == 4 and len(row_runs) == 4, f"expected 4x4 grid, got {len(col_runs)}x{len(row_runs)}"
    atlas = Image.new("RGBA", (16 * TS, TS))
    src = Image.fromarray(arr)
    for ri, (y0, y1) in enumerate(row_runs):
        for ci, (x0, x1) in enumerate(col_runs):
            tile = src.crop((x0, y0, x1 + 1, y1 + 1)).resize((TS, TS), Image.LANCZOS)
            atlas.paste(tile.convert("RGBA"), ((ri * 4 + ci) * TS, 0))
    leak = int(magenta_mask(np.array(atlas)).sum())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    atlas.save(OUT)
    print(f"ground: 4x4 grid -> {atlas.size[0]}x{atlas.size[1]} searing-canyon-ground.png (magenta leak: {leak} px)")


if __name__ == "__main__":
    main()
