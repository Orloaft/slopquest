// Author a clean, connected road network from a waypoint graph traced off the mockup,
// replacing the noisy auto-extracted road cells. Writes layout-authored.txt.
// Each edge is rasterized as an orthogonal L-path; the ordering (H-then-V vs V-then-H)
// is chosen to minimise crossing water/border cells.
import { readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";

const repoRoot = process.cwd();
const grid = readFileSync(nodePath.join(repoRoot, "assetsources/mockup/layout.txt"), "utf8").replace(/\n$/, "").split("\n").map((r) => r.split(""));
const R = grid.length, C = grid[0].length;

// waypoints [col,row] read from artifacts/mockup-grid.png
const P: Record<string, [number, number]> = {
  HUB: [42, 38], GN: [46, 34], C: [40, 22], TUP: [52, 20], TR: [70, 14],
  E: [28, 41], LW: [20, 46], BEACH: [12, 59],
  G: [40, 66], H: [28, 62], I: [52, 61],
  J: [62, 38], RM: [74, 36], K: [76, 23], N: [88, 21], L: [78, 46], M: [83, 30],
};
const edges: Array<[string, string]> = [
  ["HUB", "GN"], ["GN", "C"], ["C", "TUP"], ["TUP", "TR"],
  ["HUB", "E"], ["E", "LW"], ["LW", "BEACH"],
  ["HUB", "G"], ["G", "H"], ["G", "I"],
  ["HUB", "J"], ["J", "RM"], ["RM", "K"], ["K", "N"], ["K", "L"], ["RM", "M"],
];

const blocked = (c: number, r: number) => r < 0 || c < 0 || r >= R || c >= C || grid[r][c] === "~" || grid[r][c] === "^";

function pathCells(a: [number, number], b: [number, number], hFirst: boolean): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  const [c0, r0] = a, [c1, r1] = b;
  if (hFirst) {
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) cells.push([c, r0]);
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) cells.push([c1, r]);
  } else {
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) cells.push([c0, r]);
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) cells.push([c, r1]);
  }
  return cells;
}

// clear existing road cells
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (grid[r][c] === "t") grid[r][c] = "F";

let drawn = 0;
for (const [an, bn] of edges) {
  const a = P[an], b = P[bn];
  const h = pathCells(a, b, true), v = pathCells(a, b, false);
  const cost = (cs: Array<[number, number]>) => cs.filter(([c, r]) => blocked(c, r)).length;
  const chosen = cost(h) <= cost(v) ? h : v;
  for (const [c, r] of chosen) {
    if (r < 0 || c < 0 || r >= R || c >= C) continue;
    if (grid[r][c] === "~" || grid[r][c] === "^") continue; // don't pave water/void
    grid[r][c] = "t"; drawn++;
  }
}

const out = grid.map((r) => r.join("")).join("\n") + "\n";
writeFileSync(nodePath.join(repoRoot, "assetsources/mockup/layout-authored.txt"), out);
console.log(`authored roads: ${edges.length} edges, ${drawn} road cells -> layout-authored.txt`);
