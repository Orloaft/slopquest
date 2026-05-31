import { expect, test, type Page } from "@playwright/test";
import { ITEMS, ORE_TIERS, SKILLS } from "../../src/shared.ts";

test("Smithing: each ore tier smelts to a real bar and Smithing is a registered skill", () => {
  expect(SKILLS.smithing?.label).toBe("Smithing");
  // Every metal ore declares a cook_on_fire (smelt) use that trains smithing and
  // produces a real bar item; XP rises with tier.
  let prevXp = 0;
  for (const kind of ["copper", "tin", "iron", "silver", "gold", "mithril", "adamant"]) {
    const ore = ITEMS[ORE_TIERS[kind]!.item]!;
    const use = ore.use as { kind: string; produces: string; skill: string; xp: number } | undefined;
    expect(use?.kind, `${kind} ore should smelt`).toBe("cook_on_fire");
    expect(use?.skill).toBe("smithing");
    expect(ITEMS[use!.produces], `${use!.produces} must exist`).toBeTruthy();
    expect(use!.xp).toBeGreaterThanOrEqual(prevXp); // deeper ore => more XP
    prevXp = use!.xp;
  }
  // Coal is fuel, not a smeltable ore.
  expect((ITEMS.coal as { use?: unknown }).use).toBeUndefined();
});

test("smelting a copper ore on a fire yields a copper bar and Smithing XP", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Stand on the forest crossroads, kit up, and light a fire underfoot.
  await page.evaluate(() =>
    window.__TIB_E2E__?.send({
      type: "e2eGrantItems",
      floor: 3,
      x: 55.5,
      y: 36.5,
      items: [
        { id: "flint_steel", qty: 1 },
        { id: "logs", qty: 5 },
        { id: "copper_ore", qty: 2 },
        { id: "adamant_ore", qty: 2 }
      ]
    })
  );
  await page.waitForFunction(() => window.__TIB_E2E__?.self()?.floor === 3);
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "makeFire", logItem: "logs" }));
  const fireHandle = await page.waitForFunction(() => window.__TIB_E2E__?.getState()?.fires?.[0]?.id ?? null);
  const fireId = (await fireHandle.jsonValue()) as string;

  // Smelt copper -> copper bar + Smithing XP.
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "useItem", item: "copper_ore", ctx: { fireId: id } }), fireId);
  await page.waitForFunction(
    () =>
      (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "copper_bar") &&
      (window.__TIB_E2E__?.self()?.skills.find((s) => s.id === "smithing")?.xp ?? 0) > 0,
    null,
    { timeout: 12000 }
  );

  // A deep cave ore smelts into its high-tier bar too.
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "useItem", item: "adamant_ore", ctx: { fireId: id } }), fireId);
  await page.waitForFunction(
    () => (window.__TIB_E2E__?.self()?.inventory ?? []).some((i) => i?.id === "adamant_bar"),
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
