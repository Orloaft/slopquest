#!/usr/bin/env python3
"""Synthesize bible-style swamp source tiles for the floor-5 generated stage.

The Sunken Marsh baker consumes these stable paths:
  assetsources/curated/sliced/swamp-lichen-base.png
  assetsources/curated/sliced/swamp-water-wang.png
  assetsources/curated/sliced/swamp-path-wang.png
  assetsources/curated/sliced/swamp-rock.png
  assetsources/curated/sliced/swamp-plank.png

This tool intentionally does not crop arbitrary baked atlas cells. It builds
quiet procedural fills from approved terrain-style rules, records mechanical
gate reports, then synthesizes water/path corner-Wang transitions from those
fills so connection contracts stay in code.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FILLS = ROOT / "assetsources/curated/fills"
SLICED = ROOT / "assetsources/curated/sliced"
ARTIFACTS = ROOT / "artifacts/terrain-restyle/swamp"
TS = 32

spec_norm = importlib.util.spec_from_file_location("norm", ROOT / "tools/normalize-terrain-fill.py")
norm = importlib.util.module_from_spec(spec_norm)
spec_norm.loader.exec_module(norm)  # type: ignore[union-attr]

RAMPS = {
    "lichen": ["#313c32", "#46583f", "#5d704f", "#728862", "#8aa174"],
    "mud": ["#4b3224", "#62412b", "#7c5638", "#966d48", "#ad835d"],
    "water": ["#12383f", "#1b4d54", "#23656a", "#2d7a7a", "#3f918a"],
    "rock": ["#30323c", "#444752", "#575a66", "#6b6f7a", "#808590"],
    "plank": ["#4f3523", "#67482e", "#805d3c", "#997349", "#b18b5e"],
}
SEEDS = {
    "lichen": [510, 521, 532, 543],
    "mud": [610],
    "water": [710],
    "rock": [810],
    "plank": [910],
}


def hex_rgb(h: str) -> tuple[int, int, int]:
    return norm.hex_rgb(h)


def ramp(material: str) -> list[tuple[int, int, int]]:
    return [hex_rgb(c) for c in RAMPS[material]]


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
        ok = True
        for px, py in pts:
            dx = min(abs(x - px), TS - abs(x - px))
            dy = min(abs(y - py), TS - abs(y - py))
            if dx * dx + dy * dy <= min_dist * min_dist:
                ok = False
                break
        if ok:
            pts.append((x, y))
    return pts


def px(a: np.ndarray, x: int, y: int, color: tuple[int, int, int]) -> None:
    a[y % TS, x % TS] = color


def quiet_base(material: str, seed: int, cutoff: float = 0.42) -> np.ndarray:
    dark2, dark, base, light, bright = ramp(material)
    a = np.zeros((TS, TS, 3), np.uint8)
    a[:, :] = base
    n = torus_noise(seed + 7, passes=8)
    lo = tuple(int(v * 0.94) for v in base)
    mask = n < np.quantile(n, cutoff)
    neigh = sum(np.roll(np.roll(mask, dy, 0), dx, 1) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    a[mask & (neigh > 0)] = lo
    return a


def seal_edges(a: np.ndarray) -> np.ndarray:
    """Make opposite border pixels identical while staying on the material ramp."""
    a[TS - 1, :] = a[0, :]
    a[:, TS - 1] = a[:, 0]
    return a


def lichen_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = ramp("lichen")
    rng = np.random.default_rng(seed)
    a = quiet_base("lichen", seed, cutoff=0.44)
    for x, y in scatter(rng, 5, min_dist=7):
        for dx, dy in [(0, 1), (1, 1), (2, 1), (1, 2), (2, 2)]:
            px(a, x + dx, y + dy, dark2)
        for dx, dy in [(0, 0), (1, 0), (2, 0), (3, 0), (1, -1), (2, -1)]:
            px(a, x + dx, y + dy, dark)
        for dx, dy in [(0, -1), (1, -2), (2, -2), (3, -1)]:
            px(a, x + dx, y + dy, light)
        px(a, x + 1, y - 3, bright)
    return Image.fromarray(seal_edges(a))


def mud_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = ramp("mud")
    rng = np.random.default_rng(seed)
    a = quiet_base("mud", seed, cutoff=0.5)
    for y in range(TS):
        if y % 11 in (4, 5):
            a[y, :] = tuple(int(v * 0.95) for v in base)
    for x, y in scatter(rng, 5, min_dist=7):
        for dx, dy in [(0, 0), (1, 0), (2, 0), (1, 1)]:
            px(a, x + dx, y + dy, dark)
        for dx, dy in [(0, 1), (2, 1)]:
            px(a, x + dx, y + dy, dark2)
        for dx, dy in [(0, -1), (1, -1)]:
            px(a, x + dx, y + dy, light)
    return Image.fromarray(seal_edges(a))


def water_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = ramp("water")
    rng = np.random.default_rng(seed)
    a = quiet_base("water", seed, cutoff=0.36)
    deep = torus_noise(seed + 21, passes=8)
    a[deep < np.quantile(deep, 0.28)] = dark
    for x, y in scatter(rng, 4, min_dist=7):
        px(a, x, y, bright)
        px(a, x + 1, y, bright)
        px(a, x + 2, y + 1, light)
    return Image.fromarray(seal_edges(a))


def rock_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = ramp("rock")
    rng = np.random.default_rng(seed)
    a = quiet_base("rock", seed, cutoff=0.4)
    for x, y in scatter(rng, 4, min_dist=8):
        for dx, dy in [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (2, 1), (1, 2)]:
            px(a, x + dx, y + dy, dark)
        for dx, dy in [(0, -1), (1, -1), (2, -1)]:
            px(a, x + dx, y + dy, light)
        px(a, x + 1, y - 2, bright)
        px(a, x + 2, y + 2, dark2)
    return Image.fromarray(seal_edges(a))


def plank_fill(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = ramp("plank")
    rng = np.random.default_rng(seed)
    a = np.zeros((TS, TS, 3), np.uint8)
    a[:, :] = base
    for y in (7, 15, 23, 31):
        a[y % TS, :] = dark2
        a[(y + 1) % TS, :] = dark
        a[(y - 1) % TS, :] = light
    for x in (10, 21):
        for y0 in (0, 8, 16, 24):
            length = int(rng.integers(4, 8))
            a[y0 : min(TS, y0 + length), x] = dark
            a[y0 : min(TS, y0 + max(1, length - 2)), (x + 1) % TS] = light
    n = torus_noise(seed + 31, passes=5)
    a[n < np.quantile(n, 0.18)] = tuple(int(v * 0.96) for v in base)
    return Image.fromarray(seal_edges(a))


def hashf(x: int, y: int, salt: int = 0) -> float:
    h = (x * 374761393 + y * 668265263 + salt * 1442695041) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return (h % 100000) / 100000.0


def make_wang(land: Image.Image, over: Image.Image, feather: float, jit: float, collar: tuple[int, int, int], salt: int) -> Image.Image:
    a = Image.new("RGBA", (128, 128))
    lp, op = land.convert("RGBA").load(), over.convert("RGBA").load()
    for idx in range(16):
        nw = idx & 1
        ne = (idx >> 1) & 1
        se = (idx >> 2) & 1
        sw = (idx >> 3) & 1
        tx, ty = (idx % 4) * TS, (idx // 4) * TS
        for y in range(TS):
            for x in range(TS):
                u = x / 31.0
                v = y / 31.0
                val = nw * (1 - u) * (1 - v) + ne * u * (1 - v) + sw * (1 - u) * v + se * u * v
                val += (hashf(x, y, salt) - 0.5) * jit
                lr, lg, lb, _ = lp[x, y]
                orr, og, ob, _ = op[x, y]
                if val >= 0.5 + feather:
                    pxv = (orr, og, ob, 255)
                elif val <= 0.5 - feather:
                    pxv = (lr, lg, lb, 255)
                else:
                    t = (val - (0.5 - feather)) / (2 * feather)
                    if 0.42 <= t <= 0.58 and hashf(x + 19, y + 23, salt) < 0.35:
                        pxv = (*collar, 255)
                    elif hashf(x + 3, y + 5, salt) < t:
                        pxv = (orr, og, ob, 255)
                    else:
                        pxv = (lr, lg, lb, 255)
                a.putpixel((tx + x, ty + y), pxv)
    return a


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


def first_enemy_frame() -> Image.Image:
    sheet = Image.open(ROOT / "public/bog-wraith-sheet.png").convert("RGBA")
    fw = sheet.width // 4
    fh = sheet.height // 4
    spr = sheet.crop((0, 2 * fh, fw, 3 * fh)).resize((48, 48), Image.Resampling.NEAREST)
    pix = spr.load()
    for y in range(spr.height):
        for x in range(spr.width):
            r, g, b, a = pix[x, y]
            if a and r > 180 and b > 180 and g < 120:
                pix[x, y] = (r, g, b, 0)
    return spr


def load_swamp_prop(sx: int, sy: int, sw: int, sh: int, width: int) -> Image.Image:
    im = Image.open(ROOT / "public/swamp-tiles.png").convert("RGBA").crop((sx, sy, sx + sw, sy + sh))
    pix = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = pix[x, y]
            if a and r > 80 and b > 40 and g < 20 and r > g * 6 and b > g * 6:
                pix[x, y] = (r, g, b, 0)
    h = max(1, round(width * im.height / im.width))
    return im.resize((width, h), Image.Resampling.LANCZOS)


def make_review_sheets(fills: dict[str, Image.Image], lichen_variants: list[Image.Image]) -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    materials = ["lichen", "mud", "water", "rock", "plank"]
    sheet = Image.new("RGB", (4 * 136, 2 * 286), (18, 22, 27))
    for col, fill in enumerate(lichen_variants):
        x = col * 136
        label(sheet, (x + 4, 4), f"swamp lichen v{col}")
        sheet.paste(tiled(fill), (x, 24))
    for col, material in enumerate(materials[1:]):
        x = col * 136
        label(sheet, (x + 4, 290), f"swamp {material}")
        sheet.paste(tiled(fills[material]), (x, 310))
    sheet.save(ARTIFACTS / "swamp-fill-variants.png")

    harmony = Image.new("RGBA", (512, 220), (18, 22, 27, 255))
    bg = tiled(lichen_variants[0], n=8, zoom=2).convert("RGBA")
    harmony.alpha_composite(bg.crop((0, 0, 512, 190)), (0, 30))
    props = [
        load_swamp_prop(1448, 944, 72, 72, 52),   # reeds
        load_swamp_prop(524, 556, 76, 56, 54),    # bramble
        load_swamp_prop(1150, 392, 62, 50, 58),   # boulder
    ]
    for i, prop in enumerate(props):
        x = 42 + i * 98
        y = 150 - prop.height
        shadow = Image.new("RGBA", harmony.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(shadow)
        d.ellipse((x + 4, y + prop.height - 8, x + prop.width - 4, y + prop.height + 5), fill=(10, 18, 12, 80))
        harmony.alpha_composite(shadow)
        harmony.alpha_composite(prop, (x, y))
    enemy = first_enemy_frame()
    shadow = Image.new("RGBA", harmony.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((374, 143, 416, 153), fill=(10, 18, 12, 90))
    harmony.alpha_composite(shadow)
    harmony.alpha_composite(enemy, (370, 104))
    label(harmony, (8, 8), "swamp lichen + swamp props + bog wraith")
    harmony.convert("RGB").save(ARTIFACTS / "swamp-harmony-fills-props-bog-wraith.png")


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)
    SLICED.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    lichen_variants = [lichen_fill(seed) for seed in SEEDS["lichen"]]
    fills = {
        "lichen": lichen_variants[0],
        "mud": mud_fill(SEEDS["mud"][0]),
        "water": water_fill(SEEDS["water"][0]),
        "rock": rock_fill(SEEDS["rock"][0]),
        "plank": plank_fill(SEEDS["plank"][0]),
    }

    reports: dict[str, dict] = {}
    for i, fill in enumerate(lichen_variants):
        path = FILLS / f"swamp-lichen-v{i}.png"
        fill.save(path)
        gates = norm.gate_report(fill, ramp("lichen"))
        report = {"src": str(path), "material": "lichen", "recipe": "swamp-proc-tuft", "ramp": RAMPS["lichen"], "seed": SEEDS["lichen"][i], "gates": gates}
        reports[f"swamp-lichen-v{i}"] = report
        (ARTIFACTS / f"swamp-lichen-v{i}-gate-report.json").write_text(json.dumps(report, indent=2))
        print(f"{path}: {'PASS' if gates['all_pass'] else 'FAIL'}")

    for material in ("mud", "water", "rock", "plank"):
        path = FILLS / f"swamp-{material}.png"
        fills[material].save(path)
        gates = norm.gate_report(fills[material], ramp(material))
        report = {"src": str(path), "material": material, "recipe": "swamp-proc-normalized", "ramp": RAMPS[material], "seed": SEEDS[material][0], "gates": gates}
        reports[f"swamp-{material}"] = report
        (ARTIFACTS / f"swamp-{material}-gate-report.json").write_text(json.dumps(report, indent=2))
        print(f"{path}: {'PASS' if gates['all_pass'] else 'FAIL'}")

    (ARTIFACTS / "swamp-fill-gate-summary.json").write_text(json.dumps(reports, indent=2))
    make_review_sheets(fills, lichen_variants)

    fills["lichen"].save(SLICED / "swamp-lichen-base.png")
    fills["rock"].save(SLICED / "swamp-rock.png")
    fills["plank"].save(SLICED / "swamp-plank.png")
    make_wang(fills["lichen"], fills["water"], feather=0.12, jit=0.08, collar=ramp("water")[0], salt=2).save(SLICED / "swamp-water-wang.png")
    make_wang(fills["lichen"], fills["mud"], feather=0.14, jit=0.06, collar=ramp("mud")[0], salt=3).save(SLICED / "swamp-path-wang.png")
    print("wrote swamp fills, gate reports, lichen-base / water-wang / path-wang / rock / plank")


if __name__ == "__main__":
    main()
