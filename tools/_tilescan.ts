// Throwaway: find tile boundaries by detecting magenta-background gaps.
// Usage: node tools/_tilescan.ts <src> <axis:col|row> <bandStart> <bandEnd> <scanStart> <scanEnd>
// Prints runs of content (non-bg) along the axis within the band.
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const [src, axis, bs, be, ss, se] = process.argv.slice(2);
const png = PNG.sync.read(readFileSync(src));
const bandStart = +bs, bandEnd = +be, scanStart = +ss, scanEnd = +se;
// background = top-left pixel (the sheet's magenta)
const bg = [png.data[0], png.data[1], png.data[2]];
const isBg = (x: number, y: number): boolean => {
  const i = (y * png.width + x) << 2;
  const d = png.data;
  return Math.abs(d[i] - bg[0]) < 28 && Math.abs(d[i + 1] - bg[1]) < 28 && Math.abs(d[i + 2] - bg[2]) < 28;
};
// For each line along the scan axis, fraction of band pixels that are content.
const frac: number[] = [];
for (let s = scanStart; s <= scanEnd; s += 1) {
  let content = 0, total = 0;
  for (let b = bandStart; b <= bandEnd; b += 1) {
    const x = axis === "col" ? s : b;
    const y = axis === "col" ? b : s;
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
    total += 1;
    if (!isBg(x, y)) content += 1;
  }
  frac.push(total ? content / total : 0);
}
// Runs where frac > 0.5 = a tile band.
console.log(`bg=${bg} axis=${axis} band=${bandStart}..${bandEnd}`);
let runStart = -1;
for (let i = 0; i < frac.length; i += 1) {
  const on = frac[i] > 0.5;
  if (on && runStart < 0) runStart = scanStart + i;
  if (!on && runStart >= 0) { console.log(`  content ${runStart}..${scanStart + i - 1} (w=${scanStart + i - runStart})`); runStart = -1; }
}
if (runStart >= 0) console.log(`  content ${runStart}..${scanEnd} (w=${scanEnd - runStart + 1})`);
