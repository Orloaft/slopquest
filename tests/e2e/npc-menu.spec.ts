import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

test("right-clicking a merchant opens a quick menu; Trade goes straight to the shop", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Stand next to the Wayfarer Trader (vendor) so the right-click lands and Trade
  // arrives immediately.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 0, x: 49.5, y: 38.5 }));
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self() && window.__TIB_E2E__.self()!.floor === 0));
  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.npcs ?? []).some((n) => n.id === "trader"));
  await page.waitForTimeout(300); // let the camera settle so the screen point is accurate

  const pt = await page.evaluate(() => window.__TIB_E2E__?.npcScreenPoint?.("trader") ?? null);
  expect(pt, "trader should have a screen point").not.toBeNull();

  // Right-click the merchant -> bespoke menu (no browser menu).
  await page.mouse.click(pt!.x, pt!.y, { button: "right" });
  await expect(page.locator("#npcMenu")).toBeVisible();
  await expect(page.locator("#npcMenu .npc-menu-item", { hasText: "Talk" })).toBeVisible();
  await expect(page.locator("#npcMenu .npc-menu-item", { hasText: "Trade" })).toBeVisible();
  await page.screenshot({ path: "/tmp/npc-menu.png" });

  // Trade -> the shop opens directly (no dialogue in the way).
  await page.locator("#npcMenu .npc-menu-item", { hasText: "Trade" }).click();
  await expect(page.locator("#vendor")).toBeVisible({ timeout: 4000 });
  await expect(page.locator("#dialogue")).toBeHidden();
  await expect(page.locator("#npcMenu")).toBeHidden();
});

test("right-clicking a monster offers Attack and Examine", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 60.5, y: 40.5 }));
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self() && window.__TIB_E2E__.self()!.floor === 3));
  await page.waitForTimeout(300); // camera settle
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eSpawnMonster", monster: "wolf", floor: 3, x: 57, y: 40 }));
  const wolfId = await page
    .waitForFunction(() => (window.__TIB_E2E__?.getState()?.monsters ?? []).find((m) => m.type === "wolf" && m.floor === 3)?.id ?? null)
    .then((h) => h.jsonValue() as Promise<string>);

  const pt = await page.evaluate((id) => window.__TIB_E2E__?.monsterScreenPoint?.(id) ?? null, wolfId);
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y, { button: "right" });
  await expect(page.locator("#npcMenu")).toBeVisible();
  await expect(page.locator("#npcMenu .npc-menu-item", { hasText: "Attack" })).toBeVisible();
  await expect(page.locator("#npcMenu .npc-menu-item", { hasText: "Examine" })).toBeVisible();
  await page.locator("#npcMenu .npc-menu-item", { hasText: "Examine" }).click();
  await expect(page.locator("#systemFeed")).toContainText("predator"); // the bestiary description
});

test("right-clicking an ore vein offers Mine and Examine", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Stand by the Northwood copper vein (at 10.5,59.5).
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 11.5, y: 59.5 }));
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self() && window.__TIB_E2E__.self()!.floor === 3));
  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.miningNodes ?? []).some((n) => n.id === "mine-3-8-49"));
  await page.waitForTimeout(300);
  const pt = await page.evaluate(() => window.__TIB_E2E__?.worldScreenPoint?.(10.5, 59.5) ?? null);
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y, { button: "right" });
  await expect(page.locator("#npcMenu .npc-menu-item").filter({ hasText: /^Mine$/ })).toBeVisible();
  await page.locator("#npcMenu .npc-menu-item", { hasText: "Examine" }).click();
  await expect(page.locator("#systemFeed")).toContainText("copper vein");
});

test("right-clicking an inventory item shows Eat and Examine", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "cooked_fish", qty: 2 }] }));
  await page.locator("#inventoryButton").click();
  await expect(page.locator("#inventoryPanel")).toBeVisible();
  await page.locator("[data-item='cooked_fish']").click({ button: "right" });
  await expect(page.locator("#npcMenu .npc-menu-item", { hasText: "Eat" })).toBeVisible();
  await page.locator("#npcMenu .npc-menu-item", { hasText: "Examine" }).click();
  await expect(page.locator("#systemFeed")).toContainText("Cooked Fish");
});

test("right-clicking empty ground offers Walk here, which moves the player", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 55.5, y: 40.5 }));
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self() && window.__TIB_E2E__.self()!.floor === 3));
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({ x: window.__TIB_E2E__?.self()?.x ?? 0 }));

  // Right-click open ground to the right of the (centered) player.
  await page.mouse.click(820, 400, { button: "right" });
  await expect(page.locator("#npcMenu .npc-menu-item", { hasText: "Walk here" })).toBeVisible();
  await page.locator("#npcMenu .npc-menu-item", { hasText: "Walk here" }).click();
  await page.waitForFunction((b) => (window.__TIB_E2E__?.self()?.x ?? 0) > b.x + 0.6, before, { timeout: 6000 });
});

test("a quest-giver's menu surfaces a Quest verb and Examine", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // The cemetery warden (role: quest) — target wherever it currently is.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 0, x: 61.5, y: 57.5 }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.npcs ?? []).some((n) => n.id === "cemetery-warden"));
  await page.waitForTimeout(300);
  const pt = await page.evaluate(() => window.__TIB_E2E__?.npcScreenPoint?.("cemetery-warden") ?? null);
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y, { button: "right" });
  await expect(page.locator("#npcMenu .npc-menu-item", { hasText: "Quest" })).toBeVisible();
  await expect(page.locator("#npcMenu .npc-menu-item", { hasText: "Examine" })).toBeVisible();
});

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
