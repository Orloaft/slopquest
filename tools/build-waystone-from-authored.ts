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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;
const ROAD_DITHER_EDGE_PX = 4;
// Cliff/elevation tunables (ported from the locked Northwood baker). Waystone is now a
// TERRACED town: a high east shelf (windmill/watchtower/cow pen) drops via stone faces to
// the village floor and to a low cave pocket. Driven by assetsources/waystone/elevation.txt.
const CLIFF_AO_BAND_PX = 14;
const CLIFF_AO_MAX_DARKEN = 0.4;
const CLIFF_MAX_WALL_TILES = 4;
// Grass laps onto the dirt edge: dense at the boundary, fading inward. This is the ONLY
// grass-border source (sampled from the real neighbour grass cell, so colour + side are
// always correct). road-wang's own "grass" is scattered texture noise, not a clean edge,
// so we never overlay it onto the dirt (it would speckle green across the plaza interior).
const ROAD_DITHER_PROB_BY_DEPTH = [0.7, 0.42, 0.2, 0.08];

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
  // --- houses (top row + west manor) -- sized toward the mockup's large, tight cluster ---
  T("spriteRedHouse", "townTiles", 996, 22, 238, 176, 47, 9, 190, [4, 2]),
  T("spriteThatchHouse", "townTiles", 1294, 24, 130, 176, 57, 9, 150, [3, 2]),
  T("spriteGreenHouse", "townTiles", 1272, 374, 142, 178, 68, 9, 160, [3, 2]),
  T("spriteBlueHouse", "townTiles", 996, 374, 250, 180, 18, 18, 200, [4, 2]),
  // --- bespoke hero structures ---
  B("spriteWindmill", `${BESPOKE}/windmill.png`, 128, 224, 94, 10, 175, [3, 2]),
  B("spriteWatchtower", `${BESPOKE}/tower-waystone.png`, 106, 238, 104, 11, 140, [3, 2]), // bespoke town tower (was Northwood watchtower.png)
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
  B("spriteWaystoneCave", `${BESPOKE}/cave_entrance.png`, 98, 104, 98, 33, 150, [3, 2]), // de-fringed cave arch (was atlas slice w/ pink halo)
  B("spriteScarecrow", `${BESPOKE}/scarecrow.png`, 32, 64, 59, 41, 32),
  T("spriteBeachTent", "beachTiles", 1040, 866, 92, 70, 11, 55, 60, [2, 1]),
  T("spriteBeachCampfire", "beachTiles", 1160, 872, 72, 66, 8, 57, 44),
  // --- bridges over the river ---
  T("spriteBridge", "townTiles", 20, 466, 92, 56, 34, 25, 70),
  T("spriteBridge", "townTiles", 20, 466, 92, 56, 30, 58, 70),
  // --- livestock ---
  B("spriteCow", `${BESPOKE}/cow_left.png`, 64, 48, 85, 26, 56),
  B("spriteCow", `${BESPOKE}/cow_left.png`, 64, 48, 88, 27, 56),
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
  // step every cell (was 2): the fence sprite's opaque content is < 64px wide, so spacing 2
  // left grass gaps -> "fragmented" look. Overlapping at step 1 fills into a continuous rail.
  // Collision is set separately by the perimeter blockCell loop, so this is purely visual.
  for (let x = x0; x <= x1; x += 1) { out.push(T("spriteFence", "graveyardTiles", 20, 552, 126, 66, x, y0, 64)); out.push(T("spriteFence", "graveyardTiles", 20, 552, 126, 66, x, y1, 64)); }
  for (let y = y0 + 1; y < y1; y += 1) { out.push(T("spriteFence", "graveyardTiles", 20, 552, 126, 66, x0, y, 64)); out.push(T("spriteFence", "graveyardTiles", 20, 552, 126, 66, x1, y, 64)); }
  return out;
};
const PENS = [
  { x0: 80, y0: 21, x1: 93, y1: 30 },   // cow pen (E) -- widened to mockup
  { x0: 14, y0: 42, x1: 26, y1: 50 },   // goose pen (SW) -- widened to mockup
];
for (const pen of PENS) PLACEMENTS.push(...fenceRing(pen.x0, pen.y0, pen.x1, pen.y1));

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

