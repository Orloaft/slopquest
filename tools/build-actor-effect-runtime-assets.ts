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
const actorOutDir = join(repoRoot, "public/sprites/actors");
const effectOutDir = join(repoRoot, "public/sprites/effects");
const ratSource = PNG.sync.read(readFileSync(join(repoRoot, "assetsources/ratandspiders.png")));
const effectsSource = PNG.sync.read(readFileSync(join(repoRoot, "assetsources/meleeslashandmagicmissle.png")));

const RAT_PAD = 8;
const ratSpiderFrames: CropSpec[] = [
  { name: "rat-up", x: 732, y: 134, w: 50, h: 64, outX: 8, outY: 8 },
  { name: "rat-down", x: 650, y: 134, w: 50, h: 64, outX: 88, outY: 8 },
  { name: "rat-left-0", x: 153, y: 136, w: 114, h: 52, outX: 168, outY: 8 },
  { name: "rat-left-1", x: 276, y: 136, w: 114, h: 52, outX: 306, outY: 8 },
  { name: "rat-left-2", x: 402, y: 136, w: 114, h: 52, outX: 444, outY: 8 },
  { name: "rat-left-3", x: 523, y: 136, w: 114, h: 52, outX: 582, outY: 8 },
  { name: "spider-up", x: 726, y: 678, w: 54, h: 46, outX: 8, outY: 104 },
  { name: "spider-down", x: 643, y: 678, w: 54, h: 46, outX: 86, outY: 104 },
  { name: "spider-left-0", x: 156, y: 680, w: 90, h: 44, outX: 164, outY: 104 },
  { name: "spider-left-1", x: 277, y: 680, w: 90, h: 44, outX: 286, outY: 104 },
  { name: "spider-left-2", x: 404, y: 680, w: 90, h: 44, outX: 408, outY: 104 },
  { name: "spider-left-3", x: 522, y: 680, w: 90, h: 44, outX: 530, outY: 104 }
];

const effectFrames: CropSpec[] = [
  ...[260, 360, 480, 620, 780, 960].map((x, i) => ({ name: `slash-${i}`, x, y: 64, w: 160, h: 70, outX: i * 176, outY: 0 })),
  ...[184, 276, 386, 506, 626, 760].map((x, i) => ({ name: `fire-missile-${i}`, x, y: 626, w: 116, h: 62, outX: i * 128, outY: 90 })),
  ...[184, 276, 386, 506, 626, 760].map((x, i) => ({ name: `ice-missile-${i}`, x, y: 706, w: 116, h: 62, outX: i * 128, outY: 168 })),
  ...[1038, 1150, 1246, 1338].map((x, i) => ({ name: `fire-burst-${i}`, x, y: 618, w: 96, h: 82, outX: i * 112, outY: 246 })),
  ...[1038, 1150, 1246, 1338].map((x, i) => ({ name: `ice-burst-${i}`, x, y: 698, w: 96, h: 82, outX: i * 112, outY: 344 }))
];

mkdirSync(actorOutDir, { recursive: true });
mkdirSync(effectOutDir, { recursive: true });

const ratSpider = new PNG({ width: 720, height: 166 });
for (const spec of ratSpiderFrames) {
  const crop = cropPng(ratSource, spec.x - RAT_PAD, spec.y - RAT_PAD, spec.w + RAT_PAD * 2, spec.h + RAT_PAD * 2);
  chromaKeyMagenta(crop);
  clearConnectedBackground(crop, isNearBlackBackground);
  clearEdgePixels(crop, isNearBlackBackground);
  pastePng(crop, ratSpider, spec.outX - RAT_PAD, spec.outY - RAT_PAD);
}

const effects = new PNG({ width: 1040, height: 426 });
for (const spec of effectFrames) {
  const crop = cropPng(effectsSource, spec.x, spec.y, spec.w, spec.h);
  chromaKeyMagenta(crop);
  pastePng(crop, effects, spec.outX, spec.outY);
}

writeFileSync(join(actorOutDir, "rat-spider-runtime.png"), PNG.sync.write(ratSpider));
writeFileSync(join(effectOutDir, "combat-effects-runtime.png"), PNG.sync.write(effects));
console.log("rat/spider runtime crops -> public/sprites/actors/rat-spider-runtime.png");
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

function clearConnectedBackground(image: PNG, isBackground: (r: number, g: number, b: number, a: number) => boolean): void {
  const queue: Array<[number, number]> = [];
  const seen = new Uint8Array(image.width * image.height);
  const enqueue = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
    const pos = y * image.width + x;
    if (seen[pos]) return;
    const i = pos * 4;
    if (!isBackground(image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0, image.data[i + 3] ?? 0)) return;
    seen[pos] = 1;
    queue.push([x, y]);
  };

  for (let x = 0; x < image.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, image.height - 1);
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    enqueue(0, y);
    enqueue(image.width - 1, y);
  }

  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    const i = (y * image.width + x) * 4;
    image.data[i + 3] = 0;
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }
}

function clearEdgePixels(image: PNG, isBackground: (r: number, g: number, b: number, a: number) => boolean): void {
  const clear = (x: number, y: number): void => {
    const i = (y * image.width + x) * 4;
    if (isBackground(image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0, image.data[i + 3] ?? 0)) image.data[i + 3] = 0;
  };
  for (let x = 0; x < image.width; x += 1) {
    clear(x, 0);
    clear(x, image.height - 1);
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    clear(0, y);
    clear(image.width - 1, y);
  }
}

function isNearBlackBackground(r: number, g: number, b: number, a: number): boolean {
  return a > 0 && r < 38 && g < 38 && b < 38;
}

function isMagentaKey(r: number, g: number, b: number): boolean {
  if (r > 95 && b > 90 && g < 135 && Math.abs(r - b) < 95 && r > g * 1.35 && b > g * 1.25) return true;
  if (g < 10 && r > 70 && b > 42 && r > b - 5 && r > g * 7 && b > g * 7) return true;
  return g < 12 && r > 45 && b > 45 && Math.abs(r - b) < 60 && r > g * 6 && b > g * 6;
}
