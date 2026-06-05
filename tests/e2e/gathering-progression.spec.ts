import { expect, test, type Page } from "@playwright/test";
import {
  ITEMS,
  FISH_TIERS,
  fishTierFor,
  TREE_TYPES,
  FISHING_NODES,
  HERB_NODES,
  COMPOSED_TREE_NODES,
  isBlockedTile,
  makeFloorTiles
} from "../../src/shared.ts";

// --- Unit: ladder + sink integrity (no browser) ----------------------------

test("FISH_TIERS: ladder maps to real items and gates by non-decreasing level", () => {
  const ladder = ["fish", "trout", "pike", "bass", "shark"];
  expect(Object.keys(FISH_TIERS).sort()).toEqual([...ladder].sort());
  let prev = 0;
  for (const kind of ladder) {
    const tier = FISH_TIERS[kind]!;
    expect(ITEMS[tier.item], `${kind} -> ${tier.item} must be a real item`).toBeTruthy();
    expect(tier.xp).toBeGreaterThan(0);
    expect(tier.reqLevel).toBeGreaterThanOrEqual(prev);
    prev = tier.reqLevel;
  }
  expect(FISH_TIERS.fish!.reqLevel).toBe(1);
  expect(fishTierFor("nonsense").item).toBe("raw_fish");
});

test("each raw fish smokes into a real cooked food (Cooking ladder)", () => {
  for (const kind of Object.keys(FISH_TIERS)) {
    const raw = ITEMS[FISH_TIERS[kind]!.item]!;
    const use = raw.use as { kind?: string; produces?: string } | undefined;
    expect(use?.kind, `${raw.id} should cook on a fire`).toBe("cook_on_fire");
    expect(ITEMS[use!.produces!], `${raw.id} -> ${use!.produces} cooked food must exist`).toBeTruthy();
  }
});

test("Woodcutting ladder: 5 tiers, each with a real log item and rising req", () => {
  const ids = Object.keys(TREE_TYPES);
  for (const id of ["oak", "pine", "willow", "teak", "mahogany"]) expect(ids).toContain(id);
  for (const [id, t] of Object.entries(TREE_TYPES)) {
    expect(ITEMS[t.itemId], `${id} -> ${t.itemId} log item must exist`).toBeTruthy();
  }
  expect(TREE_TYPES["willow"]!.requiredLevel).toBe(20);
  expect(TREE_TYPES["mahogany"]!.requiredLevel).toBe(50);
});

test("closed loops: coal/quartz/mushroom each feed a sink item", () => {
  // quartz -> empty_flask on a fire
  const q = ITEMS["quartz"]!.use as { produces?: string } | undefined;
  expect(q?.produces).toBe("empty_flask");
  // strong_potion (mushroom brew) and the higher logs all exist
  expect(ITEMS["strong_potion"]).toBeTruthy();
  for (const id of ["willow_logs", "teak_logs", "mahogany_logs"]) expect(ITEMS[id]).toBeTruthy();
});

test("every new gathering node sits on a walkable approach", () => {
  const newFish = FISHING_NODES.filter((n) => n.kind === "shark");
  const newHerbs = HERB_NODES.filter((n) => n.id.startsWith("cavecap-") || n.id.startsWith("faultroot-"));
  const newTrees = COMPOSED_TREE_NODES.filter((t) => ["willow", "teak", "mahogany"].includes(t.type));
  expect(newFish.length).toBeGreaterThan(0);
  expect(newHerbs.length).toBeGreaterThan(3);
  expect(newTrees.length).toBe(9);
  for (const n of [...newFish, ...newHerbs]) {
    const rows = makeFloorTiles(n.floor);
    const x = Math.floor(n.approachX);
    const y = Math.floor(n.approachY);
    expect(isBlockedTile(rows[y]?.[x] ?? "#"), `${n.id} approach must be walkable`).toBe(false);
  }
  for (const t of newTrees) {
    const rows = makeFloorTiles(t.floor);
    // the tree tile itself is walkable ground (the tree then occupies it)
    expect(isBlockedTile(rows[Math.floor(t.y)]?.[Math.floor(t.x)] ?? "#"), `${t.type}@${t.floor} on walkable ground`).toBe(false);
  }
});

test("floor-9 jungle is now traversable (paved with walkable 'g', not blocked 'y')", () => {
  // The bug: jungle runs were paved with 'y' (the Northwood tree trunk), which
  // isBlockedTile blocks globally — so the whole zone was impassable.
  expect(isBlockedTile("-")).toBe(false);
  const rows = makeFloorTiles(9);
  const count = (ch: string) => rows.reduce((n, r) => n + [...r].filter((c) => c === ch).length, 0);
  expect(count("-")).toBeGreaterThan(800); // the run network exists and is walkable
  // The monster + boss spawn tiles must be standable, or they're stuck in walls.
  const spawns: Array<[number, number]> = [[17, 24], [46, 11], [26, 10], [60, 26], [85, 44]];
  for (const [x, y] of spawns) {
    expect(isBlockedTile(rows[y]?.[x] ?? "#"), `spawn (${x},${y}) must be walkable`).toBe(false);
  }
});

