import { test, type Page } from "@playwright/test";
import { scaleX, scaleY } from "../../src/shared.ts";

const HIGH = 999999;

test("Thief Quick Step dashes the player forward", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await unlockEquip(page, { npcId: "shady-contact", classKey: "thief", floor: 0, x: 43.5, y: 36.5, skills: { agility: HIGH, attack: HIGH } });

  // Stand on the open stone apron facing down (default), then dash.
  await place(page, 0, 35.5, 27.5);
  const before = await pos(page);
  await cast(page, "quick_step");
  await page.waitForFunction(
    (b) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && Math.hypot(me.x - b.x, me.y - b.y) > 1.2);
    },
    before
  );
});

test("Apothecary Healing Poultice heals instantly and over time", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await unlockEquip(page, { npcId: "cleric-monk", classKey: "apothecary", floor: 0, x: 62.5, y: 41.5, skills: { defense: HIGH, alchemy: HIGH } });

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", hp: 20 }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.hp ?? 999) <= 22);
  const hpBefore = await page.evaluate(() => window.__TIB_E2E__?.self()?.hp ?? 0);
  await cast(page, "healing_poultice");
  // Instant heal raises HP and starts a regen buff.
  await page.waitForFunction((hp) => (window.__TIB_E2E__?.self()?.hp ?? 0) > hp, hpBefore);
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.secondWind ?? 0) > 0);
});

test("Vanguard Iron Clad applies a mitigation buff", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await unlockEquip(page, { npcId: "fighter-captain", classKey: "vanguard", floor: 0, x: 51.5, y: 46.5, skills: { attack: HIGH, defense: HIGH } });
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.abilities ?? []).some((a) => a.id === "shield_bash"));
  await cast(page, "iron_clad");
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.ironClad ?? 0) > 0);

  const before = await placeNearMonster(page, 1, 1.2);
  await page.evaluate((id) => {
    window.__TIB_E2E__?.send({ type: "target", id });
    window.__TIB_E2E__?.send({ type: "useClassAbility", id: "shield_bash" });
  }, before.id);
  await page.waitForFunction(
    (target) => {
      const monster = (window.__TIB_E2E__?.getState()?.monsters ?? []).find((m) => m.id === target.id);
      return !monster || monster.hp < target.hp;
    },
    before
  );
});

test("Archer Fleet Foot applies a speed buff", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  // The Archer trainer is in Northwatch (floor 4); unlock + equip there.
  await unlockEquip(page, { npcId: "scout-leader", classKey: "archer", floor: 4, x: 50.5, y: 36.5, skills: { ranged: HIGH, foraging: HIGH } });
  await cast(page, "fleet_foot");
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.fleetFoot ?? 0) > 0);
});

test("Mage Frost Nova damages a nearby monster", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await unlockEquip(page, { npcId: "hermit-academic", classKey: "mage", floor: 4, x: 61.5, y: 36.5, skills: { magic: HIGH, alchemy: HIGH } });
  // Confirm the kit swapped to the Mage abilities.
  await page.waitForFunction(() => {
    const ids = (window.__TIB_E2E__?.self()?.abilities ?? []).map((a) => a.id);
    return ids.includes("flame_burst") && ids.includes("frost_nova") && ids.includes("arcane_bolt");
  });

  // Drop onto a skeleton on floor 1 and wait for monsters inside the nova radius
  // (the radius is in tiles, so we must stand right on top on the expanded map).
  await place(page, 1, 16.5, 14.5);
  const captured = await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    if (!me) return null;
    const inRange = (window.__TIB_E2E__?.getState()?.monsters ?? [])
      .filter((m) => m.floor === me.floor && Math.hypot(m.x - me.x, m.y - me.y) <= 2)
      .map((m) => ({ id: m.id, hp: m.hp }));
    return inRange.length ? inRange : null;
  });
  const before = (await captured.jsonValue()) as Array<{ id: string; hp: number }>;
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "target", id }), before[0]!.id);
  await cast(page, "arcane_bolt");
  await page.waitForFunction((id) => (window.__TIB_E2E__?.recentEvents?.() ?? []).some((e) => e.type === "ability_vfx" && e.text === "impact_ring" && e.target === id), before[0]!.id);
  await cast(page, "frost_nova");
  // At least one in-range monster is wounded or killed outright (high Magic one-shots).
  await page.waitForFunction(
    (list) => {
      const monsters = window.__TIB_E2E__?.getState()?.monsters ?? [];
      return list.some((t) => {
        const m = monsters.find((mo) => mo.id === t.id);
        return !m || m.hp < t.hp;
      });
    },
    before
  );
});

