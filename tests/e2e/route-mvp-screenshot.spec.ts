import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "artifacts", "art-new-direction", "route-mvp");

async function join(page: any): Promise<void> {
  await page.goto("/?e2e");
  await page.locator("#nameInput").fill(`route_mvp_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  await page.evaluate(() => window.__TIB_E2E__?.setUserZoom(2.5));
}

test("route MVP runtime tour screenshots", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });
  await join(page);

  const shots = [
    { name: "runtime-01-waystone-north-gate", floor: 0, x: 55.5, y: 20.5 },
    { name: "runtime-02-route-south-gate", floor: 11, x: 55.5, y: 69.5 },
    { name: "runtime-03-route-encounter-clearing", floor: 11, x: 52.5, y: 53.5 },
    { name: "runtime-04-route-stream-ford", floor: 11, x: 66.5, y: 34.5 },
    { name: "runtime-05-northwood-south-arrival", floor: 3, x: 55.5, y: 67.5 }
  ];
  const trace: string[] = [];
  for (const shot of shots) {
    await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), shot);
    await page.waitForFunction(
      (p) => {
        const me = window.__TIB_E2E__?.self();
        return Boolean(me && me.floor === p.floor && Math.abs(me.x - p.x) < 2 && Math.abs(me.y - p.y) < 2);
      },
      shot,
      { timeout: 8000 }
    );
    await page.waitForTimeout(800);
    await page.locator("#game canvas").screenshot({ path: path.join(OUT, `${shot.name}.png`) });
    const pos = await page.evaluate(() => {
      const me = window.__TIB_E2E__?.self();
      return me ? `${me.floor}:${me.x.toFixed(1)},${me.y.toFixed(1)}` : "none";
    });
    trace.push(`${shot.name} -> ${pos}`);
  }
  writeFileSync(path.join(OUT, "runtime-screenshot-trace.txt"), trace.join("\n"));
});

test("route MVP editor screenshot", async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await page.goto("/editor.html?__test=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).__ed));
  await page.evaluate(() => (window as any).__ed.loadStage("route"));
  await page.waitForFunction(() => (window as any).__ed.stage() === "route");
  await expect(page.locator("#stage")).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "editor-route-layers.png"), fullPage: true });
});
