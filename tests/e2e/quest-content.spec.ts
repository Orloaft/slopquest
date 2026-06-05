import { expect, test, type Page } from "@playwright/test";
import { QUESTS, NPCS, ITEMS } from "../../src/shared.ts";
import type { Quest, QuestDialogue } from "../../src/content-types.ts";

const TEMPLATE_PATTERN = /\{[^}]+\}/;

interface Giver {
  npcId: string;
  npcName: string;
  floor: number;
  quest: Quest;
}

interface DialogueRow {
  speaker: string;
  text: string;
}

type QuestPhase = keyof QuestDialogue;

const GIVERS: Giver[] = NPCS.filter((npc) => npc.role === "quest").map((npc) => {
  const quest = Object.values(QUESTS).find((entry) => entry.giverId === npc.id);
  if (!quest) throw new Error(`No quest wired to giver ${npc.id}`);
  return { npcId: npc.id, npcName: npc.name, floor: npc.floor, quest };
});

// Quests whose giver gates the offer behind a prerequisite — mirror of
// QUEST_PREREQUISITES in server/index.ts; keep the two in sync. On a fresh
// character these answer with a single block line instead of accepting, so they
// are exercised by the gate assertion in the intro test rather than the
// accept/turn-in play-throughs (which a fresh character can't complete).
const PREREQ_GATED = new Set([
  "cleanse_ashen_crypt",
  "southward_proof",
  "deepdelve_vault_key",
  "jungle_vault_faultwarden"
]);

const OPEN_GIVERS = GIVERS.filter((g) => !PREREQ_GATED.has(g.quest.id));
const GATED_GIVERS = GIVERS.filter((g) => PREREQ_GATED.has(g.quest.id));
const KILL_GIVERS = OPEN_GIVERS.filter((g) => g.quest.kind === "kill");
const ITEM_GIVERS = OPEN_GIVERS.filter((g) => g.quest.kind === "gather" || g.quest.kind === "fetch");

test("every quest giver opens its quest with a clean, fully-rendered intro", async ({ page }) => {
  forwardPageErrors(page);
  await page.goto("/?e2e");
  await joinFreshCharacter(page);

  for (const giver of OPEN_GIVERS) {
    const lines = await openDialogueWith(page, giver.npcId);

    expectMatchesPhase(lines, giver.quest, "intro");
    expect(lines[0]?.speaker).toBe(giver.npcName);

    const state = await questState(page, giver.quest.id);
    expect(state?.accepted, `${giver.quest.id} should be accepted after intro`).toBe(true);
    expect(state?.progress).toBe(0);
    expect(state?.claimed).toBe(false);
    expect(state?.target).toBe(giver.quest.targetCount);

    await expect(page.locator("#questTracker"), `${giver.quest.id} should appear in tracker`).toContainText(giver.quest.title);
  }

  // Gated givers refuse with a single, fully-rendered block line until the
  // prerequisite is met: the quest must stay unaccepted and out of the tracker.
  for (const giver of GATED_GIVERS) {
    const lines = await openDialogueWith(page, giver.npcId);

    expect(lines.length, `${giver.quest.id} gate should be one line`).toBe(1);
    expect(lines[0]?.speaker).toBe(giver.npcName);
    expect(lines[0]?.text.length, `${giver.quest.id} gate line must be non-empty`).toBeGreaterThan(0);
    expect(lines[0]?.text, `${giver.quest.id} gate line has unresolved template`).not.toMatch(TEMPLATE_PATTERN);

    const state = await questState(page, giver.quest.id);
    expect(state?.accepted, `${giver.quest.id} must stay locked behind its prerequisite`).toBe(false);
  }

  const tracker = await page.locator("#questTracker").innerText();
  for (const giver of OPEN_GIVERS) {
    expect(tracker, `tracker missing ${giver.quest.title}`).toContain(giver.quest.title);
  }
  for (const giver of GATED_GIVERS) {
    expect(tracker, `gated ${giver.quest.title} should not be tracked yet`).not.toContain(giver.quest.title);
  }
});

