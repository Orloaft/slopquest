// Generic bridge: AUTHORED floor layout -> editable asset-forge stage + atlas,
// for any DIRECT char->texture floor (the hardcoded floors that render each cell
// by cropping a fixed rect out of a biome sheet via main.ts makeTileTexture).
// ---------------------------------------------------------------------------
// One tool for every such floor (cemetery/crypt/northwatch/desert/jungle/deepmine,
// and beach). It self-syncs by PARSING main.ts at run time:
//   - every makeTileTexture(this,"<sheet>","<key>",sx,sy,sw,sh[,inset][,preserve])
//   - the sheet->png paths from this.load.image("<sheet>","/<file>.png")
//   - the char->texture maps TILE_BASE_TEXTURE / TILE_UNDERLAY_TEXTURE
// then rebuilds one 32px tile per char exactly as the runtime does (inset crop ->
// magenta chroma-key -> area-downscale -> underlay beneath base -> flatten opaque),
// packs them into <name>.png and emits <name>.{tileset,stage}.json + <name>.vocab.json.
// Collision / sight / road are imported from shared.ts so the editable stage matches
// the in-game floor exactly.
//
//   node tools/build-stage-from-textures.ts --floor <N> --name <stage-id>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";
import { isBlockedTile, isRoadTile, isSightBlocked, makeFloorTiles } from "../src/shared.ts";

const repoRoot = process.cwd();
const ts = 32;

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const floor = Number(arg("--floor"));
const name = arg("--name");
if (!Number.isFinite(floor) || !name) { console.error("usage: --floor <N> --name <stage-id>"); process.exit(1); }

// ---- parse main.ts (single source of truth for textures) -------------------
const src = readFileSync(nodePath.join(repoRoot, "src/main.ts"), "utf8");

type Tex = { sheet: string; sx: number; sy: number; sw: number; sh: number; inset?: number; preserve: boolean };
const TEX: Record<string, Tex> = {};
for (const m of src.matchAll(/makeTileTexture\(\s*this\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,([^;]*?)\)\s*;/g)) {
  const sheet = m[1], key = m[2];
  const rest = m[3].split(",").map((s) => s.trim());
  const num = (s: string | undefined) => (s === undefined || s === "undefined" ? undefined : Number(s));
  const [sx, sy, sw, sh] = [num(rest[0]), num(rest[1]), num(rest[2]), num(rest[3])];
  if ([sx, sy, sw, sh].some((v) => v === undefined || Number.isNaN(v))) continue;
  TEX[key] = { sheet, sx: sx!, sy: sy!, sw: sw!, sh: sh!, inset: num(rest[4]), preserve: rest[5] === "true" };
}

const SHEET_PATH: Record<string, string> = {};
for (const m of src.matchAll(/load\.image\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)) SHEET_PATH[m[1]] = m[2];

function parseMap(mapName: string): Record<string, string> {
  const start = src.indexOf(`const ${mapName}`);
  const open = src.indexOf("{", start);
  let i = open + 1, depth = 1;
  while (depth > 0 && i < src.length) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; }
  const body = src.slice(open + 1, i - 1);
  const map: Record<string, string> = {};
  for (const m of body.matchAll(/(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*"([^"]+)"/g)) map[(m[1] ?? m[2])!] = m[3];
  return map;
}
const BASE = parseMap("TILE_BASE_TEXTURE");
const UNDER = parseMap("TILE_UNDERLAY_TEXTURE");

