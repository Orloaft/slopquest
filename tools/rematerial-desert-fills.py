#!/usr/bin/env python3
"""Generate procedural desert fills for the Tier-B desert re-material slice."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FILLS = ROOT / "assetsources/curated/fills"
ARTIFACTS = ROOT / "artifacts/terrain-restyle/desert"
TS = 32

spec_norm = importlib.util.spec_from_file_location("norm", ROOT / "tools/normalize-terrain-fill.py")
norm = importlib.util.module_from_spec(spec_norm)
spec_norm.loader.exec_module(norm)  # type: ignore[union-attr]

RAMPS = {
    "sand": ["#b7782d", "#d0913e", "#e3ad5d", "#efc77d", "#f6dea3"],
    "road": ["#8f5f2c", "#aa7338", "#c38b4b", "#d5a15d", "#e6ba77"],
    "oasis-water": ["#0a5964", "#11707c", "#1d8991", "#38a5a7", "#73c2b7"],
    "quicksand": ["#7c5426", "#956c31", "#aa8240", "#bd9854", "#d0ae6c"],
    "red-rock-top": ["#5b1f1d", "#87372a", "#ad5635", "#c87648", "#dc9962"],
    "red-rock-cliff": ["#421819", "#682521", "#8d3a2b", "#ad5635", "#c87648"],
}
SEEDS = {
    "sand": [707, 719, 733, 751],
    "road": [809],
    "oasis-water": [853],
    "quicksand": [907],
    "red-rock-top": [953],
    "red-rock-cliff": [977],
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


def base_mottle(material: str, seed: int, low_q: float = 0.4) -> np.ndarray:
    dark2, dark, base, light, bright = hexes(material)
    a = np.zeros((TS, TS, 3), np.uint8)
    a[:, :] = base
    lo = tuple(int(v * 0.95) for v in base)
    n = torus_noise(seed + 17)
    mask = n < np.quantile(n, low_q)
    neigh = sum(np.roll(np.roll(mask, dy, 0), dx, 1) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    a[mask & (neigh > 0)] = lo
    return a


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


def sand_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("sand")
    rng = np.random.default_rng(seed)
    a = base_mottle("sand", seed, 0.42)
    for x, y in scatter(rng, 5, 7):
        for dx, dy in ((0, 0), (1, 0), (2, 0), (2, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x, y - 1, light)
        px(a, x + 1, y - 1, bright)
    for x, y in scatter(rng, 5, 6):
        px(a, x, y, dark2)
    return Image.fromarray(a)


def road_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("road")
    rng = np.random.default_rng(seed)
    a = base_mottle("road", seed, 0.46)
    for y in (8, 9, 22, 23):
        a[y, :] = tuple(int(v * 0.95) for v in base)
    for x, y in scatter(rng, 5, 7):
        for dx, dy in ((0, 0), (1, 0), (1, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x, y - 1, light)
    return Image.fromarray(a)


def water_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("oasis-water")
    rng = np.random.default_rng(seed)
    a = base_mottle("oasis-water", seed, 0.34)
    deep = torus_noise(seed + 33, 5)
    a[deep < np.quantile(deep, 0.22)] = dark
    for x, y in scatter(rng, 5, 7):
        px(a, x, y, bright)
        px(a, x + 1, y, bright)
        px(a, x + 2, y + 1, light)
    return Image.fromarray(a)


def quicksand_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("quicksand")
    a = base_mottle("quicksand", seed, 0.48)
    yy, xx = np.mgrid[0:TS, 0:TS]
    ring = np.sin(xx * 2 * np.pi / 16 + yy * 2 * np.pi / 32) + np.sin((xx + yy) * 2 * np.pi / 16)
    a[ring < -1.0] = dark
    a[ring > 1.15] = light
    return Image.fromarray(a)


def rock_fill(material: str, seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes(material)
    rng = np.random.default_rng(seed)
    a = base_mottle(material, seed, 0.44)
    if material.endswith("cliff"):
        # Red-rock canyon face: horizontal benches and faceted fracture chunks.
        for y in (3, 11, 20, 30):
            a[y, :] = dark2
            a[(y - 1) % TS, :] = light
        for x in range(3, TS, 12):
            a[4:12, x] = dark
            a[12:21, (x + 6) % TS] = dark
            a[21:30, (x + 3) % TS] = dark
        for x, y in scatter(rng, 7, 7):
            for dx, dy in ((0, 0), (1, 0), (2, 1), (3, 1)):
                px(a, x + dx, y + dy, dark)
            px(a, x, y - 1, light)
            px(a, x + 1, y - 1, bright)
            px(a, x + 3, y + 2, dark2)
            px(a, x + 2, y, base)
        a = cleanup_isolates(a)
    else:
        for x, y in scatter(rng, 4, 8):
            for dx, dy in ((0, 0), (1, 0), (2, 0), (1, 1), (2, 1)):
                px(a, x + dx, y + dy, dark)
            px(a, x, y - 1, light)
            px(a, x + 1, y - 1, bright)
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


def first_frame(sheet_name: str, width: int = 48) -> Image.Image:
    im = Image.open(ROOT / "public" / sheet_name).convert("RGBA")
    fw, fh = im.width // 4, im.height // 4
    spr = im.crop((0, 2 * fh, fw, 3 * fh))
    arr = np.array(spr)
    mag = (arr[:, :, 0] > 95) & (arr[:, :, 2] > 90) & (arr[:, :, 1] < 135) & (np.abs(arr[:, :, 0].astype(int) - arr[:, :, 2].astype(int)) < 95)
    arr[mag, 3] = 0
    spr = Image.fromarray(arr)
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.NEAREST)


def desert_prop(sheet: Image.Image, box: tuple[int, int, int, int], width: int) -> Image.Image:
    spr = sheet.crop(box).convert("RGBA")
    arr = np.array(spr)
    mag = (arr[:, :, 0] > 95) & (arr[:, :, 2] > 90) & (arr[:, :, 1] < 135) & (np.abs(arr[:, :, 0].astype(int) - arr[:, :, 2].astype(int)) < 95)
    arr[mag, 3] = 0
    spr = Image.fromarray(arr)
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.LANCZOS)


def make_sheets(fills: dict[str, list[Image.Image]]) -> None:
    materials = ["sand", "road", "oasis-water", "quicksand", "red-rock-top", "red-rock-cliff"]
    sheet = Image.new("RGB", (4 * 136, 2 * 286), (18, 22, 27))
    for i, material in enumerate(materials):
        row, col = divmod(i, 4)
        tile = tiled(fills[material][0])
        x, y = col * 136, row * 286
        sheet.paste(tile, (x, y + 24))
        label(sheet, (x + 4, y + 4), f"desert {material}")
    sheet.save(ARTIFACTS / "desert-fill-variants.png")

    atlas = Image.open(ROOT / "public/desert-tiles.png").convert("RGBA")
    props = [
        desert_prop(atlas, (1364, 854, 1468, 938), 76),
        desert_prop(atlas, (1456, 958, 1518, 1016), 56),
        desert_prop(atlas, (22, 856, 88, 942), 58),
    ]
    enemy = first_frame("dune-reaver-sheet.png", 48)
    harmony = Image.new("RGB", (3 * 256, 210), (18, 22, 27))
    for col, material in enumerate(("sand", "road", "oasis-water")):
        bg = tiled(fills[material][0], n=4, zoom=2).convert("RGBA")
        canvas = Image.new("RGBA", (256, 210), (18, 22, 27, 255))
        canvas.alpha_composite(bg.crop((0, 0, 256, 160)), (0, 28))
        for i, prop in enumerate(props):
            x = 24 + i * 62
            y = 136 - prop.height
            shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(shadow)
            d.ellipse((x + 4, y + prop.height - 9, x + prop.width - 4, y + prop.height + 5), fill=(28, 17, 8, 80))
            canvas.alpha_composite(shadow)
            canvas.alpha_composite(prop, (x, y))
        canvas.alpha_composite(enemy, (188, 104))
        label(canvas, (8, 8), f"desert {material} + props + dune reaver")
        harmony.paste(canvas.convert("RGB"), (col * 256, 0))
    harmony.save(ARTIFACTS / "desert-harmony-fills-props-dune-reaver.png")


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    makers = {
        "sand": sand_fill,
        "road": road_fill,
        "oasis-water": water_fill,
        "quicksand": quicksand_fill,
        "red-rock-top": lambda seed: rock_fill("red-rock-top", seed),
        "red-rock-cliff": lambda seed: rock_fill("red-rock-cliff", seed),
    }
    reports: dict[str, dict] = {}
    fills: dict[str, list[Image.Image]] = {}
    for material, seeds in SEEDS.items():
        fills[material] = []
        ramp = hexes(material)
        for i, seed in enumerate(seeds):
            im = makers[material](seed)
            suffix = f"-v{i}" if len(seeds) > 1 else ""
            name = f"desert-{material}{suffix}"
            out = FILLS / f"{name}.png"
            im.save(out)
            gates = norm.gate_report(im, ramp)
            report = {"src": str(out), "material": material, "recipe": "procedural/desert_tuft", "ramp": RAMPS[material], "seed": seed, "gates": gates}
            reports[name] = report
            (ARTIFACTS / f"{name}-gate-report.json").write_text(json.dumps(report, indent=2))
            fills[material].append(im)
            print(f"{out}: {'PASS' if gates['all_pass'] else 'FAIL'}")
    (ARTIFACTS / "desert-fill-gate-summary.json").write_text(json.dumps(reports, indent=2))
    make_sheets(fills)


if __name__ == "__main__":
    main()
