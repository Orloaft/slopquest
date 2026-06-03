#!/usr/bin/env python3
"""Placeholder landmark sprites for the M2 set-piece wiring test. Each is a labelled
colour box at the sprite's native dimensions, transparent RGBA bg (bottom-center anchored
like the real sprites). These live at the canonical paths the baker's B(...) calls read, so
the real sliced kit sprites later overwrite them in place with NO baker edit.
"""
from PIL import Image, ImageDraw

OUT = "assetsources/curated/bespoke/searing-canyon-landmarks-v1"
import os
os.makedirs(OUT, exist_ok=True)

# name -> (w, h, fill RGBA)
SPRITES = {
    # outpost
    "tent_chief":       (200, 280, (150, 40, 35, 235)),
    "tent_raider":      (120, 176, (185, 60, 45, 235)),
    "watchtower":       (112, 224, (120, 85, 50, 235)),
    "palisade_seg":     (64, 80, (140, 100, 60, 235)),
    "skull_totem":      (40, 112, (225, 215, 195, 235)),
    # cultist
    "tent_cult":        (120, 176, (130, 35, 40, 235)),
    "campfire":         (56, 56, (245, 150, 40, 235)),
    "skull_totem_tall": (40, 128, (225, 215, 195, 235)),
    # ritual
    "rune_core":        (112, 112, (250, 130, 30, 235)),
    "arch_stone":       (88, 144, (120, 110, 120, 235)),
    "floor_stone":      (32, 32, (70, 55, 65, 255)),
    "floor_edge":       (32, 32, (110, 70, 80, 255)),
    # mining
    "cave_mouth":       (128, 128, (35, 25, 30, 245)),
    "scaffold_crane":   (176, 208, (135, 95, 55, 235)),
    "minecart":         (56, 48, (90, 90, 100, 235)),
    "barrel_stack":     (56, 64, (110, 75, 45, 235)),
    "track_seg":        (32, 32, (80, 70, 65, 255)),
}

for name, (w, h, fill) in SPRITES.items():
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 1, w - 2, h - 2], fill=fill, outline=(20, 20, 20, 255))
    d.text((4, 4), name, fill=(255, 255, 255, 255))
    im.save(f"{OUT}/{name}.png")

print(f"wrote {len(SPRITES)} placeholder sprites -> {OUT}/")
