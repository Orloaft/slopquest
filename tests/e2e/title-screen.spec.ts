import { expect, test } from "@playwright/test";

test("title screen: modals, embark to login, into the world", async ({ page }) => {
  await page.goto("/");
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

  // Embark reveals the login/character-select.
  await page.locator('[data-title-action="embark"]').click();
  await expect(page.locator("#titleScreen")).toBeHidden();
  await expect(page.locator("#join")).toBeVisible();

  // And a character can still be created into the world.
  await page.locator("#nameInput").fill("titleflow");
  await page.locator("#joinButton").click();
  await expect(page.locator(".top-left")).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#join")).toBeHidden();
  console.log("title -> embark -> join -> world OK");
});
