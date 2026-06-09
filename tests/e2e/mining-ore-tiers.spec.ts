import { expect, test, type Page } from "@playwright/test";
import { ITEMS, ORE_TIERS, oreTierFor } from "../../src/shared.ts";

test("ORE_TIERS: every tier maps to a real item and gates by a non-decreasing level", () => {
  // The ladder copper -> adamant.
  const ladder = ["copper", "tin", "iron", "coal", "silver", "gold", "mithril", "adamant"];
  expect(Object.keys(ORE_TIERS).sort()).toEqual([...ladder].sort());

  for (const kind of ladder) {
    const tier = ORE_TIERS[kind]!;
    expect(ITEMS[tier.item], `${kind} -> ${tier.item} must be a real item`).toBeTruthy();
    expect(tier.reqLevel).toBeGreaterThanOrEqual(1);
    expect(tier.xp).toBeGreaterThan(0);
  }

  // Required level rises (or holds) as you go deeper; copper is mineable at 1.
  let prev = 0;
  for (const kind of ladder) {
    const req = ORE_TIERS[kind]!.reqLevel;
    expect(req).toBeGreaterThanOrEqual(prev);
    prev = req;
  }
  expect(ORE_TIERS.copper!.reqLevel).toBe(1);

  // Unknown kinds fall back to copper rather than throwing.
  expect(oreTierFor("nonsense").item).toBe("copper_ore");
});

// Northwood starter veins: copper is workable from level 1; iron is gated at 10.
const COPPER = { id: "mine-3-8-49", approach: { x: 11, y: 59 } };
const IRON = { id: "mine-3-78-47", approach: { x: 97, y: 56 } };

test("mining yields the vein's ore and gates iron behind Mining 10", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.assetResidency));
  const bootAssets = await page.evaluate(() => window.__TIB_E2E__?.assetResidency?.() ?? null);
  const bootStartupKeys = new Set((bootAssets?.startupImages ?? []).map((asset) => asset.key));
  const bootRuntimeKeys = new Set((bootAssets?.runtimeImages ?? []).map((asset) => asset.key));
  expect(bootStartupKeys.has("oreNodeSheet"), "legacy ore source sheet should not be a startup asset").toBe(false);
  expect(bootStartupKeys.has("waterFishingSpots"), "legacy fishing source sheet should not be a startup asset").toBe(false);
  expect(bootRuntimeKeys.has("oreNodeSheet"), "legacy ore source sheet should not be a runtime image asset").toBe(false);
  expect(bootRuntimeKeys.has("waterFishingSpots"), "legacy fishing source sheet should not be a runtime image asset").toBe(false);
  for (const key of ["spriteCopperVein", "spriteTinVein", "spriteIronVein", "herbBloom", "herbField", "spriteCampfire"]) {
    expect(bootStartupKeys.has(key), `${key} should not be a startup asset`).toBe(false);
  }
  expect(bootAssets?.runtimeImages.find((asset) => asset.key === "spriteCopperVein")?.resident, "ore sprites should wait for a mining floor").toBe(false);
  await join(page);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [{ id: "pickaxe", qty: 1 }] }));

  // Copper vein at Mining 1: mining yields copper ore (not a generic ore).
  await place(page, 3, COPPER.approach.x, COPPER.approach.y);
  await page.waitForFunction(() => {
    const assets = window.__TIB_E2E__?.assetResidency?.();
    const resident = (key: string): boolean => assets?.runtimeImages.find((asset) => asset.key === key)?.resident === true;
    return ["spriteCopperVein", "spriteTinVein", "spriteIronVein", "herbBloom", "herbField", "spriteCampfire"].every(resident);
  });
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "mineNode", id }), COPPER.id);
  await page.waitForFunction(
    () => (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "copper_ore"),
    null,
    { timeout: 12000 }
  );

  // Iron vein at Mining 1: gated — no iron ore is produced.
  await place(page, 3, IRON.approach.x, IRON.approach.y);
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "mineNode", id }), IRON.id);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "iron_ore"))).toBe(false);
  // And the swing never started (gating returns before setting the action).
  expect(await page.evaluate(() => window.__TIB_E2E__?.self()?.action?.type ?? null)).not.toBe("mining");

  // Train Mining to 10, then the same iron vein yields iron ore.
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev skills 10" }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "mining")?.level ?? 0) >= 10);
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "mineNode", id }), IRON.id);
  await page.waitForFunction(
    () => (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "iron_ore"),
    null,
    { timeout: 12000 }
  );
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
