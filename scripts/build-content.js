// Reads content/*.yaml, validates references, emits src/generated/catalog.js.
// Run before the server boots and before vite bundles the client. See package.json.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONTENT = join(ROOT, "content");
const QUESTS_DIR = join(CONTENT, "quests");
const OUT = join(ROOT, "src", "generated", "catalog.js");

const errors = [];
const fail = (where, msg) => errors.push(`[${where}] ${msg}`);

function load(file) {
  const path = join(CONTENT, file);
  try {
    return yaml.load(readFileSync(path, "utf8"));
  } catch (err) {
    fail(file, err.message);
    return null;
  }
}

const items = load("items.yaml") ?? [];
const monsters = load("monsters.yaml") ?? [];
const npcs = load("npcs.yaml") ?? [];
const treeTypes = load("tree-types.yaml") ?? [];
const fishingNodes = load("fishing-nodes.yaml") ?? [];
const shop = load("shop.yaml") ?? {};
const spawns = load("spawns.yaml") ?? {};
const quests = loadQuests();

const itemIds = new Set(items.map((i) => i.id));
const monsterIds = new Set(monsters.map((m) => m.id));
const treeTypeIds = new Set(treeTypes.map((t) => t.id));
const npcIdsByRole = new Map(npcs.map((n) => [n.id, n.role]));
const zoneIds = new Set(["southTown", "cemetery", "crypt", "woods", "northTown"]);
const useKinds = new Set(["eat", "light_fire", "cook_on_fire", "drink_potion"]);
const capabilityIds = new Set(["chop_tree", "fish"]);
const questKinds = new Set(["kill", "gather", "fetch"]);
const requiredQuestPhases = ["intro", "progress", "turnIn", "claimed"];

