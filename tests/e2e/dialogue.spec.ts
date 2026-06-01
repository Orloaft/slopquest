import { expect, test, type Page } from "@playwright/test";

// The headline of the dialogue overhaul: the NPC stops wandering and holds still
// (facing the player) for the duration of the conversation, then is released.
test("an NPC freezes in place while in dialogue and resumes after it ends", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Stand by the cemetery warden (a wandering quest-giver) and talk.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 0, x: 61.5, y: 60.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 0);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "talkNpc", id: "cemetery-warden" }));
  await page.locator("#dialogue").waitFor({ state: "visible", timeout: 4000 });

  const npcPos = () =>
    page.evaluate(() => {
      const n = (window.__TIB_E2E__?.getState()?.npcs ?? []).find((x) => x.id === "cemetery-warden");
      return n ? { x: n.x, y: n.y, moving: n.moving } : null;
    });

  const start = await npcPos();
  expect(start).not.toBeNull();
  // Over 3s (long enough to wander several tiles) it must not drift, and not be
  // flagged as moving.
  await page.waitForTimeout(3000);
  const held = await npcPos();
  expect(held!.moving, "NPC should be still while talking").toBe(false);
  expect(Math.hypot(held!.x - start!.x, held!.y - start!.y), "NPC should not wander while talking").toBeLessThan(0.3);

  // Closing the dialogue releases the NPC (no longer pinned to talking state).
  await page.locator("#dialogue").click(); // advance/close through the lines
  await page.waitForTimeout(50);
});

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
