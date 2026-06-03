// Verification: reconstruct the GENERATED Waystone stage as the engine reads it
// (base+fringe "waystone:<idx>" refs blitted from the packed waystone.png, then
// objects[] as bottom-center y-sorted sprites) and write a preview PNG.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;
const dir = nodePath.join(repoRoot, "assetsources/asset-forge/exports/waystone");
const stage = JSON.parse(readFileSync(nodePath.join(dir, "waystone.stage.json"), "utf8"));
const sheet = PNG.sync.read(readFileSync(nodePath.join(dir, "waystone.png")));
const cols = sheet.width / ts;
const W = stage.cols * ts, H = stage.rows * ts;
const out = new PNG({ width: W, height: H });
out.data.fill(0);

function blitFromSheet(idx: number, dx: number, dy: number) {
  const sx = (idx % cols) * ts, sy = Math.floor(idx / cols) * ts;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const si = ((sy + y) * sheet.width + (sx + x)) * 4;
    const di = ((dy + y) * W + (dx + x)) * 4;
    if (sheet.data[si + 3] === 0) continue;
    out.data[di] = sheet.data[si]; out.data[di + 1] = sheet.data[si + 1]; out.data[di + 2] = sheet.data[si + 2]; out.data[di + 3] = 255;
  }
}
for (const layer of stage.layers as Array<{ data: Array<Array<string | null>> }>) {
  for (let r = 0; r < stage.rows; r++) for (let c = 0; c < stage.cols; c++) {
    const ref = layer.data[r][c]; if (!ref) continue;
    blitFromSheet(Number(ref.split(":")[1]), c * ts, r * ts);
  }
}
// objects (bottom-center, y-sorted) — sprite path resolved per-object `path` field
const sprites = new Map<string, PNG>();
const objs = [...(stage.objects ?? [])].sort((a: any, b: any) => a.y - b.y);
for (const o of objs as any[]) {
  if (!o.path || !existsSync(nodePath.join(repoRoot, o.path))) continue;
  if (!sprites.has(o.path)) sprites.set(o.path, PNG.sync.read(readFileSync(nodePath.join(repoRoot, o.path))));
  const p = sprites.get(o.path)!;
  const dw = Math.round(o.w), dh = Math.round(o.h);
  const dx0 = Math.round(o.x * ts - dw / 2), dy0 = Math.round(o.y * ts - dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sxp = Math.min(p.width - 1, Math.floor((x / dw) * p.width)), syp = Math.min(p.height - 1, Math.floor((y / dh) * p.height));
    const si = (syp * p.width + sxp) * 4; const a = p.data[si + 3]; if (a === 0) continue;
    const px = dx0 + x, py = dy0 + y; if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const di = (py * W + px) * 4; const sa = a / 255;
    out.data[di] = Math.round(p.data[si] * sa + out.data[di] * (1 - sa));
    out.data[di + 1] = Math.round(p.data[si + 1] * sa + out.data[di + 1] * (1 - sa));
    out.data[di + 2] = Math.round(p.data[si + 2] * sa + out.data[di + 2] * (1 - sa));
    out.data[di + 3] = 255;
  }
}
mkdirSync(nodePath.join(repoRoot, "artifacts"), { recursive: true });
const outPath = nodePath.join(repoRoot, "artifacts/waystone-from-stage.png");
writeFileSync(outPath, PNG.sync.write(out));
console.log(`preview -> ${outPath} (${W}x${H}); ${objs.length} objects, ${cols}-col tileset`);
