#!/usr/bin/env python3
"""Slice the M3 image-gen contact sheets into engine-ready assets.

These are diffusion renders (high-res, ~184k colors), NOT pixel-exact grids, so the
cell rects are PROFILED from the magenta #FF00FF gutters rather than hardcoded -- the
same approach used for the cliff sheet (commit 8446136). Ground cells downscale to the
engine's 32x32; props are magenta-keyed, cropped to content bbox, and scaled down.

Outputs:
  assetsources/curated/sliced/cracked-earth-v1.png                          16x1 ground atlas (512x32)
  assetsources/curated/bespoke/searing-canyon-m3-assets/sliced/<label>.png  8 props (RGBA, cropped)
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assetsources/curated/bespoke/searing-canyon-m3-assets")
GROUND_OUT = os.path.join(ROOT, "assetsources/curated/sliced/cracked-earth-v1.png")
PROP_DIR = os.path.join(SRC, "sliced")
PROP_LABELS = ["saguaro_lg", "saguaro_md", "saguaro_sm", "scrub_dead",
               "scrub_dry", "skull_pile", "scree_lg", "scree_sm"]
TS = 32
PROP_MAX = 96  # longest-side cap for prop sprites (native res; baker's dispW sets on-screen size)


def magenta_mask(arr):  # arr HxWx(3|4) uint8 -> bool HxW  (pure-magenta bg, for grid/gutter profiling)
    r, g, b = arr[..., 0].astype(int), arr[..., 1].astype(int), arr[..., 2].astype(int)
    return (r > 200) & (g < 90) & (b > 200)


def magenta_key_hsv(rgb_img):
    """Hue-based magenta detector for prop keying: targets the bright magenta hue band incl.
    near-magenta diffusion bleed, while sparing yellow grass / red scree / green cactus / bone
    (different hues) and dark brown/grey branches (magenta hue requires real saturation+value).
    Magenta hue in PIL's 0..255 H space ~= 212."""
    hsv = np.array(rgb_img.convert("HSV"))
    Hh, Ss, Vv = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # H band spans magenta toward red-magenta (~277deg..339deg) to catch bleed that skews red;
    # red scree (~0deg) and yellow grass (~50deg) sit well outside it.
    return (Hh >= 196) & (Hh <= 240) & (Ss > 80) & (Vv > 70)


def runs(active, min_len, merge_gap):
    """Contiguous True runs in a 1D bool array, merging gaps <= merge_gap, dropping len < min_len."""
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


def slice_ground():
    arr = np.array(Image.open(os.path.join(SRC, "cracked-earth-desert.png")).convert("RGBA"))
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
    atlas.save(GROUND_OUT)
    return atlas.size, leak, len(col_runs), len(row_runs)


def slice_props():
    arr = np.array(Image.open(os.path.join(SRC, "desert-props.png")).convert("RGBA"))
    H, W = arr.shape[:2]
    content = ~magenta_mask(arr)
    coln = content.sum(axis=0) / H                 # per-column content fraction (0..1)
    # Auto-tune the prop/gutter threshold: sweep from high to low and take the first level that
    # resolves exactly 8 prop blobs (merge_gap bridges internal sparse columns within one prop;
    # min_len drops stray specks). Diffusion gutters aren't exactly empty, so no fixed cut works.
    bands, chosen = [], None
    for T in np.linspace(0.30, 0.02, 57):
        cand = runs(coln > T, min_len=W // 50, merge_gap=W // 110)
        if len(cand) == 8:
            bands, chosen = cand, T
            break
    print(f"  [props] threshold={chosen:.3f} -> {len(bands)} bands: {[(int(a), int(b)) for a, b in bands]}")
    assert len(bands) == 8, f"expected 8 props, got {len(bands)} bands (sweep failed)"
    # strip the top label strip: first full-width content row-run = the labels, separated from the
    # bottom-anchored props by a magenta band. Excluding it keeps labels out of each prop's bbox.
    row_runs = runs(content.sum(axis=1) > W * 0.01, min_len=H // 100, merge_gap=5)
    cutoff = (row_runs[0][1] + 4) if row_runs else 0
    print(f"  [props] label strip ends y={row_runs[0][1] if row_runs else 0}, prop crop starts y={cutoff}")
    os.makedirs(PROP_DIR, exist_ok=True)
    src = Image.fromarray(arr)
    dims = {}
    for label, (x0, x1) in zip(PROP_LABELS, bands):
        sub = src.crop((x0, cutoff, x1 + 1, H)).convert("RGBA")
        a = np.array(sub)
        a[magenta_key_hsv(Image.fromarray(a).convert("RGB"))] = (0, 0, 0, 0)   # hue-key magenta -> transparent
        keyed = Image.fromarray(a)
        bbox = keyed.getbbox()
        keyed = keyed.crop(bbox)                        # tighten to content
        if max(keyed.size) > PROP_MAX:                  # downscale render to native sprite res
            s = PROP_MAX / max(keyed.size)
            # premultiplied resize (RGBa) so transparent pixels don't bleed a dark fringe into edges
            keyed = keyed.convert("RGBa").resize((max(1, round(keyed.width * s)), max(1, round(keyed.height * s))), Image.LANCZOS).convert("RGBA")
        keyed.save(os.path.join(PROP_DIR, f"{label}.png"))
        dims[label] = keyed.size
    return dims


if __name__ == "__main__":
    (gw, gh), leak, nc, nr = slice_ground()
    print(f"ground: profiled {nc}x{nr} grid -> {gw}x{gh} cracked-earth-v1.png (magenta leak: {leak} px)")
    for label, size in slice_props().items():
        print(f"  prop {label}: {size[0]}x{size[1]}")
