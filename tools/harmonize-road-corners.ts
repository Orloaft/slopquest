// Harmonize the four road corner tiles in road-wang.png.
// ---------------------------------------------------------------------------
// The curated road-wang.png (4x4 @32px edge-Wang atlas, index == NESW mask) has
// exactly ONE correctly-formed corner: idx 9 (mask NW, N|W) — its dirt reaches the
// N and W edges with the grass filling the top-left inner concavity, and its arms
// line up with the straight tiles. The other three corner slots (NE=3, ES=6, SW=12)
// held mis-shaped / mis-aligned tiles, so only the NW bend ever rendered cleanly.
//
// Since a 90deg rotation preserves arm width and position exactly, we regenerate the
// other three corners as lossless rotations of the good NW tile. All four corners
// then share identical geometry and align with the straights just like NW does:
//   NE(3)  = NW rotated 90 CW   (N|W -> N|E)
//   ES(6)  = NW rotated 180     (N|W -> S|E)
//   SW(12) = NW rotated 270 CW  (N|W -> S|W)
// Run after any change to the curated atlas: npm run assets:fix:road-corners
import { readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ATLAS = nodePath.join(repoRoot, "assetsources/curated/sliced/road-wang.png");
const ts = 32, COLS = 4;
const NW_IDX = 9, NE_IDX = 3, ES_IDX = 6, SW_IDX = 12;

const png = PNG.sync.read(readFileSync(ATLAS));
const tileXY = (idx: number) => [(idx % COLS) * ts, Math.floor(idx / COLS) * ts] as const;

// read the NW tile into a flat [ts*ts] of [r,g,b,a]
const [nwx, nwy] = tileXY(NW_IDX);
const base: number[][] = [];
for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
  const i = ((nwy + y) * png.width + (nwx + x)) * 4;
  base[y * ts + x] = [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

// map output (x,y) of a rotated tile -> source (x,y) in the NW base
const rot = {
  cw90: (x: number, y: number) => [y, ts - 1 - x] as const,
  r180: (x: number, y: number) => [ts - 1 - x, ts - 1 - y] as const,
  cw270: (x: number, y: number) => [ts - 1 - y, x] as const,
};

function writeRotated(idx: number, map: (x: number, y: number) => readonly [number, number]): void {
  const [dx, dy] = tileXY(idx);
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const [sx, sy] = map(x, y);
    const px = base[sy * ts + sx];
    const di = ((dy + y) * png.width + (dx + x)) * 4;
    png.data[di] = px[0]; png.data[di + 1] = px[1]; png.data[di + 2] = px[2]; png.data[di + 3] = px[3];
  }
}

writeRotated(NE_IDX, rot.cw90);
writeRotated(ES_IDX, rot.r180);
writeRotated(SW_IDX, rot.cw270);
writeFileSync(ATLAS, PNG.sync.write(png));
console.log(`harmonized road corners in road-wang.png: NE/ES/SW are now rotations of the NW tile (idx ${NW_IDX}).`);
