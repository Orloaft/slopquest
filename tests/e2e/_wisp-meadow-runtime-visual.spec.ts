import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "artifacts", "enemy-runtime-visual");
const TYPES = ["wisp", "meadow_hopper"];

test("capture runtime wisp and meadow hopper frames", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto("/?e2e");
  await page.locator("#nameInput").fill(`sprite_visual_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  await page.addStyleTag({
    content: "#hud,.dialogue-dim{display:none!important;} body{overflow:hidden!important;}"
  });
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev god" }));
  await page.evaluate(() => window.__TIB_E2E__?.setUserZoom(1.35));
  await page.evaluate(() => {
    window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: 55.5, y: 36.5, hp: 100 });
    window.__TIB_E2E__?.send({ type: "e2eSpawnMonster", monster: "wisp", floor: 3, x: 51.5, y: 35.5 });
    window.__TIB_E2E__?.send({ type: "e2eSpawnMonster", monster: "meadow_hopper", floor: 3, x: 59.5, y: 35.5 });
  });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 3);
  await page.waitForFunction((types) => {
    const coverage = window.__TIB_E2E__?.monsterTextureCoverage?.(types) ?? [];
    return coverage.length === types.length && coverage.every((entry) => entry.frames.length === 16 && entry.frames.every((frame) => frame.exists));
  }, TYPES);

  const coverage = await page.evaluate((types) => {
    const e2e = window.__TIB_E2E__!;
    const entries = e2e.monsterTextureCoverage(types);
    const keys = entries.flatMap((entry) => entry.frames.map((frame) => frame.key));
    const urls = e2e.frameDataUrls(keys);
    const byKey = new Map(urls.map((url) => [url.key, url]));
    return entries.map((entry) => ({
      type: entry.type,
      family: entry.family,
      frames: entry.frames.map((frame) => ({ ...frame, dataUrl: byKey.get(frame.key)?.dataUrl ?? null }))
    }));
  }, TYPES);

  expect(coverage.map((entry) => entry.family).sort()).toEqual(["meadow_hopper", "wisp"]);
  for (const entry of coverage) {
    expect(entry.frames.every((frame) => Boolean(frame.dataUrl)), `${entry.family} frame data URLs`).toBe(true);
  }

  await page.evaluate((entries) => {
    document.querySelectorAll(".__sprite_visual").forEach((node) => node.remove());
    const root = document.createElement("div");
    root.className = "__sprite_visual";
    root.style.cssText =
      "position:absolute;top:0;left:0;width:1320px;z-index:99999;background:#222;padding:12px;" +
      "font:12px monospace;color:#eee;display:flex;flex-direction:column;gap:10px;";
    const checker =
      "background-image:linear-gradient(45deg,#555 25%,transparent 25%),linear-gradient(-45deg,#555 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#555 75%),linear-gradient(-45deg,transparent 75%,#555 75%);" +
      "background-size:12px 12px;background-position:0 0,0 6px,6px -6px,-6px 0;background-color:#999;";
    for (const entry of entries) {
      const title = document.createElement("div");
      title.textContent = `${entry.family} (example type: ${entry.type}) ${entry.frames.length} frames`;
      title.style.cssText = "font-size:16px;font-weight:bold;color:#fff;";
      root.appendChild(title);
      const grid = document.createElement("div");
      grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;";
      for (const frame of entry.frames) {
        const cell = document.createElement("div");
        cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;";
        const box = document.createElement("div");
        box.style.cssText = `${checker}border:1px solid #000;display:flex;align-items:center;justify-content:center;`;
        const img = document.createElement("img");
        img.src = frame.dataUrl ?? "";
        img.style.cssText = "image-rendering:pixelated;display:block;";
        box.appendChild(img);
        const label = document.createElement("div");
        label.textContent = `${frame.dir} w${frame.frame}`;
        cell.appendChild(box);
        cell.appendChild(label);
        grid.appendChild(cell);
      }
      root.appendChild(grid);
    }
    document.body.appendChild(root);
  }, coverage);

  await page.locator(".__sprite_visual").screenshot({
    path: path.join(OUT, "wisp-meadow-hopper-contact.png")
  });
  await page.evaluate(() => document.querySelectorAll(".__sprite_visual").forEach((node) => node.remove()));
  await page.screenshot({ path: path.join(OUT, "wisp-meadow-hopper-ingame.png") });
});
