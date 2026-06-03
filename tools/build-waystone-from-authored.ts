// Bridge: AUTHORED Waystone layout -> in-game asset-forge stage (TERRAIN pass).
// ---------------------------------------------------------------------------
// A trimmed sibling of build-northwood-from-authored.ts. Reuses the SAME locked
// autotile atlases (assetsources/curated/sliced/*) and passes, but:
//   * reads the Waystone authored grid (assetsources/waystone/*),
//   * is a FLAT town: uniform elevation => no cliff faces / ladders,
//   * emits NO procedural trees/props -- Waystone places bespoke structures as
//     explicit objects in a later placement pass (objects[] starts empty here).
// Output: assetsources/asset-forge/exports/waystone/{waystone.png,
//   waystone.tileset.json, waystone.stage.json} + assetsources/asset-forge/
//   waystone.vocab.json -- consumed by the existing import-asset-forge-stage.ts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;
const ROAD_DITHER_EDGE_PX = 3;
const ROAD_DITHER_PROB_BY_DEPTH = [0.2, 0.1, 0.04];

// ---- inputs ----------------------------------------------------------------
const layoutPath = nodePath.join(repoRoot, "assetsources/waystone/layout-authored.txt");
const rows = readFileSync(layoutPath, "utf8").replace(/\n$/, "").split("\n").map((r) => r.split(""));
const R = rows.length, C = rows[0].length, W = C * ts, H = R * ts;
const elev = readFileSync(nodePath.join(repoRoot, "assetsources/waystone/elevation.txt"), "utf8")
  .replace(/\n$/, "").split("\n").map((l) => l.split("").map(Number));
const at = (r: number, c: number) => (r >= 0 && c >= 0 && r < R && c < C ? rows[r][c] : "^");
const eh = (r: number, c: number) => (r >= 0 && c >= 0 && r < R && c < C ? elev[r][c] : 0);
const topLvl = Math.max(...elev.flat());

// ---- STRUCTURE PLACEMENT ----------------------------------------------------
// tx,ty = base-center TILE (sprite bottom-center plants there). dispW = display
// width px (height keeps native aspect). block=[w,h] tiles flips an ascii
// footprint to 'B' (blocked+sight) so collision walls the structure; the visual
// stays the depth-sorted sprite object. Reused sprites use their existing engine
// key (already preloaded from the named atlas); bespoke use a new key + file.
type Place = {
  key: string; tx: number; ty: number; dispW: number; nw: number; nh: number;
  block?: [number, number]; atlas?: string; sx?: number; sy?: number; file?: string;
};
const T = (key: string, atlas: string, sx: number, sy: number, sw: number, sh: number, tx: number, ty: number, dispW: number, block?: [number, number]): Place =>
  ({ key, atlas, sx, sy, nw: sw, nh: sh, tx, ty, dispW, block });
const B = (key: string, file: string, nw: number, nh: number, tx: number, ty: number, dispW: number, block?: [number, number]): Place =>
  ({ key, file, nw, nh, tx, ty, dispW, block });
