#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
CELL = 96
COLS = 4
ROWS = 4
MAGENTA = (255, 0, 255, 255)
ROW_NAMES = ("walk_up", "walk_right", "walk_down", "walk_left")

RAT = {
    "outline": (31, 24, 21, 255),
    "dark": (70, 54, 47, 255),
    "mid": (116, 91, 79, 255),
    "light": (164, 132, 112, 255),
    "belly": (196, 164, 138, 255),
    "ear": (176, 126, 117, 255),
    "tail": (174, 124, 112, 255),
    "paw": (207, 174, 149, 255),
    "eye": (12, 10, 9, 255),
    "nose": (43, 29, 31, 255),
    "mark": (88, 67, 58, 255),
}

SPIDER = {
    "outline": (25, 20, 23, 255),
    "deep": (44, 32, 39, 255),
    "leg": (60, 42, 50, 255),
    "mid": (78, 50, 60, 255),
    "light": (116, 80, 92, 255),
    "mark": (182, 92, 50, 255),
    "mark_light": (218, 135, 70, 255),
    "eye": (230, 207, 106, 255),
    "fang": (220, 210, 186, 255),
}


def box(origin: tuple[int, int], coords: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    ox, oy = origin
    x0, y0, x1, y1 = coords
    return (ox + x0, oy + y0, ox + x1, oy + y1)


def pts(origin: tuple[int, int], coords: Iterable[tuple[int, int]]) -> list[tuple[int, int]]:
    ox, oy = origin
    return [(ox + x, oy + y) for x, y in coords]


def line(draw: ImageDraw.ImageDraw, origin: tuple[int, int], coords: list[tuple[int, int]], fill: tuple[int, int, int, int], width: int) -> None:
    draw.line(pts(origin, coords), fill=fill, width=width, joint="curve")


def ellipse(draw: ImageDraw.ImageDraw, origin: tuple[int, int], coords: tuple[int, int, int, int], fill: tuple[int, int, int, int]) -> None:
    draw.ellipse(box(origin, coords), fill=fill)


def polygon(draw: ImageDraw.ImageDraw, origin: tuple[int, int], coords: list[tuple[int, int]], fill: tuple[int, int, int, int]) -> None:
    draw.polygon(pts(origin, coords), fill=fill)


def rect(draw: ImageDraw.ImageDraw, origin: tuple[int, int], coords: tuple[int, int, int, int], fill: tuple[int, int, int, int]) -> None:
    draw.rectangle(box(origin, coords), fill=fill)


def draw_rat(draw: ImageDraw.ImageDraw, origin: tuple[int, int], direction: str, frame: int) -> None:
    step = (-2, 0, 2, 0)[frame]
    bob = (1, 0, 1, 0)[frame]
    toe = (-1, 1, -1, 1)[frame]

    if direction == "walk_down":
        line(draw, origin, [(47, 36 + bob), (39 + step, 24), (33 + step, 20)], RAT["outline"], 7)
        line(draw, origin, [(47, 36 + bob), (39 + step, 24), (33 + step, 20)], RAT["tail"], 3)
        ellipse(draw, origin, (26, 28 + bob, 44, 46 + bob), RAT["outline"])
        ellipse(draw, origin, (52, 27 + bob, 70, 45 + bob), RAT["outline"])
        ellipse(draw, origin, (29, 31 + bob, 41, 43 + bob), RAT["ear"])
        ellipse(draw, origin, (55, 30 + bob, 67, 42 + bob), RAT["ear"])
        ellipse(draw, origin, (23, 31 + bob, 73, 71 + bob), RAT["outline"])
        ellipse(draw, origin, (27, 35 + bob, 69, 69 + bob), RAT["mid"])
        ellipse(draw, origin, (30, 45 + bob, 66, 78 + bob), RAT["outline"])
        ellipse(draw, origin, (34, 48 + bob, 62, 74 + bob), RAT["light"])
        ellipse(draw, origin, (39, 55 + bob, 57, 74 + bob), RAT["belly"])
        ellipse(draw, origin, (37, 54 + bob, 42, 59 + bob), RAT["eye"])
        ellipse(draw, origin, (55, 53 + bob, 60, 58 + bob), RAT["eye"])
        ellipse(draw, origin, (46, 63 + bob, 53, 70 + bob), RAT["nose"])
        rect(draw, origin, (30 + step, 71, 38 + step, 77), RAT["paw"])
        rect(draw, origin, (58 - step, 70, 66 - step, 76), RAT["paw"])
        rect(draw, origin, (31, 38 + bob, 38, 42 + bob), RAT["mark"])
        rect(draw, origin, (58, 36 + bob, 64, 40 + bob), RAT["light"])
        line(draw, origin, [(42, 66 + bob), (33, 65 + bob)], RAT["outline"], 1)
        line(draw, origin, [(56, 66 + bob), (65, 64 + bob)], RAT["outline"], 1)
        return

    if direction == "walk_up":
        line(draw, origin, [(49, 61 + bob), (58 - step, 76), (66 - step, 82)], RAT["outline"], 7)
        line(draw, origin, [(49, 61 + bob), (58 - step, 76), (66 - step, 82)], RAT["tail"], 3)
        ellipse(draw, origin, (28, 24 + bob, 45, 42 + bob), RAT["outline"])
        ellipse(draw, origin, (53, 25 + bob, 70, 43 + bob), RAT["outline"])
        ellipse(draw, origin, (31, 28 + bob, 42, 39 + bob), RAT["ear"])
        ellipse(draw, origin, (56, 29 + bob, 67, 40 + bob), RAT["ear"])
        ellipse(draw, origin, (25, 28 + bob, 72, 72 + bob), RAT["outline"])
        ellipse(draw, origin, (29, 32 + bob, 68, 69 + bob), RAT["dark"])
        ellipse(draw, origin, (34, 36 + bob, 63, 64 + bob), RAT["mid"])
        rect(draw, origin, (43, 33 + bob, 50, 56 + bob), RAT["mark"])
        rect(draw, origin, (35, 44 + bob, 42, 49 + bob), RAT["light"])
        rect(draw, origin, (56, 46 + bob, 62, 51 + bob), RAT["light"])
        rect(draw, origin, (30 + step, 66, 38 + step, 72), RAT["paw"])
        rect(draw, origin, (58 - step, 67, 66 - step, 73), RAT["paw"])
        return

    if direction == "walk_right":
        line(draw, origin, [(28, 57 + bob), (16 - step, 64), (10 - step, 61)], RAT["outline"], 7)
        line(draw, origin, [(28, 57 + bob), (16 - step, 64), (10 - step, 61)], RAT["tail"], 3)
        ellipse(draw, origin, (29, 35 + bob, 70, 67 + bob), RAT["outline"])
        ellipse(draw, origin, (33, 38 + bob, 68, 64 + bob), RAT["mid"])
        polygon(draw, origin, [(65, 42 + bob), (83, 50 + bob), (65, 61 + bob)], RAT["outline"])
        polygon(draw, origin, [(65, 46 + bob), (78, 51 + bob), (65, 58 + bob)], RAT["light"])
        ellipse(draw, origin, (56, 28 + bob, 70, 43 + bob), RAT["outline"])
        ellipse(draw, origin, (59, 31 + bob, 67, 40 + bob), RAT["ear"])
        ellipse(draw, origin, (69, 48 + bob, 74, 53 + bob), RAT["eye"])
        ellipse(draw, origin, (78, 51 + bob, 84, 56 + bob), RAT["nose"])
        rect(draw, origin, (42, 41 + bob, 52, 46 + bob), RAT["light"])
        rect(draw, origin, (51, 59 + bob, 61, 64 + bob), RAT["belly"])
        rect(draw, origin, (34 + step, 66, 43 + step, 72), RAT["paw"])
        rect(draw, origin, (60 - step, 65 + toe, 69 - step, 71 + toe), RAT["paw"])
        rect(draw, origin, (40, 36 + bob, 47, 40 + bob), RAT["mark"])
        line(draw, origin, [(77, 54 + bob), (86, 52 + bob)], RAT["outline"], 1)
        return

    # Authored separately from walk_right: similar creature, different tail curl,
    # flank mark, paw cadence, and nose silhouette so it is not a mirrored row.
    line(draw, origin, [(67, 58 + bob), (78 + step, 68), (87 + step, 66), (84 + step, 61)], RAT["outline"], 7)
    line(draw, origin, [(67, 58 + bob), (78 + step, 68), (87 + step, 66), (84 + step, 61)], RAT["tail"], 3)
    ellipse(draw, origin, (26, 36 + bob, 68, 68 + bob), RAT["outline"])
    ellipse(draw, origin, (29, 39 + bob, 64, 65 + bob), RAT["mid"])
    polygon(draw, origin, [(30, 43 + bob), (13, 52 + bob), (30, 62 + bob)], RAT["outline"])
    polygon(draw, origin, [(29, 47 + bob), (19, 52 + bob), (30, 58 + bob)], RAT["light"])
    ellipse(draw, origin, (27, 29 + bob, 41, 44 + bob), RAT["outline"])
    ellipse(draw, origin, (30, 32 + bob, 38, 41 + bob), RAT["ear"])
    ellipse(draw, origin, (22, 49 + bob, 27, 54 + bob), RAT["eye"])
    ellipse(draw, origin, (13, 52 + bob, 19, 57 + bob), RAT["nose"])
    rect(draw, origin, (47, 42 + bob, 58, 47 + bob), RAT["light"])
    rect(draw, origin, (35, 60 + bob, 45, 65 + bob), RAT["belly"])
    rect(draw, origin, (48, 50 + bob, 54, 53 + bob), RAT["ear"])
    rect(draw, origin, (26 - step, 66 + toe, 35 - step, 72 + toe), RAT["paw"])
    rect(draw, origin, (54 + step, 66, 63 + step, 72), RAT["paw"])
    rect(draw, origin, (54, 38 + bob, 62, 42 + bob), RAT["mark"])
    line(draw, origin, [(20, 55 + bob), (10, 54 + bob)], RAT["outline"], 1)


def draw_spider_leg(
    draw: ImageDraw.ImageDraw,
    origin: tuple[int, int],
    coords: list[tuple[int, int]],
    inner: tuple[int, int, int, int] = SPIDER["leg"],
) -> None:
    line(draw, origin, coords, SPIDER["outline"], 8)
    line(draw, origin, coords, inner, 4)


def draw_spider(draw: ImageDraw.ImageDraw, origin: tuple[int, int], direction: str, frame: int) -> None:
    stride = (-4, -1, 4, 1)[frame]
    alt = (2, -2, 2, -2)[frame]
    bob = (1, 0, 1, 0)[frame]

    if direction in {"walk_down", "walk_up"}:
        front = direction == "walk_down"
        head_y = 45 + bob if front else 27 + bob
        abdomen_y = 29 + bob if front else 43 + bob
        left_shift = stride
        right_shift = -stride
        draw_spider_leg(draw, origin, [(38, 48), (22 + left_shift, 38 + alt), (14 + left_shift, 31 + alt)])
        draw_spider_leg(draw, origin, [(58, 48), (74 + right_shift, 38 - alt), (84 + right_shift, 31 - alt)])
        draw_spider_leg(draw, origin, [(36, 55), (19 - left_shift, 57 - alt), (11 - left_shift, 65 - alt)])
        draw_spider_leg(draw, origin, [(60, 55), (77 - right_shift, 57 + alt), (88 - right_shift, 65 + alt)])
        draw_spider_leg(draw, origin, [(39, 63), (26 + right_shift, 72), (19 + right_shift, 82)])
        draw_spider_leg(draw, origin, [(57, 63), (70 + left_shift, 72), (78 + left_shift, 82)])
        ellipse(draw, origin, (29, abdomen_y, 67, abdomen_y + 34), SPIDER["outline"])
        ellipse(draw, origin, (33, abdomen_y + 3, 63, abdomen_y + 31), SPIDER["mid"])
        ellipse(draw, origin, (36, head_y, 60, head_y + 22), SPIDER["outline"])
        ellipse(draw, origin, (39, head_y + 3, 57, head_y + 20), SPIDER["deep"])
        if front:
            ellipse(draw, origin, (39, head_y + 7, 44, head_y + 12), SPIDER["eye"])
            ellipse(draw, origin, (52, head_y + 7, 57, head_y + 12), SPIDER["eye"])
            polygon(draw, origin, [(43, head_y + 19), (46, head_y + 27), (48, head_y + 19)], SPIDER["fang"])
            polygon(draw, origin, [(51, head_y + 19), (54, head_y + 27), (56, head_y + 19)], SPIDER["fang"])
            rect(draw, origin, (44, abdomen_y + 9, 52, abdomen_y + 15), SPIDER["mark_light"])
        else:
            rect(draw, origin, (40, abdomen_y + 10, 47, abdomen_y + 16), SPIDER["mark"])
            rect(draw, origin, (51, abdomen_y + 13, 57, abdomen_y + 19), SPIDER["mark_light"])
        rect(draw, origin, (42, abdomen_y + 21, 55, abdomen_y + 25), SPIDER["light"])
        return

    if direction == "walk_right":
        draw_spider_leg(draw, origin, [(42, 46), (29 + stride, 34), (19 + stride, 30)])
        draw_spider_leg(draw, origin, [(47, 50), (30 - stride, 48 + alt), (17 - stride, 48 + alt)])
        draw_spider_leg(draw, origin, [(48, 59), (31 + stride, 67 - alt), (21 + stride, 76 - alt)])
        draw_spider_leg(draw, origin, [(61, 45), (75 - stride, 33 - alt), (86 - stride, 29 - alt)])
        draw_spider_leg(draw, origin, [(63, 54), (79 + stride, 56 + alt), (89 + stride, 56 + alt)])
        draw_spider_leg(draw, origin, [(59, 63), (75 - stride, 74), (83 - stride, 82)])
        ellipse(draw, origin, (29, 36 + bob, 62, 69 + bob), SPIDER["outline"])
        ellipse(draw, origin, (33, 39 + bob, 59, 66 + bob), SPIDER["mid"])
        ellipse(draw, origin, (56, 42 + bob, 75, 61 + bob), SPIDER["outline"])
        ellipse(draw, origin, (59, 45 + bob, 72, 58 + bob), SPIDER["deep"])
        ellipse(draw, origin, (68, 48 + bob, 73, 53 + bob), SPIDER["eye"])
        rect(draw, origin, (43, 43 + bob, 51, 48 + bob), SPIDER["mark"])
        rect(draw, origin, (38, 57 + bob, 47, 61 + bob), SPIDER["light"])
        polygon(draw, origin, [(72, 55 + bob), (79, 57 + bob), (72, 59 + bob)], SPIDER["fang"])
        return

    # Authored separately from walk_right: the abdomen spot, raised leg pair, and
    # head angle differ so this row cannot be a flipped right-facing substitute.
    draw_spider_leg(draw, origin, [(54, 45), (68 + stride, 32 - alt), (82 + stride, 30 - alt)])
    draw_spider_leg(draw, origin, [(50, 50), (66 - stride, 49 + alt), (81 - stride, 46 + alt)])
    draw_spider_leg(draw, origin, [(48, 60), (64 + stride, 71), (74 + stride, 81)])
    draw_spider_leg(draw, origin, [(35, 46), (20 - stride, 36 + alt), (10 - stride, 31 + alt)])
    draw_spider_leg(draw, origin, [(32, 55), (16 + stride, 58 - alt), (7 + stride, 59 - alt)])
    draw_spider_leg(draw, origin, [(37, 64), (23 - stride, 76), (13 - stride, 82)])
    ellipse(draw, origin, (35, 36 + bob, 69, 69 + bob), SPIDER["outline"])
    ellipse(draw, origin, (38, 39 + bob, 65, 66 + bob), SPIDER["mid"])
    ellipse(draw, origin, (21, 43 + bob, 41, 62 + bob), SPIDER["outline"])
    ellipse(draw, origin, (24, 46 + bob, 38, 59 + bob), SPIDER["deep"])
    ellipse(draw, origin, (25, 49 + bob, 30, 54 + bob), SPIDER["eye"])
    rect(draw, origin, (51, 44 + bob, 59, 50 + bob), SPIDER["mark_light"])
    rect(draw, origin, (47, 59 + bob, 55, 63 + bob), SPIDER["light"])
    polygon(draw, origin, [(24, 55 + bob), (17, 58 + bob), (25, 59 + bob)], SPIDER["fang"])


def generate_sheet(kind: str, out: Path) -> dict[str, object]:
    image = Image.new("RGBA", (CELL * COLS, CELL * ROWS), MAGENTA)
    draw = ImageDraw.Draw(image)
    renderer = draw_rat if kind == "rat" else draw_spider
    for row, direction in enumerate(ROW_NAMES):
        for frame in range(COLS):
            renderer(draw, (frame * CELL, row * CELL), direction, frame)
    metrics = validate_sheet(image, kind)
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out)
    return {"path": str(out), **metrics}


