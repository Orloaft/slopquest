// Bridge: AUTHORED Sunken Beach (floor 8) layout -> asset-forge stage + atlas.
// ---------------------------------------------------------------------------
// Beach is a DIRECT char->texture stage (no autotiling): the hand-authored
// floor-8 geometry (tools/dump-floor8-layout.ts -> assetsources/beach/
// beach-layout-authored.txt) already bakes every cell into a final char, and
// the runtime renders each char by cropping a fixed rect out of beach-tiles.png.
// So instead of Wang passes we just rebuild ONE 32px tile per char the same way
// main.ts builds its beach textures (inset crop -> magenta chroma-key -> scale,
// underlay composited beneath the base), pack those into beach.png, and emit
// beach.tileset.json + beach.stage.json + beach.vocab.json for
// tools/import-asset-forge-stage.ts. Collision/sight mirror shared.ts exactly so
// the editable stage matches the in-game floor.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const ts = 32;

// ---- inputs ----------------------------------------------------------------
const layoutPath = nodePath.join(repoRoot, process.argv[2] ?? "assetsources/beach/beach-layout-authored.txt");
const rows = readFileSync(layoutPath, "utf8").replace(/\n$/, "").split("\n").map((r) => r.split(""));
const R = rows.length, C = rows[0].length;
const sheet = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "public/beach-tiles.png")));

// ---- char model (MUST match shared.ts isBlockedTile / isSightBlocked) ------
const WATER = new Set(["I", "!", "?", "=", "v", "{", "}", "(", ")"]); // blocked, sight-OPEN
const CLIFF = new Set(["x", "0", "1", "|", "u"]);                      // blocked + sight-blocked
const ROAD = new Set(["z", "Y", "j"]);                                 // walkable paths
const blockedChar = (ch: string) => WATER.has(ch) || CLIFF.has(ch);
const sightChar = (ch: string) => CLIFF.has(ch);

const ROLE: Record<string, string> = {
  e: "beach-sand", l: "beach-shell-sand", ",": "beach-wet-sand", ";": "beach-ripple-sand",
  z: "beach-path", "2": "beach-stairs", "[": "beach-stairs-left", "]": "beach-stairs-right",
  x: "beach-cliff", "0": "beach-cliff-left", "1": "beach-cliff-right", "|": "beach-rock-wall",
  u: "beach-rock", v: "beach-lagoon", "{": "beach-lagoon", "}": "beach-lagoon", "(": "beach-lagoon",
  ")": "beach-lagoon", "=": "beach-shallow", I: "beach-ocean", "!": "beach-ocean-ripple",
  "?": "beach-ocean-rock", Y: "portal-desert", j: "portal-jungle"
};

// ---- texture rects in beach-tiles.png (mirrors main.ts makeTileTexture) -----
// [sx, sy, sw, sh, inset?, preserve?]  inset default = min(10, sw/5, sh/5).
type Tex = [number, number, number, number, number?, boolean?];
const TEX: Record<string, Tex> = {
  tileBeachSand: [20, 99, 70, 72], tileBeachRippleSand: [100, 99, 70, 72],
  tileBeachShellSand: [180, 99, 72, 72], tileBeachPebbleSand: [260, 99, 72, 72],
  tileBeachWetSand: [20, 180, 70, 72], tileBeachPath: [96, 402, 70, 72],
  tileBeachStairsMid: [462, 864, 72, 82, 0, true], tileBeachStairsLeft: [390, 864, 72, 82, 0, true],
  tileBeachStairsRight: [606, 864, 72, 82, 0, true],
  // Cliff faces sample the COBBLE band (y143–176) of the sandstone plateau blocks, not the sandy
  // block-top above it (the old [.,100,72,82] rects baked the wall as sand). Mirrors main.ts.
  tileBeachCliff: [560, 144, 72, 28, 0, true],
  tileBeachCliffLeft: [528, 144, 52, 28, 0, true], tileBeachCliffRight: [608, 144, 52, 28, 0, true],
  tileBeachRockWall: [560, 144, 72, 28, 0, true], tileBeachRock: [1048, 482, 70, 62, undefined, true],
  tileBeachLagoon: [1040, 92, 72, 72, 18], tileOcean: [1056, 92, 72, 72, 18],
  tileOceanRipple: [1144, 92, 72, 72, 18], tileOceanRock: [1128, 92, 72, 72, 18]
};
// char -> base texture (TILE_BASE_TEXTURE) and optional underlay (TILE_UNDERLAY_TEXTURE)
const BASE: Record<string, string> = {
  e: "tileBeachSand", l: "tileBeachShellSand", ",": "tileBeachWetSand", ";": "tileBeachRippleSand",
  z: "tileBeachPath", "2": "tileBeachStairsMid", "[": "tileBeachStairsLeft", "]": "tileBeachStairsRight",
  x: "tileBeachCliff", "0": "tileBeachCliffLeft", "1": "tileBeachCliffRight", "|": "tileBeachRockWall",
  u: "tileBeachRock", v: "tileBeachLagoon", "{": "tileBeachLagoon", "}": "tileBeachLagoon",
  "(": "tileBeachLagoon", ")": "tileBeachLagoon", "=": "tileBeachLagoon", I: "tileOcean",
  "!": "tileOceanRipple", "?": "tileOceanRock", Y: "tileBeachPath", j: "tileBeachPath"
};
const UNDER: Record<string, string> = {
  "2": "tileBeachPebbleSand", "[": "tileBeachPebbleSand", "]": "tileBeachPebbleSand",
  x: "tileBeachShellSand", "0": "tileBeachShellSand", "1": "tileBeachShellSand", "|": "tileBeachShellSand",
  u: "tileBeachSand", v: "tileOcean", "{": "tileOcean", "}": "tileOcean", "(": "tileOcean",
  ")": "tileOcean", "?": "tileOcean"
};

