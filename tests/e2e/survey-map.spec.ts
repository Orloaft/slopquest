import { expect, test, type Page } from "@playwright/test";

test("the [M] regional map is gated behind owning the Inked Survey", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // No survey in the pack: pressing M must not open the map screen.
  await focusGame(page);
  await page.keyboard.press("m");
  await page.waitForTimeout(300);
  await expect(page.locator("#mapScreen")).toBeHidden();
});

test("buying the survey unlocks fog-of-war reveal and the [M] map screen", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Grant the survey directly (the vendor path is covered by the shop), then
  // stand in the marsh so the walk-reveal perk inks tiles around the player.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "broken_reach_map", qty: 1 }] }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "broken_reach_map"));
  await place(page, 5, 34.5, 15.5);
  await page.waitForTimeout(600); // let a few update ticks ink the fog

  await focusGame(page);
  await page.keyboard.press("m");
  await expect(page.locator("#mapScreen")).toBeVisible();
  await expect(page.locator("#mapTitle")).toContainText("Broken Reach");

  // Standing in the marsh should have charted some tiles already.
  await expect(page.locator("#mapHint")).not.toContainText("Uncharted");

  // M toggles it back shut.
  await page.keyboard.press("m");
  await expect(page.locator("#mapScreen")).toBeHidden();
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

async function focusGame(page: Page): Promise<void> {
  // Click the canvas so the keypress reaches Phaser's window listener and not a
  // stray text input.
  await page.locator("canvas").first().click({ position: { x: 5, y: 5 } });
}

async function place(page: Page, floor: number, x: number, y: number): Promise<void> {
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor, x, y });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.hypot(me.x - p.x, me.y - p.y) < 1.2);
    },
    { floor, x, y }
  );
}
