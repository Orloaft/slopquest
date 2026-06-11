// Bridge: AUTHORED Northwood layout -> in-game asset-forge stage.
// ---------------------------------------------------------------------------
// Reads the same inputs as the locked compositor (tools/render-northwood-trees.ts):
//   assetsources/mockup/layout-authored.txt  (72x110 char grid)
//   assetsources/mockup/elevation.txt         (per-cell tier 0..2)
// Re-runs the LOCKED autotile passes (water corner-Wang dual-grid, plateau-top
// edge autotile, road edge-Wang, beach, void, cliff faces, ladders, road-dither,
// contact-shadow AO) to bake a TILE canvas WITHOUT sprites, then:
//   1. slices the canvas into 32px cells,
//   2. dedupes identical cells into a packed `forest.png` tileset (exact-parity
//      water, since the dual-grid composite is captured per cell),
//   3. emits an asset-forge `northwood.stage.json` + `northwood.vocab.json` that
//      the EXISTING tools/import-asset-forge-stage.ts compiles into the in-game
//      NORTHWOOD_STAGE.
// Trees + props are emitted as engine objects[] (sprite keys), NOT baked pixels,
// so they depth-sort against the player at runtime (decision 2a).
//
// Differences from the offline preview, on purpose:
//   * Position-dependent noise (road dither / AO / beach) is made TILE-LOCAL so
//     identical tile configs dedupe to one tileset entry (stipple look preserved).
//   * Elevation-0 land cells get an interior-grass base fill (the preview left
//     them transparent; in-engine that would be see-through holes).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;

// ---- locked tunables (mirror render-northwood-trees.ts) --------------------
const TREE_TARGET_W_PX = 60;
const TREE_MIN_SPACING_CELLS = 2;
const ENVIRO_PROP_DENSITY_GATE = 0.16;
const PROP_MIN_SPACING_CELLS = 2;
const ROAD_DITHER_EDGE_PX = 3;
const ROAD_DITHER_PROB_BY_DEPTH = [0.2, 0.1, 0.04];
const CLIFF_AO_BAND_PX = 14;
const CLIFF_AO_MAX_DARKEN = 0.4;
const CLIFF_MAX_WALL_TILES = 4;

// ---- inputs ----------------------------------------------------------------
const authored = nodePath.join(repoRoot, "assetsources/mockup/layout-authored.txt");
const layoutPath = existsSync(authored) ? authored : nodePath.join(repoRoot, "assetsources/mockup/layout.txt");
const rows = readFileSync(layoutPath, "utf8").replace(/\n$/, "").split("\n").map((r) => r.split(""));
const R = rows.length, C = rows[0].length, W = C * ts, H = R * ts;
const elev = readFileSync(nodePath.join(repoRoot, "assetsources/mockup/elevation.txt"), "utf8")
  .replace(/\n$/, "").split("\n").map((l) => l.split("").map(Number));
const at = (r: number, c: number) => (r >= 0 && c >= 0 && r < R && c < C ? rows[r][c] : "^");
const eh = (r: number, c: number) => (r >= 0 && c >= 0 && r < R && c < C ? elev[r][c] : 0);
const topLvl = Math.max(...elev.flat());

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
// tuft re-materialed atlases (approved terrain style — docs/terrain-style-bible.md);
// regenerate with tools/rematerial-northwood-atlases.py
const water = sliced("water-wang-tuft.png");
const road = sliced("road-wang-tuft.png");
const ptop = sliced("plateau-top-v2-tuft.png");
const face = sliced("cliff-face.png");
const ladder = sliced("ladder.png");
const wCols = water.width / ts, rCols = road.width / ts, PTCOLS = ptop.width / ts, FCOLS = 5;

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
// tile-local deterministic hash so identical tile configs dedupe (stipple stays stable)
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
  else { kind[r][c] = eh(r, c) >= 1 ? "plateau" : "grass"; }
}

// ---- ground fill: interior grass on ALL land, 4 tuft variants by cell hash ---
// (variant fills break grid repetition — docs/terrain-style-bible.md "alive" §1)
const grassFills = [0, 1, 2, 3].map((i) =>
  PNG.sync.read(readFileSync(nodePath.join(repoRoot, `assetsources/curated/fills/northwood-grass-v${i}.png`))));
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const ch = at(r, c);
  if (ch === "~" || ch === "^" || ch === ".") continue;
  blitTile(grassFills[Math.floor(hrand(r, c) * grassFills.length)], 1, 0, c * ts, r * ts);
}

