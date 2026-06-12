#!/usr/bin/env python3
"""Review and key a 4x4 enemy sprite sheet with magenta background."""

from __future__ import annotations

import argparse
import json
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


EXPECTED_SIZE = (384, 384)
GRID_SIZE = 4
CELL_SIZE = 96
DEFAULT_RUNTIME_CELL_SIZE = (32, 32)
DEFAULT_MAX_COLORS = 24
MAGENTA_RGB = (255, 0, 255)
NEAR_MAGENTA_MAX_DELTA = 8
DARK_BG_RGB = (24, 26, 30)
CHECKER_BG_RGB = (44, 47, 54)
CHECKER_TILE_SIZE = 12
ROW_DIRECTIONS = ("up", "right", "down", "left")
NEAR_STATIC_ROW_MAX_MOTION = 0.015
MIRROR_SIMILARITY_WARNING_MIN = 0.9
ROW_BBOX_SIZE_VARIANCE_RATIO = 0.25
ROW_BBOX_CENTER_VARIANCE_PIXELS = 8
ROW_BBOX_BASELINE_VARIANCE_PIXELS = 6


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate a 384x384 4x4 enemy sprite sheet and key out #ff00ff."
    )
    parser.add_argument("--sheet", required=True, help="Input PNG sprite sheet.")
    parser.add_argument("--out-dir", required=True, help="Directory for outputs.")
    parser.add_argument("--slug", required=True, help="Output filename slug.")
    parser.add_argument(
        "--max-colors",
        type=int,
        default=DEFAULT_MAX_COLORS,
        help="Maximum opaque non-magenta palette colors allowed in the keyed image.",
    )
    parser.add_argument(
        "--runtime-width",
        type=int,
        default=DEFAULT_RUNTIME_CELL_SIZE[0],
        help="Runtime review cell width for the scaled contact sheet.",
    )
    parser.add_argument(
        "--runtime-height",
        type=int,
        default=DEFAULT_RUNTIME_CELL_SIZE[1],
        help="Runtime review cell height for the scaled contact sheet.",
    )
    parser.add_argument(
        "--strict-prototype",
        action="store_true",
        help=(
            "Promote near-static rows, suspicious right/left mirror similarity, "
            "and near-magenta fringe from warnings to failures."
        ),
    )
    return parser.parse_args()


def count_cell_pixels(image: Image.Image) -> list[list[int]]:
    counts: list[list[int]] = []
    pixels = image.load()
    for row in range(GRID_SIZE):
        row_counts: list[int] = []
        for col in range(GRID_SIZE):
            count = 0
            x0 = col * CELL_SIZE
            y0 = row * CELL_SIZE
            for y in range(y0, y0 + CELL_SIZE):
                for x in range(x0, x0 + CELL_SIZE):
                    r, g, b, _a = pixels[x, y]
                    if (r, g, b) != MAGENTA_RGB:
                        count += 1
            row_counts.append(count)
        counts.append(row_counts)
    return counts


def find_cell_bounding_boxes(image: Image.Image) -> list[list[dict[str, int | None]]]:
    boxes: list[list[dict[str, int | None]]] = []
    pixels = image.load()
    for row in range(GRID_SIZE):
        row_boxes: list[dict[str, int | None]] = []
        for col in range(GRID_SIZE):
            min_x = CELL_SIZE
            min_y = CELL_SIZE
            max_x = -1
            max_y = -1
            x0 = col * CELL_SIZE
            y0 = row * CELL_SIZE
            for y in range(y0, y0 + CELL_SIZE):
                for x in range(x0, x0 + CELL_SIZE):
                    r, g, b, _a = pixels[x, y]
                    if (r, g, b) != MAGENTA_RGB:
                        local_x = x - x0
                        local_y = y - y0
                        min_x = min(min_x, local_x)
                        min_y = min(min_y, local_y)
                        max_x = max(max_x, local_x)
                        max_y = max(max_y, local_y)
            if max_x < 0:
                row_boxes.append(
                    {
                        "x": None,
                        "y": None,
                        "width": 0,
                        "height": 0,
                        "right": None,
                        "bottom": None,
                    }
                )
            else:
                row_boxes.append(
                    {
                        "x": min_x,
                        "y": min_y,
                        "width": max_x - min_x + 1,
                        "height": max_y - min_y + 1,
                        "right": max_x,
                        "bottom": max_y,
                    }
                )
        boxes.append(row_boxes)
    return boxes