function loadQuests() {
  let files;
  try {
    files = readdirSync(QUESTS_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    fail("quests/", err.message);
    return [];
  }
  return files.map((file) => {
    const data = load(join("quests", file));
    return data ? { ...data, __file: `quests/${file}` } : null;
  }).filter(Boolean);
}

for (const item of items) {
  if (!item.id) fail("items.yaml", "item missing id");
  if (!item.label) fail(`items.yaml:${item.id}`, "missing label");
  for (const cap of item.capabilities ?? []) {
    if (!capabilityIds.has(cap)) fail(`items.yaml:${item.id}`, `unknown capability "${cap}"`);
  }
  if (item.use) validateItemUse(item);
}

function validateItemUse(item) {
  const where = `items.yaml:${item.id}.use`;
  const u = item.use;
  if (!useKinds.has(u.kind)) {
    fail(where, `unknown use.kind "${u.kind}" (known: ${[...useKinds].join(", ")})`);
    return;
  }
  if (u.kind === "light_fire") {
    if (!Array.isArray(u.consumesAny) || u.consumesAny.length === 0) {
      fail(where, "light_fire requires consumesAny: [...]");
    }
    for (const c of u.consumesAny ?? []) {
      if (!itemIds.has(c.item)) fail(where, `consumesAny refs unknown item "${c.item}"`);
    }
  }
  if (u.kind === "cook_on_fire") {
    if (!itemIds.has(u.produces)) fail(where, `produces refs unknown item "${u.produces}"`);
    if (!itemIds.has(u.burns)) fail(where, `burns refs unknown item "${u.burns}"`);
  }
}
for (const m of monsters) {
  if (!m.id || !m.name) fail("monsters.yaml", `monster ${m.id ?? "?"} missing id/name`);
  for (const drop of m.drops ?? []) {
    if (!itemIds.has(drop.item)) fail(`monsters.yaml:${m.id}`, `drop refs unknown item "${drop.item}"`);
  }
}
for (const t of treeTypes) {
  if (!itemIds.has(t.itemId)) fail(`tree-types.yaml:${t.id}`, `itemId refs unknown item "${t.itemId}"`);
}
for (const n of npcs) {
  if (!n.id || !n.name) fail("npcs.yaml", `npc ${n.id ?? "?"} missing id/name`);
}
for (const s of spawns.monsters ?? []) {
  if (!monsterIds.has(s.type)) fail("spawns.yaml", `monster spawn refs unknown type "${s.type}"`);
  if (!zoneIds.has(s.zone)) fail("spawns.yaml", `monster spawn refs unknown zone "${s.zone}"`);
}
for (const t of spawns.trees ?? []) {
  if (!treeTypeIds.has(t.type)) fail("spawns.yaml", `tree spawn refs unknown type "${t.type}"`);
}

const questIds = new Set();
for (const q of quests) {
  validateQuest(q);
}

function validateQuest(q) {
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
  if (!questKinds.has(o.kind)) {
    fail(`${where}:${q.id}.objective`, `unknown kind "${o.kind}" (known: ${[...questKinds].join(", ")})`);
  } else if (!Number.isInteger(o.count) || o.count < 1) {
    fail(`${where}:${q.id}.objective`, "count must be a positive integer");
  } else if (o.kind === "kill") {
    if (!zoneIds.has(o.in)) fail(`${where}:${q.id}.objective`, `unknown zone "${o.in}"`);
    if (!Array.isArray(o.monsters) || o.monsters.length === 0) {
      fail(`${where}:${q.id}.objective`, "kill quests require monsters: [...]");
    } else {
      for (const m of o.monsters) {
        if (!monsterIds.has(m)) fail(`${where}:${q.id}.objective`, `monsters refs unknown type "${m}"`);
      }
    }
  } else if (o.kind === "gather" || o.kind === "fetch") {
    if (!itemIds.has(o.item)) fail(`${where}:${q.id}.objective`, `item refs unknown item "${o.item}"`);
  }

  const r = q.reward ?? {};
  if (!Number.isFinite(r.gold) || r.gold < 0) fail(`${where}:${q.id}.reward`, "gold must be a non-negative number");
  if (!Number.isFinite(r.xp) || r.xp < 0) fail(`${where}:${q.id}.reward`, "xp must be a non-negative number");

  const d = q.dialogue ?? {};
  for (const phase of requiredQuestPhases) {
    if (!Array.isArray(d[phase]) || d[phase].length === 0) {
      fail(`${where}:${q.id}.dialogue`, `missing or empty phase "${phase}"`);
      continue;
    }
    d[phase].forEach((line, i) => validateLine(line, `${where}:${q.id}.dialogue.${phase}[${i}]`));
  }
  if (d.missingItems) {
    if (!Array.isArray(d.missingItems) || d.missingItems.length === 0) {
      fail(`${where}:${q.id}.dialogue`, "missingItems must be a non-empty array if present");
    } else {
      d.missingItems.forEach((line, i) => validateLine(line, `${where}:${q.id}.dialogue.missingItems[${i}]`));
    }
  }
  if ((o.kind === "gather" || o.kind === "fetch") && !d.missingItems) {
    fail(`${where}:${q.id}.dialogue`, `${o.kind} quests must define dialogue.missingItems`);
  }
}

function validateLine(line, where) {
  if (!line || typeof line !== "object") { fail(where, "line must be an object"); return; }
  const keys = Object.keys(line);
  if (keys.length !== 1) { fail(where, `line must have exactly one key (npc or player), got: ${keys.join(", ")}`); return; }
  const speaker = keys[0];
  if (speaker !== "npc" && speaker !== "player") fail(where, `unknown speaker "${speaker}" (use npc or player)`);
  if (typeof line[speaker] !== "string") fail(where, "line text must be a string");
}

if (errors.length) {
  console.error("Content validation failed:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

const ITEMS = Object.fromEntries(
  items.map((i) => {
    const entry = { id: i.id, label: i.label, icon: i.icon ?? null, iconUrl: i.iconUrl ?? null };
    if (i.stackable != null) entry.stackable = i.stackable;
    if (i.tags) entry.tags = i.tags;
    if (i.capabilities) entry.capabilities = i.capabilities;
    if (i.use) entry.use = i.use;
    return [i.id, entry];
  })
);
const MONSTERS = Object.fromEntries(
  monsters.map((m) => [
    m.id,
    { name: m.name, maxHp: m.maxHp, speed: m.speed, damage: m.damage, attackMs: m.attackMs, xp: m.xp, gold: m.gold, aggro: m.aggro, range: m.range }
  ])
);
const QUEST_DROPS = {};
for (const m of monsters) {
  for (const drop of m.drops ?? []) {
    QUEST_DROPS[m.id] = { itemId: drop.item, chance: drop.chance };
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
  floor: n.at.floor,
  x: n.at.x,
  y: n.at.y,
  dialogue: n.idleDialogue ?? ""
}));
const SHOP = shop;
const MONSTER_SPAWNS = (spawns.monsters ?? []).map((s) => ({
  type: s.type,
  floor: s.at.floor,
  x: s.at.x,
  y: s.at.y,
  zone: s.zone
}));
const COMPOSED_TREE_NODES = (spawns.trees ?? []).map((t) => ({
  type: t.type,
  floor: t.at.floor,
  x: t.at.x,
  y: t.at.y
}));
const FISHING_NODES = fishingNodes.map((f) => ({
  id: f.id,
  floor: f.at.floor,
  x: f.at.x,
  y: f.at.y,
  approachX: f.approach.x,
  approachY: f.approach.y
}));
const QUESTS = Object.fromEntries(
  quests.map((q) => [
    q.id,
    {
      id: q.id,
      title: q.title,
      giverId: q.giver,
      kind: q.objective.kind,
      targetCount: q.objective.count,
      zone: q.objective.in ?? null,
      targetTypes: Array.isArray(q.objective.monsters) ? [...q.objective.monsters] : [],
      itemId: q.objective.item ?? null,
      rewardGold: q.reward.gold,
      rewardXp: q.reward.xp,
      dialogue: q.dialogue
    }
  ])
);

const banner = `// AUTO-GENERATED by scripts/build-content.js — DO NOT EDIT BY HAND.
// Edit YAML under content/ and rerun \`npm run content:build\`.
`;

const body = [
  ["ITEMS", ITEMS],
  ["MONSTERS", MONSTERS],
  ["QUEST_DROPS", QUEST_DROPS],
  ["TREE_TYPES", TREE_TYPES],
  ["NPCS", NPCS],
  ["SHOP", SHOP],
  ["MONSTER_SPAWNS", MONSTER_SPAWNS],
  ["COMPOSED_TREE_NODES", COMPOSED_TREE_NODES],
  ["FISHING_NODES", FISHING_NODES],
  ["QUESTS", QUESTS]
]
  .map(([name, value]) => `export const ${name} = ${JSON.stringify(value, null, 2)};\n`)
  .join("\n");

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner + "\n" + body);
console.log(`Wrote ${OUT}`);