// ---- water corner-Wang dual-grid (exact-parity composite per cell) ---------
for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
  const m = (isW(i - 1, j - 1) ? 1 : 0) | (isW(i - 1, j) ? 2 : 0) | (isW(i, j) ? 4 : 0) | (isW(i, j - 1) ? 8 : 0);
  blitTile(water, wCols, m, Math.round((j - 0.5) * ts), Math.round((i - 0.5) * ts));
}

// ---- plateau-top edge autotile (per raised tier, higher tiers overlay) ------
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
// road edge dither (tile-local noise so it dedupes)
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

// ---- beach (tile-local noise) ----------------------------------------------
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

// ---- cliff faces (south-facing step-downs) ---------------------------------
const dropS = (r: number, c: number) => Math.max(0, eh(r, c) - eh(r + 1, c));
const noTree = new Set<string>();
const stairCand: boolean[][] = Array.from({ length: R }, () => new Array(C).fill(false));
const wallTotal: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));
const shadows: Array<{ c: number; baseY: number; s: number }> = [];
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const d = dropS(r, c);
  if (d <= 0) continue;
  const col = dropS(r, c - 1) <= 0 ? 0 : dropS(r, c + 1) <= 0 ? 2 : 1;
  const total = Math.min(CLIFF_MAX_WALL_TILES, 1 + d);
  wallTotal[r][c] = total;
  shadows.push({ c, baseY: (r + total + 1) * ts - 4, s: Math.min(1, d / 2) });
  for (let h = 0; h < total; h++) {
    const wr = r + 1 + h; if (wr >= R) break;
    const rowKind = h === 0 ? 0 : h === total - 1 ? 2 : 1;
    blitTile(face, FCOLS, rowKind * FCOLS + col, c * ts, wr * ts);
    noTree.add(`${wr},${c}`);
    if (kind[wr][c] !== "void" && kind[wr][c] !== "water") { kind[wr][c] = "wall"; blocked[wr][c] = true; }
  }
  if (at(r, c) === "t" || at(r - 1, c) === "t") stairCand[r][c] = true;
}
// ladders: collapse contiguous lip-touching runs into one ladder at the centre
let stairCount = 0;
for (let r = 0; r < R; r++) {
  let c = 0;
  while (c < C) {
    if (!stairCand[r][c]) { c++; continue; }
    const c0 = c; while (c < C && stairCand[r][c]) c++;
    const cc = Math.floor((c0 + c - 1) / 2);
    const total = wallTotal[r][cc] || 2;
    stairCount++;
    for (let h = 0; h < total; h++) {
      const wr = r + 1 + h; if (wr >= R) break;
      blitTile(ladder, 1, h === 0 ? 0 : h === total - 1 ? 2 : 1, cc * ts, wr * ts);
      if (kind[wr][cc] !== "void" && kind[wr][cc] !== "water") { kind[wr][cc] = "ladder"; blocked[wr][cc] = false; }
    }
    for (let dr = -1; dr <= total + 2; dr++) for (let dc = -1; dc <= 1; dc++) noTree.add(`${r + dr},${cc + dc}`);
  }
}
// contact shadow AO (tile-local noise)
const SH = CLIFF_AO_BAND_PX;
for (const sh of shadows) for (let dy = 0; dy < SH; dy++) for (let x = 0; x < ts; x++) {
  const px = sh.c * ts + x, py = sh.baseY + dy;
  if (px < 0 || py < 0 || px >= W || py >= H) continue;
  if (hrand(px % ts, py % ts) > (1 - dy / SH) * 0.92 + 0.06) continue;
  const di = (py * W + px) * 4; if (out.data[di + 3] === 0) continue;
  const fall = (1 - dy / SH) * CLIFF_AO_MAX_DARKEN * sh.s;
  out.data[di] = Math.round(out.data[di] * (1 - fall));
  out.data[di + 1] = Math.round(out.data[di + 1] * (1 - fall));
  out.data[di + 2] = Math.round(out.data[di + 2] * (1 - fall));
}

// ===========================================================================
// SLICE + DEDUPE -> tileset
// ===========================================================================
const cellTile: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));
const tileBuf: Buffer[] = [];      // packed RGBA, 32x32 each
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
// most-frequent walkable land tile = canonical interior grass (for overrides)
const freq = new Array(N).fill(0);
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!tileBlocked[cellTile[r][c]] && (tileKind[cellTile[r][c]] === "grass" || tileKind[cellTile[r][c]] === "plateau")) freq[cellTile[r][c]]++;
let grassTile = 0; for (let i = 1; i < N; i++) if (freq[i] > freq[grassTile]) grassTile = i;

