#!/usr/bin/env python3
"""Stagger the two genuinely-straight tier boundaries in Waystone's elevation field.

Spec-honoured anti-blockiness: organic shape comes from authored data, not a procedural
noise pass (world_crafting_spec.md §0). Deterministic, no RNG. We only touch cells well
clear of structures/pens (windmill c94, watchtower c104, cow pen c80-93 r21-30).

Two coherent edits (BANDED, not per-cell -> reads as terraced steps, not noise):
  1. Vertical west edge of the east shelf (col 74, file-rows 11..30): gentle wave in cols 72-77.
  2. Horizontal south step (file-row 32->33, cols 74..109): break the one long straight wall
     into ~6-col bands, each a clean horizontal segment whose cut row steps +/-1 vs neighbours.
"""
import shutil, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "assetsources/waystone/elevation.txt")
shutil.copyfile(P, P.replace("elevation.txt", "elevation.prejag.bak"))

rows = [list(l.rstrip("\n")) for l in open(P)]

# --- 1. Vertical west edge: file-rows 11..30 (stop at 30 so it can't fight the south-step band).
WAVE = [0, 1, 2, 2, 1, 0, 0, 1, 2, 1, 0, -1, 0, 1, 2, 2, 1, 0, 1, 0]  # len 20 == rows 11..30
for i, fr in enumerate(range(11, 31)):
    b = 74 + WAVE[i]
    for c in range(72, 78):
        rows[fr - 1][c] = '2' if c >= b else '1'

# --- 2. South step as banded staircase. Each ~6-col band keeps a single clean cut row;
#     neighbouring bands differ by 1 row so the wall foot terraces. cut in {31,32,33}.
#     Below the cut: 1 for cols 74..89, 0 for cols 90..109 (the cave pocket).
BAND_W = 6
BAND_CUT = [33, 32, 31, 32, 33, 32, 31]   # walks gently up and down across bands
def lower(c):
    return '0' if c >= 90 else '1'
for c in range(74, 110):
    cut = BAND_CUT[((c - 74) // BAND_W) % len(BAND_CUT)]
    for fr in (31, 32, 33):
        rows[fr - 1][c] = '2' if fr <= cut else lower(c)

open(P, "w").write("\n".join("".join(r) for r in rows) + "\n")

print("rows 28-35, cols 70-110 (after):")
for fr in range(28, 36):
    print(f"{fr:>3}: " + "".join(rows[fr - 1][70:110]))
print("\nbackup -> elevation.prejag.bak")
