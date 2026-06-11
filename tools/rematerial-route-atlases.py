#!/usr/bin/env python3
"""Generate route-local grass variants for the Waystone Trail rematerial.

Route reuses Northwood's approved tuft atlases for water/road transitions, but
uses route-local grass fill variants so the open trail fields pass the mechanical
terrain gates while preserving the approved Northwood ramp and quiet tuft method.

Run: python3 tools/rematerial-route-atlases.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FILLS = ROOT / "assetsources/curated/fills"
ARTIFACTS = ROOT / "artifacts/terrain-restyle/route"
TS = 32

spec = importlib.util.spec_from_file_location("norm", ROOT / "tools/normalize-terrain-fill.py")
norm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(norm)  # type: ignore[union-attr]

RAMP_HEX = norm.DEFAULT_RAMPS["grass"]
RAMP = [norm.hex_rgb(c) for c in RAMP_HEX]
SEEDS = [170, 181, 192, 203]


def torus_noise(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = rng.random((TS, TS))
    for _ in range(6):
        n = sum(np.roll(np.roll(n, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9.0
    return (n - n.min()) / max(n.max() - n.min(), 1e-9)


def scatter(rng: np.random.Generator, count: int) -> list[tuple[int, int]]:
    pts: list[tuple[int, int]] = []
    while len(pts) < count:
        x, y = int(rng.integers(0, TS)), int(rng.integers(0, TS))
        if all((min(abs(x - px), TS - abs(x - px)) ** 2 + min(abs(y - py), TS - abs(y - py)) ** 2) > 49 for px, py in pts):
            pts.append((x, y))
    return pts


def px(a: np.ndarray, x: int, y: int, c: tuple[int, int, int]) -> None:
    a[y % TS, x % TS] = c


def route_grass(seed: int) -> Image.Image:
    dark2, dark, base, light, bright = RAMP
    rng = np.random.default_rng(seed)
    a = np.zeros((TS, TS, 3), np.uint8)
    a[:, :] = base

    n = torus_noise(seed + 7)
    lo = tuple(int(v * 0.94) for v in base)
    mask = n < np.quantile(n, 0.36)
    neigh = sum(np.roll(np.roll(mask, dy, 0), dx, 1) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    a[mask & (neigh > 0)] = lo

    for x, y in scatter(rng, 5):
        for dx, dy in [(0, 0), (1, 0), (2, 0), (3, 0), (1, 1), (2, 1)]:
            px(a, x + dx, y + dy, dark2)
        for dx, dy in [(0, -1), (1, -1), (1, -2), (2, -1), (2, -2), (3, -1)]:
            px(a, x + dx, y + dy, dark)
        for dx, dy in [(0, -2), (1, -3), (2, -3), (3, -2)]:
            px(a, x + dx, y + dy, light)
        for dx, dy in [(1, -4), (2, -4)]:
            px(a, x + dx, y + dy, bright)
    return Image.fromarray(a)


def main() -> None:
    FILLS.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    reports = {}
    for i, seed in enumerate(SEEDS):
        im = route_grass(seed)
        out = FILLS / f"route-grass-v{i}.png"
        im.save(out)
        gates = norm.gate_report(im, RAMP)
        reports[f"route-grass-v{i}"] = {"src": str(out), "material": "grass", "ramp": RAMP_HEX, "seed": seed, "gates": gates}
        (ARTIFACTS / f"route-grass-v{i}-gate-report.json").write_text(json.dumps(reports[f"route-grass-v{i}"], indent=2))
        print(f"{out}: {'PASS' if gates['all_pass'] else 'FAIL'}")
    (ARTIFACTS / "route-grass-gate-summary.json").write_text(json.dumps(reports, indent=2))


if __name__ == "__main__":
    main()
