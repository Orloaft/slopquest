#!/usr/bin/env python3
"""Build the V4 actor sheet with padded feet and no uniform dark halo."""

from __future__ import annotations

import argparse
import json
import shutil
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance


FRAME = 96
POSES = ["idle", "windup", "hit", "move"]
BG = (255, 0, 255)
BOTTOM_SOURCE_PAD = 34
SIDE_SOURCE_PAD = 40
TOP_SOURCE_PAD = 24


@dataclass(frozen=True)
class Role:
    id: str
    label: str
    max_width: int
    max_height: int
    baseline: int
    brightness: float = 1.0
    contrast: float = 1.0
    saturation: float = 1.0
    edge: tuple[int, int, int] = (52, 50, 45)
    boot: tuple[int, int, int] = (55, 42, 32)
    boot_hi: tuple[int, int, int] = (118, 91, 62)


ROLES = [
    Role("iron-guard", "Iron Guard", 88, 82, 84, 1.05, 1.1, 0.92, (54, 59, 61), (37, 39, 40), (125, 122, 105)),
    Role("verdant-ranger", "Verdant Ranger", 90, 78, 84, 1.04, 1.1, 0.98, (56, 47, 31), (60, 42, 26), (137, 104, 58)),
    Role("radiant-acolyte", "Radiant Acolyte", 84, 80, 84, 1.02, 1.08, 0.92, (66, 52, 38), (67, 52, 37), (152, 123, 75)),
    Role("grave-skitter", "Grave Skitter", 91, 66, 78, 1.18, 1.26, 0.76, (55, 48, 43), (58, 48, 42), (161, 134, 102)),
    Role("stone-brute", "Stone Brute", 90, 80, 86, 1.08, 1.16, 0.82, (57, 55, 50), (63, 58, 48), (148, 135, 100)),
    Role("grave-archer", "Grave Archer", 90, 80, 84, 1.16, 1.24, 0.82, (66, 49, 39), (55, 38, 31), (139, 92, 65)),
]

