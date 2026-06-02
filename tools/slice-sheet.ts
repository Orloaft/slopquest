// General tile-sheet slicer for the chroma-keyed (magenta) authored art sheets.
// Auto-detects the grid by finding magenta "gutter" rows/columns, then area-downscales
// each tile cell to a target cell size with magenta keyed to transparency.
// Emits a packed 32px atlas (row-major) plus a scaled, index-labeled inspection PNG.
//
// Usage:
//   node tools/slice-sheet.ts --sheet assetsources/newtiles1-fixed.png \
//     --out assetsources/curated/sliced/water-wang.png \
//     --inspect assetsources/curated/sliced/water-wang-inspect.png \
//     [--cell 32] [--inset 10] [--scale 4] [--gutter 0.7] [--minrun 3]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const args = process.argv.slice(2);
function arg(name: string, fallback?: string): string {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing required arg ${name}`);
}
const sheetPath = nodePath.join(repoRoot, arg("--sheet"));
const outPath = nodePath.join(repoRoot, arg("--out"));
const inspectPath = arg("--inspect", "") ? nodePath.join(repoRoot, arg("--inspect", "")) : "";
const cell = Number(arg("--cell", "32"));
const inset = Number(arg("--inset", "10"));
const scale = Number(arg("--scale", "4"));
const gutterFrac = Number(arg("--gutter", "0.7"));
const minRun = Number(arg("--minrun", "3"));

const src = PNG.sync.read(readFileSync(sheetPath));
const W = src.width, H = src.height;
function isMag(i: number): boolean {
  const r = src.data[i], g = src.data[i + 1], b = src.data[i + 2], a = src.data[i + 3];
  if (a < 16) return true; // already transparent counts as gutter
  // Pure magenta OR pink antialias fringe: red & blue high, green is the distinctly low channel.
  // Grass (green high) and dirt (green mid, between r and b) both fail this.
  return r > 150 && b > 130 && g < r - 40 && g < b - 30;
}
function colMag(x: number): number { let m = 0; for (let y = 0; y < H; y++) if (isMag((y * W + x) * 4)) m++; return m / H; }
function rowMag(y: number): number { let m = 0; for (let x = 0; x < W; x++) if (isMag((y * W + x) * 4)) m++; return m / W; }

// content bands = consecutive runs where the line is NOT mostly magenta
function bands(len: number, frac: (i: number) => number): Array<[number, number]> {
  const isGutter: boolean[] = [];
  for (let i = 0; i < len; i++) isGutter.push(frac(i) > gutterFrac);
  const out: Array<[number, number]> = [];
  let s = -1;
  for (let i = 0; i <= len; i++) {
    const gut = i === len ? true : isGutter[i];
    if (!gut && s < 0) s = i;
    else if (gut && s >= 0) { if (i - s >= minRun) out.push([s, i - 1]); s = -1; }
  }
  return out;
}
// --force NxM: ignore gutter auto-detection, divide the content bounding box into an even grid.
// Use for sparse sheets (e.g. cliff Wang) where mostly-empty tiles look like gutters.
const force = arg("--force", "");
let colBands: Array<[number, number]>, rowBands: Array<[number, number]>;
if (force) {
  const [fc, fr] = force.split("x").map(Number);
  // content bbox = span between first/last line that is not ~fully magenta
  let cx0 = 0, cx1 = W - 1, cy0 = 0, cy1 = H - 1;
  while (cx0 < W && colMag(cx0) > 0.985) cx0++;
  while (cx1 > cx0 && colMag(cx1) > 0.985) cx1--;
  while (cy0 < H && rowMag(cy0) > 0.985) cy0++;
  while (cy1 > cy0 && rowMag(cy1) > 0.985) cy1--;
  const cw = (cx1 - cx0 + 1) / fc, rh = (cy1 - cy0 + 1) / fr;
  colBands = Array.from({ length: fc }, (_, i): [number, number] => [Math.round(cx0 + i * cw), Math.round(cx0 + (i + 1) * cw) - 1]);
  rowBands = Array.from({ length: fr }, (_, i): [number, number] => [Math.round(cy0 + i * rh), Math.round(cy0 + (i + 1) * rh) - 1]);
} else {
  colBands = bands(W, colMag);
  rowBands = bands(H, rowMag);
}
const cols = colBands.length, rows = rowBands.length;
const count = cols * rows;
console.log(`grid ${cols}x${rows} = ${count} tiles; cell=${cell} inset=${inset}`);

const atlas = new PNG({ width: cols * cell, height: rows * cell });
// init transparent
atlas.data.fill(0);

function sampleCell(x0: number, x1: number, y0: number, y1: number, dst: PNG, ox: number, oy: number): void {
  const sx0 = x0 + inset, sx1 = x1 - inset, sy0 = y0 + inset, sy1 = y1 - inset;
  const bw = sx1 - sx0, bh = sy1 - sy0;
  for (let cy = 0; cy < cell; cy++) {
    for (let cx = 0; cx < cell; cx++) {
      const rx0 = sx0 + Math.floor((cx * bw) / cell);
      const rx1 = Math.max(rx0 + 1, sx0 + Math.floor(((cx + 1) * bw) / cell));
      const ry0 = sy0 + Math.floor((cy * bh) / cell);
      const ry1 = Math.max(ry0 + 1, sy0 + Math.floor(((cy + 1) * bh) / cell));
      let r = 0, g = 0, b = 0, n = 0, t = 0;
      for (let yy = ry0; yy < ry1; yy++) for (let xx = rx0; xx < rx1; xx++) {
        const i = (yy * W + xx) * 4; t++;
        if (isMag(i)) continue;
        r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n++;
      }
      const di = ((oy + cy) * dst.width + (ox + cx)) * 4;
      if (n === 0 || n / t < 0.5) { dst.data[di + 3] = 0; continue; }
      dst.data[di] = Math.round(r / n); dst.data[di + 1] = Math.round(g / n);
      dst.data[di + 2] = Math.round(b / n); dst.data[di + 3] = 255;
    }
  }
}

let idx = 0;
const cellBoxes: Array<[number, number, number, number]> = [];
for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
  const [x0, x1] = colBands[cx], [y0, y1] = rowBands[ry];
  cellBoxes.push([x0, x1, y0, y1]);
  sampleCell(x0, x1, y0, y1, atlas, cx * cell, ry * cell);
  idx++;
}

mkdirSync(nodePath.dirname(outPath), { recursive: true });
writeFileSync(outPath, PNG.sync.write(atlas));

// inspection: scaled with a checker backdrop so transparency is visible + index ticks
if (inspectPath) {
  const pad = 2;
  const big = new PNG({ width: cols * (cell * scale + pad) + pad, height: rows * (cell * scale + pad) + pad });
  for (let y = 0; y < big.height; y++) for (let x = 0; x < big.width; x++) {
    const di = (y * big.width + x) * 4;
    const ch = ((x >> 3) + (y >> 3)) & 1 ? 90 : 60;
    big.data[di] = ch; big.data[di + 1] = ch; big.data[di + 2] = ch; big.data[di + 3] = 255;
  }
  for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
    const ox = pad + cx * (cell * scale + pad), oy = pad + ry * (cell * scale + pad);
    for (let cy = 0; cy < cell; cy++) for (let cxp = 0; cxp < cell; cxp++) {
      const si = ((ry * cell + cy) * atlas.width + (cx * cell + cxp)) * 4;
      const a = atlas.data[si + 3]; if (a === 0) continue;
      for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) {
        const di = ((oy + cy * scale + yy) * big.width + (ox + cxp * scale + xx)) * 4;
        big.data[di] = atlas.data[si]; big.data[di + 1] = atlas.data[si + 1];
        big.data[di + 2] = atlas.data[si + 2]; big.data[di + 3] = 255;
      }
    }
  }
  mkdirSync(nodePath.dirname(inspectPath), { recursive: true });
  writeFileSync(inspectPath, PNG.sync.write(big));
}

console.log(`wrote ${outPath} (${atlas.width}x${atlas.height}, ${count} tiles)` + (inspectPath ? ` + inspect ${inspectPath}` : ""));
