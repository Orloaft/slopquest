// Types describing the data baked into src/generated/catalog.ts from content/*.yaml.
// The generator (scripts/build-content.ts) annotates each export with these types.

export type Range = [number, number];

export type SkillId =
  | "attack"
  | "defense"
  | "magic"
  | "woodcutting"
  | "fishing"
  | "mining"
  | "firemaking"
  | "cooking"
  | "agility"
  | "alchemy"
  | "ranged"
  | "foraging";

export type ZoneId = "southTown" | "cemetery" | "crypt" | "woods" | "northTown" | "marsh" | "badlands" | "desert" | "beach" | "jungle";

export type Capability = "chop_tree" | "fish" | "mine" | "ranged";

export type NpcRole = "vendor" | "quest" | "guide" | "alchemist" | "trainer";

export type QuestKind = "kill" | "gather" | "fetch";

export interface Buff {
  id: string;
  durationMs: number;
}

export type ItemUse =
  | { kind: "eat"; restoreHp?: number; buffs?: Buff[]; float?: string }
  | {
      kind: "light_fire";
      consumesAny: Array<{ item: string; qty: number; xp: number }>;
      skill?: string;
      durationMs?: number;
    }
  | { kind: "cook_on_fire"; produces: string; burns: string; skill?: string; xp: number }
  | { kind: "drink_potion"; restoreHp: number; float?: string };

export interface Item {
  id: string;
  label: string;
  icon: string | null;
  iconUrl: string | null;
  stackable?: boolean;
  tags?: string[];
  capabilities?: Capability[];
  use?: ItemUse;
  // Mass carried in the inventory; drives the encumbrance speed modifier.
  weight?: number;
}

export interface Monster {
  name: string;
  maxHp: number;
  speed: number;
  damage: Range;
  attackMs: number;
  xp: number;
  gold: Range;
  aggro: number;
  range: number;
  // Ranged "turret" monsters stay anchored and fire projectiles (needs line of
  // sight). `slowPct`/`slowMs` apply a movement slow to the hit player.
  ranged?: boolean;
  slowPct?: number;
  slowMs?: number;
  // Ranged debuff that reduces the hit player's PHYSICAL damage output.
  weakenPct?: number;
  weakenMs?: number;
  // Flat damage reduction on incoming hits (armored monsters).
  armor?: number;
  // Pack hunters: aggroing alerts nearby same-type monsters to the same target.
  pack?: boolean;
  // Ambushers: hidden underground until a player steps adjacent, then burst for
  // damage + a stun (stunMs).
  burrow?: boolean;
  stunMs?: number;
}

export interface QuestDrop {
  itemId: string;
  chance: number;
}

export interface TreeType {
  label: string;
  requiredLevel: number;
  chopsRequired: number;
  baseSwingMs: number;
  minSwingMs: number;
  xp: number;
  itemId: string;
  dropLabel: string;
  textureKey: string;
  width: number;
  height: number;
  zoneWidth: number;
  zoneHeight: number;
}

export interface Npc {
  id: string;
  name: string;
  role: NpcRole;
  floor: number;
  x: number;
  y: number;
  dialogue: string;
}

export interface ShopEntry {
  cost: number;
  name?: string;
  knightName?: string;
  casterName?: string;
  damageBonus?: number;
  armorBonus?: number;
  heal?: number;
}

export interface MonsterSpawn {
  type: string;
  floor: number;
  x: number;
  y: number;
  zone: ZoneId;
}

export interface TreeNode {
  type: string;
  floor: number;
  x: number;
  y: number;
}

export interface FishingNode {
  id: string;
  floor: number;
  x: number;
  y: number;
  approachX: number;
  approachY: number;
}

export interface MiningNode {
  id: string;
  floor: number;
  x: number;
  y: number;
  approachX: number;
  approachY: number;
  kind: string;
}

export interface HerbNode {
  id: string;
  floor: number;
  x: number;
  y: number;
  approachX: number;
  approachY: number;
  label: string;
  requiredLevel?: number;
  xp?: number;
  item?: string;
}

export type DialogueLine = { npc: string } | { player: string };

export interface QuestDialogue {
  intro: DialogueLine[];
  progress: DialogueLine[];
  turnIn: DialogueLine[];
  claimed: DialogueLine[];
  missingItems?: DialogueLine[];
}

export interface Quest {
  id: string;
  title: string;
  giverId: string;
  kind: QuestKind;
  targetCount: number;
  zone: ZoneId | null;
  targetTypes: string[];
  itemId: string | null;
  rewardGold: number;
  rewardXp: number;
  dialogue: QuestDialogue;
}
