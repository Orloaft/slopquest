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

// ---- locked tunables --------------------------------------------------------
const TREE_TARGET_W_PX = 60;
const TREE_MIN_SPACING_CELLS = 2;
const sourceTs = 16;
const runtimeScale = ts / sourceTs;

// ===========================================================================
// PROCEDURAL ROUTE-1 LAYOUT (chars: F grass, f tree, ~ water, t trail, ^ void)
// ===========================================================================
const R = 72, C = 110;
const PORTAL_X = 55;                          // both gates sit on x=55
const FORD_X = 66;                            // the trail crosses the stream here

// --- Rectilinear winding trail -------------------------------------------------
// A proper Pokémon/Chrono-Trigger route reads as a deliberate 1-tile dirt path:
// long straight runs joined by single 90° bends. We define waypoints (south gate
// -> north gate) and connect consecutive ones with AXIS-ALIGNED, 1-wide segments.
// The Road edge-Wang autotiler then emits clean straights + exactly one corner
// tile per bend — NOT the wide diagonal staircase of corner tiles that a
// continuous sine curve + fill-between-row-centres produced before.
const TRAIL: Array<[number, number]> = [
  [PORTAL_X, 70], [PORTAL_X, 61], [40, 61], [40, 44], [FORD_X, 44],
  [FORD_X, 28], [48, 28], [48, 12], [PORTAL_X, 12], [PORTAL_X, 1],
];

// deterministic PRNG so the bake is reproducible
let _seed = 20260606;
const rnd = (): number => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };

// Two encounter clearings (tree-free grass pockets) sized to cover the floor-11
// spawn/herb anchors, plus the ancient-oak landmark clearing. Kept open so spawns
// read as "tall grass" beside the trail and the oak anchors a vista.
const CLEARINGS: Array<{ cx: number; cy: number; r: number }> = [
  { cx: 52, cy: 53, r: 7 },   // south clearing  (spawns x47-59 y49-56; herb 47.5,50.5)
  { cx: 58, cy: 16, r: 6 },   // north clearing  (spawns x56-61 y13-18; herb 60.5,15.5)
  { cx: 84, cy: 52, r: 4 },   // ancient-oak landmark clearing
];
const inClearing = (r: number, c: number): boolean =>
  CLEARINGS.some((g) => Math.abs(r - g.cy) <= g.r && Math.abs(c - g.cx) <= g.r);

const rows: string[][] = Array.from({ length: R }, () => new Array(C).fill("F"));
const elev: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));

// Paint the 1-wide rectilinear trail into the grid (each segment is purely
// vertical OR purely horizontal, so the autotiler stays clean).
function paintTrail(): void {
  for (let i = 0; i + 1 < TRAIL.length; i++) {
    const [x0, y0] = TRAIL[i], [x1, y1] = TRAIL[i + 1];
    if (x0 === x1) { const lo = Math.min(y0, y1), hi = Math.max(y0, y1); for (let y = lo; y <= hi; y++) if (y > 0 && y < R - 1) rows[y][x0] = "t"; }
    else { const lo = Math.min(x0, x1), hi = Math.max(x0, x1); for (let x = lo; x <= hi; x++) if (x > 0 && x < C - 1) rows[y0][x] = "t"; }
  }
}
// Nearest-trail test (Chebyshev radius) — used to frame trees against the path
// and to leave the treeline open where the trail exits at the gates.
const isRoadCell = (r: number, c: number) => r >= 0 && c >= 0 && r < R && c < C && rows[r][c] === "t";
function nearTrail(r: number, c: number, d: number): boolean {
  for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) if (isRoadCell(r + dr, c + dc)) return true;
  return false;
}

