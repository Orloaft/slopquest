import { expect, test, type Page } from "@playwright/test";
import { isBlockedTile, isSightBlocked, scaleX, scaleY } from "../../src/shared.ts";

test("desert tile semantics: quicksand/oasis block movement but not sight; ruins block both", () => {
  expect(isBlockedTile("Q")).toBe(true);
  expect(isSightBlocked("Q")).toBe(false);
  expect(isBlockedTile("V")).toBe(true);
  expect(isSightBlocked("V")).toBe(false);
  expect(isBlockedTile("U")).toBe(true);
  expect(isSightBlocked("U")).toBe(true);
});

test("travel loop: cemetery south portal -> desert, and the oasis passage -> Waystone", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 1, x: p.x, y: p.y }), { x: scaleX(1, 25.5), y: scaleY(1, 32.5) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 7, null, { timeout: 8000 });

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 7, x: p.x, y: p.y }), { x: scaleX(7, 25.5), y: scaleY(7, 31.5) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 0, null, { timeout: 8000 });
});

test("Glass-Sand Quartz is gatherable and trains Foraging", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 7, 11.5, 12.5);
  const before = await page.evaluate(() => window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "foraging")?.xp ?? 0);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "gatherHerb", id: "quartz-7-10-12" }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.action?.type === "herbing");
  await page.waitForFunction(
    (b) => {
      const me = window.__TIB_E2E__?.self();
      if (!me) return false;
      const hasQuartz = (me.inventory ?? []).some((i) => i?.id === "quartz");
      return hasQuartz && (me.skills.find((s) => s.id === "foraging")?.xp ?? 0) > b;
    },
    before
  );
});

test("a Sun-Scorched Wraith weakens the player's physical damage from range", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 7, 22.5, 10.5);
  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.monsters ?? []).some((m) => m.type === "sun_wraith" && m.floor === 7));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.weakened ?? 0) > 0, null, { timeout: 15000 });
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
