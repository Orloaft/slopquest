import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Throwaway visual check for the entity Y-sort fix: stage the player ABOVE a tree's
// trunk base (feet higher up the map -> should render BEHIND, tree canopy covers the
// player) and then BELOW it (feet lower -> should render IN FRONT, player covers the
// trunk). One screenshot each under artifacts/tree-depth/.
const OUT = path.join(process.cwd(), "artifacts", "tree-depth");

async function teleportTo(page: Page, floor: number, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ floor, x, y }) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [], floor, x, y }),
    { floor, x, y }
  );
}

test("tree depth sort", async ({ page }) => {
  test.setTimeout(60000);
  mkdirSync(OUT, { recursive: true });
  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));

  // Land on Northwood (floor 3) and zoom in so one tree fills a good chunk of frame.
  await teleportTo(page, 3, 55.5, 36.5);
  await page.evaluate(() => window.__TIB_E2E__?.setUserZoom(4));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.floor ?? -1) === 3);

  // Pick an active tree near the player so the camera frames it after we straddle it.
  const tree = await page.waitForFunction(() => {
    const e2e = window.__TIB_E2E__!;
    const me = e2e.self();
    const trees = (e2e.getState()?.trees ?? []).filter((t: any) => t.floor === 3 && t.active);
    if (!me || !trees.length) return null;
    trees.sort((a: any, b: any) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    const t = trees[0];
    return { x: t.x, y: t.y, id: t.id };
  });
  const t = (await tree.jsonValue()) as { x: number; y: number; id: string };

  // BEHIND: feet ~1.4 tiles above the trunk base -> tree should draw on top.
  await teleportTo(page, 3, t.x, t.y - 1.4);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "behind-tree.png") });

  // IN FRONT: feet ~1.0 tiles below the trunk base -> player should draw on top.
  await teleportTo(page, 3, t.x, t.y + 1.0);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "front-tree.png") });

  expect(t.id).toBeTruthy();
});
