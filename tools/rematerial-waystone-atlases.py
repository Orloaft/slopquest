#!/usr/bin/env python3
"""Generate Waystone-local grass and packed-dirt fills for terrain restyle.

Waystone reuses the approved Northwood tuft Wang atlases for water and shore
continuity, but keeps town identity through local grass/dirt variants used by
tools/build-waystone-from-authored.ts.

Run: python3 tools/rematerial-waystone-atlases.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FILLS = ROOT / "assetsources/curated/fills"
ARTIFACTS = ROOT / "artifacts/terrain-restyle/waystone"
TS = 32

spec_cands = importlib.util.spec_from_file_location("cands", ROOT / "tools/make-terrain-fill-candidates.py")
cands = importlib.util.module_from_spec(spec_cands)
spec_cands.loader.exec_module(cands)  # type: ignore[union-attr]

spec_norm = importlib.util.spec_from_file_location("norm", ROOT / "tools/normalize-terrain-fill.py")
norm = importlib.util.module_from_spec(spec_norm)
spec_norm.loader.exec_module(norm)  # type: ignore[union-attr]

SEEDS = {
    "grass": [270, 281, 292, 303],
    "dirt": [371, 382, 393, 404],
}
RAMP_FOR = {
    "grass": norm.DEFAULT_RAMPS["grass"],
    "dirt": norm.DEFAULT_RAMPS["road"],
}


def tiled(fill: Image.Image, n: int = 4, zoom: int = 2) -> Image.Image:
    out = Image.new("RGB", (TS * n, TS * n))
    for y in range(n):
        for x in range(n):
            out.paste(fill.convert("RGB"), (x * TS, y * TS))
    return out.resize((out.width * zoom, out.height * zoom), Image.Resampling.NEAREST)


def label(img: Image.Image, xy: tuple[int, int], text: str) -> None:
    d = ImageDraw.Draw(img)
    d.text((xy[0] + 1, xy[1] + 1), text, fill=(0, 0, 0))
    d.text(xy, text, fill=(235, 235, 235))


def load_sprite(path: Path, width: int) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    h = max(1, round(width * im.height / im.width))
    return im.resize((width, h), Image.Resampling.LANCZOS)


def torus_noise(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = rng.random((TS, TS))
    for _ in range(6):
        n = sum(np.roll(np.roll(n, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9.0
    return (n - n.min()) / max(n.max() - n.min(), 1e-9)


def scatter(rng: np.random.Generator, count: int) -> list[tuple[int, int]]:
    pts: list[tuple[int, int]] = []
    while len(pts) < count:
        x, y = int(rng.integers(0, TS)), int(rng.integers(0, TS))
        if all((min(abs(x - px), TS - abs(x - px)) ** 2 + min(abs(y - py), TS - abs(y - py)) ** 2) > 49 for px, py in pts):
            pts.append((x, y))
    return pts


def px(a: np.ndarray, x: int, y: int, color: tuple[int, int, int]) -> None:
    a[y % TS, x % TS] = color


def waystone_grass(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = [norm.hex_rgb(c) for c in RAMP_FOR["grass"]]
    rng = np.random.default_rng(seed)
    a = np.zeros((TS, TS, 3), np.uint8)
    a[:, :] = base

    n = torus_noise(seed + 7)
    lo = tuple(int(v * 0.94) for v in base)
    mask = n < np.quantile(n, 0.36)
    neigh = sum(np.roll(np.roll(mask, dy, 0), dx, 1) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    a[mask & (neigh > 0)] = lo

    for x, y in scatter(rng, 5):
        for dx, dy in [(0, 0), (1, 0), (2, 0), (3, 0), (1, 1), (2, 1)]:
            px(a, x + dx, y + dy, dark2)
        for dx, dy in [(0, -1), (1, -1), (1, -2), (2, -1), (2, -2), (3, -1)]:
            px(a, x + dx, y + dy, dark)
        for dx, dy in [(0, -2), (1, -3), (2, -3), (3, -2)]:
            px(a, x + dx, y + dy, light)
        for dx, dy in [(1, -4), (2, -4)]:
            px(a, x + dx, y + dy, bright)
    return Image.fromarray(a)


def first_enemy_frame() -> Image.Image:
    sheet = Image.open(ROOT / "public/reach-vole-sheet.png").convert("RGBA")
    fw = sheet.width // 4
    fh = sheet.height // 4
    return sheet.crop((0, 2 * fh, fw, 3 * fh)).resize((48, 48), Image.Resampling.NEAREST)


def make_harmony(fills: dict[str, list[Image.Image]]) -> None:
    cell_w, cell_h = 256, 210
    sheet = Image.new("RGB", (2 * cell_w, cell_h), (18, 22, 27))
    props = [
        load_sprite(ROOT / "assetsources/curated/bespoke/fantasy-village-assets-v1/tower-waystone.png", 70),
        load_sprite(ROOT / "public/sprites/nw/obj_039.png", 48),
        load_sprite(ROOT / "public/sprites/nw/obj_070.png", 32),
        load_sprite(ROOT / "assetsources/curated/bespoke/fantasy-village-assets-v1/cow_left.png", 46),
    ]
    enemy = first_enemy_frame()
    for col, material in enumerate(("grass", "dirt")):
        bg = tiled(fills[material][0], n=4, zoom=2).convert("RGBA")
        canvas = Image.new("RGBA", (cell_w, cell_h), (18, 22, 27, 255))
        canvas.alpha_composite(bg.crop((0, 0, cell_w, 160)), (0, 28))
        for i, prop in enumerate(props):
            x = 24 + i * 54
            y = 134 - prop.height
            shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(shadow)
            d.ellipse((x + 3, y + prop.height - 9, x + prop.width - 3, y + prop.height + 5), fill=(12, 18, 9, 80))
            canvas.alpha_composite(shadow)
            canvas.alpha_composite(prop, (x, y))
        canvas.alpha_composite(enemy, (186, 106))
        label(canvas, (8, 8), f"waystone {material} + route/northwood props + reach vole")
        sheet.paste(canvas.convert("RGB"), (col * cell_w, 0))
    sheet.save(ARTIFACTS / "waystone-harmony-fills-props-reach-vole.png")


def make_fill_sheet(fills: dict[str, list[Image.Image]]) -> None:
    sheet = Image.new("RGB", (4 * 136, 2 * 286), (18, 22, 27))
    for row, material in enumerate(("grass", "dirt")):
        for col, fill in enumerate(fills[material]):
            tile = tiled(fill)
            x, y = col * 136, row * 286
            sheet.paste(tile, (x, y + 24))
            label(sheet, (x + 4, y + 4), f"waystone {material} v{col}")
    sheet.save(ARTIFACTS / "waystone-fill-variants.png")


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    reports: dict[str, dict] = {}
    fills: dict[str, list[Image.Image]] = {"grass": [], "dirt": []}
    for material, seeds in SEEDS.items():
        ramp_hex = RAMP_FOR[material]
        ramp = [norm.hex_rgb(c) for c in ramp_hex]
        for i, seed in enumerate(seeds):
            recipe_material = "road" if material == "dirt" else "route-grass"
            im = cands.cand_tuft("road", seed=seed) if material == "dirt" else waystone_grass(seed)
            out = FILLS / f"waystone-{material}-v{i}.png"
            im.save(out)
            gates = norm.gate_report(im, ramp)
            report = {"src": str(out), "material": material, "recipe": f"cand_tuft/{recipe_material}", "ramp": ramp_hex, "seed": seed, "gates": gates}
            reports[f"waystone-{material}-v{i}"] = report
            (ARTIFACTS / f"waystone-{material}-v{i}-gate-report.json").write_text(json.dumps(report, indent=2))
            fills[material].append(im)
            print(f"{out}: {'PASS' if gates['all_pass'] else 'FAIL'}")
    (ARTIFACTS / "waystone-fill-gate-summary.json").write_text(json.dumps(reports, indent=2))
    make_fill_sheet(fills)
    make_harmony(fills)


if __name__ == "__main__":
    main()
