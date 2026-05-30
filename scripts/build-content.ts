// Reads content/*.yaml, validates references, emits src/generated/catalog.ts.
// Run before the server boots and before vite bundles the client. See package.json.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type { DialogueLine, Range } from "../src/content-types.ts";

// --- Raw YAML shapes (everything optional; validated below) ----------------

interface RawUse {
  kind?: string;
  restoreHp?: number;
  buffs?: Array<{ id: string; durationMs: number }>;
  float?: string;
  consumesAny?: Array<{ item?: string; qty?: number; xp?: number }>;
  skill?: string;
  durationMs?: number;
  produces?: string;
  burns?: string;
  xp?: number;
}

interface RawItem {
  id?: string;
  label?: string;
  icon?: string;
  iconUrl?: string | null;
  stackable?: boolean;
  tags?: string[];
  capabilities?: string[];
  weight?: number;
  use?: RawUse;
}

interface RawMonster {
  id?: string;
  name?: string;
  maxHp?: number;
  speed?: number;
  damage?: Range;
  attackMs?: number;
  xp?: number;
  gold?: Range;
  aggro?: number;
  range?: number;
  ranged?: boolean;
  slowPct?: number;
  slowMs?: number;
  weakenPct?: number;
  weakenMs?: number;
  armor?: number;
  pack?: boolean;
  burrow?: boolean;
  stunMs?: number;
  drops?: Array<{ item?: string; chance?: number }>;
}

interface RawTreeType {
  id?: string;
  [key: string]: unknown;
}

interface RawNpc {
  id?: string;
  name?: string;
  role?: string;
  at?: { floor: number; x: number; y: number };
  idleDialogue?: string;
}

interface RawFishingNode {
  id?: string;
  at?: { floor: number; x: number; y: number };
  approach?: { x: number; y: number };
}

interface RawMiningNode {
  id?: string;
  kind?: string;
  at?: { floor: number; x: number; y: number };
  approach?: { x: number; y: number };
}

interface RawHerbNode {
  id?: string;
  label?: string;
  requiredLevel?: number;
  xp?: number;
  item?: string;
  at?: { floor: number; x: number; y: number };
  approach?: { x: number; y: number };
}

interface RawSpawns {
  monsters?: Array<{ type?: string; at?: { floor: number; x: number; y: number }; zone?: string }>;
  trees?: Array<{ type?: string; at?: { floor: number; x: number; y: number } }>;
}

