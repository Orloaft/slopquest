// Skeleton render + scattered real tree sprites (painter's algorithm) + water de-speckle.
// Layers: water corner-Wang dual-grid, roads edge-Wang, grass; then conifer/leafy sprites
// on thinned tree-classified cells, drawn back-to-front (origin bottom-center).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
// ============================================================================
// WORLD-CRAFTING TUNABLES — production-locked 2026-06-02 (see world_crafting_spec.md).
// These are the only knobs the Northwood aesthetic depends on. Retune here, not inline.
// ============================================================================
const TILE_SIZE = 32;                                  // px per tile
const TREE_TARGET_W_PX = 60;                           // tree sprite width (~1.9 tiles); height keeps aspect
const TREE_MIN_SPACING_CELLS = 2;                      // greedy THINNING: no two kept trees within this Chebyshev box (spacing, NOT clustering)
const ENVIRO_PROP_DENSITY_GATE = 0.16;                 // per open-grass-cell chance a decoration prop is placed (locked per review)
const PROP_MIN_SPACING_CELLS = 2;                      // min Chebyshev spacing between placed props
const ROAD_DITHER_EDGE_PX = 3;                         // depth (px) the trail/grass stipple reaches inward
const ROAD_DITHER_PROB_BY_DEPTH = [0.20, 0.10, 0.04]; // stipple chance per px of depth (edge -> inward); length must == ROAD_DITHER_EDGE_PX
const CLIFF_AO_BAND_PX = 14;                           // height (px) of the soft contact shadow below a wall foot
const CLIFF_AO_MAX_DARKEN = 0.4;                       // peak multiplicative darkening at the wall foot (scaled by drop strength)
const CLIFF_MAX_WALL_TILES = 4;                        // tallest cliff face (lip + faces + base); caps with drop height
const ts = TILE_SIZE;
import { existsSync } from "node:fs";
const authored = nodePath.join(repoRoot, "assetsources/mockup/layout-authored.txt");
const layoutPath = existsSync(authored) ? authored : nodePath.join(repoRoot, "assetsources/mockup/layout.txt");
let rows = readFileSync(layoutPath, "utf8").replace(/\n$/, "").split("\n").map((r) => r.split(""));
const R = rows.length, C = rows[0].length, W = C * ts, H = R * ts;
const water = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "assetsources/curated/sliced/water-wang.png")));
const road = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "assetsources/curated/sliced/road-wang.png")));
const wCols = water.width / ts, rCols = road.width / ts;
const at = (r: number, c: number) => (r >= 0 && c >= 0 && r < R && c < C ? rows[r][c] : "^");
// elevation field (shared by the plateau-top tint and the cliff walls)
const elev = readFileSync(nodePath.join(repoRoot, "assetsources/mockup/elevation.txt"), "utf8")
  .replace(/\n$/, "").split("\n").map((l) => l.split("").map(Number));
const eh = (r: number, c: number) => (r >= 0 && c >= 0 && r < R && c < C ? elev[r][c] : 0);
const topLvl = Math.max(...elev.flat());