const BESPOKE = "assetsources/curated/bespoke/fantasy-village-assets-v1";
const PLACEMENTS: Place[] = [
  // --- houses (top row + west manor) ---
  T("spriteRedHouse", "townTiles", 996, 22, 238, 176, 47, 9, 120, [3, 2]),
  T("spriteThatchHouse", "townTiles", 1294, 24, 130, 176, 58, 8, 92, [2, 2]),
  T("spriteGreenHouse", "townTiles", 1272, 374, 142, 178, 67, 9, 92, [2, 2]),
  T("spriteBlueHouse", "townTiles", 996, 374, 250, 180, 18, 18, 124, [3, 2]),
  // --- bespoke hero structures ---
  B("spriteWindmill", `${BESPOKE}/windmill.png`, 128, 224, 94, 10, 128, [3, 2]),
  B("spriteWatchtower", `${BESPOKE}/watchtower.png`, 96, 224, 104, 11, 90, [2, 2]),
  // --- town centre ---
  T("spriteWell", "townTiles", 824, 420, 94, 132, 56, 25, 56, [1, 1]),
  T("spriteMarket", "townTiles", 1208, 786, 188, 84, 64, 29, 120, [3, 1]),
  T("spriteSign", "townTiles", 616, 420, 74, 90, 50, 23, 38),
  T("spriteLamp", "townTiles", 912, 424, 38, 136, 52, 27, 30),
  T("spriteLamp", "townTiles", 912, 424, 38, 136, 72, 31, 30),
  T("spriteBarrels", "townTiles", 1200, 700, 90, 70, 44, 13, 52),
  // --- coast NW ---
  T("spriteBeachDock", "beachTiles", 642, 650, 168, 86, 8, 7, 120),
  T("spriteBeachBoat", "beachTiles", 560, 722, 74, 48, 4, 11, 52),
  // --- mine + SW camp ---
  T("spriteBeachCave", "beachTiles", 714, 840, 104, 102, 99, 32, 96, [3, 2]),
  B("spriteScarecrow", `${BESPOKE}/scarecrow.png`, 32, 64, 59, 41, 32),
  T("spriteBeachTent", "beachTiles", 1040, 866, 92, 70, 11, 55, 60, [2, 1]),
  T("spriteBeachCampfire", "beachTiles", 1160, 872, 72, 66, 8, 57, 44),
  // --- bridges over the river ---
  T("spriteBridge", "townTiles", 20, 466, 92, 56, 34, 25, 70),
  T("spriteBridge", "townTiles", 20, 466, 92, 56, 30, 58, 70),
  // --- livestock ---
  B("spriteCow", `${BESPOKE}/cow_left.png`, 64, 48, 86, 25, 56),
  B("spriteCow", `${BESPOKE}/cow_left.png`, 64, 48, 89, 26, 56),
  B("spriteGoose", `${BESPOKE}/goose_left.png`, 32, 32, 20, 45, 28),
  B("spriteGoose", `${BESPOKE}/goose_left.png`, 32, 32, 22, 46, 28),
  B("spriteGoose", `${BESPOKE}/goose_left.png`, 32, 32, 21, 47, 28),
  // --- scattered pines (engine spritePine from the northwood tree sheet) ---
  ...([[6, 17], [101, 21], [105, 42], [10, 65], [96, 47], [78, 14], [40, 52]] as const)
    .map(([x, y]) => T("spritePine", "northwoodTreeSheet", 455, 50, 220, 390, x, y, 56, [1, 1])),
];
// fence rings around the two animal pens (cow pen NE-centre, goose pen SW)
const fenceRing = (x0: number, y0: number, x1: number, y1: number): Place[] => {
  const out: Place[] = [];
  for (let x = x0; x <= x1; x += 2) { out.push(T("spriteFence", "graveyardTiles", 20, 552, 126, 66, x, y0, 64)); out.push(T("spriteFence", "graveyardTiles", 20, 552, 126, 66, x, y1, 64)); }
  for (let y = y0 + 2; y < y1; y += 2) { out.push(T("spriteFence", "graveyardTiles", 20, 552, 126, 66, x0, y, 64)); out.push(T("spriteFence", "graveyardTiles", 20, 552, 126, 66, x1, y, 64)); }
  return out;
};
PLACEMENTS.push(...fenceRing(83, 22, 92, 28));   // cow pen
PLACEMENTS.push(...fenceRing(17, 43, 25, 49));   // goose pen

// ---- CROP FIELD (tile-fill region, fenced central plot) ---------------------
const FIELD = { x0: 52, y0: 35, x1: 67, y1: 47 };
const CROP_FILES = {
  edge: `${BESPOKE}/field_edge.png`, soil: `${BESPOKE}/field_soil.png`,
  young: `${BESPOKE}/field_crop_young.png`, ripe: `${BESPOKE}/field_crop_ripe.png`,
  sun: `${BESPOKE}/field_sunflowers.png`,
};

// de-speckle water (identical to compositor)
const wn = (r: number, c: number) => at(r, c) === "~";
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (rows[r][c] !== "~") continue;
  const n = (wn(r - 1, c) ? 1 : 0) + (wn(r + 1, c) ? 1 : 0) + (wn(r, c - 1) ? 1 : 0) + (wn(r, c + 1) ? 1 : 0);
  if (n < 2) rows[r][c] = "F";
}
const isW = (r: number, c: number) => at(r, c) === "~";
const isR = (r: number, c: number) => at(r, c) === "t";

