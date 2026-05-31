#!/usr/bin/env python3
"""Generate 64x64 ore-chunk item icons, one per mining tier.

Each icon is a rocky chunk (dark grey base) studded with colour-coded ore flecks
so the copper->adamant ladder reads at a glance in the inventory. Deterministic
(seeded per kind) so re-runs are byte-stable. Output: public/icons/item-<id>.png
matching each ore item's iconUrl.
"""
import os
import random

from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
SIZE = 64

# id -> (fleck colour, highlight colour). Rock base is shared dark grey.
ORES = {
    "item-copper-ore.png": ((184, 115, 51), (224, 160, 92)),
    "item-tin-ore.png": ((176, 176, 184), (214, 214, 222)),
    "item-iron-ore.png": ((120, 92, 78), (170, 138, 120)),
    "item-coal.png": ((38, 38, 42), (96, 96, 104)),
    "item-silver-ore.png": ((200, 205, 212), (240, 244, 250)),
    "item-gold-ore.png": ((212, 175, 55), (255, 226, 120)),
    "item-mithril-ore.png": ((74, 111, 165), (126, 168, 224)),
    "item-adamant-ore.png": ((63, 125, 90), (110, 184, 142)),
}

ROCK = (74, 72, 70)
ROCK_TOP = (104, 101, 98)
OUTLINE = (28, 27, 26)


def chunk_polygon(rng):
    """An irregular rounded chunk centred in the tile."""
    cx, cy, r = 32, 34, 22
    pts = []
    steps = 9
    for i in range(steps):
        ang = (i / steps) * 6.28318
        rad = r * (0.78 + rng.random() * 0.32)
        pts.append((cx + rad * _cos(ang), cy + rad * _sin(ang) * 0.92))
    return pts


def _cos(a):
    import math

    return math.cos(a)


def _sin(a):
    import math

    return math.sin(a)


def make_icon(path, fleck, highlight):
    rng = random.Random(hash(path) & 0xFFFFFFFF)
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    poly = chunk_polygon(rng)
    d.polygon(poly, fill=ROCK, outline=OUTLINE)

    # Top-left facet: a lighter wedge for a bit of 3D read.
    facet = [poly[0], poly[1], poly[2], (32, 30)]
    d.polygon(facet, fill=ROCK_TOP)

    # Ore flecks: small bright crystals scattered over the rock face.
    for _ in range(7):
        fx = 20 + rng.randint(0, 24)
        fy = 22 + rng.randint(0, 22)
        s = rng.randint(3, 6)
        d.polygon(
            [(fx, fy - s), (fx + s, fy), (fx, fy + s), (fx - s, fy)],
            fill=fleck,
            outline=OUTLINE,
        )
        d.point((fx - 1, fy - 1), fill=highlight)
        d.point((fx, fy - 1), fill=highlight)

    img.save(path)
    return path


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, (fleck, highlight) in ORES.items():
        out = os.path.normpath(os.path.join(OUT_DIR, name))
        make_icon(out, fleck, highlight)
        print("wrote", out)


if __name__ == "__main__":
    main()