for (const giver of ITEM_GIVERS) {
  test(`${giver.quest.id} (${giver.quest.kind}) plays intro → progress → turn-in → claimed and pays the reward`, async ({ page }) => {
    forwardPageErrors(page);
    await page.goto("/?e2e");
    await joinFreshCharacter(page);

    const itemId = giver.quest.itemId;
    if (!itemId) throw new Error(`${giver.quest.id} (${giver.quest.kind}) has no itemId`);
    const item = ITEMS[itemId];
    if (!item) throw new Error(`${giver.quest.id} references unknown item ${itemId}`);

    const before = await self(page);
    if (!before) throw new Error("self() returned no player before turn-in");

    const intro = await openDialogueWith(page, giver.npcId);
    expectMatchesPhase(intro, giver.quest, "intro");

    const progress = await openDialogueWith(page, giver.npcId);
    expectMatchesPhase(progress, giver.quest, "progress");
    const npcProgressLines = progress.filter((line) => line.speaker === giver.npcName);
    expect(npcProgressLines.length).toBeGreaterThan(0);
    for (const line of npcProgressLines) {
      expect(line.text).toContain(item.label);
    }

    await grantItems(page, [{ id: itemId, qty: giver.quest.targetCount }]);
    await page.waitForFunction(
      ({ id, target }) => {
        const quest = window.__TIB_E2E__?.self()?.quests?.find((q) => q.id === id);
        return Boolean(quest) && (quest?.progress ?? 0) >= target;
      },
      { id: giver.quest.id, target: giver.quest.targetCount }
    );

    await expect(page.locator("#questTracker")).toContainText("Ready to turn in");

    const turnIn = await openDialogueWith(page, giver.npcId);
    expectMatchesPhase(turnIn, giver.quest, "turnIn");

    const after = await self(page);
    if (!after) throw new Error("self() returned no player after turn-in");
    expect(after.gold - before.gold).toBe(giver.quest.rewardGold);
    expect(after.xp - before.xp).toBe(giver.quest.rewardXp);
    expect(inventoryCount(after, itemId)).toBe(0);

    const claimedState = await questState(page, giver.quest.id);
    expect(claimedState?.claimed).toBe(true);
    expect(claimedState?.progress).toBe(giver.quest.targetCount);

    await expect(page.locator("#questTracker"), "claimed quest should leave the tracker").not.toContainText(giver.quest.title);

    const claimed = await openDialogueWith(page, giver.npcId);
    expectMatchesPhase(claimed, giver.quest, "claimed");
  });
}

for (const giver of KILL_GIVERS) {
  test(`${giver.quest.id} (kill) shows progress dialogue on re-talk while incomplete`, async ({ page }) => {
    forwardPageErrors(page);
    await page.goto("/?e2e");
    await joinFreshCharacter(page);

    await openDialogueWith(page, giver.npcId);
    const progress = await openDialogueWith(page, giver.npcId);
    expectMatchesPhase(progress, giver.quest, "progress");

    for (const line of progress) {
      expect(line.text).not.toMatch(TEMPLATE_PATTERN);
      if (line.text.includes("/")) {
        expect(line.text).toContain(`0/${giver.quest.targetCount}`);
      }
    }

    const state = await questState(page, giver.quest.id);
    expect(state?.progress).toBe(0);
    expect(state?.claimed).toBe(false);
  });
}