HUMANOID_ROLES = {"iron-guard", "verdant-ranger", "radiant-acolyte", "grave-archer"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--artifact-dir", required=True)
    parser.add_argument("--runtime-dir", required=True)
    parser.add_argument("--media-dir")
    return parser.parse_args()


def is_key(pixel: tuple[int, int, int]) -> bool:
    r, g, b = pixel
    if r > 180 and b > 180 and g < 80:
        return True
    if r > 32 and b > 32 and g < 36 and abs(r - b) < 70:
        return True
    if max(abs(r - BG[0]), abs(g - BG[1]), abs(b - BG[2])) <= 38:
        return True
    return r > 135 and b > 135 and g < 72 and abs(r - b) < 105


def key_cell(cell: Image.Image) -> Image.Image:
    rgb = cell.convert("RGB")
    rgba = Image.new("RGBA", (rgb.width + SIDE_SOURCE_PAD * 2, rgb.height + TOP_SOURCE_PAD + BOTTOM_SOURCE_PAD), (0, 0, 0, 0))
    keyed = Image.new("RGBA", rgb.size)
    keyed.putdata([(*pixel, 0 if is_key(pixel) else 255) for pixel in rgb.getdata()])
    rgba.alpha_composite(keep_actor_components(keyed), (SIDE_SOURCE_PAD, TOP_SOURCE_PAD))
    return rgba


def keep_actor_components(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[dict] = []

    for start_y in range(height):
        for start_x in range(width):
            index = start_y * width + start_x
            if visited[index] or pixels[start_x, start_y] == 0:
                continue

            stack = [(start_x, start_y)]
            visited[index] = 1
            coords = []
            min_x = max_x = start_x
            min_y = max_y = start_y
            while stack:
                x, y = stack.pop()
                coords.append((x, y))
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    neighbor_index = ny * width + nx
                    if visited[neighbor_index] or pixels[nx, ny] == 0:
                        continue
                    visited[neighbor_index] = 1
                    stack.append((nx, ny))

            components.append(
                {
                    "coords": coords,
                    "area": len(coords),
                    "bbox": (min_x, min_y, max_x + 1, max_y + 1),
                }
            )

    if not components:
        return image

    largest = max(component["area"] for component in components)
    keep_threshold = max(36, int(largest * 0.01))
    clean_alpha = Image.new("L", image.size, 0)
    clean_pixels = clean_alpha.load()
    for component in components:
        min_x, min_y, max_x, max_y = component["bbox"]
        touches_cut_edge = min_y <= 2 or max_y >= height - 2
        small_edge_fragment = touches_cut_edge and component["area"] < largest * 0.08
        if component["area"] >= keep_threshold and not small_edge_fragment:
            for x, y in component["coords"]:
                clean_pixels[x, y] = 255

    cleaned = image.copy()
    cleaned.putalpha(clean_alpha)
    return cleaned


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty generated actor cell after chroma key")
    return bbox


def draw_source_feet(cell: Image.Image, role: Role, bbox: tuple[int, int, int, int]) -> None:
    if role.id not in HUMANOID_ROLES:
        return

    draw = ImageDraw.Draw(cell)
    min_x, _, max_x, max_y = bbox
    width = max_x - min_x
    center = (min_x + max_x) // 2
    foot_y = max_y - 3
    sx = max(1, round(width / 11))
    sy = max(4, round(width / 18))
    spread = max(18, round(width * 0.16))
    stance_bias = {
        "iron-guard": (-spread, spread),
        "verdant-ranger": (-spread - 7, spread + 7),
        "radiant-acolyte": (-spread // 2, spread // 2),
        "grave-archer": (-spread - 5, spread + 5),
    }[role.id]

    for i, offset in enumerate(stance_bias):
        cx = center + offset
        toe = 1 if i else -1
        box = (cx - sx, foot_y, cx + sx + abs(toe * 4), foot_y + sy)
        draw.rounded_rectangle(box, radius=max(1, sy // 3), fill=(*role.boot, 255))
        draw.rectangle((box[0] + 3, box[1] + 1, box[2] - 4, box[1] + 2), fill=(*role.boot_hi, 255))
        toe_x0 = cx + toe * sx
        toe_x1 = cx + toe * (sx + 10)
        draw.rectangle((min(toe_x0, toe_x1), foot_y + sy // 2, max(toe_x0, toe_x1), foot_y + sy), fill=(*role.boot, 255))


def threshold_alpha(image: Image.Image, cutoff: int = 42) -> Image.Image:
    rgba = image.convert("RGBA")
    rgba.putdata([(r, g, b, 255 if a >= cutoff else 0) for r, g, b, a in rgba.getdata()])
    return rgba


def enhance_role(image: Image.Image, role: Role) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    rgb = ImageEnhance.Brightness(rgb).enhance(role.brightness)
    rgb = ImageEnhance.Contrast(rgb).enhance(role.contrast)
    rgb = ImageEnhance.Color(rgb).enhance(role.saturation)
    enhanced = rgb.convert("RGBA")
    enhanced.putalpha(alpha)
    return enhanced


def quantize_rgba(image: Image.Image, colors: int = 13) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = Image.new("RGB", image.size, (0, 0, 0))
    rgb.paste(image.convert("RGB"), mask=alpha)
    quantized = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    quantized.putalpha(alpha)
    return quantized


def edge_pixels(alpha: Image.Image) -> set[tuple[int, int]]:
    width, height = alpha.size
    pixels = alpha.load()
    edge: set[tuple[int, int]] = set()
    for y in range(height):
        for x in range(width):
            if pixels[x, y] == 0:
                continue
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or nx >= width or ny < 0 or ny >= height or pixels[nx, ny] == 0:
                    edge.add((x, y))
                    break
    return edge


def soften_dark_rim(image: Image.Image, role: Role) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for x, y in edge_pixels(rgba.getchannel("A")):
        r, g, b, a = pixels[x, y]
        luminance = r * 0.299 + g * 0.587 + b * 0.114
        if luminance < 34:
            er, eg, eb = role.edge
            pixels[x, y] = (er, eg, eb, a)
        elif luminance < 52:
            er, eg, eb = role.edge
            pixels[x, y] = ((r + er) // 2, (g + eg) // 2, (b + eb) // 2, a)
    return rgba


def group_values(image: Image.Image, role: Role) -> Image.Image:
    if role.id not in {"grave-skitter", "grave-archer", "stone-brute"}:
        return image

    alpha = image.getchannel("A")
    rgba = image.convert("RGBA")
    pixels = []
    for r, g, b, a in rgba.getdata():
        if a == 0:
            pixels.append((r, g, b, 0))
            continue

        luminance = int(r * 0.299 + g * 0.587 + b * 0.114)
        red_accent = r > 126 and r > g * 1.18 and r > b * 1.1
        if role.id == "grave-skitter":
            if red_accent:
                color = (222, 105, 69, a)
            elif luminance < 72:
                color = (52, 47, 42, a)
            elif luminance < 144:
                color = (94, 88, 78, a)
            else:
                color = (232, 218, 181, a)
        elif role.id == "grave-archer":
            if red_accent:
                color = (220, 98, 65, a)
            elif luminance < 72:
                color = (64, 44, 35, a)
            elif luminance < 146:
                color = (122, 84, 69, a)
            else:
                color = (233, 214, 170, a)
        else:
            if red_accent:
                color = (216, 102, 62, a)
            elif luminance < 76:
                color = (58, 56, 50, a)
            elif luminance < 154:
                color = (116, 109, 94, a)
            else:
                color = (214, 201, 161, a)
        pixels.append(color)

    rgba.putdata(pixels)
    rgba.putalpha(alpha)
    return rgba


def draw_processed_feet(frame: Image.Image, role: Role, pose: str) -> None:
    if role.id not in HUMANOID_ROLES:
        return
    draw = ImageDraw.Draw(frame)
    spread = {
        "iron-guard": 10,
        "verdant-ranger": 12,
        "radiant-acolyte": 7,
        "grave-archer": 11,
    }[role.id]
    y = role.baseline - 4
    centers = (FRAME // 2 - spread, FRAME // 2 + spread)
    if pose == "move":
        centers = (centers[0] - 5, centers[1] + 5)
    if pose == "hit":
        centers = (centers[0] + 2, centers[1] + 2)
    for index, cx in enumerate(centers):
        toe = -1 if index == 0 else 1
        draw.rectangle((cx - 4, y, cx + 4, y + 3), fill=(*role.boot, 255))
        toe_x0 = cx + toe * 2
        toe_x1 = cx + toe * 8
        draw.rectangle((min(toe_x0, toe_x1), y + 2, max(toe_x0, toe_x1), y + 4), fill=(*role.boot, 255))
        draw.point((cx - 2, y), fill=(*role.boot_hi, 255))
        draw.point((cx + 1, y), fill=(*role.boot_hi, 255))


def paste_cell_on_checker(cell: Image.Image, size: tuple[int, int]) -> Image.Image:
    tile = 12
    checker = Image.new("RGB", size, (45, 47, 42))
    draw = ImageDraw.Draw(checker)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(62, 64, 56))
    checker.paste(cell.convert("RGB"), (0, 0), cell.getchannel("A"))
    return checker


def draw_source_contact(cells: list[list[Image.Image]], bboxes: list[list[tuple[int, int, int, int]]], out_path: Path) -> None:
    scale = 0.52
    cell_w = round(cells[0][0].width * scale)
    cell_h = round(cells[0][0].height * scale)
    label_h = 22
    role_w = 118
    margin = 10
    canvas = Image.new("RGB", (role_w + len(POSES) * (cell_w + margin) + margin, label_h + len(ROLES) * (cell_h + margin)), (29, 31, 28))
    draw = ImageDraw.Draw(canvas)
    draw.text((role_w, 4), "V4 keyed source prep: magenta removed, bottom pad visible, feet/boots kept inside cells", fill=(232, 220, 172))
    for row, role in enumerate(ROLES):
        y = label_h + row * (cell_h + margin)
        draw.text((8, y + cell_h // 2 - 5), role.label, fill=(214, 203, 158))
        for col, pose in enumerate(POSES):
            x = role_w + col * (cell_w + margin)
            source_cell = cells[row][col].resize((cell_w, cell_h), Image.Resampling.NEAREST)
            composed = paste_cell_on_checker(source_cell, (cell_w, cell_h))
            canvas.paste(composed, (x, y))
            draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), outline=(238, 230, 170), width=1)
            bbox = bboxes[row][col]
            box = tuple(round(value * scale) for value in bbox)
            draw.rectangle((x + box[0], y + box[1], x + box[2] - 1, y + box[3] - 1), outline=(113, 205, 255), width=1)
            source_bottom = TOP_SOURCE_PAD + (cells[row][col].height - TOP_SOURCE_PAD - BOTTOM_SOURCE_PAD)
            draw.line((x, y + round(source_bottom * scale), x + cell_w, y + round(source_bottom * scale)), fill=(255, 112, 90), width=1)
            draw.text((x + 3, y + 3), pose, fill=(247, 239, 184))
    canvas.save(out_path)


def make_debug_sheet(sheet: Image.Image, manifest: dict, out_path: Path) -> None:
    scale = 3
    label_h = 31
    role_w = 132
    gap = 8
    cell = FRAME * scale
    width = role_w + len(POSES) * (cell + gap) + gap
    height = label_h + len(ROLES) * (cell + gap) + 26
    canvas = Image.new("RGB", (width, height), (24, 23, 20))
    draw = ImageDraw.Draw(canvas)
    draw.text((role_w, 8), "Cell boxes (tan), content bounds (blue), foot contact/baseline (green), centered anchor (+)", fill=(232, 222, 172))

    for role in manifest["roles"]:
        row = role["row"]
        y = label_h + row * (cell + gap)
        draw.text((8, y + cell // 2 - 8), role["label"], fill=(222, 212, 165))
        baseline = role["anchor"]["y"]
        for frame in role["frames"]:
            col = frame["column"]
            x = role_w + col * (cell + gap)
            raw = sheet.crop((col * FRAME, row * FRAME, (col + 1) * FRAME, (row + 1) * FRAME)).resize((cell, cell), Image.Resampling.NEAREST)
            composed = paste_cell_on_checker(raw, (cell, cell))
            canvas.paste(composed, (x, y))
            draw.rectangle((x, y, x + cell - 1, y + cell - 1), outline=(245, 236, 176), width=2)
            by = y + baseline * scale
            draw.line((x, by, x + cell, by), fill=(72, 224, 124), width=3)
            ax = x + role["anchor"]["x"] * scale
            draw.line((ax - 10, by, ax + 10, by), fill=(255, 70, 66), width=3)
            draw.line((ax, by - 10, ax, by + 10), fill=(255, 70, 66), width=3)
            bounds = frame["contentBounds"]
            draw.rectangle(
                (
                    x + bounds["x"] * scale,
                    y + bounds["y"] * scale,
                    x + (bounds["x"] + bounds["width"]) * scale - 1,
                    y + (bounds["y"] + bounds["height"]) * scale - 1,
                ),
                outline=(104, 202, 255),
                width=2,
            )
            draw.text((x + 4, y + 4), f"{frame['name']} margin {frame['margins']['bottom']}px", fill=(245, 236, 184))
    canvas.save(out_path)


def make_final_size_sheet(sheet: Image.Image, out_path: Path) -> None:
    scale = 0.58
    thumb = round(FRAME * scale)
    margin_x = 16
    margin_y = 18
    label_h = 13
    width = margin_x + len(POSES) * (thumb + margin_x)
    block_h = margin_y + len(ROLES) * (thumb + label_h + margin_y)
    canvas = Image.new("RGB", (width * 2 + 18, block_h), (29, 31, 25))
    draw = ImageDraw.Draw(canvas)

    for gray_pass in range(2):
        x_offset = gray_pass * (width + 18)
        draw.text((x_offset + margin_x, 4), "grayscale board-size" if gray_pass else "color board-size", fill=(230, 220, 178))
        for row, role in enumerate(ROLES):
            y = margin_y + row * (thumb + label_h + margin_y)
            draw.text((x_offset + 2, y + thumb - 9), role.id, fill=(189, 181, 142))
            for col, pose in enumerate(POSES):
                cell = sheet.crop((col * FRAME, row * FRAME, (col + 1) * FRAME, (row + 1) * FRAME))
                cell = cell.resize((thumb, thumb), Image.Resampling.NEAREST)
                if gray_pass:
                    alpha = cell.getchannel("A")
                    cell = cell.convert("LA").convert("RGBA")
                    cell.putalpha(alpha)
                x = x_offset + margin_x + col * (thumb + margin_x)
                checker = Image.new("RGB", (thumb, thumb), (48, 49, 40))
                canvas.paste(checker, (x, y))
                canvas.paste(cell.convert("RGB"), (x, y), cell.getchannel("A"))
                draw.rectangle((x, y, x + thumb - 1, y + thumb - 1), outline=(96, 92, 72))
                draw.line((x, y + round(role.baseline * scale), x + thumb, y + round(role.baseline * scale)), fill=(77, 142, 84))
                draw.text((x + 2, y + thumb + 2), pose, fill=(220, 210, 168))
    canvas.save(out_path)


def analyze_frame(frame: Image.Image, content: tuple[int, int, int, int]) -> dict:
    left, top, right, bottom = content
    alpha = frame.getchannel("A")
    edge = edge_pixels(alpha)
    dark = 0
    total = 0
    pixels = frame.load()
    for x, y in edge:
        r, g, b, a = pixels[x, y]
        if a == 0:
            continue
        total += 1
        if r * 0.299 + g * 0.587 + b * 0.114 < 28:
            dark += 1
    return {
        "left": left,
        "right": FRAME - right,
        "top": top,
        "bottom": FRAME - bottom,
        "edgeDarkPixels": dark,
        "edgePixels": total,
        "edgeDarkRatio": round(dark / total, 4) if total else 0,
    }


def main() -> int:
    args = parse_args()
    source_path = Path(args.source)
    artifact_dir = Path(args.artifact_dir)
    runtime_dir = Path(args.runtime_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    media_dir = Path(args.media_dir) if args.media_dir else None
    if media_dir:
        media_dir.mkdir(parents=True, exist_ok=True)

    source = Image.open(source_path).convert("RGB")
    cols = len(POSES)
    rows = len(ROLES)
    if source.width % cols != 0 or source.height % rows != 0:
        raise ValueError(f"source sheet {source.size} is not divisible by {cols}x{rows}")

    cell_w = source.width // cols
    cell_h = source.height // rows
    keyed_cells: list[list[Image.Image]] = []
    source_bboxes: list[list[tuple[int, int, int, int]]] = []
    for row, role in enumerate(ROLES):
        keyed_row = []
        bbox_row = []
        for col in range(cols):
            left = col * cell_w
            top = row * cell_h
            cell = key_cell(source.crop((left, top, left + cell_w, top + cell_h)))
            pre_patch_bbox = alpha_bbox(cell)
            draw_source_feet(cell, role, pre_patch_bbox)
            bbox = alpha_bbox(cell)
            keyed_row.append(cell)
            bbox_row.append(bbox)
        keyed_cells.append(keyed_row)
        source_bboxes.append(bbox_row)

    draw_source_contact(keyed_cells, source_bboxes, artifact_dir / "source-actor-contact-sheet.png")

    sheet = Image.new("RGBA", (FRAME * cols, FRAME * rows), (0, 0, 0, 0))
    manifest = {
        "version": "battle-stage-actor-feet-outline-v4",
        "source": str(source_path),
        "sheet": "generated-low-res-actor-poses.png",
        "frameSize": {"width": FRAME, "height": FRAME},
        "grid": {"columns": cols, "rows": rows},
        "frameOrder": POSES,
        "anchorContract": "Each runtime frame is a 96x96 transparent cell. Anchor.x is centered at 48px. Anchor.y is the role foot contact line; opaque actor pixels end above the cell bottom with visible transparent margin.",
        "processing": {
            "sourceBottomPadPx": BOTTOM_SOURCE_PAD,
            "sourceSidePadPx": SIDE_SOURCE_PAD,
            "sourceTopPadPx": TOP_SOURCE_PAD,
            "uniformOutline": "disabled",
            "edgeTreatment": "dark perimeter pixels below luminance 34 are recolored to role-local edge colors instead of adding a dilated black stroke",
            "contactShadow": "not baked into the actor sheet; runtime CSS draws a separate ellipse below the feet",
        },
        "roles": [],
    }
    validation_lines = [
        "# Actor Feet/Outline V4 Validator",
        "",
        f"- Frame size: {FRAME}x{FRAME}",
        f"- Frame order: {', '.join(POSES)}",
        "- Source fix: each keyed source cell gets transparent side/top/bottom padding before slicing; humanoid roles receive boot/foot pixel patches where the generated source sat on the crop edge.",
        "- Outline fix: no dilated black outline pass is used; perimeter-black pixels are softened to role-local edge colors.",
        "- Contact shadow: separated from the body; no shadow pixels are baked into the sprite sheet.",
        "",
    ]

    for row, role in enumerate(ROLES):
        max_w = max(bbox[2] - bbox[0] for bbox in source_bboxes[row])
        max_h = max(bbox[3] - bbox[1] for bbox in source_bboxes[row])
        scale = min(role.max_width / max_w, role.max_height / max_h)
        role_entry = {
            "id": role.id,
            "label": role.label,
            "row": row,
            "scale": round(scale, 4),
            "anchor": {"x": FRAME // 2, "y": role.baseline},
            "baseline": {"y": role.baseline, "units": "frame-pixels"},
            "frames": [],
        }
        validation_lines.append(f"## {role.label}")
        validation_lines.append(f"- Source max bounds: {max_w}x{max_h}; scale: {scale:.4f}; anchor: (48,{role.baseline})")

        for col, pose in enumerate(POSES):
            bbox = source_bboxes[row][col]
            cell = keyed_cells[row][col].crop(bbox)
            width = max(1, round(cell.width * scale))
            height = max(1, round(cell.height * scale))
            reduced = cell.resize((width, height), Image.Resampling.BOX)
            reduced = threshold_alpha(reduced)
            reduced = enhance_role(reduced, role)
            reduced = group_values(reduced, role)
            reduced = quantize_rgba(reduced, 9 if role.id in {"grave-skitter", "grave-archer"} else 12)
            reduced = soften_dark_rim(reduced, role)
            reduced = threshold_alpha(reduced, 1)

            bounds = alpha_bbox(reduced)
            reduced = reduced.crop(bounds)
            width, height = reduced.size
            x = max(2, min(FRAME - width - 2, round((FRAME - width) / 2)))
            y = max(2, min(FRAME - height - 10, role.baseline - height))
            frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
            frame.alpha_composite(reduced, (x, y))
            draw_processed_feet(frame, role, pose)
            frame = soften_dark_rim(frame, role)
            content = alpha_bbox(frame)
            margins = analyze_frame(frame, content)
            if min(margins["left"], margins["right"], margins["top"], margins["bottom"]) <= 0:
                raise ValueError(f"{role.id} {pose} touches a 96x96 cell boundary: {margins}")
            if role.id in HUMANOID_ROLES and margins["bottom"] < 10:
                raise ValueError(f"{role.id} {pose} has insufficient bottom margin below feet: {margins}")
            if margins["edgeDarkRatio"] > 0.18:
                raise ValueError(f"{role.id} {pose} still has too many near-black perimeter pixels: {margins}")
            sheet.alpha_composite(frame, (col * FRAME, row * FRAME))

            frame_entry = {
                "name": pose,
                "column": col,
                "row": row,
                "rect": {"x": col * FRAME, "y": row * FRAME, "width": FRAME, "height": FRAME},
                "grid": {"column": col, "row": row},
                "contentBounds": {
                    "x": content[0],
                    "y": content[1],
                    "width": content[2] - content[0],
                    "height": content[3] - content[1],
                    "bottom": content[3],
                },
                "margins": margins,
                "sourceCell": {"x": col * cell_w, "y": row * cell_h, "width": cell_w, "height": cell_h},
                "sourceBounds": {"x": bbox[0], "y": bbox[1], "width": bbox[2] - bbox[0], "height": bbox[3] - bbox[1]},
            }
            role_entry["frames"].append(frame_entry)
            validation_lines.append(
                f"  - {pose}: content={content[2] - content[0]}x{content[3] - content[1]} at ({content[0]},{content[1]}), margins L/R/T/B={margins['left']}/{margins['right']}/{margins['top']}/{margins['bottom']}, edgeDark={margins['edgeDarkRatio']}"
            )

        manifest["roles"].append(role_entry)
        validation_lines.append("")

    sheet_path = artifact_dir / "processed-actor-sprite-sheet.png"
    runtime_sheet_path = runtime_dir / "generated-low-res-actor-poses.png"
    manifest_path = artifact_dir / "actor-runtime-manifest.json"
    runtime_manifest_path = runtime_dir / "manifest.json"
    sheet.save(sheet_path)
    sheet.save(runtime_sheet_path)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    runtime_manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    make_debug_sheet(sheet, manifest, artifact_dir / "slicing-debug-contact-sheet.png")
    make_final_size_sheet(sheet, artifact_dir / "final-size-actor-contact-sheet.png")
    (artifact_dir / "actor-slicing-validator.md").write_text("\n".join(validation_lines) + "\n")

    if media_dir:
        for name in (
            "source-actor-contact-sheet.png",
            "slicing-debug-contact-sheet.png",
            "processed-actor-sprite-sheet.png",
            "final-size-actor-contact-sheet.png",
        ):
            shutil.copyfile(artifact_dir / name, media_dir / name)
    print(f"processed battle-stage-actor-feet-outline-v4 actors into {runtime_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
