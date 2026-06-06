#!/usr/bin/env python3
"""Reusable desert relief pass: red-rock plateau cliffs + quicksand blend.

Flat stages (built one-tile-per-char, no autotiling) render plateaus as blocky
massif fills with a crenellated edge, and quicksand/water as blocky squares. This
pass gives the desert plateaus Northwood-grade relief and blends the quicksand,
WITHOUT touching the canonical base layer (so collision / ascii / reachability are
byte-identical, exactly like apply-water-shoreline):

  * Plateau top surface  -> the stage's own massif cobble, recoloured with a lit
    rim via the proven plateau-top-v2 edge-autotile.
  * Plateau south wall    -> assembled from the stage's OWN cliff tile (role
    'cliff'): its lit lip on top, its columnar red-boulder face continued into
    courses below, placed as a continuous gapless band on a flattened baseline.
  * Quicksand            -> the water corner-Wang dual-grid reused to carve an
    organic muddy pool that bleeds into the sand (no dark grid, no showthrough).

Everything goes into a new transparent 'fringe-relief' overlay layer + appended
fringe tiles; the engine composites base + fringe-water + fringe-relief.

Run AFTER apply-water-shoreline and BEFORE the stage importer:
  python3 tools/apply-desert-relief.py --stage desert
"""
import argparse, json, os
import numpy as np
from PIL import Image

TS = 32
MY_ROLES = {"plateau-relief", "quicksand-blend"}
PLATEAU_ROLES = ("massif", "cliff")
FD = 3  # cliff face depth in tiles (lip + mid + shadowed base)


