import { expect, test, type Page } from "@playwright/test";

// The party chat box can be collapsed to just its header and reopened.
test("party chat minimizes and restores", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await expect(page.locator("#chatPanel")).toBeVisible();
  await expect(page.locator("#chatLog")).toBeVisible();

  // Minimize -> the log/input hide, the header (with the toggle) stays.
  await page.locator("#chatToggle").click();
  await expect(page.locator("#chatPanel")).toHaveClass(/minimized/);
  await expect(page.locator("#chatLog")).toBeHidden();
  await expect(page.locator("#chatForm")).toBeHidden();
  await expect(page.locator("#chatToggle")).toBeVisible();

  // Restore.
  await page.locator("#chatToggle").click();
  await expect(page.locator("#chatPanel")).not.toHaveClass(/minimized/);
  await expect(page.locator("#chatLog")).toBeVisible();
});

// The minimized state survives a reload (persisted to localStorage).
test("chat minimized state persists across reloads", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await page.locator("#chatToggle").click();
  await expect(page.locator("#chatPanel")).toHaveClass(/minimized/);

  await page.reload();
  await join(page);
  await expect(page.locator("#chatPanel")).toHaveClass(/minimized/);
});

// The title Settings "Interface size" slider drives a global --ui-scale and persists.
test("interface-size slider scales the HUD and persists", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e&title");

  await page.locator('[data-title-action="settings"]').click();
  await expect(page.locator("#titleSettings")).toBeVisible();
  await expect(page.locator("#settingUIScale")).toBeVisible();

  // Default is 100% / scale 1.
  expect(await readScale(page)).toBe("1");

  // Bump it up; the CSS variable, the label, and the persisted pref all update.
  await page.locator("#settingUIScale").fill("1.5");
  await page.locator("#settingUIScale").dispatchEvent("input");
  expect(await readScale(page)).toBe("1.5");
  await expect(page.locator("#settingUIScaleValue")).toHaveText("150%");

  const stored = await page.evaluate(() => localStorage.getItem("tib:ui"));
  expect(stored).toContain("1.5");

  // It is re-applied on the next load.
  await page.reload();
  expect(await readScale(page)).toBe("1.5");
});

function readScale(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim());
}

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