def cell_mask(image: Image.Image, row: int, col: int) -> set[tuple[int, int]]:
    mask: set[tuple[int, int]] = set()
    pixels = image.load()
    x0 = col * CELL_SIZE
    y0 = row * CELL_SIZE
    for y in range(CELL_SIZE):
        for x in range(CELL_SIZE):
            r, g, b, _a = pixels[x0 + x, y0 + y]
            if (r, g, b) != MAGENTA_RGB:
                mask.add((x, y))
    return mask


def analyze_row_motion(image: Image.Image) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for row, direction in enumerate(ROW_DIRECTIONS):
        masks = [cell_mask(image, row, col) for col in range(GRID_SIZE)]
        pair_scores: list[float] = []
        pair_changed_pixels: list[int] = []
        pair_union_pixels: list[int] = []
        for left, right in zip(masks, masks[1:]):
            changed = len(left.symmetric_difference(right))
            union = len(left | right)
            pair_changed_pixels.append(changed)
            pair_union_pixels.append(union)
            pair_scores.append(round(changed / union, 4) if union else 0.0)
        average_score = (
            round(sum(pair_scores) / len(pair_scores), 4) if pair_scores else 0.0
        )
        rows.append(
            {
                "row": row,
                "direction": direction,
                "average_mask_difference": average_score,
                "pair_mask_differences": pair_scores,
                "pair_changed_pixels": pair_changed_pixels,
                "pair_union_pixels": pair_union_pixels,
            }
        )
    return rows


