import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { scaleX, scaleY } from "../../src/shared.ts";

const OUT = path.join(process.cwd(), "artifacts", "beach-overview");

// Stand on the lower beach just south of each plateau so the shot frames, bottom
// to top: lower sand -> cliff face -> lit lip -> plateau top, with the stair flight.
const SHOTS = [
  { name: "plateau-bluff", x: 23, y: 22 },
  { name: "plateau-headland", x: 58, y: 24 },
  { name: "plateau-terrace", x: 35, y: 35 }
];

test("Beach plateau inspect", async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  for (const s of SHOTS) {
    const sx = scaleX(8, s.x + 0.5), sy = scaleY(8, s.y + 0.5);
    await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 8, x: p.x, y: p.y }), { x: sx, y: sy });
    await page.waitForFunction((p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === 8 && Math.abs(me.x - p.x) < 2 && Math.abs(me.y - p.y) < 2);
    }, { x: sx, y: sy }, { timeout: 6000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    const pos = await page.evaluate(() => { const me=window.__TIB_E2E__?.self(); return me?`${me.x.toFixed(1)},${me.y.toFixed(1)}`:'none'; });
    // eslint-disable-next-line no-console
    console.log(`SHOT ${s.name} target(scaled)=${sx.toFixed(1)},${sy.toFixed(1)} actual=${pos}`);
    await page.locator("#game canvas").screenshot({ path: path.join(OUT, `${s.name}.png`) });
  }
});
