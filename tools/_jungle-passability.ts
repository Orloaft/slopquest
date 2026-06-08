// Throwaway: build floor 9, flood-fill walkable cells from the west entry portal,
// print an ASCII map + report any clearing rows. Used to plan M3 elevation safely.
import { makeFloorTiles, isBlockedTile, floorCols, floorRows } from "../src/shared.ts";

const rows = makeFloorTiles(9);
const W = floorCols(9), H = floorRows(9);
const grid = rows.map((r) => r.split(""));

// Entry portal `j` (west). Find it.
let start: [number, number] | null = null;
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (grid[y]?.[x] === "j") start = [x, y];
console.log("entry j at", start, "dims", W, "x", H);

const walk = (x: number, y: number): boolean => {
  const c = grid[y]?.[x];
  if (c === undefined) return false;
  return !isBlockedTile(c);
};

const seen = new Set<string>();
const stack = [start!];
seen.add(start!.join(","));
while (stack.length) {
  const [x, y] = stack.pop()!;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
    const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
    if (!seen.has(k) && walk(nx, ny)) { seen.add(k); stack.push([nx, ny]); }
  }
}

// Count walkable cells reachable vs total walkable.
let totalWalk = 0, unreached = 0;
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  if (walk(x, y)) { totalWalk += 1; if (!seen.has(`${x},${y}`)) unreached += 1; }
}
console.log(`walkable=${totalWalk} reachable=${seen.size} STRANDED=${unreached}`);

// ASCII dump (reachable '-' shown as '.', unreached walkable as '!', blocked walls space, river '~', cliff '#').
const sym = (x: number, y: number): string => {
  const c = grid[y]?.[x] ?? " ";
  if (c === "E") return " ";
  if (c === "i") return "~";
  if (c === "|") return "#";
  if (c === "K") return "K";
  if (c === "j") return "J";
  if (walk(x, y)) return seen.has(`${x},${y}`) ? "." : "!";
  return c;
};
for (let y = 0; y < H; y += 1) {
  let line = String(y).padStart(2, " ") + " ";
  for (let x = 0; x < W; x += 1) line += sym(x, y);
  console.log(line);
}
