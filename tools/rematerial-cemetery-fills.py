#!/usr/bin/env python3
"""Generate procedural cemetery fills for the Tier-B cemetery re-material slice."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FILLS = ROOT / "assetsources/curated/fills"
ARTIFACTS = ROOT / "artifacts/terrain-restyle/cemetery"
TS = 32

spec_norm = importlib.util.spec_from_file_location("norm", ROOT / "tools/normalize-terrain-fill.py")
norm = importlib.util.module_from_spec(spec_norm)
spec_norm.loader.exec_module(norm)  # type: ignore[union-attr]

RAMPS = {
    "grave-grass": ["#263818", "#344d21", "#49682e", "#5d7c3d", "#748f50"],
    "grave-dirt": ["#282419", "#3a3322", "#4d422c", "#67583a", "#7d6d4d"],
    "grave-path": ["#302b28", "#453d38", "#5c5148", "#74675b", "#918371"],
    "grave-stone": ["#343633", "#4b4d48", "#63645d", "#7d7c72", "#99978a"],
    "dark-moss": ["#182412", "#26351a", "#354923", "#49602f", "#617a42"],
    "dead-ground": ["#2e2c25", "#413d33", "#585144", "#6f6655", "#887d68"],
}
SEEDS = {
    "grave-grass": [2101, 2113, 2129, 2141],
    "grave-dirt": [2203, 2213],
    "grave-path": [2309],
    "grave-stone": [2401],
    "dark-moss": [2503],
    "dead-ground": [2609],
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
    while len(pts) < count and guard < 1000:
        guard += 1
        x, y = int(rng.integers(0, TS)), int(rng.integers(0, TS))
        if all((min(abs(x - px), TS - abs(x - px)) ** 2 + min(abs(y - py), TS - abs(y - py)) ** 2) >= min_dist * min_dist for px, py in pts):
            pts.append((x, y))
    return pts


def px(a: np.ndarray, x: int, y: int, color: tuple[int, int, int]) -> None:
    a[y % TS, x % TS] = color


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
    dark2, dark, _base, light, bright = hexes("grave-grass")
    rng = np.random.default_rng(seed)
    a = base_mottle("grave-grass", seed, 0.44)
    for x, y in scatter(rng, 6, 7):
        for dx, dy in ((0, 0), (1, 0), (3, 0), (4, 0), (1, 1), (2, 1), (3, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x + 1, y - 1, light)
        px(a, x + 2, y - 1, light)
        px(a, x + 3, y - 1, bright)
        px(a, x + 4, y - 1, bright)
        px(a, x + 1, y + 2, dark2)
        px(a, x + 2, y + 2, dark2)
    return Image.fromarray(a)


def dirt_fill(seed: int, material: str = "grave-dirt") -> Image.Image:
    dark2, dark, _base, light, _bright = hexes(material)
    rng = np.random.default_rng(seed)
    a = base_mottle(material, seed, 0.46)
    for x, y in scatter(rng, 5, 7):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x + 1, y + 1, dark2)
        px(a, x, y - 1, light)
    for x, y in scatter(rng, 4, 6):
        px(a, x, y, dark2)
    return Image.fromarray(a)


def path_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, _bright = hexes("grave-path")
    rng = np.random.default_rng(seed)
    a = base_mottle("grave-path", seed, 0.43)
    for y in (7, 8, 21, 22):
        a[y, :] = tuple(int(v * 0.96) for v in base)
    for x, y in scatter(rng, 6, 7):
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x, y - 1, light)
        px(a, x + 1, y + 2, dark2)
    return Image.fromarray(a)


def stone_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, bright = hexes("grave-stone")
    rng = np.random.default_rng(seed)
    a = base_mottle("grave-stone", seed, 0.42)
    for x, y in scatter(rng, 7, 6):
        for dx, dy in ((0, 0), (1, 0), (2, 0), (1, 1), (2, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x, y - 1, light)
        px(a, x + 1, y - 1, light)
        px(a, x + 1, y - 1, bright)
        px(a, x + 2, y - 1, bright)
    for x in range(4, TS, 11):
        for y in range(0, TS, 9):
            px(a, x, y, dark2)
    return Image.fromarray(a)


def moss_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, bright = hexes("dark-moss")
    rng = np.random.default_rng(seed)
    a = base_mottle("dark-moss", seed, 0.5)
    for x, y in scatter(rng, 8, 6):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x, y + 1, dark2)
        px(a, x + 1, y - 1, light)
    for x, y in scatter(rng, 3, 8):
        px(a, x, y, bright)
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


def grave_prop(box: tuple[int, int, int, int], width: int) -> Image.Image:
    atlas = Image.open(ROOT / "public/graveyardtiles.png").convert("RGBA")
    spr = keyed(atlas.crop(box))
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.LANCZOS)


def first_frame(sheet_name: str, width: int = 54) -> Image.Image:
    im = Image.open(ROOT / "public" / sheet_name).convert("RGBA")
    fw, fh = im.width // 4, im.height // 4
    spr = keyed(im.crop((0, 2 * fh, fw, 3 * fh)))
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.NEAREST)


def make_sheets(fills: dict[str, list[Image.Image]]) -> None:
    materials = ["grave-grass", "grave-dirt", "grave-path", "grave-stone", "dark-moss", "dead-ground"]
    sheet = Image.new("RGB", (4 * 136, 2 * 286), (18, 22, 27))
    for i, material in enumerate(materials):
        row, col = divmod(i, 4)
        tile = tiled(fills[material][0])
        x, y = col * 136, row * 286
        sheet.paste(tile, (x, y + 24))
        label(sheet, (x + 4, y + 4), f"cemetery {material}")
    sheet.save(ARTIFACTS / "cemetery-fill-variants.png")

    props = [
        grave_prop((580, 360, 638, 438), 48),
        grave_prop((20, 552, 146, 618), 92),
        grave_prop((610, 378, 647, 443), 42),
    ]
    enemy = first_frame("grave-revenant-sheet.png", 54)
    harmony = Image.new("RGB", (3 * 256, 210), (18, 22, 27))
    for col, material in enumerate(("grave-grass", "grave-path", "grave-stone")):
        bg = tiled(fills[material][0], n=4, zoom=2).convert("RGBA")
        canvas = Image.new("RGBA", (256, 210), (18, 22, 27, 255))
        canvas.alpha_composite(bg.crop((0, 0, 256, 160)), (0, 28))
        for i, prop in enumerate(props):
            x = 20 + i * 66
            y = 140 - prop.height
            shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(shadow)
            d.ellipse((x + 5, y + prop.height - 9, x + prop.width - 5, y + prop.height + 5), fill=(8, 12, 7, 84))
            canvas.alpha_composite(shadow)
            canvas.alpha_composite(prop, (x, y))
        canvas.alpha_composite(enemy, (184, 110))
        label(canvas, (8, 8), f"cemetery {material} + props + revenant")
        harmony.paste(canvas.convert("RGB"), (col * 256, 0))
    harmony.save(ARTIFACTS / "cemetery-harmony-fills-props-grave-revenant.png")


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    makers = {
        "grave-grass": grass_fill,
        "grave-dirt": lambda seed: dirt_fill(seed, "grave-dirt"),
        "grave-path": path_fill,
        "grave-stone": stone_fill,
        "dark-moss": moss_fill,
        "dead-ground": lambda seed: dirt_fill(seed, "dead-ground"),
    }
    reports: dict[str, dict] = {}
    fills: dict[str, list[Image.Image]] = {}
    for material, seeds in SEEDS.items():
        fills[material] = []
        ramp = hexes(material)
        for i, seed in enumerate(seeds):
            im = makers[material](seed)
            suffix = f"-v{i}" if len(seeds) > 1 else ""
            name = f"cemetery-{material}{suffix}"
            out = FILLS / f"{name}.png"
            im.save(out)
            gates = norm.gate_report(im, ramp)
            report = {"src": str(out), "material": material, "recipe": "procedural/cemetery_tuft", "ramp": RAMPS[material], "seed": seed, "gates": gates}
            reports[name] = report
            (ARTIFACTS / f"{name}-gate-report.json").write_text(json.dumps(report, indent=2))
            fills[material].append(im)
            print(f"{out}: {'PASS' if gates['all_pass'] else 'FAIL'}")
    (ARTIFACTS / "cemetery-fill-gate-summary.json").write_text(json.dumps(reports, indent=2))
    make_sheets(fills)


if __name__ == "__main__":
    main()