// 1) Outer void ring (1 tile) — the map border; the engine frames it as treeline.
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (r === 0 || r === R - 1 || c === 0 || c === C - 1) rows[r][c] = "^";
}
// 2) The trail itself (paint first so the framing passes can avoid it).
paintTrail();
// 3) Treeline band hugging the edges, with gaps; opens where the trail exits.
for (let r = 1; r < R - 1; r++) for (let c = 1; c < C - 1; c++) {
  const edgeDist = Math.min(r, R - 1 - r, c, C - 1 - c);
  if (edgeDist <= 3 && !nearTrail(r, c, 3) && rnd() < 0.72) rows[r][c] = "f";
}
// 4) Interior tree clusters to frame the path + clearings (never on the trail,
//    its margin, or a clearing). Clumps land anywhere on open grass; skipping the
//    trail margin makes them naturally hug and wind around the path.
function clump(cy: number, cx: number, spread: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const r = cy + Math.round((rnd() - 0.5) * spread * 2);
    const c = cx + Math.round((rnd() - 0.5) * spread * 2);
    if (r < 2 || r > R - 3 || c < 2 || c > C - 3) continue;
    if (rows[r][c] !== "F") continue;
    if (nearTrail(r, c, 2)) continue;
    if (inClearing(r, c)) continue;
    rows[r][c] = "f";
  }
}
for (let k = 0; k < 30; k++) {
  const cy = 4 + Math.floor(rnd() * (R - 8));
  const cx = 6 + Math.floor(rnd() * (C - 12));
  clump(cy, cx, 4, 10 + Math.floor(rnd() * 10));
}
// 5) Meandering stream (organic centreline + varying width). The trail keeps its
//    1-wide ford; the water autotiles a finished shore around it.
for (let c = 6; c < C - 6; c++) {
  const cy = 34.5 + 1.6 * Math.sin(c / 9) + 0.9 * Math.sin(c / 4 + 1.3);
  const hw = 1.0 + 0.9 * (0.5 + 0.5 * Math.sin(c / 6 + 0.5));
  const y0 = Math.round(cy - hw), y1 = Math.round(cy + hw);
  for (let y = y0; y <= y1; y++) {
    if (y < 1 || y >= R - 1) continue;
    if (rows[y][c] === "t" || rows[y][c] === "^") continue;
    rows[y][c] = "~";
  }
}
// 6) Re-stamp the trail so nothing above clipped it.
paintTrail();
// 7) WALKABLE SHALLOWS flanking the 1-wide ford. The player's collision box tests
//    its four corners (canStand, ±0.28 tiles), so a 1-wide road between two water
//    bodies is impassable — the box corners land on blocking water. The fix is to
//    make the water EDGE walkable: cells touching the ford become 's' (shallows),
//    which still RENDER as water (base-layer ref) but are not in isBlockedTile, so
//    the player can wade the crossing. Road stays a single dirt tile wide.
for (let y = 1; y < R - 1; y++) for (let c = 1; c < C - 1; c++) {
  if (rows[y][c] !== "~") continue;
  const touchesFord = (rows[y - 1]?.[c] === "t") || (rows[y + 1]?.[c] === "t") || (rows[y][c - 1] === "t") || (rows[y][c + 1] === "t");
  if (touchesFord) rows[y][c] = "s";
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
// 's' (walkable shallows) renders as water, so the water autotiler treats it as water.
const isW = (r: number, c: number) => at(r, c) === "~" || at(r, c) === "s";
const isR = (r: number, c: number) => at(r, c) === "t";

const W = C * ts, H = R * ts;
const out = new PNG({ width: W, height: H });
out.data.fill(0);
const sourceW = C * sourceTs, sourceH = R * sourceTs;
const sourceOut = new PNG({ width: sourceW, height: sourceH });
sourceOut.data.fill(0);
const hrand = (a: number, b: number) => {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h >>> 0) % 100000) / 100000;
};

