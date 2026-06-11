// Bridge: AUTHORED Sunken Marsh (floor 5) layout -> in-game generated stage.
// ---------------------------------------------------------------------------
// PATH B (reskin): reads the CURRENT floor-5 geometry dumped to a char grid
// (tools/dump-floor5-layout.ts -> assetsources/mockup/swamp-layout-authored.txt)
// and re-renders it with the Northwood assembly method (locked autotile passes +
// slice/dedupe tileset), changing VISUALS only. Geometry/collision are preserved.
//
// The swamp is flat (no elevation), so only three passes are needed:
//   1. lichen ground fill on ALL cells (purple carpet, seamless base tile)
//   2. water corner-Wang dual-grid  (organic feathered banks; isW = {W,3,4})
//   3. path  corner-Wang dual-grid  (tan dirt trails; isP = {k})
//   + bridge plank tiles (B) and rock tiles (o,*,n,O), light AO under rock.
// Then slice the canvas into 32px cells, dedupe -> packed swamp.png tileset,
// emit swamp.stage.json + swamp.vocab.json for tools/import-asset-forge-stage.ts.
// Props (boulders / ruins / undergrowth) are emitted as engine objects[] that
// reference sprite keys ALREADY created in main.ts (spriteSwamp*/spriteRuin*),
// since addTileDecorations early-returns for generated stages.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;

// ---- inputs ----------------------------------------------------------------
const layoutPath = nodePath.join(repoRoot, process.argv[2] ?? "assetsources/mockup/swamp-layout-authored.txt");
const rows = readFileSync(layoutPath, "utf8").replace(/\n$/, "").split("\n").map((r) => r.split(""));
const R = rows.length, C = rows[0].length, W = C * ts, H = R * ts;
// Out-of-bounds is open water (the floor-5 border is a water fill), so banks feather at edges.
const at = (r: number, c: number) => (r >= 0 && c >= 0 && r < R && c < C ? rows[r][c] : "W");

// ---- char model (MUST match shared.ts isBlockedTile/isSightBlocked) --------
const WATER = new Set(["W", "3", "4"]);          // blocked, sight-OPEN
const ROCK = new Set(["o", "*", "n", "O"]);       // blocked + sight-blocked
const PATH = new Set(["k"]);                       // walkable dirt
const BRIDGE = new Set(["B"]);                     // walkable plank
const PORTAL = new Set(["M", "L"]);               // walkable portals
const isW = (r: number, c: number) => WATER.has(at(r, c));
const isP = (r: number, c: number) => PATH.has(at(r, c));

type Kind = "lichen" | "water" | "path" | "bridge" | "rock";
function kindOf(ch: string): Kind {
  if (WATER.has(ch)) return "water";
  if (ROCK.has(ch)) return "rock";
  if (PATH.has(ch)) return "path";
  if (BRIDGE.has(ch)) return "bridge";
  return "lichen"; // m, M, L, and anything else = walkable lichen ground
}
const blockedChar = (ch: string) => WATER.has(ch) || ROCK.has(ch);
const sightChar = (ch: string) => ROCK.has(ch);

// ---- atlases ---------------------------------------------------------------
const sliced = (name: string) => PNG.sync.read(readFileSync(nodePath.join(repoRoot, `assetsources/curated/sliced/${name}`)));
const lichen = sliced("swamp-lichen-base.png");   // 32x32 seamless fallback
const lichenFills = [0, 1, 2, 3].map((i) => PNG.sync.read(readFileSync(nodePath.join(repoRoot, `assetsources/curated/fills/swamp-lichen-v${i}.png`))));
const waterW = sliced("swamp-water-wang.png");    // 128x128 (4x4 corner-Wang)
const pathW = sliced("swamp-path-wang.png");      // 128x128 (4x4 corner-Wang)
const rockT = sliced("swamp-rock.png");           // 32x32
const plankT = sliced("swamp-plank.png");         // 32x32
const wangCols = waterW.width / ts;               // 4

