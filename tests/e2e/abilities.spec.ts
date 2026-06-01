import { expect, test, type Page } from "@playwright/test";
import { ABILITIES, scaleX, scaleY } from "../../src/shared.ts";

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

test("Generic Spellbook unlocks spells by Magic level and casts class-agnostic spells", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  await page.waitForFunction(() => {
    const ids = (window.__TIB_E2E__?.self()?.abilities ?? []).map((a) => a.id);
    return ids.includes("spell_spark") && ids.includes("spell_luminescence") && ids.includes("spell_purify_water");
  });
  expect(await abilityIds(page)).not.toContain("spell_ember_shot");

  await grantSkills(page, { magic: 9999 });
  await page.waitForFunction(() => {
    const ids = (window.__TIB_E2E__?.self()?.abilities ?? []).map((a) => a.id);
    return ids.includes("spell_ember_shot")
      && ids.includes("spell_zephyr_step")
      && ids.includes("spell_arcane_aegis")
      && ids.includes("spell_fissure")
      && ids.includes("spell_teleport_waystone");
  });

  await page.getByRole("button", { name: "Abilities" }).click();
  await page.locator(".ability-tab[data-ability-tab='spellbook']").click();
  await expect(page.locator(".ability-row[data-ability='spell_fissure']")).toBeVisible();
  await expect(page.locator(".ability-row[data-ability='spell_teleport_waystone']")).toBeVisible();

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 55.5, y: 36.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 3);
  await cast(page, "spell_teleport_waystone");
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 0, null, { timeout: 8000 });

  await cast(page, "spell_zephyr_step");
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.zephyrStep ?? 0) > 0);
  await cast(page, "spell_arcane_aegis");
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.arcaneAegis ?? 0) > 0);

  const target = await placeNearMonster(page, 1);
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "target", id }), target.id);
  await cast(page, "spell_frost_shard");
  await page.waitForFunction(
    (before) => {
      const monster = (window.__TIB_E2E__?.getState()?.monsters ?? []).find((m) => m.id === before.id);
      return !monster || monster.hp < before.hp;
    },
    target
  );
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

async function grantSkills(page: Page, skills: Record<string, number>): Promise<void> {
  await page.evaluate((value) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", skills: value }), skills);
}

async function abilityIds(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.__TIB_E2E__?.self()?.abilities ?? []).map((ability) => ability.id));
}

async function placeNearMonster(page: Page, floor: number): Promise<{ id: string; hp: number }> {
  const sx = scaleX(floor, 13.5);
  const sy = scaleY(floor, 12.5);
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor, x: sx, y: sy });
  const monster = await page.waitForFunction((f) => (window.__TIB_E2E__?.getState()?.monsters ?? []).find((m) => m.floor === f) ?? null, floor);
  const target = (await monster.jsonValue()) as { id: string; x: number; y: number; hp: number };
  await page.evaluate(
    (p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }),
    { floor, x: target.x, y: target.y + 0.5 }
  );
  return { id: target.id, hp: target.hp };
}

async function cast(page: Page, id: string): Promise<void> {
  await page.evaluate((abilityId) => window.__TIB_E2E__?.send({ type: "useClassAbility", id: abilityId }), id);
}
