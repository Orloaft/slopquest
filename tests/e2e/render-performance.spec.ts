import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { scaleX, scaleY } from "../../src/shared.ts";

const OUT = "artifacts/render-performance";
const FRAME_SAMPLES = 240;

test("live gameplay keeps frame pacing stable and renders nonblank visuals", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev god" }));
  await page.evaluate(
    (p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 3, x: p.x, y: p.y, hp: 120 }),
    { x: scaleX(3, 55), y: scaleY(3, 36) }
  );
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 3);
  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.monsters ?? []).some((m) => m.floor === 3 && m.hp > 0));

  const canvas = page.locator("#game canvas");
  const before = await canvas.screenshot({ path: `${OUT}/northwood-before.png` });
  const beforeStats = visualStats(before);

  const frameStats = await sampleLiveGameplay(page, FRAME_SAMPLES);

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "input", input: {} }));
  await page.waitForTimeout(300);
  const stableA = await canvas.screenshot({ path: `${OUT}/northwood-stable-a.png` });
  await page.waitForTimeout(300);
  const stableB = await canvas.screenshot({ path: `${OUT}/northwood-stable-b.png` });
  const stableAStats = visualStats(stableA);
  const stableBStats = visualStats(stableB);
  const settledDiff = compare(stableA, stableB);

  console.log(`render-performance ${JSON.stringify({ frameStats, beforeStats, stableAStats, stableBStats, settledDiff })}`);

  expect(frameStats.sampleCount).toBeGreaterThanOrEqual(FRAME_SAMPLES);
  expect(frameStats.avgFps, `avg FPS ${frameStats.avgFps}`).toBeGreaterThanOrEqual(50);
  expect(frameStats.p95Ms, `p95 frame interval ${frameStats.p95Ms}ms`).toBeLessThanOrEqual(25);
  expect(frameStats.longFramePct, `${frameStats.longFramePct}% frames exceeded 33.4ms`).toBeLessThanOrEqual(5);
  expect(frameStats.maxMs, `max frame interval ${frameStats.maxMs}ms`).toBeLessThanOrEqual(80);

  for (const [label, stats] of [
    ["before", beforeStats],
    ["stableA", stableAStats],
    ["stableB", stableBStats]
  ] as const) {
    expect(stats.meaningfulPixels, `${label} should not be blank`).toBeGreaterThan(20000);
    expect(stats.colorBuckets, `${label} should have stage color variety`).toBeGreaterThan(80);
    expect(stats.alphaPixels, `${label} should fill most of the canvas`).toBeGreaterThan(850000);
  }
  expect(settledDiff.changedPct, `${settledDiff.changedPct}% settled pixels changed`).toBeLessThanOrEqual(5);
  expect(settledDiff.meanChannelDelta, `settled mean channel delta ${settledDiff.meanChannelDelta}`).toBeLessThanOrEqual(3);
});

async function sampleLiveGameplay(page: Page, sampleCount: number): Promise<FrameStats> {
  await page.evaluate(() => {
    const hooks = window.__TIB_E2E__;
    const me = hooks?.self();
    if (!hooks || !me) return;
    const target = (hooks.getState()?.monsters ?? [])
      .filter((m) => m.floor === me.floor && m.hp > 0)
      .sort((a, b) => (a.x - me.x) ** 2 + (a.y - me.y) ** 2 - ((b.x - me.x) ** 2 + (b.y - me.y) ** 2))[0];
    if (target) hooks.send({ type: "target", id: target.id });
  });

  const timings = await page.evaluate(async (frames) => {
    const intervals: number[] = [];
    let previous = 0;
    let tick = 0;
    const inputTimer = window.setInterval(() => {
      const hooks = window.__TIB_E2E__;
      if (!hooks) return;
      tick += 1;
      hooks.send({ type: "input", input: tick % 2 === 0 ? { right: true } : { down: true } });
      if (tick % 4 === 0) hooks.send({ type: "ability", slot: "1" });
    }, 250);

    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        if (previous > 0) intervals.push(now - previous);
        previous = now;
        if (intervals.length >= frames) {
          window.clearInterval(inputTimer);
          window.__TIB_E2E__?.send({ type: "input", input: {} });
          resolve();
          return;
        }
        window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    });

    return intervals;
  }, sampleCount);

  return summarizeFrames(timings);
}

function summarizeFrames(intervals: number[]): FrameStats {
  const sorted = [...intervals].sort((a, b) => a - b);
  const totalMs = intervals.reduce((sum, value) => sum + value, 0);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  return {
    sampleCount: intervals.length,
    avgFps: round((intervals.length / totalMs) * 1000),
    avgMs: round(totalMs / intervals.length),
    p95Ms: round(percentile(0.95)),
    p99Ms: round(percentile(0.99)),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
    longFramePct: round((intervals.filter((value) => value > 33.4).length / intervals.length) * 100)
  };
}

function visualStats(buffer: Buffer): VisualStats {
  const png = PNG.sync.read(buffer);
  const buckets = new Set<string>();
  let alphaPixels = 0;
  let meaningfulPixels = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i] ?? 0;
    const g = png.data[i + 1] ?? 0;
    const b = png.data[i + 2] ?? 0;
    const a = png.data[i + 3] ?? 0;
    if (a <= 0) continue;
    alphaPixels += 1;
    if (Math.abs(r - 17) > 8 || Math.abs(g - 20) > 8 || Math.abs(b - 18) > 8) meaningfulPixels += 1;
    buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }
  return { width: png.width, height: png.height, alphaPixels, meaningfulPixels, colorBuckets: buckets.size };
}

function compare(aBuffer: Buffer, bBuffer: Buffer): DiffStats {
  const a = PNG.sync.read(aBuffer);
  const b = PNG.sync.read(bBuffer);
  if (a.width !== b.width || a.height !== b.height) throw new Error("screenshots have different dimensions");

  let changedPixels = 0;
  let totalDelta = 0;
  const pixels = a.width * a.height;
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0));
    const dg = Math.abs((a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0));
    const db = Math.abs((a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0));
    const da = Math.abs((a.data[i + 3] ?? 0) - (b.data[i + 3] ?? 0));
    const delta = dr + dg + db + da;
    if (delta > 32) changedPixels += 1;
    totalDelta += delta;
  }
  return { changedPct: round((changedPixels / pixels) * 100), meanChannelDelta: round(totalDelta / (pixels * 4)) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function logErrors(page: Page): void {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
}

async function join(page: Page): Promise<void> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
}

interface FrameStats {
  sampleCount: number;
  avgFps: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  longFramePct: number;
}

interface VisualStats {
  width: number;
  height: number;
  alphaPixels: number;
  meaningfulPixels: number;
  colorBuckets: number;
}

interface DiffStats {
  changedPct: number;
  meanChannelDelta: number;
}