// --- de-speckle water: a water cell with <2 orthogonal water neighbours becomes grass ---
const wn = (r: number, c: number) => at(r, c) === "~";
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (rows[r][c] !== "~") continue;
  const n = (wn(r - 1, c) ? 1 : 0) + (wn(r + 1, c) ? 1 : 0) + (wn(r, c - 1) ? 1 : 0) + (wn(r, c + 1) ? 1 : 0);
  if (n < 2) rows[r][c] = "F";
}
const isW = (r: number, c: number) => at(r, c) === "~";
const isR = (r: number, c: number) => at(r, c) === "t";

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
// deterministic per-pixel hash in [0,1) — stable dithering that doesn't depend on draw order
const hrand = (a: number, b: number) => {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h >>> 0) % 100000) / 100000;
};
for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
  const m = (isW(i - 1, j - 1) ? 1 : 0) | (isW(i - 1, j) ? 2 : 0) | (isW(i, j) ? 4 : 0) | (isW(i, j - 1) ? 8 : 0);
  blitTile(water, wCols, m, Math.round((j - 0.5) * ts), Math.round((i - 0.5) * ts));
}
// --- plateau tops (BESPOKE plateau-top-v2, 16-tile EDGE autotile): stamp the real grassy
// plateau surface with a rocky rim on each side that drops to lower ground. For every raised
// tier L, membership = eh>=L; mask = N1|E2|S4|W8 of "neighbour is also >=L" (set bit = the
// ground continues, no rim). The sheet's cell order fixes position->mask, so maskToIdx inverts
// it (e.g. mask 15 = fully surrounded = idx 0 EDGE-NONE; mask 0 = isolated = idx 15 EDGE-ALL).
// Higher tiers stamp last so a tier-1/tier-2 step terraces with its own rim. This replaces the
// old colour-tint fake that produced the "checkerboard" plateau. ---
const ptop = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "assetsources/curated/sliced/plateau-top-v2.png")));
const PTCOLS = ptop.width / ts;
const maskToIdx = [15, 13, 14, 7, 12, 10, 8, 4, 11, 6, 9, 3, 5, 2, 1, 0];
for (let L = 1; L <= topLvl; L++) {
  const up = (r: number, c: number) => eh(r, c) >= L;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (!up(r, c)) continue;
    const ch = at(r, c); if (ch === "~" || ch === "^" || ch === ".") continue; // skip water/void/beach
    const mask = (up(r - 1, c) ? 1 : 0) | (up(r, c + 1) ? 2 : 0) | (up(r + 1, c) ? 4 : 0) | (up(r, c - 1) ? 8 : 0);
    blitTile(ptop, PTCOLS, maskToIdx[mask], c * ts, r * ts);
  }
}
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (!isR(r, c)) continue;
  const m = (isR(r - 1, c) ? 1 : 0) | (isR(r, c + 1) ? 2 : 0) | (isR(r + 1, c) ? 4 : 0) | (isR(r, c - 1) ? 8 : 0);
  blitTile(road, rCols, m, c * ts, r * ts);
}
// --- road edge dither: soften the hard trail/grass tile boundary by stippling a few of the
// outer-edge road pixels back to the grass colour just across the seam (weathered-path look).
// ~20% at the very edge, tapering inward over 3px; only on sides that face open grass. ---
const isGrassCell = (r: number, c: number) => { const ch = at(r, c); return ch === "F" || ch === "f"; };
const dprob = ROAD_DITHER_PROB_BY_DEPTH;
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (!isR(r, c)) continue;
  const sides = [isGrassCell(r - 1, c) && "N", isGrassCell(r + 1, c) && "S", isGrassCell(r, c - 1) && "W", isGrassCell(r, c + 1) && "E"].filter(Boolean) as string[];
  for (const side of sides) for (let d = 0; d < ROAD_DITHER_EDGE_PX; d++) for (let t = 0; t < ts; t++) {
    let px: number, py: number, sx: number, sy: number;
    if (side === "N") { px = c * ts + t; py = r * ts + d; sx = px; sy = r * ts - 1 - d; }
    else if (side === "S") { px = c * ts + t; py = (r + 1) * ts - 1 - d; sx = px; sy = (r + 1) * ts + d; }
    else if (side === "W") { px = c * ts + d; py = r * ts + t; sx = c * ts - 1 - d; sy = py; }
    else { px = (c + 1) * ts - 1 - d; py = r * ts + t; sx = (c + 1) * ts + d; sy = py; }
    if (hrand(px, py) > dprob[d]) continue;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const di = (py * W + px) * 4, si = (sy * W + sx) * 4; if (out.data[si + 3] === 0) continue;
    out.data[di] = out.data[si]; out.data[di + 1] = out.data[si + 1]; out.data[di + 2] = out.data[si + 2];
  }
}
// beach: sand fill on '.' cells (subtle noise) — first pass before proper sand-shore tiles
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (at(r, c) !== ".") continue;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    const n = (((r * ts + y) * 73 + (c * ts + x) * 31) % 17) - 8;
    const di = ((r * ts + y) * W + (c * ts + x)) * 4;
    out.data[di] = 222 + n; out.data[di + 1] = 200 + n; out.data[di + 2] = 150 + n; out.data[di + 3] = 255;
  }
}
// border void
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (at(r, c) !== "^") continue;
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) { const di = ((r * ts + y) * W + (c * ts + x)) * 4; out.data[di] = 26; out.data[di + 1] = 42; out.data[di + 2] = 58; out.data[di + 3] = 255; }
}