// ---- DIRT TOWN-CENTRE PLAZA + path widening --------------------------------
// Parity: the mockup centre is one big open packed-dirt plaza and its paths run
// ~2-3 cells wide; our hue-derived paths are 1px threads on a flat green. Pave an
// elliptical plaza around the well/market, then dilate every road by one cell.
// Road autotile fills solid interiors with the packed-dirt tile, so this reads as
// open dirt, not striped path. Never pave the crop field (its overlay skips road).
const inField = (r: number, c: number) => r >= FIELD.y0 && r <= FIELD.y1 && c >= FIELD.x0 && c <= FIELD.x1;
const pave = (r: number, c: number) => { if (rows[r]?.[c] === "F" || rows[r]?.[c] === "q") rows[r][c] = "t"; };
const PLAZA = { cx: 59, cy: 28, rx: 8, ry: 4 };
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const dx = (c - PLAZA.cx) / PLAZA.rx, dy = (r - PLAZA.cy) / PLAZA.ry;
  if (dx * dx + dy * dy <= 1 && !inField(r, c)) pave(r, c);
}
const roadSeed: Array<[number, number]> = [];
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (rows[r][c] === "t") roadSeed.push([r, c]);
// widen S+E only -> 1px threads become ~2 cells wide (blanket 4-way over-paved)
for (const [r, c] of roadSeed) for (const [dr, dc] of [[1, 0], [0, 1]] as const) {
  const nr = r + dr, nc = c + dc;
  if (nr >= 0 && nc >= 0 && nr < R && nc < C && !inField(nr, nc)) pave(nr, nc);
}