def analyze_row_bbox_variance(
    boxes: list[list[dict[str, int | None]]],
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for row, direction in enumerate(ROW_DIRECTIONS):
        row_boxes = [box for box in boxes[row] if box["x"] is not None]
        widths = [int(box["width"] or 0) for box in row_boxes]
        heights = [int(box["height"] or 0) for box in row_boxes]
        centers_x = [
            float(box["x"] or 0) + (float(box["width"] or 0) / 2.0)
            for box in row_boxes
        ]
        bottoms = [int(box["bottom"] or 0) for box in row_boxes]

        def value_range(values: list[int] | list[float]) -> float:
            return float(max(values) - min(values)) if values else 0.0

        mean_width = sum(widths) / len(widths) if widths else 0.0
        mean_height = sum(heights) / len(heights) if heights else 0.0
        width_range = value_range(widths)
        height_range = value_range(heights)
        center_x_range = value_range(centers_x)
        baseline_range = value_range(bottoms)
        rows.append(
            {
                "row": row,
                "direction": direction,
                "width_range": round(width_range, 2),
                "height_range": round(height_range, 2),
                "center_x_range": round(center_x_range, 2),
                "baseline_range": round(baseline_range, 2),
                "width_range_ratio": round(width_range / mean_width, 4)
                if mean_width
                else 0.0,
                "height_range_ratio": round(height_range / mean_height, 4)
                if mean_height
                else 0.0,
            }
        )
    return rows


def compare_right_left_mirror(image: Image.Image) -> dict[str, object]:
    right_row = ROW_DIRECTIONS.index("right")
    left_row = ROW_DIRECTIONS.index("left")
    frame_scores: list[float] = []
    for col in range(GRID_SIZE):
        right_mask = {
            (CELL_SIZE - 1 - x, y) for x, y in cell_mask(image, right_row, col)
        }
        left_mask = cell_mask(image, left_row, col)
        union = len(right_mask | left_mask)
        score = (
            1.0 - (len(right_mask.symmetric_difference(left_mask)) / union)
            if union
            else 0.0
        )
        frame_scores.append(round(score, 4))
    average_score = round(sum(frame_scores) / len(frame_scores), 4) if frame_scores else 0.0
    return {
        "rows": {"right": right_row, "left": left_row},
        "average_similarity": average_score,
        "frame_similarities": frame_scores,
    }


def key_magenta(image: Image.Image) -> Image.Image:
    keyed = image.copy()
    pixels = keyed.load()
    width, height = keyed.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if (r, g, b) == MAGENTA_RGB:
                pixels[x, y] = (r, g, b, 0)
            else:
                pixels[x, y] = (r, g, b, a)
    return keyed


def count_exact_magenta_pixels(image: Image.Image) -> int:
    count = 0
    for r, g, b, _a in image.getdata():
        if (r, g, b) == MAGENTA_RGB:
            count += 1
    return count


def is_near_magenta(r: int, g: int, b: int) -> bool:
    return (
        (r, g, b) != MAGENTA_RGB
        and abs(r - MAGENTA_RGB[0]) <= NEAR_MAGENTA_MAX_DELTA
        and abs(g - MAGENTA_RGB[1]) <= NEAR_MAGENTA_MAX_DELTA
        and abs(b - MAGENTA_RGB[2]) <= NEAR_MAGENTA_MAX_DELTA
    )


def count_near_magenta_pixels(image: Image.Image) -> int:
    count = 0
    for r, g, b, _a in image.getdata():
        if is_near_magenta(r, g, b):
            count += 1
    return count


def count_opaque_non_magenta_palette_colors(image: Image.Image) -> int:
    colors: set[tuple[int, int, int]] = set()
    for r, g, b, a in image.getdata():
        if a > 0 and (r, g, b) != MAGENTA_RGB:
            colors.add((r, g, b))
    return len(colors)


def check_transparent_corners(image: Image.Image) -> tuple[bool, list[dict[str, object]]]:
    width, height = image.size
    corners = [
        ("top_left", 0, 0),
        ("top_right", width - 1, 0),
        ("bottom_left", 0, height - 1),
        ("bottom_right", width - 1, height - 1),
    ]
    results: list[dict[str, object]] = []
    for name, x, y in corners:
        alpha = image.getpixel((x, y))[3]
        results.append({"name": name, "transparent": alpha == 0})
    return all(corner["transparent"] for corner in results), results


def make_checker_background(size: tuple[int, int]) -> Image.Image:
    background = Image.new("RGBA", size, DARK_BG_RGB + (255,))
    pixels = background.load()
    width, height = size
    for y in range(height):
        for x in range(width):
            if ((x // CHECKER_TILE_SIZE) + (y // CHECKER_TILE_SIZE)) % 2:
                pixels[x, y] = CHECKER_BG_RGB + (255,)
    return background


def crop_cell(image: Image.Image, row: int, col: int) -> Image.Image:
    x0 = col * CELL_SIZE
    y0 = row * CELL_SIZE
    return image.crop((x0, y0, x0 + CELL_SIZE, y0 + CELL_SIZE))


def write_contact_sheet(keyed: Image.Image, path: Path) -> None:
    contact = make_checker_background(EXPECTED_SIZE)
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            cell = crop_cell(keyed, row, col)
            contact.alpha_composite(cell, (col * CELL_SIZE, row * CELL_SIZE))
    contact.save(path)


def resize_nearest(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    resampling = getattr(Image, "Resampling", Image).NEAREST
    return image.resize(size, resampling)


def write_runtime_contact_sheet(
    keyed: Image.Image,
    path: Path,
    runtime_size: tuple[int, int],
) -> None:
    runtime_width, runtime_height = runtime_size
    contact_size = (runtime_width * GRID_SIZE, runtime_height * GRID_SIZE)
    contact = make_checker_background(contact_size)
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            cell = resize_nearest(crop_cell(keyed, row, col), runtime_size)
            contact.alpha_composite(cell, (col * runtime_width, row * runtime_height))
    contact.save(path)


def render_cell_on_dark(cell: Image.Image) -> Image.Image:
    frame = Image.new("RGBA", cell.size, DARK_BG_RGB + (255,))
    frame.alpha_composite(cell)
    return frame.convert("P", palette=Image.Palette.ADAPTIVE)


def write_row_gifs(keyed: Image.Image, slug: str, out_dir: Path) -> list[Path]:
    gif_paths: list[Path] = []
    for row, direction in enumerate(ROW_DIRECTIONS):
        frames = [
            render_cell_on_dark(crop_cell(keyed, row, col)) for col in range(GRID_SIZE)
        ]
        gif_path = out_dir / f"{slug}-walk-{direction}.gif"
        frames[0].save(
            gif_path,
            save_all=True,
            append_images=frames[1:],
            duration=160,
            loop=0,
            disposal=2,
        )
        gif_paths.append(gif_path)
    return gif_paths


def write_report(
    path: Path,
    keyed_png: Path,
    artifacts: dict[str, object],
    dimensions: tuple[int, int] | None,
    counts: list[list[int]],
    bounding_boxes: list[list[dict[str, int | None]]],
    row_motion_scores: list[dict[str, object]],
    row_bbox_variance: list[dict[str, object]],
    right_left_mirror_similarity: dict[str, object] | None,
    exact_magenta_pixel_count: int,
    exact_magenta_percentage: float,
    near_magenta_pixel_count: int,
    palette_count: int | None,
    max_colors: int,
    runtime_size: tuple[int, int],
    strict_prototype: bool,
    transparent_corners: bool | None,
    transparent_corner_results: list[dict[str, object]],
    passed: bool,
    errors: list[str],
    warnings: list[str],
) -> None:
    width, height = dimensions if dimensions else (None, None)
    report = {
        "dimensions": {"width": width, "height": height},
        "cell_size": {"width": CELL_SIZE, "height": CELL_SIZE},
        "per_cell_non_magenta_counts": counts,
        "per_cell_bounding_boxes": bounding_boxes,
        "row_motion_scores": row_motion_scores,
        "row_bbox_variance": row_bbox_variance,
        "right_left_mirror_similarity": right_left_mirror_similarity,
        "exact_magenta_pixel_count": exact_magenta_pixel_count,
        "exact_magenta_percentage": exact_magenta_percentage,
        "near_magenta_pixel_count": near_magenta_pixel_count,
        "palette_count": palette_count,
        "max_colors": max_colors,
        "runtime_cell_size": {
            "width": runtime_size[0],
            "height": runtime_size[1],
        },
        "strict_prototype": strict_prototype,
        "transparent_corners": transparent_corners,
        "transparent_corner_list": transparent_corner_results,
        "pass": passed,
        "errors": errors,
        "warnings": warnings,
        "keyed_png": str(keyed_png),
        "artifacts": artifacts,
    }
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    sheet_path = Path(args.sheet)
    out_dir = Path(args.out_dir)
    keyed_png = out_dir / f"{args.slug}-keyed.png"
    contact_png = out_dir / f"{args.slug}-contact.png"
    runtime_contact_png = out_dir / f"{args.slug}-runtime-contact.png"
    runtime_size = (args.runtime_width, args.runtime_height)
    artifacts: dict[str, object] = {
        "keyed_png": str(keyed_png),
        "contact_png": str(contact_png),
        "runtime_contact_png": str(runtime_contact_png),
        "row_gifs": {
            direction: str(out_dir / f"{args.slug}-walk-{direction}.gif")
            for direction in ROW_DIRECTIONS
        },
    }
    report_path = out_dir / f"{args.slug}-gate-report.json"
    errors: list[str] = []
    warnings: list[str] = []
    counts: list[list[int]] = []
    bounding_boxes: list[list[dict[str, int | None]]] = []
    row_motion_scores: list[dict[str, object]] = []
    row_bbox_variance: list[dict[str, object]] = []
    right_left_mirror_similarity: dict[str, object] | None = None
    exact_magenta_pixel_count = 0
    exact_magenta_percentage = 0.0
    near_magenta_pixel_count = 0
    palette_count: int | None = None
    transparent_corners: bool | None = None
    transparent_corner_results: list[dict[str, object]] = []

    if args.max_colors <= 0:
        errors.append("--max-colors must be positive")
    if args.runtime_width <= 0 or args.runtime_height <= 0:
        errors.append("--runtime-width and --runtime-height must be positive")

    def flag_review_issue(message: str, *, strict_failure: bool) -> None:
        if args.strict_prototype and strict_failure:
            errors.append(message)
        else:
            warnings.append(message)

    try:
        image = Image.open(sheet_path).convert("RGBA")
    except Exception as exc:
        errors.append(f"failed to open sheet as image: {exc}")
        out_dir.mkdir(parents=True, exist_ok=True)
        write_report(
            report_path,
            keyed_png,
            artifacts,
            None,
            counts,
            bounding_boxes,
            row_motion_scores,
            row_bbox_variance,
            right_left_mirror_similarity,
            exact_magenta_pixel_count,
            exact_magenta_percentage,
            near_magenta_pixel_count,
            palette_count,
            args.max_colors,
            runtime_size,
            args.strict_prototype,
            transparent_corners,
            transparent_corner_results,
            False,
            errors,
            warnings,
        )
        return 1

    total_pixels = image.size[0] * image.size[1]
    exact_magenta_pixel_count = count_exact_magenta_pixels(image)
    exact_magenta_percentage = (
        round((exact_magenta_pixel_count / total_pixels) * 100, 4) if total_pixels else 0.0
    )
    near_magenta_pixel_count = count_near_magenta_pixels(image)

    if exact_magenta_pixel_count == 0:
        errors.append("sheet contains zero exact #ff00ff magenta pixels")
    if near_magenta_pixel_count > 0:
        flag_review_issue(
            f"found {near_magenta_pixel_count} near-magenta pixels that are close to #ff00ff but not exact",
            strict_failure=True,
        )

    if image.size != EXPECTED_SIZE:
        errors.append(
            f"expected image size {EXPECTED_SIZE[0]}x{EXPECTED_SIZE[1]}, "
            f"got {image.size[0]}x{image.size[1]}"
        )
    else:
        counts = count_cell_pixels(image)
        bounding_boxes = find_cell_bounding_boxes(image)
        row_motion_scores = analyze_row_motion(image)
        row_bbox_variance = analyze_row_bbox_variance(bounding_boxes)
        right_left_mirror_similarity = compare_right_left_mirror(image)
        for row, row_counts in enumerate(counts):
            for col, count in enumerate(row_counts):
                if count == 0:
                    errors.append(f"cell row {row} col {col} is empty")
        for row_motion in row_motion_scores:
            if row_motion["average_mask_difference"] <= NEAR_STATIC_ROW_MAX_MOTION:
                flag_review_issue(
                    f"row {row_motion['row']} walk_{row_motion['direction']} is near-static "
                    f"(average mask difference {row_motion['average_mask_difference']})",
                    strict_failure=True,
                )
        for variance in row_bbox_variance:
            if (
                variance["width_range_ratio"] > ROW_BBOX_SIZE_VARIANCE_RATIO
                or variance["height_range_ratio"] > ROW_BBOX_SIZE_VARIANCE_RATIO
            ):
                warnings.append(
                    f"row {variance['row']} walk_{variance['direction']} bounding box scale varies heavily "
                    f"(width ratio {variance['width_range_ratio']}, height ratio {variance['height_range_ratio']})"
                )
            if (
                variance["center_x_range"] > ROW_BBOX_CENTER_VARIANCE_PIXELS
                or variance["baseline_range"] > ROW_BBOX_BASELINE_VARIANCE_PIXELS
            ):
                warnings.append(
                    f"row {variance['row']} walk_{variance['direction']} bounding box alignment varies heavily "
                    f"(center x range {variance['center_x_range']} px, baseline range {variance['baseline_range']} px)"
                )
        if (
            right_left_mirror_similarity
            and right_left_mirror_similarity["average_similarity"]
            >= MIRROR_SIMILARITY_WARNING_MIN
        ):
            flag_review_issue(
                "walk_right and walk_left are suspiciously mirror-like "
                f"(average similarity {right_left_mirror_similarity['average_similarity']})",
                strict_failure=True,
            )

    out_dir.mkdir(parents=True, exist_ok=True)
    if image.size == EXPECTED_SIZE:
        keyed = key_magenta(image)
        palette_count = count_opaque_non_magenta_palette_colors(keyed)
        transparent_corners, transparent_corner_results = check_transparent_corners(keyed)
        if palette_count > args.max_colors:
            errors.append(
                f"keyed image has {palette_count} opaque non-magenta colors, "
                f"exceeding --max-colors {args.max_colors}"
            )
        if not transparent_corners:
            errors.append("keyed image sheet corners are not all transparent")
        keyed.save(keyed_png)
        write_contact_sheet(keyed, contact_png)
        if args.runtime_width > 0 and args.runtime_height > 0:
            write_runtime_contact_sheet(keyed, runtime_contact_png, runtime_size)
        write_row_gifs(keyed, args.slug, out_dir)

    passed = not errors
    write_report(
        report_path,
        keyed_png,
        artifacts,
        image.size,
        counts,
        bounding_boxes,
        row_motion_scores,
        row_bbox_variance,
        right_left_mirror_similarity,
        exact_magenta_pixel_count,
        exact_magenta_percentage,
        near_magenta_pixel_count,
        palette_count,
        args.max_colors,
        runtime_size,
        args.strict_prototype,
        transparent_corners,
        transparent_corner_results,
        passed,
        errors,
        warnings,
    )
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
