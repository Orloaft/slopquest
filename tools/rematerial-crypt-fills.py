#!/usr/bin/env python3
"""Generate procedural crypt fills for the Tier-B crypt re-material slice."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FILLS = ROOT / "assetsources/curated/fills"
ARTIFACTS = ROOT / "artifacts/terrain-restyle/crypt"
TS = 32

spec_norm = importlib.util.spec_from_file_location("norm", ROOT / "tools/normalize-terrain-fill.py")
norm = importlib.util.module_from_spec(spec_norm)
spec_norm.loader.exec_module(norm)  # type: ignore[union-attr]

RAMPS = {
    "crypt-wall": ["#18191d", "#27282d", "#393a40", "#505058", "#686771"],
    "crypt-floor": ["#272624", "#393632", "#4e4841", "#655d53", "#7c7366"],
    "crypt-worn-floor": ["#231f1c", "#342d27", "#473b32", "#5c4c40", "#736252"],
    "crypt-tomb-stone": ["#2b2f2e", "#424643", "#5b5e58", "#73746b", "#8e8b80"],
    "crypt-dark-moss": ["#141d16", "#223022", "#31432f", "#455940", "#5c7052"],
}
SEEDS = {
    "crypt-wall": [3101],
    "crypt-floor": [3203, 3217],
    "crypt-worn-floor": [3301],
    "crypt-tomb-stone": [3407],
    "crypt-dark-moss": [3500],
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
    dark2, dark, base, light, bright = hexes("crypt-wall")
    rng = np.random.default_rng(seed)
    a = base_mottle("crypt-wall", seed, 0.46)
    # Mortared dungeon blocks: broad courses with top-left bevels, not noisy columns.
    for y in (0, 9, 19, 31):
        a[y, :] = dark2
        a[(y - 1) % TS, :] = light
    courses = [(0, 9, 5), (9, 19, 17), (19, 31, 9)]
    for y0, y1, offset in courses:
        for x in range(offset, TS + offset, 13):
            xx = x % TS
            a[y0:y1, xx] = dark
            a[y0:y1, (xx + 1) % TS] = dark2
            a[y0:y1, (xx - 1) % TS] = base
    for x, y in scatter(rng, 6, 7):
        for dx, dy in ((0, 0), (1, 0), (2, 0), (1, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x, y - 1, light)
        px(a, x + 1, y - 1, bright)
        px(a, x + 2, y + 1, dark2)
    return Image.fromarray(a)


def floor_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, _bright = hexes("crypt-floor")
    rng = np.random.default_rng(seed)
    a = base_mottle("crypt-floor", seed, 0.41)
    for x, y in scatter(rng, 8, 6):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x, y - 1, light)
        px(a, x + 1, y + 1, dark2)
    for x, y in scatter(rng, 4, 8):
        for dx in range(4):
            px(a, x + dx, y, dark)
        px(a, x, y - 1, light)
    return Image.fromarray(a)


def worn_floor_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, _bright = hexes("crypt-worn-floor")
    rng = np.random.default_rng(seed)
    a = base_mottle("crypt-worn-floor", seed, 0.46)
    for y in (8, 9, 22, 23):
        a[y, :] = tuple(int(v * 0.95) for v in base)
    for x, y in scatter(rng, 5, 7):
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x, y - 1, light)
        px(a, x + 1, y + 2, dark2)
    return Image.fromarray(a)


def tomb_stone_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, bright = hexes("crypt-tomb-stone")
    rng = np.random.default_rng(seed)
    a = base_mottle("crypt-tomb-stone", seed, 0.42)
    for x, y in scatter(rng, 6, 6):
        for dx, dy in ((0, 0), (1, 0), (2, 0), (1, 1), (2, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x, y - 1, light)
        px(a, x + 1, y - 1, bright)
        px(a, x + 2, y + 1, dark2)
    return Image.fromarray(a)


def moss_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, bright = hexes("crypt-dark-moss")
    rng = np.random.default_rng(seed)
    a = base_mottle("crypt-dark-moss", seed, 0.52)
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
    materials = ["crypt-wall", "crypt-floor", "crypt-worn-floor", "crypt-tomb-stone", "crypt-dark-moss"]
    sheet = Image.new("RGB", (3 * 136, 2 * 286), (15, 17, 22))
    for i, material in enumerate(materials):
        row, col = divmod(i, 3)
        tile = tiled(fills[material][0])
        x, y = col * 136, row * 286
        sheet.paste(tile, (x, y + 24))
        label(sheet, (x + 4, y + 4), material)
    sheet.save(ARTIFACTS / "crypt-fill-variants.png")

    props = [
        grave_prop((1022, 296, 1110, 340), 88),
        grave_prop((516, 463, 558, 518), 42),
        grave_prop((610, 378, 647, 443), 40),
    ]
    enemy = first_frame("crypt-sentinel-sheet.png", 54)
    harmony = Image.new("RGB", (3 * 256, 210), (15, 17, 22))
    for col, material in enumerate(("crypt-floor", "crypt-wall", "crypt-dark-moss")):
        bg = tiled(fills[material][0], n=4, zoom=2).convert("RGBA")
        canvas = Image.new("RGBA", (256, 210), (15, 17, 22, 255))
        canvas.alpha_composite(bg.crop((0, 0, 256, 160)), (0, 28))
        for i, prop in enumerate(props):
            x = 18 + i * 68
            y = 140 - prop.height
            shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(shadow)
            d.ellipse((x + 5, y + prop.height - 9, x + prop.width - 5, y + prop.height + 5), fill=(6, 8, 8, 92))
            canvas.alpha_composite(shadow)
            canvas.alpha_composite(prop, (x, y))
        canvas.alpha_composite(enemy, (184, 110))
        label(canvas, (8, 8), f"{material} + crypt props + sentinel")
        harmony.paste(canvas.convert("RGB"), (col * 256, 0))
    harmony.save(ARTIFACTS / "crypt-harmony-fills-props-crypt-sentinel.png")


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    makers = {
        "crypt-wall": wall_fill,
        "crypt-floor": floor_fill,
        "crypt-worn-floor": worn_floor_fill,
        "crypt-tomb-stone": tomb_stone_fill,
        "crypt-dark-moss": moss_fill,
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
            report = {"src": str(out), "material": material, "recipe": "procedural/crypt_tuft", "ramp": RAMPS[material], "seed": seed, "gates": gates}
            reports[name] = report
            (ARTIFACTS / f"{name}-gate-report.json").write_text(json.dumps(report, indent=2))
            fills[material].append(im)
            print(f"{out}: {'PASS' if gates['all_pass'] else 'FAIL'}")
    (ARTIFACTS / "crypt-fill-gate-summary.json").write_text(json.dumps(reports, indent=2))
    make_sheets(fills)


if __name__ == "__main__":
    main()