type Rgb = [number, number, number];
const GBC = {
  grassDark: [67, 108, 42] as Rgb,
  grassMid: [99, 149, 58] as Rgb,
  grassLight: [139, 184, 77] as Rgb,
  roadDark: [125, 91, 48] as Rgb,
  roadMid: [173, 127, 65] as Rgb,
  roadLight: [210, 171, 94] as Rgb,
  waterDark: [28, 80, 118] as Rgb,
  waterMid: [42, 130, 151] as Rgb,
  waterLight: [110, 181, 174] as Rgb,
  shore: [91, 116, 65] as Rgb,
  canopyDark: [29, 57, 43] as Rgb,
  canopyMid: [45, 87, 52] as Rgb,
  canopyLight: [73, 118, 62] as Rgb,
};
const setSourcePixel = (px: number, py: number, rgb: Rgb) => {
  if (px < 0 || py < 0 || px >= sourceW || py >= sourceH) return;
  const di = (py * sourceW + px) * 4;
  sourceOut.data[di] = rgb[0];
  sourceOut.data[di + 1] = rgb[1];
  sourceOut.data[di + 2] = rgb[2];
  sourceOut.data[di + 3] = 255;
};
const drawSourceCell = (r: number, c: number, fn: (x: number, y: number) => Rgb) => {
  const ox = c * sourceTs, oy = r * sourceTs;
  for (let y = 0; y < sourceTs; y++) for (let x = 0; x < sourceTs; x++) setSourcePixel(ox + x, oy + y, fn(x, y));
};
const drawGrassCell = (r: number, c: number, treeReserve = false) => {
  const variant = Math.floor(hrand(c, r) * 4);
  drawSourceCell(r, c, (x, y) => {
    const h = hrand(variant * 31 + x, variant * 37 + y);
    if (treeReserve && ((x + y + variant) % 5 === 0)) return GBC.grassDark;
    if (((x * 3 + y * 5 + variant) % 17 === 0) || h > 0.965) return GBC.grassLight;
    if (((x + y * 2 + variant) % 11 === 0) || h < 0.08) return GBC.grassDark;
    return GBC.grassMid;
  });
};
const drawRoadCell = (r: number, c: number) => {
  const mask = (isR(r - 1, c) ? 1 : 0) | (isR(r, c + 1) ? 2 : 0) | (isR(r + 1, c) ? 4 : 0) | (isR(r, c - 1) ? 8 : 0);
  const ox = c * sourceTs, oy = r * sourceTs;
  for (let y = 0; y < sourceTs; y++) for (let x = 0; x < sourceTs; x++) {
    const inVertical = x >= 5 && x <= 10 && (y >= 5 || (mask & 1)) && (y <= 10 || (mask & 4));
    const inHorizontal = y >= 5 && y <= 10 && (x >= 5 || (mask & 8)) && (x <= 10 || (mask & 2));
    const inCenter = x >= 5 && x <= 10 && y >= 5 && y <= 10;
    if (!(inVertical || inHorizontal || inCenter)) continue;
    const edge = x === 5 || x === 10 || y === 5 || y === 10;
    const pebble = (x * 7 + y * 3 + mask) % 19 === 0;
    setSourcePixel(ox + x, oy + y, edge ? GBC.roadDark : pebble ? GBC.roadLight : GBC.roadMid);
  }
};
const drawWaterCell = (r: number, c: number) => {
  const landN = !isW(r - 1, c), landS = !isW(r + 1, c), landW = !isW(r, c - 1), landE = !isW(r, c + 1);
  drawSourceCell(r, c, (x, y) => {
    if ((landN && y <= 1) || (landS && y >= 14) || (landW && x <= 1) || (landE && x >= 14)) return GBC.shore;
    const edgeMask = (landN ? 1 : 0) | (landE ? 2 : 0) | (landS ? 4 : 0) | (landW ? 8 : 0);
    const wave = ((x + y * 2 + edgeMask) % 13 === 0) || ((x * 2 + y + edgeMask) % 17 === 0);
    const dark = ((x + edgeMask) % 7 === 0 && (y + edgeMask) % 3 === 0);
    return wave ? GBC.waterLight : dark ? GBC.waterDark : GBC.waterMid;
  });
};
const drawBlockerCell = (r: number, c: number) => {
  drawSourceCell(r, c, (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return GBC.canopyDark;
    if (((x - 4) ** 2 + (y - 5) ** 2 < 12) || ((x - 11) ** 2 + (y - 10) ** 2 < 10)) return GBC.canopyLight;
    if ((x + y) % 5 === 0) return GBC.canopyDark;
    return GBC.canopyMid;
  });
};
const scaleSourceToRuntime = () => {
  for (let sy = 0; sy < sourceH; sy++) for (let sx = 0; sx < sourceW; sx++) {
    const si = (sy * sourceW + sx) * 4;
    for (let yy = 0; yy < runtimeScale; yy++) for (let xx = 0; xx < runtimeScale; xx++) {
      const dx = sx * runtimeScale + xx, dy = sy * runtimeScale + yy;
      const di = (dy * W + dx) * 4;
      out.data[di] = sourceOut.data[si];
      out.data[di + 1] = sourceOut.data[si + 1];
      out.data[di + 2] = sourceOut.data[si + 2];
      out.data[di + 3] = sourceOut.data[si + 3];
    }
  }
};

