// Wire protocol shared by client and server: the snapshot the server broadcasts,
// the per-entity views inside it, and the messages the client sends back.

import type { NpcRole, QuestKind } from "./content-types.ts";

export type Direction = "up" | "down" | "left" | "right";

export type ActionType = "woodcutting" | "fishing" | "mining" | "herbing" | "cooking";

export interface InputPayload {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  moveX: number;
  moveY: number;
}

// --- Per-entity views (server → client) -----------------------------------

export interface ActionView {
  type: ActionType;
  treeId?: string;
  nodeId?: string;
  fireId?: string;
}

export interface BuffsView {
  wellFed: number;
  foodRegen: number;
  sprint: number;
  secondWind: number;
  ironClad: number;
  fleetFoot: number;
  slowed: number;
  stunned: number;
  weakened: number;
}

export interface InventoryItemView {
  id: string;
  label: string;
  icon: string | null;
  iconUrl: string | null;
  qty: number;
}

export interface QuestView {
  id: string;
  title: string;
  kind: QuestKind;
  giverId: string;
  accepted: boolean;
  progress: number;
  target: number;
  complete: boolean;
  claimed: boolean;
  rewardGold: number;
  rewardXp: number;
}

export interface SkillView {
  id: string;
  label: string;
  iconUrl: string | null;
  xp: number;
  level: number;
  nextXp: number;
}

export interface AbilityView {
  id: string;
  label: string;
  description: string;
  cooldownMs: number;
  durationMs: number;
  cooldownRemainingMs: number;
  activeRemainingMs: number;
}

export interface PlayerView {
  id: string;
  name: string;
  classKey: string;
  floor: number;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  level: number;
  xp: number;
  gold: number;
  weaponTier: number;
  armorTier: number;
  targetId: string | null;
  dead: boolean;
  action: ActionView | null;
  buffs: BuffsView;
  inventory: Array<InventoryItemView | null>;
  quests: QuestView[];
  skills: SkillView[];
  abilities: AbilityView[];
  unlockedClasses: string[];
  weight: number;
  maxWeight: number;
}

export interface MonsterView {
  id: string;
  type: string;
  name: string;
  floor: number;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  attacking?: boolean;
  hp: number;
  maxHp: number;
  zone: string;
}

export interface NpcView {
  id: string;
  name: string;
  role: NpcRole;
  floor: number;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  dialogue: string;
}

export interface TreeView {
  id: string;
  type: string;
  label: string;
  requiredLevel: number;
  floor: number;
  x: number;
  y: number;
  active: boolean;
}

export interface FishingNodeView {
  id: string;
  floor: number;
  x: number;
  y: number;
  approachX: number;
  approachY: number;
  label: string;
}

export interface MiningNodeView {
  id: string;
  floor: number;
  x: number;
  y: number;
  approachX: number;
  approachY: number;
  kind: string;
  label: string;
}

export interface HerbNodeView {
  id: string;
  floor: number;
  x: number;
  y: number;
  approachX: number;
  approachY: number;
  label: string;
  active: boolean;
  requiredLevel: number;
}

export interface FireView {
  id: string;
  floor: number;
  x: number;
  y: number;
  remainingMs: number;
}

export interface CorpseView {
  id: string;
  floor: number;
  x: number;
  y: number;
  gold: number;
  label: string;
  kind: "corpse" | "drop";
  items: Array<{ id: string; qty: number }>;
}

export interface DialogueLineView {
  speaker: string;
  text: string;
}

// Game events are a loose tagged stream; the base fields are always present and
// individual event kinds carry extra optional fields.
export interface GameEvent {
  type: string;
  text: string | number;
  x: number | null;
  y: number | null;
  floor: number | null;
  color: string | null;
  from: string | null;
  target: string | null;
  t: number;
  fromX?: number;
  fromY?: number;
  angle?: number;
  scale?: number;
  durationMs?: number;
  to?: string;
  lines?: DialogueLineView[];
  opensShop?: boolean;
  opensAlchemist?: boolean;
}

