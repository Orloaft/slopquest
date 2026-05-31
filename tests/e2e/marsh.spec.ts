import { expect, test, type Page } from "@playwright/test";
import { isBlockedTile, isSightBlocked, makeFloorTiles, scaleX, scaleY } from "../../src/shared.ts";

test("marsh tile semantics: water variants block movement but not sight", () => {
  for (const tile of ["W", "3", "4"]) {
    expect(isBlockedTile(tile)).toBe(true);
    expect(isSightBlocked(tile)).toBe(false);
  }

  const counts = countTiles(makeFloorTiles(5));
  expect((counts.W ?? 0) + (counts["3"] ?? 0)).toBeGreaterThan(counts["4"] ?? 0);
  expect(counts["3"] ?? 0).toBeGreaterThan(40);
  expect(counts["4"] ?? 0).toBeGreaterThan(20);
});

test("travel loop: forest west portal -> marsh, and the cliff ledge -> Waystone", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Step the forest's west-edge portal into the Sunken Marsh (floor 5).
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 1.5, y: 30.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 5, null, { timeout: 8000 });

  // The cliff ledge in the hut clearing drops one-way into northern Waystone (floor 0).
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 5, x: p.x, y: p.y }), { x: scaleX(5, 6.5), y: scaleY(5, 13.5) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 0, null, { timeout: 8000 });
});

test("Mire-Lotus is gated behind Foraging 5, then gatherable", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Stand at a Mire-Lotus and try to gather with starter Foraging — blocked.
  await place(page, 5, 36.5, 15.5);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "gatherHerb", id: "lotus-5-36-16" }));
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__TIB_E2E__?.self()?.action?.type ?? null)).not.toBe("herbing");
  expect(await page.evaluate(() => (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "herb"))).toBe(false);

  // Train Foraging to 5 (dev cheat), then the gather succeeds and grants Foraging XP.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev skills 5" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "foraging")?.level ?? 0) >= 5);
  const before = await page.evaluate(() => window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "foraging")?.xp ?? 0);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "gatherHerb", id: "lotus-5-36-16" }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.action?.type === "herbing");
  await page.waitForFunction(
    (b) => {
      const me = window.__TIB_E2E__?.self();
      if (!me) return false;
      const hasHerb = (me.inventory ?? []).some((i) => i?.id === "herb");
      return hasHerb && (me.skills.find((s) => s.id === "foraging")?.xp ?? 0) > b;
    },
    before
  );
});

test("a Mire Spitter damages and slows the player from range", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Stand on the causeway within a spitter's line of fire. Range is in tiles, so
  // on the expanded map we pick a walkable spot ~4 tiles from an anchored spitter
  // (already in expanded coordinates).
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 5, x: 55.5, y: 25.5 }));
  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    return Boolean(me && me.floor === 5 && Math.hypot(me.x - 55.5, me.y - 25.5) < 1.2);
  });
  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.monsters ?? []).some((m) => m.type === "mire_spitter" && m.floor === 5));

  // The anchored spitter's projectile applies a movement slow (and chips HP).
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.slowed ?? 0) > 0, null, { timeout: 15000 });
});

// --- helpers ---------------------------------------------------------------

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

// Coords are written in each floor's authored space; scale to the expanded map.
async function place(page: Page, floor: number, x: number, y: number): Promise<void> {
  const sx = scaleX(floor, x);
  const sy = scaleY(floor, y);
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor, x: sx, y: sy });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.hypot(me.x - p.x, me.y - p.y) < 1.2);
    },
    { floor, x: sx, y: sy }
  );
}

function countTiles(rows: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const tile of row) counts[tile] = (counts[tile] ?? 0) + 1;
  }
  return counts;
}
