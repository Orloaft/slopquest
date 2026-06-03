import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { NORTHWOOD_STAGE } from "../../src/generated/stages/index.ts";
import { isBlockedTile, makeFloorTiles, MONSTER_SPAWNS, HERB_NODES, FISHING_NODES, MINING_NODES } from "../../src/shared.ts";

// Northwood is built by the AUTHORED-LAYOUT BRIDGE (tools/build-northwood-from-authored.ts):
// it reruns the locked compositor's autotile passes, dedupes the baked canvas into a packed
// forest.png tileset, and emits a stage whose ascii uses SEMANTIC chars (so the engine's
// char-based isBlockedTile/isRoadTile resolve collision) with the exact per-cell visuals on a
// `fringe` layer. Trees/props are runtime sprite objects. These tests pin the invariants that
// keep that stage correct and in sync; they intentionally do NOT assert the retired procedural
// generator's tile-id/tag vocabulary.

const PORTALS = [
  { ch: "S", x: 55, y: 70, to: "Waystone" },
  { ch: "N", x: 55, y: 1, to: "Northwatch" },
  { ch: "M", x: 1, y: 36, to: "The Sunken Marsh" },
  { ch: "D", x: 108, y: 35, to: "The Searing Badlands" }
];

test("Northwood bridge export, generated module, and runtime atlas stay in sync", () => {
  expect(() => execFileSync("npm", ["run", "assets:stage:northwood:check"], { cwd: process.cwd(), stdio: "pipe" })).not.toThrow();

  const stage = JSON.parse(readFileSync("assetsources/asset-forge/exports/northwood/northwood.stage.json", "utf8")) as {
    schema: string;
    tileSize: number;
    cols: number;
    rows: number;
    tilesets: Array<{ name: string; image: string; manifest: string }>;
    ascii: { legend: Record<string, string>; rows: string[] };
    layers: Array<{ name: string; data: Array<Array<string | null>> }>;
    collision: number[][];
    objects: Array<{ key: string; x: number; y: number; w: number; h: number; blocking: boolean }>;
  };
  const atlasPath = "public/tilesets/northwood/forest.png";
  const atlas = PNG.sync.read(readFileSync(atlasPath));
  const manifest = JSON.parse(readFileSync("assetsources/asset-forge/exports/northwood/forest.tileset.json", "utf8")) as {
    tileSize: number;
    columns: number;
    rows: number;
    tiles: Array<{ index: number; role: string; blocked: boolean }>;
  };

  expect(stage.schema).toBe("asset-forge/stage@1");
  expect(stage.cols).toBe(NORTHWOOD_STAGE.cols);
  expect(stage.rows).toBe(NORTHWOOD_STAGE.rows.length);
  expect(stage.tileSize).toBe(32);
  expect(stage.ascii.rows).toEqual([...NORTHWOOD_STAGE.rows]);
  expect(stage.layers.map((layer) => layer.name)).toEqual(["base", "fringe"]);
  expect(stage.layers).toEqual(NORTHWOOD_STAGE.layers);
  expect(stage.collision).toEqual(NORTHWOOD_STAGE.collision);

  // Packed tileset: square-ish atlas, indexed row-major by `forest:<index>`.
  expect(existsSync(atlasPath)).toBe(true);
  expect(atlas.width % stage.tileSize).toBe(0);
  expect(atlas.height % stage.tileSize).toBe(0);
  expect(atlas.width).toBe(stage.tileSize * manifest.columns);
  expect(atlas.height).toBe(stage.tileSize * manifest.rows);
  expect(manifest.tiles.length).toBeGreaterThan(100);

  // Every base cell carries a valid in-range ref; fringe overlays are valid or null.
  const N = manifest.tiles.length;
  const refIndex = (ref: string): number => {
    const [name, idx] = ref.split(":");
    expect(name).toBe("forest");
    return Number(idx);
  };
  for (let y = 0; y < stage.rows; y += 1) {
    for (let x = 0; x < stage.cols; x += 1) {
      const base = stage.layers[0]!.data[y]![x];
      expect(base, `base layer must never be empty at ${x},${y}`).toBeTruthy();
      expect(refIndex(base!)).toBeLessThan(N);
      const fringe = stage.layers[1]!.data[y]![x];
      if (fringe) expect(refIndex(fringe)).toBeLessThan(N);
    }
  }
});

