// Bridge: PROCEDURAL "Waystone Trail" (Route 1) layout -> in-game asset-forge stage.
// ---------------------------------------------------------------------------
// A green meadow-and-woodland corridor connecting Waystone (floor 0) and
// Northwood (floor 3). Unlike the Northwood bridge (which reads an authored mockup
// grid), this generates its own flat 110x72 layout in code — a winding dirt trail
// through grass clearings, framed by a treeline, with a stream crossing — then runs
// the SAME locked autotile/bake passes against Northwood's curated forest atlases so
// the route reads as the same world. Output is an asset-forge route.stage.json +
// route.vocab.json the existing importer compiles into ROUTE_STAGE (floor 11).
//
// Design (see docs/pokemon-stage-direction.md "Route Template"): south gate from
// Waystone -> winding trail -> two encounter clearings -> stream ford -> an ancient
// oak landmark -> north gate to Northwood. Flat (elevation 0): no cliffs/ladders.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;

// ---- locked tunables (mirror build-northwood-from-authored.ts) -------------
const TREE_TARGET_W_PX = 60;
const TREE_MIN_SPACING_CELLS = 2;
const ENVIRO_PROP_DENSITY_GATE = 0.16;
const PROP_MIN_SPACING_CELLS = 2;
const ROAD_DITHER_EDGE_PX = 3;
const ROAD_DITHER_PROB_BY_DEPTH = [0.2, 0.1, 0.04];

// ===========================================================================
// PROCEDURAL ROUTE-1 LAYOUT (chars: F grass, f tree, ~ water, t trail, ^ void)
// ===========================================================================
const R = 72, C = 110;
const STREAM_Y0 = 33, STREAM_Y1 = 36;        // the stream band
const PORTAL_X = 55;                          // both gates sit on x=55
// Trail centre per row: a gentle double-sine S-curve, straightened at the gates.
function trailCenter(y: number): number {
  if (y <= 3) return PORTAL_X;
  if (y >= R - 3) return PORTAL_X;
  const raw = 55 + 14 * Math.sin(y / 11) + 5 * Math.sin(y / 4);
  return Math.max(12, Math.min(97, Math.round(raw)));
}
// deterministic PRNG so the bake is reproducible
let _seed = 20260606;
const rnd = (): number => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };

// Two encounter clearings (tree-free grass pockets) beside the trail, plus the
// landmark clearing. Kept open so spawns read as "tall grass" and the oak anchors.
const CLEARINGS: Array<{ cx: number; cy: number; r: number }> = [];
{
  const cy1 = 52, cy2 = 16, cyL = 24;
  CLEARINGS.push({ cx: trailCenter(cy1) + 7, cy: cy1, r: 6 });   // south clearing
  CLEARINGS.push({ cx: trailCenter(cy2) - 7, cy: cy2, r: 6 });   // north clearing
  CLEARINGS.push({ cx: trailCenter(cyL) + 9, cy: cyL, r: 4 });   // ancient-oak clearing
}
const inClearing = (r: number, c: number): boolean =>
  CLEARINGS.some((g) => Math.abs(r - g.cy) <= g.r && Math.abs(c - g.cx) <= g.r);

const rows: string[][] = Array.from({ length: R }, () => new Array(C).fill("F"));
const elev: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));

