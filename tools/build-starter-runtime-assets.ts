import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface CropSpec {
  source: "town" | "forest" | "trees";
  key: string;
  out: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "tile" | "sprite";
  inset?: number;
  recolor?: (r: number, g: number, b: number) => [number, number, number];
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(repoRoot, "public/sprites/starter");
const sources = {
  town: PNG.sync.read(readFileSync(join(repoRoot, "assetsources/towntiles.png"))),
  forest: PNG.sync.read(readFileSync(join(repoRoot, "assetsources/foresttiles.png"))),
  trees: PNG.sync.read(readFileSync(join(repoRoot, "assetsources/curated/bespoke/northwood-trees-v1/northwood-trees-source-alpha.png")))
} satisfies Record<string, PNG>;

const plazaWarm = (r: number, g: number, b: number): [number, number, number] => [
  Math.min(255, Math.round(r * 1.28 + 24)),
  Math.min(255, Math.round(g * 1.24 + 18)),
  Math.min(255, Math.round(b * 1.12 + 8))
];
const graveMoss = (r: number, g: number, b: number): [number, number, number] => {
  const lum = r * 0.32 + g * 0.55 + b * 0.13;
  const mute = (c: number, lvl: number): number => Math.round(Math.min(255, (c * 0.4 + lum * 0.6) * lvl));
  return [mute(r, 0.78), mute(g, 0.72), mute(b, 0.6)];
};

const specs: CropSpec[] = [
  { source: "town", key: "tileGrass", out: "tile-grass.png", x: 24, y: 24, w: 84, h: 84, kind: "tile" },
  { source: "town", key: "tileGrassWorn", out: "tile-grass-worn.png", x: 130, y: 24, w: 84, h: 84, kind: "tile" },
  { source: "town", key: "tileStone", out: "tile-stone.png", x: 236, y: 248, w: 84, h: 84, kind: "tile" },
  { source: "town", key: "tileMuster", out: "tile-muster.png", x: 342, y: 248, w: 84, h: 84, kind: "tile" },
  { source: "town", key: "tileTownFloor", out: "tile-town-floor.png", x: 236, y: 248, w: 84, h: 84, kind: "tile", recolor: plazaWarm },
  { source: "town", key: "tileDirt", out: "tile-dirt.png", x: 236, y: 24, w: 84, h: 84, kind: "tile" },
  { source: "town", key: "tileWater", out: "tile-water.png", x: 24, y: 248, w: 84, h: 84, kind: "tile" },
  { source: "forest", key: "tileForest", out: "tile-forest.png", x: 24, y: 34, w: 84, h: 84, kind: "tile" },
  { source: "forest", key: "tileGraveMoss", out: "tile-grave-moss.png", x: 24, y: 34, w: 84, h: 84, kind: "tile", recolor: graveMoss },
  { source: "forest", key: "tileRock", out: "tile-rock.png", x: 1120, y: 794, w: 84, h: 84, kind: "tile" },
  { source: "trees", key: "spriteTree", out: "sprite-tree.png", x: 35, y: 55, w: 355, h: 385, kind: "sprite" },
  { source: "trees", key: "spritePine", out: "sprite-pine.png", x: 455, y: 50, w: 220, h: 390, kind: "sprite" },
  { source: "forest", key: "spriteRock", out: "sprite-rock.png", x: 640, y: 500, w: 92, h: 72, kind: "sprite" },
  { source: "town", key: "spritePortal", out: "sprite-portal.png", x: 828, y: 424, w: 86, h: 132, kind: "sprite" },
  { source: "town", key: "spriteBridge", out: "sprite-bridge.png", x: 20, y: 466, w: 92, h: 56, kind: "sprite" },
  { source: "town", key: "spriteWell", out: "sprite-well.png", x: 824, y: 420, w: 94, h: 132, kind: "sprite" },
  { source: "town", key: "spriteRedHouse", out: "sprite-red-house.png", x: 996, y: 22, w: 238, h: 176, kind: "sprite" },
  { source: "town", key: "spriteBlueHouse", out: "sprite-blue-house.png", x: 996, y: 374, w: 250, h: 180, kind: "sprite" },
  { source: "town", key: "spriteGreenHouse", out: "sprite-green-house.png", x: 1272, y: 374, w: 142, h: 178, kind: "sprite" },
  { source: "town", key: "spriteThatchHouse", out: "sprite-thatch-house.png", x: 1294, y: 24, w: 130, h: 176, kind: "sprite" },
  { source: "town", key: "spriteMarket", out: "sprite-market.png", x: 1208, y: 786, w: 188, h: 84, kind: "sprite" },
  { source: "town", key: "spriteSign", out: "sprite-sign.png", x: 616, y: 420, w: 74, h: 90, kind: "sprite" },
  { source: "town", key: "spriteLamp", out: "sprite-lamp.png", x: 912, y: 424, w: 38, h: 136, kind: "sprite" },
  { source: "town", key: "spriteBarrels", out: "sprite-barrels.png", x: 1200, y: 700, w: 90, h: 70, kind: "sprite" }
];

mkdirSync(outDir, { recursive: true });
for (const spec of specs) {
  const source = sources[spec.source];
  const image = spec.kind === "tile" ? buildTile(source, spec) : cropPng(source, spec.x, spec.y, spec.w, spec.h);
  chromaKeyMagenta(image);
  writeFileSync(join(outDir, spec.out), PNG.sync.write(image));
  console.log(`${spec.key} -> public/sprites/starter/${spec.out}`);
}

function buildTile(source: PNG, spec: CropSpec): PNG {
  const inset = spec.inset ?? Math.min(10, Math.floor(spec.w / 5), Math.floor(spec.h / 5));
  const crop = cropPng(source, spec.x + inset, spec.y + inset, spec.w - inset * 2, spec.h - inset * 2);
  chromaKeyMagenta(crop);
  const scaled = scaleNearest(crop, 32, 32);
  chromaKeyMagenta(scaled);
  if (spec.recolor) recolorPng(scaled, spec.recolor);
  fillTransparentPixels(scaled);
  return scaled;
}

function cropPng(source: PNG, x: number, y: number, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h });
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) {
      copyPixel(source, x + xx, y + yy, out, xx, yy);
    }
  }
  return out;
}

