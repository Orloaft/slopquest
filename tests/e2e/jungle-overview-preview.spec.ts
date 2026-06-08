import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { scaleX, scaleY } from "../../src/shared.ts";

// Throwaway survey harness: tours The Untamed Jungle (floor 9) and screenshots
// walkable runs/clearings. Not an assertion test — it just emits PNGs for the
// jungle overhaul (option B). Coords are floor-9 `-` runs from shared.ts:817.
const OUT = path.join(process.cwd(), "artifacts", "jungle-overview");

const REGIONS: Array<{ name: string; x: number; y: number }> = [
  { name: "1-entry-run", x: 7, y: 19 },
  { name: "2-north-clearing", x: 20, y: 9 },
  { name: "3-vault-clearing", x: 20, y: 42 },
  { name: "4-river-ford", x: 38, y: 9 },
  { name: "5-east-run", x: 50, y: 9 },
  { name: "6-vault-arena-plateau", x: 88, y: 46 },
  { name: "7-east-central-plateau-top", x: 52, y: 39 },
  { name: "8-east-central-plateau-foot", x: 58, y: 44 },
  { name: "9-choke-ford", x: 54, y: 33 }
];

test("Jungle overview tour", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });

  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));

  for (const region of REGIONS) {
    const sx = scaleX(9, region.x + 0.5);
    const sy = scaleY(9, region.y + 0.5);
    await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 9, x: p.x, y: p.y }), { x: sx, y: sy });
    await page
      .waitForFunction(
        (p) => {
          const me = window.__TIB_E2E__?.self();
          return Boolean(me && me.floor === 9 && Math.abs(me.x - p.x) < 2 && Math.abs(me.y - p.y) < 2);
        },
        { x: sx, y: sy },
        { timeout: 6000 }
      )
      .catch(() => undefined);
    await page.waitForTimeout(800);
    const pos = await page.evaluate(() => {
      const me = window.__TIB_E2E__?.self();
      return me ? `${me.x.toFixed(1)},${me.y.toFixed(1)}` : "none";
    });
    // eslint-disable-next-line no-console
    console.log(`SHOT ${region.name} target=${sx.toFixed(1)},${sy.toFixed(1)} actual=${pos}`);
    await page.locator("#game canvas").screenshot({ path: path.join(OUT, `${region.name}.png`) });
  }
});