// 1) Outer void ring (1 tile) — the map border; the engine frames it as treeline.
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (r === 0 || r === R - 1 || c === 0 || c === C - 1) rows[r][c] = "^";
}
// 2) Treeline band hugging the edges, with gaps; leaves the trail columns open.
for (let r = 1; r < R - 1; r++) for (let c = 1; c < C - 1; c++) {
  const edgeDist = Math.min(r, R - 1 - r, c, C - 1 - c);
  if (edgeDist <= 3 && Math.abs(c - trailCenter(r)) > 3 && rnd() < 0.72) rows[r][c] = "f";
}
// 3) The winding trail — fill between consecutive row-centres so it's always
//    contiguous even where the curve is steep (width 3 + the connecting span).
for (let y = 1; y < R - 1; y++) {
  const a = trailCenter(y), b = trailCenter(y + 1 < R - 1 ? y + 1 : y);
  const lo = Math.min(a, b) - 1, hi = Math.max(a, b) + 1;
  for (let c = lo; c <= hi; c++) if (c > 0 && c < C - 1) rows[y][c] = "t";
}
// 4) Interior tree clusters to wind the path + frame the clearings (never on the
//    trail, its margin, or a clearing).
function clump(cy: number, cx: number, spread: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const r = cy + Math.round((rnd() - 0.5) * spread * 2);
    const c = cx + Math.round((rnd() - 0.5) * spread * 2);
    if (r < 2 || r > R - 3 || c < 2 || c > C - 3) continue;
    if (rows[r][c] !== "F") continue;
    if (Math.abs(c - trailCenter(r)) <= 3) continue;
    if (inClearing(r, c)) continue;
    rows[r][c] = "f";
  }
}
for (let k = 0; k < 26; k++) {
  const cy = 4 + Math.floor(rnd() * (R - 8));
  const side = rnd() < 0.5 ? -1 : 1;
  const cx = Math.max(6, Math.min(C - 7, trailCenter(cy) + side * (8 + Math.floor(rnd() * 16))));
  clump(cy, cx, 4, 10 + Math.floor(rnd() * 10));
}
// 5) Stream band with a trail ford (the trail cells stay 't' so the crossing reads
//    as a fordable narrowing; water blocks elsewhere).
for (let y = STREAM_Y0; y <= STREAM_Y1; y++) for (let c = 6; c < C - 6; c++) {
  if (Math.abs(c - trailCenter(y)) <= 2) continue;   // ford
  if (rows[y][c] === "^") continue;
  rows[y][c] = "~";
}
// 6) Re-stamp the trail on top so nothing above clipped it; clear trees off it.
for (let y = 1; y < R - 1; y++) {
  const a = trailCenter(y), b = trailCenter(y + 1 < R - 1 ? y + 1 : y);
  const lo = Math.min(a, b) - 1, hi = Math.max(a, b) + 1;
  for (let c = lo; c <= hi; c++) if (c > 0 && c < C - 1) rows[y][c] = "t";
}

const at = (r: number, c: number) => (r >= 0 && c >= 0 && r < R && c < C ? rows[r][c] : "^");
const eh = (_r: number, _c: number) => 0;
const topLvl = 0;

// de-speckle water (identical to compositor)
const wn = (r: number, c: number) => at(r, c) === "~";
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (rows[r][c] !== "~") continue;
  const n = (wn(r - 1, c) ? 1 : 0) + (wn(r + 1, c) ? 1 : 0) + (wn(r, c - 1) ? 1 : 0) + (wn(r, c + 1) ? 1 : 0);
  if (n < 2) rows[r][c] = "F";
}
const isW = (r: number, c: number) => at(r, c) === "~";
const isR = (r: number, c: number) => at(r, c) === "t";

// ---- atlases (shared with Northwood) ---------------------------------------
const sliced = (name: string) => PNG.sync.read(readFileSync(nodePath.join(repoRoot, `assetsources/curated/sliced/${name}`)));
const water = sliced("water-wang.png");
const road = sliced("road-wang.png");
const ptop = sliced("plateau-top-v2.png");
const wCols = water.width / ts, rCols = road.width / ts, PTCOLS = ptop.width / ts;

const W = C * ts, H = R * ts;
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
type Kind = "grass" | "plateau" | "water" | "road" | "beach" | "void" | "wall" | "ladder";
const kind: Kind[][] = Array.from({ length: R }, () => new Array(C).fill("grass"));
const blocked: boolean[][] = Array.from({ length: R }, () => new Array(C).fill(false));
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const ch = at(r, c);
  if (ch === "~") { kind[r][c] = "water"; blocked[r][c] = true; }
  else if (ch === "^") { kind[r][c] = "void"; blocked[r][c] = true; }
  else if (ch === ".") { kind[r][c] = "beach"; }
  else if (ch === "t") { kind[r][c] = "road"; }
  else { kind[r][c] = "grass"; }
}

