import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Throwaway baseline: warps to Northwatch (floor 4) and screenshots the live render
// at the garrison's key areas, so we can eyeball the CURRENT committed look before any
// overhaul. Not an assertion test — emits PNGs only. Delete after review.
const OUT = path.join(process.cwd(), "artifacts", "northwatch-baseline");

const SHOTS: Array<{ name: string; x: number; y: number }> = [
  { name: "street-grid", x: 40, y: 40 }, // packed blocks + street grid
  { name: "ne-district", x: 80, y: 27 }, // dense NE houses
  { name: "harbor", x: 84, y: 53 }, // SE harbour inlet + boats
  { name: "plaza", x: 54, y: 33 }, // central plaza + wells + trainers
  { name: "cathedral", x: 24, y: 43 } // cathedral + hall (W)
];

test("Northwatch (floor 4) baseline shots", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/?e2e");
  await page.locator("#nameInput").fill(`e2e_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));

  for (const s of SHOTS) {
    await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 4, x: p.x + 0.5, y: p.y + 0.5 }), s);
    await page.waitForFunction(
      (p) => {
        const me = window.__TIB_E2E__?.self();
        return Boolean(me && me.floor === 4 && Math.hypot(me.x - (p.x + 0.5), me.y - (p.y + 0.5)) < 7);
      },
      s,
      { timeout: 10000 }
    ).catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator("#game canvas").screenshot({ path: path.join(OUT, `${s.name}.png`) });
    // eslint-disable-next-line no-console
    console.log(`captured ${s.name} @ ${s.x},${s.y}`);
  }
  const relevant = errors.filter((e) => !/favicon|net::ERR|WebGL warning/i.test(e));
  if (relevant.length) console.error("Runtime errors:\n" + relevant.join("\n"));
});
