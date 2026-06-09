#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import subprocess
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageEnhance, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2"
SOURCE_ROOT = (
    ROOT
    / "assetsources"
    / "curated"
    / "bespoke"
    / "enemy-directional-4x4-v2-imagegen"
)
SOURCE_CONTACT = SOURCE_ROOT / "tib-enemy-source-contact-sheet-v3-magenta-simplified-original.png"
NORMALIZED_CONTACT = SOURCE_ROOT / "tib-enemy-source-contact-sheet-v3-magenta-simplified-exact-magenta.png"
PROCESSOR = Path.home() / ".openclaw/workspace/skills/sprite_processor/scripts/sprite_processor.py"

MAGENTA_RGB = (255, 0, 255)
MAGENTA = (*MAGENTA_RGB, 255)
CELL = 96
COLS = 4
CONTACT_COLS = 8
CONTACT_ROWS = 6
ANIMATION_ROWS = ("walk",)
DIRECTION_ROWS = ("up", "right", "down", "left")
ROW_NAMES = tuple(f"{anim}_{direction}" for anim in ANIMATION_ROWS for direction in DIRECTION_ROWS)
ROWS = len(ROW_NAMES)
PIPELINE_NAME = "enemy-directional-4x4-v2"
PIPELINE_SPEC = {
    "name": PIPELINE_NAME,
    "source_reference": (
        "Image-generated simplified enemy contact sheet on bright magenta chroma; "
        "locally normalized to exact #ff00ff, keyed to alpha, and packed into the "
        "walk-only 4-direction runtime contract."
    ),
    "cell_px": CELL,
    "columns": COLS,
    "rows": ROWS,
    "row_order": ROW_NAMES,
    "frames_per_direction": COLS,
    "animations": ANIMATION_ROWS,
    "directions": DIRECTION_ROWS,
    "runtime_contract": {
        "walk_rows": "rows 0-3, ordered up/right/down/left",
        "attack_rows": "none; attacks reuse the walk pose plus shared slash/missile effects",
        "texture_count": {
            "walk": len(DIRECTION_ROWS) * COLS,
            "attack": 0,
        },
    },
}
Image.MAX_IMAGE_PIXELS = None


@dataclass(frozen=True)
class Enemy:
    slug: str
    label: str
    source_index: int
    max_size: tuple[int, int] = (76, 78)


ENEMIES = [
    Enemy("ghoul", "Crypt Ghoul", 0),
    Enemy("grave_revenant", "Grave Revenant", 1),
    Enemy("pale_banshee", "Pale Banshee", 2),
    Enemy("crypt_sentinel", "Crypt Sentinel", 3, (82, 82)),
    Enemy("wild_boar", "Wild Boar", 4),
    Enemy("thorn_hedgehog", "Thorn Hedgehog", 5),
    Enemy("forest_spider", "Forest Spider", 6, (82, 76)),
    Enemy("forest_slime", "Forest Slime", 7),
    Enemy("sapling_deer", "Sapling Deer", 8, (80, 82)),
    Enemy("mushroom_brute", "Mushroom Brute", 9, (82, 82)),
    Enemy("dire_wolf", "Dire Wolf", 10, (84, 78)),
    Enemy("orc", "Cave Orc", 11, (80, 82)),
    Enemy("forest_pixie", "Forest Pixie", 12, (68, 78)),
    Enemy("bone_druid", "Bone Druid", 13, (82, 82)),
    Enemy("bog_wraith", "Bog Wraith", 14, (78, 82)),
    Enemy("ancient_treant", "Ancient Treant", 15, (84, 86)),
    Enemy("reach_hen", "Reach Hen", 16, (68, 72)),
    Enemy("meadow_hopper", "Meadow Hopper", 17, (70, 70)),
    Enemy("reach_vole", "Reach Vole", 18, (70, 70)),
    Enemy("grave_shambler", "Grave Shambler", 19),
    Enemy("skitterer", "Skitterer", 20, (82, 76)),
    Enemy("mire_spitter", "Mire Spitter", 21),
    Enemy("canyon_scavenger", "Canyon Scavenger", 22, (78, 82)),
    Enemy("dust_burrower", "Dust Burrower", 23, (82, 72)),
    Enemy("crimson_burrower", "Crimson Burrower", 24, (82, 72)),
    Enemy("dune_skitterer", "Dune Skitterer", 25, (82, 76)),
    Enemy("sun_wraith", "Sun-Scorched Wraith", 26),
    Enemy("reef_prowler", "Reef Prowler", 27),
    Enemy("venomous_stalker", "Venomous Stalker", 28, (82, 82)),
    Enemy("totem_wraith", "Ancient Totem Wraith", 29),
    Enemy("bog_leech", "Bog Leech", 30, (84, 72)),
    Enemy("marsh_hag", "Marsh Hag", 31),
    Enemy("gloom_toad", "Gloom Toad", 32, (82, 76)),
    Enemy("magma_hound", "Magma Hound", 33, (84, 78)),
    Enemy("cinder_shade", "Cinder Shade", 34),
    Enemy("basalt_brute", "Basalt Brute", 35, (84, 86)),
    Enemy("bone_scorpion", "Bone Scorpion", 36, (84, 78)),
    Enemy("dune_reaver", "Dune Reaver", 37),
    Enemy("mirage_shade", "Mirage Shade", 38),
    Enemy("tide_lurker", "Tide Lurker", 39),
    Enemy("drowned_marauder", "Drowned Marauder", 40),
    Enemy("brine_siren", "Brine Siren", 41),
    Enemy("coral_crab", "Coral Crab", 42, (84, 76)),
    Enemy("canopy_stalker", "Canopy Stalker", 43, (80, 82)),
    Enemy("blowpipe_headhunter", "Blowpipe Headhunter", 44),
    Enemy("verdant_faultwarden", "Verdant Faultwarden", 45, (84, 86)),
    Enemy("deepdelve_wight", "Deepdelve Wight", 46),
]

