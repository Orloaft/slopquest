// Throwaway: tile a candidate floor crop NxN (with per-cell flips, like the in-game picker) so
// seams/grid are visible without launching the game. Optional half-offset overlay blend test.
// Usage: node tools/_tilepreview.ts <src> <x> <y> <w> <h> <inset> <out> [blend]
import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "node:fs";

const [src, xs, ys, ws, hs, insetS, out, blend] = process.argv.slice(2);
const x = +xs, y = +ys, w = +ws, h = +hs, inset = +insetS;
const png = PNG.sync.read(readFileSync(src));
const TILE = 48, N = 6;
// Extract inset crop into a TILE x TILE buffer (nearest scale).
const cw = w - inset * 2, ch = h - inset * 2;
const tile = new Uint8Array(TILE * TILE * 4);
for (let j = 0; j < TILE; j += 1) for (let i = 0; i < TILE; i += 1) {
  const sx = x + inset + Math.floor((i / TILE) * cw);
  const sy = y + inset + Math.floor((j / TILE) * ch);
  const si = (sy * png.width + sx) << 2, di = (j * TILE + i) << 2;
  tile[di] = png.data[si]; tile[di + 1] = png.data[si + 1]; tile[di + 2] = png.data[si + 2]; tile[di + 3] = png.data[si + 3];
}
const sample = (fx: number, fy: number): number[] => {
  const i = (fy * TILE + fx) << 2; return [tile[i], tile[i + 1], tile[i + 2], tile[i + 3]];
};
const dst = new PNG({ width: TILE * N, height: TILE * N });
for (let ty = 0; ty < N; ty += 1) for (let tx = 0; tx < N; tx += 1) {
  const hsh = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
  const flipH = (hsh & 1) === 1, flipV = (hsh & 2) === 2;
  for (let j = 0; j < TILE; j += 1) for (let i = 0; i < TILE; i += 1) {
    const fx = flipH ? TILE - 1 - i : i, fy = flipV ? TILE - 1 - j : j;
    const [r, g, b, a] = sample(fx, fy);
    const px = tx * TILE + i, py = ty * TILE + j, di = (py * (TILE * N) + px) << 2;
    dst.data[di] = r; dst.data[di + 1] = g; dst.data[di + 2] = b; dst.data[di + 3] = a;
  }
}
// Optional: half-offset second layer at 45% alpha to break the grid.
if (blend === "blend") {
  const off = TILE / 2;
  for (let py = 0; py < TILE * N; py += 1) for (let px = 0; px < TILE * N; px += 1) {
    const ox = (px + off) % (TILE * N), oy = (py + off) % (TILE * N);
    const fi = ((py * TILE * N + px) << 2);
    const oi = (((Math.floor(oy / TILE) * 73856093) ^ (Math.floor(ox / TILE) * 19349663)) >>> 0);
    const flipH = (oi & 1) === 1, flipV = (oi & 2) === 2;
    let lx = ox % TILE, ly = oy % TILE;
    lx = flipH ? TILE - 1 - lx : lx; ly = flipV ? TILE - 1 - ly : ly;
    const [r, g, b] = sample(lx, ly);
    const aA = 0.45;
    dst.data[fi] = Math.round(dst.data[fi] * (1 - aA) + r * aA);
    dst.data[fi + 1] = Math.round(dst.data[fi + 1] * (1 - aA) + g * aA);
    dst.data[fi + 2] = Math.round(dst.data[fi + 2] * (1 - aA) + b * aA);
  }
}
writeFileSync(out, PNG.sync.write(dst));
console.log(`wrote ${out} (${TILE * N}x${TILE * N}) tile ${src}@${x},${y} ${w}x${h} inset=${inset} blend=${blend ?? "no"}`);