test("Acolyte uses Favor abilities and earns Faith XP from Unholy kills", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await unlockEquip(page, { npcId: "acolyte-prior", classKey: "acolyte", floor: 0, x: 64.5, y: 39.5, skills: { attack: HIGH, faith: HIGH } });

  await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    const ids = (me?.abilities ?? []).map((a) => a.id);
    return Boolean(me && me.maxFavor >= 100 && ids.includes("zealots_strike") && ids.includes("cleansing_flash") && ids.includes("miracle_resurrection"));
  });

  const beforeFavor = await page.evaluate(() => window.__TIB_E2E__?.self()?.favor ?? 0);
  const target = await placeNearMonster(page, 1, 1.2);
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "target", id }), target.id);
  await cast(page, "zealots_strike");
  await page.waitForFunction((favor) => (window.__TIB_E2E__?.self()?.favor ?? 0) >= favor + 12, beforeFavor);
  await page.waitForFunction(
    () => (window.__TIB_E2E__?.recentEvents?.() ?? []).some((event) => event.type === "faith_deed" && event.deedType === "unholy_slay")
  );

  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "e2eGrantItems", favor: 35, hp: 40 }));
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.favor ?? 0) >= 30);
  await cast(page, "conviction");
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.conviction ?? 0) > 0);
  await cast(page, "cleansing_flash");
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.favor ?? 999) <= 15);
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

async function unlockEquip(
  page: Page,
  opts: { npcId: string; classKey: string; floor: number; x: number; y: number; skills: Record<string, number> }
): Promise<void> {
  const scaled = { ...opts, x: scaleX(opts.floor, opts.x), y: scaleY(opts.floor, opts.y) };
  await page.evaluate((o) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", skills: o.skills, floor: o.floor, x: o.x, y: o.y }), scaled);
  await page.waitForFunction((o) => {
    const me = window.__TIB_E2E__?.self();
    if (!me || me.floor !== o.floor) return false;
    return Object.keys(o.skills).every((id) => (me.skills.find((s) => s.id === id)?.level ?? 0) >= 10);
  }, scaled);
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "talkNpc", id }), opts.npcId);
  await page.waitForFunction((k) => (window.__TIB_E2E__?.self()?.unlockedClasses ?? []).includes(k), opts.classKey);
  await page.evaluate((k) => window.__TIB_E2E__?.send({ type: "setClass", classKey: k }), opts.classKey);
  await page.waitForFunction((k) => window.__TIB_E2E__?.self()?.classKey === k, opts.classKey);
}

async function place(page: Page, floor: number, x: number, y: number): Promise<void> {
  const sx = scaleX(floor, x);
  const sy = scaleY(floor, y);
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor, x: sx, y: sy });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.hypot(me.x - p.x, me.y - p.y) < 0.8);
    },
    { floor, x: sx, y: sy }
  );
}

async function placeNearMonster(page: Page, floor: number, range: number): Promise<{ id: string; hp: number }> {
  await place(page, floor, 13.5, 12.5);
  const monster = await page.waitForFunction((f) => (window.__TIB_E2E__?.getState()?.monsters ?? []).find((m) => m.floor === f) ?? null, floor);
  const target = (await monster.jsonValue()) as { id: string; x: number; y: number; hp: number };
  await page.evaluate(
    (p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }),
    { floor, x: target.x, y: target.y + Math.min(0.5, range / 2) }
  );
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.hypot(me.x - p.x, me.y - p.y) < 0.8);
    },
    { floor, x: target.x, y: target.y + Math.min(0.5, range / 2) }
  );
  return { id: target.id, hp: target.hp };
}

async function pos(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const me = window.__TIB_E2E__!.self()!;
    return { x: me.x, y: me.y };
  });
}

async function cast(page: Page, id: string): Promise<void> {
  await page.evaluate((abilityId) => window.__TIB_E2E__?.send({ type: "useClassAbility", id: abilityId }), id);
}
