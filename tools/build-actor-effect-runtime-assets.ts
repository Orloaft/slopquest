import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

interface CropSpec {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  outX: number;
  outY: number;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const effectOutDir = join(repoRoot, "public/sprites/effects");
const effectsSource = PNG.sync.read(readFileSync(join(repoRoot, "assetsources/meleeslashandmagicmissle.png")));

const effectFrames: CropSpec[] = [
  ...[260, 360, 480, 620, 780, 960].map((x, i) => ({ name: `slash-${i}`, x, y: 64, w: 160, h: 70, outX: i * 176, outY: 0 })),
  ...[184, 276, 386, 506, 626, 760].map((x, i) => ({ name: `fire-missile-${i}`, x, y: 626, w: 116, h: 62, outX: i * 128, outY: 90 })),
  ...[184, 276, 386, 506, 626, 760].map((x, i) => ({ name: `ice-missile-${i}`, x, y: 706, w: 116, h: 62, outX: i * 128, outY: 168 })),
  ...[1038, 1150, 1246, 1338].map((x, i) => ({ name: `fire-burst-${i}`, x, y: 618, w: 96, h: 82, outX: i * 112, outY: 246 })),
  ...[1038, 1150, 1246, 1338].map((x, i) => ({ name: `ice-burst-${i}`, x, y: 698, w: 96, h: 82, outX: i * 112, outY: 344 }))
];

mkdirSync(effectOutDir, { recursive: true });

const effects = new PNG({ width: 1040, height: 426 });
for (const spec of effectFrames) {
  const crop = cropPng(effectsSource, spec.x, spec.y, spec.w, spec.h);
  chromaKeyMagenta(crop);
  pastePng(crop, effects, spec.outX, spec.outY);
}

writeFileSync(join(effectOutDir, "combat-effects-runtime.png"), PNG.sync.write(effects));
console.log("combat effects runtime crops -> public/sprites/effects/combat-effects-runtime.png");

function cropPng(source: PNG, x: number, y: number, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h });
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) {
      copyPixel(source, x + xx, y + yy, out, xx, yy);
    }
  }
  return out;
}

function pastePng(source: PNG, target: PNG, x: number, y: number): void {
  for (let yy = 0; yy < source.height; yy += 1) {
    for (let xx = 0; xx < source.width; xx += 1) {
      copyPixel(source, xx, yy, target, x + xx, y + yy);
    }
  }
}

function copyPixel(from: PNG, fromX: number, fromY: number, to: PNG, toX: number, toY: number): void {
  if (toX < 0 || toY < 0 || toX >= to.width || toY >= to.height) return;
  const toIndex = (toY * to.width + toX) * 4;
  if (fromX < 0 || fromY < 0 || fromX >= from.width || fromY >= from.height) {
    to.data[toIndex] = 0;
    to.data[toIndex + 1] = 0;
    to.data[toIndex + 2] = 0;
    to.data[toIndex + 3] = 0;
    return;
  }
  const fromIndex = (fromY * from.width + fromX) * 4;
  to.data[toIndex] = from.data[fromIndex] ?? 0;
  to.data[toIndex + 1] = from.data[fromIndex + 1] ?? 0;
  to.data[toIndex + 2] = from.data[fromIndex + 2] ?? 0;
  to.data[toIndex + 3] = from.data[fromIndex + 3] ?? 0;
}

function chromaKeyMagenta(image: PNG): void {
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i] ?? 0;
    const g = image.data[i + 1] ?? 0;
    const b = image.data[i + 2] ?? 0;
    if (isMagentaKey(r, g, b)) image.data[i + 3] = 0;
  }
}

function isMagentaKey(r: number, g: number, b: number): boolean {
  if (r > 95 && b > 90 && g < 135 && Math.abs(r - b) < 95 && r > g * 1.35 && b > g * 1.25) return true;
  if (g < 10 && r > 70 && b > 42 && r > b - 5 && r > g * 7 && b > g * 7) return true;
  return g < 12 && r > 45 && b > 45 && Math.abs(r - b) < 60 && r > g * 6 && b > g * 6;
}