// ---- VEGETATION SCATTER (decorative, non-blocking sprite objects) ----------
// Mockup is lush: a loose pine tree-line crowds the map edges + bushes/flowers/logs
// dot the green. Reuse the northwood object sprites (already preloaded in main.ts;
// cleaned PNGs live in public/sprites/nw/). Kept NON-blocking so the town hub stays
// fully walkable; the engine draws them depth-sorted by `key`.
const plantable = (r: number, c: number) => { const ch = at(r, c); return ch === "F" || ch === "q"; };
// Elevation-derived cliff-face cells (a south-facing step-down walls the cells just below
// it). Trees/props are placed in this pass, BEFORE the cliff render pass, so reserve these
// up front to keep vegetation off the stone faces. dropS is reused by the render pass.
const dropS = (r: number, c: number) => Math.max(0, eh(r, c) - eh(r + 1, c));
const wallCells = new Set<string>();
// cliffClear = wall cells + the lip cell + a 1-cell halo. Reserved from vegetation so the
// tall pine tree-line (which is edge-weighted and would otherwise pack the east/cave edge)
// can't bury the stone faces; the terracing has to be visible to read.
const cliffClear = new Set<string>();
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const d = dropS(r, c); if (d <= 0) continue;
  const total = Math.min(CLIFF_MAX_WALL_TILES, 1 + d);
  for (let h = 0; h < total; h++) wallCells.add(`${r + 1 + h},${c}`);
  for (let dr = 0; dr <= total + 1; dr++) for (let dc = -1; dc <= 1; dc++) cliffClear.add(`${r + dr},${c + dc}`);
}
const vAvoid = new Set<string>(cliffClear);
const vReserve = (r: number, c: number) => vAvoid.add(`${r},${c}`);
for (const p of PLACEMENTS) {                                   // structure footprints (+1 margin)
  if (!p.block) continue;
  const [bw, bh] = p.block, c0 = p.tx - Math.floor((bw - 1) / 2);
  for (let dy = -1; dy <= bh; dy++) for (let dx = -1; dx <= bw; dx++) vReserve(p.ty - dy, c0 + dx);
}
for (const pen of PENS) for (let r = pen.y0 - 1; r <= pen.y1 + 1; r++) for (let c = pen.x0 - 1; c <= pen.x1 + 1; c++) vReserve(r, c);
for (let r = FIELD.y0 - 1; r <= FIELD.y1 + 1; r++) for (let c = FIELD.x0 - 1; c <= FIELD.x1 + 1; c++) vReserve(r, c);
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {       // keep the plaza/spawn clear of trees
  const dx = (c - PLAZA.cx) / (PLAZA.rx + 1), dy = (r - PLAZA.cy) / (PLAZA.ry + 1);
  if (dx * dx + dy * dy <= 1) vReserve(r, c);
}
let vseed = 99991;
const vrand = () => { vseed = (vseed * 1103515245 + 12345) & 0x7fffffff; return vseed / 0x7fffffff; };
const treeAt: Array<[number, number]> = [];
// Tightened toward the mockup's near-solid pine frame: dense at the very border, falling
// off fast inward so the village core stays open. Spacing 2 (was 3) lets the edge cells
// pack into a continuous tree-line instead of a thin scatter. Pines stay NON-blocking.
const treeFar = (r: number, c: number) => treeAt.every(([pr, pc]) => Math.abs(pr - r) >= 2 || Math.abs(pc - c) >= 2);
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {       // pass 1: pine tree-line (edge-weighted)
  if (!plantable(r, c) || vAvoid.has(`${r},${c}`)) continue;
  const edge = Math.min(r, R - 1 - r, c, C - 1 - c);
  const gate = edge <= 3 ? 0.62 : edge <= 7 ? 0.30 : edge <= 13 ? 0.10 : 0.03;
  if (vrand() > gate || !treeFar(r, c)) continue;
  treeAt.push([r, c]);
  PLACEMENTS.push(T("spritePine", "northwoodTreeSheet", 455, 50, 220, 390, c, r, 52));
}
// pass 1b: interior tree CLUSTERS. The edge pass frames the map; the mockup also
// sprinkles tight tree groves between the POIs. Plant a few hand-placed clumps in
// open interior grass (tight spacing on purpose -> reads as a grove, not scatter).
const CLUSTER_CENTERS: Array<[number, number]> = [
  [68, 14], [50, 15], [78, 40], [28, 36], [64, 51], [46, 23], [90, 26], [24, 55], [84, 18], [40, 60],
];
const CLUSTER_OFFSETS: Array<[number, number]> = [[0, 0], [1, 1], [-1, 1], [2, 0], [-2, -1], [1, -2], [-1, 2]];
for (const [ccx, ccy] of CLUSTER_CENTERS) for (const [dx, dy] of CLUSTER_OFFSETS) {
  const c = ccx + dx, r = ccy + dy;
  if (r < 0 || c < 0 || r >= R || c >= C) continue;
  if (!plantable(r, c) || vAvoid.has(`${r},${c}`)) continue;
  if (treeAt.some(([pr, pc]) => pr === r && pc === c)) continue;  // no exact dup; clumping IS wanted
  treeAt.push([r, c]);
  PLACEMENTS.push(T("spritePine", "northwoodTreeSheet", 455, 50, 220, 390, c, r, 52));
}
const PROP_IDS = [22, 24, 25, 70, 33, 34, 35, 49, 105, 107, 39, 53, 115, 54, 97];
const PROP_W: Record<number, number> = { 22: 26, 24: 26, 25: 26, 70: 26, 33: 22, 34: 22, 35: 22, 49: 22, 105: 22, 107: 22, 39: 40, 53: 40, 115: 40, 54: 18, 97: 18 };
const propPath = (id: number) => `public/sprites/nw/obj_${String(id).padStart(3, "0")}.png`;
const propDim = new Map<number, { w: number; h: number }>();
for (const id of PROP_IDS) { const p = PNG.sync.read(readFileSync(nodePath.join(repoRoot, propPath(id)))); propDim.set(id, { w: p.width, h: p.height }); }
const propAt: Array<[number, number]> = [];
const propFar = (r: number, c: number) => propAt.every(([pr, pc]) => Math.abs(pr - r) >= 2 || Math.abs(pc - c) >= 2);
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {       // pass 2: bushes / flowers / logs
  if (!plantable(r, c) || vAvoid.has(`${r},${c}`)) continue;
  if (treeAt.some(([pr, pc]) => Math.abs(pr - r) <= 1 && Math.abs(pc - c) <= 1)) continue;
  if (vrand() > 0.10 || !propFar(r, c)) continue;
  propAt.push([r, c]);
  const id = PROP_IDS[Math.floor(vrand() * PROP_IDS.length)];
  const d = propDim.get(id)!;
  PLACEMENTS.push(B(`spriteNw${String(id).padStart(3, "0")}`, propPath(id), d.w, d.h, c, r, PROP_W[id]));
}

