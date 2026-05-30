import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { MONSTER_SPAWNS, MINING_NODES, TILE_SIZE, floorCols, floorRows, scaleX, scaleY } from "../../src/shared.ts";

const NORTHWOOD_EXPECTED_TYPES = [
  "rat",
  "spider",
  "goblin_scout",
  "wolf",
  "wisp",
  "goblin",
  "goblin_shaman",
  "orc"
];

const NORTHWOOD_SUBZONE_PROBES = [
  { label: "south wood (gentle critters)", x: 47.5, y: 49.5 },
  { label: "north meadow (orcs)", x: 40.5, y: 14.5 },
  { label: "NW shaman thicket", x: 22.5, y: 12.5 }
];

test("skills, firemaking, and cooking are usable and visually present", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await page.goto("/?e2e");
  await joinFreshCharacter(page);
  await grantFeatureItems(page);

  await page.getByRole("button", { name: "Skills" }).click();
  await expect(page.locator("#skillsPanel")).toBeVisible();
  await expect(page.locator(".skill-row", { hasText: "Fishing" })).toBeVisible();
  await expect(page.locator(".skill-row", { hasText: "Firemaking" })).toBeVisible();
  await expect(page.locator(".skill-row", { hasText: "Cooking" })).toBeVisible();
  expect(visualStats(await page.locator("#skillsPanel").screenshot()).meaningfulPixels).toBeGreaterThan(1000);
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Inventory" }).click();
  await expect(page.locator("#inventoryPanel")).toBeVisible();
  await page.locator("[data-item='flint_steel']").click();
  await expect(page.locator("[data-item='flint_steel']")).toHaveClass(/selected/);
  await page.locator("[data-item='logs']").click();

  await page.waitForFunction(() => (window.__TIB_E2E__?.getState()?.fires?.length ?? 0) > 0);
  await expect(page.locator("#inventoryPanel")).toBeHidden();
  expect(visualStats(await page.locator("#game canvas").screenshot()).orangePixels).toBeGreaterThan(20);

  const firePoint = await page.waitForFunction(() => window.__TIB_E2E__?.fireScreenPoint?.() ?? null);
  const firePos = await firePoint.jsonValue();
  if (!firePos) throw new Error("fireScreenPoint never resolved");
  await page.locator("#game canvas").click({ position: firePos });
  await expect(page.locator("#inventoryPanel")).toBeVisible();
  await expect(page.locator("[data-item='raw_fish']")).toBeVisible();
  await page.locator("[data-item='raw_fish']").click();

  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.action?.type === "cooking");
  await page.waitForFunction(() => {
    const inventory = window.__TIB_E2E__?.self()?.inventory ?? [];
    return inventory.some((item) => item?.id === "cooked_fish") && !inventory.some((item) => item?.id === "raw_fish");
  });

  await page.getByRole("button", { name: "Inventory" }).click();
  await expect(page.locator("[data-item='cooked_fish']")).toBeVisible();
  expect(visualStats(await page.locator("#inventoryPanel").screenshot()).meaningfulPixels).toBeGreaterThan(750);
});

test("mining a vein yields ore and Mining XP, and Northwood veins carry distinct ore kinds", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  // Grant a pickaxe (the "mine" capability) and stand on the Northwood copper
  // vein's approach tile so the swing lands without any pathing.
  await page.evaluate(() => {
    window.__TIB_E2E__?.send({
      type: "e2eGrantItems",
      items: [{ id: "pickaxe", qty: 1 }],
      floor: 3,
      x: 9.5,
      y: 49.5,
      gold: 0
    });
  });
  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    if (!me || me.floor !== 3 || Math.hypot(me.x - 9.5, me.y - 49.5) > 0.5) return false;
    return (me.inventory ?? []).some((item) => item?.id === "pickaxe");
  });

  // The three Northwood veins (spread across the wood) carry distinct ore kinds.
  const forestKinds = MINING_NODES.filter((node) => node.floor === 3).map((node) => node.kind).sort();
  expect(forestKinds).toEqual(["copper", "iron", "tin"]);

  // The nearby copper vein is in view from its approach tile.
  await page.waitForFunction(() =>
    (window.__TIB_E2E__?.getState()?.miningNodes ?? []).some((node) => node.id === "mine-3-8-49")
  );

  const miningXpBefore = await page.evaluate(
    () => window.__TIB_E2E__?.self()?.skills.find((skill) => skill.id === "mining")?.xp ?? 0
  );

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "mineNode", id: "mine-3-8-49" }));
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.action?.type === "mining");

  // After the swing resolves the vein drops ore and awards Mining XP.
  await page.waitForFunction(
    (before) => {
      const me = window.__TIB_E2E__?.self();
      if (!me) return false;
      const hasOre = (me.inventory ?? []).some((item) => item?.id === "copper_ore");
      const xp = me.skills.find((skill) => skill.id === "mining")?.xp ?? 0;
      return hasOre && xp > before;
    },
    miningXpBefore
  );
});

