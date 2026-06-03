#!/usr/bin/env python3
"""Slice a magenta-gutter landmark kit sheet into individual transparent tiles.

Image-model kit sheets do NOT land on a pixel-exact grid (the cliff sheet came
in at 288x188 and had to be grid-profiled), so this tool detects the grid by
sweeping for the #FF00FF magenta gutters that separate content blobs, rather
than assuming fixed cell sizes.

Naming: diffusion-rendered text labels are not reliably OCR-able, so output
files are named from a MANIFEST that lists the cell names in row-major reading
order (left-to-right, top-to-bottom) -- the same order the prompt declares.
This keeps naming deterministic instead of guessing at painted glyphs.

Usage:
    python3 tools/slice-searing-canyon-landmarks.py \
        --sheet assetsources/curated/bespoke/searing-canyon-m4-assets/outpost-kit.png \
        --manifest outpost-palisade,outpost-tent,outpost-watchtower,outpost-totem \
        --out public/tilesets/searing-canyon/outpost \
        [--tolerance 24] [--min-blob 64] [--label-strip 0] [--dry-run]

--manifest may be a comma-separated list or a path to a .txt/.json file
(one name per line, or a JSON array). If fewer names than detected cells,
extra cells fall back to <stem>_rNcM positional names and a warning is logged.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHROMA = (255, 0, 255)


def load_manifest(spec: str | None) -> list[str]:
    if not spec:
        return []
    p = ROOT / spec if not Path(spec).is_absolute() else Path(spec)
    if p.exists():
        text = p.read_text(encoding="utf-8").strip()
        if p.suffix == ".json":
            return [str(x) for x in json.loads(text)]
        return [line.strip() for line in text.splitlines() if line.strip()]
    return [s.strip() for s in spec.split(",") if s.strip()]


def content_mask(arr: np.ndarray, tolerance: int) -> np.ndarray:
    """True where a pixel is real content (not within `tolerance` of magenta)."""
    r, g, b = arr[..., 0].astype(int), arr[..., 1].astype(int), arr[..., 2].astype(int)
    dist = np.abs(r - CHROMA[0]) + np.abs(g - CHROMA[1]) + np.abs(b - CHROMA[2])
    near_magenta = dist <= tolerance
    if arr.shape[2] == 4:
        near_magenta |= arr[..., 3] < 16  # already-transparent counts as gutter
    return ~near_magenta


def find_bands(occupied: np.ndarray, min_run: int) -> list[tuple[int, int]]:
    """Group consecutive True indices into (start, end_exclusive) bands."""
    bands: list[tuple[int, int]] = []
    start = None
    for i, v in enumerate(occupied):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_run:
                bands.append((start, i))
            start = None
    if start is not None and len(occupied) - start >= min_run:
        bands.append((start, len(occupied)))
    return bands


def slice_sheet(
    sheet: Path,
    names: list[str],
    out_dir: Path,
    tolerance: int,
    min_blob: int,
    label_strip: int,
    dry_run: bool,
) -> int:
    img = Image.open(sheet).convert("RGBA")
    arr = np.asarray(img)
    mask = content_mask(arr, tolerance)

    # Profile rows -> content bands, then columns within each row band.
    row_occ = mask.any(axis=1)
    row_bands = find_bands(row_occ, min_run=max(2, min_blob // 8))
    if not row_bands:
        print(f"!! no content rows found in {sheet.name} (tolerance={tolerance})", file=sys.stderr)
        return 0

    cells: list[tuple[int, int, int, int]] = []  # (x0,y0,x1,y1) in reading order
    for (ry0, ry1) in row_bands:
        col_occ = mask[ry0:ry1, :].any(axis=0)
        col_bands = find_bands(col_occ, min_run=max(2, min_blob // 8))
        for (cx0, cx1) in col_bands:
            # tighten to the exact content bbox inside this blob
            sub = mask[ry0:ry1, cx0:cx1]
            ys = np.where(sub.any(axis=1))[0]
            xs = np.where(sub.any(axis=0))[0]
            if ys.size == 0 or xs.size == 0:
                continue
            y0, y1 = ry0 + int(ys[0]), ry0 + int(ys[-1]) + 1
            x0, x1 = cx0 + int(xs[0]), cx0 + int(xs[-1]) + 1
            if (x1 - x0) * (y1 - y0) < min_blob:
                continue
            cells.append((x0, y0, x1, y1))

    print(f"== {sheet.name}: {len(cells)} cell(s) across {len(row_bands)} row band(s)")
    if not dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    for idx, (x0, y0, x1, y1) in enumerate(cells):
        if idx < len(names):
            name = names[idx]
        else:
            # positional fallback: which row band did this cell come from?
            rband = next((ri for ri, (a, b) in enumerate(row_bands) if a <= y0 < b), 0)
            name = f"{sheet.stem}_r{rband}c{idx}"
            print(f"!! cell {idx} has no manifest name -> {name}", file=sys.stderr)

        cy0 = min(y0 + label_strip, y1) if label_strip else y0
        crop = img.crop((x0, cy0, x1, y1))
        carr = np.asarray(crop).copy()
        cmask = content_mask(carr, tolerance)
        carr[~cmask, 3] = 0  # punch gutter/label leftovers to transparent
        out_img = Image.fromarray(carr, "RGBA")
        dest = out_dir / f"{name}.png"
        print(f"   [{idx}] {name}.png  {x1 - x0}x{y1 - cy0}  @({x0},{cy0})")
        if not dry_run:
            out_img.save(dest)
            written += 1

    if names and len(cells) != len(names):
        print(
            f"!! manifest/cell mismatch: {len(names)} names vs {len(cells)} cells",
            file=sys.stderr,
        )
    return written


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sheet", required=True, help="path to the kit sheet PNG (magenta-gutter)")
    ap.add_argument("--manifest", default="", help="comma list, or path to .txt/.json of cell names in reading order")
    ap.add_argument("--out", required=True, help="output directory for sliced tiles")
    ap.add_argument("--tolerance", type=int, default=24, help="L1 color distance to treat a pixel as magenta gutter")
    ap.add_argument("--min-blob", type=int, default=64, help="discard content blobs smaller than this many pixels (area)")
    ap.add_argument("--label-strip", type=int, default=0, help="px to trim off the TOP of each cell (baked label row); 0=off")
    ap.add_argument("--dry-run", action="store_true", help="profile and report cells without writing files")
    args = ap.parse_args()

    sheet = ROOT / args.sheet if not Path(args.sheet).is_absolute() else Path(args.sheet)
    if not sheet.exists():
        print(f"sheet not found: {sheet}", file=sys.stderr)
        return 2
    out_dir = ROOT / args.out if not Path(args.out).is_absolute() else Path(args.out)
    names = load_manifest(args.manifest)

    written = slice_sheet(
        sheet, names, out_dir,
        tolerance=args.tolerance,
        min_blob=args.min_blob,
        label_strip=args.label_strip,
        dry_run=args.dry_run,
    )
    print(f"== done: {written} tile(s) written to {out_dir}" if not args.dry_run else "== dry run, nothing written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
