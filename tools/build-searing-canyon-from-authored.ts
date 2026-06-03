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

// =============================================================================
// SEARING CANYON BAKER — M1 SKELETON (cloned from build-waystone-from-authored.ts)
// =============================================================================
// Repointed to the hand-authored canyon data (M0). NOT yet bakeable — it still needs
// the M1 art + engine work below. This clone is the starting frame, not the finished
// baker; the Waystone-village passes are desert-WRONG and must be replaced.
//
// RECOLOR CONSTRAINTS (sub-task 1 — source sheets to recolor/repoint):
//   grass ground-fill  ->  ORANGE sun-baked CRACKED EARTH  (was bright green)
//   road / path tiles  ->  LIGHTER SANDY TRAIL             (was packed brown dirt)
//   water (water-wang) ->  TEAL / TURQUOISE SULFUR water   (already close; warm the banks)
//   plateau-top/faces  ->  RED COLUMNAR SANDSTONE          (new cliff-red.png, see asset-gaps)
//
// CANYON TODO (replace before this bakes):
//   [ ] swap sliced sheets for recolored canyon variants (grass/road/water) + cliff-red.png
//   [ ] generalize dropS -> drop(r,c,dir) for S/E/W faces (searing-canyon-engine-plan.md)
//   [ ] rip out village passes: pine tree-line + clusters, cow PENS, crop FIELD, market PLAZA
//   [ ] add canyon set-pieces (outpost / ritual / cultist camp / mine rig) + cactus scatter
//   [ ] repoint output: searing-canyon.png / .tileset.json / .stage.json / .vocab.json
// =============================================================================