// --- cliffs: south-facing rock walls at every step-DOWN in the integer elevation field ---
// elevation.txt (from derive_elevation.py) holds a per-cell height; a wall whose tile-height
// scales with the drop is placed in the lower cells below each south-facing edge. Wall art =
// BESPOKE cliff-face set (Group B): 5 cols [Lcap, straight, Rcap, inner-L, inner-R] x 3 rows
// [top(grassy lip), mid(repeating face), base(rubble)]. idx = row*5 + col.
const face = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "assetsources/curated/sliced/cliff-face.png")));
const ladder = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "assetsources/curated/sliced/ladder.png")));
const FCOLS = 5;
const dropS = (r: number, c: number) => Math.max(0, eh(r, c) - eh(r + 1, c)); // south-facing step-down
const noTree = new Set<string>(); // cells kept clear so trees don't bury a stair
// 1. draw all walls; record which cells touch a path on their lip (stair candidates)
const stairCand: boolean[][] = Array.from({ length: R }, () => new Array(C).fill(false));
const wallTotal: number[][] = Array.from({ length: R }, () => new Array(C).fill(0));
const shadows: Array<{ c: number; baseY: number; s: number }> = []; // contact shadow at each wall foot
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  const d = dropS(r, c);
  if (d <= 0) continue;
  const col = dropS(r, c - 1) <= 0 ? 0 : dropS(r, c + 1) <= 0 ? 2 : 1; // Lcap / straight / Rcap
  const total = Math.min(CLIFF_MAX_WALL_TILES, 1 + d); // taller drop -> taller wall (lip + faces + base)
  wallTotal[r][c] = total;
  shadows.push({ c, baseY: (r + total + 1) * ts - 4, s: Math.min(1, d / 2) });
  for (let h = 0; h < total; h++) {
    const wr = r + 1 + h; if (wr >= R) break;
    const rowKind = h === 0 ? 0 : h === total - 1 ? 2 : 1; // top / base / mid
    blitTile(face, FCOLS, rowKind * FCOLS + col, c * ts, wr * ts);
    noTree.add(`${wr},${c}`); // keep the wall face clear so the cliff line reads continuously
  }
  if (at(r, c) === "t" || at(r - 1, c) === "t") stairCand[r][c] = true; // a path meets the cliff
}
// 2. collapse each contiguous run of lip-touching cells (same drop row) into ONE ladder at the
// run centre -- a road running along a lip yields a single ladder, not a wall of steps. Ladder
// art (Group C): 1 col x 3 rows [top, mid, base], blitted over the wall column it climbs.
function paintStair(c: number, wr: number, rowKind: number) {
  blitTile(ladder, 1, rowKind, c * ts, wr * ts); // 0 top / 1 mid / 2 base
}
let stairCount = 0;
for (let r = 0; r < R; r++) {
  let c = 0;
  while (c < C) {
    if (!stairCand[r][c]) { c++; continue; }
    const c0 = c; while (c < C && stairCand[r][c]) c++;
    const cc = Math.floor((c0 + c - 1) / 2); // run centre
    const total = wallTotal[r][cc] || 2;
    stairCount++;
    for (let h = 0; h < total; h++) {
      const wr = r + 1 + h; if (wr >= R) break;
      paintStair(cc, wr, h === 0 ? 0 : h === total - 1 ? 2 : 1); // top / base / mid
    }
    for (let dr = -1; dr <= total + 2; dr++) for (let dc = -1; dc <= 1; dc++) noTree.add(`${r + dr},${cc + dc}`);
  }
}
// --- contact shadow (AO): a soft, dithered dark band at the foot of every cliff wall so the
// rock meets the lower ground with a gradient instead of a hard 1px line. Denser at the wall
// base, thinning out downward via a per-pixel dither threshold. ---
const SH = CLIFF_AO_BAND_PX;
for (const sh of shadows) for (let dy = 0; dy < SH; dy++) for (let x = 0; x < ts; x++) {
  const px = sh.c * ts + x, py = sh.baseY + dy;
  if (px < 0 || py < 0 || px >= W || py >= H) continue;
  if (hrand(px, py) > (1 - dy / SH) * 0.92 + 0.06) continue; // top rows nearly solid, tail sparse
  const di = (py * W + px) * 4; if (out.data[di + 3] === 0) continue;
  const fall = (1 - dy / SH) * CLIFF_AO_MAX_DARKEN * sh.s;
  out.data[di] = Math.round(out.data[di] * (1 - fall));
  out.data[di + 1] = Math.round(out.data[di + 1] * (1 - fall));
  out.data[di + 2] = Math.round(out.data[di + 2] * (1 - fall));
}

