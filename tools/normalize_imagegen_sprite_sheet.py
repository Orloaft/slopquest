#!/usr/bin/env python3
"""Normalize an imagegen magenta sprite sheet into a strict review sheet."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print(
        "error: Pillow is required. Install it with: python3 -m pip install Pillow",
        file=sys.stderr,
    )
    sys.exit(1)


MAGENTA_RGB = (255, 0, 255)
DEFAULT_GRID_SIZE = 4
DEFAULT_OUTPUT_SIZE = 384
DEFAULT_MAX_COLORS = 24
DEFAULT_NEAR_MAGENTA_THRESHOLD = 32


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Convert an imagegen prototype sheet to a strict 384x384 4x4 raw "
            "magenta sheet for tools/review_enemy_sprite_sheet.py. This is for "
            "prototype-source normalization only, not general art cleanup."
        )
    )
    parser.add_argument("--sheet", required=True, help="Input imagegen PNG sheet.")
    parser.add_argument("--out", required=True, help="Output normalized PNG path.")
    parser.add_argument(
        "--grid-size",
        type=int,
        default=DEFAULT_GRID_SIZE,
        help="Number of rows and columns in the square sheet.",
    )
    parser.add_argument(
        "--output-size",
        type=int,
        default=DEFAULT_OUTPUT_SIZE,
        help="Output square sheet size in pixels.",
    )
    parser.add_argument(
        "--max-colors",
        type=int,
        default=DEFAULT_MAX_COLORS,
        help="Target maximum opaque non-magenta colors after quantization.",
    )
    parser.add_argument(
        "--near-magenta-threshold",
        type=int,
        default=DEFAULT_NEAR_MAGENTA_THRESHOLD,
        help=(
            "Maximum per-channel Chebyshev distance from #ff00ff to force back "
            "to exact magenta before resizing."
        ),
    )
    return parser.parse_args()


def is_near_magenta(pixel: tuple[int, int, int], threshold: int) -> bool:
    r, g, b = pixel
    return max(abs(r - 255), abs(g), abs(b - 255)) <= threshold


def normalize_sheet(
    image: Image.Image,
    *,
    grid_size: int,
    output_size: int,
    max_colors: int,
    near_magenta_threshold: int,
) -> Image.Image:
    if image.width != image.height:
        raise ValueError(f"expected a square sheet, got {image.width}x{image.height}")
    if image.width % grid_size != 0:
        raise ValueError(
            f"input width {image.width} is not divisible by grid size {grid_size}"
        )
    if output_size % grid_size != 0:
        raise ValueError(
            f"output size {output_size} is not divisible by grid size {grid_size}"
        )

    source = image.convert("RGB")
    source_cell_size = image.width // grid_size
    output_cell_size = output_size // grid_size
    resampling = getattr(Image, "Resampling", Image).NEAREST

    cleaned = Image.new("RGB", source.size, MAGENTA_RGB)
    source_pixels = source.load()
    cleaned_pixels = cleaned.load()
    for y in range(source.height):
        for x in range(source.width):
            pixel = source_pixels[x, y]
            cleaned_pixels[x, y] = (
                MAGENTA_RGB
                if is_near_magenta(pixel, near_magenta_threshold)
                else pixel
            )

    resized = Image.new("RGB", (output_size, output_size), MAGENTA_RGB)
    for row in range(grid_size):
        for col in range(grid_size):
            left = col * source_cell_size
            top = row * source_cell_size
            cell = cleaned.crop(
                (left, top, left + source_cell_size, top + source_cell_size)
            )
            resized.paste(
                cell.resize((output_cell_size, output_cell_size), resampling),
                (col * output_cell_size, row * output_cell_size),
            )

    background_mask = [pixel == MAGENTA_RGB for pixel in resized.getdata()]
    quantized = resized.quantize(
        colors=max_colors + 1,
        method=Image.Quantize.MEDIANCUT,
    ).convert("RGB")
    normalized_pixels = [
        MAGENTA_RGB if is_background else pixel
        for pixel, is_background in zip(quantized.getdata(), background_mask)
    ]
    normalized = Image.new("RGB", resized.size)
    normalized.putdata(normalized_pixels)
    return normalized


def main() -> int:
    args = parse_args()
    if args.grid_size <= 0:
        print("error: --grid-size must be positive", file=sys.stderr)
        return 1
    if args.output_size <= 0:
        print("error: --output-size must be positive", file=sys.stderr)
        return 1
    if args.max_colors <= 0:
        print("error: --max-colors must be positive", file=sys.stderr)
        return 1
    if args.near_magenta_threshold < 0:
        print("error: --near-magenta-threshold must be non-negative", file=sys.stderr)
        return 1

    sheet_path = Path(args.sheet)
    out_path = Path(args.out)

    try:
        image = Image.open(sheet_path)
        normalized = normalize_sheet(
            image,
            grid_size=args.grid_size,
            output_size=args.output_size,
            max_colors=args.max_colors,
            near_magenta_threshold=args.near_magenta_threshold,
        )
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    normalized.save(out_path)

    non_magenta_colors = {
        pixel for pixel in normalized.getdata() if pixel != MAGENTA_RGB
    }
    near_magenta_pixels = sum(
        1
        for pixel in normalized.getdata()
        if pixel != MAGENTA_RGB and is_near_magenta(pixel, 8)
    )
    print(f"wrote {out_path}")
    print(f"size: {normalized.width}x{normalized.height}")
    print(f"opaque non-magenta colors: {len(non_magenta_colors)}")
    print(f"near-magenta non-background pixels: {near_magenta_pixels}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