// ---- inputs ----------------------------------------------------------------
const layoutPath = nodePath.join(repoRoot, "assetsources/searing-canyon/layout-authored.txt");
const rows = readFileSync(layoutPath, "utf8").replace(/\n$/, "").split("\n").map((r) => r.split(""));
const R = rows.length, C = rows[0].length, W = C * ts, H = R * ts;
const elev = readFileSync(nodePath.join(repoRoot, "assetsources/searing-canyon/elevation.txt"), "utf8")
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
// M2 set-piece landmarks. Sprite files are PLACEHOLDER colour boxes at the canonical kit
// paths (tools/make_landmark_placeholders.py); the real sliced kits overwrite them in place.
// Anchors are bottom-center tx,ty on the M0-flattened pads -> no mid-cliff float. See
// docs/searing-canyon-asset-gaps.md §1b.
const LANDMK = "assetsources/curated/bespoke/searing-canyon-landmarks-v1";
const PLACEMENTS: Place[] = [
  // --- OUTPOST (pad cols 60-101 x rows 0-20) ---
  B("spriteOutpostTentChief", `${LANDMK}/tent_chief.png`, 200, 280, 80, 12, 200, [5, 3]),
  B("spriteOutpostTentRaider", `${LANDMK}/tent_raider.png`, 120, 176, 69, 7, 120, [3, 2]),
  B("spriteOutpostTentRaider", `${LANDMK}/tent_raider.png`, 120, 176, 92, 8, 120, [3, 2]),
  B("spriteOutpostTower", `${LANDMK}/watchtower.png`, 112, 224, 63, 5, 112, [2, 3]),
  B("spriteOutpostTower", `${LANDMK}/watchtower.png`, 112, 224, 98, 6, 112, [2, 3]),
  B("spriteSkullTotem", `${LANDMK}/skull_totem.png`, 40, 112, 75, 9, 36),
  B("spriteSkullTotem", `${LANDMK}/skull_totem.png`, 40, 112, 86, 10, 36),
  // --- CULTIST CAMP (pad cols 2-22 x rows 0-13) ---
  B("spriteCultTent", `${LANDMK}/tent_cult.png`, 120, 176, 12, 9, 120, [3, 2]),
  B("spriteCanyonCampfire", `${LANDMK}/campfire.png`, 56, 56, 8, 11, 48),
  B("spriteSkullTotemTall", `${LANDMK}/skull_totem_tall.png`, 40, 128, 5, 7, 36),
  B("spriteSkullTotemTall", `${LANDMK}/skull_totem_tall.png`, 40, 128, 18, 8, 36),
  // --- RITUAL CIRCLE (pad cols 46-60 x rows 22-33) ---
  B("spriteRitualRune", `${LANDMK}/rune_core.png`, 112, 112, 53, 28, 96),       // walkable center
  B("spriteRitualArch", `${LANDMK}/arch_stone.png`, 88, 144, 47, 26, 80, [2, 2]),
  B("spriteRitualArch", `${LANDMK}/arch_stone.png`, 88, 144, 59, 27, 80, [2, 2]),
  B("spriteRitualArch", `${LANDMK}/arch_stone.png`, 88, 144, 53, 23, 80, [2, 2]),
  // --- MINING FACILITY (pad cols 75-109 x rows 40-68; rear cliff ~row 40) ---
  B("spriteCaveMouth", `${LANDMK}/cave_mouth.png`, 128, 128, 84, 42, 120, [3, 2]),
  B("spriteCaveMouth", `${LANDMK}/cave_mouth.png`, 128, 128, 98, 43, 120, [3, 2]),
  B("spriteMineScaffold", `${LANDMK}/scaffold_crane.png`, 176, 208, 90, 52, 168, [5, 3]),
  B("spriteMinecart", `${LANDMK}/minecart.png`, 56, 48, 88, 58, 52),
  B("spriteBarrelStack", `${LANDMK}/barrel_stack.png`, 56, 64, 95, 60, 50, [1, 1]),
  B("spriteBarrelStack", `${LANDMK}/barrel_stack.png`, 56, 64, 80, 55, 50, [1, 1]),
];
// Generic fence/palisade ring: one bottom-center segment sprite stamped on every cell of a
// pad-border box. Collision is set separately by the perimeter blockCell loop, so the interior
// stays walkable (the trail crossing the border reads as the gate gap). Reusable for any future
// walled compound (outpost palisade today).
type Box = { x0: number; y0: number; x1: number; y1: number };
const fenceRing = (b: Box, key: string, file: string, nw: number, nh: number, dispW: number): Place[] => {
  const out: Place[] = [];
  const seg = (x: number, y: number) => B(key, file, nw, nh, x, y, dispW);
  for (let x = b.x0; x <= b.x1; x++) { out.push(seg(x, b.y0)); out.push(seg(x, b.y1)); }
  for (let y = b.y0 + 1; y < b.y1; y++) { out.push(seg(b.x0, y)); out.push(seg(b.x1, y)); }
  return out;
};
const OUTPOST_BOX: Box = { x0: 60, y0: 0, x1: 101, y1: 20 };
PLACEMENTS.push(...fenceRing(OUTPOST_BOX, "spritePalisade", `${LANDMK}/palisade_seg.png`, 64, 80, 64));
// Empty stub so downstream PENS loops are no-ops (cow/goose pens stripped with the village).
const PENS: { x0: number; y0: number; x1: number; y1: number }[] = [];

// de-speckle water (identical to compositor)
const wn = (r: number, c: number) => at(r, c) === "~";
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (rows[r][c] !== "~") continue;
  const n = (wn(r - 1, c) ? 1 : 0) + (wn(r + 1, c) ? 1 : 0) + (wn(r, c - 1) ? 1 : 0) + (wn(r, c + 1) ? 1 : 0);
  if (n < 2) rows[r][c] = "F";
}
const isW = (r: number, c: number) => at(r, c) === "~";
const isR = (r: number, c: number) => at(r, c) === "t";

