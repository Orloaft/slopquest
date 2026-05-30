import { expect, test, type Page } from "@playwright/test";
import { isBlockedTile, isSightBlocked } from "../../src/shared.ts";

test("coast tile semantics: ocean/river block movement not sight; jungle wall blocks both", () => {
  expect(isBlockedTile("I")).toBe(true); // ocean
  expect(isSightBlocked("I")).toBe(false);
  expect(isBlockedTile("i")).toBe(true); // jungle river
  expect(isSightBlocked("i")).toBe(false);
  expect(isBlockedTile("E")).toBe(true); // jungle wall
  expect(isSightBlocked("E")).toBe(true);
});

test("travel chain: desert -> beach -> jungle, and beach -> desert back", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 7, x: 10.5, y: 32.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 8, null, { timeout: 8000 });

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 8, x: 50.5, y: 14.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 9, null, { timeout: 8000 });

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 8, x: 25.5, y: 1.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 7, null, { timeout: 8000 });
});

test("Coastal Harvest forage yields a reagent and trains Foraging", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 8, 15.5, 6.5);
  const before = await page.evaluate(() => window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "foraging")?.xp ?? 0);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "gatherHerb", id: "shore-8-15-5" }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.action?.type === "herbing");
  await page.waitForFunction(
    (b) => {
      const me = window.__TIB_E2E__?.self();
      if (!me) return false;
      return (me.inventory ?? []).some((i) => i?.id === "herb") && (me.skills.find((s) => s.id === "foraging")?.xp ?? 0) > b;
    },
    before
  );
});

test("a Venomous Stalker ambushes from the undergrowth, stunning the player", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 9, 12.5, 8.5);
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.stunned ?? 0) > 0, null, { timeout: 8000 });
});

test("an Ancient Totem Wraith slows the player from down a path", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 9, 20.5, 8.5);
  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.monsters ?? []).some((m) => m.type === "totem_wraith" && m.floor === 9));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.slowed ?? 0) > 0, null, { timeout: 15000 });
});

test("the Jungle Vault is sealed (stepping on it does not transport)", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 9, 15.5, 26.5);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__TIB_E2E__?.self()?.floor)).toBe(9);
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
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor, x, y });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.hypot(me.x - p.x, me.y - p.y) < 1.4);
    },
    { floor, x, y }
  );
}
