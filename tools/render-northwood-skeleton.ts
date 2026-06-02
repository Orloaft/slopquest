// Render the mockup-derived layout skeleton (assetsources/mockup/layout.txt) using the
// proven real-art auto-tiling: water corner-Wang dual-grid + road edge-Wang over grass.
// tree/cliff/sand are placeholders for now (rendered as grass; sand kept warm-ish later).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;
const rows = readFileSync(nodePath.join(repoRoot, "assetsources/mockup/layout.txt"), "utf8").replace(/\n$/, "").split("\n");
const water = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "assetsources/curated/sliced/water-wang.png")));
const road = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "assetsources/curated/sliced/road-wang.png")));
const wCols = water.width / ts, rCols = road.width / ts;
const R = rows.length, C = rows[0].length, W = C * ts, H = R * ts;
const at = (r: number, c: number) => (r >= 0 && c >= 0 && r < R && c < C ? rows[r][c] : "^");
const isW = (r: number, c: number) => at(r, c) === "~";
const isR = (r: number, c: number) => at(r, c) === "t";

const out = new PNG({ width: W, height: H });
out.data.fill(0);
function blit(sheet: PNG, cols: number, idx: number, dx: number, dy: number) {
  const sx = (idx % cols) * ts, sy = Math.floor(idx / cols) * ts;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const px = dx + x, py = dy + y; if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const si = ((sy + y) * sheet.width + (sx + x)) * 4; if (sheet.data[si + 3] === 0) continue;
    const di = (py * W + px) * 4;
    out.data[di] = sheet.data[si]; out.data[di + 1] = sheet.data[si + 1]; out.data[di + 2] = sheet.data[si + 2]; out.data[di + 3] = 255;
  }
}
// water+grass dual grid
for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
  const m = (isW(i - 1, j - 1) ? 1 : 0) | (isW(i - 1, j) ? 2 : 0) | (isW(i, j) ? 4 : 0) | (isW(i, j - 1) ? 8 : 0);
  blit(water, wCols, m, Math.round((j - 0.5) * ts), Math.round((i - 0.5) * ts));
}
// roads edge-Wang
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (!isR(r, c)) continue;
  const m = (isR(r - 1, c) ? 1 : 0) | (isR(r, c + 1) ? 2 : 0) | (isR(r + 1, c) ? 4 : 0) | (isR(r, c - 1) ? 8 : 0);
  blit(road, rCols, m, c * ts, r * ts);
}
// border = void: paint deep water-blue/dark outside the island
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (at(r, c) !== "^") continue;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const di = ((r * ts + y) * W + (c * ts + x)) * 4;
    out.data[di] = 26; out.data[di + 1] = 42; out.data[di + 2] = 58; out.data[di + 3] = 255;
  }
}
const outPath = nodePath.join(repoRoot, "artifacts/northwood-skeleton.png");
mkdirSync(nodePath.dirname(outPath), { recursive: true });
writeFileSync(outPath, PNG.sync.write(out));
console.log(`skeleton render -> ${outPath} (${W}x${H})`);