// ---- multi-direction cliff engine (elevation-derived drops) ----------------
// MULTI-DIRECTION drop: a cell higher than its neighbour in `dir` drops a wall onto the
// LOW neighbour cell, stacked downward for height. N is rim-only (occluded) so not faced.
// These are consumed by the cliff RENDER pass and stairs below.
type Dir = "S" | "E" | "W";
const DELTA: Record<Dir, [number, number]> = { S: [1, 0], E: [0, 1], W: [0, -1] };
const drop = (r: number, c: number, dir: Dir) => {
  const [dr, dc] = DELTA[dir];
  return Math.max(0, eh(r, c) - eh(r + dr, c + dc));
};
const dropS = (r: number, c: number) => drop(r, c, "S");   // back-compat alias (stairs)
// the LOW neighbour cell a wall of height `total` starts in, for a given source+dir
const lowCell = (r: number, c: number, dir: Dir): [number, number] => {
  const [dr, dc] = DELTA[dir];
  return [r + dr, c + dc];
};

// ---- atlases ---------------------------------------------------------------
const sliced = (name: string) => PNG.sync.read(readFileSync(nodePath.join(repoRoot, `assetsources/curated/sliced/${name}`)));
const water = sliced("water-wang.png");
const road = sliced("road-wang.png");
const ptop = sliced("plateau-top-v2.png");
// Red columnar cliff set (PLACEHOLDER solid-colour fills until cliff-red.png is forged).
// One sheet, sub-cropped into the three face groups by tile region.
const crop = (sheet: PNG, c0: number, r0: number, wc: number, hr: number) => {
  const sub = new PNG({ width: wc * ts, height: hr * ts });
  for (let y = 0; y < hr * ts; y++) for (let x = 0; x < wc * ts; x++) {
    const si = (((r0 * ts) + y) * sheet.width + (c0 * ts) + x) * 4, di = (y * sub.width + x) * 4;
    sub.data[di] = sheet.data[si]; sub.data[di + 1] = sheet.data[si + 1];
    sub.data[di + 2] = sheet.data[si + 2]; sub.data[di + 3] = sheet.data[si + 3];
  }
  return sub;
};
const cliffRed = sliced("cliff-red.png");
const face = crop(cliffRed, 0, 0, 5, 3);   // Group B SOUTH: 5col[Lcap,str,Rcap,innerL,innerR] x 3row[top,mid,base]
const faceSide = crop(cliffRed, 0, 3, 2, 3); // Group C SIDE: 2col[facing-left,facing-right] x 3row[top,mid,base]
const caps = crop(cliffRed, 2, 3, 4, 1);   // Group D CAPS: 4col[NE,NW,SE,SW] x 1row
const ladder = sliced("ladder.png");       // 1col x 3row[top,mid,base] wooden stairs
const FCOLS = 5, SCOLS = 2;
const wCols = water.width / ts, rCols = road.width / ts, PTCOLS = ptop.width / ts;
// optional bespoke grass-variation atlas (8x1). Falls back to the single ptop grass tile
// until tools/slice-grass-v1.py has produced it. See bespoke/waystone-grass-v1/PROMPT.md.
const grassVarPath = nodePath.join(repoRoot, "assetsources/curated/sliced/grass-v1.png");
const grassVar = existsSync(grassVarPath) ? PNG.sync.read(readFileSync(grassVarPath)) : null;
const GVCOLS = grassVar ? grassVar.width / ts : 0;
// PLACEHOLDER desert recolor: green -> orange sun-baked cracked-earth, applied in-place to the
// ground source buffers so every downstream blit (ground fill + plateau rim) paints warm clay.
// Stays until the real orange cracked-earth sheet is forged (assetsources/curated/sliced/*).
const desertRecolor = (img: PNG) => {
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const L = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    img.data[i]     = Math.min(255, Math.round(L * 1.45 + 38)); // R up  -> sun-baked
    img.data[i + 1] = Math.min(255, Math.round(L * 0.80 + 8));  // G down
    img.data[i + 2] = Math.min(255, Math.round(L * 0.45));      // B low -> warm clay
  }
};
desertRecolor(ptop);
if (grassVar) desertRecolor(grassVar);
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
  // SOUTH face (proven path): horizontal-run wall stacked in the cells BELOW, column c.
  const dS = drop(r, c, "S");
  if (dS > 0) {
    const col = drop(r, c - 1, "S") <= 0 ? 0 : drop(r, c + 1, "S") <= 0 ? 2 : 1; // Lcap / straight / Rcap
    const total = Math.min(CLIFF_MAX_WALL_TILES, 1 + dS);
    wallTotal[r][c] = total;
    shadows.push({ c, baseY: (r + total + 1) * ts - 4, s: Math.min(1, dS / 2) });
    for (let h = 0; h < total; h++) {
      const wr = r + 1 + h; if (wr >= R) break;
      const rowKind = h === 0 ? 0 : h === total - 1 ? 2 : 1;          // top / mid / base course
      blitTile(face, FCOLS, rowKind * FCOLS + col, c * ts, wr * ts);
      if (kind[wr][c] !== "void" && kind[wr][c] !== "water") { kind[wr][c] = "wall"; blocked[wr][c] = true; }
    }
    if (at(r, c) === "t" || at(r - 1, c) === "t") stairCand[r][c] = true;
  }
  // EAST / WEST side faces (NEW): vertical-run wall in the LOW neighbour column (c±1),
  // stacked downward for height. sideCol 1=facing-right (east drop), 0=facing-left (west).
  for (const dir of ["E", "W"] as Dir[]) {
    const d = drop(r, c, dir); if (d <= 0) continue;
    const [lr, lc] = lowCell(r, c, dir);                              // (r, c+1) east / (r, c-1) west
    if (lc < 0 || lc >= C) continue;
    const sideCol = dir === "E" ? 1 : 0;
    const total = Math.min(CLIFF_MAX_WALL_TILES, 1 + d);
    for (let h = 0; h < total; h++) {
      const wr = lr + h; if (wr >= R) break;
      const rowKind = h === 0 ? 0 : h === total - 1 ? 2 : 1;
      blitTile(faceSide, SCOLS, rowKind * SCOLS + sideCol, lc * ts, wr * ts);
      if (kind[wr][lc] !== "void" && kind[wr][lc] !== "water") { kind[wr][lc] = "wall"; blocked[wr][lc] = true; }
    }
    // convex corner cap where a south face meets this side face (verification-grade).
    if (dS > 0) {
      const cr = r + 1, cc = dir === "E" ? c + 1 : c - 1, capIdx = dir === "E" ? 2 : 3; // SE / SW
      if (cr < R && cc >= 0 && cc < C) blitTile(caps, 4, capIdx, cc * ts, cr * ts);
    }
  }
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
// ---- tile overlays: append landmark fringe tiles (ritual floor, mine track) ----------------
// Generalized crop-field-style overlay: each file becomes an extra tileset entry, written into
// the fringe layer over target cells later. Walkable (no collision) -- the floor reads under
// the depth-sorted set-piece sprites.
const OVERLAY_IDX: Record<string, number> = {};
const overlayTile = (name: string, file: string) => {
  const p = PNG.sync.read(readFileSync(nodePath.join(repoRoot, file)));
  const buf = Buffer.alloc(ts * ts * 4);
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const si = (Math.min(y, p.height - 1) * p.width + Math.min(x, p.width - 1)) * 4, di = (y * ts + x) * 4;
    buf[di] = p.data[si]; buf[di + 1] = p.data[si + 1]; buf[di + 2] = p.data[si + 2]; buf[di + 3] = p.data[si + 3];
  }
  OVERLAY_IDX[name] = tileBuf.length;
  tileBuf.push(buf); tileBlocked.push(false); tileKind.push("road");
};
overlayTile("ritual_stone", `${LANDMK}/floor_stone.png`);
overlayTile("ritual_edge", `${LANDMK}/floor_edge.png`);
overlayTile("mine_track", `${LANDMK}/track_seg.png`);
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
  legend[ch] = `searing-canyon:${canonTile[ch]}`;
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
    const vis = `searing-canyon:${cellTile[r][c]}`;
    fringeRow.push(vis === legend[ch] ? null : vis);
  }
  ascii.push(line); collision.push(col); base.push(baseRow); fringe.push(fringeRow);
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
    base[r][c] = `searing-canyon:${grassTile}`; fringe[r][c] = null;     // grass under structure (sprite covers it)
  }
}
// fence rings block movement along the full perimeter (interior stays walkable)
const blockCell = (r: number, c: number) => {
  if (r < 0 || c < 0 || r >= R || c >= C) return;
  if (at(r, c) === "~" || at(r, c) === "t") return;                // never wall water/road
  ascii[r] = ascii[r].slice(0, c) + "B" + ascii[r].slice(c + 1);
  collision[r][c] = 1;
  base[r][c] = `searing-canyon:${grassTile}`; fringe[r][c] = null;
};
for (const pen of PENS) {
  for (let c = pen.x0; c <= pen.x1; c++) { blockCell(pen.y0, c); blockCell(pen.y1, c); }
  for (let r = pen.y0; r <= pen.y1; r++) { blockCell(r, pen.x0); blockCell(r, pen.x1); }
}
// outpost palisade perimeter collision (interior walkable; blockCell skips road -> trail gate)
for (let c = OUTPOST_BOX.x0; c <= OUTPOST_BOX.x1; c++) { blockCell(OUTPOST_BOX.y0, c); blockCell(OUTPOST_BOX.y1, c); }
for (let r = OUTPOST_BOX.y0; r <= OUTPOST_BOX.y1; r++) { blockCell(r, OUTPOST_BOX.x0); blockCell(r, OUTPOST_BOX.x1); }

