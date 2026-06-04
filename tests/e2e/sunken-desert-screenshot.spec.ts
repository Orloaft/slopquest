import { test } from "@playwright/test";
import { scaleX, scaleY } from "../../src/shared.ts";

// Warps to floor 7 (The Sunken Desert) and screenshots the live render at the
// main sandstone-canyon set-pieces, so we can eyeball the painted-relief pass
// (lit mesa tops + ribbed sandstone faces + rim lip + strata bench + foot AO)
// reused from floor 6 with the sandstone recolour. Fails-soft on runtime errors
// (logged) so a missing-texture surfaces.
const SHOTS: Array<{ name: string; x: number; y: number }> = [
  { name: "canyon-nw", x: 22, y: 21 }, // south face of the NW massif (lip ~row 19)
  { name: "canyon-central", x: 50, y: 40 }, // south face of the central massif (lip ~row 38)
  { name: "tall-west", x: 15, y: 68 }, // tall west massif — strata-bench terracing
  { name: "se-massif", x: 80, y: 62 }, // south face of the big SE massif (lip ~row 60)
  { name: "oasis", x: 40, y: 58 }, // oasis pool + outpost clearing — palette check
  { name: "flank-tall", x: 30, y: 55 }, // east-facing flank of the tall west massif (col 26, ~21 tall)
  { name: "flank-east", x: 63, y: 31 }, // east-facing flank of the central massif (col 60)
];

test("Sunken Desert sandstone relief renders in-browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean((window as any).__TIB_E2E__?.self()));

  for (const shot of SHOTS) {
    const sx = scaleX(7, shot.x);
    const sy = scaleY(7, shot.y);
    await page.evaluate((p) => (window as any).__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 7, x: p.x, y: p.y }), { x: sx, y: sy });
    await page.waitForFunction(
      (p) => {
        const me = (window as any).__TIB_E2E__?.self();
        return Boolean(me && me.floor === 7 && Math.hypot(me.x - p.x, me.y - p.y) < 8);
      },
      { x: sx, y: sy },
      { timeout: 8000 }
    ).catch(() => {});
    await page.waitForTimeout(1800); // let textures load + camera settle
    await page.locator("#game canvas").screenshot({ path: `artifacts/sunken-desert-${shot.name}.png` });
  }

  const relevant = errors.filter((e) => !/favicon|net::ERR|WebGL warning/i.test(e));
  if (relevant.length) console.error("Runtime errors:\n" + relevant.join("\n"));
});
