#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import hashlib
from pathlib import Path

from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "woodland_bespoke_v2_manifest.json"
CATALOG_PATH = ROOT / "src" / "generated" / "catalog.ts"
CLIENT_PATH = ROOT / "src" / "main.ts"

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

# Reviewed non-manifest runtime families. These entries exist because they are
# loaded outside the generated v2 manifest path, so a live file must point at a
# concrete review report instead of passing just because public/*.png exists.
REVIEWED_RUNTIME_ART = {
    "goblin": {
        "public_sheet": ROOT / "public" / "goblin.png",
        "review_report": ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "goblin" / "production-review-20260611-goblin-public-imagegen-019eb41d" / "public-review" / "goblin-public-gate-report.json",
    },
    "goblinScout": {
        "public_sheet": ROOT / "public" / "goblin-scout-sheet.png",
        "review_report": ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "goblin_scout" / "production-review-20260611-goblin-scout-public-final" / "goblin-scout-public-gate-report.json",
    },
    "goblinShaman": {
        "public_sheet": ROOT / "public" / "goblin-shaman-sheet.png",
        "review_report": ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "goblin_shaman" / "parallel-wave-20260610-shaman" / "review-import-candidate" / "goblin_shaman_parallel_wave_20260610_import-gate-report.json",
    },
    "greyWolf": {
        "public_sheet": ROOT / "public" / "grey-wolf-sheet.png",
        "review_report": ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "grey_wolf" / "manager-slime-rat-redesign-v2-20260611" / "strict-review" / "grey-wolf-manager-redesign-v2-20260611-gate-report.json",
        "reviewed_keyed_png": ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "grey_wolf" / "manager-slime-rat-redesign-v2-20260611" / "strict-review" / "grey-wolf-manager-redesign-v2-20260611-keyed.png",
    },
    "rat": {
        "public_sheet": ROOT / "public" / "rat-sheet.png",
        "review_report": ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "rat" / "manager-slime-rat-redesign-v2-20260611" / "strict-review" / "rat-manager-redesign-v2-20260611-gate-report.json",
        "reviewed_keyed_png": ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "rat" / "manager-slime-rat-redesign-v2-20260611" / "strict-review" / "rat-manager-redesign-v2-20260611-keyed.png",
    },
    "spider": {
        "public_sheet": ROOT / "public" / "spider-sheet.png",
        "review_report": ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "spider" / "manager-spider-redesign-v2-20260611" / "strict-review" / "spider-manager-redesign-v2-20260611-gate-report.json",
        "reviewed_keyed_png": ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "spider" / "manager-spider-redesign-v2-20260611" / "strict-review" / "spider-manager-redesign-v2-20260611-keyed.png",
    },
    "wisp": {
        "public_sheet": ROOT / "public" / "wisp-sheet.png",
        "review_report": ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2" / "wisp" / "production-review-20260611-wisp-public" / "wisp-gate-report.json",
    },
}

# Keeper art may bypass v2 only after explicit keeper review. Keep this list
# tiny and include the exact runtime asset that review accepted.
REVIEWED_KEEPER_ALLOWLIST = {
    "skeleton": {
        "public_sheet": ROOT / "public" / "skeleton.png",
        "review": "2026-06-11 keeper review accepted skeleton -> public/skeleton.png",
    },
}


