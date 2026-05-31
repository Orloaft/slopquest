#!/usr/bin/env python3
"""Generate 64x64 metal-bar (ingot) item icons + slag + the Smithing skill icon.

Bars are tier-coloured trapezoid ingots; slag is a dark botched lump; the skill
icon is a simple hammer. Deterministic. Output: public/icons/.
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
SIZE = 64
OUTLINE = (28, 27, 26)

BARS = {
    "item-copper-bar.png": ((184, 115, 51), (224, 160, 92)),
    "item-tin-bar.png": ((176, 176, 184), (214, 214, 222)),
    "item-iron-bar.png": ((120, 100, 92), (170, 150, 140)),
    "item-silver-bar.png": ((200, 205, 212), (244, 248, 252)),
    "item-gold-bar.png": ((212, 175, 55), (255, 230, 130)),
    "item-mithril-bar.png": ((74, 111, 165), (130, 172, 228)),
    "item-adamant-bar.png": ((63, 125, 90), (116, 190, 148)),
}


def ingot(path, base, hi):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # trapezoid ingot, bottom-heavy
    top = [(20, 30), (44, 30), (50, 44), (14, 44)]
    d.polygon(top, fill=base, outline=OUTLINE)
    # top face (lighter)
    d.polygon([(20, 30), (44, 30), (40, 24), (24, 24)], fill=hi, outline=OUTLINE)
    # a couple of highlight glints on the face
    d.line([(22, 36), (30, 36)], fill=hi, width=2)
    d.line([(34, 40), (42, 40)], fill=hi, width=2)
    img.save(path)


def slag(path):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(22, 30), (40, 28), (46, 40), (34, 46), (18, 42)], fill=(70, 64, 60), outline=OUTLINE)
    for fx, fy in [(28, 36), (36, 34), (32, 40)]:
        d.point((fx, fy), fill=(120, 60, 40))
    img.save(path)


def hammer(path):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # handle
    d.line([(22, 48), (40, 22)], fill=(120, 84, 50), width=5)
    # head
    d.rectangle([34, 14, 52, 26], fill=(150, 150, 158), outline=OUTLINE)
    img.save(path)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (b, h) in BARS.items():
        ingot(os.path.normpath(os.path.join(OUT, name)), b, h)
        print("wrote", name)
    slag(os.path.normpath(os.path.join(OUT, "item-slag.png")))
    hammer(os.path.normpath(os.path.join(OUT, "skill-smithing.png")))
    print("wrote item-slag.png, skill-smithing.png")


if __name__ == "__main__":
    main()
