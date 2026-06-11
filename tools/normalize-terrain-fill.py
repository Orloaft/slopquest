#!/usr/bin/env python3
"""Normalize any source texture (imagen output, photo-ish swatch, painterly tile)
into bible-compliant seamless terrain fills + a mechanical gate report.

This is the mandatory pass from docs/terrain-style-bible.md: raw imagen output
never ships as a terrain tile — it goes through here first.

Pipeline per variant:
  1. crop a region of the source (different region per variant) and area-downscale to 32px
  2. luminance-map onto the material's 5-color ramp (mid-heavy: ground stays quiet)
  3. cluster pass: wrap-aware 3x3 majority vote (kills single-pixel speckle, seam-safe)
  4. seam enforcement: the majority vote wraps, and gates verify the tile on a torus

Gates (fail any -> nonzero exit): color count <= 16, ramp adherence >= 95%,
isolated-pixel fraction <= 2%, seamless (wrap-shifted tile has no seam-line outliers).

Usage:
  python3 tools/normalize-terrain-fill.py --src <image> --material grass \
      [--ramp "#426212,#557916,#698f1c,#769e23,#86b02e"] [--variants 3] \
      [--out assetsources/curated/normalized] [--name northwood-grass]

Writes <name>-v<N>.png (32px fills), <name>-preview.png (tiled 4x4 contact),
<name>-gate-report.json. Prints PASS/FAIL per gate.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

TS = 32

DEFAULT_RAMPS = {
    "grass": ["#426212", "#557916", "#698f1c", "#769e23", "#86b02e"],
    "road": ["#a06a22", "#c4882c", "#e3a036", "#edb14d", "#f5c168"],
    "water": ["#04506e", "#066382", "#087595", "#1587a6", "#2f9fb8"],
}


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.strip().lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def majority_wrap(idx: np.ndarray, passes: int = 2) -> np.ndarray:
    """3x3 majority vote on ramp indices with torus wrap (seam-safe clustering)."""
    n_levels = int(idx.max()) + 1
    for _ in range(passes):
        votes = np.zeros((n_levels,) + idx.shape, np.uint8)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                rolled = np.roll(np.roll(idx, dy, 0), dx, 1)
                for lv in range(n_levels):
                    votes[lv] += rolled == lv
        idx = votes.argmax(axis=0)
    return idx


def normalize(src: Image.Image, ramp: list[tuple[int, int, int]], region: int) -> Image.Image:
    w, h = src.size
    # pick a deterministic region per variant index; downscale to 32px
    side = min(w, h)
    crop_side = max(TS, int(side * 0.55))
    xs = [0, max(0, w - crop_side), (w - crop_side) // 2, 0, max(0, w - crop_side)]
    ys = [0, max(0, h - crop_side), (h - crop_side) // 2, max(0, h - crop_side), 0]
    i = region % len(xs)
    tile = src.crop((xs[i], ys[i], xs[i] + crop_side, ys[i] + crop_side)).convert("RGB")
    tile = tile.resize((TS, TS), Image.LANCZOS)

    # luminance -> mid-heavy ramp buckets (quiet base, sparse extremes)
    a = np.asarray(tile, np.float32)
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    cuts = np.quantile(lum, [0.06, 0.26, 0.82, 0.96])
    idx = np.digitize(lum, cuts)
    idx = majority_wrap(idx)
    out = np.zeros((TS, TS, 3), np.uint8)
    for lv, c in enumerate(ramp):
        out[idx == lv] = c
    return Image.fromarray(out)


def gate_report(im: Image.Image, ramp: list[tuple[int, int, int]]) -> dict:
    a = np.asarray(im.convert("RGB"))
    colors = {tuple(c) for c in a.reshape(-1, 3)}
    n_colors = len(colors)

    ramp_arr = np.array(ramp, np.int16)
    dists = np.min(((a[:, :, None, :].astype(np.int16) - ramp_arr[None, None, :, :]) ** 2).sum(-1), axis=2)
    ramp_adherence = float((dists <= 24**2).mean())

    # isolated pixels: no 4-neighbour (torus) shares the pixel's color
    same = np.zeros(a.shape[:2], bool)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        same |= (np.roll(np.roll(a, dy, 0), dx, 1) == a).all(-1)
    isolated = float((~same).mean())

    # seam check: tile 2x2 then diff across the join lines (wrap continuity proxy):
    # cluster sizes at row/col 0 boundaries should look like interior boundaries
    edge_change = float((np.roll(a, 1, 0) != a).any(-1)[0].mean() + (np.roll(a, 1, 1) != a).any(-1)[:, 0].mean()) / 2
    interior_change = float((np.roll(a, 1, 0) != a).any(-1)[1:].mean() + (np.roll(a, 1, 1) != a).any(-1)[:, 1:].mean()) / 2
    seam_ratio = edge_change / max(interior_change, 1e-6)

    gates = {
        "color_count": {"value": n_colors, "limit": 16, "pass": n_colors <= 16},
        "ramp_adherence": {"value": round(ramp_adherence, 4), "limit": 0.95, "pass": ramp_adherence >= 0.95},
        "isolated_pixels": {"value": round(isolated, 4), "limit": 0.02, "pass": isolated <= 0.02},
        "seamless": {"value": round(seam_ratio, 3), "limit": 1.6, "pass": seam_ratio <= 1.6},
    }
    gates["all_pass"] = all(g["pass"] for g in gates.values() if isinstance(g, dict))
    return gates


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src", required=True)
    p.add_argument("--material", required=True)
    p.add_argument("--ramp", help="comma-separated 5 hex colors dark->light (default: material ramp)")
    p.add_argument("--variants", type=int, default=3)
    p.add_argument("--out", default="assetsources/curated/normalized")
    p.add_argument("--name")
    args = p.parse_args()

    ramp_hex = args.ramp.split(",") if args.ramp else DEFAULT_RAMPS.get(args.material)
    if not ramp_hex:
        sys.exit(f"no default ramp for material '{args.material}' — pass --ramp")
    ramp = [hex_rgb(c) for c in ramp_hex]
    name = args.name or f"{args.material}"
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    src = Image.open(args.src)
    report = {"src": args.src, "material": args.material, "ramp": ramp_hex, "variants": {}}
    previews = []
    ok = True
    for v in range(args.variants):
        fill = normalize(src, ramp, region=v)
        gates = gate_report(fill, ramp)
        report["variants"][f"v{v}"] = gates
        ok &= gates["all_pass"]
        fill.save(out_dir / f"{name}-v{v}.png")
        big = Image.new("RGB", (TS * 4, TS * 4))
        for j in range(4):
            for i in range(4):
                big.paste(fill, (i * TS, j * TS))
        previews.append(big.resize((TS * 8, TS * 8), Image.NEAREST))
        status = "PASS" if gates["all_pass"] else "FAIL"
        print(f"{name}-v{v}: {status}  " + "  ".join(f"{k}={g['value']}" for k, g in gates.items() if isinstance(g, dict)))

    sheet = Image.new("RGB", (sum(p.width + 8 for p in previews), max(p.height for p in previews)), (18, 22, 27))
    x = 0
    for pv in previews:
        sheet.paste(pv, (x, 0))
        x += pv.width + 8
    sheet.save(out_dir / f"{name}-preview.png")
    (out_dir / f"{name}-gate-report.json").write_text(json.dumps(report, indent=2))
    print(f"wrote {out_dir}/{name}-v*.png, {name}-preview.png, {name}-gate-report.json")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
