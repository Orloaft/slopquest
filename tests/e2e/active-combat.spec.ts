import { expect, test, type Page } from "@playwright/test";
import { scaleX, scaleY } from "../../src/shared.ts";

// Action-combat direction: critical hits. forceCrit makes every player hit a
// crit deterministically; we assert a crit-flagged hit event actually lands
// (drives the bigger red damage float client-side).
test("Crit: forceCrit makes a player hit land as a critical", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  // Drop onto the cemetery next to a skeleton spawn, with deterministic crits on.
  await page.evaluate((p) => {
    window.__TIB_E2E__?.send({ type: "e2eGrantItems", forceCrit: true, floor: 1, x: p.x, y: p.y });
  }, { x: scaleX(1, 16), y: scaleY(1, 14) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 1);

  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.monsters ?? []).some((m) => m.hp > 0));

  // Retarget the nearest monster and cast the ranged base strike each beat (the
  // player doesn't auto-path to its target, so we drive the attack). Crits are
  // forced, so the first landed hit is a crit. Keep HP topped so we can't die mid-test.
  let found = false;
  for (let i = 0; i < 24 && !found; i += 1) {
    await page.evaluate(() => {
      const hooks = window.__TIB_E2E__;
      const me = hooks?.self();
      if (!hooks || !me) return;
      hooks.send({ type: "e2eGrantItems", hp: 120 });
      const monsters = hooks.getState()?.monsters ?? [];
      let best: { id: string; d: number } | null = null;
      for (const m of monsters) {
        if (m.hp <= 0 || m.floor !== me.floor) continue;
        const d = (m.x - me.x) ** 2 + (m.y - me.y) ** 2;
        if (!best || d < best.d) best = { id: m.id, d };
      }
      if (best) {
        hooks.send({ type: "target", id: best.id });
        hooks.send({ type: "ability", slot: "1" });
      }
    });
    await page.waitForTimeout(800);
    found = await page.evaluate(() => {
      const me = window.__TIB_E2E__?.self();
      return (window.__TIB_E2E__?.recentEvents() ?? []).some((e) => e.type === "hit" && e.crit === true && e.from === me?.id);
    });
  }
  expect(found).toBe(true);
});

// The keystone dodge: a dodge request produces the server-side dash (its effect
// event reaches the client), proving input -> server -> event is wired through.
test("Dodge: a dodge request fires the dash and reaches the client", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  await page.evaluate((p) => {
    window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 1, x: p.x, y: p.y });
  }, { x: scaleX(1, 20), y: scaleY(1, 20) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 1);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "dodge" }));

  await page.waitForFunction(
    () => {
      const me = window.__TIB_E2E__?.self();
      return (window.__TIB_E2E__?.recentEvents() ?? []).some((e) => e.type === "effect" && e.text === "dash" && e.from === me?.id);
    },
    undefined,
    { timeout: 5000 }
  );
});

async function joinFreshCharacter(page: Page): Promise<string> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  return name;
}
