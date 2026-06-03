// Verification: reconstruct the GENERATED Waystone stage as the engine reads it
// (base+fringe "waystone:<idx>" refs blitted from the packed waystone.png, then
// objects[] as bottom-center y-sorted sprites) and write a preview PNG.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;
// mirror of src/main.ts isMagentaKey() so the preview keys atlases exactly as the engine does
function isMagentaKey(r: number, g: number, b: number): boolean {
  if (r > 95 && b > 90 && g < 135 && Math.abs(r - b) < 95 && r > g * 1.35 && b > g * 1.25) return true;
  return g < 10 && r > 70 && b > 42 && r > b - 5 && r > g * 7 && b > g * 7;
}
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
// objects (bottom-center, y-sorted). `src` is preview metadata: a bespoke {file}
// or an atlas sub-rect {atlas,sx,sy,sw,sh} matching main.ts makeSpriteTexture.
const ATLAS_FILE: Record<string, string> = {
  townTiles: "public/towntiles.png", beachTiles: "public/beach-tiles.png",
  graveyardTiles: "public/graveyardtiles.png", northwoodTreeSheet: "public/northwood-trees-v1.png",
};
const atlases = new Map<string, PNG>();
const loadAtlas = (f: string) => { if (!atlases.has(f)) atlases.set(f, PNG.sync.read(readFileSync(nodePath.join(repoRoot, f)))); return atlases.get(f)!; };
const objs = [...(stage.objects ?? [])].sort((a: any, b: any) => a.y - b.y);
let drawn = 0;
for (const o of objs as any[]) {
  const s = o.src; if (!s) continue;
  let img: PNG, ox: number, oy: number, ow: number, oh: number;
  if (s.file) {
    if (!existsSync(nodePath.join(repoRoot, s.file))) continue;
    img = loadAtlas(s.file); ox = 0; oy = 0; ow = img.width; oh = img.height;
  } else {
    const f = ATLAS_FILE[s.atlas]; if (!f || !existsSync(nodePath.join(repoRoot, f))) continue;
    img = loadAtlas(f); ox = s.sx; oy = s.sy; ow = s.sw; oh = s.sh;
  }
  drawn++;
  const dw = Math.round(o.w), dh = Math.round(o.h);
  const dx0 = Math.round(o.x * ts - dw / 2), dy0 = Math.round(o.y * ts - dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sxp = ox + Math.min(ow - 1, Math.floor((x / dw) * ow)), syp = oy + Math.min(oh - 1, Math.floor((y / dh) * oh));
    const si = (syp * img.width + sxp) * 4; const a = img.data[si + 3]; if (a === 0) continue;
    const sr = img.data[si], sg = img.data[si + 1], sb = img.data[si + 2];
    if (isMagentaKey(sr, sg, sb)) continue;                        // mirror engine chroma-key
    const px = dx0 + x, py = dy0 + y; if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const di = (py * W + px) * 4; const sa = a / 255;
    out.data[di] = Math.round(img.data[si] * sa + out.data[di] * (1 - sa));
    out.data[di + 1] = Math.round(img.data[si + 1] * sa + out.data[di + 1] * (1 - sa));
    out.data[di + 2] = Math.round(img.data[si + 2] * sa + out.data[di + 2] * (1 - sa));
    out.data[di + 3] = 255;
  }
}
mkdirSync(nodePath.join(repoRoot, "artifacts"), { recursive: true });
const outPath = nodePath.join(repoRoot, "artifacts/waystone-from-stage.png");
writeFileSync(outPath, PNG.sync.write(out));
console.log(`preview -> ${outPath} (${W}x${H}); ${drawn}/${objs.length} objects drawn, ${cols}-col tileset`);
