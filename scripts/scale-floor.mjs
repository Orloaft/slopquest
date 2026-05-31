// General in-place enlarger: scale floor N's authoring 90x60 -> 110x72 across
// src/shared.ts (map block), src/map-objects.ts (building anchors), and content
// YAML (monster/tree/npc coords). Node/herb/fishing approaches, portal arrivals,
// isSafeZone rects, and tests are reported for MANUAL fix (adjacency-sensitive).
//
//   node scripts/scale-floor.mjs <N>
//
// Corner transform keeps shared rectangle edges aligned. Run build + a flood-fill
// check after. Idempotency is NOT guaranteed — run once per floor.
import { readFileSync, writeFileSync } from "node:fs";

const N = Number(process.argv[2]);
if (!Number.isInteger(N)) throw new Error("usage: scale-floor.mjs <floorNumber>");
const SX = 110 / 90, SY = 72 / 60;
const fx = (x) => Math.round(x * SX), fy = (y) => Math.round(y * SY);
const px = (x) => Math.round(x * SX * 10) / 10, py = (y) => Math.round(y * SY * 10) / 10;

// ---- 1. src/shared.ts makeFloorTiles block ----
const sharedPath = "src/shared.ts";
let shared = readFileSync(sharedPath, "utf8");
const startMarker = `if (floor === ${N}) {`;
const si = shared.indexOf(startMarker);
if (si < 0) throw new Error(`no block for floor ${N}`);
// block ends at the next "\n  if (floor === " or "\n  const sized "
const rest = shared.slice(si);
const endRel = (() => {
  const a = rest.indexOf("\n  if (floor ===", 1);
  const b = rest.indexOf("\n  const sized");
  const cands = [a, b].filter((v) => v > 0);
  return Math.min(...cands);
})();
let block = rest.slice(0, endRel);
const origBlock = block;
// fillRect(rows, X, Y, W, H, "t")
block = block.replace(/fillRect\(rows,\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*("[^"]*"|'[^']*')\)/g,
  (_m, x, y, w, h, t) => {
    x = +x; y = +y; w = +w; h = +h;
    const x0 = fx(x), y0 = fy(y), nw = fx(x + w) - x0, nh = fy(y + h) - y0;
    return `fillRect(rows, ${x0}, ${y0}, ${nw}, ${nh}, ${t})`;
  });
// setTile(rows, X, Y, "t")
block = block.replace(/setTile\(rows,\s*(-?\d+),\s*(-?\d+),\s*("[^"]*"|'[^']*')\)/g,
  (_m, x, y, t) => `setTile(rows, ${fx(+x)}, ${fy(+y)}, ${t})`);
// scatter(rows, "a", "b", count, seed) -> scale count by area
block = block.replace(/scatter\(rows,\s*("[^"]*"|'[^']*'),\s*("[^"]*"|'[^']*'),\s*(\d+),\s*(\d+)\)/g,
  (_m, a, b, c, seed) => `scatter(rows, ${a}, ${b}, ${Math.round(+c * SX * SY)}, ${seed})`);
block = block.replace(/90x60/g, "110x72").replace(/bespoke 110x72/g, "enlarged 110x72");
if (block === origBlock) console.warn("WARN: shared block unchanged");
shared = shared.slice(0, si) + block + shared.slice(si + endRel);
writeFileSync(sharedPath, shared);
console.log(`scaled src/shared.ts floor-${N} block`);

// ---- 2. src/map-objects.ts MAP_OBJECTS[N] anchors (x,y only) ----
const moPath = "src/map-objects.ts";
let mo = readFileSync(moPath, "utf8");
const moStart = mo.indexOf(`\n  ${N}: [`);
if (moStart >= 0) {
  const moEnd = mo.indexOf("\n  ],", moStart) + 5;
  let seg = mo.slice(moStart, moEnd);
  seg = seg.replace(/x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+),\s*w:/g,
    (_m, x, y) => `x: ${px(+x)}, y: ${py(+y)}, w:`);
  mo = mo.slice(0, moStart) + seg + mo.slice(moEnd);
  writeFileSync(moPath, mo);
  console.log(`scaled MAP_OBJECTS[${N}]`);
} else console.log(`no MAP_OBJECTS[${N}]`);

// ---- 3. content YAML: spawns (monsters + trees), npcs ----
function scaleAtCoords(path, intCoords) {
  let s = readFileSync(path, "utf8");
  const re = new RegExp(`(at: \\{ floor: ${N}, x: )(-?[\\d.]+)(,\\s*y: )(-?[\\d.]+)(\\s*\\})`, "g");
  let count = 0;
  s = s.replace(re, (_m, p1, x, p3, y, p5) => {
    count++;
    const nx = intCoords && !String(x).includes(".") ? fx(+x) : px(+x);
    const ny = intCoords && !String(y).includes(".") ? fy(+y) : py(+y);
    return `${p1}${nx}${p3}${ny}${p5}`;
  });
  writeFileSync(path, s);
  return count;
}
// monsters: integer coords -> fx/fy; trees: fractional -> px/py. Mixed handled by the dot check.
console.log(`scaled ${scaleAtCoords("content/spawns.yaml", true)} spawns/trees in spawns.yaml`);
console.log(`scaled ${scaleAtCoords("content/npcs.yaml", false)} npc anchors`);
// Node `at` coords (approach lines stay — fix adjacency manually via the validator).
for (const f of ["content/herb-nodes.yaml", "content/fishing-nodes.yaml", "content/mining-nodes.yaml"]) {
  const c = scaleAtCoords(f, false);
  if (c) console.log(`scaled ${c} node 'at' coords in ${f} (FIX approaches manually)`);
}

console.log("\n>>> MANUAL: scale these by fx/fy (printed for reference) <<<");
console.log("fx/fy of common spots — fill in per floor's arrivals, isSafeZone rect, node approaches, tests.");