PUBLIC_COPY_SLUGS = {enemy.slug for enemy in ENEMIES}


def source_cell_box(index: int, width: int, height: int) -> tuple[int, int, int, int]:
    col = index % CONTACT_COLS
    row = index // CONTACT_COLS
    return (
        round(col * width / CONTACT_COLS),
        round(row * height / CONTACT_ROWS),
        round((col + 1) * width / CONTACT_COLS),
        round((row + 1) * height / CONTACT_ROWS),
    )


def is_chroma_candidate(pixel: tuple[int, int, int, int]) -> bool:
    r, g, b, a = pixel
    if a == 0:
        return True
    return r >= 180 and b >= 165 and g <= 90 and abs(r - b) <= 85


def remove_connected_magenta_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    px = rgba.load()
    seen = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        index = y * width + x
        if seen[index] or not is_chroma_candidate(px[x, y]):
            return
        seen[index] = 1
        queue.append((x, y))

    for x in range(width):
        push(x, 0)
        push(x, height - 1)
    for y in range(height):
        push(0, y)
        push(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            push(x - 1, y)
        if x < width - 1:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y < height - 1:
            push(x, y + 1)

    out = rgba.copy()
    out_px = out.load()
    for y in range(height):
        row = y * width
        for x in range(width):
            if seen[row + x]:
                out_px[x, y] = (0, 0, 0, 0)
    return out


def save_on_magenta(image: Image.Image, path: Path) -> None:
    canvas = Image.new("RGBA", image.size, MAGENTA)
    canvas.alpha_composite(image.convert("RGBA"))
    canvas.save(path)


def quantize_rgba(image: Image.Image, colors: int = 18) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    hard_alpha = alpha.point(lambda value: 255 if value >= 32 else 0)
    rgb = Image.new("RGB", rgba.size, (0, 0, 0))
    rgb.paste(rgba.convert("RGB"), mask=hard_alpha)
    quantized = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT).convert("RGB")
    out = Image.new("RGBA", rgba.size)
    out.paste(quantized)
    out.putalpha(hard_alpha)
    despill_magenta(out)
    return out


def despill_magenta(image: Image.Image) -> None:
    px = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            distance = ((r - MAGENTA_RGB[0]) ** 2 + (g - MAGENTA_RGB[1]) ** 2 + (b - MAGENTA_RGB[2]) ** 2) ** 0.5
            if distance <= 36 or (r >= 205 and b >= 180 and g <= 80 and abs(r - b) <= 90):
                px[x, y] = (168, max(g, 72), 144, a)