// --- trees: scatter sprites on thinned tree cells, painter's order ---
const TREE_IDS = [7, 8, 84, 89, 6, 85, 90]; // conifers + leafy variety
const trees = TREE_IDS.map((id) => {
  const p = PNG.sync.read(readFileSync(nodePath.join(repoRoot, `assetsources/curated/objects/obj_${String(id).padStart(3, "0")}.png`)));
  // scale so width ~= 1.9 tiles (~60px), keep aspect
  const targetW = TREE_TARGET_W_PX; const sc = targetW / p.width;
  return { p, w: p.width, h: p.height, sc };
});
function blitSprite(t: { p: PNG; w: number; h: number; sc: number }, cx: number, baseY: number, seed: number) {
  const dw = Math.round(t.w * t.sc), dh = Math.round(t.h * t.sc);
  const dx0 = Math.round(cx - dw / 2), dy0 = baseY - dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sxp = Math.min(t.w - 1, Math.floor(x / t.sc)), syp = Math.min(t.h - 1, Math.floor(y / t.sc));
    const si = (syp * t.p.width + sxp) * 4; const a = t.p.data[si + 3]; if (a === 0) continue;
    // drop residual purple drop-shadow pixels the extractor's chroma key was too strict to
    // catch (magenta/purple = red & blue present, green suppressed) -> the "halo" under trees
    const sr = t.p.data[si], sg = t.p.data[si + 1], sb = t.p.data[si + 2];
    if (sr > 55 && sb > 55 && sg < Math.min(sr, sb) - 18) continue;
    const px = dx0 + x, py = dy0 + y; if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const di = (py * W + px) * 4; const sa = a / 255;
    out.data[di] = Math.round(t.p.data[si] * sa + out.data[di] * (1 - sa));
    out.data[di + 1] = Math.round(t.p.data[si + 1] * sa + out.data[di + 1] * (1 - sa));
    out.data[di + 2] = Math.round(t.p.data[si + 2] * sa + out.data[di + 2] * (1 - sa));
    out.data[di + 3] = 255;
  }
}
// thin tree cells: keep a tree only if no kept tree within MINDIST cells (greedy by reading order)
const MINDIST = TREE_MIN_SPACING_CELLS;
const placed: Array<{ r: number; c: number }> = [];
const placements: Array<{ r: number; c: number; id: number }> = [];
let pseudo = 1234567;
const rand = () => { pseudo = (pseudo * 1103515245 + 12345) & 0x7fffffff; return pseudo / 0x7fffffff; };
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (at(r, c) !== "f") continue;
  if (noTree.has(`${r},${c}`)) continue; // don't bury a stair
  let ok = true;
  for (const p of placed) { if (Math.abs(p.r - r) < MINDIST && Math.abs(p.c - c) < MINDIST) { ok = false; break; } }
  if (!ok) continue;
  placed.push({ r, c });
  placements.push({ r, c, id: Math.floor(rand() * trees.length) });
}
placements.sort((a, b) => a.r - b.r);
for (const pl of placements) {
  const cx = pl.c * ts + ts / 2 + Math.round((rand() - 0.5) * 10);
  const baseY = pl.r * ts + ts; // base at bottom of cell
  blitSprite(trees[pl.id], cx, baseY, pl.r * 31 + pl.c);
}

