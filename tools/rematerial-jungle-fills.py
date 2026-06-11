#!/usr/bin/env python3
"""Generate procedural Untamed Jungle fills for the Tier-B jungle re-material slice."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FILLS = ROOT / "assetsources/curated/fills"
ARTIFACTS = ROOT / "artifacts/terrain-restyle/jungle"
TS = 32

spec_norm = importlib.util.spec_from_file_location("norm", ROOT / "tools/normalize-terrain-fill.py")
norm = importlib.util.module_from_spec(spec_norm)
spec_norm.loader.exec_module(norm)  # type: ignore[union-attr]

RAMPS = {
    "jungle-leaf-floor": ["#25350f", "#365217", "#4f7120", "#668b2e", "#83a847"],
    "jungle-undergrowth": ["#18240b", "#263d11", "#385b18", "#4e7421", "#6d9235"],
    "jungle-soil": ["#3a2a17", "#563c20", "#76542c", "#96713d", "#b59256"],
    "jungle-river": ["#073837", "#0d514f", "#176b66", "#278982", "#4aa89a"],
    "jungle-cliff": ["#2b271b", "#443b25", "#5d5132", "#766941", "#958451"],
}
SEEDS = {
    "jungle-leaf-floor": [9101, 9113, 9133, 9151],
    "jungle-undergrowth": [9203],
    "jungle-soil": [9257],
    "jungle-river": [9301],
    "jungle-cliff": [9403],
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


def floor_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, bright = hexes("jungle-leaf-floor")
    rng = np.random.default_rng(seed)
    a = base_mottle("jungle-leaf-floor", seed, 0.46)
    for x, y in scatter(rng, 7, 7):
        for dx, tall in ((0, 2), (2, 3), (4, 2)):
            for dy in range(tall):
                px(a, x + dx, y - dy, dark if dy < tall - 1 else light)
        px(a, x + 2, y - 3, bright)
        px(a, x + 1, y + 1, dark2)
        px(a, x + 3, y + 1, dark2)
    for x, y in scatter(rng, 3, 8):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x, y - 1, light)
    return Image.fromarray(cleanup_isolates(a))


def canopy_fill(seed: int) -> Image.Image:
    dark2, dark, _base, light, bright = hexes("jungle-undergrowth")
    rng = np.random.default_rng(seed)
    a = base_mottle("jungle-undergrowth", seed, 0.52)
    for x, y in scatter(rng, 8, 7):
        for dx, dy in ((0, 0), (1, 0), (2, 0), (1, 1), (2, 1)):
            px(a, x + dx, y + dy, dark)
        px(a, x, y - 1, light)
        px(a, x + 1, y - 1, bright)
        px(a, x + 2, y - 1, light)
        px(a, x + 2, y + 2, dark2)
    return Image.fromarray(cleanup_isolates(a))


def soil_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("jungle-soil")
    rng = np.random.default_rng(seed)
    a = base_mottle("jungle-soil", seed, 0.42)
    for y in range(TS):
        if y % 11 in (4, 5):
            a[y, :] = tuple(int(v * 0.95) for v in base)
    for x, y in scatter(rng, 5, 7):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x + 1, y + 1, dark2)
        px(a, x, y - 1, light)
        px(a, x + 2, y - 1, bright)
    return Image.fromarray(cleanup_isolates(a))


def river_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("jungle-river")
    rng = np.random.default_rng(seed)
    a = base_mottle("jungle-river", seed, 0.44)
    deep = torus_noise(seed + 31, 5)
    a[deep < np.quantile(deep, 0.24)] = dark
    for y in (9, 21):
        for x in range(TS):
            px(a, x, y, tuple(int(v * 0.95) for v in base))
            px(a, x, (y - 1) % TS, light)
    for x, y in scatter(rng, 5, 8):
        px(a, x, y, bright)
        px(a, x + 1, y, bright)
        px(a, x + 2, y + 1, light)
        px(a, x + 3, y + 1, dark2)
    return Image.fromarray(cleanup_isolates(a))


def cliff_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = hexes("jungle-cliff")
    rng = np.random.default_rng(seed)
    a = base_mottle("jungle-cliff", seed, 0.48)
    # Damp vine-draped cliff face: broad strata plus sparse leaf/moss catches.
    for y in (5, 14, 23, 31):
        a[y, :] = dark2
        a[(y - 1) % TS, :] = light
    for x in range(4, TS, 12):
        a[6:15, x] = dark
        a[15:24, (x + 5) % TS] = dark
        a[24:31, (x + 2) % TS] = dark
    for x, y in scatter(rng, 7, 7):
        px(a, x, y, dark)
        px(a, x + 1, y, dark)
        px(a, x, y - 1, light)
        px(a, x + 1, y - 1, bright)
        px(a, x + 1, y + 1, dark2)
        px(a, x + 2, y + 1, base)
    for x, y in scatter(rng, 4, 8):
        px(a, x, y, bright)
        px(a, x, y + 1, light)
        px(a, x + 1, y + 1, dark)
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


def first_frame(sheet_name: str, width: int = 54) -> Image.Image | None:
    path = ROOT / "public" / sheet_name
    if not path.exists():
        return None
    im = Image.open(path).convert("RGBA")
    fw, fh = im.width // 4, im.height // 4
    spr = keyed(im.crop((0, 2 * fh, fw, 3 * fh)))
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.NEAREST)


def jungle_prop(box: tuple[int, int, int, int], width: int) -> Image.Image:
    atlas = Image.open(ROOT / "public/jungle-tiles.png").convert("RGBA")
    spr = keyed(atlas.crop(box))
    return spr.resize((width, round(width * spr.height / spr.width)), Image.Resampling.LANCZOS)


def make_sheets(fills: dict[str, list[Image.Image]]) -> None:
    materials = ["jungle-leaf-floor", "jungle-undergrowth", "jungle-soil", "jungle-river", "jungle-cliff"]
    sheet = Image.new("RGB", (3 * 136, 2 * 286), (11, 18, 12))
    for i, material in enumerate(materials):
        row, col = divmod(i, 3)
        tile = tiled(fills[material][0])
        x, y = col * 136, row * 286
        sheet.paste(tile, (x, y + 24))
        label(sheet, (x + 4, y + 4), material)
    sheet.save(ARTIFACTS / "jungle-fill-variants.png")

    props = [
        jungle_prop((676, 862, 796, 962), 82),
        jungle_prop((524, 100, 592, 182), 58),
        jungle_prop((694, 146, 766, 176), 70),
    ]
    enemy = first_frame("canopy-stalker-sheet.png", 56) or first_frame("venomous-stalker-sheet.png", 56)
    harmony = Image.new("RGB", (3 * 256, 210), (11, 18, 12))
    for col, material in enumerate(("jungle-leaf-floor", "jungle-soil", "jungle-river")):
        bg = tiled(fills[material][0], n=4, zoom=2).convert("RGBA")
        canvas = Image.new("RGBA", (256, 210), (11, 18, 12, 255))
        canvas.alpha_composite(bg.crop((0, 0, 256, 160)), (0, 28))
        for i, prop in enumerate(props):
            x = 22 + i * 66
            y = 142 - prop.height
            shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(shadow)
            d.ellipse((x + 5, y + prop.height - 8, x + prop.width - 5, y + prop.height + 5), fill=(4, 12, 4, 90))
            canvas.alpha_composite(shadow)
            canvas.alpha_composite(prop, (x, y))
        if enemy:
            canvas.alpha_composite(enemy, (184, 108))
        label(canvas, (8, 8), f"{material} + jungle props")
        harmony.paste(canvas.convert("RGB"), (col * 256, 0))
    harmony.save(ARTIFACTS / "jungle-harmony-fills-props-canopy-stalker.png")


def patch_runtime_sheet(fills: dict[str, list[Image.Image]]) -> None:
    sheet_path = ROOT / "public/jungle-tiles.png"
    sheet = Image.open(sheet_path).convert("RGB")
    rects = [
        ((18, 97, 72, 74), fills["jungle-leaf-floor"][0]),
        ((102, 97, 72, 74), fills["jungle-leaf-floor"][1]),
        ((184, 97, 72, 74), fills["jungle-leaf-floor"][2]),
        ((429, 182, 72, 74), fills["jungle-leaf-floor"][3]),
        ((524, 100, 68, 82), fills["jungle-undergrowth"][0]),
        ((1069, 100, 72, 72), fills["jungle-river"][0]),
        ((694, 146, 72, 30), fills["jungle-cliff"][0]),
    ]
    for (sx, sy, sw, sh), fill in rects:
        tile = fill.convert("RGB").resize((sw, sh), Image.Resampling.NEAREST)
        sheet.paste(tile, (sx, sy))
    sheet.save(sheet_path)


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    makers = {
        "jungle-leaf-floor": floor_fill,
        "jungle-undergrowth": canopy_fill,
        "jungle-soil": soil_fill,
        "jungle-river": river_fill,
        "jungle-cliff": cliff_fill,
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
            report = {"src": str(out), "material": material, "recipe": "procedural/jungle_tuft", "ramp": RAMPS[material], "seed": seed, "gates": gates}
            reports[name] = report
            (ARTIFACTS / f"{name}-gate-report.json").write_text(json.dumps(report, indent=2))
            fills[material].append(im)
            print(f"{out}: {'PASS' if gates['all_pass'] else 'FAIL'}")
    (ARTIFACTS / "jungle-fill-gate-summary.json").write_text(json.dumps(reports, indent=2))
    make_sheets(fills)
    patch_runtime_sheet(fills)


if __name__ == "__main__":
    main()
