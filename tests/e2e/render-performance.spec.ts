import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import WebSocket from "ws";
import { isBlockedTile, makeFloorTiles } from "../../src/shared.ts";

const OUT = "artifacts/render-performance";
const FRAME_SAMPLES = 240;
const PERF_FLOOR = 2;
const PERF_CENTER = { x: 93.5, y: 35.5 };
const SYNTHETIC_PLAYERS = 6;
const CLUSTERED_MONSTERS = 12;
const CROWD_RADIUS = 10;
const MIN_AVG_FPS = 60;
const MAX_P95_FRAME_MS = 18.5;

test.setTimeout(90000);

test("crowded same-area gameplay keeps 60fps frame pacing and renders stable visuals", async ({ page }) => {
  logErrors(page);
  const syntheticPlayers: SyntheticPlayer[] = [];
  await page.goto("/?e2e");
  await joinStable(page);

  try {
    await prepareMeasuredPlayer(page);
    syntheticPlayers.push(...(await joinSyntheticCrowd(SYNTHETIC_PLAYERS)));
    await spawnClusteredMonsters(CLUSTERED_MONSTERS);
    const sceneCounts = await waitForCrowdedScene(page);

    const canvas = page.locator("#game canvas");
    const before = await canvas.screenshot({ path: `${OUT}/same-area-crowd-before.png` });
    const beforeStats = visualStats(before);

    const frameStats = await sampleLiveGameplay(page, FRAME_SAMPLES);

    stopSyntheticDrivers(syntheticPlayers);
    await page.evaluate(() => window.__TIB_E2E__?.send({ type: "input", input: {} }));
    await page.waitForTimeout(600);
    const stableA = await canvas.screenshot({ path: `${OUT}/same-area-crowd-stable-a.png` });
    await page.waitForTimeout(300);
    const stableB = await canvas.screenshot({ path: `${OUT}/same-area-crowd-stable-b.png` });
    const stableAStats = visualStats(stableA);
    const stableBStats = visualStats(stableB);
    const settledDiff = compare(stableA, stableB);
    const clientDepthStats = await page.evaluate(() => window.__TIB_E2E__?.entityDepthStats?.() ?? null);
    const serverMetrics = await page.evaluate(() => window.__TIB_E2E__?.getState()?.metrics ?? null);

    console.log(
      `render-performance ${JSON.stringify({
        sceneCounts,
        frameStats,
        clientDepthStats,
        serverMetrics,
        beforeStats,
        stableAStats,
        stableBStats,
        settledDiff
      })}`
    );

    expect(sceneCounts.players, `visible clustered players ${sceneCounts.players}`).toBeGreaterThanOrEqual(SYNTHETIC_PLAYERS + 1);
    expect(sceneCounts.monsters, `visible clustered monsters ${sceneCounts.monsters}`).toBeGreaterThanOrEqual(CLUSTERED_MONSTERS);
    expect(frameStats.sampleCount).toBeGreaterThanOrEqual(FRAME_SAMPLES);
    expect(frameStats.avgFps, `avg FPS ${frameStats.avgFps}`).toBeGreaterThanOrEqual(MIN_AVG_FPS);
    expect(frameStats.p95Ms, `p95 frame interval ${frameStats.p95Ms}ms`).toBeLessThanOrEqual(MAX_P95_FRAME_MS);
    expect(frameStats.longFramePct, `${frameStats.longFramePct}% frames exceeded 33.4ms`).toBeLessThanOrEqual(1);
    expect(frameStats.maxMs, `max frame interval ${frameStats.maxMs}ms`).toBeLessThanOrEqual(50);

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
  } finally {
    stopSyntheticDrivers(syntheticPlayers);
    closeSyntheticPlayers(syntheticPlayers);
  }
});

async function prepareMeasuredPlayer(page: Page): Promise<void> {
  await page.evaluate(
    (p) => {
      const hooks = window.__TIB_E2E__;
      hooks?.send({ type: "chat", text: "/dev god" });
      hooks?.send({ type: "chat", text: "/dev skills 99" });
      hooks?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y, hp: 120 });
    },
    { floor: PERF_FLOOR, x: PERF_CENTER.x, y: PERF_CENTER.y }
  );
  await page.waitForTimeout(500);
}

async function joinStable(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await join(page);
      await page.waitForTimeout(750);
      const joined = await page
        .evaluate(() => Boolean(window.__TIB_E2E__?.self() && document.querySelector("#join")?.classList.contains("hidden")))
        .catch(() => false);
      if (joined) return;
    } catch {
      await page.goto("/?e2e");
    }
  }
  throw new Error("could not keep measured player joined after startup reloads");
}

