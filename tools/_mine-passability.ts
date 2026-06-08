// Throwaway: flood-fill floor 10 (Deepdelve Mine) from the entry chamber, report
// stranded walkable cells + ASCII map. Mirrors _jungle-passability.ts.
import { makeFloorTiles, isBlockedTile, floorCols, floorRows } from "../src/shared.ts";

const rows = makeFloorTiles(10);
const W = floorCols(10), H = floorRows(10);
const grid = rows.map((r) => r.split(""));
const start: [number, number] = [8, 11]; // entry chamber landing (portalFor floor6 > -> 8.5,11.5)
console.log("dims", W, "x", H, "start", start, "char@start", grid[11]?.[8]);

const walk = (x: number, y: number): boolean => {
  const c = grid[y]?.[x];
  return c !== undefined && !isBlockedTile(c);
};
const seen = new Set<string>([start.join(",")]);
const stack = [start];
while (stack.length) {
  const [x, y] = stack.pop()!;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
    const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
    if (!seen.has(k) && walk(nx, ny)) { seen.add(k); stack.push([nx, ny]); }
  }
}
let totalWalk = 0, unreached = 0;
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  if (walk(x, y)) { totalWalk += 1; if (!seen.has(`${x},${y}`)) unreached += 1; }
}
console.log(`walkable=${totalWalk} reachable=${seen.size} STRANDED=${unreached}`);
const sym = (x: number, y: number): string => {
  const c = grid[y]?.[x] ?? " ";
  if (c === "#") return " ";
  if (c === "r") return "o"; // ore outcrop (blocked)
  if (c === "<") return "<";
  if (walk(x, y)) return seen.has(`${x},${y}`) ? "." : "!";
  return c;
};
for (let y = 0; y < H; y += 1) {
  let line = String(y).padStart(2, " ") + " ";
  for (let x = 0; x < W; x += 1) line += sym(x, y);
  console.log(line);
}