// ---- per-cell semantics (drives collision + vocab) -------------------------
type Kind = "grass" | "plateau" | "water" | "road" | "beach" | "void" | "wall" | "ladder";
const kind: Kind[][] = Array.from({ length: R }, () => new Array(C).fill("grass"));
const blocked: boolean[][] = Array.from({ length: R }, () => new Array(C).fill(false));
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const ch = at(r, c);
  if (ch === "~") { kind[r][c] = "water"; blocked[r][c] = true; }
  else if (ch === "s") { kind[r][c] = "water"; blocked[r][c] = false; } // walkable shallows
  else if (ch === "^") { kind[r][c] = "void"; blocked[r][c] = true; }
  else if (ch === ".") { kind[r][c] = "beach"; }
  else if (ch === "t") { kind[r][c] = "road"; }
  else { kind[r][c] = "grass"; }
}

// ---- original GBC terrain source, authored at 16px then scaled 2x ----------
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const ch = at(r, c);
  if (ch === "^") drawBlockerCell(r, c);
  else if (ch === "~" || ch === "s") drawWaterCell(r, c);
  else if (ch === "t") drawSourceCell(r, c, () => GBC.grassMid);
  else drawGrassCell(r, c, ch === "f");
}
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (isR(r, c)) drawRoadCell(r, c);
}
scaleSourceToRuntime();