// ---- ground fill: interior grass on ALL land -------------------------------
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
// ---- roads edge-Wang -------------------------------------------------------
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (!isR(r, c)) continue;
  const m = (isR(r - 1, c) ? 1 : 0) | (isR(r, c + 1) ? 2 : 0) | (isR(r + 1, c) ? 4 : 0) | (isR(r, c - 1) ? 8 : 0);
  blitTile(road, rCols, m, c * ts, r * ts);
}
const isGrassCell = (r: number, c: number) => { const ch = at(r, c); return ch === "F" || ch === "f"; };
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
// border void fill
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
const PORTAL = [
  { ch: "S", x: PORTAL_X, y: 70, role: "portal-south", to: "Waystone" },
  { ch: "N", x: PORTAL_X, y: 1, role: "portal-north", to: "Northwood" },
];
const REQUIRED_WALKABLE = [
  { x: PORTAL_X, y: 69, label: "south gate approach" },
  { x: PORTAL_X, y: 2, label: "north gate approach" },
  { x: trailCenter(STREAM_Y0) + 1, y: STREAM_Y0, label: "stream ford" },
];
const KIND_CHAR: Record<Kind, string> = {
  grass: "F", plateau: "F", water: "~", road: "t", beach: ".", void: "^", wall: "q", ladder: "m",
};
const ROLE_BY_KIND: Record<Kind, string> = {
  grass: "forest-floor", plateau: "plateau-top", water: "deep-water", road: "packed-road",
  beach: "sand-shore", void: "forest-border-canopy", wall: "woodland-cliff-face", ladder: "mossy-stone-stairs",
};
const CHAR_VOCAB: Record<string, { role: string; blocked: boolean; sightBlocked: boolean; road: boolean }> = {
  F: { role: "forest-floor", blocked: false, sightBlocked: false, road: false },
  "~": { role: "deep-water", blocked: true, sightBlocked: false, road: false },
  t: { role: "packed-road", blocked: false, sightBlocked: false, road: true },
  "^": { role: "forest-border-canopy", blocked: true, sightBlocked: true, road: false },
  y: { role: "tree-trunk", blocked: true, sightBlocked: true, road: false },
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

const cellChar: string[][] = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => KIND_CHAR[kind[r][c]]));
for (const p of PORTAL) { cellChar[p.y][p.x] = p.ch; cellTile[p.y][p.x] = grassTile; }
for (const w of REQUIRED_WALKABLE) {
  if (CHAR_VOCAB[cellChar[w.y][w.x]]?.blocked) { cellChar[w.y][w.x] = "F"; cellTile[w.y][w.x] = grassTile; }
}

const legend: Record<string, string> = {};
const vocab: Record<string, { role: string; blocked: boolean; sightBlocked: boolean; road: boolean; minimapColor: string }> = {};
for (const ch of Object.keys(CHAR_VOCAB)) {
  legend[ch] = `forest:${canonTile[ch]}`;
  vocab[ch] = { ...CHAR_VOCAB[ch], minimapColor: avgColor(tileBuf[canonTile[ch]]) };
}
for (const p of PORTAL) { legend[p.ch] = `forest:${grassTile}`; vocab[p.ch] = { role: p.role, blocked: false, sightBlocked: false, road: false, minimapColor: "#e7d37c" }; }

const ascii: string[] = [];
const collision: number[][] = [];
const base: Array<Array<string | null>> = [];
const fringe: Array<Array<string | null>> = [];
for (let r = 0; r < R; r++) {
  let line = ""; const col: number[] = [], baseRow: Array<string | null> = [], fringeRow: Array<string | null> = [];
  for (let c = 0; c < C; c++) {
    const ch = cellChar[r][c];
    line += ch;
    col.push(vocab[ch].blocked ? 1 : 0);
    baseRow.push(legend[ch]);
    const vis = `forest:${cellTile[r][c]}`;
    fringeRow.push(vis === legend[ch] ? null : vis);
  }
  ascii.push(line); collision.push(col); base.push(baseRow); fringe.push(fringeRow);
}

