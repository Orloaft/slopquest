import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { areaBalanceMetrics } from "../../src/balance.ts";
import {
  floorCols,
  floorRows,
  isBlockedTile,
  isSafeZone,
  makeFloorTiles,
  MINING_NODES,
  MONSTERS,
  MONSTER_SPAWNS,
  portalFor,
  scaleX,
  scaleY,
  zoneAt
} from "../../src/shared.ts";

const WASTESTONE_FLOORS = [12, 13, 14, 15, 16] as const;
const OUT = path.join(process.cwd(), "artifacts", "wastestone-overview");

const FLOOR_PROBES: Record<number, Array<{ name: string; x: number; y: number }>> = {
  12: [
    { name: "up", x: 8, y: 8 },
    { name: "loop", x: 58, y: 38 },
    { name: "ore-alcove", x: 31, y: 42 },
    { name: "down", x: 80, y: 51 }
  ],
  13: [
    { name: "up", x: 8, y: 9 },
    { name: "causeway", x: 54, y: 38 },
    { name: "sluice", x: 77, y: 50 }
  ],
  14: [
    { name: "up", x: 9, y: 9 },
    { name: "ember-crossing", x: 64, y: 35 },
    { name: "down", x: 73, y: 52 }
  ],
  15: [
    { name: "up", x: 8, y: 9 },
    { name: "ore-pocket", x: 76, y: 31 },
    { name: "down", x: 48, y: 53 }
  ],
  16: [
    { name: "up", x: 9, y: 10 },
    { name: "heart-vault", x: 66, y: 28 },
    { name: "reward-pocket", x: 70, y: 53 }
  ]
};

test("Wastestone floors 12-16 have connected traversal, portals, mining, and spawn anchors", () => {
  for (const floor of WASTESTONE_FLOORS) {
    const rows = makeFloorTiles(floor);
    expect(rows).toHaveLength(floorRows(floor));
    expect(rows.every((row) => row.length === floorCols(floor)), `floor ${floor} dimensions`).toBe(true);

    const probes = FLOOR_PROBES[floor] ?? [];
    const reached = reachableFrom(floor, probes[0]!.x, probes[0]!.y);
    expect(reached.size, `floor ${floor} should have a meaningful walkable region`).toBeGreaterThan(120);

    for (const probe of probes) {
      expect(isWalkable(rows, probe.x, probe.y), `floor ${floor} ${probe.name} should be walkable`).toBe(true);
      expect(reached.has(key(probe.x, probe.y)), `floor ${floor} ${probe.name} should connect to entry`).toBe(true);
      expect(zoneAt(floor, probe.x + 0.5, probe.y + 0.5), `floor ${floor} ${probe.name} zone`).toBe(`wastestoneDescent${floor - 11}`);
    }

    for (const spawn of MONSTER_SPAWNS.filter((entry) => entry.floor === floor)) {
      expect(isWalkable(rows, spawn.x, spawn.y), `${spawn.type} spawn on floor ${floor} should be walkable`).toBe(true);
      expect(reached.has(key(spawn.x, spawn.y)), `${spawn.type} spawn on floor ${floor} should connect to entry`).toBe(true);
    }

    for (const node of MINING_NODES.filter((entry) => entry.floor === floor)) {
      expect(isBlockedTile(tile(rows, node.x, node.y)), `${node.id} vein should occupy blocking ore`).toBe(true);
      expect(isWalkable(rows, node.approachX, node.approachY), `${node.id} approach should be walkable`).toBe(true);
      expect(reached.has(key(node.approachX, node.approachY)), `${node.id} approach should connect to entry`).toBe(true);
      expect(orthAdjacent(node.x, node.y, node.approachX, node.approachY), `${node.id} approach should border the vein`).toBe(true);
    }
  }

  expect(portalFor(0, 98.5, 35.5)).toMatchObject({ floor: 12, x: 8.5, y: 8.5 });
  expect(portalFor(12, 80.5, 51.5)).toMatchObject({ floor: 13, x: 8.5, y: 9.5 });
  expect(portalFor(13, 77.5, 50.5)).toMatchObject({ floor: 14, x: 9.5, y: 9.5 });
  expect(portalFor(14, 73.5, 52.5)).toMatchObject({ floor: 15, x: 8.5, y: 9.5 });
  expect(portalFor(15, 48.5, 53.5)).toMatchObject({ floor: 16, x: 9.5, y: 10.5 });
  expect(portalFor(16, 9.5, 10.5)).toMatchObject({ floor: 15, x: 48.5, y: 53.5 });
  expect(isSafeZone(12, 8.5, 8.5), "floor 12 entry pocket should be safe").toBe(true);
  expect(isSafeZone(13, 8.5, 9.5), "floor 13 entry pocket should be safe").toBe(true);
});

