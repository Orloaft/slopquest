import { expect, test, type Page } from "@playwright/test";

// Changing stage should raise the loading screen (named for the destination) and
// only clear it once the new floor is entered and its map/entities have painted.
test("the loading screen covers a stage transition and names the destination", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await page.waitForTimeout(500); // initial world load settles

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 55.5, y: 36.5 }));

  // It appears, named for the zone we're entering...
  await page.waitForFunction(() => !document.getElementById("loadingScreen")?.classList.contains("hidden"), null, { timeout: 3000 });
  await expect(page.locator("#loadingTitle")).toContainText("Northwood");

  // ...then clears, with us on the new floor.
  await page.waitForFunction(() => document.getElementById("loadingScreen")?.classList.contains("hidden"), null, { timeout: 3000 });
  expect(await page.evaluate(() => window.__TIB_E2E__?.self()?.floor)).toBe(3);
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
