import { expect, test, type Page } from "@playwright/test";
import { scaleX, scaleY } from "../../src/shared.ts";

// Audio never plays under e2e (it's only unlocked by a real user gesture), but
// the per-zone selection still drives currentTrack(), so we can assert the map.
test("zone music: each floor + safe outpost selects its track", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  await page.goto("/?e2e");
  await join(page);

  await expectTrack(page, "garden"); // Waystone

  await teleport(page, 3, 45.5, 30.5); // forest already in expanded coords
  await expectTrack(page, "harmony");

  await teleport(page, 5, 55.5, 25.5); // marsh causeway (not the safe hut)
  await expectTrack(page, "swamp-fever");

  await teleport(page, 5, scaleX(5, 8), scaleY(5, 10)); // Alchemist's Hut outpost
  await expectTrack(page, "serenade");

  await teleport(page, 6, scaleX(6, 20), scaleY(6, 18)); // badlands canyon
  await expectTrack(page, "al-kharid");
});

async function expectTrack(page: Page, name: string): Promise<void> {
  await page.waitForFunction((n) => window.__TIB_E2E__?.currentTrack?.() === n, name, { timeout: 8000 });
  expect(await page.evaluate(() => window.__TIB_E2E__?.currentTrack?.())).toBe(name);
}

async function teleport(page: Page, floor: number, x: number, y: number): Promise<void> {
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor, x, y });
  await page.waitForFunction((f) => window.__TIB_E2E__?.self()?.floor === f, floor, { timeout: 8000 });
}

async function join(page: Page): Promise<void> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
}
