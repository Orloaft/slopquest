// VERTICAL SLICE PROOF: render the whole Northwood ground (grass + water) using the
// real sliced corner-Wang water set via dual-grid (marching-squares) auto-tiling.
// Water field is derived from the stage's water chars; NO hand-placed transitions.
// Tile index == 4-corner water bitmask (NW=1,NE=2,SE=4,SW=8), verified from the art.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;
const stage = JSON.parse(readFileSync(nodePath.join(repoRoot, "assetsources/asset-forge/exports/northwood/northwood.stage.json"), "utf8")) as { cols: number; rows: number; ascii: { rows: string[] } };
const wang = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "assetsources/curated/sliced/water-wang.png")));
const wangCols = wang.width / ts;

const WATER = new Set(["~", "!", "?", "=", "{", "}", "(", ")", "/", "P", "w", "Q", "V", "U", "x", "0", "J"]);
const R = stage.rows, C = stage.cols;
const cellWater: boolean[][] = stage.ascii.rows.map((row) => Array.from(row).map((ch) => WATER.has(ch)));
const waterAt = (r: number, c: number): boolean => (r < 0 || c < 0 || r >= R || c >= C ? false : cellWater[r][c]);

const W = C * ts, H = R * ts;
const out = new PNG({ width: W, height: H });
out.data.fill(0);

function blit(maskIdx: number, dx: number, dy: number): void {
  const sx = (maskIdx % wangCols) * ts, sy = Math.floor(maskIdx / wangCols) * ts;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const px = dx + x, py = dy + y;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const si = ((sy + y) * wang.width + (sx + x)) * 4;
    if (wang.data[si + 3] === 0) continue;
    const di = (py * W + px) * 4;
    out.data[di] = wang.data[si]; out.data[di + 1] = wang.data[si + 1];
    out.data[di + 2] = wang.data[si + 2]; out.data[di + 3] = 255;
  }
}

// Dual grid: vertex (i,j) for i in 0..R, j in 0..C. Tile drawn at ((j-0.5)*ts,(i-0.5)*ts).
// Its 4 quadrants overlap cells: NW=(i-1,j-1) NE=(i-1,j) SE=(i,j) SW=(i,j-1).
for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
  const nw = waterAt(i - 1, j - 1), ne = waterAt(i - 1, j), se = waterAt(i, j), sw = waterAt(i, j - 1);
  const mask = (nw ? 1 : 0) | (ne ? 2 : 0) | (se ? 4 : 0) | (sw ? 8 : 0);
  blit(mask, Math.round((j - 0.5) * ts), Math.round((i - 0.5) * ts));
}

const outPath = nodePath.join(repoRoot, "artifacts/northwood-water-slice.png");
mkdirSync(nodePath.dirname(outPath), { recursive: true });
writeFileSync(outPath, PNG.sync.write(out));
console.log(`water-slice render -> ${outPath} (${W}x${H})`);
