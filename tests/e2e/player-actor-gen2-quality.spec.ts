import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const OUT = path.join(process.cwd(), "artifacts", "art-new-direction", "player-actor-gen2-quality");
const CROP_W = 84;
const CROP_H = 96;
const CROP_SCALE = 4;

async function join(page: any): Promise<void> {
  await page.goto("/?e2e");
  await page.locator("#nameInput").fill(`player_gen2_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  await page.evaluate(() => window.__TIB_E2E__?.setUserZoom(1));
}

test("Gen 2 quality player actor appears on Waystone and route content", async ({ page }) => {
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
  const trace: Array<{
    name: string;
    requested: { floor: number; x: number; y: number };
    actual: string;
    captureSurface: string;
    crop: { x: number; y: number; width: number; height: number; scale: number };
    commit: string;
  }> = [];
  const cropEntries: Array<{ name: string; crop: PNG }> = [];
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
    const screenPoint = await page.evaluate(() => {
      const me = window.__TIB_E2E__?.self();
      return me ? window.__TIB_E2E__?.worldScreenPoint(me.x, me.y) ?? null : null;
    });
    expect(screenPoint).not.toBeNull();
    const screenshotPath = path.join(OUT, `${shot.name}.png`);
    const screenshotBuffer = await page.locator("#game canvas").screenshot({ path: screenshotPath });
    const screenshot = PNG.sync.read(screenshotBuffer);
    const cropX = Math.round((screenPoint?.x ?? 0) - CROP_W / 2);
    const cropY = Math.round((screenPoint?.y ?? 0) - 54);
    cropEntries.push({ name: shot.name, crop: nearestScale(cropPng(screenshot, cropX, cropY, CROP_W, CROP_H), CROP_SCALE) });
    const actual = await page.evaluate(() => {
      const me = window.__TIB_E2E__?.self();
      return me ? `${me.floor}:${me.x.toFixed(1)},${me.y.toFixed(1)} dir=${me.dir}` : "none";
    });
    trace.push({
      name: shot.name,
      requested: { floor: shot.floor, x: shot.x, y: shot.y },
      actual,
      captureSurface: "#game canvas",
      crop: { x: cropX, y: cropY, width: CROP_W, height: CROP_H, scale: CROP_SCALE },
      commit
    });
  }
  writeFileSync(path.join(OUT, "gameplay-crop-contact-sheet.png"), PNG.sync.write(cropContactSheet(cropEntries)));
  writeFileSync(path.join(OUT, "runtime-screenshot-trace.json"), JSON.stringify({ commit, captureSurface: "#game canvas", trace }, null, 2));
  writeFileSync(path.join(OUT, "runtime-screenshot-trace.txt"), trace.map((entry) => `${entry.name} -> ${entry.actual} crop=${entry.crop.x},${entry.crop.y},${entry.crop.width}x${entry.crop.height}@${entry.crop.scale}x commit=${entry.commit}`).join("\n"));
});

function cropPng(src: PNG, x: number, y: number, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h });
  out.data.fill(255);
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) {
      copyPixel(src, x + xx, y + yy, out, xx, yy);
    }
  }
  return out;
}

function nearestScale(src: PNG, scale: number): PNG {
  const out = new PNG({ width: src.width * scale, height: src.height * scale });
  out.data.fill(255);
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      copyPixel(src, Math.floor(x / scale), Math.floor(y / scale), out, x, y);
    }
  }
  return out;
}

function cropContactSheet(entries: Array<{ name: string; crop: PNG }>): PNG {
  const gap = 8;
  const width = entries.length * CROP_W * CROP_SCALE + (entries.length + 1) * gap;
  const height = CROP_H * CROP_SCALE + gap * 2;
  const out = new PNG({ width, height });
  fill(out, "#182025");
  entries.forEach((entry, i) => pastePng(entry.crop, out, gap + i * (entry.crop.width + gap), gap));
  return out;
}

function pastePng(src: PNG, dst: PNG, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      copyPixel(src, x, y, dst, dx + x, dy + y);
    }
  }
}

function copyPixel(from: PNG, fromX: number, fromY: number, to: PNG, toX: number, toY: number): void {
  if (fromX < 0 || fromY < 0 || fromX >= from.width || fromY >= from.height || toX < 0 || toY < 0 || toX >= to.width || toY >= to.height) return;
  const fromIndex = (fromY * from.width + fromX) * 4;
  const toIndex = (toY * to.width + toX) * 4;
  to.data[toIndex] = from.data[fromIndex] ?? 0;
  to.data[toIndex + 1] = from.data[fromIndex + 1] ?? 0;
  to.data[toIndex + 2] = from.data[fromIndex + 2] ?? 0;
  to.data[toIndex + 3] = from.data[fromIndex + 3] ?? 0;
}

function fill(png: PNG, hex: string): void {
  const rgb = {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  };
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb.r;
    png.data[i + 1] = rgb.g;
    png.data[i + 2] = rgb.b;
    png.data[i + 3] = 255;
  }
}
