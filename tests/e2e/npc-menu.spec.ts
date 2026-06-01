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
