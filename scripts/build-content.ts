// Reads content/*.yaml, validates references, emits src/generated/catalog.ts.
// Run before the server boots and before vite bundles the client. See package.json.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type { AbilityEffect, AbilitySpec, AbilityTargeting, CombatAnimationSpec, DialogueLine, Range } from "../src/content-types.ts";

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
  value?: number;
  weight?: number;
  use?: RawUse;
}

interface RawMonster {
  id?: string;
  name?: string;
  description?: string;
  role?: string;
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
  projectileAnimation?: string;
  armor?: number;
  isUnholy?: boolean;
  faithXp?: number;
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
  kind?: string;
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

interface RawAbility extends Partial<AbilitySpec> {
  id?: string;
  label?: string;
  description?: string;
  cooldownMs?: number;
  durationMs?: number;
  targeting?: AbilityTargeting;
  effects?: AbilityEffect[];
}

interface RawCombatAnimation extends Partial<CombatAnimationSpec> {
  id?: string;
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
// Editor-authored spawn overlay (content/spawns.editor.yaml). OPTIONAL — the
// stage editor's Spawns layer writes ONLY its own placements + suppressions
// here, so the hand-authored, heavily-commented spawns.yaml is never rewritten.
// Merged below: base spawns minus any suppressed tile, plus the overlay's own
// placements. Missing file → no-op.
interface RawSpawnOverlay {
  monsters?: RawSpawns["monsters"];
  removed?: Array<{ floor?: number; x?: number; y?: number }>;
}
const spawnsOverlay: RawSpawnOverlay = existsSync(join(CONTENT, "spawns.editor.yaml"))
  ? load<RawSpawnOverlay>("spawns.editor.yaml") ?? {}
  : {};
const removedSpawnKeys = new Set(
  (spawnsOverlay.removed ?? []).map((r) => `${r.floor},${r.x},${r.y}`)
);
const mergedMonsterSpawns = [
  ...(spawns.monsters ?? []).filter(
    (s) => !removedSpawnKeys.has(`${s.at?.floor},${s.at?.x},${s.at?.y}`)
  ),
  ...(spawnsOverlay.monsters ?? [])
];
const abilities = load<RawAbility[]>("abilities.yaml") ?? [];
const combatAnimations = load<RawCombatAnimation[]>("combat-animations.yaml") ?? [];
const quests = loadQuests();

const itemIds = new Set(items.map((i) => i.id));
const monsterIds = new Set(monsters.map((m) => m.id));
const treeTypeIds = new Set(treeTypes.map((t) => t.id));
const npcIdsByRole = new Map(npcs.map((n) => [n.id, n.role]));
const zoneIds = new Set(["southTown", "cemetery", "crypt", "woods", "northTown", "marsh", "badlands", "desert", "beach", "jungle", "deepMine"]);
const useKinds = new Set(["eat", "light_fire", "cook_on_fire", "drink_potion"]);
const capabilityIds = new Set(["chop_tree", "fish", "mine", "ranged"]);
const skillIds = new Set(["attack", "defense", "magic", "woodcutting", "fishing", "mining", "firemaking", "cooking", "agility", "alchemy", "ranged", "foraging", "smithing", "faith"]);
const questKinds = new Set(["kill", "gather", "fetch"]);
const oreKinds = new Set(["copper", "tin", "iron", "coal", "silver", "gold", "mithril", "adamant"]);
const fishKinds = new Set(["fish", "trout", "pike", "bass", "shark"]);
const abilityGuards = new Set(["requireBelowMaxHp"]);
const abilityTargetModes = new Set(["self", "enemy", "aoe_self", "aoe_front", "aoe_point", "line_front", "dash"]);
const abilityCategories = new Set(["class", "spell", "miracle"]);
const abilityEffectKinds = new Set(["buff_self", "damage", "debuff_enemy", "heal", "heal_over_time", "dash", "cleanse_self", "shield_self", "knockback", "gain_favor", "teleport", "taunt"]);
const abilityBuffs = new Set(["sprint", "ironClad", "fleetFoot", "second_wind", "luminescence", "zephyrStep", "earthSense", "conviction"]);
const abilityCleanseStatuses = new Set(["slow", "weaken"]);
const abilitySelfCleanseStatuses = new Set(["slow", "weaken", "stun"]);
const abilityDebuffStatuses = new Set(["snare", "slow", "burn", "freeze", "inaccurate"]);
const abilityDamageTypes = new Set(["physical", "magic", "holy"]);
const abilityConditionalBonusWhen = new Set(["behindTarget"]);
const abilityAnimationKinds = new Set(["slash_arc", "self_pulse", "ground_burst", "projectile_trail", "impact_ring"]);
const abilityAnimationAttach = new Set(["self", "target", "origin", "path"]);
const combatAnimationKinds = new Set(["melee_arc", "projectile", "impact", "ground", "self", "trail"]);
const combatAnimationRenderers = new Set([
  "slash_arc",
  "arrow",
  "arrow_heavy",
  "arrow_poison",
  "arcane",
  "arcane_lance",
  "frost_shard",
  "fire_orb",
  "curse_bolt",
  "flask",
  "spit",
  "fire_missile",
  "ice_missile",
  "impact_ring",
  "fire_burst",
  "ice_burst",
  "ground_burst",
  "self_pulse",
  "projectile_trail"
]);
const combatAnimationSources = new Set(["effects", "primitive", "sheet"]);
const combatAnimationAnchors = new Set(["caster", "target", "path", "ground", "self"]);
const combatAnimationOrientations = new Set(["rotate_to_target", "directional_4", "directional_8", "screen_fixed"]);
const combatAnimationZ = new Set(["below_actor", "actor", "above_actor"]);
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
for (const s of mergedMonsterSpawns) {
  if (!s.type || !monsterIds.has(s.type)) fail("spawns", `monster spawn refs unknown type "${s.type}"`);
  if (!s.zone || !zoneIds.has(s.zone)) fail("spawns", `monster spawn refs unknown zone "${s.zone}"`);
}
for (const t of spawns.trees ?? []) {
  if (!t.type || !treeTypeIds.has(t.type)) fail("spawns.yaml", `tree spawn refs unknown type "${t.type}"`);
}
for (const m of miningNodes) {
  if (m.kind != null && !oreKinds.has(m.kind)) {
    fail(`mining-nodes.yaml:${m.id ?? "?"}`, `unknown kind "${m.kind}" (known: ${[...oreKinds].join(", ")})`);
  }
}
for (const f of fishingNodes) {
  if (f.kind != null && !fishKinds.has(f.kind)) {
    fail(`fishing-nodes.yaml:${f.id ?? "?"}`, `unknown kind "${f.kind}" (known: ${[...fishKinds].join(", ")})`);
  }
}
for (const h of herbNodes) {
  if (!h.id) fail("herb-nodes.yaml", "herb node missing id");
  if (!h.at || !h.approach) fail(`herb-nodes.yaml:${h.id ?? "?"}`, "missing at/approach");
  if (h.item != null && !itemIds.has(h.item)) fail(`herb-nodes.yaml:${h.id ?? "?"}`, `item refs unknown item "${h.item}"`);
}

const abilityIds = new Set<string>();
const combatAnimationIds = new Set<string>();
for (const animation of combatAnimations) {
  validateCombatAnimation(animation);
}
for (const a of abilities) {
  validateAbility(a);
}

function validateCombatAnimation(animation: RawCombatAnimation): void {
  const where = `combat-animations.yaml:${animation.id ?? "?"}`;
  if (!animation.id) { fail("combat-animations.yaml", "combat animation missing id"); return; }
  if (combatAnimationIds.has(animation.id)) fail(where, `duplicate combat animation id "${animation.id}"`);
  combatAnimationIds.add(animation.id);
  if (!combatAnimationKinds.has(animation.kind ?? "")) fail(where, `unknown kind "${animation.kind}"`);
  if (!combatAnimationRenderers.has(animation.renderer ?? "")) fail(where, `unknown renderer "${animation.renderer}"`);
  if (!combatAnimationSources.has(animation.source ?? "")) fail(where, `unknown source "${animation.source}"`);
  if (!Number.isInteger(animation.frames) || (animation.frames ?? 0) < 1) fail(where, "frames must be a positive integer");
  if (!positiveNumber(animation.frameMs)) fail(where, "frameMs must be positive");
  if (!combatAnimationAnchors.has(animation.anchor ?? "")) fail(where, `unknown anchor "${animation.anchor}"`);
  if (!combatAnimationOrientations.has(animation.orientation ?? "")) fail(where, `unknown orientation "${animation.orientation}"`);
  if (!combatAnimationZ.has(animation.z ?? "")) fail(where, `unknown z "${animation.z}"`);
  if (animation.scale != null && !positiveNumber(animation.scale)) fail(where, "scale must be positive when present");
  if (animation.hitFrame != null && (!Number.isInteger(animation.hitFrame) || animation.hitFrame < 0)) fail(where, "hitFrame must be a non-negative integer when present");
}

for (const animation of combatAnimations) {
  if (animation.impact && !combatAnimationIds.has(animation.impact)) {
    fail(`combat-animations.yaml:${animation.id}`, `impact refs unknown combat animation "${animation.impact}"`);
  }
}
for (const m of monsters) {
  if (m.projectileAnimation && !combatAnimationIds.has(m.projectileAnimation)) {
    fail(`monsters.yaml:${m.id ?? "?"}`, `projectileAnimation refs unknown combat animation "${m.projectileAnimation}"`);
  }
}

function validateAbility(a: RawAbility): void {
  const where = `abilities.yaml:${a.id ?? "?"}`;
  if (!a.id) { fail("abilities.yaml", "ability missing id"); return; }
  if (abilityIds.has(a.id)) fail(where, `duplicate ability id "${a.id}"`);
  abilityIds.add(a.id);
  if (!a.label) fail(where, "missing label");
  if (!a.description) fail(where, "missing description");
  if (a.category != null && !abilityCategories.has(a.category)) fail(where, `unknown category "${a.category}"`);
  if (a.magicLevel != null && (!Number.isInteger(a.magicLevel) || a.magicLevel < 1)) fail(where, "magicLevel must be a positive integer when present");
  if (a.category === "spell" && a.magicLevel == null) fail(where, "spell abilities require magicLevel");
  if (a.faithLevel != null && (!Number.isInteger(a.faithLevel) || a.faithLevel < 1)) fail(where, "faithLevel must be a positive integer when present");
  if (a.category === "miracle" && a.faithLevel == null) fail(where, "miracle abilities require faithLevel");
  if (!Number.isFinite(a.cooldownMs) || (a.cooldownMs ?? -1) < 0) fail(where, "cooldownMs must be a non-negative number");
  if (!Number.isFinite(a.durationMs) || (a.durationMs ?? -1) < 0) fail(where, "durationMs must be a non-negative number");
  for (const guard of a.guards ?? []) {
    if (!abilityGuards.has(guard)) fail(`${where}.guards`, `unknown guard "${guard}"`);
  }
  if (!a.targeting) fail(where, "missing targeting");
  else validateAbilityTargeting(a.targeting, `${where}.targeting`);
  if (!Array.isArray(a.effects) || a.effects.length === 0) fail(where, "missing or empty effects");
  else a.effects.forEach((effect, i) => validateAbilityEffect(effect, `${where}.effects[${i}]`));
  if (a.skill != null && !skillIds.has(a.skill)) fail(where, `unknown skill "${a.skill}"`);
  if (a.projectile?.id != null && !combatAnimationIds.has(a.projectile.id)) {
    fail(`${where}.projectile`, `id refs unknown combat animation "${a.projectile.id}"`);
  }
  if (a.animation) validateAbilityAnimation(a, where);
}

function validateAbilityTargeting(targeting: AbilityTargeting, where: string): void {
  if (!abilityTargetModes.has(targeting.mode)) {
    fail(where, `unknown mode "${targeting.mode}"`);
    return;
  }
  if (targeting.mode === "aoe_self" && !positiveNumber(targeting.radius)) fail(where, "aoe_self requires positive radius");
  if (targeting.mode === "aoe_front") {
    if (!positiveNumber(targeting.offset)) fail(where, "aoe_front requires positive offset");
    if (!positiveNumber(targeting.radius)) fail(where, "aoe_front requires positive radius");
  }
  if (targeting.mode === "aoe_point") {
    if (!positiveNumber(targeting.offset)) fail(where, "aoe_point requires positive offset");
    if (!positiveNumber(targeting.radius)) fail(where, "aoe_point requires positive radius");
    if (targeting.range != null && !positiveNumber(targeting.range)) fail(where, "range must be positive when present");
  }
  if (targeting.mode === "line_front") {
    if (!positiveNumber(targeting.tiles)) fail(where, "line_front requires positive tiles");
    if (targeting.width != null && !positiveNumber(targeting.width)) fail(where, "line_front width must be positive when present");
  }
  if (targeting.mode === "dash" && !positiveNumber(targeting.tiles)) fail(where, "dash requires positive tiles");
  if (targeting.mode === "enemy" && targeting.range != null && !positiveNumber(targeting.range)) fail(where, "range must be positive when present");
}

function validateAbilityEffect(effect: AbilityEffect, where: string): void {
  if (!abilityEffectKinds.has(effect.kind)) {
    fail(where, `unknown kind "${effect.kind}"`);
    return;
  }
  if (effect.kind === "buff_self") {
    if (!abilityBuffs.has(effect.buff)) fail(where, `unknown buff "${effect.buff}"`);
    for (const status of effect.cleanse ?? []) {
      if (!abilityCleanseStatuses.has(status)) fail(where, `unknown cleanse status "${status}"`);
    }
  } else if (effect.kind === "damage") {
    if (effect.skill != null && !skillIds.has(effect.skill)) fail(where, `unknown skill "${effect.skill}"`);
    if (effect.damageType != null && !abilityDamageTypes.has(effect.damageType)) fail(where, `unknown damageType "${effect.damageType}"`);
    if (effect.conditionalBonus) {
      if (!abilityConditionalBonusWhen.has(effect.conditionalBonus.when)) fail(where, `unknown conditionalBonus.when "${effect.conditionalBonus.when}"`);
      if (!positiveNumber(effect.conditionalBonus.multiply)) fail(where, "conditionalBonus.multiply must be positive");
    }
  } else if (effect.kind === "debuff_enemy") {
    if (!abilityDebuffStatuses.has(effect.status)) fail(where, `unknown status "${effect.status}"`);
    if (effect.slowMultiplier != null && !positiveNumber(effect.slowMultiplier)) fail(where, "slowMultiplier must be positive when present");
  } else if (effect.kind === "heal") {
    if (effect.scaleSkill != null && !skillIds.has(effect.scaleSkill)) fail(where, `unknown scaleSkill "${effect.scaleSkill}"`);
  } else if (effect.kind === "heal_over_time") {
    if (!abilityBuffs.has(effect.buff)) fail(where, `unknown buff "${effect.buff}"`);
  } else if (effect.kind === "cleanse_self") {
    for (const status of effect.statuses ?? []) {
      if (!abilitySelfCleanseStatuses.has(status)) fail(where, `unknown cleanse_self status "${status}"`);
    }
  } else if (effect.kind === "shield_self") {
    if (!Number.isFinite(effect.base) || effect.base < 0) fail(where, "shield_self.base must be non-negative");
    if (effect.maxManaScale != null && !positiveNumber(effect.maxManaScale)) fail(where, "shield_self.maxManaScale must be positive when present");
  } else if (effect.kind === "knockback") {
    if (!positiveNumber(effect.tiles)) fail(where, "knockback.tiles must be positive");
  } else if (effect.kind === "teleport") {
    if (effect.destination !== "waystone") fail(where, `unknown teleport destination "${effect.destination}"`);
  }
}

function validateAbilityAnimation(a: RawAbility, where: string): void {
  const animation = a.animation;
  if (!animation) return;
  if (animation.id != null && !combatAnimationIds.has(animation.id)) fail(where, `animation.id refs unknown combat animation "${animation.id}"`);
  if (!abilityAnimationKinds.has(animation.kind)) fail(where, `unknown animation.kind "${animation.kind}"`);
  if (!abilityAnimationAttach.has(animation.attach)) fail(where, `unknown animation.attach "${animation.attach}"`);
  if (animation.scale != null && !positiveNumber(animation.scale)) fail(where, "animation.scale must be positive when present");
  if (animation.durationMs != null && (!Number.isFinite(animation.durationMs) || animation.durationMs < 0)) {
    fail(where, "animation.durationMs must be non-negative when present");
  }
}

function positiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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
    if (i.value != null) entry["value"] = i.value;
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
    if (m.description) entry["description"] = m.description;
    // Explicit encounter role (content authority). Without this the engine falls
    // back to hp/shape heuristics — which mislabels a low-hp boss as "trash".
    if (m.role) entry["role"] = m.role;
    if (m.ranged) entry["ranged"] = true;
    if (m.slowPct != null) entry["slowPct"] = m.slowPct;
    if (m.slowMs != null) entry["slowMs"] = m.slowMs;
    if (m.weakenPct != null) entry["weakenPct"] = m.weakenPct;
    if (m.weakenMs != null) entry["weakenMs"] = m.weakenMs;
    if (m.projectileAnimation != null) entry["projectileAnimation"] = m.projectileAnimation;
    if (m.armor != null) entry["armor"] = m.armor;
    if (m.isUnholy) entry["isUnholy"] = true;
    if (m.faithXp != null) entry["faithXp"] = m.faithXp;
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
// Regions are upscaled to a fixed expanded footprint (see FLOOR_DIMS in
// shared.ts: every floor -> 90x60). Floors authored at the native 52x34 have
// their content stretched by the same factor so it stays aligned with the
// scaled map; floor 3 is authored directly at the target size, so its content
// is left as-is. A gathering node's "approach" keeps its 1-tile offset from the
// node (rather than scaling the gap) so the standing spot stays adjacent.
const SCALE_AUTHORED_AT_TARGET = new Set<number>([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const EXP_COLS = 90;
const EXP_ROWS = 60;
const NAT_COLS = 52;
const NAT_ROWS = 34;
const facX = (floor: unknown): number => (SCALE_AUTHORED_AT_TARGET.has(floor as number) ? 1 : EXP_COLS / NAT_COLS);
const facY = (floor: unknown): number => (SCALE_AUTHORED_AT_TARGET.has(floor as number) ? 1 : EXP_ROWS / NAT_ROWS);
const sX = (floor: unknown, x: number | undefined): number | undefined => (x == null ? x : x * facX(floor));
const sY = (floor: unknown, y: number | undefined): number | undefined => (y == null ? y : y * facY(floor));

const NPCS = npcs.map((n) => ({
  id: n.id,
  name: n.name,
  role: n.role,
  floor: n.at?.floor,
  x: sX(n.at?.floor, n.at?.x),
  y: sY(n.at?.floor, n.at?.y),
  dialogue: n.idleDialogue ?? ""
}));
const SHOP = shop;
const MONSTER_SPAWNS = mergedMonsterSpawns.map((s) => ({
  type: s.type,
  floor: s.at?.floor,
  x: sX(s.at?.floor, s.at?.x),
  y: sY(s.at?.floor, s.at?.y),
  zone: s.zone
}));
const COMPOSED_TREE_NODES = (spawns.trees ?? []).map((t) => ({
  type: t.type,
  floor: t.at?.floor,
  x: sX(t.at?.floor, t.at?.x),
  y: sY(t.at?.floor, t.at?.y)
}));
const FISHING_NODES = fishingNodes.map((f) => ({
  id: f.id,
  kind: f.kind ?? "fish",
  floor: f.at?.floor,
  x: sX(f.at?.floor, f.at?.x),
  y: sY(f.at?.floor, f.at?.y),
  approachX: sX(f.at?.floor, f.approach?.x),
  approachY: sY(f.at?.floor, f.approach?.y)
}));
const MINING_NODES = miningNodes.map((m) => ({
  id: m.id,
  kind: m.kind ?? "copper",
  floor: m.at?.floor,
  x: sX(m.at?.floor, m.at?.x),
  y: sY(m.at?.floor, m.at?.y),
  approachX: sX(m.at?.floor, m.approach?.x),
  approachY: sY(m.at?.floor, m.approach?.y)
}));
const HERB_NODES = herbNodes.map((h) => {
  const entry: Record<string, unknown> = {
    id: h.id,
    floor: h.at?.floor,
    x: sX(h.at?.floor, h.at?.x),
    y: sY(h.at?.floor, h.at?.y),
    approachX: sX(h.at?.floor, h.approach?.x),
    approachY: sY(h.at?.floor, h.approach?.y),
    label: h.label ?? "Wild Herbs"
  };
  if (h.requiredLevel != null) entry["requiredLevel"] = h.requiredLevel;
  if (h.xp != null) entry["xp"] = h.xp;
  if (h.item != null) entry["item"] = h.item;
  return entry;
});
const ABILITIES = Object.fromEntries(abilities.map((a) => [a.id, a]));
const COMBAT_ANIMATIONS = Object.fromEntries(combatAnimations.map((a) => [a.id, a]));
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
  ABILITIES: "Record<string, AbilitySpec>",
  COMBAT_ANIMATIONS: "Record<string, CombatAnimationSpec>",
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
  AbilitySpec,
  CombatAnimationSpec,
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
    ["ABILITIES", ABILITIES],
    ["COMBAT_ANIMATIONS", COMBAT_ANIMATIONS],
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
