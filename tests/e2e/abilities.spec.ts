import { expect, test, type Page } from "@playwright/test";
import { ABILITIES } from "../../src/shared.ts";

test("Adventurer class abilities: Sprint and Second Wind activate, run cooldowns, and surface in HUD", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  await page.getByRole("button", { name: "Abilities" }).click();
  await expect(page.locator("#abilitiesPanel")).toBeVisible();
  await expect(page.locator(".ability-row").filter({ hasText: ABILITIES.sprint!.label })).toBeVisible();
  await expect(page.locator(".ability-row").filter({ hasText: ABILITIES.second_wind!.label })).toBeVisible();

  // Sprint: activate, verify active+cooldown state, buff strip, and disabled button.
  await page.locator(".ability-activate[data-ability='sprint']").click();
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.sprint ?? 0) > 0);
  const sprintState = await page.evaluate(() => {
    const sprint = window.__TIB_E2E__?.self()?.abilities?.find((a) => a.id === "sprint");
    return { active: sprint?.activeRemainingMs ?? 0, cooldown: sprint?.cooldownRemainingMs ?? 0 };
  });
  expect(sprintState.active).toBeGreaterThan(0);
  expect(sprintState.cooldown).toBeGreaterThan(0);
  await expect(page.locator("#buffTracker")).toContainText("Sprint");
  await expect(page.locator(".ability-activate[data-ability='sprint']")).toBeDisabled();

  // Second Wind: blocked at full HP.
  await page.locator(".ability-activate[data-ability='second_wind']").click();
  await page.waitForTimeout(300);
  const fullHpState = await page.evaluate(() => {
    const me = window.__TIB_E2E__?.self();
    const sw = me?.abilities?.find((a) => a.id === "second_wind");
    return { hp: me?.hp, maxHp: me?.maxHp, buff: me?.buffs?.secondWind ?? 0, cooldown: sw?.cooldownRemainingMs ?? 0 };
  });
  expect(fullHpState.hp).toBe(fullHpState.maxHp);
  expect(fullHpState.buff).toBe(0);
  expect(fullHpState.cooldown).toBe(0);

  // Drop HP, activate Second Wind, and verify it ticks healing.
  await setPlayerHp(page, 10);
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.hp ?? 999) <= 12);
  await page.locator(".ability-activate[data-ability='second_wind']").click();
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.secondWind ?? 0) > 0);
  const startHp = await page.evaluate(() => window.__TIB_E2E__?.self()?.hp);
  await expect(page.locator("#buffTracker")).toContainText("Second wind");

  await page.waitForFunction(
    (start) => (window.__TIB_E2E__?.self()?.hp ?? 0) > (start ?? 0) + 3,
    startHp,
    { timeout: 5000 }
  );

  const secondWindState = await page.evaluate(() => {
    const sw = window.__TIB_E2E__?.self()?.abilities?.find((a) => a.id === "second_wind");
    return { active: sw?.activeRemainingMs ?? 0, cooldown: sw?.cooldownRemainingMs ?? 0 };
  });
  expect(secondWindState.active).toBeGreaterThan(0);
  expect(secondWindState.cooldown).toBeGreaterThan(0);
});

async function joinFreshCharacter(page: Page): Promise<void> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
}

async function setPlayerHp(page: Page, hp: number): Promise<void> {
  await page.evaluate((value) => {
    window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [], hp: value });
  }, hp);
}
