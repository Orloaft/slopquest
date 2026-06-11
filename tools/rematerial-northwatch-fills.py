#!/usr/bin/env python3
"""Generate procedural Northwatch fills for the Tier-B northwatch re-material slice."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FILLS = ROOT / "assetsources/curated/fills"
ARTIFACTS = ROOT / "artifacts/terrain-restyle/northwatch"
TS = 32

spec_norm = importlib.util.spec_from_file_location("norm", ROOT / "tools/normalize-terrain-fill.py")
norm = importlib.util.module_from_spec(spec_norm)
spec_norm.loader.exec_module(norm)  # type: ignore[union-attr]

RAMPS = {
    "northwatch-grass": ["#2d431c", "#3e5d28", "#537637", "#698c49", "#82a55e"],
    "northwatch-road": ["#6f5130", "#927044", "#b58f5c", "#cfaa74", "#e3c38d"],
    "northwatch-wall": ["#3d4140", "#565b58", "#71756f", "#8c8d83", "#aaa89a"],
    "northwatch-moat": ["#173946", "#205566", "#2d7384", "#3d8d9b", "#58a9af"],
}
SEEDS = {
    "northwatch-grass": [5113, 5129, 5147],
    "northwatch-road": [5203],
    "northwatch-wall": [5309],
    "northwatch-moat": [5407],
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


def cleanup_isolates(a: np.ndarray, passes: int = 2) -> np.ndarray:
    out = a.copy()
    for _ in range(passes):
        same = np.zeros(out.shape[:2], bool)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            same |= (np.roll(np.roll(out, dy, 0), dx, 1) == out).all(-1)
        isolated = ~same
        if not isolated.any():
            break
        replacement = np.roll(out, 1, 1)
        out[isolated] = replacement[isolated]
    return out


def base_mottle(material: str, seed: int, low_q: float = 0.42) -> np.ndarray:
    _dark2, _dark, base, _light, _bright = hexes(material)
    a = np.zeros((TS, TS, 3), np.uint8)
    a[:, :] = base
    lo = tuple(int(v * 0.95) for v in base)
    n = torus_noise(seed + 17)
    mask = n < np.quantile(n, low_q)
    neigh = sum(np.roll(np.roll(mask, dy, 0), dx, 1) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    a[mask & (neigh > 0)] = lo
    return a


def grass_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, bright = hexes("northwatch-grass")
    rng = np.random.default_rng(seed)
    a = base_mottle("northwatch-grass", seed, 0.43)
    for x, y in scatter(rng, 7, 7):
        for dx, dy in ((0, 0), (1, 0), (3, 0), (1, 1), (2, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x + 1, y - 1, light)
        px(a, x + 2, y - 1, bright)
        px(a, x + 3, y - 1, bright)
        px(a, x + 3, y + 1, dark2)
    return Image.fromarray(cleanup_isolates(a))


def road_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("northwatch-road")
    rng = np.random.default_rng(seed)
    a = base_mottle("northwatch-road", seed, 0.38)
    for y in range(5, TS, 11):
        a[y, :] = dark
        a[(y - 1) % TS, :] = light
    for x in range(3, TS, 13):
        offset = 0 if (x // 13) % 2 == 0 else 6
        for y in range(offset, TS, 11):
            for yy in range(y, min(y + 5, TS)):
                px(a, x, yy, dark2)
                px(a, x + 1, yy, tuple(int(v * 0.97) for v in base))
    for x, y in scatter(rng, 5, 7):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x, y - 1, bright)
    return Image.fromarray(cleanup_isolates(a))


def wall_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("northwatch-wall")
    rng = np.random.default_rng(seed)
    a = base_mottle("northwatch-wall", seed, 0.45)
    for y in range(6, TS, 10):
        a[y, :] = dark2
        a[(y - 1) % TS, :] = light
    for x in range(4, TS, 12):
        for y in range(0, TS, 10):
            for yy in range(y + 1, min(y + 6, TS)):
                px(a, x, yy, dark)
    for x, y in scatter(rng, 6, 7):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x, y - 1, light)
        px(a, x + 1, y - 1, bright)
        px(a, x + 2, y - 1, bright)
        px(a, x + 1, y + 1, tuple(int(v * 0.96) for v in base))
    return Image.fromarray(cleanup_isolates(a))


def moat_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("northwatch-moat")
    rng = np.random.default_rng(seed)
    a = base_mottle("northwatch-moat", seed, 0.5)
    for y in (8, 20):
        for x in range(TS):
            px(a, x, y, tuple(int(v * 0.96) for v in dark))
            px(a, x, (y - 1) % TS, light)
    for x, y in scatter(rng, 4, 8):
        px(a, x, y, light)
        px(a, x + 1, y, bright)
        px(a, x + 2, y, light)
        px(a, x + 2, y - 1, bright)
        px(a, x + 1, y + 1, base)
        px(a, x + 2, y + 1, dark2)
    return Image.fromarray(cleanup_isolates(a))


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


def city_prop(box: tuple[int, int, int, int], width: int) -> Image.Image:
    atlas = Image.open(ROOT / "public/citytiles.png").convert("RGBA")
    spr = keyed(atlas.crop(box))
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.LANCZOS)


def first_frame(sheet_name: str, width: int = 54) -> Image.Image | None:
    path = ROOT / "public" / sheet_name
    if not path.exists():
        return None
    im = Image.open(path).convert("RGBA")
    fw, fh = im.width // 4, im.height // 4
    spr = keyed(im.crop((0, 2 * fh, fw, 3 * fh)))
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.NEAREST)


def make_sheets(fills: dict[str, list[Image.Image]]) -> None:
    materials = ["northwatch-grass", "northwatch-road", "northwatch-wall", "northwatch-moat"]
    sheet = Image.new("RGB", (4 * 136, 286), (18, 22, 25))
    for i, material in enumerate(materials):
        tile = tiled(fills[material][0])
        x = i * 136
        sheet.paste(tile, (x, 24))
        label(sheet, (x + 4, 4), material)
    sheet.save(ARTIFACTS / "northwatch-fill-variants.png")

    props = [
        city_prop((428, 306, 554, 442), 86),
        city_prop((834, 744, 904, 800), 58),
        city_prop((140, 358, 214, 432), 56),
    ]
    enemy = first_frame("guard-sheet.png", 54) or first_frame("reach-hen-sheet.png", 54)
    harmony = Image.new("RGB", (3 * 256, 210), (18, 22, 25))
    for col, material in enumerate(("northwatch-grass", "northwatch-road", "northwatch-wall")):
        bg = tiled(fills[material][0], n=4, zoom=2).convert("RGBA")
        canvas = Image.new("RGBA", (256, 210), (18, 22, 25, 255))
        canvas.alpha_composite(bg.crop((0, 0, 256, 160)), (0, 28))
        for i, prop in enumerate(props):
            x = 20 + i * 72
            y = 142 - prop.height
            shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(shadow)
            d.ellipse((x + 5, y + prop.height - 8, x + prop.width - 5, y + prop.height + 5), fill=(8, 10, 8, 82))
            canvas.alpha_composite(shadow)
            canvas.alpha_composite(prop, (x, y))
        if enemy:
            canvas.alpha_composite(enemy, (184, 108))
        label(canvas, (8, 8), f"{material} + city props")
        harmony.paste(canvas.convert("RGB"), (col * 256, 0))
    harmony.save(ARTIFACTS / "northwatch-harmony-fills-props.png")


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    makers = {
        "northwatch-grass": grass_fill,
        "northwatch-road": road_fill,
        "northwatch-wall": wall_fill,
        "northwatch-moat": moat_fill,
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
            report = {"src": str(out), "material": material, "recipe": "procedural/northwatch_tuft", "ramp": RAMPS[material], "seed": seed, "gates": gates}
            reports[name] = report
            (ARTIFACTS / f"{name}-gate-report.json").write_text(json.dumps(report, indent=2))
            fills[material].append(im)
            print(f"{out}: {'PASS' if gates['all_pass'] else 'FAIL'}")
    (ARTIFACTS / "northwatch-fill-gate-summary.json").write_text(json.dumps(reports, indent=2))
    make_sheets(fills)


if __name__ == "__main__":
    main()
