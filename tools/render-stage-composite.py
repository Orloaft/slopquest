#!/usr/bin/env python3
"""Offline faithful composite of an asset-forge stage: tile layers + depth-sorted
sprite objects (+ optional contact shadows). Used for before/after art review
without needing the game server.

Usage:
  python3 tools/render-stage-composite.py --stage <stage.json> --atlas <atlas.png> \
      [--crop x,y,w,h (tiles)] [--zoom 2] [--shadows] --out out.png

Sprite keys spriteNw<NNN> resolve to public/sprites/nw/obj_<NNN>.png; objects are
bottom-center anchored at (x,y) tile coords with w/h in game pixels (1 tile = 32).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TS = 32
ATLAS_FILE = {
    "townTiles": "assetsources/towntiles.png",
    "beachTiles": "public/beach-tiles.png",
    "graveyardTiles": "public/graveyardtiles.png",
    "northwoodTreeSheet": "assetsources/curated/bespoke/northwood-trees-v1/northwood-trees-source-alpha.png",
}


def is_magenta_key(r: int, g: int, b: int) -> bool:
    if r > 95 and b > 90 and g < 135 and abs(r - b) < 95 and r > g * 1.35 and b > g * 1.25:
        return True
    return g < 10 and r > 70 and b > 42 and r > b - 5 and r > g * 7 and b > g * 7


def load_sprite(o: dict, cache: dict[str, Image.Image]) -> Image.Image | None:
    src = o.get("src")
    cache_key = json.dumps(src, sort_keys=True) if src else o["key"]
    if cache_key in cache:
        return cache[cache_key]
    if src and src.get("file"):
        f = ROOT / src["file"]
        if not f.exists():
            return None
        spr = Image.open(f).convert("RGBA")
    elif src and src.get("atlas"):
        atlas_path = ATLAS_FILE.get(src["atlas"])
        if not atlas_path:
            return None
        f = ROOT / atlas_path
        if not f.exists():
            return None
        atlas = Image.open(f).convert("RGBA")
        spr = atlas.crop((src["sx"], src["sy"], src["sx"] + src["sw"], src["sy"] + src["sh"]))
    elif o["key"].startswith("spriteNw"):
        num = o["key"].replace("spriteNw", "")
        f = ROOT / f"public/sprites/nw/obj_{num}.png"
        if not f.exists():
            return None
        spr = Image.open(f).convert("RGBA")
    else:
        return None

    pix = spr.load()
    for y in range(spr.height):
        for x in range(spr.width):
            r, g, b, a = pix[x, y]
            if a and is_magenta_key(r, g, b):
                pix[x, y] = (r, g, b, 0)
    cache[cache_key] = spr
    return spr


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--stage", required=True)
    p.add_argument("--atlas", required=True)
    p.add_argument("--crop", help="x,y,w,h in tiles")
    p.add_argument("--zoom", type=int, default=2)
    p.add_argument("--shadows", action="store_true")
    p.add_argument("--out", required=True)
    args = p.parse_args()

    st = json.loads(Path(args.stage).read_text())
    at = Image.open(args.atlas).convert("RGBA")
    acols = at.width // TS
    rows = st["ascii"]["rows"]
    W, H = st["cols"], len(rows)
    img = Image.new("RGB", (W * TS, H * TS))
    img = img.convert("RGBA")
    for layer in st["layers"]:
        data = layer["data"]
        for r in range(H):
            for c in range(W):
                ref = data[r][c]
                if not ref:
                    continue
                i = int(ref.split(":")[1])
                x, y = (i % acols) * TS, (i // acols) * TS
                tile = at.crop((x, y, x + TS, y + TS)).convert("RGBA")
                img.alpha_composite(tile, (c * TS, r * TS))
    objs = sorted(st.get("objects", []), key=lambda o: o["y"])
    cache: dict[str, Image.Image] = {}
    if args.shadows:
        ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        for o in objs:
            cx, cy = o["x"] * TS, o["y"] * TS
            w = o["w"] * 0.8
            d.ellipse((cx - w / 2, cy - w / 8, cx + w / 2, cy + w / 8), fill=(15, 25, 8, 80))
        img.alpha_composite(ov)
    for o in objs:
        spr = load_sprite(o, cache)
        if spr is None:
            continue
        spr = spr.resize((int(o["w"]), int(o["h"])), Image.LANCZOS)
        px = int(o["x"] * TS - o["w"] / 2)
        py = int(o["y"] * TS - o["h"])
        img.alpha_composite(spr, (max(0, px), max(0, py)))

    if args.crop:
        x, y, w, h = (int(v) for v in args.crop.split(","))
        img = img.crop((x * TS, y * TS, (x + w) * TS, (y + h) * TS))
    if args.zoom != 1:
        img = img.resize((img.width * args.zoom, img.height * args.zoom), Image.NEAREST)
    img.convert("RGB").save(args.out)
    print(f"wrote {args.out} ({img.width}x{img.height})")


if __name__ == "__main__":
    main()