def fail(message: str) -> None:
    raise SystemExit(f"enemy asset pipeline check failed: {message}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def actor_sheet_slug(family: str) -> str:
    return family.replace("_", "-")


def parse_string_array(source: str, const_name: str) -> set[str]:
    match = re.search(rf"const {const_name} = \[(.*?)\] as const;", source, re.S)
    if not match:
        fail(f"could not find {const_name} in {CLIENT_PATH}")
    return set(re.findall(r'"([^"]+)"', match.group(1)))


def live_monster_types() -> set[str]:
    catalog = CATALOG_PATH.read_text()
    match = re.search(r"export const MONSTER_SPAWNS: MonsterSpawn\[] = \[(.*?)\];", catalog, re.S)
    if not match:
        fail(f"could not find MONSTER_SPAWNS in {CATALOG_PATH}")
    types = set(re.findall(r'"type": "([^"]+)"', match.group(1)))
    if not types:
        fail("MONSTER_SPAWNS does not contain any live monster types")
    return types


def monster_actor_family_by_type() -> dict[str, str]:
    client = CLIENT_PATH.read_text()
    match = re.search(r"function computeMonsterActorSpec\(monster: \{ type: string \}\): MonsterActorSpec \{(.*?)\n\}", client, re.S)
    if not match:
        fail(f"could not find computeMonsterActorSpec in {CLIENT_PATH}")
    families = {
        monster_type: family
        for monster_type, family in re.findall(
            r'if \(monster\.type === "([^"]+)"\) return \{ family: "([^"]+)"',
            match.group(1),
        )
    }
    if not families:
        fail("computeMonsterActorSpec did not yield any explicit monster family mappings")
    return families


def validate_review_report(path: Path, family: str) -> None:
    if not path.exists():
        fail(f"{family} missing reviewed art report {path}")
    report = json.loads(path.read_text())
    if report.get("pass") is not True:
        fail(f"{family} reviewed art report did not pass: {path}")
    artifacts = report.get("artifacts") or {}
    keyed = report.get("keyed_png") or artifacts.get("keyed_png")
    if not keyed:
        fail(f"{family} reviewed art report is missing keyed_png provenance: {path}")
    keyed_path = Path(keyed)
    if not keyed_path.is_absolute():
        keyed_path = ROOT / keyed_path
    if not keyed_path.exists():
        fail(f"{family} reviewed keyed artifact is missing: {keyed_path}")


def validate_reviewed_runtime_art(family: str, entry: dict[str, Path]) -> None:
    public_sheet = entry["public_sheet"]
    validate_runtime_actor_sheet(public_sheet)
    validate_review_report(entry["review_report"], family)
    reviewed_keyed_png = entry.get("reviewed_keyed_png")
    if reviewed_keyed_png:
        if not reviewed_keyed_png.exists():
            fail(f"{family} reviewed keyed artifact is missing: {reviewed_keyed_png}")
        if sha256(public_sheet) != sha256(reviewed_keyed_png):
            fail(f"{family} live sheet {public_sheet} does not byte-match reviewed keyed artifact {reviewed_keyed_png}")


def validate_runtime_artstyle_guard(manifest_by_slug: dict[str, dict]) -> dict[str, object]:
    client = CLIENT_PATH.read_text()
    woodland_families = parse_string_array(client, "WOODLAND_BESPOKE_FAMILIES")
    directional_keeper_families = parse_string_array(client, "DIRECTIONAL_KEEPER_FAMILIES")

    types = live_monster_types()
    family_by_type = monster_actor_family_by_type()
    missing_types = sorted(types - set(family_by_type))
    if missing_types:
        fail(f"live monster types lack explicit computeMonsterActorSpec mapping: {', '.join(missing_types)}")

    live_families = {family_by_type[monster_type] for monster_type in types}
    covered = {}
    missing = []
    for family in sorted(live_families):
        manifest_slug = family
        manifest_item = manifest_by_slug.get(manifest_slug)
        if manifest_item:
            expected_sheet = ROOT / "public" / f"{actor_sheet_slug(family)}-sheet.png"
            if Path(manifest_item.get("public_sheet", "")) != expected_sheet:
                fail(f"{family} manifest public_sheet {manifest_item.get('public_sheet')!r} does not match runtime sheet {expected_sheet}")
            if family not in woodland_families:
                fail(f"{family} is manifest-reviewed but is not in WOODLAND_BESPOKE_FAMILIES")
            covered[family] = "reviewed-v2-manifest"
            continue
        if family in REVIEWED_RUNTIME_ART:
            validate_reviewed_runtime_art(family, REVIEWED_RUNTIME_ART[family])
            covered[family] = "reviewed-runtime-art"
            continue
        if family in REVIEWED_KEEPER_ALLOWLIST:
            entry = REVIEWED_KEEPER_ALLOWLIST[family]
            validate_runtime_actor_sheet(entry["public_sheet"])
            covered[family] = "reviewed-keeper-allowlist"
            continue
        missing.append(family)

    if missing:
        fail(
            "live runtime enemy families lack reviewed v2/imogen provenance or keeper allowlist: "
            + ", ".join(missing)
        )

    unexpected_directional = sorted(
        family for family in directional_keeper_families
        if family not in REVIEWED_RUNTIME_ART and family not in REVIEWED_KEEPER_ALLOWLIST
    )
    if unexpected_directional:
        fail(f"directional keeper runtime families lack review provenance: {', '.join(unexpected_directional)}")

    return {
        "live_monster_types": len(types),
        "live_runtime_families": len(live_families),
        "reviewed_v2_manifest_families": sum(1 for status in covered.values() if status == "reviewed-v2-manifest"),
        "reviewed_runtime_art_families": sorted(family for family, status in covered.items() if status == "reviewed-runtime-art"),
        "reviewed_keeper_allowlist": {
            family: str(entry["public_sheet"].relative_to(ROOT))
            for family, entry in REVIEWED_KEEPER_ALLOWLIST.items()
            if family in live_families
        },
    }


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


def validate_runtime_actor_sheet(path: Path) -> None:
    if not path.exists():
        fail(f"missing runtime actor sheet {path}")
    with Image.open(path) as im:
        if im.mode not in ("RGBA", "RGB", "P"):
            fail(f"{path} mode is {im.mode}, expected an image mode usable as a runtime actor sheet")
        if im.convert("RGBA").getchannel("A").getbbox() is None:
            fail(f"{path} has no visible pixels")


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

    runtime_guard = validate_runtime_artstyle_guard(by_slug)

    print(
        json.dumps(
            {
                "pipeline": PIPELINE_NAME,
                "checked_public_sheets": len(enemies),
                "sheet_size": f"{CELL * COLS}x{CELL * ROWS}",
                "row_order": ROW_NAMES,
                "runtime_artstyle_guard": runtime_guard,
            },
            indent=2,
        )
    )
if __name__ == "__main__":
    main()