const out = new PNG({ width: W, height: H });
out.data.fill(0);
function blitWang(sheet: PNG, idx: number, dx: number, dy: number) {
  const sx = (idx % wangCols) * ts, sy = Math.floor(idx / wangCols) * ts;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const px = dx + x, py = dy + y; if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const si = ((sy + y) * sheet.width + (sx + x)) * 4; if (sheet.data[si + 3] === 0) continue;
    const di = (py * W + px) * 4;
    out.data[di] = sheet.data[si]; out.data[di + 1] = sheet.data[si + 1]; out.data[di + 2] = sheet.data[si + 2]; out.data[di + 3] = 255;
  }
}
function blitOne(tile: PNG, dx: number, dy: number) {
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const px = dx + x, py = dy + y; if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const si = (y * tile.width + x) * 4; if (tile.data[si + 3] === 0) continue;
    const di = (py * W + px) * 4;
    out.data[di] = tile.data[si]; out.data[di + 1] = tile.data[si + 1]; out.data[di + 2] = tile.data[si + 2]; out.data[di + 3] = 255;
  }
}
const hrand = (a: number, b: number) => {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h >>> 0) % 100000) / 100000;
};

// ---- semantics grid --------------------------------------------------------
const kind: Kind[][] = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => kindOf(rows[r][c])));
const blocked: boolean[][] = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => blockedChar(rows[r][c])));

// PASS 1: lichen carpet on every cell (water/path/rock overlay on top) --------
// Use four gated tuft variants by position hash to avoid a visible repeated
// marsh-ground tile while preserving the authored geometry exactly.
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  blitOne(lichenFills[Math.floor(hrand(c + 501, r + 607) * lichenFills.length)] ?? lichen, c * ts, r * ts);
}

// PASS 2: water corner-Wang dual-grid (vertex (i,j); NW=1 NE=2 SE=4 SW=8) ------
for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
  const m = (isW(i - 1, j - 1) ? 1 : 0) | (isW(i - 1, j) ? 2 : 0) | (isW(i, j) ? 4 : 0) | (isW(i, j - 1) ? 8 : 0);
  if (m === 0) continue;
  blitWang(waterW, m, Math.round((j - 0.5) * ts), Math.round((i - 0.5) * ts));
}
// PASS 3: path corner-Wang dual-grid ------------------------------------------
for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
  const m = (isP(i - 1, j - 1) ? 1 : 0) | (isP(i - 1, j) ? 2 : 0) | (isP(i, j) ? 4 : 0) | (isP(i, j - 1) ? 8 : 0);
  if (m === 0) continue;
  blitWang(pathW, m, Math.round((j - 0.5) * ts), Math.round((i - 0.5) * ts));
}
// PASS 4: bridges + rocks ------------------------------------------------------
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (BRIDGE.has(at(r, c))) blitOne(plankT, c * ts, r * ts);
  if (ROCK.has(at(r, c))) blitOne(rockT, c * ts, r * ts);
}
// light contact AO one row below rock cells (grounds the boulders) ------------
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (!ROCK.has(at(r, c))) continue;
  for (let dy = 0; dy < 8; dy++) for (let x = 0; x < ts; x++) {
    const px = c * ts + x, py = (r + 1) * ts + dy; if (px >= W || py >= H) continue;
    if (hrand(px % ts, py % ts) > (1 - dy / 8) * 0.7) continue;
    const di = (py * W + px) * 4; if (out.data[di + 3] === 0) continue;
    const f = (1 - dy / 8) * 0.3;
    out.data[di] = Math.round(out.data[di] * (1 - f)); out.data[di + 1] = Math.round(out.data[di + 1] * (1 - f)); out.data[di + 2] = Math.round(out.data[di + 2] * (1 - f));
  }
}