// ---- landmark tile overlays written into the fringe layer (after footprints so floor wins) --
// Generic apply pass: stamp a registered overlay tile (see overlayTile() above) onto a set of
// target cells. Walkable, water-safe; the floor reads under the depth-sorted set-piece sprites.
const overlayTiles = (name: string, cells: Array<[number, number]>) => {
  const idx = OVERLAY_IDX[name];
  if (idx === undefined) return;
  for (const [r, c] of cells) {
    if (fringe[r]?.[c] === undefined || at(r, c) === "~") continue;
    fringe[r][c] = `searing-canyon:${idx}`;
  }
};
// ritual circle: basalt disc with a rune-etched edge ring (two registered tiles, split by radius)
const RITUAL = { cx: 53, cy: 28, rad: 6 };
const ritualStone: Array<[number, number]> = [], ritualEdge: Array<[number, number]> = [];
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const dist = Math.hypot(c - RITUAL.cx, r - RITUAL.cy);
  if (dist > RITUAL.rad) continue;
  (dist > RITUAL.rad - 1.2 ? ritualEdge : ritualStone).push([r, c]);
}
overlayTiles("ritual_stone", ritualStone);
overlayTiles("ritual_edge", ritualEdge);
// mine rail: cave-mouth -> scaffold line
const TRACK: Array<[number, number]> = [[43, 84], [46, 86], [49, 88], [52, 90]]; // [row,col] cave -> scaffold
overlayTiles("mine_track", TRACK);
legend.B = `searing-canyon:${grassTile}`;
vocab.B = { ...CHAR_VOCAB.B, minimapColor: avgColor(tileBuf[grassTile]) };

