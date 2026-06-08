import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { scaleX, scaleY } from "../../src/shared.ts";

// Throwaway survey harness: tours The Sunken Beach (floor 8) and screenshots
// each district. Not an assertion test — it just emits PNGs.
const OUT = path.join(process.cwd(), "artifacts", "beach-overview");

const REGIONS: Array<{ name: string; x: number; y: number }> = [
  { name: "1-center-sand", x: 50, y: 25 },
  { name: "2-west-pier", x: 24, y: 24 },
  { name: "3-east-pier", x: 58, y: 26 },
  { name: "4-north-cove", x: 30, y: 6 },
  { name: "5-west-shore", x: 9, y: 16 },
  { name: "6-south-sand", x: 45, y: 45 },
  { name: "7-east-shore", x: 80, y: 26 },
  { name: "8-ledges", x: 34, y: 34 }
];

test("Beach overview tour", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });

  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));

  for (const region of REGIONS) {
    const sx = scaleX(8, region.x + 0.5);
    const sy = scaleY(8, region.y + 0.5);
    await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 8, x: p.x, y: p.y }), { x: sx, y: sy });
    await page
      .waitForFunction(
        (p) => {
          const me = window.__TIB_E2E__?.self();
          return Boolean(me && me.floor === 8 && Math.abs(me.x - p.x) < 2 && Math.abs(me.y - p.y) < 2);
        },
        { x: sx, y: sy },
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