// pack tileset PNG
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
// ---------------------------------------------------------------------------
// CRITICAL: the engine resolves MOVEMENT collision char-by-char via the hard-
// coded shared.ts isBlockedTile()/isRoadTile() on the ascii rows, NOT via the
// stage collision grid. So the ascii char must be a SEMANTIC char those functions
// understand. The exact per-cell VISUAL lives in a separate `fringe` layer ref
// (which is not char-constrained), drawn over a canonical `base` tile.
// ===========================================================================
const PORTAL = [
  { ch: "S", x: 55, y: 70, role: "portal-south", to: "Waystone" },
  { ch: "N", x: 55, y: 1, role: "portal-north", to: "Northwatch" },
  { ch: "M", x: 1, y: 36, role: "portal-marsh", to: "The Sunken Marsh" },
  { ch: "D", x: 108, y: 35, role: "portal-badlands", to: "The Searing Badlands" },
];
const REQUIRED_WALKABLE = [
  { x: 11, y: 59, label: "southwest ore approach" },
  { x: 99, y: 14, label: "northeast ore approach" },
  { x: 96, y: 56, label: "southeast ore approach" },
  { x: 61, y: 8, label: "coal seam approach" },
  { x: 66, y: 8, label: "iron seam approach" },
];
// semantic char per cell kind — chosen so shared.ts isBlockedTile/isRoadTile resolve
// correctly: '~' water (blocked), '^' void (blocked), 'q' cliff face (blocked+sight),
// 'm' stairs (walkable), 't' road, '.' beach, 'F' grass.
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
  ".": { role: "sand-shore", blocked: false, sightBlocked: false, road: false },
  "^": { role: "forest-border-canopy", blocked: true, sightBlocked: true, road: false },
  q: { role: "woodland-cliff-face", blocked: true, sightBlocked: true, road: false },
  m: { role: "mossy-stone-stairs", blocked: false, sightBlocked: false, road: false },
  // Tree trunk: a choppable woodcutting node lives here. Blocks movement + sight
  // like the old 'f' forest tile, but a DISTINCT char so the engine renders the
  // authored tree sprite (via the stage object) instead of spawning its own
  // spriteTree. The ground beneath stays forest-floor (the base-layer ref is
  // unchanged; only the semantic char flips), so collision is the only effect.
  y: { role: "tree-trunk", blocked: true, sightBlocked: true, road: false },
};

// canonical visual tile per semantic char = most common dedup tile of that kind
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

// cell char grid (start from kind, then apply overrides)
const cellChar: string[][] = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => KIND_CHAR[kind[r][c]]));
const portalAt = new Set<string>();
for (const p of PORTAL) { cellChar[p.y][p.x] = p.ch; cellTile[p.y][p.x] = grassTile; portalAt.add(`${p.y},${p.x}`); }
for (const w of REQUIRED_WALKABLE) {
  if (CHAR_VOCAB[cellChar[w.y][w.x]]?.blocked) { cellChar[w.y][w.x] = "F"; cellTile[w.y][w.x] = grassTile; }
}

// legend (semantic chars -> canonical ref; portals -> grass), vocab, layers, collision
const legend: Record<string, string> = {};
const vocab: Record<string, { role: string; blocked: boolean; sightBlocked: boolean; road: boolean; minimapColor: string }> = {};
for (const ch of Object.keys(CHAR_VOCAB)) {
  legend[ch] = `forest:${canonTile[ch]}`;
  vocab[ch] = { ...CHAR_VOCAB[ch], minimapColor: avgColor(tileBuf[canonTile[ch]]) };
}
for (const p of PORTAL) { legend[p.ch] = `forest:${grassTile}`; vocab[p.ch] = { role: p.role, blocked: false, sightBlocked: false, road: false, minimapColor: "#e7d37c" }; }

const ascii: string[] = [];
const collision: number[][] = [];
const base: Array<Array<string | null>> = [];   // canonical semantic tile (validator anchor + fallback)
const fringe: Array<Array<string | null>> = []; // exact per-cell visual, drawn on top
for (let r = 0; r < R; r++) {
  let line = ""; const col: number[] = [], baseRow: Array<string | null> = [], fringeRow: Array<string | null> = [];
  for (let c = 0; c < C; c++) {
    const ch = cellChar[r][c];
    line += ch;
    col.push(vocab[ch].blocked ? 1 : 0);
    baseRow.push(legend[ch]);
    const vis = `forest:${cellTile[r][c]}`;
    fringeRow.push(vis === legend[ch] ? null : vis); // skip redundant overlay
  }
  ascii.push(line); collision.push(col); base.push(baseRow); fringe.push(fringeRow);
}

