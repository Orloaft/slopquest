// Build the aligned road-wang.png from the pristine authored source.
// ---------------------------------------------------------------------------
// road-wang.png is a 4x4 @32px edge-Wang atlas the bakers index DIRECTLY by the
// NESW mask (N=1,E=2,S=4,W=8 -> idx==mask; blit road[m], no LUT). Two defects in the
// authored art (preserved in road-wang.src.png) made corners never blend:
//
//  1) OFF-CENTRE ROAD. Every tile's road band sits ~5px right and ~4px below centre
//     (measured: vertical road x-centre 20.5, horizontal y-centre 19.5; centre=15.5).
//     Straights tile fine with each other, but it bites once you rotate (see #2).
//  2) ONLY NW IS A GOOD CORNER. Of the four corner slots only idx 9 (NW) has arms
//     that match the straights; NE/ES/SW held mis-shaped tiles. The robust fix is to
//     regenerate them as rotations of NW — but rotating the OFF-CENTRE NW flips its
//     offset to the opposite side, so the rotated arms land ~10px off and the top/left
//     strips no longer line up with the straights.
//
// Fix, in order:
//   (a) RECENTRE every tile by (-5,-4) with edge-clamp fill, so the road band is
//       centred (15.5) in all tiles while still reaching its connecting edges (clamp
//       replicates the far edge, preserving connectivity for straights/T/cross).
//   (b) Regenerate the corners as lossless rotations of the now-centred NW:
//       NE(3)=cw90, ES(6)=180, SW(12)=cw270. Centred + centred => everything aligns.
//
// Source of truth is road-wang.src.png (committed); this is idempotent. Re-run with
// `npm run assets:fix:road-corners`, then re-bake the road stages (route, northwood).
import { readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const SRC = nodePath.join(repoRoot, "assetsources/curated/sliced/road-wang.src.png");
const OUT = nodePath.join(repoRoot, "assetsources/curated/sliced/road-wang.png");
const ts = 32, COLS = 4;
const NW_IDX = 9, NE_IDX = 3, ES_IDX = 6, SW_IDX = 12;
const SHIFT_X = -5, SHIFT_Y = -4; // recentre the +5,+4 authored offset

const src = PNG.sync.read(readFileSync(SRC));
const out = new PNG({ width: src.width, height: src.height });
const tileXY = (idx: number) => [(idx % COLS) * ts, Math.floor(idx / COLS) * ts] as const;
const clamp = (v: number) => (v < 0 ? 0 : v > ts - 1 ? ts - 1 : v);

// (a) recentre every tile by (SHIFT_X, SHIFT_Y) with edge-clamp fill.
for (let idx = 0; idx < 16; idx++) {
  const [tx, ty] = tileXY(idx);
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const sx = clamp(x - SHIFT_X), sy = clamp(y - SHIFT_Y);
    const si = ((ty + sy) * src.width + (tx + sx)) * 4;
    const di = ((ty + y) * out.width + (tx + x)) * 4;
    out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1];
    out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = src.data[si + 3];
  }
}

// read the now-centred NW tile out of `out`
const [nwx, nwy] = tileXY(NW_IDX);
const nw: number[][] = [];
for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
  const i = ((nwy + y) * out.width + (nwx + x)) * 4;
  nw[y * ts + x] = [out.data[i], out.data[i + 1], out.data[i + 2], out.data[i + 3]];
}

// (b) rotate the centred NW into the other three corner slots.
const rot = {
  cw90: (x: number, y: number) => [y, ts - 1 - x] as const,
  r180: (x: number, y: number) => [ts - 1 - x, ts - 1 - y] as const,
  cw270: (x: number, y: number) => [ts - 1 - y, x] as const,
};
function writeRotated(idx: number, map: (x: number, y: number) => readonly [number, number]): void {
  const [dx, dy] = tileXY(idx);
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const [sx, sy] = map(x, y);
    const px = nw[sy * ts + sx];
    const di = ((dy + y) * out.width + (dx + x)) * 4;
    out.data[di] = px[0]; out.data[di + 1] = px[1]; out.data[di + 2] = px[2]; out.data[di + 3] = px[3];
  }
}
writeRotated(NE_IDX, rot.cw90);
writeRotated(ES_IDX, rot.r180);
writeRotated(SW_IDX, rot.cw270);

writeFileSync(OUT, PNG.sync.write(out));
console.log(`road-wang.png built from src: recentred by (${SHIFT_X},${SHIFT_Y}); NE/ES/SW = rotations of centred NW.`);
