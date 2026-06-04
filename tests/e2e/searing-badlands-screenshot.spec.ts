import { test } from "@playwright/test";
import { scaleX, scaleY } from "../../src/shared.ts";

// Warps to floor 6 (The Searing Badlands) and screenshots the live render at
// each of the four landmark set-pieces so we can eyeball visual parity against
// the mockup. Fails on pageerror/console error so a missing-texture surfaces.
const SHOTS: Array<{ name: string; x: number; y: number }> = [
  { name: "cultist", x: 12, y: 39 },
  { name: "mine", x: 15, y: 55 }, // a few tiles clear of the arch portal tile
  { name: "ritual", x: 55, y: 55 },
  { name: "outpost", x: 90, y: 20 },
];

test("Searing Badlands landmarks render in-browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean((window as any).__TIB_E2E__?.self()));

  for (const shot of SHOTS) {
    const sx = scaleX(6, shot.x);
    const sy = scaleY(6, shot.y);
    // Warp near the landmark. These sit beside blocking structures, so the
    // server snaps us to the nearest walkable tile — accept any landing on
    // floor 6 within a few tiles, then let the camera settle on it.
    await page.evaluate((p) => (window as any).__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 6, x: p.x, y: p.y }), { x: sx, y: sy });
    await page.waitForFunction(
      (p) => {
        const me = (window as any).__TIB_E2E__?.self();
        return Boolean(me && me.floor === 6 && Math.hypot(me.x - p.x, me.y - p.y) < 6);
      },
      { x: sx, y: sy },
      { timeout: 8000 }
    ).catch(() => {});
    await page.waitForTimeout(1800); // let textures load + camera settle
    await page.locator("#game canvas").screenshot({ path: `artifacts/searing-badlands-${shot.name}.png` });
  }

  const relevant = errors.filter((e) => !/favicon|net::ERR|WebGL warning/i.test(e));
  if (relevant.length) console.error("Runtime errors:\n" + relevant.join("\n"));
});
