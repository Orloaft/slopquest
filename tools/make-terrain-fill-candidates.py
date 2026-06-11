#!/usr/bin/env python3
"""Generate bible-compliant terrain fill candidates for the Northwood re-material pilot.

Three candidate styles per material (grass / road / water):
  quant  - existing atlas tile, median-cut quantized + mode-filtered into clusters
  proc   - procedural torus-noise clusters mapped onto a fixed 5-color ramp
  motif  - flat base + sparse hand-style motifs (tufts / pebbles / glints)

All outputs are seamless 32px fills, <=16 colors, deterministic (fixed seeds).
Outputs: artifacts/terrain-style/fills/<material>-<style>.png (32px each)
         artifacts/terrain-style/terrain-fill-candidates.png (review contact sheet)

Usage: python3 tools/make-terrain-fill-candidates.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ATLAS = ROOT / "public/tilesets/northwood/forest.png"
OUT = ROOT / "artifacts/terrain-style"
TS = 32
ATLAS_COLS = 24

# anchor colors (sampled from the live atlas / Alex's approved lush green)
RAMPS = {
    # dark -> light, 5 steps around each anchor
    "grass": ["#426212", "#557916", "#698f1c", "#769e23", "#86b02e"],
    "road": ["#a06a22", "#c4882c", "#e3a036", "#edb14d", "#f5c168"],
    "water": ["#04506e", "#066382", "#087595", "#1587a6", "#2f9fb8"],
}
# source for the "quant" candidate / "current" reference per material.
# grass = atlas tile; road/water = curated Wang atlas mask-15 (pure interior fill —
# baked atlas tiles all carry composited grass/shore context, no clean fill exists there)
QUANT_SRC = {"grass": ("atlas", 1), "road": ("wang", "road-wang.png"), "water": ("wang", "water-wang.png")}


def quant_source(material: str) -> Image.Image:
    kind, ref = QUANT_SRC[material]
    if kind == "atlas":
        return atlas_tile(ref)
    wang = Image.open(ROOT / "assetsources/curated/sliced" / ref).convert("RGB")
    if material == "road":
        # road-wang mask-15 is a donut (roads composite over grass) — build a fill from
        # the vertical-straight tile's only pure-road band (measured: x 18-24 of mask 5)
        band = wang.crop((32 + 18, 32, 32 + 26, 64))  # 8x32, tiles vertically
        fill = Image.new("RGB", (TS, TS))
        for i in range(4):
            fill.paste(band, (i * 8, 0))
        return fill
    return wang.crop((96, 96, 128, 128))  # idx 15 in a 4x4 @32px atlas = full interior


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def atlas_tile(idx: int) -> Image.Image:
    at = Image.open(ATLAS).convert("RGB")
    x, y = (idx % ATLAS_COLS) * TS, (idx // ATLAS_COLS) * TS
    return at.crop((x, y, x + TS, y + TS))


def count_colors(im: Image.Image) -> int:
    return len(set(im.convert("RGB").getdata()))


# ---------------------------------------------------------------- candidates
def cand_quant(material: str, colors: int = 14) -> Image.Image:
    """Existing tile -> restrained palette + mode filter to form pixel clusters."""
    src = quant_source(material)
    q = src.quantize(colors=colors, method=Image.MEDIANCUT).convert("RGB")
    # mode filter merges lone pixels into clusters; run twice for chunkier reads
    q = q.filter(ImageFilter.ModeFilter(3)).filter(ImageFilter.ModeFilter(3))
    # re-quantize: mode filtering can only keep existing colors, but be strict
    return q.quantize(colors=colors, method=Image.MEDIANCUT).convert("RGB")


def torus_noise(seed: int, octaves: int = 3) -> np.ndarray:
    """Smooth value noise on a torus (seamless), normalized 0..1."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((TS, TS))
    for o in range(octaves):
        n = rng.random((TS, TS))
        # periodic box blur; more passes for low octaves = bigger blobs
        passes = (octaves - o) * 3
        for _ in range(passes):
            n = sum(np.roll(np.roll(n, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9.0
        acc += n * (2.0 ** -o)
    acc -= acc.min()
    return acc / max(acc.max(), 1e-9)


def cand_proc(material: str, seed: int) -> Image.Image:
    """Torus-noise clusters mapped to the 5-color ramp (mid-heavy distribution)."""
    base = hex_rgb(RAMPS[material][2])
    # halve contrast vs the raw ramp: ground must stay quieter than sprites
    ramp = [tuple((v + b) // 2 for v, b in zip(hex_rgb(c), base)) for c in RAMPS[material]]
    n = torus_noise(seed)
    # mid-heavy quantile cuts: ground should be quiet, extremes sparse
    cuts = np.quantile(n, [0.06, 0.26, 0.82, 0.96])
    idx = np.digitize(n, cuts)
    out = np.zeros((TS, TS, 3), np.uint8)
    for i, c in enumerate(ramp):
        out[idx == i] = c
    return Image.fromarray(out)


def _scatter(rng: np.random.Generator, count: int, margin: int = 2) -> list[tuple[int, int]]:
    pts: list[tuple[int, int]] = []
    while len(pts) < count:
        x, y = int(rng.integers(0, TS)), int(rng.integers(0, TS))
        if all((min(abs(x - px), TS - abs(x - px)) ** 2 + min(abs(y - py), TS - abs(y - py)) ** 2) > 36 for px, py in pts):
            pts.append((x, y))
    return pts


def _px(a: np.ndarray, x: int, y: int, c: tuple[int, int, int]) -> None:
    a[y % TS, x % TS] = c  # wrap = seamless motifs across tile edges


def cand_motif(material: str, seed: int) -> Image.Image:
    """Flat base + sparse classic motifs (GBA-era read)."""
    ramp = [hex_rgb(c) for c in RAMPS[material]]
    dark2, dark, base, light, bright = ramp
    a = np.zeros((TS, TS, 3), np.uint8)
    a[:, :] = base
    rng = np.random.default_rng(seed)
    if material == "grass":
        for x, y in _scatter(rng, 5):  # tufts: small dark 'v' + light tip
            _px(a, x, y, dark); _px(a, x + 2, y, dark)
            _px(a, x + 1, y + 1, dark); _px(a, x + 1, y, light)
        for x, y in _scatter(rng, 3):  # lone blades
            _px(a, x, y, dark2)
    elif material == "road":
        # faint wheel-worn horizontal banding
        for y in range(TS):
            if y % 8 in (3, 4):
                a[y, :] = tuple(int(v * 0.96) for v in base)
        for x, y in _scatter(rng, 4):  # pebbles: dark blob, light top-left
            _px(a, x, y, dark); _px(a, x + 1, y, dark)
            _px(a, x, y + 1, dark2); _px(a, x + 1, y + 1, dark2)
            _px(a, x, y - 1, light)
    elif material == "water":
        # subtle deep-water blotches from big-blob noise
        n = torus_noise(seed + 100, octaves=1)
        a[n < np.quantile(n, 0.25)] = dark
        for x, y in _scatter(rng, 4):  # sparkle dashes
            _px(a, x, y, bright); _px(a, x + 1, y, bright)
            _px(a, x + 2, y, light)
    return Image.fromarray(a)


def cand_tuft(material: str, seed: int) -> Image.Image:
    """SLYNYRD/Stardew recipe: quiet 2-value base mottle + drawn clusters that never
    touch + negative space. Detail scale matches sprite pixel clusters (2-4px)."""
    ramp = [hex_rgb(c) for c in RAMPS[material]]
    dark2, dark, base, light, bright = ramp
    rng = np.random.default_rng(seed)
    a = np.zeros((TS, TS, 3), np.uint8)
    # base: large soft patches of two near-identical values (visual weight stays even)
    n = torus_noise(seed + 7, octaves=1)
    lo = tuple(int(v * 0.94) for v in base)
    a[:, :] = base
    a[n < np.quantile(n, 0.45)] = lo
    if material == "grass":
        # drawn tufts: 3-5 short vertical strokes, shadow base, lit top-left tip
        for x, y in _scatter(rng, 6, margin=3):
            for dx, tall in ((0, 2), (2, 3), (4, 2)):
                for dy in range(tall):
                    _px(a, x + dx, y - dy, dark if dy < tall - 1 else light)
            _px(a, x + 2, y - 3, bright)  # lit tip on the tallest blade
            _px(a, x + 1, y + 1, dark2); _px(a, x + 3, y + 1, dark2)  # root shadow
        for x, y in _scatter(rng, 3):  # sparse single-blade accents (corner-touch ok)
            _px(a, x, y, dark); _px(a, x, y - 1, light)
    elif material == "road":
        # packed dirt: faint ruts + small drawn stones with top-left light
        for y in range(TS):
            if y % 11 in (4, 5):
                a[y, :] = tuple(int(v * 0.95) for v in a[y, 0])
        for x, y in _scatter(rng, 4, margin=3):
            _px(a, x, y, dark); _px(a, x + 1, y, dark)
            _px(a, x + 1, y + 1, dark2)
            _px(a, x, y - 1, light)
        for x, y in _scatter(rng, 3):
            _px(a, x, y, dark2)
    elif material == "water":
        # calm water: soft depth patches + drawn wave glints (2px dash + 1px tail)
        deep = torus_noise(seed + 21, octaves=1)
        a[deep < np.quantile(deep, 0.3)] = dark
        for x, y in _scatter(rng, 5, margin=3):
            _px(a, x, y, bright); _px(a, x + 1, y, bright)
            _px(a, x + 2, y + 1, light)
    return Image.fromarray(a)


# ------------------------------------------------------------- contact sheet
def tiled(im: Image.Image, n: int = 4, zoom: int = 2) -> Image.Image:
    w = TS * n
    big = Image.new("RGB", (w, w))
    for j in range(n):
        for i in range(n):
            big.paste(im, (i * TS, j * TS))
    return big.resize((w * zoom, w * zoom), Image.NEAREST)


def label(canvas: Image.Image, xy: tuple[int, int], text: str) -> None:
    from PIL import ImageDraw

    d = ImageDraw.Draw(canvas)
    d.text((xy[0] + 1, xy[1] + 1), text, fill=(0, 0, 0))
    d.text(xy, text, fill=(230, 230, 230))


def main() -> None:
    fills_dir = OUT / "fills"
    fills_dir.mkdir(parents=True, exist_ok=True)

    materials = ["grass", "road", "water"]
    styles = ["current", "quant", "proc", "motif", "tuft"]
    cell = TS * 4 * 2  # tiled() output size
    pad, head = 10, 18
    canvas = Image.new("RGB", (pad + len(styles) * (cell + pad), pad + len(materials) * (cell + head + pad) + 200), (18, 22, 27))

    report: list[str] = []
    for r, mat in enumerate(materials):
        tiles = {
            "current": quant_source(mat),
            "quant": cand_quant(mat),
            "proc": cand_proc(mat, seed=7 + r),
            "motif": cand_motif(mat, seed=40 + r),
            "tuft": cand_tuft(mat, seed=70 + r),
        }
        for c, style in enumerate(styles):
            im = tiles[style]
            if style != "current":
                im.save(fills_dir / f"{mat}-{style}.png")
            ncol = count_colors(im)
            report.append(f"{mat}-{style}: {ncol} colors")
            x = pad + c * (cell + pad)
            y = pad + r * (cell + head + pad)
            label(canvas, (x, y), f"{mat} / {style}  ({ncol} colors)")
            canvas.paste(tiled(im), (x, y + head))

    # harmony strips: old proc grass (no shadows) vs tuft grass (contact shadows)
    from PIL import ImageDraw

    def keyed_sprite(sheet_name: str) -> Image.Image | None:
        try:
            sheet = Image.open(ROOT / "public" / sheet_name).convert("RGBA")
        except FileNotFoundError:
            report.append(f"{sheet_name} not found for harmony strip")
            return None
        cw, ch = sheet.width // 4, sheet.height // 4
        spr = sheet.crop((0, 2 * ch, cw, 3 * ch))
        sa = np.array(spr)
        magenta = (sa[:, :, 0] > 180) & (sa[:, :, 2] > 180) & (sa[:, :, 1] < 120)
        sa[magenta, 3] = 0
        return Image.fromarray(sa)

    def shadow(strip: Image.Image, cx: int, cy: int, w: int) -> None:
        ov = Image.new("RGBA", strip.size, (0, 0, 0, 0))
        ImageDraw.Draw(ov).ellipse((cx - w // 2, cy - w // 6, cx + w // 2, cy + w // 6), fill=(20, 30, 10, 90))
        strip.alpha_composite(ov)

    def build_strip(grass: Image.Image, with_shadows: bool) -> Image.Image:
        strip = tiled(grass, n=6, zoom=2).convert("RGBA")
        tree = None
        try:
            tree = Image.open(ROOT / "public/sprites/nw/obj_007.png").convert("RGBA")
            tree = tree.resize((tree.width // 2, tree.height // 2), Image.NEAREST)
        except FileNotFoundError:
            pass
        sprites = [(150, "reach-vole-sheet.png"), (270, "reach-hen-sheet.png")]
        if with_shadows:
            if tree is not None:
                shadow(strip, 12 + tree.width // 2, 8 + tree.height - 6, tree.width - 10)
            for x_at, name in sprites:
                spr = keyed_sprite(name)
                if spr is not None:
                    shadow(strip, x_at + spr.width // 2, 30 + spr.height - 12, spr.width - 24)
        if tree is not None:
            strip.paste(tree, (12, 8), tree)
        for x_at, name in sprites:
            spr = keyed_sprite(name)
            if spr is not None:
                strip.paste(spr, (x_at, 30), spr)
        return strip.convert("RGB")

    y0 = pad + len(materials) * (cell + head + pad)
    label(canvas, (pad, y0), "harmony A: proc grass, no shadows  |  harmony B: tuft grass + contact shadows")
    strip_a = build_strip(cand_proc("grass", seed=7), with_shadows=False)
    strip_b = build_strip(cand_tuft("grass", seed=70), with_shadows=True)
    strip = Image.new("RGB", (strip_a.width + strip_b.width + pad, max(strip_a.height, strip_b.height)), (18, 22, 27))
    strip.paste(strip_a, (0, 0))
    strip.paste(strip_b, (strip_a.width + pad, 0))
    canvas.paste(strip.crop((0, 0, min(strip.width, canvas.width - 2 * pad), 170)), (pad, y0 + head))

    out_path = OUT / "terrain-fill-candidates.png"
    canvas.save(out_path)
    print("\n".join(report))
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