def is_magenta_family(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    return r >= 180 and b >= 170 and g <= 100


def validate_sheet(image: Image.Image, kind: str) -> dict[str, object]:
    if image.size != (384, 384):
        raise SystemExit(f"{kind}: bad size {image.size}")
    colors = set()
    magenta_pixels = 0
    non_background_pixels = 0
    for rgba in image.getdata():
        if rgba == MAGENTA:
            magenta_pixels += 1
            continue
        if rgba[3] == 0:
            raise SystemExit(f"{kind}: transparent pixel found; sheet should use magenta background")
        rgb = rgba[:3]
        if is_magenta_family(rgb):
            raise SystemExit(f"{kind}: creature pixel in magenta-family range {rgb}")
        colors.add(rgb)
        non_background_pixels += 1
    if len(colors) > 64:
        raise SystemExit(f"{kind}: {len(colors)} opaque non-background colors exceeds 64")

    for row, row_name in enumerate(ROW_NAMES):
        for col in range(COLS):
            cell = image.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
            if all(px == MAGENTA for px in cell.getdata()):
                raise SystemExit(f"{kind}: empty cell {row_name} frame {col}")

    right = image.crop((0, CELL, CELL * COLS, CELL * 2))
    left = image.crop((0, CELL * 3, CELL * COLS, CELL * 4))
    if ImageChops.difference(ImageOps.mirror(right), left).convert("RGB").getbbox() is None:
        raise SystemExit(f"{kind}: left row is a mirrored right-row substitution")
    mirrored_frame_matches = 0
    for frame in range(COLS):
        right_frame = image.crop((frame * CELL, CELL, (frame + 1) * CELL, CELL * 2))
        left_frame = image.crop((frame * CELL, CELL * 3, (frame + 1) * CELL, CELL * 4))
        if ImageChops.difference(ImageOps.mirror(right_frame), left_frame).convert("RGB").getbbox() is None:
            mirrored_frame_matches += 1
    if mirrored_frame_matches:
        raise SystemExit(f"{kind}: {mirrored_frame_matches} side frames are mirrored substitutions")

    return {
        "size": f"{image.size[0]}x{image.size[1]}",
        "rows": ROW_NAMES,
        "frames": COLS * ROWS,
        "magenta_background_pixels": magenta_pixels,
        "non_background_pixels": non_background_pixels,
        "opaque_non_background_colors": len(colors),
    }


def main() -> None:
    results = [
        generate_sheet("rat", ROOT / "public" / "rat-sheet.png"),
        generate_sheet("spider", ROOT / "public" / "spider-sheet.png"),
    ]
    print(json.dumps({"generated": results}, indent=2))


if __name__ == "__main__":
    main()
