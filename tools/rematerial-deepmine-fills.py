#!/usr/bin/env python3
"""Generate procedural Deepdelve Mine fills for the Tier-B deepmine re-material slice."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FILLS = ROOT / "assetsources/curated/fills"
ARTIFACTS = ROOT / "artifacts/terrain-restyle/deepmine"
TS = 32

spec_norm = importlib.util.spec_from_file_location("norm", ROOT / "tools/normalize-terrain-fill.py")
norm = importlib.util.module_from_spec(spec_norm)
spec_norm.loader.exec_module(norm)  # type: ignore[union-attr]

RAMPS = {
    "deepmine-wall": ["#171614", "#25231f", "#36332d", "#4a453b", "#615949"],
    "deepmine-floor": ["#2b2924", "#3d3930", "#514b3f", "#686051", "#807768"],
    "deepmine-worn-dirt": ["#2c2118", "#433222", "#5a4129", "#745334", "#8f6841"],
    "deepmine-track-bed": ["#201f1d", "#302d28", "#443e35", "#5b5245", "#756a59"],
    "deepmine-ore-rock": ["#14191b", "#223033", "#33474a", "#496165", "#667d80"],
}
SEEDS = {
    "deepmine-wall": [4101],
    "deepmine-floor": [4203, 4217],
    "deepmine-worn-dirt": [4301],
    "deepmine-track-bed": [4407],
    "deepmine-ore-rock": [4500],
}


def hexes(name: str) -> list[tuple[int, int, int]]:
    return [norm.hex_rgb(c) for c in RAMPS[name]]


def torus_noise(seed: int, passes: int = 6) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = rng.random((TS, TS))
    for _ in range(passes):
        n = sum(np.roll(np.roll(n, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9.0
    return (n - n.min()) / max(n.max() - n.min(), 1e-9)


def scatter(rng: np.random.Generator, count: int, min_dist: int = 7) -> list[tuple[int, int]]:
    pts: list[tuple[int, int]] = []
    guard = 0
    while len(pts) < count and guard < 1200:
        guard += 1
        x, y = int(rng.integers(0, TS)), int(rng.integers(0, TS))
        if all((min(abs(x - px), TS - abs(x - px)) ** 2 + min(abs(y - py), TS - abs(y - py)) ** 2) >= min_dist * min_dist for px, py in pts):
            pts.append((x, y))
    return pts


def px(a: np.ndarray, x: int, y: int, color: tuple[int, int, int]) -> None:
    a[y % TS, x % TS] = color


def base_mottle(material: str, seed: int, low_q: float = 0.43) -> np.ndarray:
    _dark2, _dark, base, _light, _bright = hexes(material)
    a = np.zeros((TS, TS, 3), np.uint8)
    a[:, :] = base
    lo = tuple(int(v * 0.95) for v in base)
    n = torus_noise(seed + 17)
    mask = n < np.quantile(n, low_q)
    neigh = sum(np.roll(np.roll(mask, dy, 0), dx, 1) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    a[mask & (neigh > 0)] = lo
    return a


def wall_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, bright = hexes("deepmine-wall")
    rng = np.random.default_rng(seed)
    a = base_mottle("deepmine-wall", seed, 0.5)
    for x in range(2, TS, 9):
        a[:, x] = dark
    for y in range(5, TS, 10):
        a[y, :] = dark2
        a[(y - 1) % TS, :] = tuple(int(v * 0.96) for v in light)
    for x, y in scatter(rng, 5, 8):
        px(a, x, y, light)
        px(a, x + 1, y, light)
        px(a, x, y - 1, bright)
        px(a, x + 1, y + 1, dark2)
    return Image.fromarray(a)


def floor_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, _bright = hexes("deepmine-floor")
    rng = np.random.default_rng(seed)
    a = base_mottle("deepmine-floor", seed, 0.42)
    for x, y in scatter(rng, 8, 6):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x + 1, y + 1, dark2)
        px(a, x, y - 1, light)
    for x, y in scatter(rng, 3, 9):
        for dx in range(4):
            px(a, x + dx, y, dark)
        px(a, x, y - 1, light)
    return Image.fromarray(a)


def dirt_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, _bright = hexes("deepmine-worn-dirt")
    rng = np.random.default_rng(seed)
    a = base_mottle("deepmine-worn-dirt", seed, 0.47)
    for x, y in scatter(rng, 6, 7):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x, y + 1, dark2)
        px(a, x, y - 1, light)
    for x, y in scatter(rng, 4, 7):
        px(a, x, y, dark2)
    return Image.fromarray(a)


def track_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, _bright = hexes("deepmine-track-bed")
    rng = np.random.default_rng(seed)
    a = base_mottle("deepmine-track-bed", seed, 0.45)
    for y in (8, 9, 22, 23):
        a[y, :] = dark
    for y in (7, 21):
        a[y, :] = tuple(int(v * 0.97) for v in light)
    for x in range(1, TS, 8):
        for yy in (7, 8, 9, 21, 22, 23):
            px(a, x, yy, dark2)
            px(a, x + 1, yy, dark2)
    for x, y in scatter(rng, 4, 8):
        px(a, x, y, tuple(int(v * 0.94) for v in base))
        px(a, x + 1, y, dark)
        px(a, x, y - 1, light)
    return Image.fromarray(a)


def ore_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, bright = hexes("deepmine-ore-rock")
    rng = np.random.default_rng(seed)
    a = base_mottle("deepmine-ore-rock", seed, 0.52)
    for x, y in scatter(rng, 7, 6):
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x, y - 1, light)
        px(a, x + 1, y - 1, light)
        px(a, x + 2, y - 1, bright)
        px(a, x + 2, y, bright)
        px(a, x + 1, y + 2, dark2)
    for x, y in scatter(rng, 2, 9):
        px(a, x, y, bright)
        px(a, x + 1, y, bright)
        px(a, x, y + 1, light)
        px(a, x + 1, y + 1, light)
    return Image.fromarray(a)


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


def keyed(sprite: Image.Image) -> Image.Image:
    arr = np.array(sprite.convert("RGBA"))
    mag = (arr[:, :, 0] > 95) & (arr[:, :, 2] > 90) & (arr[:, :, 1] < 135) & (np.abs(arr[:, :, 0].astype(int) - arr[:, :, 2].astype(int)) < 95)
    arr[mag, 3] = 0
    return Image.fromarray(arr)


def first_frame(sheet_name: str, width: int = 54) -> Image.Image:
    im = Image.open(ROOT / "public" / sheet_name).convert("RGBA")
    fw, fh = im.width // 4, im.height // 4
    spr = keyed(im.crop((0, 2 * fh, fw, 3 * fh)))
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.NEAREST)


def ore_prop(sheet_name: str, width: int = 48) -> Image.Image:
    im = Image.open(ROOT / "public/sprites/resources" / sheet_name).convert("RGBA")
    return im.resize((width, round(width * im.height / im.width)), Image.Resampling.NEAREST)


def make_sheets(fills: dict[str, list[Image.Image]]) -> None:
    materials = ["deepmine-wall", "deepmine-floor", "deepmine-worn-dirt", "deepmine-track-bed", "deepmine-ore-rock"]
    sheet = Image.new("RGB", (3 * 136, 2 * 286), (12, 14, 18))
    for i, material in enumerate(materials):
        row, col = divmod(i, 3)
        tile = tiled(fills[material][0])
        x, y = col * 136, row * 286
        sheet.paste(tile, (x, y + 24))
        label(sheet, (x + 4, y + 4), material)
    sheet.save(ARTIFACTS / "deepmine-fill-variants.png")

    props = [
        ore_prop("ore-copper.png", 48),
        ore_prop("ore-iron.png", 50),
        ore_prop("ore-mithril.png", 50),
    ]
    enemy = first_frame("deepdelve-wight-sheet.png", 54)
    harmony = Image.new("RGB", (3 * 256, 210), (12, 14, 18))
    for col, material in enumerate(("deepmine-floor", "deepmine-track-bed", "deepmine-ore-rock")):
        bg = tiled(fills[material][0], n=4, zoom=2).convert("RGBA")
        canvas = Image.new("RGBA", (256, 210), (12, 14, 18, 255))
        canvas.alpha_composite(bg.crop((0, 0, 256, 160)), (0, 28))
        for i, prop in enumerate(props):
            x = 22 + i * 62
            y = 142 - prop.height
            shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(shadow)
            d.ellipse((x + 5, y + prop.height - 8, x + prop.width - 5, y + prop.height + 4), fill=(2, 5, 6, 96))
            canvas.alpha_composite(shadow)
            canvas.alpha_composite(prop, (x, y))
        canvas.alpha_composite(enemy, (184, 108))
        label(canvas, (8, 8), f"{material} + ore props + wight")
        harmony.paste(canvas.convert("RGB"), (col * 256, 0))
    harmony.save(ARTIFACTS / "deepmine-harmony-fills-props-deepdelve-wight.png")


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    makers = {
        "deepmine-wall": wall_fill,
        "deepmine-floor": floor_fill,
        "deepmine-worn-dirt": dirt_fill,
        "deepmine-track-bed": track_fill,
        "deepmine-ore-rock": ore_fill,
    }
    reports: dict[str, dict] = {}
    fills: dict[str, list[Image.Image]] = {}
    for material, seeds in SEEDS.items():
        fills[material] = []
        ramp = hexes(material)
        for i, seed in enumerate(seeds):
            im = makers[material](seed)
            suffix = f"-v{i}" if len(seeds) > 1 else ""
            name = f"{material}{suffix}"
            out = FILLS / f"{name}.png"
            im.save(out)
            gates = norm.gate_report(im, ramp)
            report = {"src": str(out), "material": material, "recipe": "procedural/deepmine_tuft", "ramp": RAMPS[material], "seed": seed, "gates": gates}
            reports[name] = report
            (ARTIFACTS / f"{name}-gate-report.json").write_text(json.dumps(report, indent=2))
            fills[material].append(im)
            print(f"{out}: {'PASS' if gates['all_pass'] else 'FAIL'}")
    (ARTIFACTS / "deepmine-fill-gate-summary.json").write_text(json.dumps(reports, indent=2))
    make_sheets(fills)


if __name__ == "__main__":
    main()