test("actor animation frames keep a stable bottom-center anchor", async ({ page }) => {
  await page.goto("/?e2e");
  await joinFreshCharacter(page);
  const drift = await page.waitForFunction(() => {
    const rows = window.__TIB_E2E__?.actorFrameAnchorDrift?.();
    return rows?.length ? rows : null;
  });
  const rows = await drift.jsonValue();
  if (!rows) throw new Error("actorFrameAnchorDrift never resolved");
  const unstable = rows.filter((row) => row.driftX > 0.5 || row.driftY > 0);
  expect(unstable).toEqual([]);
});

test("map renderer uses culled chunks instead of one floor-sized texture", async ({ page }) => {
  await page.goto("/?e2e");
  await joinFreshCharacter(page);
  const statsHandle = await page.waitForFunction(() => {
    const stats = window.__TIB_E2E__?.mapChunkStats?.();
    return stats && stats.activeChunks > 0 ? stats : null;
  });
  const stats = await statsHandle.jsonValue();
  if (!stats || stats.floor === null) throw new Error("mapChunkStats never resolved");
  const totalChunks = Math.ceil(floorCols(stats.floor) / stats.chunkTiles) * Math.ceil(floorRows(stats.floor) / stats.chunkTiles);
  expect(stats.activeChunks).toBeLessThan(totalChunks);
  expect(stats.maxChunkTextureEdge).toBe(16 * TILE_SIZE);
});

test("Northwood spawn table covers every enemy type and renders 4-direction frames", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });

  const spawnTypes = new Set(MONSTER_SPAWNS.filter((spawn) => spawn.floor === 3).map((spawn) => spawn.type));
  expect([...spawnTypes].sort()).toEqual([...NORTHWOOD_EXPECTED_TYPES].sort());

  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  const observed = new Set<string>();
  for (const probe of NORTHWOOD_SUBZONE_PROBES) {
    await teleportTo(page, 3, probe.x, probe.y);
    const monsters = await page.waitForFunction(
      ({ x, y }) => {
        const me = window.__TIB_E2E__?.self();
        if (!me || me.floor !== 3 || Math.hypot(me.x - x, me.y - y) > 0.5) return null;
        const list = window.__TIB_E2E__?.getState()?.monsters ?? [];
        return list.length ? list : null;
      },
      { x: probe.x, y: probe.y }
    );
    const monsterList = await monsters.jsonValue();
    if (!monsterList) throw new Error("monster list never resolved");
    for (const monster of monsterList) observed.add(monster.type);
  }
  expect([...observed].sort()).toEqual([...NORTHWOOD_EXPECTED_TYPES].sort());

  const coverage = await page.evaluate(
    (types) => window.__TIB_E2E__?.monsterTextureCoverage?.(types) ?? [],
    NORTHWOOD_EXPECTED_TYPES
  );
  expect(coverage).toHaveLength(NORTHWOOD_EXPECTED_TYPES.length);
  for (const entry of coverage) {
    expect(entry.frames).toHaveLength(16);
    const missing = entry.frames.filter((frame) => !frame.exists);
    expect(missing, `${entry.type} (${entry.family}) missing frames`).toEqual([]);
  }
});

async function teleportTo(page: Page, floor: number, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ floor, x, y }) => {
      window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [], floor, x, y });
    },
    { floor, x, y }
  );
}

async function joinFreshCharacter(page: Page): Promise<void> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
}

async function grantFeatureItems(page: Page): Promise<void> {
  await page.evaluate((p) => {
    window.__TIB_E2E__?.send({
      type: "e2eGrantItems",
      items: [
        { id: "flint_steel", qty: 1 },
        { id: "logs", qty: 1 },
        { id: "raw_fish", qty: 1 }
      ],
      floor: 0,
      x: p.x,
      y: p.y,
      gold: 0
    });
  }, { x: scaleX(0, 45.5), y: scaleY(0, 33.5) });
  await page.waitForFunction(() => {
    const ids = (window.__TIB_E2E__?.self()?.inventory ?? []).filter(Boolean).map((item) => item!.id);
    return ids.includes("flint_steel") && ids.includes("logs") && ids.includes("raw_fish");
  });
}

function visualStats(buffer: Buffer): { meaningfulPixels: number; orangePixels: number } {
  const png = PNG.sync.read(buffer);
  let meaningfulPixels = 0;
  let orangePixels = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i] ?? 0;
    const g = png.data[i + 1] ?? 0;
    const b = png.data[i + 2] ?? 0;
    const a = png.data[i + 3] ?? 0;
    if (a > 0 && Math.max(r, g, b) - Math.min(r, g, b) > 16) meaningfulPixels += 1;
    if (a > 0 && r > 170 && g > 55 && g < 190 && b < 110) orangePixels += 1;
  }
  return { meaningfulPixels, orangePixels };
}