// ===========================================================================
// OBJECTS: trees + props (sprite keys, depth-sorted at runtime)
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
// Reserve gameplay-anchor tiles (monster spawns, herb/mining/fishing nodes) so a
// choppable tree never lands on top of them and blocks the node/spawn. Trees only
// place on authored 'f' cells; some anchors sit on 'f', so without this they'd be
// walled off. Read the content YAML directly (same floor-3 coords the engine uses).
for (const rel of ["content/spawns.yaml", "content/herb-nodes.yaml", "content/mining-nodes.yaml", "content/fishing-nodes.yaml"]) {
  const txt = readFileSync(nodePath.join(repoRoot, rel), "utf8");
  // One list item per block; for floor-3 blocks reserve EVERY x/y pair (both the
  // node `at` and its `approach` standing tile, which has no floor field of its own).
  for (const block of txt.split(/^\s*-\s/m)) {
    if (!/floor:\s*3\b/.test(block)) continue;
    const re = /x:\s*([\d.]+),\s*y:\s*([\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) noTree.add(`${Math.floor(Number(m[2]))},${Math.floor(Number(m[1]))}`);
  }
}
// reproduce the locked PRNG sequence so positions match the approved preview
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
  // Tagged as a woodcutting resource: the engine drives this as a choppable tree
  // entity (using THIS authored sprite) rather than static decoration. `tx,ty` is
  // the trunk tile; the server materialises a tree node there and the client maps
  // the authored sprite back by tile.
  objects.push({ key: treeKey(t.id), x: cx / ts, y: baseY / ts, w: t.w, h: t.h, blocking: true, resource: { kind: "tree", tx: pl.c, ty: pl.r } });
}
// Flip each trunk tile's semantic char to 'y' (blocking + sight-blocking) so the
// engine's char-based collision walls the trunk. The base/fringe VISUAL layers
// keep their forest-floor ref, so only movement/sight change — the tree itself is
// the depth-sorted sprite entity. (Done after ascii/collision are built above.)
for (const pl of placed) {
  const line = ascii[pl.r];
  ascii[pl.r] = line.slice(0, pl.c) + "y" + line.slice(pl.c + 1);
  collision[pl.r][pl.c] = 1;
}
// props
const DECO_GROUPS = [
  { ids: [22, 24, 25, 70], w: 26 },
  { ids: [33, 34, 35, 49, 105, 107], w: 22 },
  { ids: [39, 53, 115], w: 40 },
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
const spriteIds = [...new Set([...TREE_IDS, ...DECO_GROUPS.flatMap((g) => g.ids)])];
// export cleaned sprite PNGs to public/ (strip residual purple drop-shadow halos,
// matching the compositor's defensive blitSprite filter) so the engine can preload them.
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
const exportDir = nodePath.join(repoRoot, "assetsources/asset-forge/exports/northwood");
mkdirSync(exportDir, { recursive: true });
writeFileSync(nodePath.join(exportDir, "forest.png"), PNG.sync.write(sheet));
writeFileSync(nodePath.join(exportDir, "forest.tileset.json"), JSON.stringify({ schema: "asset-forge/tileset@1", name: "forest", image: "forest.png", tileSize: ts, columns: PACK_COLS, rows: packRows, tiles: Array.from({ length: N }, (_, i) => ({ index: i, role: ROLE_BY_KIND[tileKind[i]], blocked: tileBlocked[i] })) }, null, 2));

const stage = {
  schema: "asset-forge/stage@1",
  name: "northwood",
  tileSize: ts,
  cols: C,
  rows: R,
  tilesets: [{ name: "forest", image: "forest.png", manifest: "forest.tileset.json" }],
  layers: [{ name: "base", type: "tile", data: base }, { name: "fringe", type: "tile", data: fringe }],
  collision,
  objects,
  ascii: { legend, rows: ascii },
};
writeFileSync(nodePath.join(exportDir, "northwood.stage.json"), JSON.stringify(stage));

// vocab merges generated per-tile chars + portals; carries portal/walkable contracts
const fullVocab = {
  zone: "northwood",
  floor: 3,
  stageName: "northwood",
  description: "Northwood authored-layout bridge: tiles derived from the locked compositor; trees/props are runtime sprite objects.",
  requiredPortals: Object.fromEntries(PORTAL.map((p) => [p.ch, { x: p.x, y: p.y, to: p.to }])),
  requiredWalkable: REQUIRED_WALKABLE,
  chars: { ...vocab },
};
writeFileSync(nodePath.join(repoRoot, "assetsources/asset-forge/northwood.vocab.json"), JSON.stringify(fullVocab, null, 2));

console.log(`stage -> ${C}x${R}; tileset ${N} tiles (${PACK_COLS}x${packRows}); ${objects.length} objects (${placements.length} trees + ${decoPl.length} props); ${stairCount} stairs; sprites: ${spriteIds.length}`);
console.log(`sprite ids to register: ${spriteIds.map((id) => treeKey(id)).join(", ")}`);