// ===========================================================================
// OBJECTS: trees + props + an ancient-oak landmark (depth-sorted sprites)
// ===========================================================================
const objDim = (id: number, targetW: number) => {
  const p = PNG.sync.read(readFileSync(nodePath.join(repoRoot, `assetsources/curated/objects/obj_${String(id).padStart(3, "0")}.png`)));
  const sc = targetW / p.width;
  return { w: Math.round(p.width * sc), h: Math.round(p.height * sc) };
};
const TREE_IDS = [7, 8, 84, 89, 6, 85, 90];
const treeKey = (id: number) => `spriteNw${String(id).padStart(3, "0")}`;
const treeDims = TREE_IDS.map((id) => ({ id, ...objDim(id, TREE_TARGET_W_PX) }));
type Obj = { key: string; x: number; y: number; w: number; h: number; blocking: boolean; resource?: { kind: string; tx: number; ty: number } };
const objects: Obj[] = [];
const noTree = new Set<string>();
// Reserve gameplay-anchor tiles (floor-11 spawns/herbs) so a choppable tree never
// lands on a node/spawn and walls it off.
for (const rel of ["content/spawns.yaml", "content/herb-nodes.yaml", "content/mining-nodes.yaml", "content/fishing-nodes.yaml"]) {
  if (!existsSync(nodePath.join(repoRoot, rel))) continue;
  const txt = readFileSync(nodePath.join(repoRoot, rel), "utf8");
  for (const block of txt.split(/^\s*-\s/m)) {
    if (!/floor:\s*11\b/.test(block)) continue;
    const re = /x:\s*([\d.]+),\s*y:\s*([\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) noTree.add(`${Math.floor(Number(m[2]))},${Math.floor(Number(m[1]))}`);
  }
}
let pseudo = 1234567;
const rand = () => { pseudo = (pseudo * 1103515245 + 12345) & 0x7fffffff; return pseudo / 0x7fffffff; };
const placed: Array<{ r: number; c: number }> = [];
const placements: Array<{ r: number; c: number; di: number }> = [];
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (at(r, c) !== "f") continue;
  if (noTree.has(`${r},${c}`)) continue;
  let ok = true;
  for (const p of placed) { if (Math.abs(p.r - r) < TREE_MIN_SPACING_CELLS && Math.abs(p.c - c) < TREE_MIN_SPACING_CELLS) { ok = false; break; } }
  if (!ok) continue;
  placed.push({ r, c });
  placements.push({ r, c, di: Math.floor(rand() * treeDims.length) });
}
placements.sort((a, b) => a.r - b.r);
for (const pl of placements) {
  const cx = pl.c * ts + ts / 2 + Math.round((rand() - 0.5) * 10);
  const baseY = pl.r * ts + ts;
  const t = treeDims[pl.di];
  objects.push({ key: treeKey(t.id), x: cx / ts, y: baseY / ts, w: t.w, h: t.h, blocking: true, resource: { kind: "tree", tx: pl.c, ty: pl.r } });
}
for (const pl of placed) {
  const line = ascii[pl.r];
  ascii[pl.r] = line.slice(0, pl.c) + "y" + line.slice(pl.c + 1);
  collision[pl.r][pl.c] = 1;
}
// props (non-blocking decorative shrubs/flowers on open grass)
const DECO_GROUPS = [
  { ids: [22, 24, 25, 70], w: 26 },
  { ids: [33, 34, 35, 49, 105, 107], w: 22 },
  { ids: [54, 97], w: 18 },
];
const decoDims = DECO_GROUPS.flatMap((g) => g.ids.map((id) => ({ id, ...objDim(id, g.w) })));
const treeCells = new Set(placed.map((p) => `${p.r},${p.c}`));
const decoPlaced: Array<{ r: number; c: number }> = [];
const decoPl: Array<{ r: number; c: number; di: number }> = [];
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (at(r, c) !== "F") continue;
  if (noTree.has(`${r},${c}`)) continue;
  if (rand() > ENVIRO_PROP_DENSITY_GATE) continue;
  let ok = true;
  for (const p of decoPlaced) if (Math.abs(p.r - r) < PROP_MIN_SPACING_CELLS && Math.abs(p.c - c) < PROP_MIN_SPACING_CELLS) { ok = false; break; }
  if (ok) for (let dr = -1; dr <= 1 && ok; dr++) for (let dc = -1; dc <= 1; dc++) if (treeCells.has(`${r + dr},${c + dc}`)) { ok = false; break; }
  if (!ok) continue;
  decoPlaced.push({ r, c });
  decoPl.push({ r, c, di: Math.floor(rand() * decoDims.length) });
}
decoPl.sort((a, b) => a.r - b.r);
for (const pl of decoPl) {
  const cx = pl.c * ts + ts / 2 + Math.round((rand() - 0.5) * 12);
  const baseY = pl.r * ts + ts - 2 + Math.round((rand() - 0.5) * 6);
  const t = decoDims[pl.di];
  objects.push({ key: treeKey(t.id), x: cx / ts, y: baseY / ts, w: t.w, h: t.h, blocking: false });
}
// Hero landmark: an oversized ancient oak in its own clearing, off the trail.
{
  const g = CLEARINGS[2];
  const oak = objDim(7, 132);   // ~2.2x a normal tree
  objects.push({ key: treeKey(7), x: g.cx + 0.5, y: g.cy + 1, w: oak.w, h: oak.h, blocking: true, resource: { kind: "tree", tx: g.cx, ty: g.cy } });
  // wall the trunk tile + reserve so nothing else lands on the landmark
  ascii[g.cy] = ascii[g.cy].slice(0, g.cx) + "y" + ascii[g.cy].slice(g.cx + 1);
  collision[g.cy][g.cx] = 1;
}

