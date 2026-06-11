#!/usr/bin/env python3
"""Re-material the Northwood source atlases to the approved tuft terrain style.

Emits (originals are never touched):
  assetsources/curated/fills/northwood-grass-v{0..3}.png   tuft grass variants
  assetsources/curated/fills/northwood-road.png            tuft road fill
  assetsources/curated/fills/northwood-water.png           tuft water fill
  assetsources/curated/sliced/plateau-top-v2-tuft.png      re-materialed atlases
  assetsources/curated/sliced/water-wang-tuft.png
  assetsources/curated/sliced/road-wang-tuft.png

Method: per atlas, sample the *material pixel population* from a known all-material
tile (plateau idx0 = grass, water-wang idx15 = water, idx0 = land grass, road-wang
idx5 center band = road), then replace every pixel close to that population with
the corresponding tuft fill pixel at TILE-LOCAL coords (so every map cell gets an
identically-aligned fill and Wang continuity is preserved by construction).
Transition art (rims, foam, collars) is left alone. Replacing the olive plateau
grass AND water-wang's lush land grass with the SAME fill removes the historic
two-greens seam.

Run: python3 tools/rematerial-northwood-atlases.py
Idempotent: reads originals, overwrites -tuft outputs.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SLICED = ROOT / "assetsources/curated/sliced"
FILLS = ROOT / "assetsources/curated/fills"
TS = 32

# load cand_tuft from the candidates tool (filename has dashes -> importlib)
spec = importlib.util.spec_from_file_location("cands", ROOT / "tools/make-terrain-fill-candidates.py")
cands = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cands)  # type: ignore[union-attr]

GRASS_SEEDS = [70, 81, 92, 103]
ROAD_SEED, WATER_SEED = 71, 72


def tile(arr: np.ndarray, idx: int) -> np.ndarray:
    cols = arr.shape[1] // TS
    x, y = (idx % cols) * TS, (idx // cols) * TS
    return arr[y : y + TS, x : x + TS]


def population(px: np.ndarray) -> np.ndarray:
    """Distinct quantized colors of an opaque pixel set (population for matching)."""
    q = (px[:, :3] >> 3).astype(np.int32)
    return np.unique(q[:, 0] * 32 * 32 + q[:, 1] * 32 + q[:, 2])


def close_to_population(arr: np.ndarray, pop: np.ndarray, slack: int = 1) -> np.ndarray:
    """Mask of pixels whose quantized color (±slack quant steps) is in the population."""
    q = (arr[:, :, :3] >> 3).astype(np.int32)
    mask = np.zeros(arr.shape[:2], bool)
    for dr in range(-slack, slack + 1):
        for dg in range(-slack, slack + 1):
            for db in range(-slack, slack + 1):
                key = (
                    np.clip(q[:, :, 0] + dr, 0, 31) * 32 * 32
                    + np.clip(q[:, :, 1] + dg, 0, 31) * 32
                    + np.clip(q[:, :, 2] + db, 0, 31)
                )
                mask |= np.isin(key, pop)
    return mask & (arr[:, :, 3] > 0)


def replace_with_fill(arr: np.ndarray, mask: np.ndarray, fill: np.ndarray) -> None:
    """Replace masked pixels with the fill pixel at tile-local coords."""
    h, w = arr.shape[:2]
    ys, xs = np.nonzero(mask)
    arr[ys, xs, :3] = fill[ys % TS, xs % TS]
    arr[ys, xs, 3] = 255


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)

    grass_fills = []
    for i, seed in enumerate(GRASS_SEEDS):
        f = cands.cand_tuft("grass", seed=seed)
        f.save(FILLS / f"northwood-grass-v{i}.png")
        grass_fills.append(np.asarray(f))
    road_fill = np.asarray(cands.cand_tuft("road", seed=ROAD_SEED))
    Image.fromarray(road_fill).save(FILLS / "northwood-road.png")
    water_fill = np.asarray(cands.cand_tuft("water", seed=WATER_SEED))
    Image.fromarray(water_fill).save(FILLS / "northwood-water.png")
    grass_fill = grass_fills[0]

    # --- plateau-top-v2: olive grass -> tuft grass (rims kept) ----------------
    ptop = np.array(Image.open(SLICED / "plateau-top-v2.png").convert("RGBA"))
    grass_pop = population(tile(ptop, 0).reshape(-1, 4))
    m = close_to_population(ptop, grass_pop)
    replace_with_fill(ptop, m, grass_fill)
    Image.fromarray(ptop).save(SLICED / "plateau-top-v2-tuft.png")
    print(f"plateau-top-v2-tuft: replaced {m.mean()*100:.1f}% of pixels")

    # --- water-wang: water -> tuft water, land grass -> tuft grass (foam kept) -
    ww = np.array(Image.open(SLICED / "water-wang.png").convert("RGBA"))
    water_pop = population(tile(ww, 15).reshape(-1, 4))
    land_pop = population(tile(ww, 0).reshape(-1, 4))
    mw = close_to_population(ww, water_pop)
    ml = close_to_population(ww, land_pop) & ~mw
    replace_with_fill(ww, mw, water_fill)
    replace_with_fill(ww, ml, grass_fill)
    Image.fromarray(ww).save(SLICED / "water-wang-tuft.png")
    print(f"water-wang-tuft: water {mw.mean()*100:.1f}%, land {ml.mean()*100:.1f}%")

    # --- road-wang: road tan -> tuft road (collar kept) -----------------------
    rw = np.array(Image.open(SLICED / "road-wang.png").convert("RGBA"))
    band = tile(rw, 5)[:, 18:25]  # measured pure-road band of the vertical straight
    road_pop = population(band.reshape(-1, 4)[band.reshape(-1, 4)[:, 3] > 0])
    mr = close_to_population(rw, road_pop)
    replace_with_fill(rw, mr, road_fill)
    Image.fromarray(rw).save(SLICED / "road-wang-tuft.png")
    print(f"road-wang-tuft: replaced {mr.mean()*100:.1f}% of pixels")

    # contact sheet for review
    sheet = Image.new("RGB", (3 * (4 * TS * 2 + 10), 2 * (4 * TS * 2 + 10)), (18, 22, 27))
    pairs = [("plateau-top-v2.png", "plateau-top-v2-tuft.png"), ("water-wang.png", "water-wang-tuft.png"), ("road-wang.png", "road-wang-tuft.png")]
    for col, (a, b) in enumerate(pairs):
        for row, name in enumerate((a, b)):
            im = Image.open(SLICED / name).convert("RGB")
            crop = im.crop((0, 0, min(128, im.width), min(128, im.height))).resize((256, 256), Image.NEAREST)
            sheet.paste(crop.resize((4 * TS * 2, 4 * TS * 2), Image.NEAREST), (col * (4 * TS * 2 + 10), row * (4 * TS * 2 + 10)))
    out = ROOT / "artifacts/terrain-style/atlas-rematerial-compare.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
