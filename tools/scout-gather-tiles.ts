// Throwaway scout: finds verified-valid tiles for new gathering nodes/trees on
// the current (parity) stages, so placements aren't guessed. Reports candidates
// in YAML (native, pre-scale) coordinates ready to paste into content/*.yaml.
//
// Usage: node tools/scout-gather-tiles.ts
import {
  tileAt,
  isBlockedTile,
  isRoadTile,
  floorCols,
  floorRows,
  contentScaleX,
  contentScaleY
} from "../src/shared.ts";

const walkable = (f: number, x: number, y: number) => !isBlockedTile(tileAt(f, x, y));
// Water = blocked but specifically a water glyph (so fishing approaches sit on land).
const WATER = new Set([
  "W", "3", "4", "~", "!", "?", "=", "{", "}", "(", ")", "/", "P", "w", "Q", "V", "U", "x", "0", "J", "I", "v", "i"
]);
const isWater = (f: number, x: number, y: number) => WATER.has(tileAt(f, x, y));

// Inverse-scale a world tile back to the native YAML coordinate space.
function toYaml(f: number, wx: number, wy: number): { x: number; y: number } {
  return { x: +(wx / contentScaleX(f) + 0.5).toFixed(1), y: +(wy / contentScaleY(f) + 0.5).toFixed(1) };
}

type Box = { x1: number; y1: number; x2: number; y2: number };

function scanTrees(f: number, box: Box, want = 6): string[] {
  const out: string[] = [];
  for (let y = box.y1; y <= box.y2 && out.length < want; y += 2) {
    for (let x = box.x1; x <= box.x2 && out.length < want; x += 2) {
      const t = tileAt(f, x, y);
      // Tree tile must be open ground (walkable, not road) with all 4 neighbors
      // walkable — so dropping a (blocking) tree there can't seal a corridor.
      if (isBlockedTile(t) || isRoadTile(t)) continue;
      if (!walkable(f, x - 1, y) || !walkable(f, x + 1, y) || !walkable(f, x, y - 1) || !walkable(f, x, y + 1)) continue;
      const c = toYaml(f, x, y);
      out.push(`  tree@world(${x},${y})  tile='${t}'  -> yaml(${c.x},${c.y})`);
    }
  }
  return out;
}

function scanWaterSpots(f: number, box: Box, want = 4): string[] {
  const out: string[] = [];
  for (let y = box.y1; y <= box.y2 && out.length < want; y++) {
    for (let x = box.x1; x <= box.x2 && out.length < want; x++) {
      if (!isWater(f, x, y)) continue;
      // need a walkable land approach orthogonally adjacent
      const appr =
        (walkable(f, x, y - 1) && !isWater(f, x, y - 1) && [x, y - 1]) ||
        (walkable(f, x, y + 1) && !isWater(f, x, y + 1) && [x, y + 1]) ||
        (walkable(f, x - 1, y) && !isWater(f, x - 1, y) && [x - 1, y]) ||
        (walkable(f, x + 1, y) && !isWater(f, x + 1, y) && [x + 1, y]);
      if (!appr) continue;
      const at = toYaml(f, x, y);
      const ap = toYaml(f, (appr as number[])[0]!, (appr as number[])[1]!);
      out.push(`  water@(${x},${y}) tile='${tileAt(f, x, y)}' -> at:{x:${at.x},y:${at.y}} approach:{x:${ap.x},y:${ap.y}}`);
    }
  }
  return out;
}

function scanHerbs(f: number, box: Box, want = 5): string[] {
  const out: string[] = [];
  for (let y = box.y1; y <= box.y2 && out.length < want; y += 2) {
    for (let x = box.x1; x <= box.x2 && out.length < want; x += 2) {
      if (!walkable(f, x, y) || isRoadTile(tileAt(f, x, y))) continue;
      // herb patch tile + a distinct walkable approach beside it
      const ap =
        (walkable(f, x, y + 1) && [x, y + 1]) ||
        (walkable(f, x, y - 1) && [x, y - 1]) ||
        (walkable(f, x + 1, y) && [x + 1, y]);
      if (!ap) continue;
      const at = toYaml(f, x, y);
      const a = toYaml(f, (ap as number[])[0]!, (ap as number[])[1]!);
      out.push(`  herb@(${x},${y}) tile='${tileAt(f, x, y)}' -> at:{x:${at.x},y:${at.y}} approach:{x:${a.x},y:${a.y}}`);
    }
  }
  return out;
}

function dims(f: number) {
  return `floor ${f}: ${floorCols(f)}x${floorRows(f)}  scale=(${contentScaleX(f).toFixed(3)},${contentScaleY(f).toFixed(3)})`;
}

// Target regions are the dangerous interiors (near enemy spawns), in WORLD tiles.
console.log("=== " + dims(5) + " — marsh willows (Fishing/WC near skitterers) ===");
console.log(scanTrees(5, { x1: 24, y1: 18, x2: 70, y2: 44 }).join("\n"));

console.log("=== " + dims(7) + " — desert teak (near sun wraiths) ===");
console.log(scanTrees(7, { x1: 28, y1: 12, x2: 70, y2: 40 }).join("\n"));

console.log("=== " + dims(8) + " — beach teak + shark (reef prowlers) ===");
console.log(scanTrees(8, { x1: 15, y1: 8, x2: 90, y2: 45 }).join("\n"));
console.log(scanWaterSpots(8, { x1: 15, y1: 8, x2: 90, y2: 50 }).join("\n"));

console.log("=== " + dims(9) + " — jungle mahogany + herb (stalkers/totems) ===");
console.log(scanTrees(9, { x1: 12, y1: 6, x2: 75, y2: 45 }).join("\n"));
console.log(scanHerbs(9, { x1: 12, y1: 6, x2: 75, y2: 45 }).join("\n"));

console.log("=== " + dims(10) + " — deep-mine cavecap (silver/gold deeps) ===");
console.log(scanHerbs(10, { x1: 45, y1: 16, x2: 75, y2: 45 }).join("\n"));

// Sanity: do the existing fishing nodes actually sit on water?
console.log("=== sanity: existing fishing 'at' tiles ===");
for (const [f, x, y] of [[5, 51, 29], [8, 39, 52], [3, 27, 24]] as number[][]) {
  console.log(`  f${f}(${x},${y}) tile='${tileAt(f!, x!, y!)}' water=${isWater(f!, x!, y!)}`);
}