// --- decoration scatter: small props on open grass to break up solid green patches. Sparse,
// spaced placement on 'F' cells only, kept clear of trees / stairs / tree cells. Categories:
// mossy boulders, flower tufts, fallen logs, small plants (curated from the object catalogue). ---
const DECO_GROUPS = [
  { ids: [22, 24, 25, 70], w: 26 },           // leafy shrubs + mossy rock
  { ids: [33, 34, 35, 49, 105, 107], w: 22 }, // flower tufts
  { ids: [39, 53, 115], w: 40 },              // fallen logs / stump (116 dome dropped: out of scale)
  { ids: [54, 97], w: 18 },                    // small plants
];
const deco = DECO_GROUPS.flatMap((g) => g.ids.map((id) => {
  const p = PNG.sync.read(readFileSync(nodePath.join(repoRoot, `assetsources/curated/objects/obj_${String(id).padStart(3, "0")}.png`)));
  return { p, w: p.width, h: p.height, sc: g.w / p.width };
}));
const treeCells = new Set(placed.map((p) => `${p.r},${p.c}`));
const decoPlaced: Array<{ r: number; c: number }> = [];
const decoPl: Array<{ r: number; c: number; id: number }> = [];
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
  if (at(r, c) !== "F") continue;               // open grass only
  if (noTree.has(`${r},${c}`)) continue;        // not on a stair clearing
  if (rand() > ENVIRO_PROP_DENSITY_GATE) continue; // density gate
  let ok = true;
  for (const p of decoPlaced) if (Math.abs(p.r - r) < PROP_MIN_SPACING_CELLS && Math.abs(p.c - c) < PROP_MIN_SPACING_CELLS) { ok = false; break; }
  if (ok) for (let dr = -1; dr <= 1 && ok; dr++) for (let dc = -1; dc <= 1; dc++) if (treeCells.has(`${r + dr},${c + dc}`)) { ok = false; break; }
  if (!ok) continue;
  decoPlaced.push({ r, c });
  decoPl.push({ r, c, id: Math.floor(rand() * deco.length) });
}
decoPl.sort((a, b) => a.r - b.r);
for (const pl of decoPl) {
  const cx = pl.c * ts + ts / 2 + Math.round((rand() - 0.5) * 12);
  const baseY = pl.r * ts + ts - 2 + Math.round((rand() - 0.5) * 6);
  blitSprite(deco[pl.id], cx, baseY, pl.r * 17 + pl.c);
}

const outPath = nodePath.join(repoRoot, "artifacts/northwood-trees.png");
mkdirSync(nodePath.dirname(outPath), { recursive: true });
writeFileSync(outPath, PNG.sync.write(out));
console.log(`trees render -> ${outPath} (${W}x${H}); ${placements.length} trees; ${decoPl.length} props; ${stairCount} stairs`);
