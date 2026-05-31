import { expect, test, type Page } from "@playwright/test";
import { isSafeZone, portalFor } from "../../src/shared.ts";

test("Deepdelve Mine: safe entry chamber, infested deep, two-way badlands stair", () => {
  // Entry chamber is a safe staging cave; the deep mithril/adamant pocket is not.
  expect(isSafeZone(10, 8.5, 11.5)).toBe(true);
  expect(isSafeZone(10, 50.5, 55.5)).toBe(false);
  // The badlands shaft (>) descends into the mine; the stair (<) climbs back.
  expect(portalFor(6, 11, 53)?.floor).toBe(10);
  expect(portalFor(10, 6, 8)?.floor).toBe(6);
});

test("descend the badlands shaft, mine tiered cave ore, gate mithril behind Mining 40", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "pickaxe", qty: 1 }] }));

  // Step onto the badlands copper-dead-end shaft (>) and drop into the mine.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 6, x: 11.5, y: 53.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 10, null, { timeout: 8000 });

  // Entry chamber copper vein: mineable at Mining 1.
  await place(page, 10, 6, 7);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "mineNode", id: "mine-10-6-6" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "copper_ore"), null, { timeout: 12000 });

  // Deepest pocket mithril vein: gated at Mining 1 — no mithril ore is produced.
  await place(page, 10, 42, 51);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "mineNode", id: "mine-10-42-50" }));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "mithril_ore"))).toBe(false);

  // Train Mining to 40, then the mithril vein yields mithril ore.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev skills 40" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "mining")?.level ?? 0) >= 40);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "mineNode", id: "mine-10-42-50" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "mithril_ore"), null, { timeout: 12000 });

  // Climb the stair (<) back up to the Searing Badlands.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 10, x: 6.5, y: 8.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 6, null, { timeout: 8000 });
});

// --- helpers ---------------------------------------------------------------

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

async function place(page: Page, floor: number, x: number, y: number): Promise<void> {
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x + 0.5, y: p.y + 0.5 }), { floor, x, y });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.hypot(me.x - (p.x + 0.5), me.y - (p.y + 0.5)) < 1.2);
    },
    { floor, x, y }
  );
}
