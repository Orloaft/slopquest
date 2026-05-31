import { expect, test, type Page } from "@playwright/test";
import { isBlockedTile, isSightBlocked, makeFloorTiles, scaleX, scaleY } from "../../src/shared.ts";

test("badlands tile semantics: cliffs block sight, pits don't", () => {
  // Cliff (X) blocks movement AND sight; pit (P) blocks movement only.
  expect(isBlockedTile("X")).toBe(true);
  expect(isSightBlocked("X")).toBe(true);
  expect(isBlockedTile("P")).toBe(true);
  expect(isSightBlocked("P")).toBe(false);
  for (const tile of ["6", "7"]) {
    expect(isBlockedTile(tile)).toBe(false);
    expect(isSightBlocked(tile)).toBe(false);
  }
});

test("badlands canyon uses floor variants without replacing the cliff vocabulary", () => {
  const counts = countTiles(makeFloorTiles(6));
  expect(counts["6"] ?? 0).toBeGreaterThan(25);
  expect(counts["7"] ?? 0).toBeGreaterThan(25);
  expect(counts.X ?? 0).toBeGreaterThan(40);
  expect(counts.w ?? 0).toBeGreaterThan(1000);
});

test("travel loop: forest east portal -> badlands, and the ledge -> Northwatch", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 108.5, y: 35.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 6, null, { timeout: 8000 });

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 6, x: p.x, y: p.y }), { x: scaleX(6, 95.5), y: scaleY(6, 16.5) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 4, null, { timeout: 8000 });
});

test("a Dust Burrower ambushes from hiding, stunning the player", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // The upper-run burrower is hidden (not in the snapshot) until stepped on.
  await place(page, 6, 29.5, 22.5);
  // Stepping onto it triggers the ambush: it emerges and stuns. If the burst
  // damage rolls high enough, death also proves the ambush fired.
  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    return Boolean(me && ((me.buffs?.stunned ?? 0) > 0 || me.dead));
  }, null, { timeout: 8000 });
  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.monsters ?? []).some((m) => m.type === "dust_burrower"));
});

test("copper ore is minable in the badlands dead-end canyon", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "pickaxe", qty: 1 }], floor: 6, x: p.x, y: p.y }), { x: scaleX(6, 6.5), y: scaleY(6, 49.5) });
  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    return Boolean(me && me.floor === 6 && (me.inventory ?? []).some((i) => i?.id === "pickaxe"));
  });
  const before = await page.evaluate(() => window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "mining")?.xp ?? 0);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "mineNode", id: "mine-6-5-40" }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.action?.type === "mining");
  await page.waitForFunction(
    (b) => {
      const me = window.__TIB_E2E__?.self();
      if (!me) return false;
      const hasOre = (me.inventory ?? []).some((i) => i?.id === "copper_ore");
      return hasOre && (me.skills.find((s) => s.id === "mining")?.xp ?? 0) > b;
    },
    before
  );
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

async function place(page: Page, floor: number, x: number, y: number): Promise<void> {
  const sx = scaleX(floor, x);
  const sy = scaleY(floor, y);
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor, x: sx, y: sy });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.hypot(me.x - p.x, me.y - p.y) < 1.4);
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
