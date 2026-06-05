import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Throwaway: current-state shots of the Sunken Marsh (floor 5) before the overhaul.
const OUT = path.join(process.cwd(), "artifacts", "marsh-baseline");
const SHOTS: Array<{ name: string; x: number; y: number }> = [
  { name: "entry-basin", x: 60, y: 26 },
  { name: "causeway-bridges", x: 34, y: 24 },
  { name: "hut-clearing", x: 12, y: 20 },
  { name: "lotus-pocket", x: 18, y: 43 },
  { name: "mushroom-bog", x: 50, y: 52 }
];

test("Marsh (floor 5) overview", async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await page.goto("/?e2e");
  await page.locator("#nameInput").fill(`e2e_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 5, x: 55.5, y: 26.5 }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 5, undefined, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__TIB_E2E__?.setUserZoom(0.2));
  await page.waitForTimeout(2000);
  await page.locator("#game canvas").screenshot({ path: path.join(OUT, "overview.png") });
});

test("Marsh (floor 5) baseline shots", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });
  await page.goto("/?e2e");
  await page.locator("#nameInput").fill(`e2e_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  for (const s of SHOTS) {
    await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 5, x: p.x + 0.5, y: p.y + 0.5 }), s);
    await page.waitForFunction(
      (p) => {
        const me = window.__TIB_E2E__?.self();
        return Boolean(me && me.floor === 5 && Math.hypot(me.x - (p.x + 0.5), me.y - (p.y + 0.5)) < 7);
      },
      s,
      { timeout: 10000 }
    ).catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator("#game canvas").screenshot({ path: path.join(OUT, `${s.name}.png`) });
    // eslint-disable-next-line no-console
    console.log(`captured ${s.name} @ ${s.x},${s.y}`);
  }
});
