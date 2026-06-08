// Throwaway: crop a region of a PNG (optionally with a grid overlay every N px)
// so tile coordinates can be measured by eye. Usage:
//   node tools/_crop.ts <src> <x> <y> <w> <h> <out> [grid]
import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "node:fs";

const [src, xs, ys, ws, hs, out, gridS] = process.argv.slice(2);
const x = +xs, y = +ys, w = +ws, h = +hs, grid = gridS ? +gridS : 0;
const png = PNG.sync.read(readFileSync(src));
const dst = new PNG({ width: w, height: h });
for (let j = 0; j < h; j += 1) {
  for (let i = 0; i < w; i += 1) {
    const si = ((y + j) * png.width + (x + i)) << 2;
    const di = (j * w + i) << 2;
    let r = png.data[si], g = png.data[si + 1], b = png.data[si + 2], a = png.data[si + 3];
    if (grid && ((x + i) % grid === 0 || (y + j) % grid === 0)) { r = 255; g = 0; b = 0; a = 255; }
    dst.data[di] = r; dst.data[di + 1] = g; dst.data[di + 2] = b; dst.data[di + 3] = a;
  }
}
writeFileSync(out, PNG.sync.write(dst));
console.log(`wrote ${out} (${w}x${h}) from ${src}@${x},${y} grid=${grid}`);
