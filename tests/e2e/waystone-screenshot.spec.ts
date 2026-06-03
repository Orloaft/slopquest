import { expect, test, type Page } from "@playwright/test";

// Boots the game, joins a fresh character (spawns on floor 0 = Waystone per
// START), lets the stage + sprites settle, and screenshots the live render.
// Also fails on any pageerror / console error so a missing-texture or wiring
// bug in the Waystone floor-0 integration surfaces instead of silently passing.
test("Waystone floor 0 renders in-browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean((window as any).__TIB_E2E__?.self()));

  // confirm we're on floor 0
  const floor = await page.evaluate(() => (window as any).__TIB_E2E__.self()?.floor);
  expect(floor).toBe(0);

  // let textures load + camera settle, then capture
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "artifacts/waystone-ingame.png" });

  // surface any runtime errors (e.g. missing sprite texture for a stage object)
  const relevant = errors.filter((e) => !/favicon|net::ERR|WebGL warning/i.test(e));
  expect(relevant, relevant.join("\n")).toEqual([]);
});