// ---- atlases ---------------------------------------------------------------
const sliced = (name: string) => PNG.sync.read(readFileSync(nodePath.join(repoRoot, `assetsources/curated/sliced/${name}`)));
const water = sliced("water-wang.png");
const road = sliced("road-wang.png");
const ptop = sliced("plateau-top-v2.png");
const wCols = water.width / ts, rCols = road.width / ts, PTCOLS = ptop.width / ts;

const out = new PNG({ width: W, height: H });
out.data.fill(0);
function blitTile(sheet: PNG, cols: number, idx: number, dx: number, dy: number) {
  const sx = (idx % cols) * ts, sy = Math.floor(idx / cols) * ts;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const px = dx + x, py = dy + y; if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const si = ((sy + y) * sheet.width + (sx + x)) * 4; if (sheet.data[si + 3] === 0) continue;
    const di = (py * W + px) * 4;
    out.data[di] = sheet.data[si]; out.data[di + 1] = sheet.data[si + 1]; out.data[di + 2] = sheet.data[si + 2]; out.data[di + 3] = 255;
  }
}
const hrand = (a: number, b: number) => {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h >>> 0) % 100000) / 100000;
};

// ---- per-cell semantics (drives collision + vocab) -------------------------
type Kind = "grass" | "plateau" | "water" | "road" | "beach" | "void";
const kind: Kind[][] = Array.from({ length: R }, () => new Array(C).fill("grass"));
const blocked: boolean[][] = Array.from({ length: R }, () => new Array(C).fill(false));
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const ch = at(r, c);
  if (ch === "~") { kind[r][c] = "water"; blocked[r][c] = true; }
  else if (ch === "^") { kind[r][c] = "void"; blocked[r][c] = true; }
  else if (ch === ".") { kind[r][c] = "beach"; }
  else if (ch === "t") { kind[r][c] = "road"; }
  else { kind[r][c] = eh(r, c) >= 1 ? "plateau" : "grass"; }
}

// ---- ground fill: interior grass on ALL land ------------------------------
const GRASS_IDX0 = 0;
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const ch = at(r, c);
  if (ch === "~" || ch === "^" || ch === ".") continue;
  blitTile(ptop, PTCOLS, GRASS_IDX0, c * ts, r * ts);
}

// ---- water corner-Wang dual-grid -------------------------------------------
for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
  const m = (isW(i - 1, j - 1) ? 1 : 0) | (isW(i - 1, j) ? 2 : 0) | (isW(i, j) ? 4 : 0) | (isW(i, j - 1) ? 8 : 0);
  blitTile(water, wCols, m, Math.round((j - 0.5) * ts), Math.round((i - 0.5) * ts));
}

// ---- plateau-top edge autotile (uniform tier => interior grass everywhere) --
const maskToIdx = [15, 13, 14, 7, 12, 10, 8, 4, 11, 6, 9, 3, 5, 2, 1, 0];
for (let L = 1; L <= topLvl; L++) {
  const up = (r: number, c: number) => eh(r, c) >= L;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (!up(r, c)) continue;
    const ch = at(r, c); if (ch === "~" || ch === "^" || ch === ".") continue;
    const mask = (up(r - 1, c) ? 1 : 0) | (up(r, c + 1) ? 2 : 0) | (up(r + 1, c) ? 4 : 0) | (up(r, c - 1) ? 8 : 0);
    blitTile(ptop, PTCOLS, maskToIdx[mask], c * ts, r * ts);
  }
}

