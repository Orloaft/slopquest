#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "assetsources" / "curated" / "bespoke" / "undead-goblin-spec"
PUBLIC = ROOT / "public"

DIRECTIONS = ("up", "right", "down", "left")
COLS = 4
ROWS = 4
CELL_W = 281
CELL_H = 293
OUT_W = CELL_W * COLS
OUT_H = CELL_H * ROWS
CHROMA = (255, 0, 255)


def alpha_from_chroma(im: Image.Image, tolerance: int) -> Image.Image:
    rgba = im.convert("RGBA")
    alpha = rgba.getchannel("A")
    if alpha.getextrema()[0] < 255:
        return rgba
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if abs(r - CHROMA[0]) <= tolerance and abs(g - CHROMA[1]) <= tolerance and abs(b - CHROMA[2]) <= tolerance:
                pixels[x, y] = (r, g, b, 0)
            elif a > 0:
                pixels[x, y] = (r, g, b, 255)
    return rgba


def normalize_grid(im: Image.Image) -> Image.Image:
    src = im.convert("RGBA")
    src_cell_w = src.width // COLS
    src_cell_h = src.height // ROWS
    out = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            cell = src.crop((col * src_cell_w, row * src_cell_h, (col + 1) * src_cell_w, (row + 1) * src_cell_h))
            resized = cell.resize((CELL_W, CELL_H), Image.Resampling.LANCZOS)
            out.alpha_composite(resized, (col * CELL_W, row * CELL_H))
    return out


def opaque_bbox(im: Image.Image) -> tuple[int, int, int, int] | None:
    return im.getchannel("A").getbbox()


def validate_sheet(sheet: Image.Image) -> dict:
    cells: list[dict] = []
    empty: list[str] = []
    for row, direction in enumerate(DIRECTIONS):
        for col in range(COLS):
            cell = sheet.crop((col * CELL_W, row * CELL_H, (col + 1) * CELL_W, (row + 1) * CELL_H))
            bbox = opaque_bbox(cell)
            if bbox is None:
                empty.append(f"{direction}_{col}")
                continue
            cells.append({
                "direction": direction,
                "frame": col,
                "bbox": bbox,
                "coverage": round(sum(1 for value in cell.getchannel("A").getdata() if value > 0) / (CELL_W * CELL_H), 4),
            })
    if empty:
        raise RuntimeError(f"empty cells: {', '.join(empty)}")
    return {
        "size": [sheet.width, sheet.height],
        "cell": [CELL_W, CELL_H],
        "rows": list(DIRECTIONS),
        "frames_per_direction": COLS,
        "cells": cells,
    }


def write_preview_gifs(sheet: Image.Image, out_dir: Path, slug: str) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    result: dict[str, str] = {}
    bg = Image.new("RGBA", (CELL_W, CELL_H), (28, 32, 38, 255))
    for row, direction in enumerate(DIRECTIONS):
        frames = []
        for col in range(COLS):
            cell = sheet.crop((col * CELL_W, row * CELL_H, (col + 1) * CELL_W, (row + 1) * CELL_H))
            frame = bg.copy()
            frame.alpha_composite(cell)
            frames.append(frame.convert("RGB"))
        path = out_dir / f"{slug}_{direction}_walk_preview.gif"
        frames[0].save(path, save_all=True, append_images=frames[1:], duration=125, loop=0, optimize=False, disposal=2)
        with Image.open(path) as gif:
            count = sum(1 for _ in ImageSequence.Iterator(gif))
        if count != COLS:
            raise RuntimeError(f"{path} has {count} frames, expected {COLS}")
        result[direction] = str(path)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("slug")
    parser.add_argument("input")
    parser.add_argument("--chroma-tolerance", type=int, default=20)
    args = parser.parse_args()

    slug = args.slug.replace("-", "_")
    source = Path(args.input)
    enemy_dir = SOURCE_ROOT / slug
    enemy_dir.mkdir(parents=True, exist_ok=True)

    raw = Image.open(source)
    raw_copy = enemy_dir / f"{slug}_generated_raw.png"
    raw.save(raw_copy)

    keyed = alpha_from_chroma(raw, args.chroma_tolerance)
    normalized = normalize_grid(keyed)
    validation = validate_sheet(normalized)

    curated = enemy_dir / f"{slug}_goblin_spec_sheet.png"
    public = PUBLIC / f"{slug.replace('_', '-')}-sheet.png"
    normalized.save(curated)
    normalized.save(public)

    previews = write_preview_gifs(normalized, enemy_dir, slug)
    report = {
        "source": str(source),
        "raw_copy": str(raw_copy),
        "curated_sheet": str(curated),
        "public_sheet": str(public),
        "previews": previews,
        "validation": validation,
    }
    report_path = enemy_dir / f"{slug}_goblin_spec_report.json"
    report_path.write_text(json.dumps(report, indent=2))
    print(json.dumps({"public_sheet": str(public), "report": str(report_path), "previews": previews}, indent=2))


if __name__ == "__main__":
    main()
