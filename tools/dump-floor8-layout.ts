// Dump the CURRENT hand-authored floor-8 (Sunken Beach) map to a layout char grid,
// so the beach bridge baker can derive a tileset atlas from the exact same geometry
// (zero gameplay change — beach stays hardcoded in-game until/unless wired in).
import { mkdirSync, writeFileSync } from "node:fs";
import { makeFloorTiles } from "../src/shared.ts";
const rows = makeFloorTiles(8);
mkdirSync("assetsources/beach", { recursive: true });
writeFileSync("assetsources/beach/beach-layout-authored.txt", rows.join("\n") + "\n");
// char histogram so we know the exact vocab to map in the baker
const hist: Record<string, number> = {};
for (const line of rows) for (const ch of line) hist[ch] = (hist[ch] ?? 0) + 1;
console.log("rows", rows.length, "cols", rows[0].length);
console.log("chars:", Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([c, n]) => `'${c}'=${n}`).join("  "));