// ---- atlases ---------------------------------------------------------------
const sliced = (name: string) => PNG.sync.read(readFileSync(nodePath.join(repoRoot, `assetsources/curated/sliced/${name}`)));
const water = sliced("water-wang.png");
const road = sliced("road-wang.png");
const ptop = sliced("plateau-top-v2.png");
const face = sliced("cliff-face.png");     // 5col[Lcap,str,Rcap,innerL,innerR] x 3row[top,mid,base]
const ladder = sliced("ladder.png");       // 1col x 3row[top,mid,base] wooden stairs
const FCOLS = 5;
const wCols = water.width / ts, rCols = road.width / ts, PTCOLS = ptop.width / ts;
// optional bespoke grass-variation atlas (8x1). Falls back to the single ptop grass tile
// until tools/slice-grass-v1.py has produced it. See bespoke/waystone-grass-v1/PROMPT.md.
const grassVarPath = nodePath.join(repoRoot, "assetsources/curated/sliced/grass-v1.png");
const grassVar = existsSync(grassVarPath) ? PNG.sync.read(readFileSync(grassVarPath)) : null;
const GVCOLS = grassVar ? grassVar.width / ts : 0;
// optional bespoke packed-dirt atlas (4x1) for path/plaza interiors. Falls back to the
// procedural roadFill below. See bespoke/waystone-dirt-v1/PROMPT.md.
const dirtVarPath = nodePath.join(repoRoot, "assetsources/curated/sliced/dirt-v1.png");
const dirtVar = existsSync(dirtVarPath) ? PNG.sync.read(readFileSync(dirtVarPath)) : null;
const DVCOLS = dirtVar ? dirtVar.width / ts : 0;

// Solid packed-dirt fill derived from the road interior tile (idx 15): the road-wang set is
// authored as 1-cell paths and even its interior tile is ~20% transparent, so wide paths/plaza
// leak grass through and render as a lattice. We underlay this solid version beneath every road
// cell (transparent pixels filled with the tile's mean dirt colour); the road-wang overlay then
// only contributes its opaque grass borders at path edges. Result: solid dirt, clean edges.
const roadFill = new PNG({ width: ts, height: ts });
{
  const rfx = (15 % rCols) * ts, rfy = Math.floor(15 / rCols) * ts;
  let mr = 0, mg = 0, mb = 0, n = 0;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const si = ((rfy + y) * road.width + (rfx + x)) * 4;
    if (road.data[si + 3] !== 0) { mr += road.data[si]; mg += road.data[si + 1]; mb += road.data[si + 2]; n++; }
  }
  mr = Math.round(mr / n); mg = Math.round(mg / n); mb = Math.round(mb / n);
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const si = ((rfy + y) * road.width + (rfx + x)) * 4, di = (y * ts + x) * 4;
    const op = road.data[si + 3] !== 0;
    roadFill.data[di] = op ? road.data[si] : mr;
    roadFill.data[di + 1] = op ? road.data[si + 1] : mg;
    roadFill.data[di + 2] = op ? road.data[si + 2] : mb;
    roadFill.data[di + 3] = 255;
  }
}

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
  else { kind[r][c] = eh(r, c) >= 1 ? "plateau" : "grass"; }
}

