import { expect, test, type Page } from "@playwright/test";
import { scaleX, scaleY } from "../../src/shared.ts";

test("gathering a herb node yields a herb", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  // Stand on a Northwood herb patch's approach tile so the gather lands with no pathing.
  await page.evaluate(() => {
    window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 14.5, y: 11.5 });
  });
  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    return Boolean(me && me.floor === 3 && Math.hypot(me.x - 14.5, me.y - 11.5) < 0.6);
  });

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "gatherHerb", id: "herb-3-11-9" }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.action?.type === "herbing");

  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.inventory ?? []).some((item) => item?.id === "herb"));
});

test("alchemist sells empty flasks and an alchemy kit", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  // Fund the player and place them by the alchemist (Sage Ellwyn).
  await page.evaluate((p) => {
    window.__TIB_E2E__?.send({ type: "e2eGrantItems", gold: 100, floor: 0, x: p.x, y: p.y });
  }, { x: scaleX(0, 59.5), y: scaleY(0, 37.5) });
  await page.waitForFunction((p) => {
    const me = window.__TIB_E2E__?.self();
    return Boolean(me && me.floor === 0 && me.gold >= 100 && Math.hypot(me.x - p.x, me.y - p.y) < 0.6);
  }, { x: scaleX(0, 59.5), y: scaleY(0, 37.5) });

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "buy", item: "empty_flask" }));
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "buy", item: "alchemy_kit" }));

  await page.waitForFunction(() => {
    const inv = window.__TIB_E2E__?.self()?.inventory ?? [];
    return inv.some((i) => i?.id === "empty_flask") && inv.some((i) => i?.id === "alchemy_kit");
  });
  // Gold was spent (flask 6 + kit 40 = 46, so under the original 100).
  expect(await page.evaluate(() => window.__TIB_E2E__?.self()?.gold ?? 0)).toBeLessThan(100);
});

test("alchemist menu brews a herb + flask into a potion for Alchemy XP", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  // Give the player the ingredients + kit and stand them at the alchemist.
  await page.evaluate((p) => {
    window.__TIB_E2E__?.send({
      type: "e2eGrantItems",
      floor: 0,
      x: p.x,
      y: p.y,
      items: [
        { id: "herb", qty: 1 },
        { id: "empty_flask", qty: 1 },
        { id: "alchemy_kit", qty: 1 }
      ]
    });
  }, { x: scaleX(0, 59.5), y: scaleY(0, 37.5) });
  await page.waitForFunction((p) => {
    const me = window.__TIB_E2E__?.self();
    if (!me || me.floor !== 0 || Math.hypot(me.x - p.x, me.y - p.y) > 0.6) return false;
    const inv = me.inventory ?? [];
    return ["herb", "empty_flask", "alchemy_kit"].every((id) => inv.some((i) => i?.id === id));
  }, { x: scaleX(0, 59.5), y: scaleY(0, 37.5) });

  // Talk to the alchemist, advance through the dialogue, and the craft menu opens.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "talkNpc", id: "alchemist" }));
  await expect(page.locator("#dialogue")).toBeVisible();
  for (let i = 0; i < 6 && (await page.locator("#dialogue").isVisible()); i += 1) {
    await page.locator("#dialogueNextButton").click();
  }
  await expect(page.locator("#alchemist")).toBeVisible();

  const alchemyBefore = await page.evaluate(
    () => window.__TIB_E2E__?.self()?.skills.find((skill) => skill.id === "alchemy")?.xp ?? 0
  );

  await page.locator("#brewButton").click();

  // A potion appears, Alchemy XP rises, and the flask is consumed.
  await page.waitForFunction(
    (before) => {
      const me = window.__TIB_E2E__?.self();
      if (!me) return false;
      const inv = me.inventory ?? [];
      const hasPotion = inv.some((i) => i?.id === "potion");
      const flaskGone = !inv.some((i) => i?.id === "empty_flask");
      const xp = me.skills.find((skill) => skill.id === "alchemy")?.xp ?? 0;
      return hasPotion && flaskGone && xp > before;
    },
    alchemyBefore
  );
});

async function joinFreshCharacter(page: Page): Promise<string> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  return name;
}