interface RawQuest {
  id?: string;
  title?: string;
  giver?: string;
  objective?: { kind?: string; count?: number; in?: string; monsters?: string[]; item?: string };
  reward?: { gold?: number; xp?: number };
  dialogue?: Record<string, DialogueLine[]>;
  __file: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONTENT = join(ROOT, "content");
const QUESTS_DIR = join(CONTENT, "quests");
const OUT = join(ROOT, "src", "generated", "catalog.ts");

const errors: string[] = [];
const fail = (where: string, msg: string): number => errors.push(`[${where}] ${msg}`);

function load<T>(file: string): T | null {
  const path = join(CONTENT, file);
  try {
    return yaml.load(readFileSync(path, "utf8")) as T;
  } catch (err) {
    fail(file, err instanceof Error ? err.message : String(err));
    return null;
  }
}

const items = load<RawItem[]>("items.yaml") ?? [];
const monsters = load<RawMonster[]>("monsters.yaml") ?? [];
const npcs = load<RawNpc[]>("npcs.yaml") ?? [];
const treeTypes = load<RawTreeType[]>("tree-types.yaml") ?? [];
const fishingNodes = load<RawFishingNode[]>("fishing-nodes.yaml") ?? [];
const miningNodes = load<RawMiningNode[]>("mining-nodes.yaml") ?? [];
const herbNodes = load<RawHerbNode[]>("herb-nodes.yaml") ?? [];
const shop = load<Record<string, unknown>>("shop.yaml") ?? {};
const spawns = load<RawSpawns>("spawns.yaml") ?? {};
const quests = loadQuests();

const itemIds = new Set(items.map((i) => i.id));
const monsterIds = new Set(monsters.map((m) => m.id));
const treeTypeIds = new Set(treeTypes.map((t) => t.id));
const npcIdsByRole = new Map(npcs.map((n) => [n.id, n.role]));
const zoneIds = new Set(["southTown", "cemetery", "crypt", "woods", "northTown", "marsh", "badlands", "desert"]);
const useKinds = new Set(["eat", "light_fire", "cook_on_fire", "drink_potion"]);
const capabilityIds = new Set(["chop_tree", "fish", "mine", "ranged"]);
const questKinds = new Set(["kill", "gather", "fetch"]);
const oreKinds = new Set(["copper", "tin", "iron"]);
const requiredQuestPhases = ["intro", "progress", "turnIn", "claimed"];

function loadQuests(): RawQuest[] {
  let files: string[];
  try {
    files = readdirSync(QUESTS_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") return [];
    fail("quests/", err instanceof Error ? err.message : String(err));
    return [];
  }
  const loaded: RawQuest[] = [];
  for (const file of files) {
    const data = load<Omit<RawQuest, "__file">>(join("quests", file));
    if (data) loaded.push({ ...data, __file: `quests/${file}` });
  }
  return loaded;
}

for (const item of items) {
  if (!item.id) fail("items.yaml", "item missing id");
  if (!item.label) fail(`items.yaml:${item.id}`, "missing label");
  for (const cap of item.capabilities ?? []) {
    if (!capabilityIds.has(cap)) fail(`items.yaml:${item.id}`, `unknown capability "${cap}"`);
  }
  if (item.use) validateItemUse(item);
}

function validateItemUse(item: RawItem): void {
  const where = `items.yaml:${item.id}.use`;
  const u = item.use;
  if (!u) return;
  if (!u.kind || !useKinds.has(u.kind)) {
    fail(where, `unknown use.kind "${u.kind}" (known: ${[...useKinds].join(", ")})`);
    return;
  }
  if (u.kind === "light_fire") {
    if (!Array.isArray(u.consumesAny) || u.consumesAny.length === 0) {
      fail(where, "light_fire requires consumesAny: [...]");
    }
    for (const c of u.consumesAny ?? []) {
      if (!c.item || !itemIds.has(c.item)) fail(where, `consumesAny refs unknown item "${c.item}"`);
    }
  }
  if (u.kind === "cook_on_fire") {
    if (!u.produces || !itemIds.has(u.produces)) fail(where, `produces refs unknown item "${u.produces}"`);
    if (!u.burns || !itemIds.has(u.burns)) fail(where, `burns refs unknown item "${u.burns}"`);
  }
}
for (const m of monsters) {
  if (!m.id || !m.name) fail("monsters.yaml", `monster ${m.id ?? "?"} missing id/name`);
  for (const drop of m.drops ?? []) {
    if (!drop.item || !itemIds.has(drop.item)) fail(`monsters.yaml:${m.id}`, `drop refs unknown item "${drop.item}"`);
  }
}
for (const t of treeTypes) {
  const itemId = t["itemId"];
  if (typeof itemId !== "string" || !itemIds.has(itemId)) fail(`tree-types.yaml:${t.id}`, `itemId refs unknown item "${String(itemId)}"`);
}
for (const n of npcs) {
  if (!n.id || !n.name) fail("npcs.yaml", `npc ${n.id ?? "?"} missing id/name`);
}
for (const s of spawns.monsters ?? []) {
  if (!s.type || !monsterIds.has(s.type)) fail("spawns.yaml", `monster spawn refs unknown type "${s.type}"`);
  if (!s.zone || !zoneIds.has(s.zone)) fail("spawns.yaml", `monster spawn refs unknown zone "${s.zone}"`);
}
for (const t of spawns.trees ?? []) {
  if (!t.type || !treeTypeIds.has(t.type)) fail("spawns.yaml", `tree spawn refs unknown type "${t.type}"`);
}
for (const m of miningNodes) {
  if (m.kind != null && !oreKinds.has(m.kind)) {
    fail(`mining-nodes.yaml:${m.id ?? "?"}`, `unknown kind "${m.kind}" (known: ${[...oreKinds].join(", ")})`);
  }
}
for (const h of herbNodes) {
  if (!h.id) fail("herb-nodes.yaml", "herb node missing id");
  if (!h.at || !h.approach) fail(`herb-nodes.yaml:${h.id ?? "?"}`, "missing at/approach");
}

const questIds = new Set<string>();
for (const q of quests) {
  validateQuest(q);
}

function validateQuest(q: RawQuest): void {
  const where = q.__file;
  if (!q.id) { fail(where, "missing id"); return; }
  if (questIds.has(q.id)) fail(where, `duplicate quest id "${q.id}"`);
  questIds.add(q.id);
  if (!q.title) fail(`${where}:${q.id}`, "missing title");

  if (!q.giver) fail(`${where}:${q.id}`, "missing giver");
  else {
    const role = npcIdsByRole.get(q.giver);
    if (!role) fail(`${where}:${q.id}`, `giver refs unknown npc "${q.giver}"`);
    else if (role !== "quest") fail(`${where}:${q.id}`, `giver "${q.giver}" has role "${role}", expected "quest"`);
  }

  const o = q.objective ?? {};
  if (!o.kind || !questKinds.has(o.kind)) {
    fail(`${where}:${q.id}.objective`, `unknown kind "${o.kind}" (known: ${[...questKinds].join(", ")})`);
  } else if (!Number.isInteger(o.count) || (o.count ?? 0) < 1) {
    fail(`${where}:${q.id}.objective`, "count must be a positive integer");
  } else if (o.kind === "kill") {
    if (!o.in || !zoneIds.has(o.in)) fail(`${where}:${q.id}.objective`, `unknown zone "${o.in}"`);
    if (!Array.isArray(o.monsters) || o.monsters.length === 0) {
      fail(`${where}:${q.id}.objective`, "kill quests require monsters: [...]");
    } else {
      for (const m of o.monsters) {
        if (!monsterIds.has(m)) fail(`${where}:${q.id}.objective`, `monsters refs unknown type "${m}"`);
      }
    }
  } else if (o.kind === "gather" || o.kind === "fetch") {
    if (!o.item || !itemIds.has(o.item)) fail(`${where}:${q.id}.objective`, `item refs unknown item "${o.item}"`);
  }

  const r = q.reward ?? {};
  if (!Number.isFinite(r.gold) || (r.gold ?? -1) < 0) fail(`${where}:${q.id}.reward`, "gold must be a non-negative number");
  if (!Number.isFinite(r.xp) || (r.xp ?? -1) < 0) fail(`${where}:${q.id}.reward`, "xp must be a non-negative number");

  const d = q.dialogue ?? {};
  for (const phase of requiredQuestPhases) {
    const lines = d[phase];
    if (!Array.isArray(lines) || lines.length === 0) {
      fail(`${where}:${q.id}.dialogue`, `missing or empty phase "${phase}"`);
      continue;
    }
    lines.forEach((line, i) => validateLine(line, `${where}:${q.id}.dialogue.${phase}[${i}]`));
  }
  if (d["missingItems"]) {
    if (!Array.isArray(d["missingItems"]) || d["missingItems"].length === 0) {
      fail(`${where}:${q.id}.dialogue`, "missingItems must be a non-empty array if present");
    } else {
      d["missingItems"].forEach((line, i) => validateLine(line, `${where}:${q.id}.dialogue.missingItems[${i}]`));
    }
  }
  if ((o.kind === "gather" || o.kind === "fetch") && !d["missingItems"]) {
    fail(`${where}:${q.id}.dialogue`, `${o.kind} quests must define dialogue.missingItems`);
  }
}

function validateLine(line: unknown, where: string): void {
  if (!line || typeof line !== "object") { fail(where, "line must be an object"); return; }
  const keys = Object.keys(line);
  if (keys.length !== 1) { fail(where, `line must have exactly one key (npc or player), got: ${keys.join(", ")}`); return; }
  const speaker = keys[0]!;
  if (speaker !== "npc" && speaker !== "player") fail(where, `unknown speaker "${speaker}" (use npc or player)`);
  if (typeof (line as Record<string, unknown>)[speaker] !== "string") fail(where, "line text must be a string");
}

if (errors.length) {
  console.error("Content validation failed:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

const ITEMS = Object.fromEntries(
  items.map((i) => {
    const entry: Record<string, unknown> = { id: i.id, label: i.label, icon: i.icon ?? null, iconUrl: i.iconUrl ?? null };
    if (i.stackable != null) entry["stackable"] = i.stackable;
    if (i.tags) entry["tags"] = i.tags;
    if (i.capabilities) entry["capabilities"] = i.capabilities;
    if (i.weight != null) entry["weight"] = i.weight;
    if (i.use) entry["use"] = i.use;
    return [i.id, entry];
  })
);
const MONSTERS = Object.fromEntries(
  monsters.map((m) => {
    const entry: Record<string, unknown> = {
      name: m.name, maxHp: m.maxHp, speed: m.speed, damage: m.damage, attackMs: m.attackMs,
      xp: m.xp, gold: m.gold, aggro: m.aggro, range: m.range
    };
    if (m.ranged) entry["ranged"] = true;
    if (m.slowPct != null) entry["slowPct"] = m.slowPct;
    if (m.slowMs != null) entry["slowMs"] = m.slowMs;
    if (m.weakenPct != null) entry["weakenPct"] = m.weakenPct;
    if (m.weakenMs != null) entry["weakenMs"] = m.weakenMs;
    if (m.armor != null) entry["armor"] = m.armor;
    if (m.pack) entry["pack"] = true;
    if (m.burrow) entry["burrow"] = true;
    if (m.stunMs != null) entry["stunMs"] = m.stunMs;
    return [m.id, entry];
  })
);
const QUEST_DROPS: Record<string, { itemId: string; chance: number }> = {};
for (const m of monsters) {
  for (const drop of m.drops ?? []) {
    if (m.id && drop.item != null && drop.chance != null) QUEST_DROPS[m.id] = { itemId: drop.item, chance: drop.chance };
  }
}
const TREE_TYPES = Object.fromEntries(
  treeTypes.map((t) => {
    const { id, ...rest } = t;
    return [id, rest];
  })
);
const NPCS = npcs.map((n) => ({
  id: n.id,
  name: n.name,
  role: n.role,
  floor: n.at?.floor,
  x: n.at?.x,
  y: n.at?.y,
  dialogue: n.idleDialogue ?? ""
}));
const SHOP = shop;
const MONSTER_SPAWNS = (spawns.monsters ?? []).map((s) => ({
  type: s.type,
  floor: s.at?.floor,
  x: s.at?.x,
  y: s.at?.y,
  zone: s.zone
}));
const COMPOSED_TREE_NODES = (spawns.trees ?? []).map((t) => ({
  type: t.type,
  floor: t.at?.floor,
  x: t.at?.x,
  y: t.at?.y
}));
const FISHING_NODES = fishingNodes.map((f) => ({
  id: f.id,
  floor: f.at?.floor,
  x: f.at?.x,
  y: f.at?.y,
  approachX: f.approach?.x,
  approachY: f.approach?.y
}));
const MINING_NODES = miningNodes.map((m) => ({
  id: m.id,
  kind: m.kind ?? "copper",
  floor: m.at?.floor,
  x: m.at?.x,
  y: m.at?.y,
  approachX: m.approach?.x,
  approachY: m.approach?.y
}));
const HERB_NODES = herbNodes.map((h) => {
  const entry: Record<string, unknown> = {
    id: h.id,
    floor: h.at?.floor,
    x: h.at?.x,
    y: h.at?.y,
    approachX: h.approach?.x,
    approachY: h.approach?.y,
    label: h.label ?? "Wild Herbs"
  };
  if (h.requiredLevel != null) entry["requiredLevel"] = h.requiredLevel;
  if (h.xp != null) entry["xp"] = h.xp;
  if (h.item != null) entry["item"] = h.item;
  return entry;
});
const QUESTS = Object.fromEntries(
  quests.map((q) => [
    q.id,
    {
      id: q.id,
      title: q.title,
      giverId: q.giver,
      kind: q.objective?.kind,
      targetCount: q.objective?.count,
      zone: q.objective?.in ?? null,
      targetTypes: Array.isArray(q.objective?.monsters) ? [...q.objective.monsters] : [],
      itemId: q.objective?.item ?? null,
      rewardGold: q.reward?.gold,
      rewardXp: q.reward?.xp,
      dialogue: q.dialogue
    }
  ])
);

const TYPE_ANNOTATIONS: Record<string, string> = {
  ITEMS: "Record<string, Item>",
  MONSTERS: "Record<string, Monster>",
  QUEST_DROPS: "Record<string, QuestDrop>",
  TREE_TYPES: "Record<string, TreeType>",
  NPCS: "Npc[]",
  SHOP: "Record<string, ShopEntry>",
  MONSTER_SPAWNS: "MonsterSpawn[]",
  COMPOSED_TREE_NODES: "TreeNode[]",
  FISHING_NODES: "FishingNode[]",
  MINING_NODES: "MiningNode[]",
  HERB_NODES: "HerbNode[]",
  QUESTS: "Record<string, Quest>"
};

const banner = `// AUTO-GENERATED by scripts/build-content.ts — DO NOT EDIT BY HAND.
// Edit YAML under content/ and rerun \`npm run content:build\`.
import type {
  FishingNode,
  HerbNode,
  Item,
  MiningNode,
  Monster,
  MonsterSpawn,
  Npc,
  Quest,
  QuestDrop,
  ShopEntry,
  TreeNode,
  TreeType
} from "../content-types.ts";
`;

const body = (
  [
    ["ITEMS", ITEMS],
    ["MONSTERS", MONSTERS],
    ["QUEST_DROPS", QUEST_DROPS],
    ["TREE_TYPES", TREE_TYPES],
    ["NPCS", NPCS],
    ["SHOP", SHOP],
    ["MONSTER_SPAWNS", MONSTER_SPAWNS],
    ["COMPOSED_TREE_NODES", COMPOSED_TREE_NODES],
    ["FISHING_NODES", FISHING_NODES],
    ["MINING_NODES", MINING_NODES],
    ["HERB_NODES", HERB_NODES],
    ["QUESTS", QUESTS]
  ] as const
)
  .map(([name, value]) => `export const ${name}: ${TYPE_ANNOTATIONS[name]} = ${JSON.stringify(value, null, 2)};\n`)
  .join("\n");

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner + "\n" + body);
console.log(`Wrote ${OUT}`);
