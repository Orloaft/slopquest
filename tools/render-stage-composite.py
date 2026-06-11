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
    at = Image.open(args.atlas).convert("RGB")
    acols = at.width // TS
    rows = st["ascii"]["rows"]
    W, H = st["cols"], len(rows)
    base, fringe = st["layers"][0]["data"], st["layers"][1]["data"]

    img = Image.new("RGB", (W * TS, H * TS))
    for r in range(H):
        for c in range(W):
            ref = fringe[r][c] or base[r][c]
            if not ref:
                continue
            i = int(ref.split(":")[1])
            x, y = (i % acols) * TS, (i // acols) * TS
            img.paste(at.crop((x, y, x + TS, y + TS)), (c * TS, r * TS))

    img = img.convert("RGBA")
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
        key = o["key"]
        if key not in cache:
            num = key.replace("spriteNw", "")
            f = ROOT / f"public/sprites/nw/obj_{num}.png"
            spr = Image.open(f).convert("RGBA")
            cache[key] = spr
        spr = cache[key].resize((int(o["w"]), int(o["h"])), Image.LANCZOS)
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