// NOTE: No north-gate portal. Searing Canyon owns its mechanical boundaries; the
// vestigial Waystone -> Northwood 'N' portal pass was stripped so no stray Waystone
// transition logic clobbers the canyon's engine states.

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
// WRITE OUTPUTS  (repointed off waystone so the verification bake can't clobber the locked
// Waystone export. M1 verification dumps the full composited map for eyeballing wall columns.)
// ===========================================================================
const exportDir = nodePath.join(repoRoot, "assetsources/asset-forge/exports/searing-canyon");
mkdirSync(exportDir, { recursive: true });
// Verification preview: the full WxH composited terrain map (NOT the packed tileset). Objects
// are normally rendered by the engine from stage.json, so for the M2 landmark test we also
// composite the placeholder sprites onto the preview here, bottom-center anchored + depth
// sorted, to eyeball placement on the pads. (Debug-only; engine ignores this PNG.)
const previewCache = new Map<string, PNG>();
for (const p of [...PLACEMENTS].sort((a, b) => a.ty - b.ty)) {
  if (!p.file) continue;
  let spr = previewCache.get(p.file);
  if (!spr) { spr = PNG.sync.read(readFileSync(nodePath.join(repoRoot, p.file))); previewCache.set(p.file, spr); }
  const dw = p.dispW, dh = Math.round((p.dispW * p.nh) / p.nw);
  const x0 = Math.round((p.tx + 0.5) * ts - dw / 2), y0 = (p.ty + 1) * ts - dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const px = x0 + x, py = y0 + y; if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const sx = Math.min(spr.width - 1, Math.floor((x * spr.width) / dw));
    const sy = Math.min(spr.height - 1, Math.floor((y * spr.height) / dh));
    const si = (sy * spr.width + sx) * 4; if (spr.data[si + 3] < 20) continue;
    const di = (py * W + px) * 4;
    out.data[di] = spr.data[si]; out.data[di + 1] = spr.data[si + 1]; out.data[di + 2] = spr.data[si + 2]; out.data[di + 3] = 255;
  }
}
writeFileSync(nodePath.join(repoRoot, "assetsources/searing-canyon/_m1_baketest.png"), PNG.sync.write(out));
writeFileSync(nodePath.join(exportDir, "searing-canyon.png"), PNG.sync.write(sheet));
writeFileSync(nodePath.join(exportDir, "searing-canyon.tileset.json"), JSON.stringify({ schema: "asset-forge/tileset@1", name: "searing-canyon", image: "searing-canyon.png", tileSize: ts, columns: PACK_COLS, rows: packRows, tiles: Array.from({ length: N }, (_, i) => ({ index: i, role: ROLE_BY_KIND[tileKind[i]], blocked: tileBlocked[i] })) }, null, 2));