// ---- sheet loading ---------------------------------------------------------
const sheetCache = new Map<string, PNG>();
function sheet(key: string): PNG {
  let p = sheetCache.get(key);
  if (!p) {
    const rel = SHEET_PATH[key];
    if (!rel) throw new Error(`no load.image path for sheet '${key}'`);
    p = PNG.sync.read(readFileSync(nodePath.join(repoRoot, "public", rel.replace(/^\//, ""))));
    sheetCache.set(key, p);
  }
  return p;
}

// ---- texture extraction (ports main.ts makeTileTexture into raw RGBA) ------
const isMagentaKey = (r: number, g: number, b: number): boolean => {
  if (r > 95 && b > 90 && g < 135 && Math.abs(r - b) < 95 && r > g * 1.35 && b > g * 1.25) return true;
  if (g < 10 && r > 70 && b > 42 && r > b - 5 && r > g * 7 && b > g * 7) return true;
  return g < 12 && r > 45 && b > 45 && Math.abs(r - b) < 60 && r > g * 6 && b > g * 6;
};

const rawCache = new Map<string, Buffer>();
function extractRaw(key: string): Buffer {
  const cached = rawCache.get(key);
  if (cached) return Buffer.from(cached);
  const t = TEX[key];
  if (!t) throw new Error(`texture key '${key}' has no makeTileTexture rect`);
  const sh = sheet(t.sheet);
  const inset = t.inset ?? Math.min(10, Math.floor(t.sw / 5), Math.floor(t.sh / 5));
  const cw = t.sw - inset * 2, ch = t.sh - inset * 2;
  const crop = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const si = ((t.sy + inset + y) * sh.width + (t.sx + inset + x)) * 4;
    const di = (y * cw + x) * 4;
    const r = sh.data[si], g = sh.data[si + 1], b = sh.data[si + 2], a = sh.data[si + 3];
    crop[di] = r; crop[di + 1] = g; crop[di + 2] = b;
    crop[di + 3] = a === 0 || isMagentaKey(r, g, b) ? 0 : a;
  }
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
  rawCache.set(key, out);
  return Buffer.from(out);
}
function over(dst: Buffer, src2: Buffer): void {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = src2[i + 3] / 255; if (sa === 0) continue;
    const da = dst[i + 3] / 255, oa = sa + da * (1 - sa);
    for (let k = 0; k < 3; k++) dst[i + k] = oa ? Math.round((src2[i + k] * sa + dst[i + k] * da * (1 - sa)) / oa) : 0;
    dst[i + 3] = Math.round(oa * 255);
  }
}
function flatten(buf: Buffer): void {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < buf.length; i += 4) if (buf[i + 3] > 0) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++; }
  const fr = n ? Math.round(r / n) : 0, fg = n ? Math.round(g / n) : 0, fb = n ? Math.round(b / n) : 0;
  for (let i = 0; i < buf.length; i += 4) if (buf[i + 3] < 255) { buf[i] = fr; buf[i + 1] = fg; buf[i + 2] = fb; buf[i + 3] = 255; }
}
function avgColor(buf: Buffer): string {
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < buf.length; p += 4) { if (buf[p + 3] === 0) continue; r += buf[p]; g += buf[p + 1]; b += buf[p + 2]; n++; }
  if (!n) return "#000000";
  const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}
const roleOf = (ch: string) => (BASE[ch] ?? `tile-${ch}`).replace(/^tile/, "").replace(/^./, (m) => m.toLowerCase()).replace(/([A-Z])/g, "-$1").toLowerCase() || `tile-${ch}`;

// ---- bake ------------------------------------------------------------------
const rows = makeFloorTiles(floor).map((r) => r.split(""));
const R = rows.length, C = rows[0].length;
const chars = [...new Set(rows.flat())];
const missing = chars.filter((ch) => !TEX[BASE[ch] ?? ""]);
if (missing.length) console.warn(`WARN: chars with no sheet texture (flat-color fallback): ${missing.map((c) => `'${c}'`).join(" ")}`);

const tileBuf: Buffer[] = [];
const legend: Record<string, string> = {};
const desertFillForChar: Record<string, string> = {
  a: "desert-sand-v0.png",
  G: "desert-sand-v1.png",
  H: "desert-sand-v2.png",
  U: "desert-sand-v3.png",
  Y: "desert-road.png",
  V: "desert-oasis-water.png",
  Q: "desert-quicksand.png",
  w: "desert-red-rock-top.png",
  X: "desert-red-rock-cliff.png",
};
const cemeteryFillForChar: Record<string, string> = {
  "#": "cemetery-grave-stone.png",
  g: "cemetery-grave-dirt-v0.png",
  h: "cemetery-grave-dirt-v1.png",
  q: "cemetery-grave-dirt-v0.png",
  b: "cemetery-grave-path.png",
  c: "cemetery-grave-path.png",
  C: "cemetery-grave-path.png",
  T: "cemetery-dead-ground.png",
  G: "cemetery-dead-ground.png",
  r: "cemetery-dark-moss.png",
  O: "cemetery-grave-grass-v0.png",
};
const cryptFillForChar: Record<string, string> = {
  "#": "crypt-wall.png",
  b: "crypt-floor-v0.png",
  d: "crypt-floor-v1.png",
  c: "crypt-worn-floor.png",
  T: "crypt-worn-floor.png",
  r: "crypt-dark-moss.png",
};
const deepmineFillForChar: Record<string, string> = {
  "#": "deepmine-wall.png",
  d: "deepmine-worn-dirt.png",
  b: "deepmine-floor-v0.png",
  c: "deepmine-track-bed.png",
  r: "deepmine-ore-rock.png",
  "<": "deepmine-worn-dirt.png",
};
const stageFillForChar: Record<string, Record<string, string>> = {
  desert: desertFillForChar,
  cemetery: cemeteryFillForChar,
  crypt: cryptFillForChar,
  deepmine: deepmineFillForChar,
};
function maybeApplyStageFill(ch: string, tile: Buffer): void {
  const file = stageFillForChar[name]?.[ch];
  if (!file) return;
  const p = nodePath.join(repoRoot, "assetsources/curated/fills", file);
  if (!existsSync(p)) return;
  const fill = PNG.sync.read(readFileSync(p));
  if (fill.width !== ts || fill.height !== ts) throw new Error(`${p} must be ${ts}x${ts}`);
  fill.data.copy(tile, 0, 0, ts * ts * 4);
}
chars.forEach((ch, idx) => {
  const tile = Buffer.alloc(ts * ts * 4);
  const u = UNDER[ch]; if (u && TEX[u]) over(tile, extractRaw(u));
  const base = BASE[ch];
  if (base && TEX[base]) over(tile, extractRaw(base));
  flatten(tile);
  maybeApplyStageFill(ch, tile);
  tileBuf.push(tile);
  legend[ch] = `${name}:${idx}`;
});