export interface StateMetrics {
  clients: number;
  monsters: number;
  zone: string;
  visiblePlayers: number;
  visibleMonsters: number;
  visibleCorpses: number;
  visibleTrees: number;
  visibleFishingNodes: number;
  visibleMiningNodes: number;
  visibleFires: number;
  spatialCells: number;
  residentStaticResources: number;
  dynamicEntities: number;
  heapUsedMb: number;
  rssMb: number;
  tickMs: number;
  snapshotMs: number;
  bytesOutPerSecond: number;
  wireBytesOutPerSecond: number;
  snapshotsSentPerSecond: number;
  snapshotsSkippedBackpressurePerSecond: number;
  eventsDroppedPerSecond: number;
  socketBackpressureBytes: number;
  saveQueueDepth: number;
  saveFlushMs: number;
  saveFlushPlayers: number;
  saveInFlight: number;
}

// --- Server → client messages ---------------------------------------------

export interface StateSnapshot {
  type: "state";
  players: PlayerView[];
  playersFull: boolean;
  removedPlayerIds: string[];
  monsters: MonsterView[];
  monstersFull: boolean;
  removedMonsterIds: string[];
  corpses: CorpseView[];
  corpsesFull: boolean;
  removedCorpseIds: string[];
  npcs: NpcView[];
  npcsFull: boolean;
  removedNpcIds: string[];
  trees: TreeView[];
  treesFull: boolean;
  removedTreeIds: string[];
  fishingNodes: FishingNodeView[];
  fishingNodesFull: boolean;
  removedFishingNodeIds: string[];
  miningNodes: MiningNodeView[];
  miningNodesFull: boolean;
  removedMiningNodeIds: string[];
  herbNodes: HerbNodeView[];
  herbNodesFull: boolean;
  removedHerbNodeIds: string[];
  fires: FireView[];
  firesFull: boolean;
  removedFireIds: string[];
  events: GameEvent[];
  metrics?: StateMetrics;
}

export interface WelcomeMessage {
  type: "welcome";
  id: string;
  maps: number[];
}

export interface CharacterSummary {
  name: string;
  level: number;
  gold: number;
  updatedAt: string | null;
}

export interface CharactersMessage {
  type: "characters";
  characters: CharacterSummary[];
}

export interface CharacterDeletedMessage {
  type: "characterDeleted";
  ok: boolean;
  name: string;
}

export type ServerMessage =
  | StateSnapshot
  | WelcomeMessage
  | CharactersMessage
  | CharacterDeletedMessage;

// --- Client → server messages ---------------------------------------------

export interface UseItemCtx {
  logItem?: string;
  fireId?: string;
}

export type ClientMessage =
  | { type: "characters" }
  | { type: "deleteCharacter"; name: string }
  | { type: "join"; name: string; fresh?: boolean; transient?: boolean }
  | { type: "input"; input: Partial<InputPayload> }
  | { type: "target"; id: string }
  | { type: "ability"; slot: string | number }
  | { type: "useClassAbility"; id: string }
  | { type: "loot" }
  | { type: "lootCorpse"; id: string }
  | { type: "buy"; item: string }
  | { type: "talkNpc"; id: string }
  | { type: "cutTree"; id: string }
  | { type: "fishNode"; id: string }
  | { type: "mineNode"; id: string }
  | { type: "gatherHerb"; id: string }
  | { type: "brewPotion" }
  | { type: "setClass"; classKey: string }
  | { type: "makeFire"; logItem?: string }
  | { type: "cookFish"; id: string }
  | {
      type: "e2eGrantItems";
      items?: Array<{ id: string; qty: number }>;
      gold?: number;
      hp?: number;
      floor?: number;
      x?: number;
      y?: number;
      skills?: Record<string, number>;
      forceDodge?: boolean;
    }
  | { type: "eatItem"; item: string }
  | { type: "useItem"; item: string; ctx?: UseItemCtx }
  | { type: "chat"; text: string }
  | { type: "respawn" };