// ===========================================================================
// SLICE + DEDUPE -> tileset
// ===========================================================================
const cellTile: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));
const tileBuf: Buffer[] = [];
const tileBlocked: boolean[] = [];
const tileByKey = new Map<string, number>();
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const buf = Buffer.alloc(ts * ts * 4);
  for (let y = 0; y < ts; y++) {
    const srcStart = ((r * ts + y) * W + c * ts) * 4;
    out.data.copy(buf, y * ts * 4, srcStart, srcStart + ts * 4);
  }
  const fullKey = `${blocked[r][c] ? "1" : "0"}|${buf.toString("latin1")}`;
  let idx = tileByKey.get(fullKey);
  if (idx === undefined) { idx = tileBuf.length; tileByKey.set(fullKey, idx); tileBuf.push(buf); tileBlocked.push(blocked[r][c]); }
  cellTile[r][c] = idx;
}
const N = tileBuf.length;
const PACK_COLS = 24;
const packRows = Math.ceil(N / PACK_COLS);
const sheet = new PNG({ width: PACK_COLS * ts, height: packRows * ts });
sheet.data.fill(0);
for (let i = 0; i < N; i++) {
  const tx = (i % PACK_COLS) * ts, ty = Math.floor(i / PACK_COLS) * ts;
  for (let y = 0; y < ts; y++) tileBuf[i].copy(sheet.data, ((ty + y) * sheet.width + tx) * 4, y * ts * 4, y * ts * 4 + ts * 4);
}
function avgColor(buf: Buffer): string {
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < buf.length; p += 4) { if (buf[p + 3] === 0) continue; r += buf[p]; g += buf[p + 1]; b += buf[p + 2]; n++; }
  if (!n) return "#000000";
  const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

// ===========================================================================
// CHARS / LAYERS / VOCAB  (chars unchanged -> collision identical to current)
// ===========================================================================
const ROLE: Record<Kind, string> = { lichen: "marsh-lichen", water: "swamp-water", path: "marsh-dirt", bridge: "swamp-bridge", rock: "marsh-rock" };
const CHAR_VOCAB: Record<string, { role: string; blocked: boolean; sightBlocked: boolean; road: boolean }> = {};
for (const ch of ["W", "3", "4", "m", "k", "B", "o", "*", "n", "O", "M", "L"]) {
  CHAR_VOCAB[ch] = { role: ROLE[kindOf(ch)], blocked: blockedChar(ch), sightBlocked: sightChar(ch), road: PATH.has(ch) };
}
// portals carry their own role
CHAR_VOCAB["M"] = { role: "portal-marsh-exit", blocked: false, sightBlocked: false, road: false };
CHAR_VOCAB["L"] = { role: "portal-ledge", blocked: false, sightBlocked: false, road: false };

// canonical visual tile per char = most common dedup tile of that char
const charTileFreq: Record<string, Map<number, number>> = {};
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const ch = rows[r][c];
  (charTileFreq[ch] ??= new Map()).set(cellTile[r][c], (charTileFreq[ch]?.get(cellTile[r][c]) ?? 0) + 1);
}
// fallback tile = most common lichen tile
let lichenTile = 0; { const f = charTileFreq["m"]; if (f) { let bn = -1; for (const [i, n] of f) if (n > bn) { bn = n; lichenTile = i; } } }
const canonTile: Record<string, number> = {};
for (const ch of Object.keys(CHAR_VOCAB)) {
  let best = lichenTile, bestN = -1;
  for (const [idx, n] of charTileFreq[ch] ?? []) if (n > bestN) { best = idx; bestN = n; }
  canonTile[ch] = best;
}

const legend: Record<string, string> = {};
const vocab: Record<string, { role: string; blocked: boolean; sightBlocked: boolean; road: boolean; minimapColor: string }> = {};
for (const ch of Object.keys(CHAR_VOCAB)) {
  legend[ch] = `swamp:${canonTile[ch]}`;
  vocab[ch] = { ...CHAR_VOCAB[ch], minimapColor: avgColor(tileBuf[canonTile[ch]]) };
}

const ascii: string[] = [];
const collision: number[][] = [];
const base: Array<Array<string | null>> = [];
const fringe: Array<Array<string | null>> = [];
for (let r = 0; r < R; r++) {
  let line = ""; const col: number[] = [], baseRow: Array<string | null> = [], fringeRow: Array<string | null> = [];
  for (let c = 0; c < C; c++) {
    const ch = rows[r][c];
    line += ch;
    const v = vocab[ch] ?? vocab["m"];
    col.push(v.blocked ? 1 : 0);
    const lref = legend[ch] ?? `swamp:${lichenTile}`;
    baseRow.push(lref);
    const vis = `swamp:${cellTile[r][c]}`;
    fringeRow.push(vis === lref ? null : vis);
  }
  ascii.push(line); collision.push(col); base.push(baseRow); fringe.push(fringeRow);
}

