// Re-slice road-wang.png from its SOURCE art, correctly.
// ---------------------------------------------------------------------------
// The stage bakers (northwood/route/waystone) read assetsources/curated/sliced/
// road-wang.png as a 4x4 @32px edge-Wang atlas indexed DIRECTLY by the NESW
// connectivity mask (N=1,E=2,S=4,W=8 -> atlas index = mask). The previous
// road-wang.png was sliced/scaled wrong: its tiles were off-centre, several masks
// were duplicated and the NE/ES corners were effectively absent — so corners never
// blended no matter how the lookup was remapped.
//
// The source, assetsources/curated/bespoke/northwood-tileset-v1/tileset-2-road-
// aligned.png, is a pristine 16-tile edge-Wang strip: 16 tiles of 156x156 laid out
// left-to-right in EXACT mask order (verified: idx==mask, all 16 present once, no
// duplicates). This tool cuts each 156px source tile on its real boundary and
// area-downscales it to 32x32, writing them into a 4x4 grid so that output index ==
// mask (tile m at col m%4, row floor(m/4)) — exactly what the bakers expect.
import { readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const SRC = nodePath.join(repoRoot, "assetsources/curated/bespoke/northwood-tileset-v1/tileset-2-road-aligned.png");
const OUT = nodePath.join(repoRoot, "assetsources/curated/sliced/road-wang.png");

const src = PNG.sync.read(readFileSync(SRC));
const N = 16;
const T = Math.round(src.width / N); // 156
if (T * N !== src.width) console.warn(`warning: source width ${src.width} not divisible by ${N} (tile=${T})`);
const SH = src.height; // 156
const ts = 32;
const COLS = 4;
const out = new PNG({ width: COLS * ts, height: Math.ceil(N / COLS) * ts });
out.data.fill(0);

// Area (box) downscale of one source tile -> 32x32, alpha-weighted colour so
// transparent gutters don't bleed dark halos into the road/grass edge.
function downscaleTile(tileIdx: number, destX: number, destY: number): void {
  const sx0 = tileIdx * T;
  for (let oy = 0; oy < ts; oy++) {
    for (let ox = 0; ox < ts; ox++) {
      const bx0 = Math.floor((ox * T) / ts), bx1 = Math.max(bx0 + 1, Math.floor(((ox + 1) * T) / ts));
      const by0 = Math.floor((oy * SH) / ts), by1 = Math.max(by0 + 1, Math.floor(((oy + 1) * SH) / ts));
      let r = 0, g = 0, b = 0, aw = 0, asum = 0, n = 0;
      for (let sy = by0; sy < by1; sy++) for (let sx = bx0; sx < bx1; sx++) {
        const si = ((sy) * src.width + (sx0 + sx)) * 4;
        const a = src.data[si + 3];
        r += src.data[si] * a; g += src.data[si + 1] * a; b += src.data[si + 2] * a;
        aw += a; asum += a; n++;
      }
      const di = ((destY + oy) * out.width + (destX + ox)) * 4;
      const a = Math.round(asum / n);
      if (aw > 0) { out.data[di] = Math.round(r / aw); out.data[di + 1] = Math.round(g / aw); out.data[di + 2] = Math.round(b / aw); }
      out.data[di + 3] = a;
    }
  }
}

for (let m = 0; m < N; m++) downscaleTile(m, (m % COLS) * ts, Math.floor(m / COLS) * ts);
writeFileSync(OUT, PNG.sync.write(out));
console.log(`re-sliced road-wang.png <- ${nodePath.basename(SRC)} (${N} tiles ${T}x${SH} -> ${ts}px, 4x4, index==mask) -> ${OUT}`);
