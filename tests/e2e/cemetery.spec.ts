import { expect, test, type Page } from "@playwright/test";

test("Waystone south gate streams Southgate Cemetery art before reveal", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  const startupAssets = await page.evaluate(() => window.__TIB_E2E__?.assetResidency?.() ?? null);
  expect(startupAssets?.startupImages.some((asset) => asset.key === "graveyardTiles"), "Southgate Cemetery sheet should not be a startup asset").toBe(false);
  const startupGraveyard = startupAssets?.runtimeImages.find((asset) => asset.key === "graveyardTiles");
  expect(startupGraveyard?.tier).toBe("play-context");
  expect(startupGraveyard?.resident, "Southgate Cemetery sheet should wait for floor-context loading").toBe(false);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 0, x: 64.5, y: 70.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 1, null, { timeout: 8000 });
  await page.waitForFunction(() => {
    const textures = window.__TIB_E2E__?.textureResidency?.(["graveyardTiles", "tileGraveDirt", "tileGravePath", "tileGraveMoss", "spriteCrypt", "spriteFence", "spriteObelisk"]) ?? [];
    return textures.length === 7 && textures.every((texture) => texture.exists && texture.width > 0 && texture.height > 0);
  });
  const cemeteryAssets = await page.evaluate(() => window.__TIB_E2E__?.assetResidency?.() ?? null);
  const loadedGraveyard = cemeteryAssets?.runtimeImages.find((asset) => asset.key === "graveyardTiles");
  expect(loadedGraveyard?.trigger).toBe("play-context");
  expect(loadedGraveyard?.resident, "Southgate Cemetery sheet should be resident after traveling to floor 1").toBe(true);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 1, x: 56.5, y: 36.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 2, null, { timeout: 8000 });
  await page.waitForFunction(() => {
    const textures = window.__TIB_E2E__?.textureResidency?.(["graveyardTiles", "tileGravePath", "spriteStoneWall", "spriteObelisk"]) ?? [];
    return textures.length === 4 && textures.every((texture) => texture.exists && texture.width > 0 && texture.height > 0);
  });
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
