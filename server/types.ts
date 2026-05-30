// Server-internal runtime types: the mutable game-state objects the simulation
// mutates each tick, plus the persistence and indexing shapes. The over-the-wire
// view types live in src/types.ts.

import type { WebSocket } from "ws";
import type { MonsterSpawn } from "../src/content-types.ts";
import type { Direction, InputPayload } from "../src/types.ts";

export interface Positioned {
  floor: number;
  x: number;
  y: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export type PlayerAction =
  | { type: "woodcutting"; treeId: string; nextAt: number; swings: number; remaining: number }
  | { type: "fishing"; nodeId: string; nextAt: number; startedAt: number }
  | { type: "mining"; nodeId: string; nextAt: number; startedAt: number }
  | { type: "herbing"; nodeId: string; nextAt: number; startedAt: number }
  | { type: "cooking"; itemId: string; fireId: string; nextAt: number };

export interface AbilityBuffs {
  sprint?: { until: number };
  second_wind?: { until: number; healPerMs: number };
  ironClad?: { until: number };
  fleetFoot?: { until: number };
}

export interface QuestState {
  accepted: boolean;
  progress: number;
  complete: boolean;
  claimed: boolean;
}

export interface SkillStateEntry {
  xp: number;
}

export interface InventoryItem {
  id: string;
  qty: number;
}

export type InventorySlot = InventoryItem | null;

export interface ServerPlayer {
  id: string;
  name: string;
  classKey: string;
  floor: number;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  level: number;
  xp: number;
  hp: number;
  mana: number;
  maxHp: number;
  maxMana: number;
  gold: number;
  weaponTier: number;
  armorTier: number;
  wellFedUntil: number;
  foodRegenUntil: number;
  inventory: InventorySlot[];
  quests: Record<string, QuestState>;
  skills: Record<string, SkillStateEntry>;
  online: boolean;
  targetId: string | null;
  lastAttack: number;
  cooldowns: { ability: number };
  abilityCooldowns: Record<string, number>;
  abilityBuffs: AbilityBuffs;
  action: PlayerAction | null;
  portalReadyAt: number;
  dead: boolean;
  updatedAt?: string;
  // Tier-1 classes this player has unlocked from trainers. classKey is the one
  // currently equipped (always "adventurer" or an unlocked key).
  unlockedClasses: string[];
  // Movement slow (e.g. from a Mire Spitter); cleared by Fleet Foot.
  slowUntil?: number;
  slowMult?: number;
  // Stun (e.g. from a Dust Burrower ambush): no move/act briefly.
  stunUntil?: number;
  // Weaken (e.g. from a Sun-Scorched Wraith): reduced PHYSICAL damage output.
  weakUntil?: number;
  weakMult?: number;
  // E2E-only: when set, the player always dodges incoming hits (deterministic
  // testing of the dodge mechanic). Never set outside E2E_TEST.
  forceDodge?: boolean;
}

export interface ServerMonster {
  id: string;
  spawn: MonsterSpawn;
  type: string;
  floor: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dir: Direction;
  moving: boolean;
  lastAttack: number;
  deadUntil: number;
  homeX: number;
  homeY: number;
  zone: string;
  wanderTarget: Vec2 | null;
  wanderNextAt: number;
  // Status effects applied by player abilities (timestamps in performance.now ms).
  tauntUntil?: number;
  tauntBy?: string;
  snareUntil?: number;
  freezeUntil?: number;
  burnUntil?: number;
  burnPerTick?: number;
  burnNextAt?: number;
  burnBy?: string;
  inaccurateUntil?: number;
  // Badlands: hidden burrower (invisible until it ambushes) and pack-alert state.
  hidden?: boolean;
  alertUntil?: number;
  alertTarget?: string;
}

export interface Corpse {
  id: string;
  floor: number;
  x: number;
  y: number;
  gold: number;
  label: string;
  kind: "corpse" | "drop";
  items: InventoryItem[];
}

export interface Fire {
  id: string;
  floor: number;
  x: number;
  y: number;
  expiresAt: number;
  owner: string;
}

export interface NpcRuntime {
  id: string;
  name: string;
  role: string;
  floor: number;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  dialogue: string;
  homeX?: number;
  homeY?: number;
  wanderTarget?: Vec2 | null;
  wanderNextAt?: number;
}

export interface TreeNodeRuntime {
  id: string;
  floor: number;
  tileX: number;
  tileY: number;
  x: number;
  y: number;
  type: string;
  active: boolean;
  respawnAt: number;
}

export interface HerbNodeRuntime {
  id: string;
  floor: number;
  x: number;
  y: number;
  approachX: number;
  approachY: number;
  label: string;
  requiredLevel: number;
  xp: number;
  item: string;
  active: boolean;
  respawnAt: number;
}

export interface ExtWebSocket extends WebSocket {
  isAlive?: boolean;
}

export interface Session {
  socket: ExtWebSocket;
  player: ServerPlayer;
  input: InputPayload;
  lastInputAt: number;
}

export interface SpatialIndex {
  players: Map<string, ServerPlayer[]>;
  monsters: Map<string, ServerMonster[]>;
  corpses: Map<string, Corpse[]>;
  npcs: Map<string, NpcRuntime[]>;
  trees: Map<string, TreeNodeRuntime[]>;
  fires: Map<string, Fire[]>;
  cellCount: number;
}

export interface SavedPlayer {
  name: string;
  classKey?: string;
  floor?: number;
  x?: number;
  y?: number;
  level?: number;
  xp?: number;
  hp?: number;
  mana?: number;
  gold?: number;
  weaponTier?: number;
  armorTier?: number;
  wellFedUntil?: number;
  foodRegenUntil?: number;
  inventory?: unknown;
  quests?: unknown;
  skills?: unknown;
  unlockedClasses?: string[];
  updatedAt?: string;
}

export interface Database {
  players: Record<string, SavedPlayer>;
}

export interface Metrics {
  tickSamples: number[];
  snapshotSamples: number[];
  bytesOutThisSecond: number;
  bytesOutPerSecond: number;
  lastBytesAt: number;
}
