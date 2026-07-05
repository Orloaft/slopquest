import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, "artifacts/art-new-direction/route-mvp");
mkdirSync(outDir, { recursive: true });

const sourceTs = 16;
const runtimeTs = 32;
const stageDir = path.join(repoRoot, "assetsources/asset-forge/exports/route");
const sourceSheet = PNG.sync.read(readFileSync(path.join(repoRoot, "assetsources/gbc/route/forest-source.png")));
const runtimeSheet = PNG.sync.read(readFileSync(path.join(stageDir, "forest.png")));
const stage = JSON.parse(readFileSync(path.join(stageDir, "route.stage.json"), "utf8")) as {
  cols: number;
  rows: number;
  layers: Array<{ data: Array<Array<string | null>> }>;
  collision: number[][];
  ascii: { legend: Record<string, string>; rows: string[] };
};

function blit(src: PNG, dst: PNG, sx: number, sy: number, w: number, h: number, dx: number, dy: number): void {
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const si = ((sy + y) * src.width + sx + x) * 4;
    const di = ((dy + y) * dst.width + dx + x) * 4;
    dst.data[di] = src.data[si];
    dst.data[di + 1] = src.data[si + 1];
    dst.data[di + 2] = src.data[si + 2];
    dst.data[di + 3] = src.data[si + 3];
  }
}

function tileIndex(ref: string): number {
  return Number(ref.split(":")[1]);
}

function writePng(name: string, png: PNG): void {
  writeFileSync(path.join(outDir, name), PNG.sync.write(png));
}

writePng("terrain-contact-source.png", sourceSheet);
writePng("terrain-contact-runtime.png", runtimeSheet);

const after = new PNG({ width: stage.cols * runtimeTs, height: stage.rows * runtimeTs });
after.data.fill(0);
const runtimeCols = runtimeSheet.width / runtimeTs;
for (const layer of stage.layers) {
  for (let r = 0; r < stage.rows; r += 1) for (let c = 0; c < stage.cols; c += 1) {
    const ref = layer.data[r][c];
    if (!ref) continue;
    const idx = tileIndex(ref);
    blit(runtimeSheet, after, (idx % runtimeCols) * runtimeTs, Math.floor(idx / runtimeCols) * runtimeTs, runtimeTs, runtimeTs, c * runtimeTs, r * runtimeTs);
  }
}
writePng("route-after-terrain-composite.png", after);

function tiledPreview(idx: number, tileSize: number, sheet: PNG): PNG {
  const cols = sheet.width / tileSize;
  const out = new PNG({ width: tileSize * 4, height: tileSize * 4 });
  out.data.fill(0);
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) {
    blit(sheet, out, (idx % cols) * tileSize, Math.floor(idx / cols) * tileSize, tileSize, tileSize, x * tileSize, y * tileSize);
  }
  return out;
}

const previewChars: Array<[string, string]> = [
  ["grass", "F"],
  ["road", "t"],
  ["water", "~"],
  ["edge-ford", "s"],
  ["blocker", "^"]
];
for (const [name, ch] of previewChars) {
  const idx = tileIndex(stage.ascii.legend[ch]);
  writePng(`preview-4x4-${name}-source.png`, tiledPreview(idx, sourceTs, sourceSheet));
  writePng(`preview-4x4-${name}-runtime.png`, tiledPreview(idx, runtimeTs, runtimeSheet));
}

const gray = new PNG({ width: runtimeTs * previewChars.length * 4, height: runtimeTs * 4 });
gray.data.fill(255);
for (let i = 0; i < previewChars.length; i += 1) {
  const idx = tileIndex(stage.ascii.legend[previewChars[i][1]]);
  const tile = tiledPreview(idx, runtimeTs, runtimeSheet);
  for (let y = 0; y < tile.height; y += 1) for (let x = 0; x < tile.width; x += 1) {
    const si = (y * tile.width + x) * 4;
    const lum = Math.round(tile.data[si] * 0.299 + tile.data[si + 1] * 0.587 + tile.data[si + 2] * 0.114);
    const di = (y * gray.width + i * tile.width + x) * 4;
    gray.data[di] = lum;
    gray.data[di + 1] = lum;
    gray.data[di + 2] = lum;
    gray.data[di + 3] = 255;
  }
}
writePng("grayscale-readability-sheet.png", gray);

const waypoints = [
  { label: "Waystone north gate arrival", x: 55, y: 70 },
  { label: "south trail approach", x: 55, y: 61 },
  { label: "south encounter clearing", x: 52, y: 53 },
  { label: "stream ford", x: 66, y: 34 },
  { label: "north encounter clearing", x: 58, y: 16 },
  { label: "Northwood south arrival", x: 55, y: 1 }
];
const trace = waypoints.map((point) => ({
  ...point,
  char: stage.ascii.rows[point.y]?.[point.x],
  blocked: Boolean(stage.collision[point.y]?.[point.x])
}));
writeFileSync(path.join(outDir, "route-traversal-trace.json"), JSON.stringify({ ok: trace.every((point) => !point.blocked), trace }, null, 2));
writeFileSync(
  path.join(outDir, "route-traversal-trace.md"),
  ["# Route Traversal Trace", "", ...trace.map((point) => `- ${point.label}: ${point.x},${point.y} char=${point.char} blocked=${point.blocked}`)].join("\n")
);

console.log(`Wrote route MVP proof artifacts to ${outDir}`);
