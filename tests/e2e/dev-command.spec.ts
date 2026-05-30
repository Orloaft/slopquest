import { test, type Page } from "@playwright/test";

test("/dev chat command kits skills and /dev unlock opens all classes", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "attack")?.level ?? 0) >= 20);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev unlock" }));
  await page.waitForFunction(
    () => ["vanguard", "thief", "apothecary", "archer", "mage"].every((k) => (window.__TIB_E2E__?.self()?.unlockedClasses ?? []).includes(k))
  );
});