const stage = {
  schema: "asset-forge/stage@1",
  name: "searing-canyon",
  tileSize: ts,
  cols: C,
  rows: R,
  tilesets: [{ name: "searing-canyon", image: "searing-canyon.png", manifest: "searing-canyon.tileset.json" }],
  layers: [{ name: "base", type: "tile", data: base }, { name: "fringe", type: "tile", data: fringe }],
  collision,
  objects,
  ascii: { legend, rows: ascii },
};
writeFileSync(nodePath.join(exportDir, "searing-canyon.stage.json"), JSON.stringify(stage));

const fullVocab = {
  zone: "searing-canyon",
  floor: 0,
  stageName: "searing-canyon",
  description: "Searing Canyon authored-layout bridge (M1 terrain pass, WIP): multi-direction cliff faces from elevation deltas. Village clutter passes still inherited from waystone clone, pending strip.",
  requiredPortals: {},
  requiredWalkable: [],
  chars: { ...vocab },
};
writeFileSync(nodePath.join(repoRoot, "assetsources/asset-forge/searing-canyon.vocab.json"), JSON.stringify(fullVocab, null, 2));

const counts = { water: 0, road: 0, grass: 0, beach: 0, void: 0, wall: 0, ladder: 0 } as Record<string, number>;
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) counts[kind[r][c] === "plateau" ? "grass" : kind[r][c]]++;
console.log(`searing-canyon stage -> ${C}x${R}; tileset ${N} tiles (${PACK_COLS}x${packRows}); ${objects.length} objects; cells:`, counts);
