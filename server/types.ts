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
  luminescence?: { until: number };
  zephyrStep?: { until: number };
  earthSense?: { until: number };
  arcaneAegis?: { until: number; shield: number };
  conviction?: { until: number };
}

export interface QuestState {
  accepted: boolean;
  progress: number;
  complete: boolean;
  claimed: boolean;
}

export type ReputationKey = "waystone" | "northwatch" | "marsh" | "scavenger";

export type ReputationState = Record<ReputationKey, number>;

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
  favor: number;
  maxHp: number;
  maxMana: number;
  maxFavor: number;
  gold: number;
  weaponTier: number;
  armorTier: number;
  wellFedUntil: number;
  foodRegenUntil: number;
  inventory: InventorySlot[];
  carriedWeight: number;
  inventoryRevision: number;
  // Session-only: items recently sold to a vendor, offered back at full value.
  // Most-recent first; changes always coincide with an inventory change, so it
  // rides the inventory cache signature.
  buyback: Array<{ id: string; qty: number }>;
  quests: Record<string, QuestState>;
  questRevision: number;
  reputation: ReputationState;
  skills: Record<string, SkillStateEntry>;
  skillRevision: number;
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
  classesRevision: number;
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
  // Active dodge ("Dash"): a button-press dash that grants brief i-frames.
  // dashReadyAt gates the cooldown; while now < iframeUntil all incoming damage
  // is negated. The keystone of the action-combat direction.
  dashReadyAt?: number;
  iframeUntil?: number;
  // E2E-only: when set, player attacks always crit (deterministic crit tests).
  forceCrit?: boolean;
  // Dev playtest cheats (DEV_TOOLS only). godMode negates all incoming damage;
  // devSpeedMult scales movement speed. Never set outside DEV_TOOLS.
  godMode?: boolean;
  devSpeedMult?: number;
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
  // When set and in the future, the monster is mid-attack — drives the client's
  // bespoke attack animation (timestamp in performance.now ms).
  attackUntil?: number;
  heavyReadyAt?: number;
  heavyResolveAt?: number;
  heavyX?: number;
  heavyY?: number;
  heavyTargetId?: string;
  rangedResolveAt?: number;
  rangedX?: number;
  rangedY?: number;
  rangedTargetId?: string;
  rangedDamage?: number;
  deadUntil: number;
  homeX: number;
  homeY: number;
  zone: string;
  wanderTarget: Vec2 | null;
  wanderNextAt: number;
  // Status effects applied by player abilities (timestamps in performance.now ms).
  tauntUntil?: number;
  tauntBy?: string;
  threat: Map<string, number>;
  threatLastAt?: number;
  snareUntil?: number;
  freezeUntil?: number;
  burnUntil?: number;
  burnPerTick?: number;
  burnNextAt?: number;
  burnBy?: string;
  inaccurateUntil?: number;
  slowUntil?: number;
  slowMult?: number;
  // Brief "hitstop" stagger on a critical hit: the monster's movement and attack
  // are paused until this timestamp, selling the impact of a crit.
  staggerUntil?: number;
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
  // Conversation: while talkingTo is set (and talkUntil not elapsed) the NPC
  // stops wandering and faces the player it is speaking with.
  talkingTo?: string;
  talkUntil?: number;
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
  transient: boolean;
  backpressureSkips: number;
  forceBackpressureUntil?: number;
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
  favor?: number;
  gold?: number;
  weaponTier?: number;
  armorTier?: number;
  wellFedUntil?: number;
  foodRegenUntil?: number;
  inventory?: unknown;
  quests?: unknown;
  reputation?: unknown;
  skills?: unknown;
  unlockedClasses?: string[];
  updatedAt?: string;
}

export interface Database {
  players: Record<string, SavedPlayer>;
}

export interface MetricWindow {
  values: number[];
  index: number;
  count: number;
  sum: number;
}

export interface Metrics {
  tickWindow: MetricWindow;
  snapshotWindow: MetricWindow;
  bytesOutThisSecond: number;
  bytesOutPerSecond: number;
  wireBytesOutPerSecond: number;
  snapshotsSentThisSecond: number;
  snapshotsSentPerSecond: number;
  snapshotsSkippedBackpressureThisSecond: number;
  snapshotsSkippedBackpressurePerSecond: number;
  socketsTerminatedBackpressureThisSecond: number;
  socketsTerminatedBackpressurePerSecond: number;
  eventsDroppedThisSecond: number;
  eventsDroppedPerSecond: number;
  clientMessagesDroppedThisSecond: number;
  clientMessagesDroppedPerSecond: number;
  eventLoopDelayMs: number;
  eventLoopDelayP95Ms: number;
  eventLoopDelayMaxMs: number;
  saveQueueDepth: number;
  saveFlushMs: number;
  saveFlushPlayers: number;
  saveInFlight: number;
  lastBytesAt: number;
}