// ---- ground fill: interior grass on ALL land ------------------------------
// With the bespoke grass-variation atlas present, scatter variants (mostly the plain
// base tile, with sparse flower/patch/scuff accents) deterministically so the green
// reads textured like the mockup instead of one flat fill. Road/water/plateau passes
// paint over covered cells, so variants only ever show on exposed grass.
const GRASS_IDX0 = 0;
let gseed = 20260602;
const grand = () => { gseed = (gseed * 1103515245 + 12345) & 0x7fffffff; return gseed / 0x7fffffff; };
const pickGrassVariant = () => {
  const roll = grand();
  if (roll < 0.58) return 0;            // plain base turf dominates
  if (roll < 0.72) return 1;            // denser blade texture
  return 2 + Math.floor(((roll - 0.72) / 0.28) * (GVCOLS - 2)); // sparse accents 2..GVCOLS-1
};
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const ch = at(r, c);
  if (ch === "~" || ch === "^" || ch === ".") continue;
  if (grassVar) blitTile(grassVar, GVCOLS, Math.min(pickGrassVariant(), GVCOLS - 1), c * ts, r * ts);
  else blitTile(ptop, PTCOLS, GRASS_IDX0, c * ts, r * ts);
}

// ---- water corner-Wang dual-grid -------------------------------------------
// mask 0 (all-land corner) is an OPAQUE bright-green grass tile in the water set; left
// on, it repaints the whole map and hides the grass ground-fill. With the bespoke
// grass atlas present we skip it so the dark-olive variants show; without it we keep
// the legacy behaviour (water tile-0 is the grass) to avoid a no-art regression.
for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
  const m = (isW(i - 1, j - 1) ? 1 : 0) | (isW(i - 1, j) ? 2 : 0) | (isW(i, j) ? 4 : 0) | (isW(i, j - 1) ? 8 : 0);
  if (m === 0 && grassVar) continue;
  blitTile(water, wCols, m, Math.round((j - 0.5) * ts), Math.round((i - 0.5) * ts));
}

// ---- plateau-top edge autotile (uniform tier => interior grass everywhere) --
const maskToIdx = [15, 13, 14, 7, 12, 10, 8, 4, 11, 6, 9, 3, 5, 2, 1, 0];
for (let L = 1; L <= topLvl; L++) {
  // OOB counts as same-tier so the uniform-flat town gets no false rim at the map border.
  const up = (r: number, c: number) => (r < 0 || c < 0 || r >= R || c >= C ? true : eh(r, c) >= L);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (!up(r, c)) continue;
    const ch = at(r, c); if (ch === "~" || ch === "^" || ch === ".") continue;
    const mask = (up(r - 1, c) ? 1 : 0) | (up(r, c + 1) ? 2 : 0) | (up(r + 1, c) ? 4 : 0) | (up(r, c - 1) ? 8 : 0);
    // With the bespoke dark-olive grass atlas present, skip the plateau-top tiles ENTIRELY:
    // the interior tile (idx 0) repaints over the grass, and the bright ptop RIM tiles clash
    // hard against the dark grass at every tier boundary (a lime lattice). The terraced read
    // comes from the stone cliff FACES (south step-downs) + wall-foot AO instead, which match
    // the mockup's stone retaining walls. Legacy no-art path still uses ptop for a clean fill.
    if (grassVar) continue;
    blitTile(ptop, PTCOLS, maskToIdx[mask], c * ts, r * ts);
  }
}

// ---- roads edge-Wang (solid-dirt underlay + road-wang edge overlay) --------
let dseed = 71777;
const drand = () => { dseed = (dseed * 1103515245 + 12345) & 0x7fffffff; return dseed / 0x7fffffff; };
const pickDirt = () => (drand() < 0.7 ? 0 : 1 + Math.floor(drand() * (DVCOLS - 1))); // plain dominates
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (!isR(r, c)) continue;
  if (dirtVar) blitTile(dirtVar, DVCOLS, Math.min(pickDirt(), DVCOLS - 1), c * ts, r * ts);
  else blitTile(roadFill, 1, 0, c * ts, r * ts); // solid dirt -> no grass leak on interiors/plaza
  // Grass border is applied by the edge-dither pass below (samples the real neighbour grass).
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