const N = tileBuf.length, PACK_COLS = 24, packRows = Math.ceil(N / PACK_COLS);
const atlas = new PNG({ width: PACK_COLS * ts, height: packRows * ts });
atlas.data.fill(0);
for (let i = 0; i < N; i++) {
  const tx = (i % PACK_COLS) * ts, ty = Math.floor(i / PACK_COLS) * ts;
  for (let y = 0; y < ts; y++) tileBuf[i].copy(atlas.data, ((ty + y) * atlas.width + tx) * 4, y * ts * 4, y * ts * 4 + ts * 4);
}

const vocab: Record<string, { role: string; blocked: boolean; sightBlocked: boolean; road: boolean; minimapColor: string }> = {};
chars.forEach((ch, idx) => {
  vocab[ch] = { role: roleOf(ch), blocked: isBlockedTile(ch), sightBlocked: isSightBlocked(ch), road: isRoadTile(ch), minimapColor: avgColor(tileBuf[idx]) };
});

const ascii: string[] = [];
const collision: number[][] = [];
const base: Array<Array<string | null>> = [];
const fallback = legend[chars[0]];
for (let r = 0; r < R; r++) {
  let line = ""; const col: number[] = [], baseRow: Array<string | null> = [];
  for (let c = 0; c < C; c++) {
    const ch = rows[r][c]; line += ch;
    col.push(isBlockedTile(ch) ? 1 : 0);
    baseRow.push(legend[ch] ?? fallback);
  }
  ascii.push(line); collision.push(col); base.push(baseRow);
}

const exportDir = nodePath.join(repoRoot, `assetsources/asset-forge/exports/${name}`);
mkdirSync(exportDir, { recursive: true });
writeFileSync(nodePath.join(exportDir, `${name}.png`), PNG.sync.write(atlas));
writeFileSync(nodePath.join(exportDir, `${name}.tileset.json`), JSON.stringify({
  schema: "asset-forge/tileset@1", name, image: `${name}.png`, tileSize: ts, columns: PACK_COLS, rows: packRows,
  tiles: chars.map((ch, i) => ({ index: i, role: roleOf(ch), blocked: isBlockedTile(ch) }))
}, null, 2));
writeFileSync(nodePath.join(exportDir, `${name}.stage.json`), JSON.stringify({
  schema: "asset-forge/stage@1", name, tileSize: ts, cols: C, rows: R,
  tilesets: [{ name, image: `${name}.png`, manifest: `${name}.tileset.json` }],
  layers: [{ name: "base", type: "tile", data: base }], collision, objects: [], ascii: { legend, rows: ascii }
}));
writeFileSync(nodePath.join(repoRoot, `assetsources/asset-forge/${name}.vocab.json`), JSON.stringify({
  zone: name, floor, stageName: name,
  description: `${name} (floor ${floor}): hand-authored floor geometry re-derived as an editable asset-forge stage. One 32px tile per char, cropped from the biome sheet the same way main.ts builds its textures. Collision/sight/road mirror shared.ts.`,
  requiredPortals: {}, requiredWalkable: [], chars: vocab
}, null, 2));

console.log(`${name} stage (floor ${floor}) -> ${C}x${R}; ${N} tiles (${PACK_COLS}x${packRows})${missing.length ? `; ${missing.length} flat-fallback` : ""}`);