// ---- texture extraction (ports main.ts makeTileTexture into raw RGBA) -------
const isMagentaKey = (r: number, g: number, b: number): boolean => {
  if (r > 95 && b > 90 && g < 135 && Math.abs(r - b) < 95 && r > g * 1.35 && b > g * 1.25) return true;
  if (g < 10 && r > 70 && b > 42 && r > b - 5 && r > g * 7 && b > g * 7) return true;
  return g < 12 && r > 45 && b > 45 && Math.abs(r - b) < 60 && r > g * 6 && b > g * 6;
};

// Crop the source rect (minus inset), key out magenta -> alpha 0, area-downscale
// to 32x32. Returns a 32*32*4 RGBA buffer (alpha preserved at edges).
function extractRaw(tex: Tex): Buffer {
  const [sx, sy, sw, sh, insetOverride] = tex;
  const inset = insetOverride ?? Math.min(10, Math.floor(sw / 5), Math.floor(sh / 5));
  const cw = sw - inset * 2, ch = sh - inset * 2;
  // crop + chroma-key into a cw*ch RGBA buffer
  const crop = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const si = ((sy + inset + y) * sheet.width + (sx + inset + x)) * 4;
    const di = (y * cw + x) * 4;
    const r = sheet.data[si], g = sheet.data[si + 1], b = sheet.data[si + 2], a = sheet.data[si + 3];
    crop[di] = r; crop[di + 1] = g; crop[di + 2] = b;
    crop[di + 3] = a === 0 || isMagentaKey(r, g, b) ? 0 : a;
  }
  // area-average downscale cw*ch -> 32*32 (alpha-weighted colour)
  const out = Buffer.alloc(ts * ts * 4);
  for (let ty = 0; ty < ts; ty++) for (let tx = 0; tx < ts; tx++) {
    const x0 = Math.floor((tx * cw) / ts), x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * cw) / ts));
    const y0 = Math.floor((ty * ch) / ts), y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * ch) / ts));
    let r = 0, g = 0, b = 0, aw = 0, an = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * cw + x) * 4, a = crop[i + 3];
      r += crop[i] * a; g += crop[i + 1] * a; b += crop[i + 2] * a; aw += a; an += a; n++;
    }
    const di = (ty * ts + tx) * 4;
    if (aw > 0) { out[di] = Math.round(r / aw); out[di + 1] = Math.round(g / aw); out[di + 2] = Math.round(b / aw); }
    out[di + 3] = n ? Math.round(an / n) : 0;
  }
  return out;
}

// Composite src OVER dst (both 32*32 RGBA), in place on dst.
function over(dst: Buffer, src: Buffer): void {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = src[i + 3] / 255; if (sa === 0) continue;
    const da = dst[i + 3] / 255, oa = sa + da * (1 - sa);
    for (let k = 0; k < 3; k++) dst[i + k] = oa ? Math.round((src[i + k] * sa + dst[i + k] * da * (1 - sa)) / oa) : 0;
    dst[i + 3] = Math.round(oa * 255);
  }
}
// Fill any remaining transparent pixels with the tile's average opaque colour
// (mirrors fillTransparentPixels — every map tile must be fully opaque).
function flatten(buf: Buffer): void {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < buf.length; i += 4) if (buf[i + 3] > 0) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++; }
  const fr = n ? Math.round(r / n) : 0, fg = n ? Math.round(g / n) : 0, fb = n ? Math.round(b / n) : 0;
  for (let i = 0; i < buf.length; i += 4) if (buf[i + 3] < 255) { buf[i] = fr; buf[i + 1] = fg; buf[i + 2] = fb; buf[i + 3] = 255; }
}