// ---- cliff faces (south-facing step-downs) + stairs + contact AO ------------
// Ported from the locked Northwood baker. A cell whose elevation is higher than the cell
// to its south drops; we stack `face` tiles (Lcap/straight/Rcap by horizontal position,
// top/mid/base by height) over the cells below it, flip them to 'wall' (blocked+sight), and
// run a soft contact-shadow band at the wall foot. Where a road meets the lip we drop a
// walkable stair instead of a wall so the tier stays reachable. dropS defined above (veg).
const stairCand: boolean[][] = Array.from({ length: R }, () => new Array(C).fill(false));
const wallTotal: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));
const shadows: Array<{ c: number; baseY: number; s: number }> = [];
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const d = dropS(r, c);
  if (d <= 0) continue;
  const col = dropS(r, c - 1) <= 0 ? 0 : dropS(r, c + 1) <= 0 ? 2 : 1; // Lcap / straight / Rcap
  const total = Math.min(CLIFF_MAX_WALL_TILES, 1 + d);
  wallTotal[r][c] = total;
  shadows.push({ c, baseY: (r + total + 1) * ts - 4, s: Math.min(1, d / 2) });
  for (let h = 0; h < total; h++) {
    const wr = r + 1 + h; if (wr >= R) break;
    const rowKind = h === 0 ? 0 : h === total - 1 ? 2 : 1;            // top / mid / base course
    blitTile(face, FCOLS, rowKind * FCOLS + col, c * ts, wr * ts);
    if (kind[wr][c] !== "void" && kind[wr][c] !== "water") { kind[wr][c] = "wall"; blocked[wr][c] = true; }
  }
  if (at(r, c) === "t" || at(r - 1, c) === "t") stairCand[r][c] = true;
}
// stairs: collapse each contiguous run of lip-touching cells into ONE stair at its centre
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
  }
}
// contact-shadow AO at each wall foot (tile-local noise so cells still dedupe)
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
  grass: "F", plateau: "F", water: "~", road: "t", beach: ".", void: "^", wall: "q", ladder: "m",
};
const ROLE_BY_KIND: Record<Kind, string> = {
  grass: "town-green", plateau: "town-green", water: "deep-water", road: "packed-road",
  beach: "sand-shore", void: "forest-border-canopy", wall: "town-cliff-face", ladder: "town-stairs",
};
const CHAR_VOCAB: Record<string, { role: string; blocked: boolean; sightBlocked: boolean; road: boolean }> = {
  F: { role: "town-green", blocked: false, sightBlocked: false, road: false },
  "~": { role: "deep-water", blocked: true, sightBlocked: false, road: false },
  t: { role: "packed-road", blocked: false, sightBlocked: false, road: true },
  ".": { role: "sand-shore", blocked: false, sightBlocked: false, road: false },
  "^": { role: "forest-border-canopy", blocked: true, sightBlocked: true, road: false },
  q: { role: "town-cliff-face", blocked: true, sightBlocked: true, road: false },
  m: { role: "town-stairs", blocked: false, sightBlocked: false, road: false },
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
// Rounded plot: chamfer the four corners (asymmetric depths -> organic, not a hard
// rectangle). Purely a fringe overlay (walkable, no collision), so cut corners just
// revert to grass. inField/road-exclusion stays the full rectangle on purpose, so
// paths can't sneak into the freed corners. `border` now traces the rounded outline.
const CHAMFER = { tl: 3, tr: 4, bl: 4, br: 3 };
const inPlot = (r: number, c: number): boolean => {
  if (r < FIELD.y0 || r > FIELD.y1 || c < FIELD.x0 || c > FIELD.x1) return false;
  const lx = c - FIELD.x0, rx = FIELD.x1 - c, ty = r - FIELD.y0, by = FIELD.y1 - r;
  if (lx + ty < CHAMFER.tl) return false;
  if (rx + ty < CHAMFER.tr) return false;
  if (lx + by < CHAMFER.bl) return false;
  if (rx + by < CHAMFER.br) return false;
  return true;
};
for (let r = FIELD.y0; r <= FIELD.y1; r++) for (let c = FIELD.x0; c <= FIELD.x1; c++) {
  if (r < 0 || c < 0 || r >= R || c >= C) continue;
  if (!inPlot(r, c)) continue;                                   // chamfered corner -> grass
  if (at(r, c) === "~" || at(r, c) === "t") continue;            // keep water/road
  // border = plot-edge cell (a 4-neighbour leaves the rounded plot) -> follows the outline
  const border = !inPlot(r - 1, c) || !inPlot(r + 1, c) || !inPlot(r, c - 1) || !inPlot(r, c + 1);
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
    base[r][c] = `waystone:${grassTile}`; fringe[r][c] = null;     // grass under structure (sprite covers it)
  }
}
// fence rings block movement along the full perimeter (interior stays walkable)
const blockCell = (r: number, c: number) => {
  if (r < 0 || c < 0 || r >= R || c >= C) return;
  if (at(r, c) === "~" || at(r, c) === "t") return;                // never wall water/road
  ascii[r] = ascii[r].slice(0, c) + "B" + ascii[r].slice(c + 1);
  collision[r][c] = 1;
  base[r][c] = `waystone:${grassTile}`; fringe[r][c] = null;
};
for (const pen of PENS) {
  for (let c = pen.x0; c <= pen.x1; c++) { blockCell(pen.y0, c); blockCell(pen.y1, c); }
  for (let r = pen.y0; r <= pen.y1; r++) { blockCell(r, pen.x0); blockCell(r, pen.x1); }
}
legend.B = `waystone:${grassTile}`;
vocab.B = { ...CHAR_VOCAB.B, minimapColor: avgColor(tileBuf[grassTile]) };

