#!/usr/bin/env python3
"""Extract the runtime red-rock cliff-face atlas for the LIVE Searing Badlands (floor 6).

assetsources/curated/sliced/cliff-red.png packs (top-left 160x96) a 5col x 3row face
atlas matching the proven cliff-face.png contract:
  cols = [Lcap, straight, Rcap, innerL, innerR]   rows = [top, mid, base]
plus a 192x32 full-width band and a 64x64 element below (not used by the face renderer).

This lifts just the 160x96 face block to public/ for the runtime cliff-overlay pass,
then bakes in CONTRAST + VOLUME so the wall reads as a shadowed vertical face against
the lit canyon floor (raw `cliff-red.png` shares the floor's exact orange, so it renders
flat). The enhancement is: a contrast boost on the columnar fracture shadows, a hue/level
shift to a deeper cooler red-brown (separates wall from the bright-orange ground), and a
top->bottom volume gradient (lit rim at atlas row 0, shadowed foot at row 2) so a stacked
multi-course wall reads round instead of as one tone.
Output: public/tilesets/searing-canyon-cliff.png  (160x96, transparent gutters preserved)
"""
import os
from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assetsources/curated/sliced/cliff-red.png")
OUT = os.path.join(ROOT, "public/tilesets/searing-canyon-cliff.png")

# --- contrast/volume tuning (edit these to taste) -------------------------------
CONTRAST = 1.34            # >1 deepens the fracture shadows / sharpens columns
RGB_MUL = (0.72, 0.50, 0.45)  # per-channel multiply: deepen toward cool maroon, away
                              # from the floor's bright orange (R kept high, G/B pulled)
VOL_TOP = 1.10             # vertical brightness at the rim (atlas y=0): sun-catch lift
VOL_BOTTOM = 0.48          # ...and at the foot (atlas y=95): deep shadow


def enhance(face: Image.Image) -> Image.Image:
    face = ImageEnhance.Contrast(face).enhance(CONTRAST)
    px = face.load()
    w, h = face.size
    for y in range(h):
        # rim(top) -> foot(bottom) volume gradient, lerped over the full 96px atlas.
        vol = VOL_TOP + (VOL_BOTTOM - VOL_TOP) * (y / (h - 1))
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (
                min(255, int(r * RGB_MUL[0] * vol)),
                min(255, int(g * RGB_MUL[1] * vol)),
                min(255, int(b * RGB_MUL[2] * vol)),
                a,
            )
    return face


def main():
    face = Image.open(SRC).convert("RGBA").crop((0, 0, 160, 96))
    face = enhance(face)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    face.save(OUT)
    print(f"cliff face -> {face.size[0]}x{face.size[1]} searing-canyon-cliff.png (5col x 3row @32, contrast+volume)")


if __name__ == "__main__":
    main()