async function spawnClusteredMonsters(count: number): Promise<void> {
  const spawner = await joinSyntheticPlayer(999);
  const tiles = standableTilesNear(PERF_FLOOR, Math.floor(PERF_CENTER.x), Math.floor(PERF_CENTER.y), count);
  try {
    for (let i = 0; i < count; i += 1) {
      const tile = tiles[i % tiles.length]!;
      const monster = i % 3 === 0 ? "grave_shambler" : i % 3 === 1 ? "bound_wight" : "restless_husk";
      sendSocket(spawner.socket, { type: "e2eSpawnMonster", monster, floor: PERF_FLOOR, x: tile.x, y: tile.y });
    }
    await delay(500);
  } finally {
    stopSyntheticDrivers([spawner]);
    closeSyntheticPlayers([spawner]);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCrowdedScene(page: Page): Promise<SceneCounts> {
  return page
    .waitForFunction(
      (p) => {
        const state = window.__TIB_E2E__?.getState();
        if (!state) return null;
        const near = (item: { floor: number; x: number; y: number }) =>
          item.floor === p.floor && Math.hypot(item.x - p.x, item.y - p.y) <= p.radius;
        const players = (state.players ?? []).filter(near).length;
        const monsters = (state.monsters ?? []).filter((m) => near(m) && m.hp > 0).length;
        if (players < p.players || monsters < p.monsters) return null;
        return {
          players,
          monsters,
          metricsVisiblePlayers: state.metrics?.visiblePlayers ?? null,
          metricsVisibleMonsters: state.metrics?.visibleMonsters ?? null
        };
      },
      {
        floor: PERF_FLOOR,
        x: PERF_CENTER.x,
        y: PERF_CENTER.y,
        radius: CROWD_RADIUS,
        players: SYNTHETIC_PLAYERS + 1,
        monsters: CLUSTERED_MONSTERS
      },
      { timeout: 20000 }
    )
    .then((handle) => handle.jsonValue() as Promise<SceneCounts>);
}

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
  await page.waitForTimeout(300);

  const timings = await page.evaluate(async (frames) => {
    const intervals: number[] = [];
    let previous = 0;
    let tick = 0;
    const inputTimer = window.setInterval(() => {
      const hooks = window.__TIB_E2E__;
      if (!hooks) return;
      tick += 1;
      if (tick % 3 === 0) hooks.send({ type: "ability", slot: "1" });
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

async function joinSyntheticCrowd(count: number): Promise<SyntheticPlayer[]> {
  const players: SyntheticPlayer[] = [];
  try {
    for (let i = 0; i < count; i += 1) {
      players.push(await joinSyntheticPlayer(i));
    }
    return players;
  } catch (error) {
    closeSyntheticPlayers(players);
    throw error;
  }
}

async function joinSyntheticPlayer(index: number): Promise<SyntheticPlayer> {
  const socket = new WebSocket("ws://127.0.0.1:8787");
  await waitForSocketOpen(socket);
  const offset = playerOffset(index);
  const welcomed = waitForWelcome(socket);
  sendSocket(socket, { type: "join", name: `e2e_perf_${Date.now().toString(36)}_${index}`, fresh: true, transient: true });
  await welcomed;
  sendSocket(socket, { type: "chat", text: "/dev god" });
  sendSocket(socket, { type: "chat", text: "/dev skills 99" });
  sendSocket(socket, {
    type: "e2eGrantItems",
    floor: PERF_FLOOR,
    x: PERF_CENTER.x + offset.x,
    y: PERF_CENTER.y + offset.y,
    hp: 120
  });
  const driver = null;
  return { socket, driver };
}

function waitForSocketOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function waitForWelcome(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for synthetic player welcome")), 5000);
    socket.on("message", function onMessage(raw) {
      let message: { type?: string } | null = null;
      try {
        message = JSON.parse(String(raw)) as { type?: string };
      } catch {
        return;
      }
      if (message.type !== "welcome") return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve();
    });
  });
}

function sendSocket(socket: WebSocket, message: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function stopSyntheticDrivers(players: SyntheticPlayer[]): void {
  for (const player of players) {
    if (player.driver) {
      clearInterval(player.driver);
      player.driver = null;
    }
    sendSocket(player.socket, { type: "input", input: {} });
  }
}

function closeSyntheticPlayers(players: SyntheticPlayer[]): void {
  for (const player of players) {
    if (player.socket.readyState === WebSocket.OPEN || player.socket.readyState === WebSocket.CONNECTING) player.socket.close();
  }
}

function playerOffset(index: number): { x: number; y: number } {
  const ring = Math.floor(index / 8) + 1;
  const angle = ((index % 8) / 8) * Math.PI * 2;
  return { x: Math.cos(angle) * ring * 1.6, y: Math.sin(angle) * ring * 1.2 };
}

function standableTilesNear(floor: number, centerX: number, centerY: number, count: number): Array<{ x: number; y: number }> {
  const rows = makeFloorTiles(floor);
  const candidates: Array<{ x: number; y: number; dist: number }> = [];
  const radius = CROWD_RADIUS;
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const tile = rows[y]?.[x] ?? "#";
      if (isBlockedTile(tile)) continue;
      const dist = Math.hypot(x + 0.5 - PERF_CENTER.x, y + 0.5 - PERF_CENTER.y);
      if (dist > radius) continue;
      candidates.push({ x, y, dist });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist || a.y - b.y || a.x - b.x);
  if (candidates.length < count) throw new Error(`only found ${candidates.length} standable crowd tiles near performance center`);
  return candidates;
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
  await page.waitForFunction(
    () => {
      const roster = document.querySelector("#rosterList");
      return Boolean(roster?.textContent?.includes("Choose a character") || roster?.querySelector("button"));
    },
    null,
    { timeout: 20000 }
  );
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(
    () => Boolean(window.__TIB_E2E__?.self() && document.querySelector("#join")?.classList.contains("hidden")),
    null,
    { timeout: 20000 }
  );
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

interface SceneCounts {
  players: number;
  monsters: number;
  metricsVisiblePlayers: number | null;
  metricsVisibleMonsters: number | null;
}

interface SyntheticPlayer {
  socket: WebSocket;
  driver: NodeJS.Timeout | null;
}