// --- NORTH GATE portal -> Northwood -----------------------------------------
// The engine's portalFor() already routes floor-0 tile 'N' -> Northwood (floor 3), and
// Northwood's 'S' returns the player to Waystone's north-gate lane (37.5,4.5). That 'N'
// gate char was lost when this bridge stage replaced the old procedural hub (the removed
// "placeholder gate" Alex flagged). Re-stamp it on the northernmost gate road cells; the
// road visual is kept, only the semantic char + portal routing change.
const NORTH_GATE: Array<[number, number]> = [[0, 36], [0, 37], [0, 38], [0, 39]];
const GATE_PORTAL = { x: 37, y: 0, to: "Northwood" };
for (const [r, c] of NORTH_GATE) {
  if (ascii[r]?.[c] === undefined) continue;
  ascii[r] = ascii[r].slice(0, c) + "N" + ascii[r].slice(c + 1);
  collision[r][c] = 0;                                            // walkable trigger
}
const gateRoadTile = canonTile.t ?? grassTile;
legend.N = `waystone:${gateRoadTile}`;
vocab.N = { role: "portal-north", blocked: false, sightBlocked: false, road: true, minimapColor: avgColor(tileBuf[gateRoadTile]) };

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
  requiredPortals: { N: GATE_PORTAL },
  requiredWalkable: [],
  chars: { ...vocab },
};
writeFileSync(nodePath.join(repoRoot, "assetsources/asset-forge/waystone.vocab.json"), JSON.stringify(fullVocab, null, 2));

const counts = { water: 0, road: 0, grass: 0, beach: 0, void: 0, wall: 0, ladder: 0 } as Record<string, number>;
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) counts[kind[r][c] === "plateau" ? "grass" : kind[r][c]]++;
console.log(`waystone stage -> ${C}x${R}; tileset ${N} tiles (${PACK_COLS}x${packRows}); ${objects.length} objects; cells:`, counts);
