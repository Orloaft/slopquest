import { expect, test, type Locator, type Page } from "@playwright/test";

test("abilities drag from the abilities panel into the hotbar, persist, and activate", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  const name = await joinFreshCharacter(page);

  await page.getByRole("button", { name: "Abilities" }).click();
  await expect(page.locator("#abilitiesPanel")).toBeVisible();

  // Drag Sprint into hotbar slot 0 and Second Wind into slot 1.
  const sprintRow = page.locator(".ability-row[data-ability='sprint']");
  const secondWindRow = page.locator(".ability-row[data-ability='second_wind']");
  await expect(sprintRow).toBeVisible();
  await expect(secondWindRow).toBeVisible();

  await dragHtml5(page, sprintRow, hotbarSlot(page, 0));
  const sprintSlot = page.locator(".hotbar-slot[data-slot='0'][data-ability='sprint']");
  await expect(sprintSlot).toBeVisible();
  await expect(sprintSlot.locator(".hotbar-ability")).toHaveText("SP");

  await dragHtml5(page, secondWindRow, hotbarSlot(page, 1));
  const secondWindSlot = page.locator(".hotbar-slot[data-slot='1'][data-ability='second_wind']");
  await expect(secondWindSlot).toBeVisible();
  await expect(secondWindSlot.locator(".hotbar-ability")).toHaveText("SW");

  // Layout persists per-character in localStorage.
  const stored = await page.evaluate((n) => localStorage.getItem(`tib.hotbar.${n}`), name);
  expect(stored).toContain('"kind":"ability"');
  expect(stored).toContain('"abilityId":"sprint"');
  expect(stored).toContain('"abilityId":"second_wind"');

  // Activate Sprint via the "1" hotkey: server grants the buff and the slot
  // reflects the active state.
  await page.keyboard.press("1");
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.sprint ?? 0) > 0);
  await expect(page.locator("#buffTracker")).toContainText("Sprint");
  await expect(page.locator(".hotbar-slot[data-slot='0']")).toHaveClass(/ability-active/);

  // Activate Second Wind by clicking its hotbar slot: blocked at full HP, so
  // drop HP first, then confirm the click drives the heal buff.
  await setPlayerHp(page, 10);
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.hp ?? 999) <= 12);
  await secondWindSlot.click();
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.secondWind ?? 0) > 0);
  await expect(page.locator("#buffTracker")).toContainText("Second wind");
});

test("a usable item drags from the inventory into the hotbar and is consumed on use", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  await joinFreshCharacter(page);
  await grantItems(page, [{ id: "cooked_fish", qty: 3 }]);

  await page.getByRole("button", { name: "Inventory" }).click();
  await expect(page.locator("#inventoryPanel")).toBeVisible();
  const invSlot = page.locator("#inventoryGrid [data-item='cooked_fish']");
  await expect(invSlot).toBeVisible();

  await dragHtml5(page, invSlot, hotbarSlot(page, 2));
  const foodSlot = page.locator(".hotbar-slot[data-slot='2'][data-item='cooked_fish']");
  await expect(foodSlot).toBeVisible();
  await expect(foodSlot.locator(".hotbar-qty")).toHaveText("3");

  // Clicking the slot uses the item; the hotbar quantity tracks the inventory.
  await foodSlot.click();
  await page.waitForFunction(
    (id) =>
      (window.__TIB_E2E__?.self()?.inventory ?? [])
        .filter((slot) => slot?.id === id)
        .reduce((sum, slot) => sum + (slot!.qty ?? 1), 0) === 2,
    "cooked_fish"
  );
  await expect(foodSlot.locator(".hotbar-qty")).toHaveText("2");
});

function hotbarSlot(page: Page, index: number): Locator {
  return page.locator(`.hotbar-slot[data-slot='${index}']`);
}

// Native HTML5 drag-and-drop: Playwright's mouse-based dragTo does not emit the
// dragstart/drop events the hotbar listens for, so dispatch them with a shared
// DataTransfer.
async function dragHtml5(page: Page, source: Locator, target: Locator): Promise<void> {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await source.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}

async function joinFreshCharacter(page: Page): Promise<string> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  return name;
}

async function grantItems(page: Page, items: Array<{ id: string; qty: number }>): Promise<void> {
  await page.evaluate((payload) => {
    window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: payload });
  }, items);
  await page.waitForFunction(
    (payload) =>
      payload.every((item) => {
        const have = (window.__TIB_E2E__?.self()?.inventory ?? [])
          .filter((slot) => slot?.id === item.id)
          .reduce((sum, slot) => sum + (slot!.qty ?? 1), 0);
        return have >= item.qty;
      }),
    items
  );
}

async function setPlayerHp(page: Page, hp: number): Promise<void> {
  await page.evaluate((value) => {
    window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [], hp: value });
  }, hp);
}
