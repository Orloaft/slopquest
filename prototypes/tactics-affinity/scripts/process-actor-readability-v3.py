#!/usr/bin/env python3
"""Build the V3 readability actor sheet for the tactics prototype."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


FRAME = 96
POSES = ["idle", "windup", "hit", "move"]
BG = (255, 0, 255)


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


ROLES = [
    Role("iron-guard", "Iron Guard", 88, 78, 84, 1.03, 1.18, 0.92),
    Role("verdant-ranger", "Verdant Ranger", 92, 74, 84, 1.04, 1.16, 0.96),
    Role("radiant-acolyte", "Radiant Acolyte", 84, 74, 84, 1.01, 1.14, 0.9),
    Role("grave-skitter", "Grave Skitter", 94, 66, 78, 1.24, 1.44, 0.72),
    Role("stone-brute", "Stone Brute", 94, 78, 86, 1.08, 1.24, 0.82),
    Role("grave-archer", "Grave Archer", 94, 76, 84, 1.25, 1.48, 0.76),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--artifact-dir", required=True)
    parser.add_argument("--runtime-dir", required=True)
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
    rgba = Image.new("RGBA", rgb.size)
    data = []
    for pixel in rgb.getdata():
        data.append((*pixel, 0 if is_key(pixel) else 255))
    rgba.putdata(data)
    return keep_actor_components(rgba)


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
    keep_threshold = max(42, int(largest * 0.012))
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


def threshold_alpha(image: Image.Image, cutoff: int = 48) -> Image.Image:
    rgba = image.convert("RGBA")
    data = []
    for r, g, b, a in rgba.getdata():
        data.append((r, g, b, 255 if a >= cutoff else 0))
    rgba.putdata(data)
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


def quantize_rgba(image: Image.Image, colors: int = 10) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = Image.new("RGB", image.size, (0, 0, 0))
    rgb.paste(image.convert("RGB"), mask=alpha)
    quantized = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    quantized.putalpha(alpha)
    return quantized


def group_values(image: Image.Image, role: Role) -> Image.Image:
    """Collapse painterly texture into a few readable actor-scale value groups."""
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
            elif luminance < 76:
                color = (22, 24, 25, a)
            elif luminance < 144:
                color = (82, 84, 78, a)
            else:
                color = (236, 223, 184, a)
        elif role.id == "grave-archer":
            if red_accent:
                color = (228, 104, 68, a)
            elif luminance < 72:
                color = (28, 24, 26, a)
            elif luminance < 146:
                color = (116, 82, 72, a)
            else:
                color = (238, 220, 174, a)
        else:
            if red_accent:
                color = (224, 108, 66, a)
            elif luminance < 76:
                color = (30, 31, 31, a)
            elif luminance < 154:
                color = (108, 105, 94, a)
            else:
                color = (219, 206, 165, a)
        pixels.append(color)

    rgba.putdata(pixels)
    rgba.putalpha(alpha)
    return rgba


def add_outline(image: Image.Image, role: Role) -> Image.Image:
    alpha = image.getchannel("A")
    dilate_size = 5 if role.id in {"grave-skitter", "grave-archer"} else 3
    dilated = alpha.filter(ImageFilter.MaxFilter(dilate_size))
    outline_alpha = Image.new("L", image.size, 0)
    outline_alpha.paste(dilated)
    outline_alpha = Image.eval(outline_alpha, lambda value: 255 if value > 0 else 0)
    outline = Image.new("RGBA", image.size, (5, 7, 8, 0))
    outline.putalpha(outline_alpha)
    outlined = Image.alpha_composite(outline, image)

    if role.id in {"grave-skitter", "grave-archer"}:
        rim = Image.new("RGBA", image.size, (246, 226, 176, 0))
        rim_alpha = alpha.filter(ImageFilter.MaxFilter(5))
        rim_alpha = Image.eval(rim_alpha, lambda value: 118 if value > 0 else 0)
        rim.putalpha(rim_alpha)
        outlined = Image.alpha_composite(rim, outlined)
        outlined.putalpha(outline_alpha)

    return outlined


def draw_source_contact(source: Image.Image, out_path: Path) -> None:
    contact = source.copy().convert("RGB")
    draw = ImageDraw.Draw(contact)
    cell_w = source.width / len(POSES)
    cell_h = source.height / len(ROLES)
    for col in range(len(POSES) + 1):
        x = round(col * cell_w)
        draw.line([(x, 0), (x, source.height)], fill=(255, 255, 255), width=3)
    for row in range(len(ROLES) + 1):
        y = round(row * cell_h)
        draw.line([(0, y), (source.width, y)], fill=(255, 255, 255), width=3)
    for col, pose in enumerate(POSES):
        draw.text((round(col * cell_w) + 10, 10), pose, fill=(255, 255, 255))
    for row, role in enumerate(ROLES):
        draw.text((10, round(row * cell_h) + 10), role.label, fill=(255, 255, 255))
    contact.save(out_path)


def make_debug_sheet(sheet: Image.Image, manifest: dict, out_path: Path) -> None:
    debug = Image.new("RGBA", sheet.size, (24, 22, 18, 255))
    debug.alpha_composite(sheet)
    draw = ImageDraw.Draw(debug)
    for role in manifest["roles"]:
        row = role["row"]
        baseline = role["anchor"]["y"]
        for frame in role["frames"]:
            col = frame["column"]
            x0 = col * FRAME
            y0 = row * FRAME
            draw.rectangle((x0, y0, x0 + FRAME - 1, y0 + FRAME - 1), outline=(250, 238, 174, 255), width=1)
            draw.line((x0, y0 + baseline, x0 + FRAME, y0 + baseline), fill=(72, 222, 123, 255), width=2)
            ax = x0 + role["anchor"]["x"]
            ay = y0 + baseline
            draw.line((ax - 5, ay, ax + 5, ay), fill=(255, 72, 68, 255), width=1)
            draw.line((ax, ay - 5, ax, ay + 5), fill=(255, 72, 68, 255), width=1)
            bounds = frame["contentBounds"]
            draw.rectangle(
                (
                    x0 + bounds["x"],
                    y0 + bounds["y"],
                    x0 + bounds["x"] + bounds["width"] - 1,
                    y0 + bounds["y"] + bounds["height"] - 1,
                ),
                outline=(111, 203, 255, 255),
                width=1,
            )
    debug.convert("RGB").save(out_path)


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
    resampling = Image.Resampling.NEAREST

    for gray_pass in range(2):
        x_offset = gray_pass * (width + 18)
        draw.text((x_offset + margin_x, 4), "grayscale board-size" if gray_pass else "color board-size", fill=(230, 220, 178))
        for row, role in enumerate(ROLES):
            y = margin_y + row * (thumb + label_h + margin_y)
            draw.text((x_offset + 2, y + thumb - 9), role.id, fill=(189, 181, 142))
            for col, pose in enumerate(POSES):
                cell = sheet.crop((col * FRAME, row * FRAME, (col + 1) * FRAME, (row + 1) * FRAME))
                cell = cell.resize((thumb, thumb), resampling)
                if gray_pass:
                    alpha = cell.getchannel("A")
                    cell = cell.convert("LA").convert("RGBA")
                    cell.putalpha(alpha)
                x = x_offset + margin_x + col * (thumb + margin_x)
                checker = Image.new("RGB", (thumb, thumb), (48, 49, 40))
                canvas.paste(checker, (x, y))
                canvas.paste(cell.convert("RGB"), (x, y), cell.getchannel("A"))
                draw.rectangle((x, y, x + thumb - 1, y + thumb - 1), outline=(96, 92, 72))
                draw.text((x + 2, y + thumb + 2), pose, fill=(220, 210, 168))
    canvas.save(out_path)


def main() -> int:
    args = parse_args()
    source_path = Path(args.source)
    artifact_dir = Path(args.artifact_dir)
    runtime_dir = Path(args.runtime_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)

    source = Image.open(source_path).convert("RGB")
    cols = len(POSES)
    rows = len(ROLES)
    if source.width % cols != 0 or source.height % rows != 0:
        raise ValueError(f"source sheet {source.size} is not divisible by {cols}x{rows}")

    cell_w = source.width // cols
    cell_h = source.height // rows
    draw_source_contact(source, artifact_dir / "source-actor-contact-sheet.png")

    keyed_cells: list[list[Image.Image]] = []
    source_bboxes: list[list[tuple[int, int, int, int]]] = []
    for row in range(rows):
        keyed_row = []
        bbox_row = []
        for col in range(cols):
            left = col * cell_w
            top = row * cell_h
            cell = key_cell(source.crop((left, top, left + cell_w, top + cell_h)))
            bbox = alpha_bbox(cell)
            keyed_row.append(cell)
            bbox_row.append(bbox)
        keyed_cells.append(keyed_row)
        source_bboxes.append(bbox_row)

    sheet = Image.new("RGBA", (FRAME * cols, FRAME * rows), (0, 0, 0, 0))
    manifest = {
        "version": "battle-stage-readability-v3",
        "source": str(source_path),
        "sheet": "generated-low-res-actor-poses.png",
        "frameSize": {"width": FRAME, "height": FRAME},
        "grid": {"columns": cols, "rows": rows},
        "frameOrder": POSES,
        "anchorContract": "Each runtime frame is a 96x96 transparent cell. Per-role anchor.x is centered at 48px and anchor.y is the locked foot baseline; all poses in a role are placed so their opaque bounds end on that baseline.",
        "roles": [],
    }
    validation_lines = [
        "# Actor Readability V3 Validator",
        "",
        f"- Frame size: {FRAME}x{FRAME}",
        f"- Frame order: {', '.join(POSES)}",
        "- Check: every runtime frame uses the same cell geometry; content bounds are anchored to the role baseline.",
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
            reduced = quantize_rgba(reduced, 9 if role.id in {"grave-skitter", "grave-archer"} else 11)
            reduced = add_outline(reduced, role)
            reduced = threshold_alpha(reduced, 1)

            bounds = alpha_bbox(reduced)
            reduced = reduced.crop(bounds)
            width, height = reduced.size
            x = max(0, min(FRAME - width, round((FRAME - width) / 2)))
            y = max(0, min(FRAME - height, role.baseline - height))
            frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
            frame.alpha_composite(reduced, (x, y))
            sheet.alpha_composite(frame, (col * FRAME, row * FRAME))
            content = alpha_bbox(frame)
            bottom = content[3]
            if bottom != role.baseline:
                raise ValueError(f"{role.id} {pose} baseline drift: {bottom} != {role.baseline}")
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
                    "bottom": bottom,
                },
                "sourceCell": {"x": col * cell_w, "y": row * cell_h, "width": cell_w, "height": cell_h},
                "sourceBounds": {"x": bbox[0], "y": bbox[1], "width": bbox[2] - bbox[0], "height": bbox[3] - bbox[1]},
            }
            role_entry["frames"].append(frame_entry)
            validation_lines.append(
                f"  - {pose}: rect=({col * FRAME},{row * FRAME},96,96), content={content[2] - content[0]}x{content[3] - content[1]} at ({content[0]},{content[1]}), bottom={bottom}"
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