def ramp(stops, t):
    xs = np.array([s[0] for s in stops]); cs = np.array([s[1] for s in stops], dtype=float)
    o = np.zeros(t.shape + (3,))
    for k in range(3):
        o[..., k] = np.interp(t, xs, cs[:, k])
    return o


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="desert")
    ap.add_argument("--repo", default=os.getcwd())
    args = ap.parse_args()
    name = args.stage
    d = os.path.join(args.repo, f"assetsources/asset-forge/exports/{name}")
    stage = json.load(open(f"{d}/{name}.stage.json"))
    tsj = json.load(open(f"{d}/{name}.tileset.json"))
    atlas = np.array(Image.open(f"{d}/{name}.png").convert("RGBA"))
    PACK = tsj.get("columns", 24)
    ac = atlas.shape[1] // TS

    role = {t["index"]: t["role"] for t in tsj["tiles"]}
    base = stage["layers"][0]["data"]
    R, C = stage["rows"], stage["cols"]

    def atile(i):
        sx = (i % ac) * TS; sy = (i // ac) * TS
        return atlas[sy:sy + TS, sx:sx + TS].astype(np.float64)

    PLAT = lambda r, c: (0 <= r < R and 0 <= c < C and base[r][c]
                         and role.get(int(base[r][c].split(":")[1])) in PLATEAU_ROLES)
    QS = lambda r, c: (0 <= r < R and 0 <= c < C and base[r][c]
                       and role.get(int(base[r][c].split(":")[1])) == "quicksand")

    cliff_idx = next(t["index"] for t in tsj["tiles"] if t["role"] == "cliff")
    massif_idx = next(t["index"] for t in tsj["tiles"] if t["role"] == "massif")
    sand_idx = next(t["index"] for t in tsj["tiles"] if t["role"] == "sand")
    qs_idx = next(t["index"] for t in tsj["tiles"] if t["role"] == "quicksand")

    # ---- wall tiles, derived from the stage's OWN cliff tile -------------------
    cliff = atile(cliff_idx)
    col_band = cliff[16:32]  # pure columnar face, below the lit lip

    def tile_vert(band, darken_bottom=0.0):
        out = np.zeros((TS, TS, 4)); out[:, :, 3] = 255
        bh = band.shape[0]
        for y in range(TS):
            out[y] = band[y % bh]
        if darken_bottom > 0:
            for y in range(TS):
                if y > TS - 9:
                    out[y, :, :3] *= (1 - darken_bottom * ((y - (TS - 9)) / 9))
        return out

    WALL = {"top": cliff.copy(), "mid": tile_vert(col_band), "base": tile_vert(col_band, 0.55)}

    # ---- top-surface tiles: recoloured plateau-top-v2 + cobble imprint ---------
    ptop = np.array(Image.open(os.path.join(args.repo, "assetsources/curated/sliced/plateau-top-v2.png")).convert("RGBA"), dtype=float)
    PTC = ptop.shape[1] // TS
    a = ptop[:, :, 3]; lum = ptop[:, :, :3].mean(2); op = a > 8
    lo, hi = lum[op].min(), lum[op].max(); hi = max(hi, lo + 1)
    ptop_r = ptop.copy()
    ptop_r[:, :, :3] = ramp([(0, [60, 16, 18]), (0.5, [140, 58, 38]), (0.8, [190, 112, 60]), (1, [214, 140, 82])],
                            np.clip((lum - lo) / (hi - lo), 0, 1))
    mlum = atile(massif_idx)[:, :, :3].mean(2)
    detail = np.clip(mlum / (mlum.mean() + 1e-6), 0.8, 1.25)

    def ptop_tile(idx):
        sx = (idx % PTC) * TS; t = ptop_r[0:TS, sx:sx + TS].copy()
        t[:, :, :3] = np.clip(t[:, :, :3] * detail[:, :, None], 0, 255)
        return t
    maskToIdx = [15, 13, 14, 7, 12, 10, 8, 4, 11, 6, 9, 3, 5, 2, 1, 0]

    # ---- overlay canvas (transparent; only relief pixels written) --------------
    W, H = C * TS, R * TS
    ov = np.zeros((H, W, 4), dtype=np.float64)

    def put(arr, c, r):
        ov[r * TS:r * TS + TS, c * TS:c * TS + TS] = arr

    def over(arr, c, r):  # alpha-composite arr onto ov cell (for partial overlays)
        x0, y0 = c * TS, r * TS
        sa = arr[:, :, 3:4] / 255.0
        da = ov[y0:y0 + TS, x0:x0 + TS, 3:4] / 255.0
        oa = sa + da * (1 - sa)
        rgb = np.where(oa > 0, (arr[:, :, :3] * sa + ov[y0:y0 + TS, x0:x0 + TS, :3] * da * (1 - sa)) / np.maximum(oa, 1e-6), 0)
        ov[y0:y0 + TS, x0:x0 + TS, :3] = rgb
        ov[y0:y0 + TS, x0:x0 + TS, 3:4] = oa * 255

    # ---- plateau: a cliff face on EVERY south edge (every run bottom), not just
    #      the lowest one per column. Foot baseline flattened locally so the
    #      1-cell-dithered edge reads as one clean line. -------------------------
    south = lambda r, c: PLAT(r, c) and not PLAT(r + 1, c)  # plateau cell w/ drop below
    edges_by_col = {c: [r for r in range(R) if south(r, c)] for c in range(C)}

    def flat_foot(r, c):  # snap to the lowest neighbouring south edge within 1 row
        t = r
        for dc in (-1, 1):
            for e in edges_by_col.get(c + dc, []):
                if abs(e - r) <= 1:
                    t = max(t, e)
        return t

    wall_kind = {}  # (r,c) -> 'top'|'mid'|'base'
    feet = []       # (c, foot_row) for AO
    for c in range(C):
        for rb in edges_by_col[c]:
            ft = flat_foot(rb, c)            # rb or rb+1 (notch fill onto sand)
            feet.append((c, ft))
            for r in range(ft - FD + 1, ft + 1):
                if PLAT(r, c) or rb < r <= ft:  # plateau face cell, or sand notch foot
                    dd = ft - r
                    wall_kind[(r, c)] = "base" if dd == 0 else ("top" if dd == FD - 1 else "mid")

    # top surface on plateau cells that aren't part of a wall band
    for r in range(R):
        for c in range(C):
            if not PLAT(r, c) or (r, c) in wall_kind:
                continue
            m = (1 if PLAT(r - 1, c) else 0) | (2 if PLAT(r, c + 1) else 0) | (4 if PLAT(r + 1, c) else 0) | (8 if PLAT(r, c - 1) else 0)
            put(ptop_tile(maskToIdx[m]), c, r)
    # cliff face courses
    for (r, c), rk in wall_kind.items():
        put(WALL[rk].copy(), c, r)
    # contact AO on sand directly below each wall foot
    for c, ft in feet:
        baseY = (ft + 1) * TS
        for dy in range(7):
            for x in range(TS):
                px = c * TS + x; py = baseY + dy
                if 0 <= px < W and 0 <= py < H and ((px * 7 + py * 13) % 17) / 17.0 <= (1 - dy / 7) * 0.85 + 0.05:
                    al = (1 - dy / 7) * 0.45 * 255
                    if al > ov[py, px, 3]:
                        ov[py, px] = [0, 0, 0, al]

    # ---- quicksand: clean muddy fill + corner-Wang carved organic edge --------
    yy, xx = np.mgrid[0:TS, 0:TS]
    swirl = (np.sin(xx * 2 * np.pi / 16 + yy * 2 * np.pi / 32) + np.sin((xx + yy) * 2 * np.pi / 16) + np.sin(yy * 2 * np.pi / 16))
    grain = ((xx * 73 + yy * 31) % 13 - 6)
    fb = np.array([150, 112, 52])
    QF = np.zeros((TS, TS, 3))
    for k in range(3):
        QF[..., k] = fb[k] + swirl * np.array([6, 5, 3])[k] + grain * 0.6
    QF = np.clip(QF, 0, 255)
    dampsand = np.array([171, 124, 60])
    sand = atile(sand_idx)
    ww = np.array(Image.open(os.path.join(args.repo, "assetsources/curated/sliced/water-wang.png")).convert("RGBA"), dtype=float)
    wc = ww.shape[1] // TS

    def classify(r, g, b):
        if b > r + 18 and b > 90:
            return "water"
        if g > r + 6 and g > b:
            return "land"
        return "shore"
    sl = []
    for idx in range(16):
        sx = (idx % wc) * TS; sy = (idx // wc) * TS
        for y in range(TS):
            for x in range(TS):
                if classify(*ww[sy + y, sx + x, :3]) == "shore":
                    sl.append(ww[sy + y, sx + x, :3].mean())
    avg = np.mean(sl) if sl else 1
    wang = np.zeros((TS, 16 * TS, 4))
    for idx in range(16):
        sx = (idx % wc) * TS; sy = (idx // wc) * TS
        for y in range(TS):
            for x in range(TS):
                r, g, b = ww[sy + y, sx + x, :3]; cls = classify(r, g, b); dx = idx * TS + x
                if cls == "water":
                    wang[y, dx, 3] = 0
                elif cls == "shore":
                    f = np.clip(((r + g + b) / 3) / avg, 0.82, 1.12)
                    wang[y, dx, :3] = np.clip(dampsand * f, 0, 255); wang[y, dx, 3] = 255
                else:
                    wang[y, dx, :3] = sand[y, x, :3]; wang[y, dx, 3] = 255
    # prefill QF on quicksand cells (opaque -> hides dark base tile)
    for r in range(R):
        for c in range(C):
            if QS(r, c):
                t = np.zeros((TS, TS, 4)); t[:, :, :3] = QF; t[:, :, 3] = 255
                put(t, c, r)
    # carve organic edge via dual grid (skip the all-water interior shape #15)

    def blit_wang(idx, dx, dy):
        sx = idx * TS
        for y in range(TS):
            for x in range(TS):
                al = wang[y, sx + x, 3] / 255.0
                if al <= 0:
                    continue
                px = dx + x; py = dy + y
                if 0 <= px < W and 0 <= py < H:
                    ov[py, px, :3] = wang[y, sx + x, :3] * al + ov[py, px, :3] * (1 - al)
                    ov[py, px, 3] = max(ov[py, px, 3], 255 * al)
    for i in range(R + 1):
        for j in range(C + 1):
            m = (1 if QS(i - 1, j - 1) else 0) | (2 if QS(i - 1, j) else 0) | (4 if QS(i, j) else 0) | (8 if QS(i, j - 1) else 0)
            if m and m != 15:
                blit_wang(m, round((j - 0.5) * TS), round((i - 0.5) * TS))

    # ===========================================================================
    # strip any prior relief (idempotent), then slice overlay -> appended tiles
    # ===========================================================================
    keep = [t for t in tsj["tiles"] if t["role"] not in MY_ROLES]
    assert [t["index"] for t in keep] == list(range(len(keep))), "non-relief tiles must be contiguous from 0"
    N0 = len(keep)
    # rebuild atlas with the first N0 tiles, then append relief fringe tiles
    fringe_layer = [[None] * C for _ in range(R)]
    by_key = {}
    fringe_bufs = []
    for r in range(R):
        for c in range(C):
            cell = ov[r * TS:r * TS + TS, c * TS:c * TS + TS]
            if cell[:, :, 3].max() <= 0:
                continue
            buf = np.clip(cell, 0, 255).astype(np.uint8)
            key = buf.tobytes()
            idx = by_key.get(key)
            if idx is None:
                idx = N0 + len(fringe_bufs); by_key[key] = idx; fringe_bufs.append(buf)
            fringe_layer[r][c] = f"{name}:{idx}"

    N = N0 + len(fringe_bufs)
    packRows = (N + PACK - 1) // PACK
    out = np.zeros((packRows * TS, PACK * TS, 4), dtype=np.uint8)

    def copy_tile(src, srcW, sIdx, dIdx):
        sCols = srcW // TS; sx = (sIdx % sCols) * TS; sy = (sIdx // sCols) * TS
        dx = (dIdx % PACK) * TS; dy = (dIdx // PACK) * TS
        out[dy:dy + TS, dx:dx + TS] = src[sy:sy + TS, sx:sx + TS]
    for i in range(N0):
        copy_tile(atlas, atlas.shape[1], i, i)
    for i, buf in enumerate(fringe_bufs):
        dIdx = N0 + i; dx = (dIdx % PACK) * TS; dy = (dIdx // PACK) * TS
        out[dy:dy + TS, dx:dx + TS] = buf

    Image.fromarray(out).save(f"{d}/{name}.png")
    tsj["tiles"] = keep + [{"index": N0 + i, "role": "plateau-relief", "blocked": False} for i in range(len(fringe_bufs))]
    tsj["columns"] = PACK; tsj["rows"] = packRows
    json.dump(tsj, open(f"{d}/{name}.tileset.json", "w"), indent=2)

    # base + fringe-water kept; drop any prior fringe-relief, then append it
    stage["layers"] = [l for l in stage["layers"] if l["name"] != "fringe-relief"]
    stage["layers"].append({"name": "fringe-relief", "type": "tile", "data": fringe_layer})
    json.dump(stage, open(f"{d}/{name}.stage.json", "w"))
    print(f"relief: {name} — +{len(fringe_bufs)} fringe tiles (base {N0} untouched); "
          f"fringe-relief layer added; base layer + collision unchanged.")


if __name__ == "__main__":
    main()