const texCache = new Map<string, Buffer>();
const tex = (key: string) => { let t = texCache.get(key); if (!t) { t = extractRaw(TEX[key]); texCache.set(key, t); } return Buffer.from(t); };

// ---- one composited 32px tile per distinct char ----------------------------
const chars = Object.keys(BASE);
const tileBuf: Buffer[] = [];
const legend: Record<string, string> = {};
chars.forEach((ch, idx) => {
  const tile = Buffer.alloc(ts * ts * 4); // transparent
  if (UNDER[ch]) over(tile, tex(UNDER[ch]));
  over(tile, tex(BASE[ch]));
  flatten(tile);
  tileBuf.push(tile);
  legend[ch] = `beach:${idx}`;
});

function avgColor(buf: Buffer): string {
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < buf.length; p += 4) { if (buf[p + 3] === 0) continue; r += buf[p]; g += buf[p + 1]; b += buf[p + 2]; n++; }
  if (!n) return "#000000";
  const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

// ---- pack atlas ------------------------------------------------------------
const N = tileBuf.length, PACK_COLS = 24, packRows = Math.ceil(N / PACK_COLS);
const atlas = new PNG({ width: PACK_COLS * ts, height: packRows * ts });
atlas.data.fill(0);
for (let i = 0; i < N; i++) {
  const tx = (i % PACK_COLS) * ts, ty = Math.floor(i / PACK_COLS) * ts;
  for (let y = 0; y < ts; y++) tileBuf[i].copy(atlas.data, ((ty + y) * atlas.width + tx) * 4, y * ts * 4, y * ts * 4 + ts * 4);
}

// ---- stage / vocab ---------------------------------------------------------
const vocab: Record<string, { role: string; blocked: boolean; sightBlocked: boolean; road: boolean; minimapColor: string }> = {};
chars.forEach((ch, idx) => {
  vocab[ch] = { role: ROLE[ch] ?? `beach-${ch}`, blocked: blockedChar(ch), sightBlocked: sightChar(ch), road: ROAD.has(ch), minimapColor: avgColor(tileBuf[idx]) };
});

const ascii: string[] = [];
const collision: number[][] = [];
const base: Array<Array<string | null>> = [];
const fallback = legend["e"]; // open ocean / unknown -> sand ref as a safe default
for (let r = 0; r < R; r++) {
  let line = ""; const col: number[] = [], baseRow: Array<string | null> = [];
  for (let c = 0; c < C; c++) {
    const ch = rows[r][c]; line += ch;
    col.push(blockedChar(ch) ? 1 : 0);
    baseRow.push(legend[ch] ?? fallback);
  }
  ascii.push(line); collision.push(col); base.push(baseRow);
}

// portals for the vocab contract (scan actual positions)
const requiredPortals: Record<string, { x: number; y: number }> = {};
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (rows[r][c] === "Y" || rows[r][c] === "j") requiredPortals[rows[r][c]] = { x: c, y: r };

// ---- write outputs ---------------------------------------------------------
const exportDir = nodePath.join(repoRoot, "assetsources/asset-forge/exports/beach");
mkdirSync(exportDir, { recursive: true });
writeFileSync(nodePath.join(exportDir, "beach.png"), PNG.sync.write(atlas));
writeFileSync(nodePath.join(exportDir, "beach.tileset.json"), JSON.stringify({
  schema: "asset-forge/tileset@1", name: "beach", image: "beach.png", tileSize: ts, columns: PACK_COLS, rows: packRows,
  tiles: chars.map((ch, i) => ({ index: i, role: ROLE[ch] ?? `beach-${ch}`, blocked: blockedChar(ch) }))
}, null, 2));

const stage = {
  schema: "asset-forge/stage@1", name: "beach", tileSize: ts, cols: C, rows: R,
  tilesets: [{ name: "beach", image: "beach.png", manifest: "beach.tileset.json" }],
  layers: [{ name: "base", type: "tile", data: base }],
  collision, objects: [], ascii: { legend, rows: ascii }
};
writeFileSync(nodePath.join(exportDir, "beach.stage.json"), JSON.stringify(stage));

writeFileSync(nodePath.join(repoRoot, "assetsources/asset-forge/beach.vocab.json"), JSON.stringify({
  zone: "beach", floor: 8, stageName: "beach",
  description: "Sunken Beach (floor 8): the hand-authored floor-8 geometry re-derived as an editable asset-forge stage. One 32px tile per char, cropped from beach-tiles.png the same way main.ts builds its beach textures. Collision/sight mirror shared.ts.",
  requiredPortals, requiredWalkable: [], chars: vocab
}, null, 2));

console.log(`beach stage -> ${C}x${R}; tileset ${N} tiles (${PACK_COLS}x${packRows}); portals: ${Object.keys(requiredPortals).join(",")}`);
