import { expect, test } from "@playwright/test";
import { QUESTS, NPCS, ITEMS } from "../../src/shared.ts";
import type { DialogueLine, Quest, QuestDialogue } from "../../src/content-types.ts";

const REQUIRED_PHASES = ["intro", "progress", "turnIn", "claimed"] as const;
const ALL_PHASES = [...REQUIRED_PHASES, "missingItems"] as const;
const PLACEHOLDER_PATTERN = /\{([^}]+)\}/g;

type QuestPhase = keyof QuestDialogue;

interface RenderContext {
  progress: number;
  target: { count: number; remaining: number; item: { id: string; label: string } | null };
  reward: { gold: number; xp: number };
  player: { name: string };
  npc: { name: string };
}

// Mirrors the ctx built by questDialogue() in server/index.ts.
// Update both together if the renderer's context shape changes.
const BASE_PATHS = new Set([
  "progress",
  "target.count",
  "target.remaining",
  "reward.gold",
  "reward.xp",
  "player.name",
  "npc.name"
]);

const ITEM_PATHS = new Set(["target.item.id", "target.item.label"]);

function allowedPathsFor(quest: Quest): Set<string> {
  const allowed = new Set(BASE_PATHS);
  if (quest.itemId) for (const path of ITEM_PATHS) allowed.add(path);
  return allowed;
}

function contextFor(quest: Quest): RenderContext {
  const item =
    quest.itemId && ITEMS[quest.itemId]
      ? { id: ITEMS[quest.itemId]!.id, label: ITEMS[quest.itemId]!.label }
      : null;
  return {
    progress: 0,
    target: { count: quest.targetCount, remaining: quest.targetCount, item },
    reward: { gold: quest.rewardGold, xp: quest.rewardXp },
    player: { name: "Adventurer" },
    npc: { name: "Giver" }
  };
}

function renderLine(text: string, ctx: RenderContext): string {
  return text.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const parts = key.split(".");
    let value: unknown = ctx;
    for (const part of parts) {
      if (value == null) return `{${key}}`;
      value = (value as Record<string, unknown>)[part];
    }
    return value == null ? `{${key}}` : String(value);
  });
}

function speakerOf(line: DialogueLine): "npc" | "player" | null {
  if ("npc" in line && typeof line.npc === "string") return "npc";
  if ("player" in line && typeof line.player === "string") return "player";
  return null;
}

function textOf(line: DialogueLine, speaker: "npc" | "player"): string {
  if (speaker === "npc" && "npc" in line) return line.npc;
  if (speaker === "player" && "player" in line) return line.player;
  return "";
}

test("every quest is wired to an NPC with role=quest", () => {
  for (const quest of Object.values(QUESTS)) {
    const npc = NPCS.find((entry) => entry.id === quest.giverId);
    expect(npc, `${quest.id} references unknown giver "${quest.giverId}"`).toBeTruthy();
    expect(npc?.role, `${quest.id} giver "${npc?.id}" must have role "quest"`).toBe("quest");
  }
});

test("every quest defines all required dialogue phases", () => {
  for (const quest of Object.values(QUESTS)) {
    const dialogue: QuestDialogue = quest.dialogue;
    for (const phase of REQUIRED_PHASES) {
      const lines = dialogue[phase];
      expect(Array.isArray(lines), `${quest.id}.dialogue.${phase} must be an array`).toBe(true);
      expect(lines.length, `${quest.id}.dialogue.${phase} must be non-empty`).toBeGreaterThan(0);
      for (const [i, line] of lines.entries()) {
        const speaker = speakerOf(line);
        expect(speaker, `${quest.id}.dialogue.${phase}[${i}] must have npc or player text`).not.toBeNull();
        if (!speaker) continue;
        expect(textOf(line, speaker).length, `${quest.id}.dialogue.${phase}[${i}] text must be non-empty`).toBeGreaterThan(0);
      }
    }
    if (quest.kind === "gather" || quest.kind === "fetch") {
      const lines = dialogue.missingItems;
      expect(Array.isArray(lines), `${quest.id} (${quest.kind}) must define dialogue.missingItems`).toBe(true);
      expect(lines?.length, `${quest.id}.dialogue.missingItems must be non-empty`).toBeGreaterThan(0);
    }
  }
});

test("every dialogue placeholder resolves to a supported context path", () => {
  for (const quest of Object.values(QUESTS)) {
    const allowed = allowedPathsFor(quest);
    const dialogue: QuestDialogue = quest.dialogue;
    for (const phase of ALL_PHASES) {
      const lines = dialogue[phase as QuestPhase];
      if (!Array.isArray(lines)) continue;
      for (const [i, line] of lines.entries()) {
        const speaker = speakerOf(line);
        if (!speaker) continue;
        const text = textOf(line, speaker);
        for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
          const key = match[1] ?? "";
          expect(
            allowed.has(key),
            `${quest.id}.dialogue.${phase}[${i}] uses unsupported placeholder "{${key}}" ` +
              `(quest kind="${quest.kind}", itemId=${quest.itemId ?? "none"}). ` +
              `Supported: ${[...allowed].sort().join(", ")}`
          ).toBe(true);
        }
      }
    }
  }
});

test("every dialogue line renders without leftover {placeholders}", () => {
  for (const quest of Object.values(QUESTS)) {
    const ctx = contextFor(quest);
    const dialogue: QuestDialogue = quest.dialogue;
    for (const phase of ALL_PHASES) {
      const lines = dialogue[phase as QuestPhase];
      if (!Array.isArray(lines)) continue;
      for (const [i, line] of lines.entries()) {
        const speaker = speakerOf(line);
        if (!speaker) continue;
        const rendered = renderLine(textOf(line, speaker), ctx);
        expect(
          rendered.match(/\{[^}]+\}/),
          `${quest.id}.dialogue.${phase}[${i}] rendered with leftover placeholder: "${rendered}"`
        ).toBeNull();
      }
    }
  }
});