// ===========================================================================
// SLICE + DEDUPE -> tileset
// ===========================================================================
const cellTile: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));
const tileBuf: Buffer[] = [];
const sourceTileBuf: Buffer[] = [];
const tileBlocked: boolean[] = [];
const tileKind: Kind[] = [];
const tileByKey = new Map<string, number>();
function cellKey(r: number, c: number): { key: string; buf: Buffer; sourceBuf: Buffer } {
  const buf = Buffer.alloc(ts * ts * 4);
  for (let y = 0; y < ts; y++) {
    const srcStart = ((r * ts + y) * W + c * ts) * 4;
    out.data.copy(buf, y * ts * 4, srcStart, srcStart + ts * 4);
  }
  const sourceBuf = Buffer.alloc(sourceTs * sourceTs * 4);
  for (let y = 0; y < sourceTs; y++) {
    const srcStart = ((r * sourceTs + y) * sourceW + c * sourceTs) * 4;
    sourceOut.data.copy(sourceBuf, y * sourceTs * 4, srcStart, srcStart + sourceTs * 4);
  }
  return { key: buf.toString("latin1"), buf, sourceBuf };
}
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const { key, buf, sourceBuf } = cellKey(r, c);
  const fullKey = `${blocked[r][c] ? "1" : "0"}|${key}`;
  let idx = tileByKey.get(fullKey);
  if (idx === undefined) {
    idx = tileBuf.length;
    tileByKey.set(fullKey, idx);
    tileBuf.push(buf);
    sourceTileBuf.push(sourceBuf);
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
const sourceSheet = new PNG({ width: PACK_COLS * sourceTs, height: packRows * sourceTs });
sourceSheet.data.fill(0);
for (let i = 0; i < N; i++) {
  const tx = (i % PACK_COLS) * ts, ty = Math.floor(i / PACK_COLS) * ts;
  for (let y = 0; y < ts; y++) {
    const dst = ((ty + y) * sheet.width + tx) * 4;
    tileBuf[i].copy(sheet.data, dst, y * ts * 4, y * ts * 4 + ts * 4);
  }
  const stx = (i % PACK_COLS) * sourceTs, sty = Math.floor(i / PACK_COLS) * sourceTs;
  for (let y = 0; y < sourceTs; y++) {
    const dst = ((sty + y) * sourceSheet.width + stx) * 4;
    sourceTileBuf[i].copy(sourceSheet.data, dst, y * sourceTs * 4, y * sourceTs * 4 + sourceTs * 4);
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
  { x: FORD_X, y: 34, label: "stream ford" },
  { x: FORD_X, y: 35, label: "stream ford 2" },
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
  s: { role: "shallow-ford", blocked: false, sightBlocked: false, road: false }, // wadeable water at the crossing
  t: { role: "packed-road", blocked: false, sightBlocked: false, road: true },
  "^": { role: "forest-border-canopy", blocked: true, sightBlocked: true, road: false },
  y: { role: "tree-trunk", blocked: true, sightBlocked: true, road: false },
};

const charOf = (r: number, c: number): string => (rows[r][c] === "s" ? "s" : KIND_CHAR[kind[r][c]]);
const charTileFreq: Record<string, Map<number, number>> = {};
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const ch = charOf(r, c);
  (charTileFreq[ch] ??= new Map()).set(cellTile[r][c], (charTileFreq[ch]?.get(cellTile[r][c]) ?? 0) + 1);
}
const canonTile: Record<string, number> = {};
for (const ch of Object.keys(CHAR_VOCAB)) {
  let best = grassTile, bestN = -1;
  for (const [idx, n] of charTileFreq[ch] ?? []) if (n > bestN) { best = idx; bestN = n; }
  canonTile[ch] = best;
}

const cellChar: string[][] = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => charOf(r, c)));
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
// NOTE: no scattered shrub/flower props. Densely sprinkling random small sprites
// across the grass read as messy noise that fought the trees and the trail for
// attention. Northwood's cohesion comes from trees + terrain alone, so the route
// keeps only trees (woodland framing) + the landmark oak. Tall-grass clearings
// stay clean open pockets where the spawns live.

// Hero landmark: an oversized ancient oak in its own clearing, off the trail.
{
  const g = CLEARINGS[2];
  const oak = objDim(7, 132);   // ~2.2x a normal tree
  objects.push({ key: treeKey(7), x: g.cx + 0.5, y: g.cy + 1, w: oak.w, h: oak.h, blocking: true, resource: { kind: "tree", tx: g.cx, ty: g.cy } });
  // wall the trunk tile + reserve so nothing else lands on the landmark
  ascii[g.cy] = ascii[g.cy].slice(0, g.cx) + "y" + ascii[g.cy].slice(g.cx + 1);
  collision[g.cy][g.cx] = 1;
}

const spriteIds = [...new Set(TREE_IDS)];
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
const gbcRouteDir = nodePath.join(repoRoot, "assetsources/gbc/route");
mkdirSync(gbcRouteDir, { recursive: true });
writeFileSync(nodePath.join(exportDir, "forest.png"), PNG.sync.write(sheet));
writeFileSync(nodePath.join(gbcRouteDir, "forest-source.png"), PNG.sync.write(sourceSheet));
writeFileSync(nodePath.join(gbcRouteDir, "route-source-composite.png"), PNG.sync.write(sourceOut));
writeFileSync(nodePath.join(gbcRouteDir, "route-runtime-composite.png"), PNG.sync.write(out));
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

console.log(`route stage -> ${C}x${R}; tileset ${N} tiles (${PACK_COLS}x${packRows}); ${objects.length} objects (${placements.length} trees + 1 landmark, no scatter props)`);
