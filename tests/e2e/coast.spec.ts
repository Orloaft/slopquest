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

test("beach ledges use composed stairs and rock-wall faces", () => {
  const rows = makeFloorTiles(8);
  const stairRuns = [[20, 20], [56, 22], [34, 34]] as Array<[number, number]>;
  for (const [x, y] of stairRuns) {
    expect(rows[y]?.slice(x, x + 4)).toBe("[22]");
  }
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

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 7, x: p.x, y: p.y }), { x: scaleX(7, 1.5), y: scaleY(7, 32.5) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 8, null, { timeout: 8000 });

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 8, x: p.x, y: p.y }), { x: scaleX(8, 50.5), y: scaleY(8, 14.5) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 9, null, { timeout: 8000 });

  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 8, x: p.x, y: p.y }), { x: scaleX(8, 25.5), y: scaleY(8, 1.5) });
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 7, null, { timeout: 8000 });
});

test("Coastal Harvest forage yields a reagent and trains Foraging", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 8, 15.5, 6.5);
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

  await place(page, 9, 14.5, 20.5);
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.stunned ?? 0) > 0, null, { timeout: 8000 });
});

test("an Ancient Totem Wraith slows the player from down a path", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 9, 21.5, 8.5);
  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.monsters ?? []).some((m) => m.type === "totem_wraith" && m.floor === 9));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.slowed ?? 0) > 0, null, { timeout: 15000 });
});

test("the Jungle Vault is sealed (stepping on it does not transport)", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  await place(page, 9, 16.5, 35.5);
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