// ---- roads edge-Wang -------------------------------------------------------
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (!isR(r, c)) continue;
  const m = (isR(r - 1, c) ? 1 : 0) | (isR(r, c + 1) ? 2 : 0) | (isR(r + 1, c) ? 4 : 0) | (isR(r, c - 1) ? 8 : 0);
  blitTile(road, rCols, m, c * ts, r * ts);
}
const isGrassCell = (r: number, c: number) => { const ch = at(r, c); return ch === "F" || ch === "f" || ch === "q"; };
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (!isR(r, c)) continue;
  const sides = [isGrassCell(r - 1, c) && "N", isGrassCell(r + 1, c) && "S", isGrassCell(r, c - 1) && "W", isGrassCell(r, c + 1) && "E"].filter(Boolean) as string[];
  for (const side of sides) for (let d = 0; d < ROAD_DITHER_EDGE_PX; d++) for (let t = 0; t < ts; t++) {
    let px: number, py: number, sx: number, sy: number;
    if (side === "N") { px = c * ts + t; py = r * ts + d; sx = px; sy = r * ts - 1 - d; }
    else if (side === "S") { px = c * ts + t; py = (r + 1) * ts - 1 - d; sx = px; sy = (r + 1) * ts + d; }
    else if (side === "W") { px = c * ts + d; py = r * ts + t; sx = c * ts - 1 - d; sy = py; }
    else { px = (c + 1) * ts - 1 - d; py = r * ts + t; sx = (c + 1) * ts + d; sy = py; }
    if (hrand(px % ts, py % ts) > ROAD_DITHER_PROB_BY_DEPTH[d]) continue;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const di = (py * W + px) * 4, si = (sy * W + sx) * 4; if (out.data[si + 3] === 0) continue;
    out.data[di] = out.data[si]; out.data[di + 1] = out.data[si + 1]; out.data[di + 2] = out.data[si + 2];
  }
}

// ---- beach -----------------------------------------------------------------
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (at(r, c) !== ".") continue;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const n = ((y * 73 + x * 31) % 17) - 8;
    const di = ((r * ts + y) * W + (c * ts + x)) * 4;
    out.data[di] = 222 + n; out.data[di + 1] = 200 + n; out.data[di + 2] = 150 + n; out.data[di + 3] = 255;
  }
}
// border void
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (at(r, c) !== "^") continue;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) { const di = ((r * ts + y) * W + (c * ts + x)) * 4; out.data[di] = 26; out.data[di + 1] = 42; out.data[di + 2] = 58; out.data[di + 3] = 255; }
}

// ===========================================================================
// SLICE + DEDUPE -> tileset
// ===========================================================================
const cellTile: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));
const tileBuf: Buffer[] = [];
const tileBlocked: boolean[] = [];
const tileKind: Kind[] = [];
const tileByKey = new Map<string, number>();
function cellKey(r: number, c: number): { key: string; buf: Buffer } {
  const buf = Buffer.alloc(ts * ts * 4);
  for (let y = 0; y < ts; y++) {
    const srcStart = ((r * ts + y) * W + c * ts) * 4;
    out.data.copy(buf, y * ts * 4, srcStart, srcStart + ts * 4);
  }
  return { key: buf.toString("latin1"), buf };
}
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const { key, buf } = cellKey(r, c);
  const fullKey = `${blocked[r][c] ? "1" : "0"}|${key}`;
  let idx = tileByKey.get(fullKey);
  if (idx === undefined) {
    idx = tileBuf.length;
    tileByKey.set(fullKey, idx);
    tileBuf.push(buf);
    tileBlocked.push(blocked[r][c]);
    tileKind.push(kind[r][c]);
  }
  cellTile[r][c] = idx;
}
// append the seamless crop tiles as extra tileset entries (referenced by the field fill)
const CROP_IDX: Record<string, number> = {};
for (const [name, file] of Object.entries(CROP_FILES)) {
  const p = PNG.sync.read(readFileSync(nodePath.join(repoRoot, file)));
  const buf = Buffer.alloc(ts * ts * 4);
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const si = ((Math.min(y, p.height - 1)) * p.width + Math.min(x, p.width - 1)) * 4;
    const di = (y * ts + x) * 4;
    buf[di] = p.data[si]; buf[di + 1] = p.data[si + 1]; buf[di + 2] = p.data[si + 2]; buf[di + 3] = p.data[si + 3];
  }
  CROP_IDX[name] = tileBuf.length;
  tileBuf.push(buf); tileBlocked.push(false); tileKind.push("grass");
}
const N = tileBuf.length;
const freq = new Array(N).fill(0);
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!tileBlocked[cellTile[r][c]] && (tileKind[cellTile[r][c]] === "grass" || tileKind[cellTile[r][c]] === "plateau")) freq[cellTile[r][c]]++;
let grassTile = 0; for (let i = 1; i < N; i++) if (freq[i] > freq[grassTile]) grassTile = i;

