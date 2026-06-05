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
  | "foraging"
  | "smithing"
  | "faith";

export type ZoneId = "southTown" | "cemetery" | "crypt" | "woods" | "northTown" | "marsh" | "badlands" | "desert" | "beach" | "jungle" | "deepMine";

export type Capability = "chop_tree" | "fish" | "mine" | "ranged";

export type NpcRole = "vendor" | "quest" | "guide" | "alchemist" | "trainer" | "smith";

export type EncounterRole = "trash" | "pack" | "ambush" | "turret" | "elite" | "boss";

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
  id?: string;
  name: string;
  description?: string;
  role?: EncounterRole;
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
  projectileAnimation?: string;
  // Flat damage reduction on incoming hits (armored monsters).
  armor?: number;
  // Unholy monsters grant dedicated Faith XP on death and interact with Holy
  // damage / Acolyte Favor generation.
  isUnholy?: boolean;
  faithXp?: number;
  // Pack hunters: aggroing alerts nearby same-type monsters to the same target.
  pack?: boolean;
  // Ambushers: hidden underground until a player steps adjacent, then burst for
  // damage + a stun (stunMs).
  burrow?: boolean;
  stunMs?: number;
  heavyAttack?: {
    cooldownMs: number;
    windupMs: number;
    damageMultiplier: number;
    radius: number;
  };
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

export interface AbilitySpec {
  id: string;
  label: string;
  description: string;
  category?: "class" | "spell" | "miracle";
  magicLevel?: number;
  faithLevel?: number;
  cooldownMs: number;
  durationMs: number;
  guards?: AbilityGuard[];
  targeting?: AbilityTargeting;
  effects?: AbilityEffect[];
  projectile?: AbilityProjectile;
  vfx?: AbilityVfx;
  animation?: AbilityAnimation;
  float?: AbilityFloat;
  speedMultiplier?: number;
  healFraction?: number;
  // Legacy display/scaling fields retained while clients and save data settle.
  damage?: Range;
  manaCost?: number;
  favorCost?: number;
  skill?: string;
  range?: number;
  effectKind?: string;
  castTimeMs?: number;
}

export type AbilityGuard = "requireBelowMaxHp";

export type AbilityTargeting =
  | { mode: "self" }
  | { mode: "enemy"; range?: number; requiresLineOfSight?: boolean }
  | { mode: "aoe_self"; radius: number }
  | { mode: "aoe_front"; offset: number; radius: number }
  | { mode: "aoe_point"; offset: number; radius: number; range?: number }
  | { mode: "line_front"; tiles: number; width?: number }
  | { mode: "dash"; tiles: number };

export type AbilityEffect =
  | { kind: "buff_self"; buff: "sprint" | "ironClad" | "fleetFoot" | "luminescence" | "zephyrStep" | "earthSense" | "conviction"; durationMs?: number; cleanse?: Array<"slow" | "weaken"> }
  | { kind: "damage"; amount?: Range; skill?: string; damageType?: "physical" | "magic" | "holy"; xpFactor?: number; effectKind?: string; conditionalBonus?: AbilityConditionalBonus }
  | { kind: "debuff_enemy"; status: "snare" | "slow" | "burn" | "freeze" | "inaccurate"; durationMs?: number; perTick?: number; slowMultiplier?: number; float?: AbilityFloat }
  | { kind: "heal"; fraction?: number; scaleSkill?: string }
  | { kind: "heal_over_time"; buff: "second_wind"; fraction?: number; durationMs?: number }
  | { kind: "dash"; tiles?: number }
  | { kind: "cleanse_self"; statuses?: Array<"slow" | "weaken" | "stun"> }
  | { kind: "shield_self"; base: number; maxManaScale?: number; durationMs?: number }
  | { kind: "knockback"; tiles: number }
  | { kind: "gain_favor"; amount: number; unholyBonus?: number }
  | { kind: "teleport"; destination: "waystone" }
  | { kind: "taunt"; durationMs?: number };

export interface AbilityConditionalBonus {
  when: "behindTarget";
  multiply: number;
  float?: AbilityFloat;
}

export interface AbilityProjectile {
  id?: string;
  kind: string;
  color?: string;
  targetEnemy?: boolean;
}

export interface AbilityVfx {
  effectKind: string;
  color?: string;
}

export interface AbilityAnimation {
  id?: string;
  kind: "slash_arc" | "self_pulse" | "ground_burst" | "projectile_trail" | "impact_ring";
  attach: "self" | "target" | "origin" | "path";
  color?: string;
  scale?: number;
  durationMs?: number;
}

export type CombatAnimationKind = "melee_arc" | "projectile" | "impact" | "ground" | "self" | "trail";
export type CombatAnimationRenderer =
  | "slash_arc"
  | "arrow"
  | "arrow_heavy"
  | "arrow_poison"
  | "arcane"
  | "arcane_lance"
  | "frost_shard"
  | "fire_orb"
  | "curse_bolt"
  | "flask"
  | "spit"
  | "fire_missile"
  | "ice_missile"
  | "impact_ring"
  | "fire_burst"
  | "ice_burst"
  | "ground_burst"
  | "self_pulse"
  | "projectile_trail";
export type CombatAnimationAnchor = "caster" | "target" | "path" | "ground" | "self";
export type CombatAnimationOrientation = "rotate_to_target" | "directional_4" | "directional_8" | "screen_fixed";
export type CombatAnimationZ = "below_actor" | "actor" | "above_actor";

export interface CombatAnimationSpec {
  id: string;
  kind: CombatAnimationKind;
  renderer: CombatAnimationRenderer;
  source: "effects" | "primitive" | "sheet";
  frames: number;
  frameMs: number;
  anchor: CombatAnimationAnchor;
  orientation: CombatAnimationOrientation;
  z: CombatAnimationZ;
  scale?: number;
  hitFrame?: number;
  impact?: string;
}

export interface AbilityFloat {
  text: string;
  color: string;
  noTargetsText?: string;
  yOffset?: number;
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
  kind: string;
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
