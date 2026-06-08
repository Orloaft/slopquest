import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { scaleX, scaleY } from "../../src/shared.ts";

// Throwaway survey harness: tours the Deepdelve Mine (floor 10) and screenshots
// each ore chamber + spine. Not an assertion test — emits PNGs for the overhaul.
// Coords are floor-10 chamber centres from shared.ts:970.
const OUT = path.join(process.cwd(), "artifacts", "deepmine-overview");

const REGIONS: Array<{ name: string; x: number; y: number }> = [
  { name: "1-entry-chamber", x: 12, y: 10 },
  { name: "2-iron-chamber", x: 36, y: 10 },
  { name: "3-coal-chamber", x: 18, y: 34 },
  { name: "4-silver-chamber", x: 54, y: 23 },
  { name: "5-gold-chamber", x: 74, y: 37 },
  { name: "6-mithril-pocket", x: 47, y: 53 },
  { name: "7-spine-corridor", x: 16, y: 28 },
  // Vein close-ups: stand on each ore's approach tile so the vein sits ~1 tile north of centre.
  { name: "8-copper-vein", x: 6, y: 8 },
  { name: "9-gold-vein", x: 70, y: 34 },
  { name: "10-mithril-vein", x: 42, y: 52 }
];

test("Deepmine overview tour", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });

  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  // Survey only — keep the player alive through the deep chambers so death dialogs never block a
  // teleport and veins always render.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev god" }));

  for (const region of REGIONS) {
    const sx = scaleX(10, region.x + 0.5);
    const sy = scaleY(10, region.y + 0.5);
    await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 10, x: p.x, y: p.y }), { x: sx, y: sy });
    await page
      .waitForFunction(
        (p) => {
          const me = window.__TIB_E2E__?.self();
          return Boolean(me && me.floor === 10 && Math.abs(me.x - p.x) < 2 && Math.abs(me.y - p.y) < 2);
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