function scaleNearest(source: PNG, width: number, height: number): PNG {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(source.height - 1, Math.floor((y * source.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(source.width - 1, Math.floor((x * source.width) / width));
      copyPixel(source, sx, sy, out, x, y);
    }
  }
  return out;
}

function copyPixel(from: PNG, fromX: number, fromY: number, to: PNG, toX: number, toY: number): void {
  const fromIndex = (fromY * from.width + fromX) * 4;
  const toIndex = (toY * to.width + toX) * 4;
  to.data[toIndex] = from.data[fromIndex] ?? 0;
  to.data[toIndex + 1] = from.data[fromIndex + 1] ?? 0;
  to.data[toIndex + 2] = from.data[fromIndex + 2] ?? 0;
  to.data[toIndex + 3] = from.data[fromIndex + 3] ?? 0;
}

function recolorPng(image: PNG, recolor: (r: number, g: number, b: number) => [number, number, number]): void {
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] === 0) continue;
    const [r, g, b] = recolor(image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0);
    image.data[i] = r;
    image.data[i + 1] = g;
    image.data[i + 2] = b;
  }
}

function chromaKeyMagenta(image: PNG): void {
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i] ?? 0;
    const g = image.data[i + 1] ?? 0;
    const b = image.data[i + 2] ?? 0;
    if (isMagentaKey(r, g, b)) image.data[i + 3] = 0;
  }
}

function fillTransparentPixels(image: PNG): void {
  const fill = sampleOpaqueColor(image);
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] !== 0) continue;
    image.data[i] = fill.r;
    image.data[i + 1] = fill.g;
    image.data[i + 2] = fill.b;
    image.data[i + 3] = 255;
  }
}

function sampleOpaqueColor(image: PNG): RgbColor {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const startX = Math.floor(image.width * 0.25);
  const endX = Math.ceil(image.width * 0.75);
  const startY = Math.floor(image.height * 0.25);
  const endY = Math.ceil(image.height * 0.75);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const i = (y * image.width + x) * 4;
      if (image.data[i + 3] === 0) continue;
      r += image.data[i] ?? 0;
      g += image.data[i + 1] ?? 0;
      b += image.data[i + 2] ?? 0;
      count += 1;
    }
  }
  if (!count) return { r: 40, g: 90, b: 40 };
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
}

function isMagentaKey(r: number, g: number, b: number): boolean {
  if (r > 95 && b > 90 && g < 135 && Math.abs(r - b) < 95 && r > g * 1.35 && b > g * 1.25) return true;
  if (g < 10 && r > 70 && b > 42 && r > b - 5 && r > g * 7 && b > g * 7) return true;
  return g < 12 && r > 45 && b > 45 && Math.abs(r - b) < 60 && r > g * 6 && b > g * 6;
}
