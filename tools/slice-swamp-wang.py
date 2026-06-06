# Synthesize the swamp Wang/base tiles for the floor-5 generated stage from
# Alex-vetted picks on public/swamp-tiles.png. Outputs (assetsources/curated/sliced/):
#   swamp-lichen-base.png  32x32  seamless violet lichen carpet (ground fill)
#   swamp-water-wang.png  128x128 4x4 corner-Wang (water feathered over lichen)
#   swamp-path-wang.png   128x128 4x4 corner-Wang (tan dirt feathered over lichen)
#   swamp-rock.png         32x32  darkened purple stone (o/*/n/O rock cells)
#   swamp-plank.png        32x32  weathered plank bridge (B cells)
# Corner-Wang index = NW1 NE2 SE4 SW8 (matches Northwood water-wang + the baker dual-grid).
# NOTE: these are SYNTHESIZED placeholders. Drop in bespoke aligned art at the same
# paths/sizes and re-run `npm run assets:swamp` for a zero-code-change quality upgrade.
import numpy as np
from PIL import Image, ImageEnhance

S = Image.open("public/swamp-tiles.png").convert("RGBA")

def bgkey(im):  # remove only near-pure background magenta fringe, keep violet veins
    p = im.load()
    for j in range(im.size[1]):
        for i in range(im.size[0]):
            r, g, b, a = p[i, j]
            if g < 12 and r > 90 and 40 < b < r + 30:
                p[i, j] = (0, 0, 0, 0)
    return im

def grab(x, y, w, h, sat, inset=8):  # inset dodges the sheet cell's own dark border
    c = bgkey(S.crop((x + inset, y + inset, x + w - inset, y + h - inset)).convert("RGBA")).resize((32, 32), Image.BILINEAR)
    rgb = ImageEnhance.Color(c.convert("RGB")).enhance(sat).convert("RGBA")
    rgb.putalpha(c.split()[3])
    return rgb

def fillkeyed(im):  # replace keyed (transparent) pixels with tile mean -> no black specks
    p = im.convert("RGB").getdata(); n = len(p)
    m = [sum(c[i] for c in p) // n for i in range(3)]
    q = im.copy(); ql = q.load()
    for j in range(32):
        for i in range(32):
            if im.getpixel((i, j))[3] < 128:
                ql[i, j] = (m[0], m[1], m[2], 255)
    return q

def make_tileable(im, band=8):  # cross-fade opposite edges so the tile repeats seamlessly
    a = np.asarray(im.convert("RGB")).astype(float); h, w, _ = a.shape; out = a.copy()
    for d in range(band):
        wgt = 0.5 * (1 - (d / band))
        out[:, w - 1 - d, :] = a[:, w - 1 - d, :] * (1 - wgt) + a[:, d, :] * wgt
        out[:, d, :] = a[:, d, :] * (1 - wgt) + a[:, w - 1 - d, :] * wgt
    a2 = out.copy()
    for d in range(band):
        wgt = 0.5 * (1 - (d / band))
        out[h - 1 - d, :, :] = a2[h - 1 - d, :, :] * (1 - wgt) + a2[d, :, :] * wgt
        out[d, :, :] = a2[d, :, :] * (1 - wgt) + a2[h - 1 - d, :, :] * wgt
    return Image.fromarray(out.clip(0, 255).astype('uint8')).convert("RGBA")

# base tiles (Alex-vetted coords from main.ts floor-5 picks)
LICHEN = make_tileable(fillkeyed(grab(18, 256, 68, 68, 1.35)))   # purple2 violet cobble-moss
WATER  = make_tileable(fillkeyed(grab(1041, 102, 74, 71, 1.2)))  # swamp water
# 'k' land trails -> muddy marsh soil (sheet ground tile @252,178), desaturated so it
# reads as worn marsh ground that blends in, NOT a tan boardwalk (was 252,261 maroon).
DIRT   = make_tileable(fillkeyed(grab(252, 178, 69, 73, 0.95)))  # muddy swamp soil

def hashf(x, y):
    h = (x * 374761393 + y * 668265263) & 0xffffffff
    h = (h ^ (h >> 13)) * 1274126177 & 0xffffffff
    return (h % 100000) / 100000.0

def make_wang(land, over, feather, jit):
    a = Image.new("RGBA", (128, 128)); lp, op = land.load(), over.load()
    for idx in range(16):
        nw = idx & 1; ne = (idx >> 1) & 1; se = (idx >> 2) & 1; sw = (idx >> 3) & 1
        tx, ty = (idx % 4) * 32, (idx // 4) * 32
        for y in range(32):
            for x in range(32):
                u = x / 31.0; v = y / 31.0
                val = nw * (1 - u) * (1 - v) + ne * u * (1 - v) + sw * (1 - u) * v + se * u * v + (hashf(x, y) - 0.5) * jit
                lr, lg, lb, _ = lp[x, y]; orr, og, ob, _ = op[x, y]
                if val >= 0.5 + feather:
                    px = (orr, og, ob, 255)
                elif val <= 0.5 - feather:
                    px = (lr, lg, lb, 255)
                else:
                    t = (val - (0.5 - feather)) / (2 * feather)
                    px = (int(lr * (1 - t) + orr * t), int(lg * (1 - t) + og * t), int(lb * (1 - t) + ob * t), 255)
                a.putpixel((tx + x, ty + y), px)
    return a

LICHEN.save("assetsources/curated/sliced/swamp-lichen-base.png")
# jit slashed 0.12 -> 0.03: kills the gritty per-pixel speckle on the banks so the
# big water reads as smooth open pools with clean corner-blended shores (2A).
make_wang(LICHEN, WATER, 0.16, 0.03).save("assetsources/curated/sliced/swamp-water-wang.png")
# soil feathers softly into lichen (wider feather, low jit) -> blended muddy ground.
make_wang(LICHEN, DIRT, 0.14, 0.04).save("assetsources/curated/sliced/swamp-path-wang.png")

# rock = darkened purple stone-moss
rock = make_tileable(fillkeyed(grab(97, 177, 68, 68, 1.1)))
ra = np.asarray(rock.convert("RGB")).astype(float) * 0.78
Image.fromarray(ra.clip(0, 255).astype('uint8')).save("assetsources/curated/sliced/swamp-rock.png")

# plank = REAL weathered wood-plank bridge from the sheet (ground tile @173,261),
# replacing the old synthesized orange planks. 'B' cells are genuine bridges spanning
# water channels (e.g. 4BBB4), so this is the "proper bridge from the swamp tileset".
make_tileable(fillkeyed(grab(173, 261, 71, 72, 1.05))).save("assetsources/curated/sliced/swamp-plank.png")
print("wrote swamp lichen-base / water-wang / path-wang / rock / plank")
