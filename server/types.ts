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
  | { type: "cooking"; itemId: string; fireId: string; nextAt: number };

export interface AbilityBuffs {
  sprint?: { until: number };
  second_wind?: { until: number; healPerMs: number };
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
  potions: number;
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
}

export interface Corpse {
  id: string;
  floor: number;
  x: number;
  y: number;
  gold: number;
  potions: number;
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
  potions?: number;
  weaponTier?: number;
  armorTier?: number;
  wellFedUntil?: number;
  foodRegenUntil?: number;
  inventory?: unknown;
  quests?: unknown;
  skills?: unknown;
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
