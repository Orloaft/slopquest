#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "woodland_bespoke_v2_manifest.json"

PIPELINE_NAME = "enemy-directional-4x4-v2"
CELL = 96
COLS = 4
ROW_NAMES = (
    "walk_up",
    "walk_right",
    "walk_down",
    "walk_left",
)
ROWS = len(ROW_NAMES)
# Style guard: the v2 look is "simpler painterly pixel" — a limited palette. We
# cap the number of distinct opaque colours per sheet so over-detailed / heavily
# anti-aliased art is rejected at the gate. Generous enough for soft painterly
# shading; tune here if the agreed style allows more.
MAX_SHEET_COLORS = 64
KEEPER_ART_SLUGS = {
    "goblin",
    "goblin_scout",
    "goblin_shaman",
    "grey_wolf",
    "rat",
    "skeleton",
    "spider",
    "wisp",
}


def fail(message: str) -> None:
    raise SystemExit(f"enemy asset pipeline check failed: {message}")


def frame_count(path: Path) -> int:
    with Image.open(path) as im:
        return sum(1 for _ in ImageSequence.Iterator(im))


def validate_sheet(path: Path) -> None:
    if not path.exists():
        fail(f"missing sheet {path}")
    with Image.open(path) as im:
        expected = (CELL * COLS, CELL * ROWS)
        if im.size != expected:
            fail(f"{path} is {im.size[0]}x{im.size[1]}, expected {expected[0]}x{expected[1]}")
        if im.mode != "RGBA":
            fail(f"{path} mode is {im.mode}, expected RGBA")
        alpha = im.getchannel("A")
        if alpha.getbbox() is None:
            fail(f"{path} has no opaque pixels")
        # Count distinct fully/partly opaque colours (ignore the transparent void).
        opaque_colors = {
            rgba[:3] for count, rgba in (im.getcolors(maxcolors=1 << 24) or []) if rgba[3] > 0
        }
        if len(opaque_colors) > MAX_SHEET_COLORS:
            fail(
                f"{path} uses {len(opaque_colors)} opaque colours, exceeds the "
                f"limited-palette cap of {MAX_SHEET_COLORS} (style: simpler painterly pixel)"
            )


def main() -> None:
    if not MANIFEST_PATH.exists():
        fail(f"missing manifest {MANIFEST_PATH}; run tools/generate_woodland_enemy_sprites_v2.py")

    manifest = json.loads(MANIFEST_PATH.read_text())
    pipeline = manifest.get("pipeline") or {}
    if pipeline.get("name") != PIPELINE_NAME:
        fail(f"manifest pipeline is {pipeline.get('name')!r}, expected {PIPELINE_NAME!r}")
    if tuple(pipeline.get("row_order") or ()) != ROW_NAMES:
        fail("manifest row_order does not match walk up/right/down/left")
    if pipeline.get("cell_px") != CELL or pipeline.get("columns") != COLS or pipeline.get("rows") != ROWS:
        fail("manifest geometry does not match 96px cells, 4 columns, 4 rows")

    enemies = manifest.get("enemies") or []
    by_slug = {enemy.get("slug"): enemy for enemy in enemies}
    if len(by_slug) != len(enemies):
        fail("manifest contains duplicate or missing enemy slugs")
    keeper_leaks = sorted(KEEPER_ART_SLUGS & set(by_slug))
    if keeper_leaks:
        fail(f"keeper hand-art families must not be regenerated into v2 atlas: {', '.join(keeper_leaks)}")

    if manifest.get("runtime_delivery") not in (None, "per-enemy-public-sheets"):
        fail(f"unsupported runtime_delivery {manifest.get('runtime_delivery')!r}")

    for item in enemies:
        slug = item.get("slug")
        if item.get("pipeline") != PIPELINE_NAME:
            fail(f"{slug} has pipeline {item.get('pipeline')!r}, expected {PIPELINE_NAME!r}")

        public_sheet = item.get("public_sheet")
        if not public_sheet:
            fail(f"{slug} is missing a public_sheet entry")
        validate_sheet(Path(public_sheet))

        grid_manifest = Path(item["grid_manifest"])
        rows = {row["name"]: row for row in json.loads(grid_manifest.read_text()).get("rows", [])}
        if tuple(rows) != ROW_NAMES:
            fail(f"{slug} grid rows are {tuple(rows)}, expected {ROW_NAMES}")

        gifs = item.get("gifs") or {}
        for row_name in ROW_NAMES:
            if row_name not in rows:
                fail(f"{slug} missing grid row {row_name}")
            gif_path = Path(gifs.get(row_name, ""))
            if not gif_path.exists():
                fail(f"{slug} missing review GIF for {row_name}")
            count = frame_count(gif_path)
            if count != COLS:
                fail(f"{gif_path} has {count} frames, expected {COLS}")

    print(
        json.dumps(
            {
                "pipeline": PIPELINE_NAME,
                "checked_public_sheets": len(enemies),
                "sheet_size": f"{CELL * COLS}x{CELL * ROWS}",
                "row_order": ROW_NAMES,
            },
            indent=2,
        )
    )
if __name__ == "__main__":
    main()