test("Northwood is served by the generated bridge stage module", () => {
  const rows = makeFloorTiles(3);
  expect(NORTHWOOD_STAGE.schema).toBe("tib/generated-stage@1");
  expect(NORTHWOOD_STAGE.sourceSchema).toBe("asset-forge/stage@1");
  expect(NORTHWOOD_STAGE.zone).toBe("northwood");
  expect(NORTHWOOD_STAGE.floor).toBe(3);
  expect(rows).toEqual([...NORTHWOOD_STAGE.rows]);
  expect(rows).toHaveLength(72);
  expect(rows[0]).toHaveLength(110);
});

test("Semantic chars drive the engine's char-based movement collision", () => {
  const rows = makeFloorTiles(3);

  // The engine resolves movement via isBlockedTile(char) on these rows, so every vocab
  // char's blocked flag MUST agree with isBlockedTile — otherwise players walk on water.
  for (const [char, tile] of Object.entries(NORTHWOOD_STAGE.tiles)) {
    expect(isBlockedTile(char), `vocab '${char}' blocked must match isBlockedTile`).toBe(tile.blocked);
  }
  // Collision grid agrees with the char semantics cell-by-cell.
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < rows[y]!.length; x += 1) {
      expect(NORTHWOOD_STAGE.collision[y]![x]).toBe(isBlockedTile(rows[y]![x]!) ? 1 : 0);
    }
  }
  // Water exists and blocks; a healthy share of the map is open and walkable.
  const flat = rows.join("");
  expect(flat.match(/~/g)?.length ?? 0, "authored ponds should survive").toBeGreaterThan(300);
  expect(isBlockedTile("~")).toBe(true);
  const walkable = [...flat].filter((c) => !isBlockedTile(c)).length;
  expect(walkable / flat.length, "most of Northwood should be walkable ground").toBeGreaterThan(0.55);
});

test("Northwood preserves its four portals as walkable exits", () => {
  const rows = makeFloorTiles(3);
  const tiles = NORTHWOOD_STAGE.tiles as Record<string, { role: string; blocked: boolean }>;
  const legend = NORTHWOOD_STAGE.legend as Record<string, string>;
  for (const portal of PORTALS) {
    expect(rows[portal.y]?.[portal.x], `portal ${portal.ch} at ${portal.x},${portal.y}`).toBe(portal.ch);
    expect(isBlockedTile(portal.ch), `portal ${portal.ch} should be walkable`).toBe(false);
    expect(tiles[portal.ch]?.role, `portal ${portal.ch} role`).toMatch(/^portal-/);
    expect(legend[portal.ch], `portal ${portal.ch} legend`).toBeTruthy();
  }
});

test("Northwood objects: resource trees are choppable nodes, props are non-blocking decoration", () => {
  const objects = NORTHWOOD_STAGE.objects as ReadonlyArray<{
    key: string; x: number; y: number; blocking: boolean;
    resource?: { kind: string; tx: number; ty: number };
  }>;
  expect(objects.length, "trees + props should be emitted as objects").toBeGreaterThan(800);
  const rows = NORTHWOOD_STAGE.rows;
  let trees = 0;
  for (const o of objects) {
    expect(o.key, `object key '${o.key}' should be a registered Northwood sprite`).toMatch(/^spriteNw\d{3}$/);
    expect(o.x).toBeGreaterThanOrEqual(0);
    expect(o.x).toBeLessThanOrEqual(NORTHWOOD_STAGE.cols);
    expect(o.y).toBeGreaterThanOrEqual(0);
    expect(o.y).toBeLessThanOrEqual(NORTHWOOD_STAGE.rows.length);
    if (o.resource?.kind === "tree") {
      trees += 1;
      // A choppable tree blocks its trunk; the trunk tile carries the 'y' char so
      // the engine's char-based collision + tree-node generation light up.
      expect(o.blocking, `tree ${o.key} should block its trunk`).toBe(true);
      expect(rows[o.resource.ty]?.[o.resource.tx], `tree ${o.key} trunk tile should be 'y'`).toBe("y");
    } else {
      expect(o.blocking, `decoration ${o.key} should not block movement`).toBe(false);
    }
  }
  expect(trees, "authored Northwood should emit choppable tree nodes").toBeGreaterThan(100);
});

