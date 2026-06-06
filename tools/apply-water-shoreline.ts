// Reusable water-shoreline transition pass for "flat" stages (desert, …).
// ---------------------------------------------------------------------------
// Flat stages are built one-tile-per-char with no autotiling, so water bodies are
// blocky squares of a standalone water tile (which often has reeds/detail baked at a
// fixed edge, so it tiles wrong). This pass gives them clean Pokémon/CT shorelines by
// reusing the proven water corner-Wang DUAL-GRID (assetsources/curated/sliced/
// water-wang.png — 16 tiles keyed by which of the 4 cells around a grid VERTEX are
// water, blitted at a half-tile offset, exactly as build-northwood does).
//
// We derive a per-biome shoreline atlas by RECOLOURING water-wang to the stage's own
// materials: the grass region -> TRANSPARENT, the blue water -> the stage's clean water
// colour (cropped from the calm band of its water tile + a faint seamless ripple), the
// tan shore -> warm wet-sand.
//
// INTEGRATION — base + fringe, exactly like northwood: the stage's BASE layer is left
// UNTOUCHED (canonical material tile per cell, so it still passes the importer's
// canonical-ref validation and DRIVES COLLISION). We add a transparent FRINGE overlay
// layer holding the dual-grid water/shore pixels; the engine composites base+fringe. So
// collision / ascii / vocab / reachability are all unchanged — we only append fringe
// tiles to the atlas and add one layer. Run right after `assets:bridge:<stage>` and
// before `assets:stage:<stage>`.
//
//   node tools/apply-water-shoreline.ts --stage desert --water oasis-water --land sand
import { readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;
const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const stageName = arg("--stage");
const waterRole = arg("--water") ?? "oasis-water";
const landRole = arg("--land") ?? "sand";
if (!stageName) { console.error("usage: --stage <name> [--water <role>] [--land <role>]"); process.exit(1); }

const dir = nodePath.join(repoRoot, `assetsources/asset-forge/exports/${stageName}`);
const stage = JSON.parse(readFileSync(nodePath.join(dir, `${stageName}.stage.json`), "utf8"));
const tsManifest = JSON.parse(readFileSync(nodePath.join(dir, `${stageName}.tileset.json`), "utf8"));
const png = PNG.sync.read(readFileSync(nodePath.join(dir, `${stageName}.png`)));
const cols = png.width / ts;
const C = stage.cols, R = stage.rows;
const roleByIdx: Record<number, string> = {};
for (const t of tsManifest.tiles) roleByIdx[t.index] = t.role;
const blockedByIdx: Record<number, boolean> = {};
for (const t of tsManifest.tiles) blockedByIdx[t.index] = !!t.blocked;

const tilePx = (p: PNG, idx: number, x: number, y: number) => {
  const c = p.width / ts, sx = (idx % c) * ts, sy = Math.floor(idx / c) * ts;
  const i = ((sy + (y % ts)) * p.width + (sx + (x % ts))) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]] as const;
};

// --- per-cell water predicate from the base layer -------------------------------
const layer = stage.layers[0].data as Array<Array<string | null>>;
const cellIdxAt = (r: number, c: number): number | null => {
  const ref = layer[r]?.[c]; return ref ? Number(ref.split(":")[1]) : null;
};
const isWater = (r: number, c: number) => { const i = cellIdxAt(r, c); return i != null && roleByIdx[i] === waterRole; };

