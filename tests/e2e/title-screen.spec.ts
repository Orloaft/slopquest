import { expect, test } from "@playwright/test";

test("title screen: modals, embark to login, into the world", async ({ page }) => {
  await page.goto("/?e2e&title");
  await expect(page.locator("#titleScreen")).toBeVisible();
  await expect(page.locator("#join")).toBeHidden();

  // Settings + Credits modals open and close.
  await page.locator('[data-title-action="settings"]').click();
  await expect(page.locator("#titleSettings")).toBeVisible();
  await page.locator('[data-title-action="close-settings"]').click();
  await expect(page.locator("#titleSettings")).toBeHidden();

  await page.locator('[data-title-action="credits"]').click();
  await expect(page.locator("#titleCredits")).toBeVisible();
  await page.locator('[data-title-action="close-credits"]').click();

  // Embark opens the character-select OVER the title, which stays as a backdrop.
  await page.locator('[data-title-action="embark"]').click();
  await expect(page.locator("#join")).toBeVisible();
  await expect(page.locator("#joinBackdrop")).toBeVisible();
  await expect(page.locator("#titleScreen")).toBeVisible();

  // "Back to title" closes the character-select again.
  await page.locator("#joinBackButton").click();
  await expect(page.locator("#join")).toBeHidden();
  await expect(page.locator("#titleScreen")).toBeVisible();

  // Re-open and create a character into the world (which dismisses the title).
  await page.locator('[data-title-action="embark"]').click();
  await page.locator("#nameInput").fill(`titleflow_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await expect(page.locator("#frameTop")).toBeVisible({ timeout: 8000 });
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()), null, { timeout: 8000 });
  await page.waitForFunction(() => (window.__TIB_E2E__?.mapChunkStats?.().activeChunks ?? 0) > 0, null, { timeout: 8000 });
  await expect(page.locator("#join")).toBeHidden();
  await expect(page.locator("#titleScreen")).toBeHidden();
  console.log("title -> embark (overlay) -> back -> join -> world OK");
});
