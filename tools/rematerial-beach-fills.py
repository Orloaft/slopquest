#!/usr/bin/env python3
"""Generate procedural beach fills for the Tier-B beach re-material slice."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FILLS = ROOT / "assetsources/curated/fills"
ARTIFACTS = ROOT / "artifacts/terrain-restyle/beach"
TS = 32

spec_norm = importlib.util.spec_from_file_location("norm", ROOT / "tools/normalize-terrain-fill.py")
norm = importlib.util.module_from_spec(spec_norm)
spec_norm.loader.exec_module(norm)  # type: ignore[union-attr]

RAMPS = {
    "sand": ["#b88a52", "#d0a465", "#e2bd7d", "#edce95", "#f6dfb2"],
    "shell-sand": ["#9b8d74", "#b6a486", "#d0bd98", "#e1cfad", "#efe0c1"],
    "wet-sand": ["#776652", "#92795d", "#aa8f6f", "#bea47f", "#d0b892"],
    "ripple-sand": ["#8d7659", "#aa8d66", "#c6a775", "#d7bb8a", "#e6cfa4"],
    "path": ["#72533a", "#8e6847", "#aa7f55", "#c09766", "#d3ad78"],
    "stair": ["#6d5a47", "#87705a", "#a0876d", "#baa183", "#cfb797"],
    "lagoon": ["#0a6074", "#11788a", "#2094a2", "#43adb4", "#78c9c4"],
    "shallow": ["#2c8690", "#45a0a4", "#66b9b1", "#8fcfc0", "#b7dfcf"],
    "ocean": ["#083f68", "#0c5a82", "#14779a", "#2593ad", "#55b2be"],
    "rock": ["#4d4c4e", "#686468", "#837d7c", "#9c9490", "#b6aca4"],
    "cliff": ["#4c382a", "#684b34", "#866241", "#a47a51", "#bf9568"],
}
SEEDS = {
    "sand": [1201, 1213, 1229, 1237],
    "shell-sand": [1301],
    "wet-sand": [1409],
    "ripple-sand": [1423],
    "path": [1511],
    "stair": [1523],
    "lagoon": [1601],
    "shallow": [1613],
    "ocean": [1627],
    "rock": [1709],
    "cliff": [1721],
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


def sand_fill(material: str, seed: int, shell: bool = False) -> Image.Image:
    dark2, dark, _base, light, bright = hexes(material)
    rng = np.random.default_rng(seed)
    a = base_mottle(material, seed, 0.43)
    for x, y in scatter(rng, 5 if not shell else 7, 7):
        for dx, dy in ((0, 0), (1, 0), (2, 0), (2, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x, y - 1, light)
        if shell:
            px(a, x + 1, y - 1, light)
    for x, y in scatter(rng, 4 if not shell else 6, 6):
        px(a, x, y, dark2)
        if shell:
            px(a, x + 1, y, light)
            px(a, x, y + 1, dark2)
    return Image.fromarray(a)


def wet_fill(material: str, seed: int, rippled: bool = False) -> Image.Image:
    dark2, dark, base, light, bright = hexes(material)
    rng = np.random.default_rng(seed)
    a = base_mottle(material, seed, 0.48)
    for y in range(2, TS, 8 if rippled else 11):
        a[y, :] = tuple(int(v * 0.94) for v in base)
        if rippled:
            a[(y + 1) % TS, :] = light
    for x, y in scatter(rng, 4 if rippled else 3, 8):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x + 2, y + 1, light if rippled else dark2)
        if rippled:
            px(a, x + 1, y - 1, bright)
    return Image.fromarray(a)


def path_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, _bright = hexes("path")
    rng = np.random.default_rng(seed)
    a = base_mottle("path", seed, 0.46)
    for y in (9, 10, 22, 23):
        a[y, :] = tuple(int(v * 0.95) for v in base)
    for x, y in scatter(rng, 5, 7):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x + 1, y + 1, dark2)
        px(a, x, y - 1, light)
    return Image.fromarray(a)


def stair_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("stair")
    a = base_mottle("stair", seed, 0.4)
    for y in (5, 6, 13, 14, 21, 22, 29, 30):
        a[y, :] = dark
        a[(y - 1) % TS, :] = light
    for x in range(0, TS, 8):
        px(a, x, 4, bright)
        px(a, x + 1, 23, dark2)
    return Image.fromarray(a)


def water_fill(material: str, seed: int, glints: int) -> Image.Image:
    dark2, dark, _base, light, bright = hexes(material)
    rng = np.random.default_rng(seed)
    a = base_mottle(material, seed, 0.33)
    deep = torus_noise(seed + 31, 5)
    a[deep < np.quantile(deep, 0.2)] = dark
    for x, y in scatter(rng, glints, 7):
        px(a, x, y, bright)
        px(a, x + 1, y, bright)
        px(a, x + 2, y + 1, light)
    if material == "ocean":
        for y in (6, 17, 28):
            a[y, :] = dark2
    return Image.fromarray(a)


def rock_fill(material: str, seed: int, cliff: bool = False) -> Image.Image:
    dark2, dark, base, light, bright = hexes(material)
    rng = np.random.default_rng(seed)
    a = base_mottle(material, seed, 0.45)
    if cliff:
        # Sandstone bluff courses with a sunlit lip and shadowed foot.
        for y in (4, 13, 22, 31):
            a[y, :] = dark2
            a[(y - 1) % TS, :] = light
        for x in range(2, TS, 11):
            a[5:14, x] = dark
            a[14:23, (x + 5) % TS] = dark
            a[23:31, (x + 2) % TS] = dark
        for x, y in scatter(rng, 8, 6):
            for dx, dy in ((0, 0), (1, 0), (2, 0), (1, 1)):
                px(a, x + dx, y + dy, dark)
            px(a, x, y - 1, light)
            px(a, x + 1, y - 1, bright)
            px(a, x + 2, y + 1, dark2)
            px(a, x + 3, y, base)
        a = cleanup_isolates(a)
        a[0, :] = a[-1, :]
        a[:, 0] = a[:, -1]
    else:
        for x, y in scatter(rng, 5, 8):
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


def keyed(sprite: Image.Image) -> Image.Image:
    arr = np.array(sprite.convert("RGBA"))
    mag = (arr[:, :, 0] > 95) & (arr[:, :, 2] > 90) & (arr[:, :, 1] < 135) & (np.abs(arr[:, :, 0].astype(int) - arr[:, :, 2].astype(int)) < 95)
    arr[mag, 3] = 0
    return Image.fromarray(arr)


def sheet_sprite(box: tuple[int, int, int, int], width: int) -> Image.Image:
    atlas = Image.open(ROOT / "public/beach-tiles.png").convert("RGBA")
    spr = keyed(atlas.crop(box))
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.LANCZOS)


def first_frame(sheet_name: str, width: int = 54) -> Image.Image:
    im = Image.open(ROOT / "public" / sheet_name).convert("RGBA")
    fw, fh = im.width // 4, im.height // 4
    spr = keyed(im.crop((0, 2 * fh, fw, 3 * fh)))
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.NEAREST)


def make_sheets(fills: dict[str, list[Image.Image]]) -> None:
    materials = ["sand", "shell-sand", "wet-sand", "ripple-sand", "path", "stair", "lagoon", "shallow", "ocean", "rock", "cliff"]
    sheet = Image.new("RGB", (4 * 136, 3 * 286), (18, 22, 27))
    for i, material in enumerate(materials):
        row, col = divmod(i, 4)
        tile = tiled(fills[material][0])
        x, y = col * 136, row * 286
        sheet.paste(tile, (x, y + 24))
        label(sheet, (x + 4, y + 4), f"beach {material}")
    sheet.save(ARTIFACTS / "beach-fill-variants.png")

    props = [
        sheet_sprite((1366, 860, 1482, 978), 76),
        sheet_sprite((642, 650, 810, 736), 104),
        sheet_sprite((1204, 402, 1292, 476), 64),
    ]
    enemy = first_frame("coral-crab-sheet.png", 58)
    harmony = Image.new("RGB", (3 * 256, 210), (18, 22, 27))
    for col, material in enumerate(("sand", "lagoon", "cliff")):
        bg = tiled(fills[material][0], n=4, zoom=2).convert("RGBA")
        canvas = Image.new("RGBA", (256, 210), (18, 22, 27, 255))
        canvas.alpha_composite(bg.crop((0, 0, 256, 160)), (0, 28))
        for i, prop in enumerate(props):
            x = 18 + i * 70
            y = 138 - prop.height
            shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(shadow)
            d.ellipse((x + 5, y + prop.height - 9, x + prop.width - 5, y + prop.height + 5), fill=(26, 18, 10, 78))
            canvas.alpha_composite(shadow)
            canvas.alpha_composite(prop, (x, y))
        canvas.alpha_composite(enemy, (184, 116))
        label(canvas, (8, 8), f"beach {material} + props + coral crab")
        harmony.paste(canvas.convert("RGB"), (col * 256, 0))
    harmony.save(ARTIFACTS / "beach-harmony-fills-props-coral-crab.png")


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    makers = {
        "sand": lambda seed: sand_fill("sand", seed),
        "shell-sand": lambda seed: sand_fill("shell-sand", seed, shell=True),
        "wet-sand": lambda seed: wet_fill("wet-sand", seed),
        "ripple-sand": lambda seed: wet_fill("ripple-sand", seed, rippled=True),
        "path": path_fill,
        "stair": stair_fill,
        "lagoon": lambda seed: water_fill("lagoon", seed, 5),
        "shallow": lambda seed: water_fill("shallow", seed, 4),
        "ocean": lambda seed: water_fill("ocean", seed, 4),
        "rock": lambda seed: rock_fill("rock", seed),
        "cliff": lambda seed: rock_fill("cliff", seed, cliff=True),
    }
    reports: dict[str, dict] = {}
    fills: dict[str, list[Image.Image]] = {}
    for material, seeds in SEEDS.items():
        fills[material] = []
        ramp = hexes(material)
        for i, seed in enumerate(seeds):
            im = makers[material](seed)
            suffix = f"-v{i}" if len(seeds) > 1 else ""
            name = f"beach-{material}{suffix}"
            out = FILLS / f"{name}.png"
            im.save(out)
            gates = norm.gate_report(im, ramp)
            report = {"src": str(out), "material": material, "recipe": "procedural/beach_tuft", "ramp": RAMPS[material], "seed": seed, "gates": gates}
            reports[name] = report
            (ARTIFACTS / f"{name}-gate-report.json").write_text(json.dumps(report, indent=2))
            fills[material].append(im)
            print(f"{out}: {'PASS' if gates['all_pass'] else 'FAIL'}")
    (ARTIFACTS / "beach-fill-gate-summary.json").write_text(json.dumps(reports, indent=2))
    make_sheets(fills)


if __name__ == "__main__":
    main()
