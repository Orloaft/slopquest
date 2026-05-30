import { test, type Page } from "@playwright/test";

const HIGH = 999999;

test("Thief Quick Step dashes the player forward", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await unlockEquip(page, { npcId: "shady-contact", classKey: "thief", floor: 0, x: 14.5, y: 16.5, skills: { agility: HIGH, attack: HIGH } });

  // Stand in an open corridor facing down (default), then dash.
  await place(page, 0, 16.5, 15.5);
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
  await unlockEquip(page, { npcId: "cleric-monk", classKey: "apothecary", floor: 0, x: 27.5, y: 14.5, skills: { defense: HIGH, alchemy: HIGH } });

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
  await unlockEquip(page, { npcId: "fighter-captain", classKey: "vanguard", floor: 0, x: 28.5, y: 18.5, skills: { attack: HIGH, defense: HIGH } });
  await cast(page, "iron_clad");
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.ironClad ?? 0) > 0);
});

test("Archer Fleet Foot applies a speed buff", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  // The Archer trainer is in Northwatch (floor 4); unlock + equip there.
  await unlockEquip(page, { npcId: "scout-leader", classKey: "archer", floor: 4, x: 23.5, y: 16.5, skills: { ranged: HIGH, foraging: HIGH } });
  await cast(page, "fleet_foot");
  await page.waitForFunction(() => (window.__TIB_E2E__?.self()?.buffs?.fleetFoot ?? 0) > 0);
});

test("Mage Frost Nova damages a nearby monster", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);
  await unlockEquip(page, { npcId: "hermit-academic", classKey: "mage", floor: 4, x: 27.5, y: 16.5, skills: { magic: HIGH, alchemy: HIGH } });
  // Confirm the kit swapped to the Mage abilities.
  await page.waitForFunction(() => {
    const ids = (window.__TIB_E2E__?.self()?.abilities ?? []).map((a) => a.id);
    return ids.includes("flame_burst") && ids.includes("frost_nova");
  });

  // Drop next to a skeleton on floor 1 and wait for monsters inside the nova radius.
  await place(page, 1, 13.5, 13.5);
  const captured = await page.waitForFunction(() => {
    const me = window.__TIB_E2E__?.self();
    if (!me) return null;
    const inRange = (window.__TIB_E2E__?.getState()?.monsters ?? [])
      .filter((m) => m.floor === me.floor && Math.hypot(m.x - me.x, m.y - me.y) <= 2)
      .map((m) => ({ id: m.id, hp: m.hp }));
    return inRange.length ? inRange : null;
  });
  const before = (await captured.jsonValue()) as Array<{ id: string; hp: number }>;
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
  await page.evaluate((o) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", skills: o.skills, floor: o.floor, x: o.x, y: o.y }), opts);
  await page.waitForFunction((o) => {
    const me = window.__TIB_E2E__?.self();
    if (!me || me.floor !== o.floor) return false;
    return Object.keys(o.skills).every((id) => (me.skills.find((s) => s.id === id)?.level ?? 0) >= 10);
  }, opts);
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "talkNpc", id }), opts.npcId);
  await page.waitForFunction((k) => (window.__TIB_E2E__?.self()?.unlockedClasses ?? []).includes(k), opts.classKey);
  await page.evaluate((k) => window.__TIB_E2E__?.send({ type: "setClass", classKey: k }), opts.classKey);
  await page.waitForFunction((k) => window.__TIB_E2E__?.self()?.classKey === k, opts.classKey);
}

async function place(page: Page, floor: number, x: number, y: number): Promise<void> {
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor, x, y });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.hypot(me.x - p.x, me.y - p.y) < 0.8);
    },
    { floor, x, y }
  );
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
