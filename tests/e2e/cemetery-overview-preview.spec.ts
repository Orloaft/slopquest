import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Throwaway survey harness: tours Southgate Cemetery (floor 1) and screenshots
// each district. Not an assertion test — it just emits PNGs.
const OUT = path.join(process.cwd(), "artifacts", "cemetery-overview");

const REGIONS: Array<{ name: string; x: number; y: number }> = [
  { name: "1-crypt-center", x: 55, y: 40 },
  { name: "2-mausoleum-east", x: 79, y: 27 },
  { name: "3-nw-plots", x: 20, y: 14 },
  { name: "4-se-plots", x: 85, y: 54 },
  { name: "5-sw-plots", x: 25, y: 50 },
  { name: "6-ne-plots", x: 90, y: 18 },
  { name: "7-south-gate", x: 50, y: 56 },
  { name: "8-north-edge", x: 50, y: 12 }
];

test("Cemetery overview tour", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });

  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));

  for (const region of REGIONS) {
    await page.evaluate(
      (p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 1, x: p.x + 0.5, y: p.y + 0.5 }),
      { x: region.x, y: region.y }
    );
    await page
      .waitForFunction(
        (p) => {
          const me = window.__TIB_E2E__?.self();
          return Boolean(me && me.floor === 1 && Math.abs(me.x - (p.x + 0.5)) < 2 && Math.abs(me.y - (p.y + 0.5)) < 2);
        },
        { x: region.x, y: region.y },
        { timeout: 6000 }
      )
      .catch(() => undefined);
    await page.waitForTimeout(900);
    await page.locator("#game canvas").screenshot({ path: path.join(OUT, `${region.name}.png`) });
    const pos = await page.evaluate(() => {
      const me = window.__TIB_E2E__?.self();
      return me ? `${me.x.toFixed(1)},${me.y.toFixed(1)}` : "none";
    });
    // eslint-disable-next-line no-console
    console.log(`captured ${region.name} -> at ${pos}`);
  }
});
