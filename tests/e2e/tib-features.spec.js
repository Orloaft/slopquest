import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

test("skills, firemaking, and cooking are usable and visually present", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await page.goto("/?e2e");
  await joinFreshCharacter(page);
  await grantFeatureItems(page);

  await page.getByRole("button", { name: "Skills" }).click();
  await expect(page.locator("#skillsPanel")).toBeVisible();
  await expect(page.locator(".skill-row", { hasText: "Fishing" })).toBeVisible();
  await expect(page.locator(".skill-row", { hasText: "Firemaking" })).toBeVisible();
  await expect(page.locator(".skill-row", { hasText: "Cooking" })).toBeVisible();
  expect(visualStats(await page.locator("#skillsPanel").screenshot()).meaningfulPixels).toBeGreaterThan(1000);
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Inventory" }).click();
  await expect(page.locator("#inventoryPanel")).toBeVisible();
  await page.locator("[data-item='flint_steel']").click();
  await expect(page.locator("[data-item='flint_steel']")).toHaveClass(/selected/);
  await page.locator("[data-item='logs']").click();

  await page.waitForFunction(() => window.__TIB_E2E__?.getState()?.fires?.length > 0);
  await expect(page.locator("#inventoryPanel")).toBeHidden();
  expect(visualStats(await page.locator("canvas").screenshot()).orangePixels).toBeGreaterThan(20);

  const firePoint = await page.waitForFunction(() => window.__TIB_E2E__?.fireScreenPoint?.());
  await page.locator("canvas").click({ position: await firePoint.jsonValue() });
  await expect(page.locator("#inventoryPanel")).toBeVisible();
  await expect(page.locator("[data-item='raw_fish']")).toBeVisible();
  await page.locator("[data-item='raw_fish']").click();

  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.action?.type === "cooking");
  await page.waitForFunction(() => {
    const inventory = window.__TIB_E2E__?.self()?.inventory ?? [];
    return inventory.some((item) => item?.id === "cooked_fish") && !inventory.some((item) => item?.id === "raw_fish");
  });

  await page.getByRole("button", { name: "Inventory" }).click();
  await expect(page.locator("[data-item='cooked_fish']")).toBeVisible();
  expect(visualStats(await page.locator("#inventoryPanel").screenshot()).meaningfulPixels).toBeGreaterThan(750);
});

test("actor animation frames keep a stable bottom-center anchor", async ({ page }) => {
  await page.goto("/?e2e");
  await joinFreshCharacter(page);
  const drift = await page.waitForFunction(() => {
    const rows = window.__TIB_E2E__?.actorFrameAnchorDrift?.();
    return rows?.length ? rows : false;
  });
  const rows = await drift.jsonValue();
  const unstable = rows.filter((row) => row.driftX > 0.5 || row.driftY > 0);
  expect(unstable).toEqual([]);
});

async function joinFreshCharacter(page) {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
}

async function grantFeatureItems(page) {
  await page.evaluate(() => {
    window.__TIB_E2E__.send({
      type: "e2eGrantItems",
      items: [
        { id: "flint_steel", qty: 1 },
        { id: "logs", qty: 1 },
        { id: "raw_fish", qty: 1 }
      ],
      floor: 0,
      x: 16.5,
      y: 17.5,
      gold: 0
    });
  });
  await page.waitForFunction(() => {
    const ids = (window.__TIB_E2E__?.self()?.inventory ?? []).filter(Boolean).map((item) => item.id);
    return ids.includes("flint_steel") && ids.includes("logs") && ids.includes("raw_fish");
  });
}

function visualStats(buffer) {
  const png = PNG.sync.read(buffer);
  let meaningfulPixels = 0;
  let orangePixels = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const a = png.data[i + 3];
    if (a > 0 && Math.max(r, g, b) - Math.min(r, g, b) > 16) meaningfulPixels += 1;
    if (a > 0 && r > 170 && g > 55 && g < 190 && b < 110) orangePixels += 1;
  }
  return { meaningfulPixels, orangePixels };
}