def fit_sprite(sprite: Image.Image, max_size: tuple[int, int]) -> Image.Image:
    bbox = sprite.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError("empty source sprite")
    trimmed = sprite.crop(bbox)
    max_width, max_height = max_size
    scale = min(max_width / trimmed.width, max_height / trimmed.height, 1.0)
    size = (max(1, round(trimmed.width * scale)), max(1, round(trimmed.height * scale)))
    resized = trimmed.resize(size, Image.Resampling.NEAREST)
    return quantize_rgba(resized)


def direction_sprite(sprite: Image.Image, direction: str) -> Image.Image:
    if direction == "left":
        return sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if direction == "right":
        return sprite
    if direction == "up":
        darker = ImageEnhance.Brightness(sprite).enhance(0.72)
        return ImageEnhance.Contrast(darker).enhance(0.9)
    return sprite


def place_sprite(cell: Image.Image, sprite: Image.Image, frame_index: int, direction: str) -> None:
    walk_offsets = {
        "up": ((-1, 1), (0, -1), (1, 1), (0, -1)),
        "right": ((-2, 1), (0, -1), (2, 1), (0, -1)),
        "down": ((-1, 1), (0, -1), (1, 1), (0, -1)),
        "left": ((2, 1), (0, -1), (-2, 1), (0, -1)),
    }
    dx, dy = walk_offsets[direction][frame_index]
    x = (CELL - sprite.width) // 2 + dx
    y = CELL - sprite.height - 10 + dy
    cell.alpha_composite(sprite, (x, y))
    # The processor realigns each frame by anchor, so a tiny in-sprite foot tick
    # keeps inspection GIFs from collapsing identical held poses.
    tick_colors = ((30, 34, 32, 255), (54, 58, 52, 255), (78, 74, 60, 255), (54, 58, 52, 255))
    tick_x = max(0, min(CELL - 1, x + sprite.width // 2 + (-1, 0, 1, 0)[frame_index]))
    tick_y = max(0, min(CELL - 1, y + sprite.height - 2))
    cell.putpixel((tick_x, tick_y), tick_colors[frame_index])


def make_sheet(enemy: Enemy, source_contact_alpha: Image.Image, enemy_dir: Path) -> tuple[Path, Path]:
    source_dir = SOURCE_ROOT / enemy.slug
    source_dir.mkdir(parents=True, exist_ok=True)

    raw_cell = source_contact_alpha.crop(source_cell_box(enemy.source_index, *source_contact_alpha.size))
    bbox = raw_cell.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError(f"{enemy.slug} source cell is empty")
    source_cutout = raw_cell.crop(bbox)
    source_cutout_path = source_dir / f"{enemy.slug}_imagegen_cutout_alpha.png"
    source_cutout.save(source_cutout_path)

    base = fit_sprite(source_cutout, enemy.max_size)
    sheet = Image.new("RGBA", (CELL * COLS, CELL * ROWS), MAGENTA)
    for row_idx, row_name in enumerate(ROW_NAMES):
        _, direction = row_name.split("_", 1)
        directed = direction_sprite(base, direction)
        for frame_index in range(COLS):
            frame = Image.new("RGBA", (CELL, CELL), MAGENTA)
            place_sprite(frame, directed, frame_index, direction)
            sheet.alpha_composite(frame, (frame_index * CELL, row_idx * CELL))

    path = enemy_dir / f"{enemy.slug}_generated_chroma.png"
    sheet.save(path)
    return path, source_cutout_path


def validate_one_subject_cells(sheet_path: Path) -> None:
    im = Image.open(sheet_path).convert("RGBA")
    errors = []
    for row in range(ROWS):
        for col in range(COLS):
            cell = im.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
            mask = Image.new("1", cell.size, 0)
            px = cell.load()
            for y in range(CELL):
                for x in range(CELL):
                    if px[x, y][:3] != MAGENTA_RGB:
                        mask.putpixel((x, y), 1)
            bbox = mask.getbbox()
            if not bbox:
                errors.append(f"empty cell r{row} c{col}")
                continue
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            if width > CELL or height > CELL:
                errors.append(f"too large r{row} c{col}: {width}x{height}px")
    if errors:
        raise RuntimeError("; ".join(errors))


def gif_frame_count(path: Path) -> int:
    with Image.open(path) as im:
        return sum(1 for _ in ImageSequence.Iterator(im))


def write_review_gif(frame_dir: Path, dst: Path) -> None:
    frames = []
    for path in sorted(frame_dir.glob("*.png")):
        frame = Image.open(path).convert("RGBA")
        canvas = Image.new("RGBA", frame.size, (28, 32, 38, 255))
        canvas.alpha_composite(frame)
        frames.append(canvas.convert("RGB"))
    if len(frames) != COLS:
        raise RuntimeError(f"{frame_dir} has {len(frames)} aligned frames, expected {COLS}")
    frames[0].save(
        dst,
        save_all=True,
        append_images=frames[1:],
        duration=120,
        loop=0,
        optimize=False,
        disposal=2,
    )


def clear_stale_enemy_outputs(enemy_dir: Path, enemy: Enemy) -> None:
    enemy_dir.mkdir(parents=True, exist_ok=True)
    for path in enemy_dir.glob(f"{enemy.slug}_*_inspection.gif"):
        path.unlink()
    for path in enemy_dir.glob(f"{enemy.slug}_*.png"):
        path.unlink()
    grid_dir = enemy_dir / "grid"
    if grid_dir.exists():
        shutil.rmtree(grid_dir)


def process_enemy(enemy: Enemy, source_contact_alpha: Image.Image) -> dict:
    enemy_dir = OUT / enemy.slug
    clear_stale_enemy_outputs(enemy_dir, enemy)
    sheet, source_cutout = make_sheet(enemy, source_contact_alpha, enemy_dir)
    validate_one_subject_cells(sheet)
    grid_dir = enemy_dir / "grid"
    command = [
        "python3",
        str(PROCESSOR),
        "grid-sheet",
        str(sheet),
        "--output-dir",
        str(grid_dir),
        "--columns",
        str(COLS),
        "--rows",
        str(ROWS),
        "--row-names",
        ",".join(ROW_NAMES),
        "--preview-background",
        "28,32,38",
        "--allow-outside-input",
        "--workspace-root",
        str(ROOT),
        "--max-post-drift",
        "1",
        "--no-sample-corner",
        "--chroma",
        "255,0,255",
        "--tolerance",
        "0",
        "--max-chroma-remnants",
        "0",
    ]
    completed = subprocess.run(command, text=True, capture_output=True)
    if completed.returncode:
        print(completed.stdout)
        print(completed.stderr)
        completed.check_returncode()
    manifest = json.loads((grid_dir / "grid_manifest.json").read_text())
    cleaned_alpha_sheet = Path(manifest["cleaned_image"])
    public_sheet = None
    if enemy.slug in PUBLIC_COPY_SLUGS:
        public_sheet = ROOT / "public" / f"{enemy.slug.replace('_', '-')}-sheet.png"
        shutil.copyfile(cleaned_alpha_sheet, public_sheet)
    rows_by_name = {row["name"]: row for row in manifest["rows"]}
    gifs = {}
    for row_name in ROW_NAMES:
        dst = enemy_dir / f"{enemy.slug}_{row_name}_inspection.gif"
        write_review_gif(Path(rows_by_name[row_name]["aligned_dir"]), dst)
        count = gif_frame_count(dst)
        if count != COLS:
            raise RuntimeError(f"{dst} has {count} frames, expected {COLS}")
        gifs[row_name] = str(dst)
    return {
        "slug": enemy.slug,
        "label": enemy.label,
        "pipeline": PIPELINE_NAME,
        "sheet_contract": PIPELINE_SPEC,
        "imagegen_source_contact": str(SOURCE_CONTACT),
        "normalized_magenta_contact": str(NORMALIZED_CONTACT),
        "source_index": enemy.source_index,
        "source_cutout": str(source_cutout),
        "generated_chroma": str(sheet),
        "cleaned_alpha_sheet": str(cleaned_alpha_sheet),
        "public_sheet": str(public_sheet) if public_sheet else None,
        "grid_manifest": str(grid_dir / "grid_manifest.json"),
        "gifs": gifs,
        "chroma_remnant_pixels": manifest["chroma_remnant_pixels"],
        "alpha_corners": manifest["alpha_corners"],
        "single_subject_cells": True,
    }


def make_contact(results: list[dict]) -> Path:
    thumbs = []
    for item in results:
        alpha = Image.open(item["cleaned_alpha_sheet"]).convert("RGBA")
        thumb = Image.new("RGBA", (COLS * 48, ROWS * 48), (28, 32, 38, 255))
        alpha_small = alpha.resize((COLS * 48, ROWS * 48), Image.Resampling.NEAREST)
        thumb.alpha_composite(alpha_small)
        thumbs.append((item["label"], thumb))
    width = COLS * 48
    height = len(thumbs) * (ROWS * 48 + 18)
    contact = Image.new("RGB", (width, height), (28, 32, 38))
    from PIL import ImageDraw

    draw = ImageDraw.Draw(contact)
    y = 0
    for label, thumb in thumbs:
        contact.paste(thumb.convert("RGB"), (0, y + 18))
        draw.text((4, y + 3), label, fill=(230, 234, 220))
        y += ROWS * 48 + 18
    out = OUT / "woodland_bespoke_v2_contact.png"
    contact.save(out)
    return out


def write_source_metadata() -> None:
    SOURCE_ROOT.mkdir(parents=True, exist_ok=True)
    (SOURCE_ROOT / "PROMPT.md").write_text(
        "\n".join(
            [
                "# Enemy Directional 4x4 V2 Imagegen Source",
                "",
                "The production v2 enemy sheets are imported from an image-generated",
                "simplified contact sheet. The model output is kept as the original",
                "source artifact, then locally normalized to an exact `#ff00ff`",
                "chroma background before slicing and alpha cleanup.",
                "",
                "Runtime contract: 384x384 sheets, 96px cells, 4 columns, rows",
                "`walk_up`, `walk_right`, `walk_down`, `walk_left`.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    (SOURCE_ROOT / "roster_manifest.json").write_text(
        json.dumps(
            {
                "pipeline": PIPELINE_NAME,
                "source_contact": str(SOURCE_CONTACT),
                "normalized_magenta_contact": str(NORMALIZED_CONTACT),
                "contact_grid": {"columns": CONTACT_COLS, "rows": CONTACT_ROWS},
                "chroma": "#ff00ff",
                "enemies": [
                    {
                        "slug": enemy.slug,
                        "label": enemy.label,
                        "source_index": enemy.source_index,
                    }
                    for enemy in ENEMIES
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> None:
    if not SOURCE_CONTACT.exists():
        raise FileNotFoundError(f"missing imagegen source contact sheet: {SOURCE_CONTACT}")
    OUT.mkdir(parents=True, exist_ok=True)
    write_source_metadata()
    source_contact_alpha = remove_connected_magenta_background(Image.open(SOURCE_CONTACT))
    save_on_magenta(source_contact_alpha, NORMALIZED_CONTACT)
    results = [process_enemy(enemy, source_contact_alpha) for enemy in ENEMIES]
    contact = make_contact(results)
    manifest = {
        "pipeline": PIPELINE_SPEC,
        "output_root": str(OUT),
        "imagegen_source_root": str(SOURCE_ROOT),
        "imagegen_source_contact": str(SOURCE_CONTACT),
        "normalized_magenta_contact": str(NORMALIZED_CONTACT),
        "contact": str(contact),
        "runtime_delivery": "per-enemy-public-sheets",
        "runtime_sheet_order": [item["slug"] for item in results],
        "enemies": results,
    }
    (OUT / "woodland_bespoke_v2_manifest.json").write_text(json.dumps(manifest, indent=2))
    gif_files = [Path(item["gifs"][row]) for item in results for row in ROW_NAMES]
    print(
        json.dumps(
            {
                "contact": str(contact),
                "manifest": str(OUT / "woodland_bespoke_v2_manifest.json"),
                "runtime_delivery": "per-enemy-public-sheets",
                "imagegen_source_contact": str(SOURCE_CONTACT),
                "normalized_magenta_contact": str(NORMALIZED_CONTACT),
                "gif_count": len(gif_files),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
