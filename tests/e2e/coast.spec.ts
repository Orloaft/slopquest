import { expect, test, type Page } from "@playwright/test";
import { makeFloorTiles, isBlockedTile, isSightBlocked, scaleX, scaleY } from "../../src/shared.ts";

test("coast tile semantics: ocean/river block movement not sight; jungle wall blocks both", () => {
  for (const tile of ["I", "!", "?", "=", "v", "{", "}", "(", ")"]) {
    expect(isBlockedTile(tile)).toBe(true); // ocean, lagoon and directional shore water
    expect(isSightBlocked(tile)).toBe(false);
  }
  for (const tile of ["x", "0", "1", "|"]) {
    expect(isBlockedTile(tile)).toBe(true); // beach cliff bodies, caps and tops
    expect(isSightBlocked(tile)).toBe(true);
  }
  expect(isBlockedTile("u")).toBe(true); // beach rock cover
  expect(isSightBlocked("u")).toBe(true);
  expect(isBlockedTile("i")).toBe(true); // jungle river
  expect(isSightBlocked("i")).toBe(false);
  expect(isBlockedTile("E")).toBe(true); // jungle wall
  expect(isSightBlocked("E")).toBe(true);
});

test("beach ledges use cliff caps and rock-wall faces", () => {
  const rows = makeFloorTiles(8);
  expect(rows[20]?.slice(20, 24)).toBe("xzzz");
  expect(rows[22]?.slice(56, 60)).toBe("zzzx");
  expect(rows[34]?.slice(34, 38)).toBe("zzzx");
  expect(rows[21]?.slice(18, 32)).toContain("|");
  expect(rows[23]?.slice(51, 67)).toContain("|");
  expect(rows[35]?.slice(27, 41)).toContain("|");
});

test("beach ocean uses interior water variants beyond repeated edge tiles", () => {
  const rows = makeFloorTiles(8);
  const water = rows.join("");
  expect(water.includes("=")).toBe(true);
  expect(water.includes("!")).toBe(true);
  expect(water.includes("?")).toBe(true);

  const interiorWater = countTiles(rows, new Set(["I", "!", "?", "="]));
  const shoreWater = countTiles(rows, new Set(["v", "{", "}", "(", ")"]));
  expect(interiorWater).toBeGreaterThan(shoreWater * 4);
});

test("beach shore corners do not cluster into noisy edge blocks", () => {
  const rows = makeFloorTiles(8);
  const corners = new Set(["{", "}", "(", ")"]);
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < rows[y]!.length; x += 1) {
      if (!corners.has(rows[y]![x]!)) continue;
      expect(corners.has(rows[y]![x - 1] ?? "")).toBe(false);
      expect(corners.has(rows[y]![x + 1] ?? "")).toBe(false);
      expect(corners.has(rows[y - 1]?.[x] ?? "")).toBe(false);
      expect(corners.has(rows[y + 1]?.[x] ?? "")).toBe(false);
    }
  }
});

test("travel chain: desert -> beach -> jungle, and beach -> desert back", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  const startupAssets = await page.evaluate(() => window.__TIB_E2E__?.assetResidency?.() ?? null);
  expect(startupAssets?.startupImages.some((asset) => asset.key === "beachTiles"), "Sunken Beach sheet should not be a startup asset").toBe(false);
  const startupBeach = startupAssets?.runtimeImages.find((asset) => asset.key === "beachTiles");
  expect(startupBeach?.tier).toBe("play-context");
  expect(startupBeach?.resident, "Sunken Beach sheet should wait for floor-context loading").toBe(false);

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 7, x: p.x, y: p.y }), { x: scaleX(7, 1.5), y: scaleY(7, 38.5) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 8, null, { timeout: 8000 });
  await page.waitForFunction(() => {
    const textures = window.__TIB_E2E__?.textureResidency?.(["beachTiles", "tileBeachSand", "tileOcean", "spriteBeachPalm"]) ?? [];
    return textures.length === 4 && textures.every((texture) => texture.exists && texture.width > 0 && texture.height > 0);
  });
  const beachAssets = await page.evaluate(() => window.__TIB_E2E__?.assetResidency?.() ?? null);
  const loadedBeach = beachAssets?.runtimeImages.find((asset) => asset.key === "beachTiles");
  expect(loadedBeach?.trigger).toBe("play-context");
  expect(loadedBeach?.resident, "Sunken Beach sheet should be resident after traveling to floor 8").toBe(true);

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 8, x: p.x, y: p.y }), { x: scaleX(8, 61.5), y: scaleY(8, 17.5) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 9, null, { timeout: 8000 });

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 8, x: p.x, y: p.y }), { x: scaleX(8, 31.5), y: scaleY(8, 1.5) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 7, null, { timeout: 8000 });
});

test("Coastal Harvest forage yields a reagent and trains Foraging", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 8, 18.5, 7.5);
  const before = await page.evaluate(() => window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "foraging")?.xp ?? 0);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "gatherHerb", id: "shore-8-15-5" }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.action?.type === "herbing");
  await page.waitForFunction(
    (b) => {
      const me = window.__TIB_E2E__?.self();
      if (!me) return false;
      return (me.inventory ?? []).some((i) => i?.id === "herb") && (me.skills.find((s) => s.id === "foraging")?.xp ?? 0) > b;
    },
    before
  );
});

test("a Venomous Stalker ambushes from the undergrowth, stunning the player", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 9, 17.5, 24.5);
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.stunned ?? 0) > 0, null, { timeout: 8000 });
});

test("an Ancient Totem Wraith slows the player from down a path", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 9, 26.5, 8.5);
  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.monsters ?? []).some((m) => m.type === "totem_wraith" && m.floor === 9));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.slowed ?? 0) > 0, null, { timeout: 15000 });
});

test("the Jungle Vault is sealed (stepping on it does not transport)", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 9, 20.5, 42.5);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__TIB_E2E__?.self()?.floor)).toBe(9);
});

// --- helpers ---------------------------------------------------------------

function logErrors(page: Page): void {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
}

function countTiles(rows: string[], tiles: Set<string>): number {
  let count = 0;
  for (const row of rows) {
    for (const tile of row) {
      if (tiles.has(tile)) count += 1;
    }
  }
  return count;
}

async function join(page: Page): Promise<void> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
}

async function place(page: Page, floor: number, x: number, y: number): Promise<void> {
  const sx = scaleX(floor, x);
  const sy = scaleY(floor, y);
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor, x: sx, y: sy });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.hypot(me.x - p.x, me.y - p.y) < 1.4);
    },
    { floor, x: sx, y: sy }
  );
}
