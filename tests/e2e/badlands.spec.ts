import { expect, test, type Page } from "@playwright/test";
import { isBlockedTile, isSightBlocked, scaleX, scaleY } from "../../src/shared.ts";

test("badlands tile semantics: cliffs block sight, pits don't", () => {
  // Cliff (X) blocks movement AND sight; pit (P) blocks movement only.
  expect(isBlockedTile("X")).toBe(true);
  expect(isSightBlocked("X")).toBe(true);
  expect(isBlockedTile("P")).toBe(true);
  expect(isSightBlocked("P")).toBe(false);
});

test("travel loop: forest east portal -> badlands, and the ledge -> Northwatch", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 88.5, y: 29.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 6, null, { timeout: 8000 });

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 6, x: p.x, y: p.y }), { x: scaleX(6, 46.5), y: scaleY(6, 8.5) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 4, null, { timeout: 8000 });
});

test("a Dust Burrower ambushes from hiding, stunning the player", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // The burrower at (20,10) is hidden (not in the snapshot) until stepped on.
  await place(page, 6, 20.5, 10.5);
  // Stepping onto it triggers the ambush: it emerges and stuns.
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.stunned ?? 0) > 0, null, { timeout: 8000 });
  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.monsters ?? []).some((m) => m.type === "dust_burrower"));
});

test("copper ore is minable in the badlands dead-end canyon", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "pickaxe", qty: 1 }], floor: 6, x: p.x, y: p.y }), { x: scaleX(6, 3.5), y: scaleY(6, 22.5) });
  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    return Boolean(me && me.floor === 6 && (me.inventory ?? []).some((i) => i?.id === "pickaxe"));
  });
  const before = await page.evaluate(() => window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "mining")?.xp ?? 0);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "mineNode", id: "mine-6-2-22" }));
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
