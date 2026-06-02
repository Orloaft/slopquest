// Composite ground render: real-art terrain layers stacked, auto-tiled from the stage.
// Layer 1: water+grass via corner-Wang dual-grid (index==corner mask NW1/NE2/SE4/SW8).
// Layer 2: roads via edge-Wang same-grid (index==edge mask N1/E2/S4/W8).
// All from sliced authored art; NO hand-placed transition tiles.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;
const stage = JSON.parse(readFileSync(nodePath.join(repoRoot, "assetsources/asset-forge/exports/northwood/northwood.stage.json"), "utf8")) as { cols: number; rows: number; ascii: { rows: string[] } };
const water = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "assetsources/curated/sliced/water-wang.png")));
const road = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "assetsources/curated/sliced/road-wang.png")));
const waterCols = water.width / ts, roadCols = road.width / ts;

const WATER = new Set(["~", "!", "?", "=", "{", "}", "(", ")", "/", "P", "w", "Q", "V", "U", "x", "0", "J"]);
const ROAD = new Set(["t", "$", "%", "&", "+", "g", "h", "j", "k", "S", "N", "M", "D", "@", "`", ":", ";", "<", ">", "A"]);
const R = stage.rows, C = stage.cols;
const grid = stage.ascii.rows.map((row) => Array.from(row));
const isW = (r: number, c: number) => r >= 0 && c >= 0 && r < R && c < C && WATER.has(grid[r][c]);
const isR = (r: number, c: number) => r >= 0 && c >= 0 && r < R && c < C && ROAD.has(grid[r][c]);

const W = C * ts, H = R * ts;
const out = new PNG({ width: W, height: H });
out.data.fill(0);

function blit(sheet: PNG, sheetCols: number, idx: number, dx: number, dy: number): void {
  const sx = (idx % sheetCols) * ts, sy = Math.floor(idx / sheetCols) * ts;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const px = dx + x, py = dy + y;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const si = ((sy + y) * sheet.width + (sx + x)) * 4;
    if (sheet.data[si + 3] === 0) continue;
    const di = (py * W + px) * 4;
    out.data[di] = sheet.data[si]; out.data[di + 1] = sheet.data[si + 1];
    out.data[di + 2] = sheet.data[si + 2]; out.data[di + 3] = 255;
  }
}

// --- Layer 1: water + grass (dual grid) ---
for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
  const mask = (isW(i - 1, j - 1) ? 1 : 0) | (isW(i - 1, j) ? 2 : 0) | (isW(i, j) ? 4 : 0) | (isW(i, j - 1) ? 8 : 0);
  blit(water, waterCols, mask, Math.round((j - 0.5) * ts), Math.round((i - 0.5) * ts));
}

// --- Layer 2: roads (edge Wang, same grid) ---
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (!isR(r, c)) continue;
  const mask = (isR(r - 1, c) ? 1 : 0) | (isR(r, c + 1) ? 2 : 0) | (isR(r + 1, c) ? 4 : 0) | (isR(r, c - 1) ? 8 : 0);
  blit(road, roadCols, mask, c * ts, r * ts);
}

const outPath = nodePath.join(repoRoot, "artifacts/northwood-ground.png");
mkdirSync(nodePath.dirname(outPath), { recursive: true });
writeFileSync(outPath, PNG.sync.write(out));
console.log(`ground render -> ${outPath} (${W}x${H})`);
