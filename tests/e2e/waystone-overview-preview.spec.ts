import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Throwaway survey harness: tours Waystone (floor 0) and screenshots each
// district so we can read the whole stage for a Pokémon/Chrono-Trigger pass.
// Not an assertion test — it just emits PNGs.
const OUT = path.join(process.cwd(), "artifacts", "waystone-overview");

const REGIONS: Array<{ name: string; x: number; y: number }> = [
  { name: "1-plaza", x: 56, y: 37 },
  { name: "2-north-houses", x: 53, y: 31 },
  { name: "3-riverside-west", x: 35, y: 31 },
  { name: "4-east-market", x: 75, y: 37 },
  { name: "5-garden-se", x: 71, y: 47 },
  { name: "6-lanes-mid", x: 50, y: 43 },
  { name: "7-sw-meadow", x: 33, y: 50 },
  { name: "8-ne-entry", x: 60, y: 21 },
  { name: "9-south-edge", x: 50, y: 54 }
];

test("Waystone overview tour", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });

  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));

  for (const region of REGIONS) {
    await page.evaluate(
      (p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 0, x: p.x + 0.5, y: p.y + 0.5 }),
      { x: region.x, y: region.y }
    );
    await page
      .waitForFunction(
        (p) => {
          const me = window.__TIB_E2E__?.self();
          return Boolean(me && me.floor === 0 && Math.abs(me.x - (p.x + 0.5)) < 2 && Math.abs(me.y - (p.y + 0.5)) < 2);
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
