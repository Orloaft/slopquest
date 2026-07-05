import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "artifacts", "art-new-direction", "player-actor-mvp");

async function join(page: any): Promise<void> {
  await page.goto("/?e2e");
  await page.locator("#nameInput").fill(`player_gbc_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  await page.evaluate(() => window.__TIB_E2E__?.setUserZoom(2.5));
}

test("GBC player actor appears on Waystone and route content", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });
  await join(page);

  const residency = await page.evaluate(() => window.__TIB_E2E__?.textureResidency(["playerGbcSheet"]) ?? []);
  expect(residency[0]).toMatchObject({ exists: true, width: 160, height: 192 });

  const stats = await page.evaluate(() => window.__TIB_E2E__?.textureAlphaStats(["playerGbc-up-0", "playerGbc-right-0", "playerGbc-down-0", "playerGbc-left-0"]) ?? []);
  expect(stats.every((entry) => entry.exists && entry.width === 40 && entry.height === 48 && entry.opaque > 0)).toBe(true);

  const dataUrls = await page.evaluate(() => window.__TIB_E2E__?.frameDataUrls(["playerGbc-right-0", "playerGbc-left-0"]) ?? []);
  expect(dataUrls[0]?.dataUrl && dataUrls[1]?.dataUrl && dataUrls[0].dataUrl !== dataUrls[1].dataUrl).toBe(true);

  const drift = await page.evaluate(() => window.__TIB_E2E__?.actorFrameAnchorDrift().filter((entry) => entry.family === "playerGbc") ?? []);
  expect(drift.length).toBe(4);
  expect(drift.every((entry) => entry.driftX <= 0.01 && entry.driftY <= 0.01)).toBe(true);

  const shots = [
    { name: "runtime-01-waystone-route-gate", floor: 0, x: 55.5, y: 20.5 },
    { name: "runtime-02-route-south-gate", floor: 11, x: 55.5, y: 69.5 },
    { name: "runtime-03-route-stream-ford", floor: 11, x: 66.5, y: 34.5 }
  ];
  const trace: Array<{ name: string; requested: { floor: number; x: number; y: number }; actual: string; commit: string }> = [];
  const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
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
    const actual = await page.evaluate(() => {
      const me = window.__TIB_E2E__?.self();
      return me ? `${me.floor}:${me.x.toFixed(1)},${me.y.toFixed(1)} dir=${me.dir}` : "none";
    });
    trace.push({ name: shot.name, requested: { floor: shot.floor, x: shot.x, y: shot.y }, actual, commit });
  }
  writeFileSync(path.join(OUT, "runtime-screenshot-trace.json"), JSON.stringify({ commit, trace }, null, 2));
  writeFileSync(path.join(OUT, "runtime-screenshot-trace.txt"), trace.map((entry) => `${entry.name} -> ${entry.actual} commit=${entry.commit}`).join("\n"));
});
