#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assetsources" / "curated" / "bespoke" / "woodland-enemies-v2"
PROCESSOR = Path.home() / ".openclaw/workspace/skills/sprite_processor/scripts/sprite_processor.py"

BG = (0, 255, 0, 255)
CELL = 96
# v2 contract: simpler painterly-pixel style. Walk-only (4 directional rows), 4
# frames each -> 384x384. Attacks reuse the walk pose at runtime plus the shared
# slash/missile effect overlays, so no dedicated attack rows are generated.
COLS = 4
ANIMATION_ROWS = ("walk",)
DIRECTION_ROWS = ("up", "right", "down", "left")
ROW_NAMES = tuple(f"{anim}_{direction}" for anim in ANIMATION_ROWS for direction in DIRECTION_ROWS)
ROWS = len(ROW_NAMES)
SCALE = 3
PIPELINE_NAME = "enemy-directional-4x4-v2"
PIPELINE_SPEC = {
    "name": PIPELINE_NAME,
    "source_reference": "Imagen style reference plus the goblin scout directional walk contract, simplified to a 4-frame walk-only grid; attacks reuse walk + shared effect overlays",
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
    kind: str
    colors: tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]]


ENEMIES = [
    Enemy("ghoul", "Crypt Ghoul", "ghoul", ((105, 124, 99), (55, 68, 60), (184, 204, 159))),
    Enemy("grave_revenant", "Grave Revenant", "revenant", ((74, 82, 84), (181, 197, 177), (83, 139, 126))),
    Enemy("pale_banshee", "Pale Banshee", "banshee", ((180, 196, 204), (82, 91, 112), (139, 218, 223))),
    Enemy("crypt_sentinel", "Crypt Sentinel", "sentinel", ((78, 76, 82), (196, 190, 165), (137, 107, 68))),
    Enemy("wild_boar", "Wild Boar", "boar", ((116, 75, 50), (76, 49, 37), (218, 202, 160))),
    Enemy("thorn_hedgehog", "Thorn Hedgehog", "hedgehog", ((111, 87, 54), (64, 91, 47), (178, 156, 96))),
    Enemy("forest_spider", "Forest Spider", "spider", ((61, 67, 61), (32, 38, 35), (156, 65, 63))),
    Enemy("forest_slime", "Forest Slime", "slime", ((57, 137, 101), (32, 88, 72), (140, 218, 173))),
    Enemy("sapling_deer", "Sapling Deer", "deer", ((142, 102, 58), (71, 117, 64), (221, 185, 112))),
    Enemy("mushroom_brute", "Mushroom Brute", "mushroom", ((150, 64, 62), (232, 216, 185), (91, 64, 48))),
    Enemy("dire_wolf", "Dire Wolf", "wolf", ((82, 88, 97), (45, 50, 59), (190, 61, 55))),
    Enemy("orc", "Cave Orc", "orc", ((92, 103, 58), (68, 51, 48), (217, 211, 187))),
    Enemy("forest_pixie", "Forest Pixie", "pixie", ((106, 104, 177), (226, 190, 94), (112, 205, 177))),
    Enemy("bone_druid", "Bone Druid", "druid", ((91, 84, 77), (216, 209, 181), (74, 100, 57))),
    Enemy("bog_wraith", "Bog Wraith", "wraith", ((62, 92, 95), (37, 58, 66), (118, 183, 179))),
    Enemy("ancient_treant", "Ancient Treant", "treant", ((104, 72, 44), (62, 113, 57), (173, 133, 78))),
    Enemy("reach_hen", "Reach Hen", "hen", ((151, 112, 70), (226, 207, 160), (172, 55, 45))),
    Enemy("meadow_hopper", "Meadow Hopper", "hopper", ((117, 158, 82), (65, 96, 62), (220, 203, 126))),
    Enemy("reach_vole", "Reach Vole", "vole", ((117, 92, 72), (74, 57, 49), (210, 176, 137))),
    Enemy("grave_shambler", "Grave Shambler", "shambler", ((102, 105, 92), (69, 69, 72), (188, 179, 145))),
    Enemy("skitterer", "Skitterer", "skitterer", ((71, 88, 69), (34, 44, 38), (167, 91, 71))),
    Enemy("mire_spitter", "Mire Spitter", "toad", ((71, 116, 82), (37, 68, 59), (159, 217, 116))),
    Enemy("canyon_scavenger", "Canyon Scavenger", "hound", ((137, 82, 54), (77, 49, 42), (225, 171, 91))),
    Enemy("dust_burrower", "Dust Burrower", "burrower", ((141, 102, 63), (91, 64, 47), (219, 181, 112))),
    Enemy("dune_skitterer", "Dune Skitterer", "skitterer", ((159, 124, 70), (91, 68, 45), (234, 198, 118))),
    Enemy("sun_wraith", "Sun-Scorched Wraith", "wraith", ((166, 104, 58), (91, 57, 45), (238, 184, 88))),
    Enemy("reef_prowler", "Reef Prowler", "prowler", ((64, 119, 128), (38, 67, 80), (178, 222, 197))),
    Enemy("venomous_stalker", "Venomous Stalker", "stalker", ((62, 102, 58), (36, 58, 40), (166, 219, 91))),
    Enemy("totem_wraith", "Ancient Totem Wraith", "wraith", ((95, 75, 122), (48, 42, 70), (195, 155, 230))),
    Enemy("bog_leech", "Bog Leech", "leech", ((92, 55, 64), (47, 34, 42), (184, 83, 88))),
    Enemy("marsh_hag", "Marsh Hag", "hag", ((87, 105, 73), (62, 55, 70), (164, 204, 87))),
    Enemy("gloom_toad", "Gloom Toad", "toad", ((91, 128, 69), (48, 71, 46), (211, 173, 74))),
    Enemy("magma_hound", "Magma Hound", "hound", ((53, 49, 47), (30, 29, 31), (232, 94, 48))),
    Enemy("cinder_shade", "Cinder Shade", "wraith", ((100, 72, 67), (52, 45, 48), (239, 124, 63))),
    Enemy("basalt_brute", "Basalt Brute", "golem", ((71, 67, 67), (41, 40, 43), (225, 92, 50))),
    Enemy("bone_scorpion", "Bone Scorpion", "scorpion", ((207, 193, 151), (121, 95, 67), (230, 219, 178))),
    Enemy("dune_reaver", "Dune Reaver", "mummy", ((183, 154, 103), (91, 66, 55), (213, 194, 144))),
    Enemy("mirage_shade", "Mirage Shade", "wraith", ((151, 131, 95), (73, 67, 71), (116, 207, 220))),
    Enemy("tide_lurker", "Tide Lurker", "lurker", ((62, 111, 121), (43, 68, 79), (178, 199, 151))),
    Enemy("brine_siren", "Brine Siren", "siren", ((126, 169, 173), (55, 82, 100), (213, 223, 190))),
    Enemy("coral_crab", "Coral Crab", "crab", ((158, 86, 71), (87, 53, 58), (231, 149, 125))),
    Enemy("canopy_stalker", "Canopy Stalker", "panther", ((50, 62, 48), (28, 35, 31), (145, 161, 76))),
    Enemy("blowpipe_headhunter", "Blowpipe Headhunter", "headhunter", ((121, 78, 55), (54, 83, 48), (218, 206, 164))),
]