test("Wastestone balance metrics expose five distinct descent surfaces", () => {
  const metrics = areaBalanceMetrics(MONSTERS, MONSTER_SPAWNS).filter((metric) => metric.zone.startsWith("wastestoneDescent") && metric.role === "all");
  expect(metrics.map((metric) => metric.floor)).toEqual([12, 13, 14, 15, 16]);
  expect(metrics.map((metric) => metric.spawns)).toEqual([8, 11, 12, 13, 5]);
  expect(metrics.map((metric) => metric.maxLevel)).toEqual([28, 27, 35, 53, 55]);
  expect(metrics[0]!.averageLevel).toBeLessThan(metrics[2]!.averageLevel);
  expect(metrics[2]!.averageLevel).toBeLessThan(metrics[4]!.averageLevel);
  expect(metrics[4]!.uniqueMonsters).toBeGreaterThanOrEqual(4);
});

test("Wastestone runtime preview renders floors 12-16 with minimap labels and ore surfaces", async ({ page }) => {
  test.setTimeout(180000);
  logErrors(page);
  mkdirSync(OUT, { recursive: true });

  await page.goto("/?e2e");
  await join(page);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev god" }));
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev skills 50" }));
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "pickaxe", qty: 1 }] }));

  for (const floor of WASTESTONE_FLOORS) {
    const probe = FLOOR_PROBES[floor]!.at(-1)!;
    await place(page, floor, probe.x, probe.y);
    await expect(page.locator("#minimapZone")).toContainText(`F${floor}`);
    await expect(page.locator("#minimapZone")).toContainText(zoneLabel(floor));

    const miningNode = MINING_NODES.find((node) => node.floor === floor);
    if (miningNode) {
      await place(page, floor, miningNode.approachX, miningNode.approachY);
      const beforeQty = await inventoryQty(page, "mithril_ore") + await inventoryQty(page, "adamant_ore") + await inventoryQty(page, "gold_ore") + await inventoryQty(page, "silver_ore");
      await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "mineNode", id }), miningNode.id);
      await page.waitForFunction(
        (qty) => {
          const inventory = window.__TIB_E2E__?.self()?.inventory ?? [];
          return inventory.filter((item) => ["mithril_ore", "adamant_ore", "gold_ore", "silver_ore"].includes(item?.id ?? "")).reduce((sum, item) => sum + (item?.qty ?? 0), 0) > qty;
        },
        beforeQty,
        { timeout: 12000 }
      );
    }

    await page.waitForTimeout(800);
    await page.locator("#game canvas").screenshot({ path: path.join(OUT, `floor-${floor}-${probe.name}.png`) });
    const minimapPixels = await coloredPixelCount(page, "#minimapCanvas");
    expect(minimapPixels, `floor ${floor} minimap should render colored terrain`).toBeGreaterThan(3000);
  }
});

function reachableFrom(floor: number, startX: number, startY: number): Set<string> {
  const rows = makeFloorTiles(floor);
  const start: [number, number] = [Math.floor(startX), Math.floor(startY)];
  const seen = new Set<string>();
  const queue: Array<[number, number]> = [start];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const id = key(x, y);
    if (seen.has(id) || !isWalkable(rows, x, y)) continue;
    seen.add(id);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

function tile(rows: string[], x: number, y: number): string {
  return rows[Math.floor(y)]?.[Math.floor(x)] ?? "#";
}

function isWalkable(rows: string[], x: number, y: number): boolean {
  return !isBlockedTile(tile(rows, x, y));
}

function key(x: number, y: number): string {
  return `${Math.floor(x)},${Math.floor(y)}`;
}

function orthAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(Math.floor(ax) - Math.floor(bx)) + Math.abs(Math.floor(ay) - Math.floor(by)) === 1;
}

function zoneLabel(floor: number): string {
  return {
    12: "Old Crypt Intake",
    13: "Blackwater Sluice",
    14: "Ember Rift",
    15: "Oathless Delve",
    16: "Heart Vault"
  }[floor]!;
}

function logErrors(page: Page): void {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
}

async function join(page: Page): Promise<void> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
}

async function place(page: Page, floor: number, x: number, y: number): Promise<void> {
  const sx = scaleX(floor, x);
  const sy = scaleY(floor, y);
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor, x: sx, y: sy });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.hypot(me.x - p.x, me.y - p.y) < 1.2);
    },
    { floor, x: sx, y: sy },
    { timeout: 8000 }
  );
}

async function inventoryQty(page: Page, itemId: string): Promise<number> {
  return page.evaluate((id) => (window.__TIB_E2E__?.self()?.inventory ?? []).filter((item) => item?.id === id).reduce((sum, item) => sum + (item?.qty ?? 0), 0), itemId);
}

async function coloredPixelCount(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return 0;
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if ((pixels[i + 3] ?? 0) > 0 && ((pixels[i] ?? 0) !== 0 || (pixels[i + 1] ?? 0) !== 0 || (pixels[i + 2] ?? 0) !== 0)) count += 1;
    }
    return count;
  });
}