// --- In-engine: the flagship new mechanics ---------------------------------

test("a player can stand and move on the floor-9 jungle floor", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  // Teleport onto a former-'y' (now 'g') run; place() only resolves if walkable.
  await place(page, 9, 5, 19);
  expect(await page.evaluate(() => window.__TIB_E2E__?.self()?.floor)).toBe(9);
  // Drive steps east into adjacent jungle floor and confirm we actually move.
  const startX = await page.evaluate(() => window.__TIB_E2E__?.self()?.x ?? 0);
  let movedX = startX;
  for (let i = 0; i < 25; i++) {
    await page.evaluate(() => window.__TIB_E2E__?.send({ type: "input", input: { right: true } }));
    await page.waitForTimeout(120);
    movedX = await page.evaluate(() => window.__TIB_E2E__?.self()?.x ?? 0);
    if (movedX > startX + 0.3) break;
  }
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "input", input: {} }));
  expect(movedX, "player should walk east across the jungle floor").toBeGreaterThan(startX + 0.3);
});

test("Shark is gated behind Fishing 50, then catchable on the f8 deep reef", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "fishing_rod", qty: 1 }] }));

  // Stand at the shark spot (approach 73.5,7.5) with starter Fishing — gated.
  await place(page, 8, 73, 7);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "fishNode", id: "fish-8-73-6" }));
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__TIB_E2E__?.self()?.action?.type ?? null)).not.toBe("fishing");
  expect(await page.evaluate(() => (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "raw_shark"))).toBe(false);

  // Train every skill to 50, then the same reef yields a shark.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev skills 50" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "fishing")?.level ?? 0) >= 50);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "fishNode", id: "fish-8-73-6" }));
  await page.waitForFunction(
    () => (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "raw_shark"),
    null,
    { timeout: 12000 }
  );
});

test("Willow is gated behind Woodcutting 20, then choppable in the marsh", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "axe", qty: 1 }] }));

  const willowId = "tree-composed-5-46_5-16_5";
  await place(page, 5, 46, 17); // adjacent to the willow at (46.5,16.5)

  // Starter Woodcutting — gated, the chop never starts.
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "cutTree", id }), willowId);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__TIB_E2E__?.self()?.action?.type ?? null)).not.toBe("woodcutting");

  // Train to 50 (fast swings), then chop fells the willow into willow_logs.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev skills 50" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "woodcutting")?.level ?? 0) >= 50);
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "cutTree", id }), willowId);
  // Felled logs drop on the ground (unlike fishing/mining) — keep looting the
  // adjacent drop while the chop completes, then assert willow_logs in hand.
  await page.waitForFunction(
    () => {
      window.__TIB_E2E__?.send({ type: "loot" });
      return (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "willow_logs");
    },
    null,
    { timeout: 28000, polling: 1000 }
  );
});

test("coal is the forge fuel: Iron Edge needs coal, consumes it on success", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev skills 50" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "smithing")?.level ?? 0) >= 50);

  // Stand by Master Harlowe, the Northwatch smith (f4, 71.5,48.5).
  await place(page, 4, 71, 49);

  // Forge the tier-1 Copper Edge (no coal needed) to reach weaponTier 1.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "copper_bar", qty: 1 }] }));
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "smithGear", slot: "weapon" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.weaponTier ?? 0) >= 1);

  // Iron Edge (tier 2) WITHOUT coal — blocked, weaponTier stays 1.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "iron_bar", qty: 2 }] }));
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "smithGear", slot: "weapon" }));
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__TIB_E2E__?.self()?.weaponTier ?? 0)).toBe(1);

  // Grant 2 coal — now the forge fires and the coal is consumed.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "coal", qty: 2 }] }));
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "smithGear", slot: "weapon" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.weaponTier ?? 0) >= 2, null, { timeout: 6000 });
  expect(await page.evaluate(() => (window.__TIB_E2E__?.self()?.inventory ?? []).filter((i) => i?.id === "coal").reduce((n, i) => n + (i?.qty ?? 0), 0))).toBe(0);
});

// --- helpers ---------------------------------------------------------------

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

async function place(page: Page, floor: number, x: number, y: number): Promise<void> {
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x + 0.5, y: p.y + 0.5 }), { floor, x, y });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.hypot(me.x - (p.x + 0.5), me.y - (p.y + 0.5)) < 1.2);
    },
    { floor, x, y }
  );
}