const spriteIds = [...new Set([...TREE_IDS, ...DECO_GROUPS.flatMap((g) => g.ids)])];
const spriteOutDir = nodePath.join(repoRoot, "public/sprites/nw");
mkdirSync(spriteOutDir, { recursive: true });
for (const id of spriteIds) {
  const p = PNG.sync.read(readFileSync(nodePath.join(repoRoot, `assetsources/curated/objects/obj_${String(id).padStart(3, "0")}.png`)));
  for (let q = 0; q < p.data.length; q += 4) {
    const sr = p.data[q], sg = p.data[q + 1], sb = p.data[q + 2];
    if (sr > 55 && sb > 55 && sg < Math.min(sr, sb) - 18) p.data[q + 3] = 0;
  }
  writeFileSync(nodePath.join(spriteOutDir, `obj_${String(id).padStart(3, "0")}.png`), PNG.sync.write(p));
}

// ===========================================================================
// WRITE OUTPUTS
// ===========================================================================
const exportDir = nodePath.join(repoRoot, "assetsources/asset-forge/exports/route");
mkdirSync(exportDir, { recursive: true });
writeFileSync(nodePath.join(exportDir, "forest.png"), PNG.sync.write(sheet));
writeFileSync(nodePath.join(exportDir, "forest.tileset.json"), JSON.stringify({ schema: "asset-forge/tileset@1", name: "forest", image: "forest.png", tileSize: ts, columns: PACK_COLS, rows: packRows, tiles: Array.from({ length: N }, (_, i) => ({ index: i, role: ROLE_BY_KIND[tileKind[i]], blocked: tileBlocked[i] })) }, null, 2));

const stage = {
  schema: "asset-forge/stage@1",
  name: "route",
  tileSize: ts,
  cols: C,
  rows: R,
  tilesets: [{ name: "forest", image: "forest.png", manifest: "forest.tileset.json" }],
  layers: [{ name: "base", type: "tile", data: base }, { name: "fringe", type: "tile", data: fringe }],
  collision,
  objects,
  ascii: { legend, rows: ascii },
};
writeFileSync(nodePath.join(exportDir, "route.stage.json"), JSON.stringify(stage));

const fullVocab = {
  zone: "route",
  floor: 11,
  stageName: "route",
  description: "The Waystone Trail (Route 1): a procedurally-laid green corridor between Waystone and Northwood; trees/props are runtime sprite objects.",
  requiredPortals: Object.fromEntries(PORTAL.map((p) => [p.ch, { x: p.x, y: p.y, to: p.to }])),
  requiredWalkable: REQUIRED_WALKABLE,
  chars: { ...vocab },
};
writeFileSync(nodePath.join(repoRoot, "assetsources/asset-forge/route.vocab.json"), JSON.stringify(fullVocab, null, 2));

console.log(`route stage -> ${C}x${R}; tileset ${N} tiles (${PACK_COLS}x${packRows}); ${objects.length} objects (${placements.length} trees + ${decoPl.length} props + 1 landmark)`);