PUBLIC_COPY_SLUGS = {enemy.slug for enemy in ENEMIES}


def rect(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, color: tuple[int, int, int], s: int = SCALE) -> None:
    d.rectangle((x * s, y * s, (x + w) * s - 1, (y + h) * s - 1), fill=color + (255,))


def poly(d: ImageDraw.ImageDraw, pts: list[tuple[int, int]], color: tuple[int, int, int], s: int = SCALE) -> None:
    d.polygon([(x * s, y * s) for x, y in pts], fill=color + (255,))


def ellipse(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, color: tuple[int, int, int], s: int = SCALE) -> None:
    d.ellipse((x * s, y * s, (x + w) * s - 1, (y + h) * s - 1), fill=color + (255,))


def frame_canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGBA", (CELL, CELL), BG)
    return im, ImageDraw.Draw(im)


def orient_frame(frame: Image.Image, direction: str) -> Image.Image:
    if direction == "left":
        return frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if direction == "up":
        return frame.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    return frame


def draw_weapon(d: ImageDraw.ImageDraw, cx: int, cy: int, attack: float, color: tuple[int, int, int]) -> None:
    reach = int(attack * 7)
    rect(d, cx + 9, cy + 5 - reach // 3, 2, 10 + reach, color)
    rect(d, cx + 8, cy + 4 - reach // 3, 4, 2, (214, 204, 156))


def draw_goblin(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    c, dark, accent = e.colors
    phase = math.sin(f / COLS * math.tau)
    bob = int(round(abs(phase)))
    atk = [0, 0.15, 0.4, 1, 0.8, 0.35, 0.1, 0][f] if row == "attack" else 0
    cx, gy = 16, 25 - bob
    lean = int(atk * 3)
    leg = 2 if phase > 0 else -2
    rect(d, cx - 5 + lean, gy - 10, 10, 11, c)
    rect(d, cx - 4 + lean, gy - 17, 8, 7, c)
    poly(d, [(cx - 4 + lean, gy - 15), (cx - 10 + lean, gy - 18), (cx - 6 + lean, gy - 12)], c)
    poly(d, [(cx + 4 + lean, gy - 15), (cx + 10 + lean, gy - 18), (cx + 6 + lean, gy - 12)], c)
    rect(d, cx - 3 + lean, gy - 14, 2, 2, (236, 238, 184))
    rect(d, cx + 2 + lean, gy - 14, 2, 2, (236, 238, 184))
    rect(d, cx - 6 + lean, gy - 7, 3, 8, dark)
    rect(d, cx + 4 + lean, gy - 7, 3, 8, dark)
    rect(d, cx - 4 + leg + lean, gy, 3, 5, dark)
    rect(d, cx + 1 - leg + lean, gy, 3, 5, dark)
    rect(d, cx - 8 + lean, gy - 2, 5, 3, accent)
    draw_weapon(d, cx, gy - 13, atk, accent)
    if e.kind == "shaman":
        rect(d, cx - 7 + lean, gy - 9, 3, 12, e.colors[1])
        rect(d, cx + 8 + lean, gy - 17 - int(atk * 4), 2, 18, accent)
        if row == "attack":
            ellipse(d, cx + 6 + int(atk * 7), gy - 23 - int(atk * 3), 5, 5, (139, 104, 204))


def draw_orc(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    skin, armor, blade = e.colors
    phase = math.sin(f / COLS * math.tau)
    bob = int(round(abs(phase) * 1.5))
    atk = [0, 0, 1, 4, 7, 4, 1, 0][f] if row == "attack" else 0
    cx, gy = 16 + atk // 2, 27 - bob
    leg = 2 if phase > 0 else -2
    rect(d, cx - 7, gy - 14, 14, 14, armor)
    rect(d, cx - 5, gy - 21, 10, 8, skin)
    poly(d, [(cx - 5, gy - 18), (cx - 12, gy - 21), (cx - 8, gy - 15)], skin)
    poly(d, [(cx + 5, gy - 18), (cx + 12, gy - 21), (cx + 8, gy - 15)], skin)
    rect(d, cx - 2, gy - 18, 1, 1, (237, 236, 186))
    rect(d, cx + 3, gy - 18, 1, 1, (237, 236, 186))
    rect(d, cx - 4, gy - 15, 8, 2, (112, 73, 57))
    rect(d, cx - 9, gy - 11, 4, 11, skin)
    rect(d, cx + 6, gy - 11, 4, 11, skin)
    rect(d, cx - 5 + leg, gy, 4, 6, armor)
    rect(d, cx + 2 - leg, gy, 4, 6, armor)
    rect(d, cx - 12, gy - 8, 6, 8, armor)
    rect(d, cx + 10 + atk, gy - 20 - atk // 2, 3, 23, blade)
    rect(d, cx + 8 + atk, gy - 20 - atk // 2, 7, 3, blade)
    if row == "attack":
        poly(d, [(cx + 11 + atk, gy - 18), (cx + 21 + atk, gy - 11), (cx + 13 + atk, gy - 8)], blade)
        rect(d, cx + 16 + atk, gy - 10, 3, 2, (238, 232, 190))


def draw_ghoul(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    skin, rag, bone = e.colors
    phase = math.sin(f / COLS * math.tau)
    lurch = [0, 0, 1, 4, 6, 3, 1, 0][f] if row == "attack" else 0
    bob = int(round(abs(phase)))
    cx, gy = 16 + lurch // 2, 28 - bob
    leg = 2 if phase > 0 else -2
    lean = 2 + lurch // 3
    poly(d, [(cx - 8 + lean, gy), (cx - 6 + lean, gy - 16), (cx + 5 + lean, gy - 14), (cx + 8 + lean, gy)], skin)
    rect(d, cx - 5 + lean, gy - 20, 8, 7, skin)
    rect(d, cx - 5 + lean, gy - 15, 10, 6, rag)
    rect(d, cx - 3 + lean, gy - 18, 1, 1, (220, 235, 190))
    rect(d, cx + 2 + lean, gy - 18, 1, 1, (220, 235, 190))
    poly(d, [(cx - 6 + lean, gy - 12), (cx - 13 - lurch, gy - 8), (cx - 7 + lean, gy - 6)], skin)
    poly(d, [(cx + 6 + lean, gy - 12), (cx + 14 + lurch, gy - 7), (cx + 7 + lean, gy - 5)], skin)
    rect(d, cx - 5 + leg + lean, gy - 1, 3, 6, rag)
    rect(d, cx + 2 - leg + lean, gy - 1, 3, 6, rag)
    rect(d, cx - 6 + leg + lean, gy + 4, 4, 2, bone)
    rect(d, cx + 2 - leg + lean, gy + 4, 4, 2, bone)
    if row == "attack":
        rect(d, cx + 13 + lurch, gy - 8, 5, 2, bone)
        rect(d, cx + 15 + lurch, gy - 11, 2, 5, bone)


def add_frame_motion_tick(d: ImageDraw.ImageDraw, f: int, row: str) -> None:
    # A tiny in-silhouette tick prevents GIF optimizers from dropping held poses.
    # It sits in the lower body/foot area and reads as normal walk/attack pixel motion.
    walk_ticks = [(24, 28, 30), (28, 31, 34), (32, 35, 38), (36, 39, 42)]
    attack_ticks = [(238, 219, 112), (232, 190, 92), (220, 151, 70), (205, 95, 66)]
    color = (walk_ticks if row == "walk" else attack_ticks)[f % 4]
    rect(d, 14 + (f % 4), 28 + (f % 2), 1, 1, color)
    rect(d, 17 - (f % 4), 27 + ((f + 1) % 2), 1, 1, color)


def draw_wolf(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    c, dark, accent = e.colors
    phase = math.sin(f / COLS * math.tau)
    bob = int(abs(phase) * 2)
    lunge = [0, 0, 1, 4, 5, 2, 0, 0][f] if row == "attack" else 0
    cx, gy = 16 + lunge, 27 - bob
    rect(d, cx - 10, gy - 10, 18, 8, c)
    rect(d, cx + 4, gy - 15, 9, 7, c)
    poly(d, [(cx + 6, gy - 15), (cx + 8, gy - 20), (cx + 10, gy - 15)], dark)
    poly(d, [(cx + 12, gy - 14), (cx + 17 + lunge, gy - 12), (cx + 12, gy - 9)], c)
    rect(d, cx - 12, gy - 12, 4, 3, dark)
    rect(d, cx - 8 + (2 if phase > 0 else 0), gy - 3, 3, 8, dark)
    rect(d, cx - 1 + (-2 if phase > 0 else 0), gy - 3, 3, 8, dark)
    rect(d, cx + 6 + (-2 if phase > 0 else 0), gy - 3, 3, 8, dark)
    rect(d, cx + 11, gy - 11, 2, 2, accent)
    if row == "attack" and f in (3, 4):
        rect(d, cx + 16, gy - 9, 3, 2, accent)


def draw_boar(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    c, dark, tusk = e.colors
    phase = math.sin(f / COLS * math.tau)
    charge = [0, 0, 1, 4, 6, 3, 1, 0][f] if row == "attack" else 0
    cx, gy = 16 + charge, 27 - int(abs(phase))
    ellipse(d, cx - 11, gy - 13, 20, 13, c)
    rect(d, cx + 5, gy - 14, 8, 8, c)
    rect(d, cx + 11, gy - 10, 4, 3, dark)
    poly(d, [(cx + 10, gy - 8), (cx + 17, gy - 6), (cx + 11, gy - 5)], tusk)
    rect(d, cx - 7 + (2 if phase > 0 else 0), gy - 2, 3, 7, dark)
    rect(d, cx + 3 + (-2 if phase > 0 else 0), gy - 2, 3, 7, dark)
    rect(d, cx + 1, gy - 18, 3, 4, dark)


def draw_hedgehog(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    c, thorn, accent = e.colors
    phase = math.sin(f / COLS * math.tau)
    cx, gy = 16, 28 - int(abs(phase))
    ellipse(d, cx - 11, gy - 11, 22, 12, c)
    for i in range(7):
        x = cx - 10 + i * 3
        h = 5 + ((i + f) % 2)
        poly(d, [(x, gy - 9), (x + 1, gy - 15 - h // 2), (x + 3, gy - 9)], thorn)
    rect(d, cx + 8, gy - 8, 4, 4, accent)
    if row == "attack":
        spike = [0, 1, 2, 5, 7, 3, 1, 0][f]
        for i in range(3):
            poly(d, [(cx + 9 + i * 3, gy - 13), (cx + 15 + spike + i * 2, gy - 16 + i), (cx + 10 + i * 3, gy - 10)], thorn)


def draw_spider(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    c, dark, eye = e.colors
    phase = math.sin(f / COLS * math.tau)
    cx, gy = 16, 25
    ellipse(d, cx - 7, gy - 10, 14, 11, c)
    ellipse(d, cx + 3, gy - 9, 8, 7, dark)
    for side in (-1, 1):
        for i in range(4):
            step = int(math.sin(f / COLS * math.tau + i) * 2)
            y = gy - 8 + i * 2
            rect(d, cx + side * (5 + i * 2), y + step, side * 5 if side > 0 else 5, 2, dark)
    rect(d, cx + 7, gy - 7, 1, 1, eye)
    rect(d, cx + 10, gy - 7, 1, 1, eye)
    if row == "attack":
        jab = [0, 1, 2, 5, 6, 2, 1, 0][f]
        rect(d, cx + 10 + jab, gy - 5, 7, 2, eye)


def draw_slime(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    c, dark, hi = e.colors
    phase = math.sin(f / COLS * math.tau)
    squash = int(abs(phase) * 3)
    atk = [0, 0, 2, 6, 5, 2, 0, 0][f] if row == "attack" else 0
    cx, gy = 16 + atk, 27
    ellipse(d, cx - 10, gy - 13 + squash, 20 + atk // 2, 13 - squash, c)
    rect(d, cx - 4, gy - 7, 2, 2, dark)
    rect(d, cx + 4, gy - 7, 2, 2, dark)
    rect(d, cx - 5, gy - 11, 4, 2, hi)
    if row == "attack":
        ellipse(d, cx + 9, gy - 11, 5, 5, hi)


def draw_mushroom(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    cap, stem, dark = e.colors
    phase = math.sin(f / COLS * math.tau)
    atk = [0, 0, 1, 4, 5, 2, 0, 0][f] if row == "attack" else 0
    cx, gy = 16 + atk, 27 - int(abs(phase))
    rect(d, cx - 5, gy - 12, 10, 13, stem)
    ellipse(d, cx - 12, gy - 20, 24, 12, cap)
    rect(d, cx - 7, gy - 18, 3, 2, stem)
    rect(d, cx + 3, gy - 17, 4, 2, stem)
    rect(d, cx - 8, gy - 1, 4, 5, dark)
    rect(d, cx + 4, gy - 1, 4, 5, dark)
    if row == "attack":
        for i in range(3):
            ellipse(d, cx + 10 + i * 3 + atk, gy - 18 + i * 2, 2, 2, cap)


def draw_deer(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    c, leaf, antler = e.colors
    phase = math.sin(f / COLS * math.tau)
    atk = [0, 0, 1, 4, 5, 2, 0, 0][f] if row == "attack" else 0
    cx, gy = 16 + atk, 27 - int(abs(phase))
    rect(d, cx - 9, gy - 12, 16, 9, c)
    rect(d, cx + 4, gy - 17, 7, 7, c)
    rect(d, cx + 6, gy - 22, 2, 7, antler)
    rect(d, cx + 10, gy - 22, 2, 7, antler)
    rect(d, cx + 5, gy - 23, 4, 2, leaf)
    rect(d, cx + 9, gy - 23, 4, 2, leaf)
    rect(d, cx - 6 + (2 if phase > 0 else 0), gy - 4, 3, 9, c)
    rect(d, cx + 3 + (-2 if phase > 0 else 0), gy - 4, 3, 9, c)
    if row == "attack" and f in (3, 4):
        rect(d, cx + 12, gy - 20, 6, 2, antler)


def draw_treant(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    bark, leaf, hi = e.colors
    phase = math.sin(f / COLS * math.tau)
    atk = [0, 0, 1, 3, 6, 3, 1, 0][f] if row == "attack" else 0
    cx, gy = 16, 28 - int(abs(phase))
    rect(d, cx - 7, gy - 20, 14, 21, bark)
    rect(d, cx - 4, gy - 15, 2, 2, hi)
    rect(d, cx + 3, gy - 15, 2, 2, hi)
    rect(d, cx - 11, gy - 25, 22, 7, leaf)
    rect(d, cx - 10 - atk, gy - 17, 4 + atk, 4, bark)
    rect(d, cx + 7, gy - 17, 4 + atk, 4, bark)
    rect(d, cx - 6 + (1 if phase > 0 else -1), gy, 4, 5, bark)
    rect(d, cx + 3 + (-1 if phase > 0 else 1), gy, 4, 5, bark)
    if row == "attack":
        rect(d, cx + 12 + atk, gy - 16, 5, 3, leaf)


def draw_druid(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    robe, bone, moss = e.colors
    phase = math.sin(f / COLS * math.tau)
    atk = [0, 0, 1, 3, 5, 2, 0, 0][f] if row == "attack" else 0
    cx, gy = 16, 27 - int(abs(phase))
    poly(d, [(cx - 8, gy), (cx - 5, gy - 17), (cx + 5, gy - 17), (cx + 8, gy)], robe)
    rect(d, cx - 4, gy - 22, 8, 6, bone)
    rect(d, cx - 2, gy - 20, 1, 1, (35, 35, 35))
    rect(d, cx + 2, gy - 20, 1, 1, (35, 35, 35))
    rect(d, cx + 8, gy - 21 - atk, 2, 22, bone)
    if row == "attack":
        ellipse(d, cx + 5 + atk, gy - 28 - atk, 6, 6, moss)


def draw_pixie(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    body, hair, wing = e.colors
    phase = math.sin(f / COLS * math.tau)
    atk = [0, 0, 1, 3, 5, 2, 0, 0][f] if row == "attack" else 0
    cx, gy = 16 + atk, 22 + int(phase * 2)
    ellipse(d, cx - 10, gy - 13, 8, 12, wing)
    ellipse(d, cx + 2, gy - 13, 8, 12, wing)
    rect(d, cx - 3, gy - 10, 6, 11, body)
    rect(d, cx - 4, gy - 15, 8, 6, hair)
    rect(d, cx + 5, gy - 8, 5 + atk, 2, hair)
    if row == "attack":
        ellipse(d, cx + 10 + atk, gy - 12, 4, 4, (238, 224, 119))


def draw_wraith(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    c, dark, glow = e.colors
    phase = math.sin(f / COLS * math.tau)
    atk = [0, 0, 1, 3, 6, 3, 1, 0][f] if row == "attack" else 0
    cx, gy = 16 + atk, 26 + int(phase * 2)
    poly(d, [(cx - 8, gy + 2), (cx - 7, gy - 17), (cx + 7, gy - 17), (cx + 8, gy + 2), (cx + 3, gy - 2), (cx, gy + 4), (cx - 3, gy - 2)], c)
    rect(d, cx - 3, gy - 12, 2, 2, glow)
    rect(d, cx + 2, gy - 12, 2, 2, glow)
    rect(d, cx - 12 - atk, gy - 8, 6 + atk, 3, dark)
    rect(d, cx + 7, gy - 8, 6 + atk, 3, dark)
    if row == "attack":
        ellipse(d, cx + 11 + atk, gy - 12, 5, 5, glow)


def draw_revenant(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    coat, bone, glow = e.colors
    phase = math.sin(f / COLS * math.tau)
    atk = [0, 0, 1, 4, 6, 2, 0, 0][f] if row == "attack" else 0
    cx, gy = 16 + atk, 27 - int(abs(phase))
    leg = 2 if phase > 0 else -2
    rect(d, cx - 6, gy - 15, 12, 15, coat)
    rect(d, cx - 4, gy - 21, 8, 7, bone)
    rect(d, cx - 2, gy - 19, 1, 1, glow)
    rect(d, cx + 2, gy - 19, 1, 1, glow)
    poly(d, [(cx - 7, gy - 14), (cx - 12 - atk, gy - 10), (cx - 7, gy - 8)], bone)
    poly(d, [(cx + 7, gy - 14), (cx + 13 + atk, gy - 10), (cx + 7, gy - 8)], bone)
    rect(d, cx - 5 + leg, gy - 1, 3, 6, bone)
    rect(d, cx + 2 - leg, gy - 1, 3, 6, bone)
    if row == "attack":
        rect(d, cx + 12 + atk, gy - 12, 4, 3, glow)


def draw_sentinel(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    armor, bone, brass = e.colors
    phase = math.sin(f / COLS * math.tau)
    atk = [0, 0, 1, 3, 5, 2, 0, 0][f] if row == "attack" else 0
    cx, gy = 16, 28 - int(abs(phase))
    leg = 1 if phase > 0 else -1
    rect(d, cx - 7, gy - 15, 14, 14, armor)
    rect(d, cx - 5, gy - 21, 10, 7, bone)
    rect(d, cx - 8, gy - 13, 3, 10, brass)
    rect(d, cx + 6, gy - 13, 3, 10, brass)
    rect(d, cx - 2, gy - 18, 1, 1, (35, 35, 35))
    rect(d, cx + 2, gy - 18, 1, 1, (35, 35, 35))
    rect(d, cx - 5 + leg, gy - 2, 3, 7, bone)
    rect(d, cx + 2 - leg, gy - 2, 3, 7, bone)
    rect(d, cx + 10, gy - 21 - atk, 2, 25, brass)
    rect(d, cx + 8, gy - 20 - atk, 6, 2, bone)
    if row == "attack":
        rect(d, cx + 11 + atk, gy - 17, 5 + atk, 3, brass)


def draw_banshee(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    shroud, shadow, glow = e.colors
    phase = math.sin(f / COLS * math.tau)
    atk = [0, 0, 1, 3, 6, 3, 1, 0][f] if row == "attack" else 0
    cx, gy = 16 + atk, 25 + int(phase * 2)
    poly(d, [(cx - 7, gy + 3), (cx - 5, gy - 17), (cx + 5, gy - 17), (cx + 7, gy + 3), (cx + 3, gy), (cx, gy + 5), (cx - 3, gy)], shroud)
    rect(d, cx - 4, gy - 22, 8, 7, shroud)
    rect(d, cx - 2, gy - 20, 1, 1, glow)
    rect(d, cx + 2, gy - 20, 1, 1, glow)
    rect(d, cx - 11 - atk, gy - 13, 6 + atk, 3, shadow)
    rect(d, cx + 6, gy - 13, 6 + atk, 3, shadow)
    if row == "attack":
        ellipse(d, cx + 10 + atk, gy - 19, 7, 7, glow)
        rect(d, cx + 12 + atk, gy - 17, 3, 3, (246, 251, 231))


def draw_hen(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    feather, belly, comb = e.colors
    phase = math.sin(f / COLS * math.tau)
    cx, gy = 16, 29 - int(abs(phase))
    step = 1 if phase > 0 else -1
    ellipse(d, cx - 8, gy - 14, 15, 12, feather)
    ellipse(d, cx + 3, gy - 17, 7, 7, belly)
    poly(d, [(cx + 8, gy - 14), (cx + 14, gy - 12), (cx + 8, gy - 10)], (218, 177, 72))
    rect(d, cx + 5, gy - 21, 2, 4, comb)
    rect(d, cx + 8, gy - 20, 2, 4, comb)
    rect(d, cx + 6, gy - 15, 1, 1, (34, 30, 24))
    rect(d, cx - 11, gy - 13, 5, 7, feather)
    rect(d, cx - 5 + step, gy - 3, 2, 5, (118, 84, 49))
    rect(d, cx + 2 - step, gy - 3, 2, 5, (118, 84, 49))
    rect(d, cx - 6 + step, gy + 2, 4, 1, (118, 84, 49))
    rect(d, cx + 1 - step, gy + 2, 4, 1, (118, 84, 49))


def draw_hopper(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    hide, dark, belly = e.colors
    phase = math.sin(f / COLS * math.tau)
    hop = [0, 2, 5, 2][f]
    stretch = 1 if f in (1, 2) else 0
    cx, gy = 16 + (1 if f == 2 else 0), 30 - hop
    ellipse(d, cx - 9, gy - 13 - stretch, 17, 13 + stretch, hide)
    ellipse(d, cx + 2, gy - 18 - stretch, 8, 8, hide)
    poly(d, [(cx + 4, gy - 18), (cx + 1, gy - 25), (cx + 7, gy - 19)], hide)
    poly(d, [(cx + 8, gy - 18), (cx + 11, gy - 25), (cx + 10, gy - 18)], hide)
    rect(d, cx + 6, gy - 16, 1, 1, (28, 32, 24))
    ellipse(d, cx - 4, gy - 11, 8, 7, belly)
    rect(d, cx - 8, gy - 3, 6, 3, dark)
    rect(d, cx + 1 + int(phase > 0), gy - 3, 8, 3, dark)
    rect(d, cx - 10 - int(phase > 0), gy, 7, 2, dark)
    rect(d, cx + 5, gy, 7, 2, dark)


def draw_vole(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    fur, dark, ear = e.colors
    phase = math.sin(f / COLS * math.tau)
    cx, gy = 16, 30 - int(abs(phase))
    step = 1 if phase > 0 else -1
    ellipse(d, cx - 10, gy - 12, 18, 10, fur)
    ellipse(d, cx + 4, gy - 15, 7, 7, fur)
    ellipse(d, cx + 5, gy - 19, 3, 4, ear)
    rect(d, cx + 9, gy - 12, 3, 2, dark)
    rect(d, cx + 7, gy - 14, 1, 1, (28, 24, 20))
    rect(d, cx - 13, gy - 10, 5, 2, dark)
    rect(d, cx - 6 + step, gy - 3, 3, 4, dark)
    rect(d, cx + 2 - step, gy - 3, 3, 4, dark)
    rect(d, cx - 7 + step, gy, 4, 1, dark)
    rect(d, cx + 1 - step, gy, 4, 1, dark)


def draw_shambler(d: ImageDraw.ImageDraw, e: Enemy, f: int, row: str) -> None:
    rot, cloth, bone = e.colors
    phase = math.sin(f / COLS * math.tau)
    drag = [0, 1, 2, 1][f]
    lean = 2 + drag
    cx, gy = 16, 29 - int(abs(phase))
    leg = 1 if phase > 0 else -1
    poly(d, [(cx - 8 + lean, gy), (cx - 7 + lean, gy - 17), (cx + 5 + lean, gy - 16), (cx + 8 + lean, gy)], rot)
    rect(d, cx - 5 + lean, gy - 22, 8, 7, rot)
    rect(d, cx - 6 + lean, gy - 16, 11, 7, cloth)
    rect(d, cx - 3 + lean, gy - 20, 1, 1, (216, 217, 178))
    rect(d, cx + 2 + lean, gy - 20, 1, 1, (216, 217, 178))
    poly(d, [(cx - 6 + lean, gy - 13), (cx - 13 - drag, gy - 9), (cx - 8 + lean, gy - 7)], bone)
    poly(d, [(cx + 6 + lean, gy - 12), (cx + 14 + drag, gy - 6), (cx + 7 + lean, gy - 5)], rot)
    rect(d, cx - 5 + leg + lean, gy - 1, 3, 6, cloth)
    rect(d, cx + 2 - leg + lean, gy - 1, 3, 6, bone)
    rect(d, cx - 6 + leg + lean, gy + 4, 4, 2, bone)
    rect(d, cx + 2 - leg + lean, gy + 4, 4, 2, bone)


DRAWERS = {
    "goblin": draw_goblin,
    "shaman": draw_goblin,
    "orc": draw_orc,
    "ghoul": draw_ghoul,
    "wolf": draw_wolf,
    "boar": draw_boar,
    "hedgehog": draw_hedgehog,
    "spider": draw_spider,
    "slime": draw_slime,
    "mushroom": draw_mushroom,
    "deer": draw_deer,
    "treant": draw_treant,
    "druid": draw_druid,
    "pixie": draw_pixie,
    "wraith": draw_wraith,
    "revenant": draw_revenant,
    "sentinel": draw_sentinel,
    "banshee": draw_banshee,
    "hen": draw_hen,
    "hopper": draw_hopper,
    "vole": draw_vole,
    "shambler": draw_shambler,
    "burrower": draw_spider,
    "crab": draw_spider,
    "golem": draw_sentinel,
    "hag": draw_druid,
    "headhunter": draw_goblin,
    "hound": draw_wolf,
    "leech": draw_slime,
    "lurker": draw_goblin,
    "mummy": draw_revenant,
    "panther": draw_wolf,
    "prowler": draw_wolf,
    "scorpion": draw_spider,
    "siren": draw_banshee,
    "skitterer": draw_spider,
    "stalker": draw_wolf,
    "toad": draw_hopper,
}


def make_sheet(enemy: Enemy, out_dir: Path) -> Path:
    sheet = Image.new("RGBA", (CELL * COLS, CELL * ROWS), BG)
    for row_idx, row_name in enumerate(ROW_NAMES):
        row, direction = row_name.split("_", 1)
        for f in range(COLS):
            small, d = frame_canvas()
            DRAWERS[enemy.kind](d, enemy, f, row)
            add_frame_motion_tick(d, f, row)
            small = orient_frame(small, direction)
            sheet.alpha_composite(small, (f * CELL, row_idx * CELL))
    path = out_dir / f"{enemy.slug}_generated_chroma.png"
    sheet.save(path)
    return path


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
                    if px[x, y] != BG:
                        mask.putpixel((x, y), 1)
            bbox = mask.getbbox()
            if not bbox:
                errors.append(f"empty cell r{row} c{col}")
                continue
            width = bbox[2] - bbox[0]
            if width > 96:
                errors.append(f"too wide, possible duplicate subject r{row} c{col}: {width}px")
    if errors:
        raise RuntimeError("; ".join(errors))


def gif_frame_count(path: Path) -> int:
    with Image.open(path) as im:
        return sum(1 for _ in ImageSequence.Iterator(im))


def write_review_gif(frame_dir: Path, dst: Path) -> None:
    bg = Image.new("RGBA", (1, 1), (28, 32, 38, 255))
    frames = []
    for path in sorted(frame_dir.glob("*.png")):
        frame = Image.open(path).convert("RGBA")
        canvas = Image.new("RGBA", frame.size, bg.getpixel((0, 0)))
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


def process_enemy(enemy: Enemy) -> dict:
    enemy_dir = OUT / enemy.slug
    enemy_dir.mkdir(parents=True, exist_ok=True)
    sheet = make_sheet(enemy, enemy_dir)
    validate_one_subject_cells(sheet)
    grid_dir = enemy_dir / "grid"
    if grid_dir.exists():
        shutil.rmtree(grid_dir)
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
        ]
    completed = subprocess.run(command, text=True, capture_output=True)
    if completed.returncode:
        print(completed.stdout)
        print(completed.stderr)
        completed.check_returncode()
    manifest = json.loads((grid_dir / "grid_manifest.json").read_text())
    cleaned_alpha_sheet = grid_dir / f"{enemy.slug}_generated_chroma_alpha.png"
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
    w = COLS * 48
    h = len(thumbs) * (ROWS * 48 + 18)
    contact = Image.new("RGB", (w, h), (28, 32, 38))
    d = ImageDraw.Draw(contact)
    y = 0
    for label, thumb in thumbs:
        contact.paste(thumb.convert("RGB"), (0, y + 18))
        d.text((4, y + 3), label, fill=(230, 234, 220))
        y += ROWS * 48 + 18
    out = OUT / "woodland_bespoke_v2_contact.png"
    contact.save(out)
    return out


def make_runtime_atlas(results: list[dict]) -> Path:
    atlas = Image.new("RGBA", (COLS * CELL, ROWS * CELL * len(results)), (0, 0, 0, 0))
    for index, item in enumerate(results):
        alpha = Image.open(item["cleaned_alpha_sheet"]).convert("RGBA")
        atlas.alpha_composite(alpha, (0, index * ROWS * CELL))
    out = ROOT / "public" / "woodland-bespoke-v2-sheet.png"
    atlas.save(out)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    results = [process_enemy(enemy) for enemy in ENEMIES]
    contact = make_contact(results)
    runtime_atlas = make_runtime_atlas(results)
    manifest = {
        "pipeline": PIPELINE_SPEC,
        "output_root": str(OUT),
        "contact": str(contact),
        "runtime_atlas": str(runtime_atlas),
        "runtime_atlas_order": [item["slug"] for item in results],
        "enemies": results,
    }
    (OUT / "woodland_bespoke_v2_manifest.json").write_text(json.dumps(manifest, indent=2))
    gif_files = [Path(item["gifs"][row]) for item in results for row in ROW_NAMES]
    print(
        json.dumps(
            {
                "contact": str(contact),
                "manifest": str(OUT / "woodland_bespoke_v2_manifest.json"),
                "runtime_atlas": str(runtime_atlas),
                "gif_count": len(gif_files),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
