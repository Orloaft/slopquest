import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Throwaway: zooms the floor-4 camera all the way out for a whole-city overview
// to compare against the mockup during the Northwatch rebuild. Emits one PNG.
const OUT = path.join(process.cwd(), "artifacts", "northwatch-baseline");

test("Northwatch (floor 4) overview", async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/?e2e");
  await page.locator("#nameInput").fill(`e2e_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 4, x: 55.5, y: 36.5 }));
  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    return Boolean(me && me.floor === 4);
  }, undefined, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__TIB_E2E__?.setUserZoom(0.2));
  await page.waitForTimeout(2000);
  await page.locator("#game canvas").screenshot({ path: path.join(OUT, "overview.png") });
  const relevant = errors.filter((e) => !/favicon|net::ERR|WebGL warning/i.test(e));
  if (relevant.length) console.error("Runtime errors:\n" + relevant.join("\n"));
});
