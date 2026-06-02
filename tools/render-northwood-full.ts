// Deterministic full-stage tile render for Northwood parity comparison.
// Composites the runtime atlas over the exported stage's tile layers into one PNG.
// No browser: pure pngjs. Objects/sprites (trees, lamps, etc.) render in-engine
// on top and are intentionally NOT drawn here — this is a TILE-LAYER yardstick.
//
// Usage: node tools/render-northwood-full.ts [--out artifacts/northwood-full-tiles.png] [--scale 1]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const args = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const outPath = nodePath.join(repoRoot, arg("--out", "artifacts/northwood-full-tiles.png"));
const scale = Math.max(1, Math.floor(Number(arg("--scale", "1"))));

const stagePath = nodePath.join(repoRoot, "assetsources/asset-forge/exports/northwood/northwood.stage.json");
const atlasPath = nodePath.join(repoRoot, "public/tilesets/northwood/forest.png");

interface Stage {
  tileSize: number;
  cols: number;
  rows: number;
  layers: Array<{ name: string; type: string; data: Array<Array<string | null>> }>;
}

const stage = JSON.parse(readFileSync(stagePath, "utf8")) as Stage;
const atlas = PNG.sync.read(readFileSync(atlasPath));
const ts = stage.tileSize;
const atlasCols = Math.max(1, Math.floor(atlas.width / ts));

const W = stage.cols * ts;
const H = stage.rows * ts;
const out = new PNG({ width: W, height: H });
// fill with a neutral magenta so any unpainted cell is obvious
for (let i = 0; i < out.data.length; i += 4) {
  out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 255; out.data[i + 3] = 255;
}

function blitTile(index: number, dx: number, dy: number): void {
  const sx = (index % atlasCols) * ts;
  const sy = Math.floor(index / atlasCols) * ts;
  for (let y = 0; y < ts; y++) {
    for (let x = 0; x < ts; x++) {
      const si = ((sy + y) * atlas.width + (sx + x)) * 4;
      const a = atlas.data[si + 3];
      if (a === 0) continue; // preserve underlying layer through transparency
      const di = ((dy + y) * W + (dx + x)) * 4;
      // simple source-over
      const sa = a / 255;
      out.data[di] = Math.round(atlas.data[si] * sa + out.data[di] * (1 - sa));
      out.data[di + 1] = Math.round(atlas.data[si + 1] * sa + out.data[di + 1] * (1 - sa));
      out.data[di + 2] = Math.round(atlas.data[si + 2] * sa + out.data[di + 2] * (1 - sa));
      out.data[di + 3] = 255;
    }
  }
}

let painted = 0;
for (const layer of stage.layers) {
  if (layer.type !== "tile") continue;
  for (let r = 0; r < layer.data.length; r++) {
    const row = layer.data[r];
    for (let c = 0; c < row.length; c++) {
      const ref = row[c];
      if (!ref) continue;
      const idx = Number(ref.split(":")[1]);
      if (!Number.isInteger(idx)) continue;
      blitTile(idx, c * ts, r * ts);
      painted++;
    }
  }
}

mkdirSync(nodePath.dirname(outPath), { recursive: true });

function emit(png: PNG, path: string): void {
  writeFileSync(path, PNG.sync.write(png));
}

if (scale > 1) {
  const sp = new PNG({ width: W * scale, height: H * scale });
  for (let y = 0; y < sp.height; y++) {
    for (let x = 0; x < sp.width; x++) {
      const si = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4;
      const di = (y * sp.width + x) * 4;
      sp.data[di] = out.data[si]; sp.data[di + 1] = out.data[si + 1];
      sp.data[di + 2] = out.data[si + 2]; sp.data[di + 3] = out.data[si + 3];
    }
  }
  emit(sp, outPath);
} else {
  emit(out, outPath);
}

console.log(`rendered ${stage.cols}x${stage.rows} stage (${stage.layers.length} layers, ${painted} tiles) -> ${outPath} @ ${W * scale}x${H * scale}`);
