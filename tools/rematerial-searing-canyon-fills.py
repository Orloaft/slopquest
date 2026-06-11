#!/usr/bin/env python3
"""Generate procedural Searing Canyon fills for the Tier-B re-material slice."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FILLS = ROOT / "assetsources/curated/fills"
ARTIFACTS = ROOT / "artifacts/terrain-restyle/searing-canyon"
TS = 32

spec_norm = importlib.util.spec_from_file_location("norm", ROOT / "tools/normalize-terrain-fill.py")
norm = importlib.util.module_from_spec(spec_norm)
spec_norm.loader.exec_module(norm)  # type: ignore[union-attr]

RAMPS = {
    "searing-canyon-ash": ["#2a241f", "#443328", "#654432", "#895d3e", "#ad7a4f"],
    "searing-canyon-trail": ["#4c3729", "#6d4a32", "#92633e", "#b77e4f", "#d99d68"],
    "searing-canyon-sand": ["#6a4a31", "#8d633c", "#b07f4d", "#cf9c64", "#e7ba82"],
}
SEEDS = {
    "searing-canyon-ash": [6500, 6619, 6637, 6653],
    "searing-canyon-trail": [6701, 6719],
    "searing-canyon-sand": [6803],
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
    while len(pts) < count and guard < 1400:
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
    _dark2, dark, base, _light, _bright = hexes(material)
    a = np.zeros((TS, TS, 3), np.uint8)
    a[:, :] = base
    n = torus_noise(seed + 17)
    mask = n < np.quantile(n, low_q)
    neigh = sum(np.roll(np.roll(mask, dy, 0), dx, 1) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    a[mask & (neigh > 0)] = dark
    return a


def ash_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("searing-canyon-ash")
    rng = np.random.default_rng(seed)
    a = base_mottle("searing-canyon-ash", seed, 0.44)
    for x, y in scatter(rng, 6, 7):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x + 2, y + 1, dark2)
        px(a, x, y - 1, light)
        px(a, x + 1, y - 1, bright)
    for x, y in scatter(rng, 4, 8):
        for dx in range(4):
            px(a, x + dx, y, dark2 if dx in (1, 2) else dark)
        px(a, x + 1, y - 1, light)
        px(a, x + 2, y - 1, light)
        px(a, x + 3, y - 2, bright)
    for x, y in scatter(rng, 3, 9):
        px(a, x, y, base)
        px(a, x + 1, y, light)
        px(a, x + 2, y, base)
    return Image.fromarray(cleanup_isolates(a))


def trail_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("searing-canyon-trail")
    rng = np.random.default_rng(seed)
    a = base_mottle("searing-canyon-trail", seed, 0.36)
    for y in (8, 20):
        for x in range(TS):
            if (x + y) % 5:
                px(a, x, y, dark)
            if x % 3:
                px(a, x, (y - 1) % TS, light)
    for x, y in scatter(rng, 5, 7):
        px(a, x, y, dark2)
        px(a, x + 1, y, dark)
        px(a, x + 2, y, base)
        px(a, x + 1, y - 1, bright)
    return Image.fromarray(cleanup_isolates(a))


def sand_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("searing-canyon-sand")
    rng = np.random.default_rng(seed)
    a = base_mottle("searing-canyon-sand", seed, 0.34)
    for x, y in scatter(rng, 7, 6):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x + 2, y + 1, dark2)
        px(a, x, y - 1, light)
        px(a, x + 1, y - 1, bright)
    for y in (5, 17, 29):
        for x in range(TS):
            if x % 4 != 0:
                px(a, x, y, base)
            if x % 7 == 0:
                px(a, x, (y - 1) % TS, light)
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
    d.text(xy, text, fill=(235, 226, 210))


def keyed(sprite: Image.Image) -> Image.Image:
    arr = np.array(sprite.convert("RGBA"))
    mag = (arr[:, :, 0] > 95) & (arr[:, :, 2] > 90) & (arr[:, :, 1] < 135) & (np.abs(arr[:, :, 0].astype(int) - arr[:, :, 2].astype(int)) < 95)
    arr[mag, 3] = 0
    return Image.fromarray(arr)


def first_frame(sheet_name: str, width: int = 56) -> Image.Image | None:
    path = ROOT / "public" / sheet_name
    if not path.exists():
        return None
    im = Image.open(path).convert("RGBA")
    fw, fh = im.width // 4, im.height // 4
    spr = keyed(im.crop((0, 2 * fh, fw, 3 * fh)))
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.NEAREST)


def prop(path: Path, width: int) -> Image.Image:
    spr = Image.open(path).convert("RGBA")
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.LANCZOS)


def make_sheets(fills: dict[str, list[Image.Image]]) -> None:
    materials = ["searing-canyon-ash", "searing-canyon-trail", "searing-canyon-sand"]
    sheet = Image.new("RGB", (3 * 136, 286), (28, 20, 16))
    for i, material in enumerate(materials):
        tile = tiled(fills[material][0])
        x = i * 136
        sheet.paste(tile, (x, 24))
        label(sheet, (x + 4, 4), material)
    sheet.save(ARTIFACTS / "searing-canyon-fill-variants.png")

    flora_dir = ROOT / "assetsources/curated/bespoke/searing-canyon-m3-assets/sliced"
    props = [
        prop(flora_dir / "saguaro_md.png", 34),
        prop(flora_dir / "scrub_dry.png", 42),
        prop(flora_dir / "scree_lg.png", 42),
    ]
    enemy = first_frame("magma-hound-sheet.png", 58) or first_frame("basalt-brute-sheet.png", 58)
    harmony = Image.new("RGB", (3 * 256, 210), (28, 20, 16))
    for col, material in enumerate(materials):
        bg = tiled(fills[material][0], n=4, zoom=2).convert("RGBA")
        canvas = Image.new("RGBA", (256, 210), (28, 20, 16, 255))
        canvas.alpha_composite(bg.crop((0, 0, 256, 160)), (0, 28))
        for i, p in enumerate(props):
            x = 24 + i * 62
            y = 144 - p.height
            shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(shadow)
            d.ellipse((x + 4, y + p.height - 7, x + p.width - 4, y + p.height + 4), fill=(8, 5, 4, 96))
            canvas.alpha_composite(shadow)
            canvas.alpha_composite(p, (x, y))
        if enemy:
            canvas.alpha_composite(enemy, (184, 106))
        label(canvas, (8, 8), f"{material} + canyon props")
        harmony.paste(canvas.convert("RGB"), (col * 256, 0))
    harmony.save(ARTIFACTS / "searing-canyon-harmony-fills-props-enemy.png")


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    makers = {
        "searing-canyon-ash": ash_fill,
        "searing-canyon-trail": trail_fill,
        "searing-canyon-sand": sand_fill,
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
            report = {"src": str(out), "material": material, "recipe": "procedural/searing_canyon_tuft", "ramp": RAMPS[material], "seed": seed, "gates": gates}
            reports[name] = report
            (ARTIFACTS / f"{name}-gate-report.json").write_text(json.dumps(report, indent=2))
            fills[material].append(im)
            print(f"{out}: {'PASS' if gates['all_pass'] else 'FAIL'}")
    (ARTIFACTS / "searing-canyon-fill-gate-summary.json").write_text(json.dumps(reports, indent=2))
    make_sheets(fills)


if __name__ == "__main__":
    main()
