#!/usr/bin/env python3
"""Extract the runtime red-rock cliff-face atlas for the LIVE Searing Badlands (floor 6).

assetsources/curated/sliced/cliff-red.png packs (top-left 160x96) a 5col x 3row face
atlas matching the proven cliff-face.png contract:
  cols = [Lcap, straight, Rcap, innerL, innerR]   rows = [top, mid, base]
plus a 192x32 full-width band and a 64x64 element below (not used by the face renderer).

This lifts just the 160x96 face block to public/ for the runtime cliff-overlay pass.
Output: public/tilesets/searing-canyon-cliff.png  (160x96, transparent gutters preserved)
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assetsources/curated/sliced/cliff-red.png")
OUT = os.path.join(ROOT, "public/tilesets/searing-canyon-cliff.png")


def main():
    face = Image.open(SRC).convert("RGBA").crop((0, 0, 160, 96))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    face.save(OUT)
    print(f"cliff face -> {face.size[0]}x{face.size[1]} searing-canyon-cliff.png (5col x 3row @32)")


if __name__ == "__main__":
    main()
