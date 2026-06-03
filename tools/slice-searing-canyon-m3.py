#!/usr/bin/env python3
"""Slice the M3 contact sheets into engine-ready assets.

Geometry is taken verbatim from tools/generate-searing-canyon-m3-assets.cjs
(GUTTER=8, LABEL_H=7, cell=32) -- no profiling, exact cell rects.

Outputs:
  assetsources/curated/sliced/cracked-earth-v1.png        16x1 ground atlas (512x32)
  assetsources/curated/bespoke/searing-canyon-m3-assets/sliced/<label>.png   8 props (magenta-keyed, cropped)
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assetsources/curated/bespoke/searing-canyon-m3-assets")
GROUND_OUT = os.path.join(ROOT, "assetsources/curated/sliced/cracked-earth-v1.png")
PROP_DIR = os.path.join(SRC, "sliced")
MAGENTA = (255, 0, 255)

# ---- ground: 4x4 matrix, cell x=c*40, y=r*47+7, 32x32 -> pack row-major into a 16x1 strip ----
def slice_ground():
    sheet = Image.open(os.path.join(SRC, "cracked-earth-desert.png")).convert("RGBA")
    atlas = Image.new("RGBA", (16 * 32, 32))
    for r in range(4):
        for c in range(4):
            x, y = c * 40, r * 47 + 7
            tile = sheet.crop((x, y, x + 32, y + 32))
            atlas.paste(tile, ((r * 4 + c) * 32, 0))
    # tiles are full-bleed opaque desert hardpan; assert no magenta leaked into content
    px = atlas.load()
    leak = sum(1 for j in range(32) for i in range(16 * 32) if px[i, j][:3] == MAGENTA)
    atlas.save(GROUND_OUT)
    return atlas.size, leak

# ---- props: single row, bottom-aligned content at y=103-h; magenta-key + crop to content bbox ----
PROPS = [  # (label, x, w, h)
    ("saguaro_lg", 0, 64, 96), ("saguaro_md", 72, 52, 80), ("saguaro_sm", 132, 40, 56),
    ("scrub_dead", 180, 40, 40), ("scrub_dry", 228, 40, 40), ("skull_pile", 276, 40, 36),
    ("scree_lg", 324, 40, 36), ("scree_sm", 372, 32, 28),
]
SHEET_H = 103

def key_and_crop(cell):
    cell = cell.convert("RGBA")
    px = cell.load()
    for j in range(cell.height):
        for i in range(cell.width):
            if px[i, j][:3] == MAGENTA:
                px[i, j] = (0, 0, 0, 0)
    return cell.crop(cell.getbbox())

def slice_props():
    sheet = Image.open(os.path.join(SRC, "desert-props.png")).convert("RGBA")
    os.makedirs(PROP_DIR, exist_ok=True)
    dims = {}
    for label, x, w, h in PROPS:
        cell = sheet.crop((x, SHEET_H - h, x + w, SHEET_H))
        cropped = key_and_crop(cell)
        cropped.save(os.path.join(PROP_DIR, f"{label}.png"))
        dims[label] = cropped.size
    return dims

if __name__ == "__main__":
    (gw, gh), leak = slice_ground()
    print(f"ground atlas {gw}x{gh} -> cracked-earth-v1.png (magenta leak: {leak} px)")
    for label, size in slice_props().items():
        print(f"  prop {label}: {size[0]}x{size[1]}")
