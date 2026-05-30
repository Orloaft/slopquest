import { expect, test, type Page } from "@playwright/test";
import { scaleX, scaleY } from "../../src/shared.ts";

test("a hunting bow fires ranged attacks that train the Ranged skill", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  // Drop a couple of tiles from the FAR (eastern) cemetery skeleton — the Frost
  // Nova test one-shots the NW one, so target a skeleton it never touches.
  await page.evaluate((p) => {
    window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "hunting_bow", qty: 1 }], floor: 1, x: p.x, y: p.y });
  }, { x: scaleX(1, 69.5), y: scaleY(1, 24.5) });
  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    return Boolean(me && me.floor === 1 && (me.inventory ?? []).some((i) => i?.id === "hunting_bow"));
  });

  // Target the nearest monster; the tick auto-fires arrows at range.
  const targetId = await page.evaluate(() => {
    const me = window.__TIB_E2E__?.self();
    const monsters = (window.__TIB_E2E__?.getState()?.monsters ?? []).filter((m) => m.floor === me?.floor);
    monsters.sort((a, b) => Math.hypot(a.x - (me?.x ?? 0), a.y - (me?.y ?? 0)) - Math.hypot(b.x - (me?.x ?? 0), b.y - (me?.y ?? 0)));
    return monsters[0]?.id ?? null;
  });
  expect(targetId).toBeTruthy();
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "target", id: id as string }), targetId);

  // Ranged XP climbs (and Melee does not — the bow routes to Ranged). Re-target
  // the nearest monster periodically so a wandering aggro can't stall the shot.
  await page.waitForFunction(
    () => {
      const me = window.__TIB_E2E__?.self();
      if (!me) return false;
      if ((me.skills.find((s) => s.id === "ranged")?.xp ?? 0) > 0) return true;
      const near = (window.__TIB_E2E__?.getState()?.monsters ?? [])
        .filter((m) => m.floor === me.floor)
        .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
      if (near && me.targetId !== near.id) window.__TIB_E2E__?.send({ type: "target", id: near.id });
      return false;
    },
    null,
    { timeout: 25000 }
  );
});

test("a class unlocks at its trainer, equips in town, and is blocked outside town", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  // Meet the Vanguard thresholds (Melee 15 / Defense 15) and stand by Captain Doran.
  await page.evaluate((p) => {
    window.__TIB_E2E__?.send({ type: "e2eGrantItems", skills: { attack: 99999, defense: 99999 }, floor: 0, x: p.x, y: p.y });
  }, { x: scaleX(0, 42.5), y: scaleY(0, 38.5) });
  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    return Boolean(me && me.floor === 0 && (me.skills.find((s) => s.id === "attack")?.level ?? 0) >= 15);
  });

  // Talk to the trainer to unlock Vanguard.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "talkNpc", id: "fighter-captain" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.unlockedClasses ?? []).includes("vanguard"));

  // Equip it in town; abilities swap to the Vanguard kit.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "setClass", classKey: "vanguard" }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.classKey === "vanguard");
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.abilities ?? []).some((a) => a.id === "provoke"));

  // Leaving town blocks class changes: the toggle is rejected and the stance holds.
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 1, x: p.x, y: p.y }), { x: scaleX(1, 13), y: scaleY(1, 12) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 1);
  const version = await page.evaluate(() => window.__TIB_E2E__?.stateVersion() ?? 0);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "setClass", classKey: "adventurer" }));
  await page.waitForFunction((v) => (window.__TIB_E2E__?.stateVersion() ?? 0) > v + 4, version);
  expect(await page.evaluate(() => window.__TIB_E2E__?.self()?.classKey)).toBe("vanguard");
});

test("gathering trains Foraging and heavy loads register as weight", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  // Foraging XP from a herb patch.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 12.5, y: 9.5 }));
  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    return Boolean(me && me.floor === 3 && Math.hypot(me.x - 12.5, me.y - 9.5) < 0.6);
  });
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "gatherHerb", id: "herb-3-11-9" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "foraging")?.xp ?? 0) > 0);

  // A heavy stack pushes carried weight past the soft cap.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "copper_ore", qty: 40 }] }));
  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    return Boolean(me && me.weight > me.maxWeight);
  });
});

async function joinFreshCharacter(page: Page): Promise<string> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  return name;
}