const PACK_COLS = 24;
const packRows = Math.ceil(N / PACK_COLS);
const sheet = new PNG({ width: PACK_COLS * ts, height: packRows * ts });
sheet.data.fill(0);
for (let i = 0; i < N; i++) {
  const tx = (i % PACK_COLS) * ts, ty = Math.floor(i / PACK_COLS) * ts;
  for (let y = 0; y < ts; y++) {
    const dst = ((ty + y) * sheet.width + tx) * 4;
    tileBuf[i].copy(sheet.data, dst, y * ts * 4, y * ts * 4 + ts * 4);
  }
}
function avgColor(buf: Buffer): string {
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < buf.length; p += 4) { if (buf[p + 3] === 0) continue; r += buf[p]; g += buf[p + 1]; b += buf[p + 2]; n++; }
  if (!n) return "#000000";
  const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

// ===========================================================================
// CHARS / LAYERS / VOCAB
// ===========================================================================
const KIND_CHAR: Record<Kind, string> = {
  grass: "F", plateau: "F", water: "~", road: "t", beach: ".", void: "^",
};
const ROLE_BY_KIND: Record<Kind, string> = {
  grass: "town-green", plateau: "town-green", water: "deep-water", road: "packed-road",
  beach: "sand-shore", void: "forest-border-canopy",
};
const CHAR_VOCAB: Record<string, { role: string; blocked: boolean; sightBlocked: boolean; road: boolean }> = {
  F: { role: "town-green", blocked: false, sightBlocked: false, road: false },
  "~": { role: "deep-water", blocked: true, sightBlocked: false, road: false },
  t: { role: "packed-road", blocked: false, sightBlocked: false, road: true },
  ".": { role: "sand-shore", blocked: false, sightBlocked: false, road: false },
  "^": { role: "forest-border-canopy", blocked: true, sightBlocked: true, road: false },
  B: { role: "building", blocked: true, sightBlocked: true, road: false },
};

const charTileFreq: Record<string, Map<number, number>> = {};
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const ch = KIND_CHAR[kind[r][c]];
  (charTileFreq[ch] ??= new Map()).set(cellTile[r][c], (charTileFreq[ch]?.get(cellTile[r][c]) ?? 0) + 1);
}
const canonTile: Record<string, number> = {};
for (const ch of Object.keys(CHAR_VOCAB)) {
  let best = grassTile, bestN = -1;
  for (const [idx, n] of charTileFreq[ch] ?? []) if (n > bestN) { best = idx; bestN = n; }
  canonTile[ch] = best;
}

const legend: Record<string, string> = {};
const vocab: Record<string, { role: string; blocked: boolean; sightBlocked: boolean; road: boolean; minimapColor: string }> = {};
for (const ch of Object.keys(CHAR_VOCAB)) {
  legend[ch] = `waystone:${canonTile[ch]}`;
  vocab[ch] = { ...CHAR_VOCAB[ch], minimapColor: avgColor(tileBuf[canonTile[ch]]) };
}

const ascii: string[] = [];
const collision: number[][] = [];
const base: Array<Array<string | null>> = [];
const fringe: Array<Array<string | null>> = [];
for (let r = 0; r < R; r++) {
  let line = ""; const col: number[] = [], baseRow: Array<string | null> = [], fringeRow: Array<string | null> = [];
  for (let c = 0; c < C; c++) {
    const ch = KIND_CHAR[kind[r][c]];
    line += ch;
    col.push(vocab[ch].blocked ? 1 : 0);
    baseRow.push(legend[ch]);
    const vis = `waystone:${cellTile[r][c]}`;
    fringeRow.push(vis === legend[ch] ? null : vis);
  }
  ascii.push(line); collision.push(col); base.push(baseRow); fringe.push(fringeRow);
}