async function openDialogueWith(page: Page, npcId: string): Promise<DialogueRow[]> {
  const panel = page.locator("#dialogue");
  await panel.waitFor({ state: "hidden" });

  // Givers can live on any floor; teleport to the catalog position first so the
  // NPC enters the client snapshot before we look it up.
  const cat = NPCS.find((n) => n.id === npcId);
  if (cat) await teleportTo(page, cat.floor, Math.floor(cat.x) + 0.5, Math.floor(cat.y) + 0.5, 2000);

  let npc: { id: string; x: number; y: number; floor: number } | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      npc = await page.evaluate(
        (id) => (window.__TIB_E2E__?.getState()?.npcs ?? []).find((entry) => entry.id === id) ?? null,
        npcId
      );
      if (!npc) throw new Error(`NPC ${npcId} not visible in client snapshot`);
      const targetX = Math.floor(npc.x) + 0.5;
      const targetY = Math.floor(npc.y) + 0.5;
      await teleportTo(page, npc.floor, targetX, targetY, 2000);
      break;
    } catch (error) {
      lastError = error;
      npc = null;
    }
  }
  if (!npc) throw lastError ?? new Error(`NPC ${npcId} never reachable`);

  // talkNpc must fire exactly once per visit: a second send on an already-accepted
  // quest swaps the intro reply for the progress reply server-side.
  await page.evaluate((id) => window.__TIB_E2E__?.send({ type: "talkNpc", id }), npcId);
  await panel.waitFor({ state: "visible" });
  return await readDialogue(page);
}

async function readDialogue(page: Page): Promise<DialogueRow[]> {
  const lines: DialogueRow[] = [];
  let guard = 0;
  for (;;) {
    if (guard++ > 20) throw new Error("Dialogue advance loop did not terminate");
    const speaker = (await page.locator("#dialogueSpeaker").innerText()).trim();
    const text = (await page.locator("#dialogueLine").innerText()).trim();
    const buttonText = (await page.locator("#dialogueNextButton").innerText()).trim();
    lines.push({ speaker, text });
    await page.locator("#dialogueNextButton").click();
    if (buttonText === "Done") break;
  }
  await page.locator("#dialogue").waitFor({ state: "hidden" });
  return lines;
}

async function teleportTo(page: Page, floor: number, x: number, y: number, timeout = 8000): Promise<void> {
  await page.evaluate(
    ({ floor, x, y }) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: [], floor, x, y }),
    { floor, x, y }
  );
  await page.waitForFunction(
    ({ floor, x, y }) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me) && me?.floor === floor && Math.hypot((me?.x ?? 0) - x, (me?.y ?? 0) - y) < 1.8;
    },
    { floor, x, y },
    { timeout }
  );
}

async function grantItems(page: Page, items: Array<{ id: string; qty: number }>): Promise<void> {
  await page.evaluate((payload) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", items: payload }), items);
  await page.waitForFunction(
    (payload) => {
      const inv = window.__TIB_E2E__?.self()?.inventory ?? [];
      return payload.every(({ id, qty }) =>
        inv.reduce((sum, item) => sum + (item?.id === id ? item.qty : 0), 0) >= qty
      );
    },
    items
  );
}

async function joinFreshCharacter(page: Page): Promise<void> {
  const name = `e2e_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
}

async function self(page: Page) {
  return page.evaluate(() => window.__TIB_E2E__?.self() ?? null);
}

async function questState(page: Page, id: string) {
  return page.evaluate(
    (questId) => window.__TIB_E2E__?.self()?.quests?.find((quest) => quest.id === questId) ?? null,
    id
  );
}

function inventoryCount(player: { inventory: Array<{ id: string; qty: number } | null> }, id: string): number {
  return (player.inventory ?? []).reduce((sum, item) => sum + (item?.id === id ? item.qty : 0), 0);
}

function expectMatchesPhase(actual: DialogueRow[], quest: Quest, phase: QuestPhase): void {
  const expected = quest.dialogue[phase];
  expect(expected, `${quest.id} ${phase} must be defined`).toBeDefined();
  expect(actual.length, `${quest.id} ${phase} line count`).toBe(expected?.length);
  for (const line of actual) {
    expect(line.text, `${quest.id} ${phase} unresolved template in "${line.text}"`).not.toMatch(TEMPLATE_PATTERN);
    expect(line.text.length, `${quest.id} ${phase} empty line`).toBeGreaterThan(0);
    expect(line.speaker.length, `${quest.id} ${phase} empty speaker`).toBeGreaterThan(0);
  }
}

function forwardPageErrors(page: Page): void {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
}