test("Floor-3 gameplay anchors land on valid terrain in the authored map", () => {
  const rows = makeFloorTiles(3);
  const ch = (x: number, y: number) => rows[Math.floor(y)]?.[Math.floor(x)] ?? "#";
  const walkable = (x: number, y: number) => ch(x, y) !== "#" && !isBlockedTile(ch(x, y));
  const orthAdjacent = (ax: number, ay: number, bx: number, by: number) =>
    Math.abs(Math.floor(ax) - Math.floor(bx)) + Math.abs(Math.floor(ay) - Math.floor(by)) === 1;
  const f3 = <T extends { floor: number }>(arr: readonly T[]) => arr.filter((n) => n.floor === 3);

  for (const spawn of f3(MONSTER_SPAWNS)) {
    expect(walkable(spawn.x, spawn.y), `${spawn.type} spawn at ${Math.floor(spawn.x)},${Math.floor(spawn.y)} must be walkable`).toBe(true);
  }
  for (const node of f3(HERB_NODES)) {
    expect(walkable(node.x, node.y), `${node.id} should grow on walkable ground`).toBe(true);
  }
  for (const node of f3(FISHING_NODES) as Array<{ id: string; floor: number; x: number; y: number; approachX: number; approachY: number }>) {
    expect(ch(node.x, node.y), `${node.id} should sit on a water tile`).toBe("~");
    expect(walkable(node.approachX, node.approachY), `${node.id} approach must be walkable`).toBe(true);
    expect(orthAdjacent(node.x, node.y, node.approachX, node.approachY), `${node.id} approach must border the water`).toBe(true);
  }
  for (const node of f3(MINING_NODES) as Array<{ id: string; floor: number; x: number; y: number; approachX: number; approachY: number }>) {
    expect(ch(node.x, node.y), `${node.id} ore should not sit in water`).not.toBe("~");
    expect(walkable(node.approachX, node.approachY), `${node.id} approach must be walkable`).toBe(true);
    expect(orthAdjacent(node.x, node.y, node.approachX, node.approachY), `${node.id} approach must border the vein`).toBe(true);
  }
});

test("Northwood loads generated stage tile textures in the browser", async ({ page }) => {
  await page.goto("/?e2e");
  await join(page);
  await place(page, 3, 55, 36);

  const textureKeys = await page.evaluate(() => window.__TIB_E2E__?.generatedStageTextureKeys(3) ?? []);
  expect(textureKeys.length).toBeGreaterThan(0);
  expect(textureKeys.every((entry) => entry.exists)).toBe(true);

  const stats = visualStats(await page.locator("#game canvas").screenshot());
  expect(stats.meaningfulPixels).toBeGreaterThan(20000);
});

test("runtime actor crops remove connected dark sheet backgrounds", async ({ page }) => {
  await page.goto("/?e2e");
  await page.waitForFunction(() => window.__TIB_E2E__?.textureAlphaStats?.(["spider-up-0"])?.[0]?.exists === true);

  const stats = await page.evaluate(() =>
    window.__TIB_E2E__?.textureAlphaStats?.(["spider-up-0", "spider-right-0", "rat-up-0", "rat-right-0"]) ?? []
  );

  expect(stats).toHaveLength(4);
  for (const texture of stats) {
    expect(texture.exists, `${texture.key} texture should exist`).toBe(true);
    expect(texture.opaque, `${texture.key} should still contain sprite pixels`).toBeGreaterThan(120);
    expect(texture.darkEdgeOpaque, `${texture.key} should not keep dark connected crop-background on the texture edge`).toBe(0);
    expect(texture.edgeOpaque, `${texture.key} should not preserve opaque sheet borders`).toBeLessThan(6);
  }
});

async function join(page: import("@playwright/test").Page): Promise<void> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
}

async function place(page: import("@playwright/test").Page, floor: number, x: number, y: number): Promise<void> {
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x + 0.5, y: p.y + 0.5 }), { floor, x, y });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.floor(me.x) === p.x && Math.floor(me.y) === p.y);
    },
    { floor, x, y }
  );
}

function visualStats(buffer: Buffer): { meaningfulPixels: number } {
  const png = PNG.sync.read(buffer);
  let meaningfulPixels = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i] ?? 0;
    const g = png.data[i + 1] ?? 0;
    const b = png.data[i + 2] ?? 0;
    const a = png.data[i + 3] ?? 0;
    if (a > 0 && (Math.abs(r - 17) > 8 || Math.abs(g - 20) > 8 || Math.abs(b - 18) > 8)) meaningfulPixels += 1;
  }
  return { meaningfulPixels };
}
