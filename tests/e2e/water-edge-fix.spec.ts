import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const OUT = path.join(process.cwd(), "artifacts", "art-new-direction", "water-edge-fix");
const CROP_W = 220;
const CROP_H = 160;
const CROP_SCALE = 2;

async function join(page: any): Promise<void> {
  await page.goto("/?e2e");
  await page.locator("#nameInput").fill(`water_edge_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  await page.evaluate(() => window.__TIB_E2E__?.setUserZoom(1.4));
}

test("water edge fix runtime screenshots", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });
  await join(page);

  const residency = await page.evaluate(() => window.__TIB_E2E__?.textureResidency(["playerSheet", "playerGbcSheet"]) ?? []);
  expect(residency[0]).toMatchObject({ exists: true });
  expect(residency[1]).toMatchObject({ exists: false });

  const shots = [
    { name: "runtime-01-waystone-route-gate", floor: 0, x: 55.5, y: 20.5 },
    { name: "runtime-02-route-south-gate", floor: 11, x: 55.5, y: 69.5 },
    { name: "runtime-03-route-stream-ford", floor: 11, x: 66.5, y: 34.5 }
  ];
  const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const port = process.env.TIB_E2E_PORT ?? "5173";
  const trace: Array<{
    name: string;
    requested: { floor: number; x: number; y: number };
    actual: string;
    captureSurface: string;
    port: string;
    commit: string;
    crop?: { x: number; y: number; width: number; height: number; scale: number };
  }> = [];
  let fordCrop: PNG | null = null;

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
    const screenshotBuffer = await page.locator("#game canvas").screenshot({ path: path.join(OUT, `${shot.name}.png`) });
    const screenshot = PNG.sync.read(screenshotBuffer);
    const actual = await page.evaluate(() => {
      const me = window.__TIB_E2E__?.self();
      return me ? `${me.floor}:${me.x.toFixed(1)},${me.y.toFixed(1)} dir=${me.dir}` : "none";
    });
    const entry = {
      name: shot.name,
      requested: { floor: shot.floor, x: shot.x, y: shot.y },
      actual,
      captureSurface: "#game canvas",
      port,
      commit
    };
    if (shot.name.includes("stream-ford")) {
      const screenPoint = await page.evaluate(() => {
        const me = window.__TIB_E2E__?.self();
        return me ? window.__TIB_E2E__?.worldScreenPoint(me.x, me.y) ?? null : null;
      });
      expect(screenPoint).not.toBeNull();
      const cropX = Math.round((screenPoint?.x ?? 0) - CROP_W / 2);
      const cropY = Math.round((screenPoint?.y ?? 0) - 92);
      fordCrop = nearestScale(cropPng(screenshot, cropX, cropY, CROP_W, CROP_H), CROP_SCALE);
      Object.assign(entry, { crop: { x: cropX, y: cropY, width: CROP_W, height: CROP_H, scale: CROP_SCALE } });
    }
    trace.push(entry);
  }

  expect(fordCrop).not.toBeNull();
  writeFileSync(path.join(OUT, "water-edge-gameplay-crop-contact-sheet.png"), PNG.sync.write(cropContactSheet([fordCrop!])));
  writeFileSync(path.join(OUT, "runtime-screenshot-trace.json"), JSON.stringify({ commit, port, captureSurface: "#game canvas", trace }, null, 2));
  writeFileSync(path.join(OUT, "runtime-screenshot-trace.txt"), trace.map((entry) => `${entry.name} -> ${entry.actual} surface=${entry.captureSurface} port=${entry.port} commit=${entry.commit}`).join("\n"));
});

test("water edge fix editor route screenshot", async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await page.goto("/editor.html?__test=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).__ed));
  await page.evaluate(() => (window as any).__ed.loadStage("route"));
  await page.waitForFunction(() => (window as any).__ed.stage() === "route");
  await expect(page.locator("#stage")).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "editor-route-layers.png"), fullPage: true });
});

function cropPng(src: PNG, x: number, y: number, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h });
  out.data.fill(255);
  for (let yy = 0; yy < h; yy += 1) for (let xx = 0; xx < w; xx += 1) copyPixel(src, x + xx, y + yy, out, xx, yy);
  return out;
}

function nearestScale(src: PNG, scale: number): PNG {
  const out = new PNG({ width: src.width * scale, height: src.height * scale });
  out.data.fill(255);
  for (let y = 0; y < out.height; y += 1) for (let x = 0; x < out.width; x += 1) copyPixel(src, Math.floor(x / scale), Math.floor(y / scale), out, x, y);
  return out;
}

function cropContactSheet(entries: PNG[]): PNG {
  const gap = 8;
  const width = entries.reduce((sum, entry) => sum + entry.width, 0) + (entries.length + 1) * gap;
  const height = Math.max(...entries.map((entry) => entry.height)) + gap * 2;
  const out = new PNG({ width, height });
  fill(out, "#182025");
  let x = gap;
  for (const entry of entries) {
    pastePng(entry, out, x, gap);
    x += entry.width + gap;
  }
  return out;
}

function pastePng(src: PNG, dst: PNG, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y += 1) for (let x = 0; x < src.width; x += 1) copyPixel(src, x, y, dst, dx + x, dy + y);
}

function copyPixel(from: PNG, fromX: number, fromY: number, to: PNG, toX: number, toY: number): void {
  if (fromX < 0 || fromY < 0 || fromX >= from.width || fromY >= from.height || toX < 0 || toY < 0 || toX >= to.width || toY >= to.height) return;
  const fromIndex = (fromY * from.width + fromX) * 4;
  const toIndex = (toY * to.width + toX) * 4;
  to.data[toIndex] = from.data[fromIndex] ?? 0;
  to.data[toIndex + 1] = from.data[fromIndex + 1] ?? 0;
  to.data[toIndex + 2] = from.data[fromIndex + 2] ?? 0;
  to.data[toIndex + 3] = from.data[fromIndex + 3] ?? 255;
}

function fill(png: PNG, hex: string): void {
  const value = Number.parseInt(hex.slice(1), 16);
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = (value >> 16) & 255;
    png.data[i + 1] = (value >> 8) & 255;
    png.data[i + 2] = value & 255;
    png.data[i + 3] = 255;
  }
}
