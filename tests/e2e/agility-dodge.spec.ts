import { expect, test, type Page } from "@playwright/test";
import { CLASSES, dodgeChanceFor } from "../../src/shared.ts";

test("dodgeChanceFor: Adventurer base is 5% and scales with Agility, capped", () => {
  expect(CLASSES["adventurer"]!.dodgeChance).toBeCloseTo(0.05, 5);
  // Level 1 is the bare class base.
  expect(dodgeChanceFor("adventurer", 1)).toBeCloseTo(0.05, 5);
  // +0.5% per level above 1.
  expect(dodgeChanceFor("adventurer", 11)).toBeCloseTo(0.1, 5);
  expect(dodgeChanceFor("adventurer", 21)).toBeCloseTo(0.15, 5);
  // Agility bonus is capped at +20%, so base + cap = 25%.
  expect(dodgeChanceFor("adventurer", 1000)).toBeCloseTo(0.25, 5);
  // Unknown classes have no base; at level 1 there's no bonus either.
  expect(dodgeChanceFor("unknown", 1)).toBe(0);
  // Monotonic non-decreasing across levels.
  let prev = -1;
  for (let lvl = 1; lvl <= 60; lvl += 1) {
    const c = dodgeChanceFor("adventurer", lvl);
    expect(c).toBeGreaterThanOrEqual(prev);
    expect(c).toBeLessThanOrEqual(0.3);
    prev = c;
  }
});

test("Agility: a forced dodge negates a monster hit and grants Agility XP", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  // Enable deterministic dodging and drop the player onto a non-safe floor right
  // next to a skeleton spawn so it aggros and swings.
  await page.evaluate(() => {
    window.__TIB_E2E__?.send({ type: "e2eGrantItems", forceDodge: true, floor: 1, x: 13, y: 12 });
  });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 1);

  const maxHp = await page.evaluate(() => window.__TIB_E2E__?.self()?.maxHp ?? 0);

  // Every incoming hit is dodged: HP holds at full while Agility XP climbs.
  await page.waitForFunction(
    (full) => {
      const me = window.__TIB_E2E__?.self();
      if (!me) return false;
      const agility = me.skills.find((skill) => skill.id === "agility")?.xp ?? 0;
      return agility > 0 && me.hp === full;
    },
    maxHp,
    { timeout: 15000 }
  );
});

async function joinFreshCharacter(page: Page): Promise<string> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  return name;
}