// --- find the water tile + its calm band ----------------------------------------
const waterTileIdx = tsManifest.tiles.find((t: any) => t.role === waterRole)?.index;
if (waterTileIdx == null) { console.error(`no tile with role '${waterRole}' in ${stageName}`); process.exit(1); }
// pick the calmest 8-row band of the water tile (low variance = no reeds) that also reads
// most "water" (high teal score = (g+b)/2 - r): avoids both the reed band and murky bands.
const bands: { y0: number; v: number; teal: number }[] = [];
for (let y0 = 0; y0 <= ts - 8; y0++) {
  let n = 0, sr = 0, sg = 0, sb = 0; const vals: number[][] = [];
  for (let y = y0; y < y0 + 8; y++) for (let x = 0; x < ts; x++) { const [r, g, b] = tilePx(png, waterTileIdx, x, y); sr += r; sg += g; sb += b; vals.push([r, g, b]); n++; }
  const m = [sr / n, sg / n, sb / n]; let v = 0; for (const [r, g, b] of vals) v += (r - m[0]) ** 2 + (g - m[1]) ** 2 + (b - m[2]) ** 2;
  bands.push({ y0, v: v / n, teal: (m[1] + m[2]) / 2 - m[0] });
}
const varMed = [...bands].sort((a, b) => a.v - b.v)[Math.floor(bands.length / 2)].v;
const bandY = bands.filter((b) => b.v <= varMed).sort((a, b) => b.teal - a.teal)[0].y0; // calm AND most water-like
let wr = 0, wg = 0, wb = 0, wn = 0;
for (let y = bandY; y < bandY + 8; y++) for (let x = 0; x < ts; x++) { const [r, g, b] = tilePx(png, waterTileIdx, x, y); wr += r; wg += g; wb += b; wn++; }
const baseWater = [wr / wn, wg / wn, wb / wn];
const waterPx = (x: number, y: number) => {
  // faint ripple; periods divide ts so it tiles seamlessly
  const k = Math.sin(x * 2 * Math.PI / 16 + y * 2 * Math.PI / 32) * 3 + Math.sin(y * 2 * Math.PI / 16) * 2;
  return [baseWater[0] + k, baseWater[1] + k * 1.1, baseWater[2] + k * 1.1].map((v) => Math.max(0, Math.min(255, Math.round(v))));
};

// --- recolour water-wang -> biome shoreline atlas (land = transparent) ----------
const ww = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "assetsources/curated/sliced/water-wang.png")));
const wCols = ww.width / ts;
const classify = (r: number, g: number, b: number) => (b > r + 18 && b > 90 ? "water" : g > r + 6 && g > b ? "land" : "shore");
const atlas = new PNG({ width: ww.width, height: ww.height });
atlas.data.fill(0);
for (let idx = 0; idx < 16; idx++) {
  const sx = (idx % wCols) * ts, sy = Math.floor(idx / wCols) * ts;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const si = ((sy + y) * ww.width + (sx + x)) * 4;
    const r = ww.data[si], g = ww.data[si + 1], b = ww.data[si + 2];
    const cls = classify(r, g, b);
    const di = ((sy + y) * atlas.width + (sx + x)) * 4;
    if (cls === "land") { atlas.data[di + 3] = 0; continue; } // transparent -> base shows through
    const col = cls === "water" ? waterPx(x, y)
      : [Math.min(255, r * 0.55 + 228 * 0.45), Math.min(255, g * 0.55 + 188 * 0.45), Math.min(255, b * 0.55 + 118 * 0.45)].map((v) => Math.round(v));
    atlas.data[di] = col[0]; atlas.data[di + 1] = col[1]; atlas.data[di + 2] = col[2]; atlas.data[di + 3] = 255;
  }
}

// --- composite ONLY the dual-grid overlay onto a transparent map (the fringe) ----
const overlay = new PNG({ width: C * ts, height: R * ts });
overlay.data.fill(0);
const blitOver = (src: PNG, idx: number, dx: number, dy: number) => {
  const c = src.width / ts, sx = (idx % c) * ts, sy = Math.floor(idx / c) * ts;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const px = dx + x, py = dy + y; if (px < 0 || py < 0 || px >= overlay.width || py >= overlay.height) continue;
    const si = ((sy + y) * src.width + (sx + x)) * 4; const a = src.data[si + 3]; if (a === 0) continue;
    const di = (py * overlay.width + px) * 4; const sa = a / 255, da = overlay.data[di + 3] / 255, oa = sa + da * (1 - sa);
    for (let k = 0; k < 3; k++) overlay.data[di + k] = oa ? Math.round((src.data[si + k] * sa + overlay.data[di + k] * da * (1 - sa)) / oa) : 0;
    overlay.data[di + 3] = Math.round(oa * 255);
  }
};
let overlaid = 0;
for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
  const m = (isWater(i - 1, j - 1) ? 1 : 0) | (isWater(i - 1, j) ? 2 : 0) | (isWater(i, j) ? 4 : 0) | (isWater(i, j - 1) ? 8 : 0);
  if (m === 0) continue;
  blitOver(atlas, m, Math.round((j - 0.5) * ts), Math.round((i - 0.5) * ts)); overlaid++;
}

