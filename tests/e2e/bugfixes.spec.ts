import { expect, test, type Page } from "@playwright/test";

test("Respawn at temple button revives the player (not swallowed by the canvas)", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Drop next to the cemetery NW skeleton with 1 HP so the next hit kills us.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 1, x: 16.5, y: 15.5, hp: 1 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.dead === true, null, { timeout: 20000 });
  await expect(page.locator("#death")).toBeVisible();

  // The button must actually receive the click (the HUD is pointer-events:none).
  await page.locator("#respawnButton").click({ timeout: 5000 });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.dead === false, null, { timeout: 8000 });
  const me = await page.evaluate(() => ({ floor: window.__TIB_E2E__?.self()?.floor }));
  expect(me.floor).toBe(0); // back at the Waystone temple
});

test("a monster spawned on the player's tile separates instead of sitting invisible on top", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Stand in the forest, then spawn a wolf on the EXACT tile the player occupies.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 55.5, y: 40.5 }));
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self() && window.__TIB_E2E__.self()!.floor === 3));
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eSpawnMonster", monster: "wolf", floor: 3, x: 55, y: 40 }));

  // Within a moment the server must push it off the player's exact position.
  await page.waitForFunction(
    () => {
      const me = window.__TIB_E2E__?.self();
      const wolf = (window.__TIB_E2E__?.getState()?.monsters ?? []).find((m) => m.type === "wolf" && m.floor === 3);
      if (!me || !wolf) return false;
      return Math.hypot(wolf.x - me.x, wolf.y - me.y) >= 0.5; // no longer coincident
    },
    null,
    { timeout: 6000 }
  );
});

test.describe("equipment panel sizing", () => {
  test.use({ viewport: { width: 1280, height: 900 } }); // a normal desktop with room

  test("the equipment panel fits its content without a scrollbar", async ({ page }) => {
    logErrors(page);
    await page.goto("/?e2e");
    await join(page);

    await page.locator("#equipmentButton").click();
    await expect(page.locator("#equipmentPanel")).toBeVisible();
    // No vertical overflow => no scrollbar (allow a 2px rounding fudge).
    const overflow = await page.locator("#equipmentPanel").evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeLessThanOrEqual(2);
  });
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
