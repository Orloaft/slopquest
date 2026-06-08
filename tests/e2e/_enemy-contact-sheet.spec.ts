import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { scaleX, scaleY } from "../../src/shared.ts";

// Throwaway: spawn each suspect/control monster in-world (Northwood floor 3) and
// screenshot it, so the slicing/family of the real rendered sprite is visible.
const OUT = path.join(process.cwd(), "artifacts", "enemy-slice-audit");
const FLOOR = 3;

// The 4 types with no resolver mapping (render as goblin) + real-family controls.
const SUBJECTS = ["rat", "spider"];

test("enemy spawn shots", async ({ page }) => {
  test.setTimeout(150000);
  mkdirSync(OUT, { recursive: true });
  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev god" }));

  const mx = 55;
  const my = 40;
  for (const type of SUBJECTS) {
    // Spawn the monster, then stand the player one tile south of it.
    await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eSpawnMonster", monster: p.type, floor: p.floor, x: p.mx, y: p.my }), { type, floor: FLOOR, mx, my });
    const sx = scaleX(FLOOR, mx + 0.5);
    const sy = scaleY(FLOOR, my + 2.5);
    await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor: FLOOR, x: sx, y: sy });
    await page
      .waitForFunction(
        (p) => {
          const me = window.__TIB_E2E__?.self();
          return Boolean(me && me.floor === p.floor && Math.abs(me.x - p.x) < 2 && Math.abs(me.y - p.y) < 2);
        },
        { floor: FLOOR, x: sx, y: sy },
        { timeout: 6000 }
      )
      .catch(() => undefined);
    await page.waitForTimeout(500);
    await page.locator("#game canvas").screenshot({ path: path.join(OUT, `mob-${type}.png`) });
    // eslint-disable-next-line no-console
    console.log(`SHOT mob-${type}`);
  }
});
