#!/usr/bin/env python3
"""Composite a top-down painted-relief highland from the real Northwood atlas tiles.
Usage: python3 tools/mock-highland.py <ascii_map_file> <out.png> [scale]
"""
import sys
from PIL import Image

ATLAS = "assetsources/asset-forge/exports/northwood/forest.png"
TS = 32
COLS = 24  # atlas columns

LEGEND = {
    'g': 576, 'n': 577, 'A': 578, 'B': 579, 'w': 580, 'e': 581,
    'c': 582, 'v': 583, 'b': 584, 'h': 585, 'i': 586,
    'j': 587, 'k': 588, 'l': 589, 'o': 590, 'p': 591, 'r': 592,
}

def tile(atlas, idx):
    c, r = idx % COLS, idx // COLS
    return atlas.crop((c*TS, r*TS, c*TS+TS, r*TS+TS))

def main():
    mapfile, out = sys.argv[1], sys.argv[2]
    scale = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    atlas = Image.open(ATLAS).convert("RGBA")
    rows = [ln.rstrip("\n") for ln in open(mapfile) if ln.strip("\n") != "" and not ln.startswith("#")]
    w = max(len(r) for r in rows)
    h = len(rows)
    canvas = Image.new("RGBA", (w*TS, h*TS), (0, 0, 0, 0))
    for y, line in enumerate(rows):
        line = line.ljust(w, 'g')
        for x, ch in enumerate(line):
            idx = LEGEND.get(ch, LEGEND['g'])
            canvas.alpha_composite(tile(atlas, idx), (x*TS, y*TS))
    if scale != 1:
        canvas = canvas.resize((w*TS*scale, h*TS*scale), Image.NEAREST)
    canvas.convert("RGB").save(out)
    print(f"wrote {out} ({canvas.size[0]}x{canvas.size[1]}) from {w}x{h} map")

if __name__ == "__main__":
    main()