// --- crop-field fill: overlay crop tiles on the fenced central plot ----------
for (let r = FIELD.y0; r <= FIELD.y1; r++) for (let c = FIELD.x0; c <= FIELD.x1; c++) {
  if (r < 0 || c < 0 || r >= R || c >= C) continue;
  if (at(r, c) === "~" || at(r, c) === "t") continue;            // keep water/road
  const border = r === FIELD.y0 || r === FIELD.y1 || c === FIELD.x0 || c === FIELD.x1;
  const sunZone = c >= FIELD.x1 - 4 && r <= FIELD.y0 + 5;           // sunflower block, NE corner
  const name = border ? "edge" : sunZone ? "sun" : (r % 2 === 0 ? "ripe" : "young"); // leafy green rows
  fringe[r][c] = `waystone:${CROP_IDX[name]}`;
}

// --- structure footprints: flip ascii -> 'B' (blocked) ----------------------
for (const p of PLACEMENTS) {
  if (!p.block) continue;
  const [bw, bh] = p.block;
  const c0 = p.tx - Math.floor((bw - 1) / 2);
  for (let dy = 0; dy < bh; dy++) for (let dx = 0; dx < bw; dx++) {
    const r = p.ty - dy, c = c0 + dx;
    if (r < 0 || c < 0 || r >= R || c >= C) continue;
    if (at(r, c) === "~") continue;                                // never wall water
    ascii[r] = ascii[r].slice(0, c) + "B" + ascii[r].slice(c + 1);
    collision[r][c] = 1;
  }
}
legend.B = `waystone:${grassTile}`;
vocab.B = { ...CHAR_VOCAB.B, minimapColor: avgColor(tileBuf[grassTile]) };

// --- objects: structures as bottom-center, y-sorted sprites -----------------
const objects = PLACEMENTS.map((p) => ({
  key: p.key,
  x: p.tx + 0.5,
  y: p.ty + 1,
  w: p.dispW,
  h: Math.round((p.dispW * p.nh) / p.nw),
  blocking: !!p.block,
  // preview-only source (engine ignores extra fields; it renders via `key`)
  src: p.file ? { file: p.file } : { atlas: p.atlas, sx: p.sx, sy: p.sy, sw: p.nw, sh: p.nh },
})).sort((a, b) => a.y - b.y);

// ===========================================================================
// WRITE OUTPUTS
// ===========================================================================
const exportDir = nodePath.join(repoRoot, "assetsources/asset-forge/exports/waystone");
mkdirSync(exportDir, { recursive: true });
writeFileSync(nodePath.join(exportDir, "waystone.png"), PNG.sync.write(sheet));
writeFileSync(nodePath.join(exportDir, "waystone.tileset.json"), JSON.stringify({ schema: "asset-forge/tileset@1", name: "waystone", image: "waystone.png", tileSize: ts, columns: PACK_COLS, rows: packRows, tiles: Array.from({ length: N }, (_, i) => ({ index: i, role: ROLE_BY_KIND[tileKind[i]], blocked: tileBlocked[i] })) }, null, 2));

const stage = {
  schema: "asset-forge/stage@1",
  name: "waystone",
  tileSize: ts,
  cols: C,
  rows: R,
  tilesets: [{ name: "waystone", image: "waystone.png", manifest: "waystone.tileset.json" }],
  layers: [{ name: "base", type: "tile", data: base }, { name: "fringe", type: "tile", data: fringe }],
  collision,
  objects,
  ascii: { legend, rows: ascii },
};
writeFileSync(nodePath.join(exportDir, "waystone.stage.json"), JSON.stringify(stage));

const fullVocab = {
  zone: "waystone",
  floor: 0,
  stageName: "waystone",
  description: "Waystone authored-layout bridge (terrain pass): flat town, tiles from the locked autotile atlases. Structures placed as objects in the placement pass.",
  requiredPortals: {},
  requiredWalkable: [],
  chars: { ...vocab },
};
writeFileSync(nodePath.join(repoRoot, "assetsources/asset-forge/waystone.vocab.json"), JSON.stringify(fullVocab, null, 2));

const counts = { water: 0, road: 0, grass: 0, beach: 0, void: 0 } as Record<string, number>;
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) counts[kind[r][c] === "plateau" ? "grass" : kind[r][c]]++;
console.log(`waystone stage -> ${C}x${R}; tileset ${N} tiles (${PACK_COLS}x${packRows}); ${objects.length} objects; cells:`, counts);