// ===========================================================================
// OBJECTS: boulders + ruins + undergrowth (reference existing main.ts sprites)
// ===========================================================================
type Obj = { key: string; x: number; y: number; w: number; h: number; blocking: boolean };
const objects: Obj[] = [];
// boulders on real 'o' cells (the *,n,O edge markers stay flat rock tiles)
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (at(r, c) === "o") objects.push({ key: "spriteSwampBoulder", x: c + 0.5, y: r + 0.85, w: 44, h: 36, blocking: false });
}
// drowned-temple ruins (same anchors as main.ts MARSH_RUINS)
const RUINS: Array<[number, number, string, number, number]> = [
  [50, 53, "spriteRuinArch", 80, 86], [47, 54, "spriteRuinPillar", 26, 76], [53, 54, "spriteRuinPillar", 26, 76],
  [62, 29, "spriteRuinArch", 74, 80], [66, 37, "spriteRuinPillar", 26, 74], [18, 44, "spriteRuinPillar", 26, 74],
];
for (const [x, y, key, w, h] of RUINS) if (at(y, x) === "m") objects.push({ key, x: x + 0.5, y: y + 1.0, w, h, blocking: false });
// undergrowth scatter on ~28% of lichen 'm' cells (deterministic), non-blocking
const UNDER: Array<[string, number, number]> = [
  ["spriteSwampBramble0", 40, 30], ["spriteSwampBramble1", 38, 34], ["spriteSwampBramble2", 36, 32],
  ["spriteSwampStump", 34, 26], ["spriteSwampReeds", 34, 34],
];
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (at(r, c) !== "m") continue;
  const h = hrand(c, r);
  if (h > 0.28) continue;
  const [key, w, hh] = UNDER[Math.floor(hrand(c + 7, r + 13) * UNDER.length)]!;
  objects.push({ key, x: c + 0.5, y: r + 0.9, w, h: hh, blocking: false });
}

// portals (scan the grid for actual positions) for the vocab contract
const requiredPortals: Record<string, { x: number; y: number }> = {};
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (PORTAL.has(rows[r][c])) requiredPortals[rows[r][c]] = { x: c, y: r };

// ===========================================================================
// WRITE OUTPUTS
// ===========================================================================
const exportDir = nodePath.join(repoRoot, "assetsources/asset-forge/exports/swamp");
mkdirSync(exportDir, { recursive: true });
writeFileSync(nodePath.join(exportDir, "swamp.png"), PNG.sync.write(sheet));
writeFileSync(nodePath.join(exportDir, "swamp.tileset.json"), JSON.stringify({ schema: "asset-forge/tileset@1", name: "swamp", image: "swamp.png", tileSize: ts, columns: PACK_COLS, rows: packRows, tiles: Array.from({ length: N }, (_, i) => ({ index: i, role: "marsh", blocked: tileBlocked[i] })) }, null, 2));

const stage = {
  schema: "asset-forge/stage@1",
  name: "swamp",
  tileSize: ts,
  cols: C,
  rows: R,
  tilesets: [{ name: "swamp", image: "swamp.png", manifest: "swamp.tileset.json" }],
  layers: [{ name: "base", type: "tile", data: base }, { name: "fringe", type: "tile", data: fringe }],
  collision,
  objects,
  ascii: { legend, rows: ascii },
};
writeFileSync(nodePath.join(exportDir, "swamp.stage.json"), JSON.stringify(stage));

const fullVocab = {
  zone: "swamp",
  floor: 5,
  stageName: "swamp",
  description: "Sunken Marsh path-B reskin: current geometry re-rendered via the Northwood assembly method (lichen carpet + water/path corner-Wang). Props are runtime objects.",
  requiredPortals,
  requiredWalkable: [],
  chars: { ...vocab },
};
writeFileSync(nodePath.join(repoRoot, "assetsources/asset-forge/swamp.vocab.json"), JSON.stringify(fullVocab, null, 2));

console.log(`stage -> ${C}x${R}; tileset ${N} tiles (${PACK_COLS}x${packRows}); ${objects.length} objects; portals: ${Object.keys(requiredPortals).join(",")}`);
