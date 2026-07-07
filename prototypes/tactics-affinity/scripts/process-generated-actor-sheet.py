#!/usr/bin/env python3
"""Turn the imagegen actor atlas into runtime-sized transparent pose sprites."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROLES = [
    {"id": "iron-guard", "label": "Iron Guard", "target_w": 62, "target_h": 74, "baseline": 84},
    {"id": "verdant-ranger", "label": "Verdant Ranger", "target_w": 70, "target_h": 68, "baseline": 84},
    {"id": "radiant-acolyte", "label": "Radiant Acolyte", "target_w": 58, "target_h": 72, "baseline": 84},
    {"id": "grave-skitter", "label": "Grave Skitter", "target_w": 82, "target_h": 54, "baseline": 76},
    {"id": "stone-brute", "label": "Stone Brute", "target_w": 86, "target_h": 78, "baseline": 86},
    {"id": "grave-archer", "label": "Grave Archer", "target_w": 66, "target_h": 74, "baseline": 84},
]
POSES = ["idle", "windup", "hit", "move"]
FRAME = 96
BG = (255, 0, 255)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--artifact-dir", required=True)
    parser.add_argument("--runtime-dir", required=True)
    return parser.parse_args()


def keyed_alpha(pixel: tuple[int, int, int]) -> int:
    r, g, b = pixel
    if r > 170 and b > 170 and g < 95:
        return 0
    if r > 95 and b > 95 and g < 70 and abs(r - b) < 85:
        return 0
    return 255


def key_cell(cell: Image.Image) -> Image.Image:
    rgb = cell.convert("RGB")
    rgba = Image.new("RGBA", rgb.size)
    data = []
    for pixel in rgb.getdata():
        alpha = keyed_alpha(pixel)
        data.append((*pixel, alpha))
    rgba.putdata(data)
    return rgba


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("empty generated actor cell after chroma key")
    return bbox


def quantize_rgba(image: Image.Image, colors: int = 14) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = Image.new("RGB", image.size, (0, 0, 0))
    rgb.paste(image.convert("RGB"), mask=alpha)
    quantized = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    quantized.putalpha(alpha)
    return quantized


def main() -> int:
    args = parse_args()
    source = Image.open(args.source).convert("RGB")
    artifact_dir = Path(args.artifact_dir)
    runtime_dir = Path(args.runtime_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)

    cols = len(POSES)
    rows = len(ROLES)
    cell_w = source.width / cols
    cell_h = source.height / rows

    contact = source.copy()
    draw = ImageDraw.Draw(contact)
    for col in range(1, cols):
        x = round(col * cell_w)
        draw.line([(x, 0), (x, source.height)], fill=(255, 255, 255), width=3)
    for row in range(1, rows):
        y = round(row * cell_h)
        draw.line([(0, y), (source.width, y)], fill=(255, 255, 255), width=3)
    contact.save(artifact_dir / "generated-actor-contact-sheet.png")

    keyed_cells: list[list[Image.Image]] = []
    bboxes: list[list[tuple[int, int, int, int]]] = []
    for row in range(rows):
        keyed_row = []
        bbox_row = []
        for col in range(cols):
            left = round(col * cell_w)
            upper = round(row * cell_h)
            right = round((col + 1) * cell_w)
            lower = round((row + 1) * cell_h)
            keyed = key_cell(source.crop((left, upper, right, lower)))
            bbox = alpha_bbox(keyed)
            keyed_row.append(keyed)
            bbox_row.append(bbox)
        keyed_cells.append(keyed_row)
        bboxes.append(bbox_row)

    sheet = Image.new("RGBA", (FRAME * cols, FRAME * rows), (0, 0, 0, 0))
    manifest = {"frame": FRAME, "columns": cols, "rows": rows, "poses": POSES, "roles": []}

    for row, role in enumerate(ROLES):
        max_w = max(bbox[2] - bbox[0] for bbox in bboxes[row])
        max_h = max(bbox[3] - bbox[1] for bbox in bboxes[row])
        scale = min(role["target_w"] / max_w, role["target_h"] / max_h)
        role_entry = {"id": role["id"], "label": role["label"], "row": row, "poses": {}}

        for col, pose in enumerate(POSES):
            cell = keyed_cells[row][col].crop(bboxes[row][col])
            width = max(1, round(cell.width * scale))
            height = max(1, round(cell.height * scale))
            reduced = cell.resize((width, height), Image.Resampling.BOX)
            reduced = quantize_rgba(reduced)

            frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
            x = round((FRAME - width) / 2)
            y = max(2, role["baseline"] - height)
            frame.alpha_composite(reduced, (x, y))
            sheet.alpha_composite(frame, (col * FRAME, row * FRAME))
            role_entry["poses"][pose] = {"column": col, "x": x, "y": y, "width": width, "height": height}

        manifest["roles"].append(role_entry)

    sheet.save(artifact_dir / "processed-actor-sprite-sheet.png")
    sheet.save(runtime_dir / "generated-low-res-actor-poses.png")
    (artifact_dir / "actor-runtime-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (runtime_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