// --- slice the overlay per cell -> dedupe into NEW fringe tiles (appended) --------
const baseTileCount: number = tsManifest.tiles.length; // keep base indices 0..N-1 intact
const fringeByKey = new Map<string, number>(); // key -> tileset index
const fringeTiles: Buffer[] = [];
const fringeLayer: Array<Array<string | null>> = [];
for (let r = 0; r < R; r++) {
  const row: Array<string | null> = [];
  for (let c = 0; c < C; c++) {
    const buf = Buffer.alloc(ts * ts * 4); let anyOpaque = false;
    for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
      const si = ((r * ts + y) * overlay.width + (c * ts + x)) * 4, di = (y * ts + x) * 4;
      buf[di] = overlay.data[si]; buf[di + 1] = overlay.data[si + 1]; buf[di + 2] = overlay.data[si + 2]; buf[di + 3] = overlay.data[si + 3];
      if (overlay.data[si + 3] > 0) anyOpaque = true;
    }
    if (!anyOpaque) { row.push(null); continue; } // no overlay here -> no fringe ref
    const key = buf.toString("latin1");
    let idx = fringeByKey.get(key);
    if (idx == null) { idx = baseTileCount + fringeTiles.length; fringeByKey.set(key, idx); fringeTiles.push(buf); }
    row.push(`${stageName}:${idx}`);
  }
  fringeLayer.push(row);
}

// --- repack atlas = base tiles (unchanged) + appended fringe tiles ---------------
const N = baseTileCount + fringeTiles.length, PACK = tsManifest.columns ?? 24, packRows = Math.ceil(N / PACK);
const outPng = new PNG({ width: PACK * ts, height: packRows * ts });
outPng.data.fill(0);
const copyTile = (srcData: Buffer | Uint8Array, srcW: number, sIdx: number, dIdx: number) => {
  const sCols = srcW / ts, sx = (sIdx % sCols) * ts, sy = Math.floor(sIdx / sCols) * ts;
  const dx = (dIdx % PACK) * ts, dy = Math.floor(dIdx / PACK) * ts;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const si = ((sy + y) * srcW + (sx + x)) * 4, di = ((dy + y) * outPng.width + (dx + x)) * 4;
    outPng.data[di] = srcData[si]; outPng.data[di + 1] = srcData[si + 1]; outPng.data[di + 2] = srcData[si + 2]; outPng.data[di + 3] = srcData[si + 3];
  }
};
for (let i = 0; i < baseTileCount; i++) copyTile(png.data, png.width, i, i);                 // base tiles verbatim
for (let i = 0; i < fringeTiles.length; i++) {                                                // fringe tiles appended
  const dIdx = baseTileCount + i, dx = (dIdx % PACK) * ts, dy = Math.floor(dIdx / PACK) * ts;
  for (let y = 0; y < ts; y++) fringeTiles[i].copy(outPng.data, ((dy + y) * outPng.width + dx) * 4, y * ts * 4, y * ts * 4 + ts * 4);
}
writeFileSync(nodePath.join(dir, `${stageName}.png`), PNG.sync.write(outPng));
tsManifest.rows = packRows; tsManifest.columns = PACK;
for (let i = 0; i < fringeTiles.length; i++) tsManifest.tiles.push({ index: baseTileCount + i, role: `${waterRole}-shore`, blocked: false });
writeFileSync(nodePath.join(dir, `${stageName}.tileset.json`), JSON.stringify(tsManifest, null, 2));
// base layer UNCHANGED; add fringe overlay layer
if (stage.layers.length > 1) stage.layers = [stage.layers[0]]; // drop any prior fringe (idempotent re-run)
stage.layers.push({ name: "fringe-water", type: "tile", data: fringeLayer });
writeFileSync(nodePath.join(dir, `${stageName}.stage.json`), JSON.stringify(stage));
console.log(`shoreline: ${stageName} — water band y=${bandY} (rgb ${baseWater.map((v) => v | 0).join(",")}); ${overlaid} dual-grid blits; +${fringeTiles.length} fringe tiles (base ${baseTileCount} untouched); base layer + collision unchanged.`);
