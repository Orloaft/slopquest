import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import type { WebSocket, RawData } from "ws";
import {
  ABILITIES,
  CLASSES,
  CLASS_UNLOCKS,
  COMPOSED_TREE_NODES,
  FISHING_NODES,
  MINING_NODES,
  HERB_NODES,
  ITEMS,
  MONSTERS,
  MONSTER_SPAWNS,
  NPCS,
  QUEST_DROPS,
  QUESTS,
  SKILLS,
  SHOP,
  START,
  TREE_TYPES,
  dodgeChanceFor,
  floorCols,
  floorRows,
  isBlockedTile,
  isSightBlocked,
  isSafeZone,
  portalFor,
  tileAt,
  xpForLevel,
  zoneAt
} from "../src/shared.ts";
import type { AbilityEffect, AbilitySpec, ClassSpec } from "../src/shared.ts";
import type {
  Item,
  MonsterSpawn,
  Quest,
  QuestDialogue,
  Range,
  TreeType
} from "../src/content-types.ts";
import type {
  AbilityView,
  ActionView,
  BuffsView,
  CharacterSummary,
  ClientMessage,
  CorpseView,
  Direction,
  DialogueLineView,
  FireView,
  FishingNodeView,
  GameEvent,
  HerbNodeView,
  InputPayload,
  InventoryItemView,
  MiningNodeView,
  MonsterView,
  NpcView,
  PlayerView,
  QuestView,
  SkillView,
  StateSnapshot,
  TreeView,
  UseItemCtx
} from "../src/types.ts";
import { compactStateSnapshot, type CompactStateSnapshot } from "../src/wire.ts";
import type {
  Corpse,
  Database,
  ExtWebSocket,
  Fire,
  InventorySlot,
  MetricWindow,
  Metrics,
  NpcRuntime,
  PlayerAction,
  Positioned,
  QuestState,
  SavedPlayer,
  HerbNodeRuntime,
  ServerMonster,
  ServerPlayer,
  Session,
  SkillStateEntry,
  SpatialIndex,
  TreeNodeRuntime,
  Vec2
} from "./types.ts";

type FishingNodeRuntime = (typeof FISHING_NODES)[number];
type MiningNodeRuntime = (typeof MINING_NODES)[number];
type HerbNodeBase = (typeof HERB_NODES)[number];
const fishingNodeBasesById = new Map<string, FishingNodeRuntime>(FISHING_NODES.map((node) => [node.id, node]));
const miningNodeBasesById = new Map<string, MiningNodeRuntime>(MINING_NODES.map((node) => [node.id, node]));
const herbNodeBasesById = new Map<string, HerbNodeBase>(HERB_NODES.map((node) => [node.id, node]));
const composedTreeNodesById = new Map<string, (typeof COMPOSED_TREE_NODES)[number]>(
  COMPOSED_TREE_NODES.map((tree) => [composedTreeId(tree), tree])
);

interface AbilityResolution {
  origin: Vec2;
  targets: ServerMonster[];
  targetId: string | null;
  heal: number;
}

interface StaticSpatialIndex {
  trees: Map<string, TreeNodeRuntime[]>;
  fishingNodes: Map<string, FishingNodeRuntime[]>;
  miningNodes: Map<string, MiningNodeRuntime[]>;
  herbNodes: Map<string, HerbNodeRuntime[]>;
  cellCount: number;
}

interface PlayerPrivateViewCache {
  inventorySignature: string;
  inventory: Array<InventoryItemView | null>;
  questsSignature: string;
  quests: QuestView[];
  skillsSignature: string;
  skills: SkillView[];
  abilitiesSignature: string;
  abilities: AbilityView[];
  classesSignature: string;
  unlockedClasses: string[];
  weight: number;
}

interface PlayerPublicViewCache {
  checkedSequence: number;
  signature: number;
  view: PlayerView;
}

interface PlayerSelfViewCache {
  checkedSequence: number;
  signature: number;
  view: PlayerView;
}

interface EntityViewCache<T extends SnapshotEntity> {
  checkedSequence: number;
  signature: number;
  view: T;
}

interface ResourceViewCache<T extends SnapshotEntity> {
  signature: number;
  stateKey: string;
  view: T;
}

type ResourceRespawnKind = "tree" | "herb";

interface ResourceRespawn {
  at: number;
  kind: ResourceRespawnKind;
  id: string;
}

interface FireExpiration {
  at: number;
  id: string;
}

interface CorpseExpiration {
  at: number;
  id: string;
}

interface ActiveRegions {
  cells: Set<string>;
}

interface SpatialCellRef {
  key: string;
  floor: number;
  cx: number;
  cy: number;
}

type SnapshotEntity =
  | PlayerView
  | MonsterView
  | CorpseView
  | NpcView
  | TreeView
  | FishingNodeView
  | MiningNodeView
  | HerbNodeView
  | FireView;

type SnapshotCategory =
  | "players"
  | "monsters"
  | "corpses"
  | "npcs"
  | "trees"
  | "fishingNodes"
  | "miningNodes"
  | "herbNodes"
  | "fires";

const SNAPSHOT_CATEGORIES: SnapshotCategory[] = [
  "players",
  "monsters",
  "corpses",
  "npcs",
  "trees",
  "fishingNodes",
  "miningNodes",
  "herbNodes",
  "fires"
];

interface SnapshotDelta<T extends SnapshotEntity> {
  items: T[];
  removedIds: string[];
  full: boolean;
  visibleCount: number;
}

interface SnapshotMetricFrame {
  clients: number;
  monsters: number;
  spatialCells: number;
  residentStaticResources: number;
  dynamicEntities: number;
  snapshotCacheEntries: number;
  snapshotCacheEntriesPeak: number;
  heapUsedMb: number;
  rssMb: number;
  tickMs: number;
  snapshotMs: number;
  eventLoopDelayMs: number;
  eventLoopDelayP95Ms: number;
  eventLoopDelayMaxMs: number;
  bytesOutPerSecond: number;
  wireBytesOutPerSecond: number;
  snapshotsSentPerSecond: number;
  snapshotsSkippedBackpressurePerSecond: number;
  eventsDroppedPerSecond: number;
  clientMessagesDroppedPerSecond: number;
  clientMessageMaxBytes: number;
  socketBackpressureBytes: number;
  saveQueueDepth: number;
  saveFlushMs: number;
  saveFlushPlayers: number;
  saveInFlight: number;
}

interface SnapshotCategoryCache {
  initialized: boolean;
  signatures: Map<string, number>;
  nextSignatures: Map<string, number>;
}

interface ClientMessageBucket {
  updatedAt: number;
  tokens: number;
}

interface PlayerSnapshotCandidate {
  player: ServerPlayer;
  distSq: number;
}

type SnapshotCache = Record<SnapshotCategory, SnapshotCategoryCache>;
type WireStateSnapshot = CompactStateSnapshot;

const QUEST_LIST = Object.values(QUESTS);
const QUESTS_BY_GIVER = new Map<string, Quest>();
const KILL_QUESTS_BY_ZONE_AND_TARGET = new Map<string, Quest[]>();
for (const quest of QUEST_LIST) {
  if (!QUESTS_BY_GIVER.has(quest.giverId)) QUESTS_BY_GIVER.set(quest.giverId, quest);
  if (quest.kind !== "kill" || !quest.zone) continue;
  for (const targetType of quest.targetTypes) {
    const key = killQuestKey(quest.zone, targetType);
    const quests = KILL_QUESTS_BY_ZONE_AND_TARGET.get(key) ?? [];
    quests.push(quest);
    KILL_QUESTS_BY_ZONE_AND_TARGET.set(key, quests);
  }
}

class MinHeap<T> {
  private readonly items: T[] = [];
  private readonly compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!first || !last) return first;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return first;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const item = this.items[index];
      const parentItem = this.items[parent];
      if (item === undefined || parentItem === undefined || this.compare(item, parentItem) >= 0) break;
      this.items[index] = parentItem;
      this.items[parent] = item;
      index = parent;
    }
  }

  private sinkDown(index: number): void {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      const leftItem = this.items[left];
      const rightItem = this.items[right];
      const smallestItem = this.items[smallest];
      if (leftItem !== undefined && smallestItem !== undefined && this.compare(leftItem, smallestItem) < 0) smallest = left;
      const nextSmallest = this.items[smallest];
      if (rightItem !== undefined && nextSmallest !== undefined && this.compare(rightItem, nextSmallest) < 0) smallest = right;
      if (smallest === index) break;
      const item = this.items[index];
      const swap = this.items[smallest];
      if (item === undefined || swap === undefined) break;
      this.items[index] = swap;
      this.items[smallest] = item;
      index = smallest;
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.TIB_DATA_DIR ?? join(__dirname, "..", "data");
const SAVE_FILE = join(DATA_DIR, "players.json");
const PLAYER_DIR = join(DATA_DIR, "players");
const LEGACY_MIGRATION_MARKER = join(DATA_DIR, "players.v2");
const PORT = Number(process.env.PORT ?? 8787);
const E2E_TEST = process.env.E2E_TEST === "1";
// Dev/playtest cheats via the `/dev` chat command. On under E2E or `TIB_DEV=1`
// (see the `dev:tools` npm script). Keep off for normal multiplayer sessions.
const DEV_TOOLS = E2E_TEST || process.env.TIB_DEV === "1";
const ALLOW_TRANSIENT_PLAYERS = E2E_TEST || process.env.TIB_ALLOW_TRANSIENT_PLAYERS === "1";
const SNAPSHOT_RADIUS = 18;
const SNAPSHOT_RADIUS_SQ = SNAPSHOT_RADIUS ** 2;
const MAX_VISIBLE_PLAYERS = positiveIntEnv("TIB_MAX_VISIBLE_PLAYERS", 50);
const TREE_SNAPSHOT_RADIUS = 32;
const TREE_SNAPSHOT_RADIUS_SQ = TREE_SNAPSHOT_RADIUS ** 2;
const METRIC_WINDOW = 60;
const SPATIAL_CELL_SIZE = 8;
const ACTIVE_REGION_RADIUS = SNAPSHOT_RADIUS + SPATIAL_CELL_SIZE;
const ACTIVE_REGION_CELL_MARGIN = Math.ceil(ACTIVE_REGION_RADIUS / SPATIAL_CELL_SIZE);
const composedTreeNodesByCell = buildStaticBaseCellIndex(COMPOSED_TREE_NODES);
const fishingNodeBasesByCell = buildStaticBaseCellIndex(FISHING_NODES);
const miningNodeBasesByCell = buildStaticBaseCellIndex(MINING_NODES);
const herbNodeBasesByCell = buildStaticBaseCellIndex(HERB_NODES);
const TREE_RESPAWN_MS = 30000;
const HERB_RESPAWN_MS = 25000;
const HERB_GATHER_MS = 2600;
const FIRE_DURATION_MS = 120000;
const FIRE_DURATION_OVERRIDE_MS = optionalPositiveIntEnv("TIB_FIRE_DURATION_MS");
const CORPSE_DECAY_MS = positiveIntEnv("TIB_CORPSE_DECAY_MS", 180000);
const DROP_DECAY_MS = positiveIntEnv("TIB_DROP_DECAY_MS", 300000);
const INVENTORY_SIZE = 30;
const BREW_XP = 30;
// Encumbrance: at/below the soft cap you move at full speed; past it, speed
// falls off linearly to MIN_ENCUMBRANCE_MULT at the hard cap.
const WEIGHT_SOFT_CAP = 40;
const WEIGHT_HARD_CAP = 90;
const MIN_ENCUMBRANCE_MULT = 0.55;
const RANGED_RANGE = 5;
const FORAGE_XP = 12;
// How long a monster's attack pose is broadcast as active (drives the bespoke
// client attack animation for enemies that have one).
const MONSTER_ATTACK_ANIM_MS = 480;
// WebSocket delivery is ordered/reliable, so full snapshots are a recovery guard
// rather than the normal data path. Dynamic entities still get periodic full
// recovery; static resources are initial-full + deltas only so dense zones do
// not resend every visible tree/node just because the recovery clock fired.
const TREE_SNAPSHOT_EVERY = positiveIntEnv("TIB_TREE_SNAPSHOT_EVERY", E2E_TEST ? 5 : 10);
const NPC_SNAPSHOT_EVERY = positiveIntEnv("TIB_NPC_SNAPSHOT_EVERY", E2E_TEST ? 1 : 3);
const RESOURCE_SNAPSHOT_EVERY = positiveIntEnv("TIB_RESOURCE_SNAPSHOT_EVERY", E2E_TEST ? 1 : 5);
const SNAPSHOT_FULL_EVERY = positiveIntEnv("TIB_SNAPSHOT_FULL_EVERY", E2E_TEST ? 20 : 80);
const SNAPSHOT_HEARTBEAT_MS = positiveIntEnv("TIB_SNAPSHOT_HEARTBEAT_MS", 1000);
const SNAPSHOT_METRICS_MS = positiveIntEnv("TIB_SNAPSHOT_METRICS_MS", 1000);
const SOCKET_BACKPRESSURE_BYTES = positiveIntEnv("TIB_SOCKET_BACKPRESSURE_BYTES", 512 * 1024);
const CLIENT_MESSAGE_LIMIT_PER_SECOND = positiveIntEnv("TIB_CLIENT_MESSAGE_LIMIT_PER_SECOND", 40);
const CLIENT_MESSAGE_BURST = positiveIntEnv("TIB_CLIENT_MESSAGE_BURST", CLIENT_MESSAGE_LIMIT_PER_SECOND * 2);
const CLIENT_MESSAGE_MAX_BYTES = positiveIntEnv("TIB_CLIENT_MESSAGE_MAX_BYTES", 4096);
const SPATIAL_QUERY_CACHE_ENTRIES = positiveIntEnv("TIB_SPATIAL_QUERY_CACHE_ENTRIES", 4096);
const SAVE_CONCURRENCY = positiveIntEnv("TIB_SAVE_CONCURRENCY", 16);
const STATIC_RESOURCE_PRUNE_MS = positiveIntEnv("TIB_STATIC_RESOURCE_PRUNE_MS", 1000);
const GLOBAL_EVENT_QUEUE_LIMIT = positiveIntEnv("TIB_GLOBAL_EVENT_QUEUE_LIMIT", 128);
const TARGETED_EVENT_QUEUE_LIMIT = positiveIntEnv("TIB_TARGETED_EVENT_QUEUE_LIMIT", 64);
const CELL_EVENT_QUEUE_LIMIT = positiveIntEnv("TIB_CELL_EVENT_QUEUE_LIMIT", 256);
const VISIBLE_EVENT_LIMIT = positiveIntEnv("TIB_VISIBLE_EVENT_LIMIT", 192);
const WS_COMPRESSION = process.env.TIB_WS_COMPRESSION === "1" || (!E2E_TEST && process.env.TIB_WS_COMPRESSION !== "0");
const WS_COMPRESSION_THRESHOLD = positiveIntEnv("TIB_WS_COMPRESSION_THRESHOLD", 1024);
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(PLAYER_DIR, { recursive: true });

const ADVENTURER: ClassSpec = CLASSES["adventurer"]!;

const db: Database = loadDb();
const clients = new Map<ExtWebSocket, Session>();
const playersById = new Map<string, ServerPlayer>();
const monsters = new Map<string, ServerMonster>();
const monstersByFloor = new Map<number, Set<ServerMonster>>();
const monstersByCell = new Map<string, Set<ServerMonster>>();
const corpses = new Map<string, Corpse>();
const corpsesByCell = new Map<string, Set<Corpse>>();
const treeNodes = new Map<string, TreeNodeRuntime>();
const fishingNodesById = new Map<string, FishingNodeRuntime>();
const miningNodesById = new Map<string, MiningNodeRuntime>();
const herbNodes = new Map<string, HerbNodeRuntime>();
const fires = new Map<string, Fire>();
const firesByCell = new Map<string, Set<Fire>>();
const npcs = new Map<string, NpcRuntime>();
const npcsByCell = new Map<string, Set<NpcRuntime>>();
let spatial: SpatialIndex = createSpatialIndex();
let staticSpatial: StaticSpatialIndex = createStaticSpatialIndex();
const publicPlayerViewCache = new Map<string, PlayerPublicViewCache>();
const playerViewSignatureCache = new WeakMap<PlayerView, number>();
const resourceViewSignatureCache = new WeakMap<SnapshotEntity, number>();
const privatePlayerViewCache = new WeakMap<ServerPlayer, PlayerPrivateViewCache>();
const selfPlayerViewCache = new WeakMap<ServerPlayer, PlayerSelfViewCache>();
const activeRegionCellsByPlayerCell = new Map<string, string[]>();
const monsterViewCache = new WeakMap<ServerMonster, EntityViewCache<MonsterView>>();
const npcViewCache = new WeakMap<NpcRuntime, EntityViewCache<NpcView>>();
const treeViewCache = new WeakMap<TreeNodeRuntime, ResourceViewCache<TreeView>>();
const fishingNodeViewCache = new WeakMap<FishingNodeRuntime, ResourceViewCache<FishingNodeView>>();
const miningNodeViewCache = new WeakMap<MiningNodeRuntime, ResourceViewCache<MiningNodeView>>();
const herbNodeViewCache = new WeakMap<HerbNodeRuntime, ResourceViewCache<HerbNodeView>>();
const resourceRespawns = new MinHeap<ResourceRespawn>((a, b) => a.at - b.at);
const fireExpirations = new MinHeap<FireExpiration>((a, b) => a.at - b.at);
const corpseExpirations = new MinHeap<CorpseExpiration>((a, b) => a.at - b.at);
const activeRegionsScratch: ActiveRegions = { cells: new Set() };
const visitedMonsterScratch = new Set<ServerMonster>();
const visitedNpcScratch = new Set<NpcRuntime>();
const lastSnapshotSentAt = new WeakMap<Session, number>();
const lastMetricsSentAt = new WeakMap<Session, number>();
let nextMonsterId = 1;
let nextCorpseId = 1;
let nextFireId = 1;
const globalEvents: GameEvent[] = [];
const targetedEventsByPlayer = new Map<string, GameEvent[]>();
const eventsByCell = new Map<string, GameEvent[]>();
const EMPTY_IDS: string[] = [];
const EMPTY_EVENTS: GameEvent[] = [];
const EMPTY_CORPSE_VIEWS: CorpseView[] = [];
const EMPTY_NPC_VIEWS: NpcView[] = [];
const EMPTY_TREE_VIEWS: TreeView[] = [];
const EMPTY_FISHING_NODE_VIEWS: FishingNodeView[] = [];
const EMPTY_MINING_NODE_VIEWS: MiningNodeView[] = [];
const EMPTY_HERB_NODE_VIEWS: HerbNodeView[] = [];
const EMPTY_FIRE_VIEWS: FireView[] = [];
const eventOrder = new WeakMap<GameEvent, number>();
const materializedTreeCells = new Set<string>();
const materializedStaticResourceCells = new Set<string>();
const spatialQueryCellCache = new Map<string, SpatialCellRef[]>();
const staticPruneKeepCellsScratch = new Set<string>();
const staticPruneStaleCellsScratch: string[] = [];
const socketWireBytes = new WeakMap<ExtWebSocket, number>();
const clientMessageBuckets = new WeakMap<ExtWebSocket, ClientMessageBucket>();
const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });
eventLoopDelay.enable();
const metrics: Metrics = {
  tickWindow: createMetricWindow(),
  snapshotWindow: createMetricWindow(),
  bytesOutThisSecond: 0,
  bytesOutPerSecond: 0,
  wireBytesOutPerSecond: 0,
  snapshotsSentThisSecond: 0,
  snapshotsSentPerSecond: 0,
  snapshotsSkippedBackpressureThisSecond: 0,
  snapshotsSkippedBackpressurePerSecond: 0,
  eventsDroppedThisSecond: 0,
  eventsDroppedPerSecond: 0,
  clientMessagesDroppedThisSecond: 0,
  clientMessagesDroppedPerSecond: 0,
  eventLoopDelayMs: 0,
  eventLoopDelayP95Ms: 0,
  eventLoopDelayMaxMs: 0,
  saveQueueDepth: 0,
  saveFlushMs: 0,
  saveFlushPlayers: 0,
  saveInFlight: 0,
  lastBytesAt: performance.now()
};
let saveQueued = false;
let saveInFlight = false;
const dirtyPlayerKeys = new Set<string>();
let snapshotSequence = 0;
let nextEventOrder = 1;
let lastStaticResourcePruneAt = 0;
const snapshotCaches = new WeakMap<Session, SnapshotCache>();

for (const spawn of MONSTER_SPAWNS) {
  spawnMonster(spawn);
}
spawnNpcs();
rebuildStaticSpatialIndex();

const wss = new WebSocketServer({
  port: PORT,
  perMessageDeflate: WS_COMPRESSION
    ? {
        clientNoContextTakeover: true,
        concurrencyLimit: 8,
        serverNoContextTakeover: true,
        threshold: WS_COMPRESSION_THRESHOLD
      }
    : false
});
console.log(`Waystone server listening on ws://0.0.0.0:${PORT}`);

wss.on("connection", (rawSocket: WebSocket) => {
  const socket = rawSocket as ExtWebSocket;
  socket.isAlive = true;
  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (raw: RawData) => {
    const now = performance.now();
    if (rawByteLength(raw) > CLIENT_MESSAGE_MAX_BYTES) {
      metrics.clientMessagesDroppedThisSecond += 1;
      return;
    }
    if (!acceptClientMessage(socket, now)) {
      metrics.clientMessagesDroppedThisSecond += 1;
      return;
    }
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }
    const session = clients.get(socket);
    if (message.type === "characters") return sendCharacterRoster(socket);
    if (message.type === "deleteCharacter") return deleteCharacter(socket, String(message.name ?? ""));
    if (message.type === "join") return joinWorld(socket, message);
    if (!session) return;

    if (message.type === "input") {
      session.input = sanitizeInput(message.input);
      session.lastInputAt = now;
    }
    if (message.type === "target") setTarget(session.player, message.id);
    if (message.type === "ability") useAbility(session.player);
    if (message.type === "useClassAbility") useClassAbility(session.player, String(message.id ?? ""));
    if (message.type === "loot") lootAdjacent(session.player);
    if (message.type === "lootCorpse") lootCorpse(session.player, String(message.id ?? ""));
    if (message.type === "buy") buyItem(session.player, String(message.item ?? ""));
    if (message.type === "talkNpc") talkNpc(session.player, String(message.id ?? ""));
    if (message.type === "cutTree") cutTree(session.player, String(message.id ?? ""));
    if (message.type === "fishNode") fishNode(session.player, String(message.id ?? ""));
    if (message.type === "mineNode") mineNode(session.player, String(message.id ?? ""));
    if (message.type === "gatherHerb") gatherHerb(session.player, String(message.id ?? ""));
    if (message.type === "brewPotion") brewPotion(session.player);
    if (message.type === "setClass") setClass(session.player, String(message.classKey ?? ""));
    if (message.type === "makeFire") makeFire(session.player, String(message.logItem ?? "logs"));
    if (message.type === "cookFish") cookFish(session.player, String(message.id ?? ""));
    if (E2E_TEST && message.type === "e2eGrantItems") grantE2EItems(session.player, message);
    if (E2E_TEST && message.type === "e2eEmitEvents") emitE2EEvents(session.player, message);
    if (message.type === "eatItem") eatItem(session.player, String(message.item ?? ""));
    if (message.type === "useItem") useItem(session.player, String(message.item ?? ""), message.ctx ?? {});
    if (message.type === "chat") chat(session.player, String(message.text ?? ""));
    if (message.type === "respawn") respawn(session.player);
  });

  socket.on("close", () => {
    const session = clients.get(socket);
    if (session) {
      if (!session.transient && (!E2E_TEST || !session.player.name.startsWith("e2e_"))) persistPlayer(session.player);
      clients.delete(socket);
      playersById.delete(session.player.id);
      publicPlayerViewCache.delete(session.player.id);
      removeFromSpatial(spatial.players, session.player);
      event("system", `${session.player.name} left the world.`);
    }
  });

  socket.on("error", () => {
    socket.close();
  });
});

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.08, (now - last) / 1000);
  last = now;
  const started = performance.now();
  updatePlayers(dt, now);
  const activeRegions = occupiedRegions();
  updateNpcs(dt, now, activeRegions);
  updateResourceRespawns(now);
  updateFires(now);
  updateCorpseExpirations(now);
  refreshSpatialCellMetric();
  updateMonsters(dt, now, activeRegions);
  recordSample(metrics.tickWindow, performance.now() - started);
}, 50);

setInterval(() => {
  const started = performance.now();
  broadcastState();
  recordSample(metrics.snapshotWindow, performance.now() - started);
  globalEvents.length = 0;
  targetedEventsByPlayer.clear();
  eventsByCell.clear();
}, 75);

setInterval(() => {
  persistOnlinePlayers();
}, 10000);

setInterval(() => {
  for (const { socket } of clients.values()) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 15000);

function joinWorld(socket: ExtWebSocket, message: { type: "join"; name: string; fresh?: boolean; transient?: boolean }): void {
  const name = cleanName(message.name);
  const transient = Boolean(message.transient && ALLOW_TRANSIENT_PLAYERS);
  const saved = transient ? undefined : db.players[name.toLowerCase()];
  const player = saved && !message.fresh ? hydratePlayer(saved) : createPlayer(name);
  player.id = crypto.randomUUID();
  player.online = true;
  player.targetId = null;
  player.lastAttack = 0;
  player.cooldowns = { ability: 0 };
  player.abilityCooldowns = {};
  player.abilityBuffs = {};
  player.action = null;
  player.portalReadyAt = 0;
  player.dead = player.hp <= 0;
  player.wellFedUntil = Number(player.wellFedUntil ?? 0);
  player.foodRegenUntil = Number(player.foodRegenUntil ?? 0);

  clients.set(socket, { socket, player, input: sanitizeInput({}), lastInputAt: performance.now(), transient });
  playersById.set(player.id, player);
  addToSpatial(spatial.players, player);
  socket.send(JSON.stringify({ type: "welcome", id: player.id, maps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }));
  event("system", `${player.name} entered the world.`);
}

function sendCharacterRoster(socket: ExtWebSocket): void {
  const characters: CharacterSummary[] = Object.values(db.players)
    .map((player) => ({
      name: player.name,
      level: Number(player.level ?? 1),
      gold: Number(player.gold ?? 0),
      updatedAt: player.updatedAt ?? null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  socket.send(JSON.stringify({ type: "characters", characters }));
}

function deleteCharacter(socket: ExtWebSocket, rawName: string): void {
  const name = cleanName(rawName);
  const key = name.toLowerCase();
  const online = [...clients.values()].some((session) => session.player.name.toLowerCase() === key);
  if (!db.players[key] || online) {
    socket.send(JSON.stringify({ type: "characterDeleted", ok: false, name }));
    return;
  }
  delete db.players[key];
  dirtyPlayerKeys.delete(key);
  void unlink(playerFilePath(key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") console.error(`Failed to delete character save for ${name}:`, error);
  });
  socket.send(JSON.stringify({ type: "characterDeleted", ok: true, name }));
  sendCharacterRoster(socket);
}

function createPlayer(name: string): ServerPlayer {
  const spec = ADVENTURER;
  return {
    id: "",
    name,
    classKey: "adventurer",
    floor: START.floor,
    x: START.x,
    y: START.y,
    dir: "down",
    moving: false,
    level: 1,
    xp: 0,
    hp: spec.maxHp,
    mana: spec.maxMana,
    maxHp: spec.maxHp,
    maxMana: spec.maxMana,
    gold: 30,
    weaponTier: 0,
    armorTier: 0,
    wellFedUntil: 0,
    foodRegenUntil: 0,
    inventory: createInventory(),
    carriedWeight: 0,
    inventoryRevision: 0,
    quests: createQuestState(),
    questRevision: 0,
    skills: createSkillState(),
    skillRevision: 0,
    online: false,
    targetId: null,
    lastAttack: 0,
    cooldowns: { ability: 0 },
    abilityCooldowns: {},
    abilityBuffs: {},
    action: null,
    portalReadyAt: 0,
    dead: false,
    unlockedClasses: [],
    classesRevision: 0
  };
}

function hydratePlayer(saved: SavedPlayer): ServerPlayer {
  const player = { ...createPlayer(saved.name), ...saved } as ServerPlayer;
  player.unlockedClasses = Array.isArray(saved.unlockedClasses)
    ? saved.unlockedClasses.filter((key) => CLASSES[key] && key !== "adventurer")
    : [];
  // Only keep an equipped class the player still has unlocked; otherwise revert.
  player.classKey =
    saved.classKey && (saved.classKey === "adventurer" || player.unlockedClasses.includes(saved.classKey))
      ? saved.classKey
      : "adventurer";
  player.skills = normalizeSkillState(player.skills);
  recalculateVitals(player);
  player.hp = clamp(player.hp, 1, player.maxHp);
  player.mana = clamp(player.mana, 0, player.maxMana);
  player.quests = normalizeQuestState(player.quests);
  player.inventory = normalizeInventory(player.inventory);
  refreshCarriedWeight(player);
  player.inventoryRevision = 0;
  player.questRevision = 0;
  player.skillRevision = 0;
  player.classesRevision = 0;
  player.wellFedUntil = Number(player.wellFedUntil ?? 0);
  player.foodRegenUntil = Number(player.foodRegenUntil ?? 0);
  return player;
}

function updatePlayers(dt: number, now: number): void {
  for (const session of clients.values()) {
    const { player } = session;
    const input = now - session.lastInputAt > 280 ? sanitizeInput({}) : session.input;
    player.moving = false;
    if (player.dead) continue;
    const oldFloor = player.floor;
    const oldX = player.x;
    const oldY = player.y;
    const spec = classOf(player);
    let speed = spec.speed + (isWellFed(player, now) ? 0.25 : 0);
    speed *= encumbranceMultiplier(player.carriedWeight);
    if (now < (player.abilityBuffs?.sprint?.until ?? 0)) {
      speed *= ABILITIES["sprint"]?.speedMultiplier ?? 1;
    } else if (player.abilityBuffs?.sprint) {
      delete player.abilityBuffs.sprint;
    }
    if (now < (player.abilityBuffs?.fleetFoot?.until ?? 0)) {
      speed *= 1.25;
    } else if (player.abilityBuffs?.fleetFoot) {
      delete player.abilityBuffs.fleetFoot;
    }
    if (now < (player.abilityBuffs?.ironClad?.until ?? 0)) {
      speed *= 0.85;
    } else if (player.abilityBuffs?.ironClad) {
      delete player.abilityBuffs.ironClad;
    }
    if (player.slowUntil && now < player.slowUntil) {
      speed *= player.slowMult ?? 1;
    } else if (player.slowUntil) {
      player.slowUntil = 0;
    }

    const hasMoveVector = input.moveX !== 0 || input.moveY !== 0;
    let dx = hasMoveVector ? Number(input.moveX) : Number(input.right) - Number(input.left);
    let dy = hasMoveVector ? Number(input.moveY) : Number(input.down) - Number(input.up);
    if ((dx || dy) && !isStunned(player)) {
      player.action = null;
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;
      player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      moveEntity(player, dx * speed * dt, dy * speed * dt);
    }

    const portal = now >= player.portalReadyAt ? portalFor(player.floor, player.x, player.y) : null;
    if (portal) {
      player.floor = portal.floor;
      player.x = portal.x;
      player.y = portal.y;
      player.portalReadyAt = now + 650;
      player.targetId = null;
      systemToPlayer(player, `${player.name} changes depth.`);
    } else if (now >= player.portalReadyAt && tileAt(player.floor, Math.floor(player.x), Math.floor(player.y)) === "K") {
      // The sealed Jungle Vault — a Tier-1 dungeon hook (no instance yet).
      player.portalReadyAt = now + 4000;
      event("float", "The Jungle Vault is sealed... for now.", player.x, player.y - 0.6, player.floor, "#c8e6a0");
    }
    if (player.floor !== oldFloor || player.x !== oldX || player.y !== oldY) {
      updateSpatialCell(spatial.players, player, oldFloor, oldX, oldY);
    }

    if (now < player.foodRegenUntil && player.hp < player.maxHp) {
      player.hp = clamp(player.hp + dt * 2.8, 0, player.maxHp);
    }
    const secondWind = player.abilityBuffs?.second_wind;
    if (secondWind && now < secondWind.until) {
      player.hp = clamp(player.hp + secondWind.healPerMs * dt * 1000, 0, player.maxHp);
    } else if (secondWind) {
      delete player.abilityBuffs.second_wind;
    }
    player.mana = clamp(player.mana + dt * 2.5, 0, player.maxMana);
    autoAttack(player, now);
    updatePlayerAction(player, now);
  }
}

function updateMonsters(dt: number, now: number, activeRegions: ActiveRegions): void {
  const visited = visitedMonsterScratch;
  visited.clear();
  for (const cell of activeRegions.cells) {
    const cellMonsters = monstersByCell.get(cell);
    if (!cellMonsters) continue;
    for (const monster of cellMonsters) {
      if (visited.has(monster)) continue;
      visited.add(monster);
      const oldFloor = monster.floor;
      const oldX = monster.x;
      const oldY = monster.y;
      monster.moving = false;
      if (monster.deadUntil) {
        if (now >= monster.deadUntil) respawnMonster(monster);
        continue;
      }
      const catalog = MONSTERS[monster.type];
      if (!catalog) continue;

    // Hidden burrower (Dust Burrower): inert and invisible until a player steps
    // adjacent, then it bursts out for heavy damage + a stun.
    if (monster.hidden) {
      const victim = nearestPlayer(monster, 1.3);
      if (victim && !victim.dead && !isSafeZone(victim.floor, victim.x, victim.y)) {
        monster.hidden = false;
        monster.lastAttack = now;
        const burst = Math.max(1, roll(catalog.damage) - armorReduction(victim));
        event("effect", "hit", monster.x, monster.y, monster.floor, "#d9a441", monster.id, victim.id);
        event("float", "Ambush!", monster.x, monster.y - 0.6, monster.floor, "#f0b24a");
        damagePlayer(victim, burst, catalog.name);
        if (catalog.stunMs) applyPlayerStun(victim, catalog.stunMs);
      }
      continue; // stays buried (and unrendered) until triggered
    }

    tickMonsterStatus(monster, now);
    if (monster.deadUntil) continue; // burn may have killed it this tick

    // Taunt (Provoke) overrides aggro to the taunting player while it lasts.
    let target = nearestPlayer(monster, catalog.aggro);
    if (monster.tauntUntil && now < monster.tauntUntil && monster.tauntBy) {
      const taunter = playerById(monster.tauntBy);
      if (taunter && !taunter.dead && taunter.floor === monster.floor && !isSafeZone(taunter.floor, taunter.x, taunter.y)) {
        target = taunter;
      }
    }
    // Pack alert: honor a partner's call even if the player is out of aggro range.
    if (!target && monster.alertUntil && now < monster.alertUntil && monster.alertTarget) {
      const ally = playerById(monster.alertTarget);
      if (ally && !ally.dead && ally.floor === monster.floor && !isSafeZone(ally.floor, ally.x, ally.y)) target = ally;
    }
    // Pack hunters: an aggroed member alerts nearby same-type members to the kill.
    if (catalog.pack && target && !isSafeZone(target.floor, target.x, target.y)) {
      forEachSpatial(spatial.monsters, monster.floor, monster.x, monster.y, 8, (other) => {
        if (other === monster || other.deadUntil || other.hidden || other.type !== monster.type || other.floor !== monster.floor) return;
        if (distanceSq(monster, other) <= 64) {
          other.alertUntil = now + 5000;
          other.alertTarget = target.id;
        }
      });
    }
    if (!target || isSafeZone(target.floor, target.x, target.y)) {
      if (!(monster.freezeUntil && now < monster.freezeUntil) && !(monster.snareUntil && now < monster.snareUntil)) {
        wanderMonster(monster, catalog, dt, now);
      }
      continue;
    }

    const frozen = Boolean(monster.freezeUntil && now < monster.freezeUntil);
    const snared = Boolean(monster.snareUntil && now < monster.snareUntil);
    const distSq = distanceSq(monster, target);
    const rangeSq = catalog.range * catalog.range;

    // Ranged turret (Mire Spitter): anchored, fires a slowing projectile on sight.
    if (catalog.ranged) {
      if (!frozen && distSq <= rangeSq && now - monster.lastAttack >= catalog.attackMs && hasLineOfSight(monster.floor, monster.x, monster.y, target.x, target.y)) {
        monster.lastAttack = now;
        monster.attackUntil = now + MONSTER_ATTACK_ANIM_MS;
        monster.dir = facing(monster, target);
        const shot = Math.max(1, roll(catalog.damage) - armorReduction(target));
        if (rollDodge(target)) {
          addSkillXp(target, "agility", Math.max(1, shot));
          event("float", "Dodge!", target.x, target.y - 0.55, target.floor, "#a0e8ff");
        } else {
          event("projectile", "spit", target.x, target.y, target.floor, "#9ad36b", monster.id, target.id, { fromX: monster.x, fromY: monster.y });
          damagePlayer(target, shot, catalog.name);
          if (catalog.slowPct) applyPlayerSlow(target, catalog.slowPct, catalog.slowMs ?? 1500);
          if (catalog.weakenPct) applyPlayerWeaken(target, catalog.weakenPct, catalog.weakenMs ?? 4000);
        }
      }
      continue; // anchored — never chases or melees
    }

    if (distSq > rangeSq && !frozen && !snared) {
      const dist = Math.sqrt(distSq);
      const dx = (target.x - monster.x) / dist;
      const dy = (target.y - monster.y) / dist;
      moveEntity(monster, dx * catalog.speed * dt, dy * catalog.speed * dt);
      updateMonsterCell(monster, oldFloor, oldX, oldY);
    }

    const meleeRange = catalog.range + 0.15;
    if (!frozen && distSq <= meleeRange * meleeRange && now - monster.lastAttack >= catalog.attackMs) {
      monster.lastAttack = now;
      monster.attackUntil = now + MONSTER_ATTACK_ANIM_MS;
      monster.dir = facing(monster, target);
      // Gas cloud (Volatile Flask) makes the monster miss sometimes.
      if (monster.inaccurateUntil && now < monster.inaccurateUntil && Math.random() < 0.2) {
        event("float", "Miss", monster.x, monster.y - 0.5, monster.floor, "#a8a29e");
        continue;
      }
      const damage = Math.max(1, roll(catalog.damage) - armorReduction(target));
      if (rollDodge(target)) {
        addSkillXp(target, "agility", Math.max(1, damage));
        event("float", "Dodge!", target.x, target.y - 0.55, target.floor, "#a0e8ff");
        continue;
      }
      damagePlayer(target, damage, catalog.name);
    }
  }
  }
}

function occupiedRegions(): ActiveRegions {
  const regions = activeRegionsScratch;
  regions.cells.clear();
  for (const cellKey of spatial.players.keys()) {
    for (const cell of activeRegionCellsForPlayerCell(cellKey)) regions.cells.add(cell);
  }
  return regions;
}

function activeRegionCellsForPlayerCell(playerCellKey: string): string[] {
  const cached = activeRegionCellsByPlayerCell.get(playerCellKey);
  if (cached) return cached;
  const [floorText, cxText, cyText] = playerCellKey.split(":");
  const floor = Number(floorText);
  const playerCx = Number(cxText);
  const playerCy = Number(cyText);
  const cells: string[] = [];
  for (let cy = playerCy - ACTIVE_REGION_CELL_MARGIN; cy <= playerCy + ACTIVE_REGION_CELL_MARGIN; cy += 1) {
    for (let cx = playerCx - ACTIVE_REGION_CELL_MARGIN; cx <= playerCx + ACTIVE_REGION_CELL_MARGIN; cx += 1) {
      cells.push(`${floor}:${cx}:${cy}`);
    }
  }
  activeRegionCellsByPlayerCell.set(playerCellKey, cells);
  if (activeRegionCellsByPlayerCell.size > SPATIAL_QUERY_CACHE_ENTRIES) {
    const oldest = activeRegionCellsByPlayerCell.keys().next().value;
    if (oldest) activeRegionCellsByPlayerCell.delete(oldest);
  }
  return cells;
}

// Apply per-tick status effects (currently the burning DoT) and let it kill.
function tickMonsterStatus(monster: ServerMonster, now: number): void {
  if (monster.burnUntil && now < monster.burnUntil && monster.burnNextAt && now >= monster.burnNextAt) {
    monster.burnNextAt = now + 1000;
    const burner = monster.burnBy ? playerById(monster.burnBy) : null;
    const dmg = monster.burnPerTick ?? 0;
    if (burner && dmg > 0) damageMonster(burner, monster, dmg, "flare");
  } else if (monster.burnUntil && now >= monster.burnUntil) {
    monster.burnUntil = 0;
  }
}

function playerById(id: string): ServerPlayer | null {
  return playersById.get(id) ?? null;
}

function autoAttack(player: ServerPlayer, now: number): void {
  if (isStunned(player)) return;
  const monster = player.targetId == null ? undefined : monsters.get(player.targetId);
  if (!monster || monster.deadUntil || monster.floor !== player.floor) return;
  const spec = ADVENTURER;
  const ranged = playerHasCapability(player, "ranged");
  const distSq = distanceSq(player, monster);
  if (ranged) {
    // Bow attack: fire up to RANGED_RANGE tiles with clear line of sight.
    if (distSq > RANGED_RANGE * RANGED_RANGE) return;
    if (now - player.lastAttack < spec.attackMs) return;
    if (!hasLineOfSight(player.floor, player.x, player.y, monster.x, monster.y)) return;
    player.lastAttack = now;
    const damage = Math.max(1, Math.round((roll([6, 11]) + skillLevel(player, "ranged") + wellFedPower(player)) * physicalMult(player)));
    addSkillXp(player, "ranged", Math.max(1, Math.floor(damage * 1.5)));
    fireProjectile(player, monster, damage, "arrow");
    return;
  }
  if (distSq > spec.range * spec.range) return;
  if (now - player.lastAttack < spec.attackMs) return;
  player.lastAttack = now;
  const damage = Math.max(1, Math.round((roll(spec.attackDamage) + skillLevel(player, "attack") + player.weaponTier * (SHOP["weapon"]!.damageBonus ?? 0) + wellFedPower(player)) * physicalMult(player)));
  addSkillXp(player, "attack", Math.max(1, Math.floor(damage * 1.5)));
  damageMonster(player, monster, damage, "hit");
}

function useAbility(player: ServerPlayer): void {
  if (player.dead || isStunned(player)) return;
  const now = performance.now();
  const spec = ADVENTURER;
  const monster = player.targetId == null ? undefined : monsters.get(player.targetId);
  if (!monster || monster.deadUntil || monster.floor !== player.floor) return;
  if (distanceSq(player, monster) > spec.magicRange * spec.magicRange) return;
  if (now < player.cooldowns.ability) return;
  if (player.mana < spec.abilityCost) return;

  player.cooldowns.ability = now + spec.abilityMs;
  player.mana -= spec.abilityCost;
  const damage = roll(spec.abilityDamage) + skillLevel(player, "magic") + wellFedPower(player);
  addSkillXp(player, "magic", Math.max(1, Math.floor(damage * 1.8)));
  damageMonster(player, monster, damage, "flare");
}

const DIR_VECTORS: Record<Direction, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

function monstersInRadius(floor: number, cx: number, cy: number, radius: number): ServerMonster[] {
  const hits: ServerMonster[] = [];
  const radiusSq = radius * radius;
  forEachSpatial(spatial.monsters, floor, cx, cy, radius, (monster) => {
    if (monster.deadUntil || monster.floor !== floor) return;
    const dx = monster.x - cx;
    const dy = monster.y - cy;
    if (dx * dx + dy * dy <= radiusSq) hits.push(monster);
  });
  return hits;
}

function applyBurn(player: ServerPlayer, monster: ServerMonster, durationMs: number, perTick: number): void {
  const now = performance.now();
  monster.burnUntil = now + durationMs;
  monster.burnPerTick = perTick;
  monster.burnNextAt = now + 1000;
  monster.burnBy = player.id;
}

// Move the player up to `tiles` tiles along their facing, stopping before the
// first blocked tile or occupied monster tile.
function dashPlayer(player: ServerPlayer, tiles: number): void {
  const dir = DIR_VECTORS[player.dir];
  const startX = Math.floor(player.x);
  const startY = Math.floor(player.y);
  let destX = player.x;
  let destY = player.y;
  for (let step = 1; step <= tiles; step += 1) {
    const tx = startX + dir.x * step;
    const ty = startY + dir.y * step;
    if (isBlockedTile(tileAt(player.floor, tx, ty))) break;
    let occupied = false;
    forEachSpatial(spatial.monsters, player.floor, tx + 0.5, ty + 0.5, 1, (monster) => {
      if (!monster.deadUntil && monster.floor === player.floor && Math.floor(monster.x) === tx && Math.floor(monster.y) === ty) occupied = true;
    });
    if (occupied) break;
    destX = tx + 0.5;
    destY = ty + 0.5;
  }
  player.x = destX;
  player.y = destY;
}

function useClassAbility(player: ServerPlayer, id: string): void {
  if (player.dead || isStunned(player)) return;
  const spec = ABILITIES[id];
  if (!spec) return;
  const classSpec = CLASSES[player.classKey ?? "adventurer"] ?? CLASSES["adventurer"]!;
  if (!classSpec.abilities?.includes(id)) return;
  const now = performance.now();
  if (!player.abilityCooldowns) player.abilityCooldowns = {};
  if (!player.abilityBuffs) player.abilityBuffs = {};
  if (now < (player.abilityCooldowns[id] ?? 0)) return;
  const manaCost = spec.manaCost ?? 0;

  tryUseComposedAbility(player, spec, now, manaCost);
}

function tryUseComposedAbility(player: ServerPlayer, spec: AbilitySpec, now: number, manaCost: number): boolean {
  if (!spec.targeting || !spec.effects) return false;
  const resolution = resolveAbilityTargeting(player, spec);
  if (!resolution) return true;
  if (!abilityGuardsPass(player, spec)) return true;
  if (player.mana < manaCost) return true;

  player.abilityCooldowns[spec.id] = now + spec.cooldownMs;
  player.mana -= manaCost;

  if (spec.projectile) {
    event(
      "projectile",
      spec.projectile.kind,
      resolution.origin.x,
      resolution.origin.y,
      player.floor,
      spec.projectile.color ?? null,
      player.id,
      spec.projectile.targetEnemy ? resolution.targetId : null,
      { fromX: player.x, fromY: player.y }
    );
  }

  let affected = 0;
  for (const effect of spec.effects) affected += applyAbilityEffect(player, resolution, effect, spec, now);
  if (spec.vfx) event("effect", spec.vfx.effectKind, resolution.origin.x, resolution.origin.y, player.floor, spec.vfx.color ?? null, player.id);
  if (spec.animation) emitAbilityAnimation(player, resolution, spec);
  if (spec.float) {
    const text = (affected === 0 && spec.float.noTargetsText ? spec.float.noTargetsText : spec.float.text)
      .replaceAll("{name}", player.name)
      .replaceAll("{heal}", String(resolution.heal));
    event("float", text, resolution.origin.x, resolution.origin.y + (spec.float.yOffset ?? -0.5), player.floor, spec.float.color);
  }
  return true;
}

function emitAbilityAnimation(player: ServerPlayer, resolution: AbilityResolution, spec: AbilitySpec): void {
  const animation = spec.animation;
  if (!animation) return;
  const target = resolution.targets[0];
  const point =
    animation.attach === "self"
      ? { x: player.x, y: player.y }
      : animation.attach === "target" && target
        ? { x: target.x, y: target.y }
        : resolution.origin;
  if (animation.attach === "target" && !target) return;
  event("ability_vfx", animation.kind, point.x, point.y, player.floor, animation.color ?? null, player.id, target?.id ?? resolution.targetId, {
    fromX: player.x,
    fromY: player.y,
    scale: animation.scale,
    durationMs: animation.durationMs
  });
}

function resolveAbilityTargeting(player: ServerPlayer, spec: AbilitySpec): AbilityResolution | null {
  if (!spec.targeting) return null;
  if (spec.targeting.mode === "self" || spec.targeting.mode === "dash") {
    return { origin: { x: player.x, y: player.y }, targets: [], targetId: null, heal: 0 };
  }
  if (spec.targeting.mode === "enemy") {
    const monster = player.targetId == null ? undefined : monsters.get(player.targetId);
    if (!monster || monster.deadUntil || monster.floor !== player.floor) return null;
    const range = spec.targeting.range ?? spec.range ?? classOf(player).range;
    if (distanceSq(player, monster) > range * range) return null;
    if (spec.targeting.requiresLineOfSight && !hasLineOfSight(player.floor, player.x, player.y, monster.x, monster.y)) return null;
    return { origin: { x: monster.x, y: monster.y }, targets: [monster], targetId: monster.id, heal: 0 };
  }
  if (spec.targeting.mode === "aoe_self") {
    const targets = monstersInRadius(player.floor, player.x, player.y, spec.targeting.radius);
    return { origin: { x: player.x, y: player.y }, targets, targetId: null, heal: 0 };
  }
  if (spec.targeting.mode === "aoe_front") {
    const dir = DIR_VECTORS[player.dir];
    const x = player.x + dir.x * spec.targeting.offset;
    const y = player.y + dir.y * spec.targeting.offset;
    return { origin: { x, y }, targets: monstersInRadius(player.floor, x, y, spec.targeting.radius), targetId: null, heal: 0 };
  }
  if (spec.targeting.mode === "aoe_point") {
    const target = player.targetId == null ? undefined : monsters.get(player.targetId);
    const range = spec.targeting.range ?? spec.range ?? Infinity;
    if (target && !target.deadUntil && target.floor === player.floor && distanceSq(player, target) <= range * range) {
      return {
        origin: { x: target.x, y: target.y },
        targets: monstersInRadius(player.floor, target.x, target.y, spec.targeting.radius),
        targetId: target.id,
        heal: 0
      };
    }
    const dir = DIR_VECTORS[player.dir];
    const x = player.x + dir.x * spec.targeting.offset;
    const y = player.y + dir.y * spec.targeting.offset;
    return { origin: { x, y }, targets: monstersInRadius(player.floor, x, y, spec.targeting.radius), targetId: null, heal: 0 };
  }
  return null;
}

function abilityGuardsPass(player: ServerPlayer, spec: AbilitySpec): boolean {
  for (const guard of spec.guards ?? []) {
    if (guard === "requireBelowMaxHp" && player.hp >= player.maxHp) return false;
  }
  return true;
}

function applyAbilityEffect(
  player: ServerPlayer,
  resolution: AbilityResolution,
  effect: AbilityEffect,
  spec: AbilitySpec,
  now: number
): number {
  if (effect.kind === "damage") {
    let hits = 0;
    for (const monster of resolution.targets) {
      const damageRange = effect.amount ?? spec.damage;
      if (!damageRange) continue;
      const skill = effect.skill ?? spec.skill ?? "attack";
      let damage = roll(damageRange) + skillLevel(player, skill) + wellFedPower(player);
      const damageType = effect.damageType ?? (skill === "magic" ? "magic" : "physical");
      if (damageType !== "magic") damage = Math.max(1, Math.round(damage * physicalMult(player)));
      const bonus = effect.conditionalBonus;
      if (bonus?.when === "behindTarget" && player.dir === monster.dir) {
        damage = Math.round(damage * bonus.multiply);
        if (bonus.float) event("float", bonus.float.text, monster.x, monster.y + (bonus.float.yOffset ?? -0.5), monster.floor, bonus.float.color);
      }
      addSkillXp(player, skill, Math.max(1, Math.floor(damage * (effect.xpFactor ?? 1.5))));
      damageMonster(player, monster, damage, effect.effectKind ?? spec.effectKind ?? "flare");
      hits += 1;
    }
    return hits;
  }

  if (effect.kind === "debuff_enemy") {
    const durationMs = effect.durationMs ?? spec.durationMs;
    let affected = 0;
    for (const monster of resolution.targets) {
      if (monster.deadUntil) continue;
      if (effect.status === "snare") monster.snareUntil = now + durationMs;
      if (effect.status === "freeze") monster.freezeUntil = now + durationMs;
      if (effect.status === "inaccurate") monster.inaccurateUntil = now + durationMs;
      if (effect.status === "burn") applyBurn(player, monster, durationMs, effect.perTick ?? 1);
      if (effect.float) event("float", effect.float.text, monster.x, monster.y + (effect.float.yOffset ?? -0.5), monster.floor, effect.float.color);
      affected += 1;
    }
    return affected;
  }

  if (effect.kind === "buff_self") {
    const durationMs = effect.durationMs ?? spec.durationMs;
    if (effect.cleanse?.includes("slow")) player.slowUntil = 0;
    player.abilityBuffs[effect.buff] = { until: now + durationMs };
    return 1;
  }
  if (effect.kind === "heal") {
    const instant = Math.max(1, Math.round(player.maxHp * (effect.fraction ?? spec.healFraction ?? 0)) + (effect.scaleSkill ? skillLevel(player, effect.scaleSkill) : 0));
    player.hp = clamp(player.hp + instant, 0, player.maxHp);
    resolution.heal += instant;
    if (effect.scaleSkill === "alchemy") addSkillXp(player, "alchemy", 4);
    return 1;
  }
  if (effect.kind === "heal_over_time") {
    const durationMs = effect.durationMs ?? spec.durationMs;
    const totalHeal = Math.max(1, Math.round(player.maxHp * (effect.fraction ?? spec.healFraction ?? 0)));
    player.abilityBuffs[effect.buff] = { until: now + durationMs, healPerMs: totalHeal / durationMs };
    return 1;
  }
  if (effect.kind === "dash") {
    const tiles = effect.tiles ?? (spec.targeting?.mode === "dash" ? spec.targeting.tiles : 1);
    dashPlayer(player, tiles);
    resolution.origin.x = player.x;
    resolution.origin.y = player.y;
    return 1;
  }
  if (effect.kind === "taunt") {
    const durationMs = effect.durationMs ?? spec.durationMs;
    for (const monster of resolution.targets) {
      monster.tauntUntil = now + durationMs;
      monster.tauntBy = player.id;
    }
    return resolution.targets.length;
  }
  return 0;
}

function damageMonster(player: ServerPlayer, monster: ServerMonster, damage: number, kind: string): void {
  const armor = MONSTERS[monster.type]?.armor ?? 0;
  const dealt = Math.max(1, damage - armor);
  monster.hp = clamp(monster.hp - dealt, 0, monster.maxHp);
  // Taking damage shatters a freeze (per Frost Nova design).
  if (monster.freezeUntil) monster.freezeUntil = 0;
  event("effect", kind, monster.x, monster.y, monster.floor, null, player.id, monster.id, { fromX: player.x, fromY: player.y });
  event("hit", dealt, monster.x, monster.y - 0.45, monster.floor, kind === "flare" ? "#8fd8ff" : "#ffd166", player.id, monster.id);
  if (monster.hp > 0) return;

  const catalog = MONSTERS[monster.type];
  if (!catalog) return;
  monster.deadUntil = performance.now() + (monster.type === "boss" ? 45000 : 18000);
  removeFromSpatial(spatial.monsters, monster);
  player.xp += catalog.xp;
  updateQuestProgress(player, monster);
  awardLevels(player);

  const corpse: Corpse = {
    id: `c${nextCorpseId++}`,
    floor: monster.floor,
    x: monster.x,
    y: monster.y,
    gold: roll(catalog.gold),
    label: catalog.name,
    kind: "corpse",
    items: [...rollQuestDrops(monster.type), ...rollPotionDrop(monster.type)]
  };
  corpses.set(corpse.id, corpse);
  addToCellIndex(corpsesByCell, corpse);
  addToSpatial(spatial.corpses, corpse);
  scheduleCorpseExpiration(corpse, performance.now() + CORPSE_DECAY_MS);
  systemToPlayer(player, `${player.name} defeated ${catalog.name}.`);
}

function rollQuestDrops(monsterType: string): Array<{ id: string; qty: number }> {
  const drop = QUEST_DROPS[monsterType];
  if (!drop || Math.random() >= drop.chance) return [];
  return [{ id: drop.itemId, qty: 1 }];
}

function rollPotionDrop(monsterType: string): Array<{ id: string; qty: number }> {
  if (monsterType === "boss" || Math.random() < 0.18) return [{ id: "potion", qty: 1 }];
  return [];
}

// Passive dodge: class base + Agility scaling (see dodgeChanceFor). Under E2E
// the outcome is deterministic (the player's forceDodge flag, default false) so
// existing combat tests are unaffected.
function rollDodge(player: ServerPlayer): boolean {
  if (E2E_TEST) return player.forceDodge === true;
  return Math.random() < dodgeChanceFor(player.classKey, skillLevel(player, "agility"));
}

function damagePlayer(player: ServerPlayer, damage: number, source: string): void {
  // Iron Clad mitigates incoming damage.
  if (player.abilityBuffs?.ironClad && performance.now() < player.abilityBuffs.ironClad.until) {
    damage = Math.max(1, Math.round(damage * 0.7));
  }
  player.hp = clamp(player.hp - damage, 0, player.maxHp);
  addSkillXp(player, "defense", Math.max(1, damage));
  event("hit", damage, player.x, player.y - 0.55, player.floor, "#ff6b6b", source);
  if (player.hp > 0) return;
  player.dead = true;
  player.targetId = null;
  event("system", `${player.name} was brought down by ${source}.`);
}

function lootAdjacent(player: ServerPlayer): void {
  if (player.dead) return;
  let found = 0;
  forEachSpatial(spatial.corpses, player.floor, player.x, player.y, 1.6, (corpse) => {
    if (corpse.floor !== player.floor || distanceSq(player, corpse) > 1.6 * 1.6) return;
    found += 1;
    collectCorpse(player, corpse);
  });
  if (found) event("float", `Looted ${found} corpse${found > 1 ? "s" : ""}.`, player.x, player.y, player.floor, "#ffd166");
}

function lootCorpse(player: ServerPlayer, id: string): void {
  if (player.dead) return;
  const corpse = corpses.get(id);
  if (!corpse || corpse.floor !== player.floor || distanceSq(player, corpse) > 4) return;
  collectCorpse(player, corpse);
  event("float", `Looted ${corpse.label}.`, player.x, player.y, player.floor, "#ffd166");
}

function collectCorpse(player: ServerPlayer, corpse: Corpse): void {
  for (const item of corpse.items ?? []) {
    if (!addInventoryItem(player, item.id, item.qty)) {
      systemToPlayer(player, "Your inventory is full.");
      return;
    }
  }
  player.gold += corpse.gold;
  removeCorpse(corpse);
}

function nearbyNpcOfRole(player: ServerPlayer, role: string): NpcRuntime | null {
  let best: NpcRuntime | null = null;
  let bestDistSq = Infinity;
  forEachCellIndex(npcsByCell, player.floor, player.x, player.y, 2, (npc) => {
    if (npc.role !== role || npc.floor !== player.floor) return;
    const distSq = distanceSq(player, npc);
    if (distSq <= 4 && distSq < bestDistSq) {
      best = npc;
      bestDistSq = distSq;
    }
  });
  return best;
}

function buyItem(player: ServerPlayer, item: string): void {
  if (player.dead) return;
  const role = item === "empty_flask" || item === "alchemy_kit" ? "alchemist" : "vendor";
  if (!nearbyNpcOfRole(player, role)) return;
  if (item === "weapon" && player.weaponTier === 0 && player.gold >= SHOP["weapon"]!.cost) {
    player.gold -= SHOP["weapon"]!.cost;
    player.weaponTier = 1;
    systemToPlayer(player, `${player.name} bought a better weapon.`);
  }
  if (item === "armor" && player.armorTier === 0 && player.gold >= SHOP["armor"]!.cost) {
    player.gold -= SHOP["armor"]!.cost;
    player.armorTier = 1;
    systemToPlayer(player, `${player.name} bought padded mail.`);
  }
  if (item === "potion" && player.gold >= SHOP["potion"]!.cost) {
    player.gold -= SHOP["potion"]!.cost;
    addInventoryItem(player, "potion", 1);
  }
  if (item === "axe" && !hasInventoryItem(player, "axe") && player.gold >= SHOP["axe"]!.cost) {
    if (!addInventoryItem(player, "axe", 1)) {
      systemToPlayer(player, "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["axe"]!.cost;
    systemToPlayer(player, `${player.name} bought a bronze axe.`);
  }
  if (item === "fishing_rod" && !hasInventoryItem(player, "fishing_rod") && player.gold >= SHOP["fishing_rod"]!.cost) {
    if (!addInventoryItem(player, "fishing_rod", 1)) {
      systemToPlayer(player, "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["fishing_rod"]!.cost;
    systemToPlayer(player, `${player.name} bought a fishing rod.`);
  }
  if (item === "pickaxe" && !hasInventoryItem(player, "pickaxe") && player.gold >= SHOP["pickaxe"]!.cost) {
    if (!addInventoryItem(player, "pickaxe", 1)) {
      systemToPlayer(player, "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["pickaxe"]!.cost;
    systemToPlayer(player, `${player.name} bought a bronze pickaxe.`);
  }
  if (item === "flint_steel" && !hasInventoryItem(player, "flint_steel") && player.gold >= SHOP["flint_steel"]!.cost) {
    if (!addInventoryItem(player, "flint_steel", 1)) {
      systemToPlayer(player, "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["flint_steel"]!.cost;
    systemToPlayer(player, `${player.name} bought flint and steel.`);
  }
  if (item === "empty_flask" && player.gold >= SHOP["empty_flask"]!.cost) {
    if (!addInventoryItem(player, "empty_flask", 1)) {
      systemToPlayer(player, "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["empty_flask"]!.cost;
    systemToPlayer(player, `${player.name} bought an empty flask.`);
  }
  if (item === "alchemy_kit" && !hasInventoryItem(player, "alchemy_kit") && player.gold >= SHOP["alchemy_kit"]!.cost) {
    if (!addInventoryItem(player, "alchemy_kit", 1)) {
      systemToPlayer(player, "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["alchemy_kit"]!.cost;
    systemToPlayer(player, `${player.name} bought an alchemy kit.`);
  }
  if (item === "broken_reach_map" && !hasInventoryItem(player, "broken_reach_map") && player.gold >= SHOP["broken_reach_map"]!.cost) {
    if (!addInventoryItem(player, "broken_reach_map", 1)) {
      systemToPlayer(player, "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["broken_reach_map"]!.cost;
    systemToPlayer(player, `${player.name} bought the Inked Survey of The Broken Reach.`);
  }
}

function brewPotion(player: ServerPlayer): void {
  if (player.dead) return;
  if (!nearbyNpcOfRole(player, "alchemist")) return;
  if (!hasInventoryItem(player, "alchemy_kit")) {
    event("float", "You need an alchemy kit.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  if (!hasInventoryItem(player, "herb") || !hasInventoryItem(player, "empty_flask")) {
    event("float", "You need a herb and an empty flask.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  if (!removeInventoryItem(player, "herb", 1)) return;
  if (!removeInventoryItem(player, "empty_flask", 1)) {
    addInventoryItem(player, "herb", 1);
    return;
  }
  if (!addInventoryItem(player, "potion", 1)) {
    addInventoryItem(player, "herb", 1);
    addInventoryItem(player, "empty_flask", 1);
    systemToPlayer(player, "Your inventory is full.");
    return;
  }
  addSkillXp(player, "alchemy", BREW_XP);
  event("float", `+${BREW_XP} Alchemy`, player.x, player.y - 0.55, player.floor, "#c8a8ff");
}

// --- Tier-1 classes --------------------------------------------------------

// Class switching is a safe-zone activity (Waystone floor 0 / Northwatch floor 4).
function meetsClassRequirements(player: ServerPlayer, unlock: { requires: Partial<Record<string, number>> }): boolean {
  return Object.entries(unlock.requires).every(([skill, level]) => skillLevel(player, skill) >= (level ?? 0));
}

function setClass(player: ServerPlayer, classKey: string): void {
  if (player.dead) return;
  // Class toggling is a town activity (Waystone / Northwatch) — not every safe spot.
  if (player.floor !== 0 && player.floor !== 4) {
    event("float", "You can only change class in a town.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  const target = classKey || "adventurer";
  if (target !== "adventurer" && !player.unlockedClasses.includes(target)) {
    event("float", "That class is not unlocked.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  if (!CLASSES[target]) return;
  if (player.classKey === target) return;
  player.classKey = target;
  // Drop any cooldowns/buffs tied to abilities the new class can't use.
  player.abilityCooldowns = {};
  player.abilityBuffs = {};
  recalculateVitals(player);
  player.hp = clamp(player.hp, 1, player.maxHp);
  player.mana = clamp(player.mana, 0, player.maxMana);
  systemToPlayer(player, `${player.name} takes up the ${CLASSES[target]!.label} stance.`);
  persistPlayer(player);
}

function trainWithNpc(player: ServerPlayer, npc: NpcRuntime): void {
  const unlock = CLASS_UNLOCKS.find((entry) => entry.npcId === npc.id);
  if (!unlock) return;
  if (player.unlockedClasses.includes(unlock.key)) {
    eventDialogue(player, [
      { speaker: npc.name, text: `You already walk the ${unlock.label}'s path. Equip it from your Classes panel in town.` }
    ]);
    return;
  }
  if (!meetsClassRequirements(player, unlock)) {
    const reqs = Object.entries(unlock.requires)
      .map(([skill, level]) => `${SKILLS[skill]?.label ?? skill} ${level} (you have ${skillLevel(player, skill)})`)
      .join(", ");
    eventDialogue(player, [
      { speaker: npc.name, text: unlock.requires ? `Come back when you're ready: ${reqs}.` : "Not yet." }
    ]);
    return;
  }
  player.unlockedClasses.push(unlock.key);
  markClassesChanged(player);
  persistPlayer(player);
  eventDialogue(player, [
    { speaker: npc.name, text: `It's done — you are now a ${unlock.label}. Equip the stance from your Classes panel here in town.` }
  ]);
  systemToPlayer(player, `${player.name} unlocked the ${unlock.label} class.`);
}

function respawn(player: ServerPlayer): void {
  if (!player.dead) return;
  const oldFloor = player.floor;
  const oldX = player.x;
  const oldY = player.y;
  player.floor = START.floor;
  player.x = START.x;
  player.y = START.y;
  updateSpatialCell(spatial.players, player, oldFloor, oldX, oldY);
  player.portalReadyAt = performance.now() + 650;
  player.hp = player.maxHp;
  player.mana = player.maxMana;
  player.dead = false;
  systemToPlayer(player, `${player.name} returns to the temple.`);
}

function setTarget(player: ServerPlayer, id: string): void {
  const monster = monsters.get(String(id));
  if (!monster || monster.deadUntil || monster.floor !== player.floor) return;
  player.targetId = monster.id;
}

function chat(player: ServerPlayer, text: string): void {
  const clean = text.trim().slice(0, 120);
  if (!clean) return;
  if (DEV_TOOLS && clean.startsWith("/dev")) {
    handleDevCommand(player, clean);
    return;
  }
  event("chat", `${player.name}: ${clean}`);
}

function systemToPlayer(player: ServerPlayer, text: string): void {
  event("system", text, null, null, null, null, null, null, { to: player.id });
}

// Playtest cheats (DEV_TOOLS only). Usage in chat:
//   /dev          — level all skills to 20, +1000g, plus a bow + alchemy gear
//   /dev skills N  — set every skill to level N (default 20)
//   /dev unlock    — unlock all Tier-1 classes (skip the trainers)
//   /dev gold N    — set gold to N
//   /dev help      — list commands
function handleDevCommand(player: ServerPlayer, text: string): void {
  const [, sub, arg] = text.split(/\s+/);
  const sysToPlayer = (msg: string): void => systemToPlayer(player, msg);
  if (!sub || sub === "kit") {
    devSetAllSkills(player, 20);
    player.gold += 1000;
    for (const [id, qty] of [["hunting_bow", 1], ["alchemy_kit", 1], ["empty_flask", 5], ["herb", 5]] as const) {
      if (!hasInventoryItem(player, id)) addInventoryItem(player, id, qty);
    }
    persistPlayer(player);
    sysToPlayer(`[dev] ${player.name} kitted out: all skills 20, +1000g, bow + alchemy gear. Visit a trainer, then equip in the Classes panel.`);
    return;
  }
  if (sub === "skills") {
    const level = clamp(Math.floor(Number(arg) || 20), 1, 99);
    devSetAllSkills(player, level);
    persistPlayer(player);
    sysToPlayer(`[dev] ${player.name} set all skills to level ${level}.`);
    return;
  }
  if (sub === "unlock") {
    let changed = false;
    for (const unlock of CLASS_UNLOCKS) {
      if (!player.unlockedClasses.includes(unlock.key)) {
        player.unlockedClasses.push(unlock.key);
        changed = true;
      }
    }
    if (changed) markClassesChanged(player);
    persistPlayer(player);
    sysToPlayer(`[dev] ${player.name} unlocked all classes. Equip them from the Classes panel (in a town).`);
    return;
  }
  if (sub === "gold") {
    player.gold = clamp(Math.floor(Number(arg) || 0), 0, 1_000_000);
    persistPlayer(player);
    sysToPlayer(`[dev] ${player.name} gold set to ${player.gold}.`);
    return;
  }
  sysToPlayer("[dev] commands: /dev (full kit) · /dev skills N · /dev unlock · /dev gold N");
}

function devSetAllSkills(player: ServerPlayer, level: number): void {
  const xp = xpForLevel(level);
  for (const id of Object.keys(SKILLS)) {
    (player.skills[id] ?? (player.skills[id] = { xp: 0 })).xp = xp;
  }
  markSkillChanged(player);
  recalculateVitals(player);
  player.hp = clamp(player.hp, 1, player.maxHp);
  player.mana = clamp(player.mana, 0, player.maxMana);
}

function talkNpc(player: ServerPlayer, id: string): void {
  const npc = npcs.get(id);
  if (!npc || player.dead || npc.floor !== player.floor || distanceSq(player, npc) > 2.4 * 2.4) return;

  const quest = questForGiver(npc.id);
  if (quest) {
    handleQuestDialogue(player, npc, quest);
    return;
  }

  if (npc.role === "trainer") {
    trainWithNpc(player, npc);
    return;
  }

  const dialogue = npcDialogueLines(player, npc);
  if (!dialogue) return;
  if (npc.role === "vendor") eventDialogue(player, dialogue, { opensShop: true });
  else if (npc.role === "alchemist") eventDialogue(player, dialogue, { opensAlchemist: true });
  else eventDialogue(player, dialogue, {});
}

function questForGiver(giverId: string): Quest | null {
  return QUESTS_BY_GIVER.get(giverId) ?? null;
}

function handleQuestDialogue(player: ServerPlayer, npc: NpcRuntime, quest: Quest): void {
  const state = player.quests[quest.id];
  if (!state) return;

  if (state.claimed) {
    eventDialogue(player, questDialogue(npc, player, quest, "claimed"));
    return;
  }

  if (!state.accepted) {
    state.accepted = true;
    markQuestChanged(player);
    eventDialogue(player, questDialogue(npc, player, quest, "intro"));
    event("float", "Quest accepted", player.x, player.y, player.floor, "#f7d486");
    return;
  }

  const progress = currentQuestProgress(player, quest, state);
  if (progress >= quest.targetCount) {
    if (!consumeQuestTurnIn(player, quest)) {
      eventDialogue(player, questDialogue(npc, player, quest, "missingItems"));
      return;
    }
    state.progress = quest.targetCount;
    state.complete = true;
    state.claimed = true;
    markQuestChanged(player);
    player.gold += quest.rewardGold;
    player.xp += quest.rewardXp;
    awardLevels(player);
    systemToPlayer(player, `${player.name} completed ${quest.title} and earned ${quest.rewardGold} gold.`);
    event("float", `+${quest.rewardGold}g`, player.x, player.y, player.floor, "#ffd166");
    eventDialogue(player, questDialogue(npc, player, quest, "turnIn"));
    return;
  }

  eventDialogue(player, questDialogue(npc, player, quest, "progress", progress));
}

function consumeQuestTurnIn(player: ServerPlayer, quest: Quest): boolean {
  if (quest.kind === "gather" || quest.kind === "fetch") {
    return removeInventoryItem(player, quest.itemId ?? "", quest.targetCount);
  }
  return true;
}

function currentQuestProgress(player: ServerPlayer, quest: Quest, state: QuestState): number {
  if (quest.kind === "gather" || quest.kind === "fetch") {
    return clamp(inventoryCount(player, quest.itemId ?? ""), 0, quest.targetCount);
  }
  return clamp(state.progress, 0, quest.targetCount);
}

function inventoryCount(player: ServerPlayer, id: string): number {
  return player.inventory.reduce((sum, item) => sum + (item?.id === id ? item.qty : 0), 0);
}

function questDialogue(
  npc: NpcRuntime,
  player: ServerPlayer,
  quest: Quest,
  phase: keyof QuestDialogue,
  progress = 0
): DialogueLineView[] {
  const phaseLines = quest.dialogue?.[phase];
  if (!Array.isArray(phaseLines) || phaseLines.length === 0) {
    return [{ speaker: npc.name, text: npc.dialogue }];
  }
  const item = quest.itemId ? ITEMS[quest.itemId] ?? null : null;
  const ctx: Record<string, unknown> = {
    progress,
    target: {
      count: quest.targetCount,
      remaining: Math.max(0, quest.targetCount - progress),
      item: item ? { id: item.id, label: item.label } : null
    },
    reward: { gold: quest.rewardGold, xp: quest.rewardXp },
    player: { name: player.name },
    npc: { name: npc.name }
  };
  return phaseLines.map((line) => {
    const isNpc = "npc" in line;
    return {
      speaker: isNpc ? npc.name : player.name,
      text: renderQuestLine(isNpc ? line.npc : line.player, ctx)
    };
  });
}

function renderQuestLine(text: string, ctx: Record<string, unknown>): string {
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

function cutTree(player: ServerPlayer, id: string): void {
  const candidate = treeBaseForId(id);
  if (!candidate || player.dead || candidate.floor !== player.floor || distanceSq(player, candidate) > 1.8 * 1.8) return;
  const tree = treeRuntimeForId(id);
  if (!tree || !tree.active) return;
  if (!playerHasCapability(player, "chop_tree")) {
    event("float", "You need an axe.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  const treeSpec = treeTypeSpec(tree);
  const level = skillLevel(player, "woodcutting");
  if (level < treeSpec.requiredLevel) {
    event("float", `Requires Woodcutting ${treeSpec.requiredLevel}.`, tree.x, tree.y, tree.floor, "#f7d486");
    return;
  }
  player.targetId = null;
  player.action = { type: "woodcutting", treeId: tree.id, nextAt: performance.now(), swings: 0, remaining: treeSpec.chopsRequired };
  event("float", `You start chopping ${treeSpec.label}.`, tree.x, tree.y, tree.floor, "#d8c68a");
}

function fishNode(player: ServerPlayer, id: string): void {
  const node = fishingNodeForId(id);
  if (!node || player.dead || node.floor !== player.floor || distanceSq(player, fishingApproachPoint(node)) > 1.45 * 1.45) return;
  if (!playerHasCapability(player, "fish")) {
    event("float", "You need a fishing rod.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  player.targetId = null;
  const level = skillLevel(player, "fishing");
  player.action = { type: "fishing", nodeId: node.id, nextAt: performance.now() + fishingCatchMs(level), startedAt: performance.now() };
  event("float", "You cast your line.", node.x, node.y, node.floor, "#8fd8ff");
}

function mineNode(player: ServerPlayer, id: string): void {
  const node = miningNodeForId(id);
  if (!node || player.dead || node.floor !== player.floor || distanceSq(player, miningApproachPoint(node)) > 1.45 * 1.45) return;
  if (!playerHasCapability(player, "mine")) {
    event("float", "You need a pickaxe.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  player.targetId = null;
  const level = skillLevel(player, "mining");
  player.action = { type: "mining", nodeId: node.id, nextAt: performance.now() + miningSwingMs(level), startedAt: performance.now() };
  event("float", "You swing your pickaxe.", node.x, node.y, node.floor, "#d8a86a");
}

function gatherHerb(player: ServerPlayer, id: string): void {
  const node = herbNodeForInteraction(player, id, 1.45 * 1.45);
  if (!node || !node.active) return;
  if (node.requiredLevel > 0 && skillLevel(player, "foraging") < node.requiredLevel) {
    event("float", `Requires Foraging ${node.requiredLevel}.`, node.x, node.y, node.floor, "#f7d486");
    return;
  }
  player.targetId = null;
  player.action = { type: "herbing", nodeId: node.id, nextAt: performance.now() + HERB_GATHER_MS, startedAt: performance.now() };
  event("float", "You start gathering herbs.", node.x, node.y, node.floor, "#9ee6b1");
}

// --- Item use dispatcher (Phase 2) ----------------------------------------
// useItem looks up `ITEMS[itemId].use.kind` and dispatches to a verb handler.
// Each verb owns its own validation, consumption, and effects. Authors compose
// items in content/items.yaml; adding a new verb still requires engine work.

const USE_VERBS: Record<string, (player: ServerPlayer, item: Item, ctx: UseItemCtx) => void> = {
  eat: useVerbEat,
  drink_potion: useVerbDrinkPotion,
  light_fire: useVerbLightFire,
  cook_on_fire: useVerbCookOnFire
};

function useItem(player: ServerPlayer, itemId: string, ctx: UseItemCtx = {}): void {
  if (player.dead) return;
  const item = ITEMS[itemId];
  if (!item?.use) return;
  const verb = USE_VERBS[item.use.kind];
  if (!verb) return;
  verb(player, item, ctx);
}

function applyBuffs(player: ServerPlayer, buffs: Array<{ id: string; durationMs: number }> | undefined, now: number): void {
  for (const buff of buffs ?? []) {
    if (buff.id === "well_fed") player.wellFedUntil = Math.max(player.wellFedUntil ?? 0, now + buff.durationMs);
    if (buff.id === "food_regen") player.foodRegenUntil = Math.max(player.foodRegenUntil ?? 0, now + buff.durationMs);
  }
}

function useVerbEat(player: ServerPlayer, item: Item): void {
  if (!removeInventoryItem(player, item.id, 1)) return;
  const u = item.use;
  if (u?.kind !== "eat") return;
  if (u.restoreHp) player.hp = clamp(player.hp + u.restoreHp, 0, player.maxHp);
  applyBuffs(player, u.buffs, performance.now());
  if (u.float) event("float", u.float, player.x, player.y, player.floor, "#9ee6b1");
}

function useVerbDrinkPotion(player: ServerPlayer, item: Item): void {
  if (!removeInventoryItem(player, item.id, 1)) return;
  const u = item.use;
  if (u?.kind !== "drink_potion") return;
  if (u.restoreHp) player.hp = clamp(player.hp + u.restoreHp, 0, player.maxHp);
  event("float", u.float ?? `${player.name} drinks a potion.`, player.x, player.y, player.floor, "#77e0a0");
}

function useVerbLightFire(player: ServerPlayer, item: Item, ctx: UseItemCtx): void {
  if (!hasInventoryItem(player, item.id)) return;
  const u = item.use;
  if (u?.kind !== "light_fire") return;
  const options = u.consumesAny ?? [];
  const preferred = ctx.logItem ? options.find((o) => o.item === ctx.logItem && hasInventoryItem(player, o.item)) : null;
  const choice = preferred ?? options.find((o) => hasInventoryItem(player, o.item));
  if (!choice) return;
  const qty = choice.qty ?? 1;
  if (!removeInventoryItem(player, choice.item, qty)) return;
  const placement = firePlacementAtPlayer(player);
  if (!placement) {
    addInventoryItem(player, choice.item, qty);
    event("float", "No room for a fire.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  const fire: Fire = {
    id: `fire-${nextFireId++}`,
    floor: player.floor,
    x: placement.x,
    y: placement.y,
    expiresAt: performance.now() + (FIRE_DURATION_OVERRIDE_MS ?? u.durationMs ?? FIRE_DURATION_MS),
    owner: player.name
  };
  fires.set(fire.id, fire);
  addToCellIndex(firesByCell, fire);
  addToSpatial(spatial.fires, fire);
  scheduleFireExpiration(fire);
  if (u.skill && choice.xp) addSkillXp(player, u.skill, choice.xp);
  event("effect", "fire", fire.x, fire.y, fire.floor, null, player.id, fire.id);
  event("float", "Fire lit", fire.x, fire.y, fire.floor, "#ffb35c");
}

function useVerbCookOnFire(player: ServerPlayer, item: Item, ctx: UseItemCtx): void {
  const fire = ctx.fireId == null ? undefined : fires.get(ctx.fireId);
  if (!fire || fire.floor !== player.floor || distanceSq(player, fire) > 1.9 * 1.9) return;
  if (!hasInventoryItem(player, item.id)) return;
  const u = item.use;
  const skill = (u?.kind === "cook_on_fire" ? u.skill : undefined) ?? "cooking";
  player.targetId = null;
  player.action = {
    type: "cooking",
    itemId: item.id,
    fireId: fire.id,
    nextAt: performance.now() + cookingMs(skillLevel(player, skill))
  };
  event("float", "Cooking...", fire.x, fire.y, fire.floor, "#ffcf7a");
}

function makeFire(player: ServerPlayer, logItem = "logs"): void {
  useItem(player, "flint_steel", { logItem });
}

function cookFish(player: ServerPlayer, fireId: string): void {
  useItem(player, "raw_fish", { fireId });
}

function eatItem(player: ServerPlayer, itemId: string): void {
  if (ITEMS[itemId]?.use?.kind !== "eat") return;
  useItem(player, itemId);
}

function updatePlayerAction(player: ServerPlayer, now: number): void {
  if (!player.action) return;
  if (player.action.type === "fishing") return updateFishingAction(player, now);
  if (player.action.type === "mining") return updateMiningAction(player, now);
  if (player.action.type === "herbing") return updateHerbingAction(player, now);
  if (player.action.type === "cooking") return updateCookingAction(player, now);
  if (player.action.type !== "woodcutting") return;
  const action = player.action;
  const tree = treeRuntimeForId(action.treeId);
  if (!tree || player.dead || !tree.active || tree.floor !== player.floor || distanceSq(player, tree) > 1.9 * 1.9) {
    player.action = null;
    return;
  }
  if (now < action.nextAt) return;

  action.swings += 1;
  const treeSpec = treeTypeSpec(tree);
  const level = skillLevel(player, "woodcutting");
  action.nextAt = now + woodcutSwingMs(level, treeSpec);
  const angle = Math.atan2(tree.y - player.y, tree.x - player.x);
  event("effect", "chop", tree.x, tree.y - 0.35, tree.floor, null, player.id, tree.id, { fromX: player.x, fromY: player.y, angle });
  action.remaining -= woodcutPower(level, treeSpec);
  if (action.remaining > 0) {
    if (action.swings % 3 === 0) event("float", "Chop", tree.x, tree.y, tree.floor, "#d8c68a");
    return;
  }

  tree.active = false;
  tree.respawnAt = performance.now() + TREE_RESPAWN_MS;
  scheduleResourceRespawn("tree", tree.id, tree.respawnAt);
  player.action = null;
  addSkillXp(player, "woodcutting", treeSpec.xp);
  dropItem(tree.floor, tree.x + 0.12, tree.y, [{ id: treeSpec.itemId, qty: 1 }], treeSpec.dropLabel);
  event("float", `+${treeSpec.xp} Woodcutting`, tree.x, tree.y, tree.floor, "#9ee6b1");
}

function updateFishingAction(player: ServerPlayer, now: number): void {
  const action = player.action;
  if (action?.type !== "fishing") return;
  const node = fishingNodeForId(action.nodeId);
  if (!node || player.dead || node.floor !== player.floor || distanceSq(player, fishingApproachPoint(node)) > 1.65 * 1.65 || !playerHasCapability(player, "fish")) {
    player.action = null;
    return;
  }
  if (now < action.nextAt) return;
  player.action = null;
  if (!addInventoryItem(player, "raw_fish", 1)) {
    systemToPlayer(player, "Your inventory is full.");
    return;
  }
  const xp = 18;
  addSkillXp(player, "fishing", xp);
  event("effect", "fish", node.x, node.y, node.floor, null, player.id, node.id);
  event("float", `+${xp} Fishing`, node.x, node.y, node.floor, "#8fd8ff");
}

function updateMiningAction(player: ServerPlayer, now: number): void {
  const action = player.action;
  if (action?.type !== "mining") return;
  const node = miningNodeForId(action.nodeId);
  if (!node || player.dead || node.floor !== player.floor || distanceSq(player, miningApproachPoint(node)) > 1.65 * 1.65 || !playerHasCapability(player, "mine")) {
    player.action = null;
    return;
  }
  if (now < action.nextAt) return;
  player.action = null;
  if (!addInventoryItem(player, "copper_ore", 1)) {
    systemToPlayer(player, "Your inventory is full.");
    return;
  }
  const xp = 20;
  addSkillXp(player, "mining", xp);
  event("float", `+${xp} Mining`, node.x, node.y, node.floor, "#d8a86a");
}

function updateHerbingAction(player: ServerPlayer, now: number): void {
  const action = player.action;
  if (action?.type !== "herbing") return;
  const node = herbNodes.get(action.nodeId);
  if (!node || player.dead || !node.active || node.floor !== player.floor || distanceSq(player, herbApproachPoint(node)) > 1.65 * 1.65) {
    player.action = null;
    return;
  }
  if (now < action.nextAt) return;
  player.action = null;
  if (!addInventoryItem(player, node.item, 1)) {
    systemToPlayer(player, "Your inventory is full.");
    return;
  }
  node.active = false;
  node.respawnAt = performance.now() + HERB_RESPAWN_MS;
  scheduleResourceRespawn("herb", node.id, node.respawnAt);
  addSkillXp(player, "foraging", node.xp);
  const label = ITEMS[node.item]?.label ?? node.item;
  event("float", `+1 ${label} · +${node.xp} Foraging`, node.x, node.y, node.floor, "#9ee6b1");
}

function updateCookingAction(player: ServerPlayer, now: number): void {
  const action = player.action;
  if (action?.type !== "cooking") return;
  const fire = fires.get(action.fireId);
  if (!fire || player.dead || fire.floor !== player.floor || distanceSq(player, fire) > 4) {
    player.action = null;
    return;
  }
  if (now < action.nextAt) return;
  const inputId = action.itemId ?? "raw_fish";
  const recipe = ITEMS[inputId]?.use;
  const cook = recipe?.kind === "cook_on_fire" ? recipe : null;
  const produces = cook?.produces ?? "cooked_fish";
  const burns = cook?.burns ?? "burnt_fish";
  const skill = cook?.skill ?? "cooking";
  const xp = cook?.xp ?? 22;
  player.action = null;
  if (!removeInventoryItem(player, inputId, 1)) return;
  const level = skillLevel(player, skill);
  const successChance = clamp(0.45 + level * 0.035, 0.45, 0.92);
  const cooked = E2E_TEST || Math.random() < successChance;
  const result = cooked ? produces : burns;
  if (!addInventoryItem(player, result, 1)) {
    addInventoryItem(player, inputId, 1);
    systemToPlayer(player, "Your inventory is full.");
    return;
  }
  if (cooked) addSkillXp(player, skill, xp);
  event("float", cooked ? `+${xp} ${SKILLS[skill]?.label ?? skill}` : "Burnt", fire.x, fire.y, fire.floor, cooked ? "#9ee6b1" : "#a8a29e");
}

function grantE2EItems(
  player: ServerPlayer,
  message: {
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
): void {
  if (!E2E_TEST) return;
  for (const item of message.items ?? []) {
    const id = String(item.id ?? "");
    const qty = Number(item.qty ?? 1);
    if (ITEMS[id]) addInventoryItem(player, id, qty);
  }
  if (Number.isFinite(message.gold)) player.gold = Math.max(0, Math.floor(Number(message.gold)));
  if (Number.isFinite(message.hp)) player.hp = clamp(Number(message.hp), 0, player.maxHp);
  if (message.skills) {
    let changed = false;
    for (const [id, xp] of Object.entries(message.skills)) {
      if (SKILLS[id] && Number.isFinite(xp)) {
        (player.skills[id] ?? (player.skills[id] = { xp: 0 })).xp = Math.max(0, Number(xp));
        changed = true;
      }
    }
    if (changed) markSkillChanged(player);
  }
  if (typeof message.forceDodge === "boolean") player.forceDodge = message.forceDodge;
  if (Number.isFinite(message.floor) && Number.isFinite(message.x) && Number.isFinite(message.y)) {
    const spot = findStandableNear(Math.floor(Number(message.floor)), Number(message.x), Number(message.y));
    if (spot) {
      const oldFloor = player.floor;
      const oldX = player.x;
      const oldY = player.y;
      player.floor = spot.floor;
      player.x = spot.x;
      player.y = spot.y;
      updateSpatialCell(spatial.players, player, oldFloor, oldX, oldY);
    }
  }
}

function emitE2EEvents(
  player: ServerPlayer,
  message: {
    type: "e2eEmitEvents";
    count?: number;
    floor?: number;
    x?: number;
    y?: number;
    spread?: number;
  }
): void {
  if (!E2E_TEST) return;
  const count = clamp(Math.floor(Number(message.count ?? 0)), 0, 1000);
  const floor = Number.isFinite(message.floor) ? Math.floor(Number(message.floor)) : player.floor;
  const x = Number.isFinite(message.x) ? Number(message.x) : player.x;
  const y = Number.isFinite(message.y) ? Number(message.y) : player.y;
  const spread = clamp(Number(message.spread ?? 0), 0, 12);
  for (let i = 0; i < count; i += 1) {
    const angle = i * 2.399963229728653;
    const radius = spread <= 0 ? 0 : ((i % 17) / 16) * spread;
    event("effect", "e2e_burst", x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, floor, "#ffffff", player.id);
  }
}

function findStandableNear(floor: number, x: number, y: number): Positioned | null {
  if (canStand(floor, x, y)) return { floor, x, y };
  const baseX = Math.floor(x);
  const baseY = Math.floor(y);
  for (let radius = 1; radius <= 2; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const cx = baseX + dx + 0.5;
        const cy = baseY + dy + 0.5;
        if (canStand(floor, cx, cy)) return { floor, x: cx, y: cy };
      }
    }
  }
  return null;
}

function treeTypeSpec(tree: TreeNodeRuntime): TreeType {
  return TREE_TYPES[tree.type] ?? TREE_TYPES["oak"]!;
}

function fishingApproachPoint(node: { floor: number; x: number; y: number; approachX: number; approachY: number }): Positioned {
  return {
    floor: node.floor,
    x: node.approachX ?? node.x,
    y: node.approachY ?? node.y
  };
}

function miningApproachPoint(node: { floor: number; x: number; y: number; approachX: number; approachY: number }): Positioned {
  return {
    floor: node.floor,
    x: node.approachX ?? node.x,
    y: node.approachY ?? node.y
  };
}

function herbApproachPoint(node: { floor: number; x: number; y: number; approachX: number; approachY: number }): Positioned {
  return {
    floor: node.floor,
    x: node.approachX ?? node.x,
    y: node.approachY ?? node.y
  };
}

function npcDialogueLines(player: ServerPlayer, npc: NpcRuntime): DialogueLineView[] {
  if (npc.role === "vendor") {
    return [
      { speaker: npc.name, text: "Fresh supplies, sharp edges, and the little things that keep you alive." },
      { speaker: player.name, text: "Show me what you have." },
      { speaker: npc.name, text: "Take your time. Good tools pay for themselves out there." }
    ];
  }
  if (npc.role === "alchemist") {
    return [
      { speaker: npc.name, text: "Herbs from the wild, a clean flask, a steady kit — that's all a tonic needs." },
      { speaker: player.name, text: "Show me how to brew." },
      { speaker: npc.name, text: "Gather what you can and bring it to my bench." }
    ];
  }
  return [
    { speaker: npc.name, text: npc.dialogue },
    { speaker: player.name, text: "I will remember that." }
  ];
}

function eventDialogue(player: ServerPlayer, lines: DialogueLineView[], extra: Partial<GameEvent> = {}): void {
  event("dialogue", "", null, null, null, null, null, null, { to: player.id, lines, ...extra });
}

function woodcutSwingMs(level: number, treeSpec: TreeType): number {
  const aboveRequirement = Math.max(0, level - treeSpec.requiredLevel);
  return clamp(treeSpec.baseSwingMs - aboveRequirement * 75, treeSpec.minSwingMs, treeSpec.baseSwingMs);
}

function woodcutPower(level: number, treeSpec: TreeType): number {
  return 1 + Math.floor(Math.max(0, level - treeSpec.requiredLevel) / 8);
}

function dropItem(floor: number, x: number, y: number, items: Array<{ id: string; qty: number }>, label: string): void {
  const drop: Corpse = {
    id: `c${nextCorpseId++}`,
    floor,
    x,
    y,
    gold: 0,
    label,
    kind: "drop",
    items
  };
  corpses.set(drop.id, drop);
  addToCellIndex(corpsesByCell, drop);
  addToSpatial(spatial.corpses, drop);
  scheduleCorpseExpiration(drop, performance.now() + DROP_DECAY_MS);
}

function spawnNpcs(): void {
  for (const npc of NPCS) {
    let runtime: NpcRuntime;
    if (npc.role === "quest") {
      runtime = {
        id: npc.id,
        name: npc.name,
        role: "quest",
        floor: npc.floor,
        x: npc.x,
        y: npc.y,
        homeX: npc.x,
        homeY: npc.y,
        dir: "down",
        moving: false,
        wanderTarget: null,
        wanderNextAt: performance.now() + 1400,
        dialogue: npc.dialogue
      };
    } else {
      runtime = {
        id: npc.id,
        name: npc.name,
        role: npc.role,
        floor: npc.floor,
        x: npc.x,
        y: npc.y,
        dir: "down",
        moving: false,
        dialogue: npc.dialogue
      };
    }
    npcs.set(npc.id, runtime);
    addToCellIndex(npcsByCell, runtime);
    addToSpatial(spatial.npcs, runtime);
  }
}

function treeRuntimeForId(id: string): TreeNodeRuntime | null {
  const cached = treeNodes.get(id);
  if (cached) return cached;
  const base = treeBaseForId(id);
  return base ? materializeTree(base, false) : null;
}

function treeBaseForId(id: string): Omit<TreeNodeRuntime, "active" | "respawnAt"> | null {
  const parsed = parseTileTreeId(id);
  if (parsed) {
    const { floor, tileX, tileY } = parsed;
    if (!isGeneratedTreeTile(floor, tileX, tileY)) return null;
    return { id, floor, tileX, tileY, x: tileX + 0.5, y: tileY + 0.95, type: treeTypeForTile(floor, tileX, tileY) };
  }
  const composed = composedTreeNodesById.get(id);
  if (!composed) return null;
  return {
    id,
    floor: composed.floor,
    tileX: Math.floor(composed.x),
    tileY: Math.floor(composed.y),
    x: composed.x,
    y: composed.y,
    type: composed.type
  };
}

function materializeTree(base: Omit<TreeNodeRuntime, "active" | "respawnAt">, addToIndex = true): TreeNodeRuntime {
  const existing = treeNodes.get(base.id);
  const tree = existing ?? { ...base, active: true, respawnAt: 0 };
  treeNodes.set(tree.id, tree);
  if (addToIndex) {
    addToSpatial(staticSpatial.trees, tree);
    refreshStaticSpatialCellMetric();
  }
  return tree;
}

function fishingNodeForId(id: string): FishingNodeRuntime | null {
  return fishingNodesById.get(id) ?? fishingNodeBasesById.get(id) ?? null;
}

function miningNodeForId(id: string): MiningNodeRuntime | null {
  return miningNodesById.get(id) ?? miningNodeBasesById.get(id) ?? null;
}

function herbNodeForInteraction(player: ServerPlayer, id: string, maxDistanceSq: number): HerbNodeRuntime | null {
  const cached = herbNodes.get(id);
  if (cached) {
    if (player.dead || cached.floor !== player.floor || distanceSq(player, herbApproachPoint(cached)) > maxDistanceSq) return null;
    return cached;
  }
  const base = herbNodeBasesById.get(id);
  if (!base || player.dead || base.floor !== player.floor || distanceSq(player, herbApproachPoint(base)) > maxDistanceSq) return null;
  return materializeHerbNode(base, false);
}

function materializeFishingNode(node: FishingNodeRuntime): FishingNodeRuntime {
  const existing = fishingNodesById.get(node.id);
  if (existing) return existing;
  fishingNodesById.set(node.id, node);
  addToSpatial(staticSpatial.fishingNodes, node);
  return node;
}

function materializeMiningNode(node: MiningNodeRuntime): MiningNodeRuntime {
  const existing = miningNodesById.get(node.id);
  if (existing) return existing;
  miningNodesById.set(node.id, node);
  addToSpatial(staticSpatial.miningNodes, node);
  return node;
}

function materializeHerbNode(base: HerbNodeBase, addToIndex = true): HerbNodeRuntime {
  const existing = herbNodes.get(base.id);
  const node =
    existing ??
    ({
      id: base.id,
      floor: base.floor,
      x: base.x,
      y: base.y,
      approachX: base.approachX,
      approachY: base.approachY,
      label: base.label,
      requiredLevel: base.requiredLevel ?? 0,
      xp: base.xp ?? FORAGE_XP,
      item: base.item ?? "herb",
      active: true,
      respawnAt: 0
    } satisfies HerbNodeRuntime);
  herbNodes.set(node.id, node);
  if (addToIndex) addToSpatial(staticSpatial.herbNodes, node);
  return node;
}

function materializeTreeCellsNear(floor: number, x: number, y: number, radius: number): void {
  for (const cell of spatialQueryCells(floor, x, y, radius)) materializeTreeCell(cell.floor, cell.cx, cell.cy);
}

function materializeTreeCell(floor: number, cx: number, cy: number): void {
  const cellKey = `${floor}:${cx}:${cy}`;
  if (materializedTreeCells.has(cellKey)) return;
  const minX = Math.max(0, cx * SPATIAL_CELL_SIZE);
  const maxX = Math.min(floorCols(floor) - 1, (cx + 1) * SPATIAL_CELL_SIZE - 1);
  const minY = Math.max(0, cy * SPATIAL_CELL_SIZE);
  const maxY = Math.min(floorRows(floor) - 1, (cy + 1) * SPATIAL_CELL_SIZE - 1);
  if (maxX >= minX && maxY >= minY) {
    for (let tileY = minY; tileY <= maxY; tileY += 1) {
      for (let tileX = minX; tileX <= maxX; tileX += 1) {
        if (!isGeneratedTreeTile(floor, tileX, tileY)) continue;
        const id = tileTreeId(floor, tileX, tileY);
        materializeTree({
          id,
          floor,
          tileX,
          tileY,
          x: tileX + 0.5,
          y: tileY + 0.95,
          type: treeTypeForTile(floor, tileX, tileY)
        });
      }
    }
  }
  for (const tree of composedTreeNodesByCell.get(cellKey) ?? []) {
    materializeTree({
      id: composedTreeId(tree),
      floor: tree.floor,
      tileX: Math.floor(tree.x),
      tileY: Math.floor(tree.y),
      x: tree.x,
      y: tree.y,
      type: tree.type
    });
  }
  materializedTreeCells.add(cellKey);
  refreshStaticSpatialCellMetric();
}

function materializeStaticResourceCellsNear(floor: number, x: number, y: number, radius: number): void {
  for (const cell of spatialQueryCells(floor, x, y, radius)) materializeStaticResourceCell(cell.floor, cell.cx, cell.cy);
}

function materializeStaticResourceCell(floor: number, cx: number, cy: number): void {
  const cellKey = `${floor}:${cx}:${cy}`;
  if (materializedStaticResourceCells.has(cellKey)) return;
  for (const node of fishingNodeBasesByCell.get(cellKey) ?? []) materializeFishingNode(node);
  for (const node of miningNodeBasesByCell.get(cellKey) ?? []) materializeMiningNode(node);
  for (const node of herbNodeBasesByCell.get(cellKey) ?? []) materializeHerbNode(node);
  materializedStaticResourceCells.add(cellKey);
  refreshStaticSpatialCellMetric();
}

function pruneDistantStaticCells(now: number): void {
  if (now - lastStaticResourcePruneAt < STATIC_RESOURCE_PRUNE_MS) return;
  lastStaticResourcePruneAt = now;
  pruneDistantTreeCells(now);
  pruneDistantStaticResourceCells(now);
}

function pruneDistantTreeCells(now: number): void {
  if (materializedTreeCells.size === 0) return;
  const keep = staticPruneKeepCellsScratch;
  const stale = staticPruneStaleCellsScratch;
  keep.clear();
  stale.length = 0;
  for (const { player } of clients.values()) {
    for (const cell of spatialQueryCells(player.floor, player.x, player.y, TREE_SNAPSHOT_RADIUS)) keep.add(cell.key);
  }
  for (const cellKey of materializedTreeCells) {
    if (!keep.has(cellKey)) stale.push(cellKey);
  }
  for (const cellKey of stale) {
    const bucket = staticSpatial.trees.get(cellKey);
    if (bucket) {
      for (const tree of bucket) {
        if (tree.active && tree.respawnAt <= now) treeNodes.delete(tree.id);
      }
      staticSpatial.trees.delete(cellKey);
    }
    materializedTreeCells.delete(cellKey);
  }
  stale.length = 0;
  keep.clear();
  refreshStaticSpatialCellMetric();
}

function pruneDistantStaticResourceCells(now: number): void {
  if (materializedStaticResourceCells.size === 0) return;
  const keep = staticPruneKeepCellsScratch;
  const stale = staticPruneStaleCellsScratch;
  keep.clear();
  stale.length = 0;
  for (const { player } of clients.values()) {
    for (const cell of spatialQueryCells(player.floor, player.x, player.y, SNAPSHOT_RADIUS)) keep.add(cell.key);
  }
  for (const cellKey of materializedStaticResourceCells) {
    if (!keep.has(cellKey)) stale.push(cellKey);
  }
  for (const cellKey of stale) {
    for (const node of staticSpatial.fishingNodes.get(cellKey) ?? []) fishingNodesById.delete(node.id);
    for (const node of staticSpatial.miningNodes.get(cellKey) ?? []) miningNodesById.delete(node.id);
    for (const node of staticSpatial.herbNodes.get(cellKey) ?? []) {
      if (node.active && node.respawnAt <= now) herbNodes.delete(node.id);
    }
    staticSpatial.fishingNodes.delete(cellKey);
    staticSpatial.miningNodes.delete(cellKey);
    staticSpatial.herbNodes.delete(cellKey);
    materializedStaticResourceCells.delete(cellKey);
  }
  stale.length = 0;
  keep.clear();
  refreshStaticSpatialCellMetric();
}

function tileTreeId(floor: number, tileX: number, tileY: number): string {
  return `tree-${floor}-${tileX}-${tileY}`;
}

function parseTileTreeId(id: string): { floor: number; tileX: number; tileY: number } | null {
  const match = /^tree-(\d+)-(\d+)-(\d+)$/.exec(id);
  if (!match) return null;
  const floor = Number(match[1]);
  const tileX = Number(match[2]);
  const tileY = Number(match[3]);
  if (!Number.isInteger(floor) || !Number.isInteger(tileX) || !Number.isInteger(tileY)) return null;
  return { floor, tileX, tileY };
}

function composedTreeId(tree: (typeof COMPOSED_TREE_NODES)[number]): string {
  return `tree-composed-${tree.floor}-${String(tree.x).replace(".", "_")}-${String(tree.y).replace(".", "_")}`;
}

function isGeneratedTreeTile(floor: number, x: number, y: number): boolean {
  return (
    floor >= 0 &&
    floor <= 4 &&
    x >= 0 &&
    y >= 0 &&
    x < floorCols(floor) &&
    y < floorRows(floor) &&
    tileAt(floor, x, y) === "f"
  );
}

function treeTypeForTile(floor: number, x: number, y: number): string {
  const value = (floor * 73856093) ^ (x * 19349663) ^ (y * 83492791);
  if (floor === 3 && Math.abs(value) % 3 === 0) return "pine";
  if (floor === 4 && Math.abs(value) % 4 === 0) return "pine";
  return "oak";
}

function updateNpcs(dt: number, now: number, activeRegions: ActiveRegions): void {
  const visited = visitedNpcScratch;
  visited.clear();
  for (const cell of activeRegions.cells) {
    const cellNpcs = npcsByCell.get(cell);
    if (!cellNpcs) continue;
    for (const npc of cellNpcs) {
      if (visited.has(npc)) continue;
      visited.add(npc);
      const { homeX, homeY } = npc;
      if (homeX == null || homeY == null) continue;
      npc.moving = false;
      if (now >= (npc.wanderNextAt ?? 0) && !npc.wanderTarget) {
        npc.wanderTarget = pickNpcWanderTarget(npc);
        npc.wanderNextAt = now + roll([1800, 4200]);
      }
      if (!npc.wanderTarget) continue;
      const dist = distance(npc, npc.wanderTarget);
      if (dist < 0.18) {
        npc.wanderTarget = null;
        continue;
      }
      const oldFloor = npc.floor;
      const oldX = npc.x;
      const oldY = npc.y;
      moveEntity(npc, ((npc.wanderTarget.x - npc.x) / dist) * 1.35 * dt, ((npc.wanderTarget.y - npc.y) / dist) * 1.35 * dt);
      updateCellIndex(npcsByCell, npc, oldFloor, oldX, oldY);
      updateSpatialCell(spatial.npcs, npc, oldFloor, oldX, oldY);
    }
  }
}

function pickNpcWanderTarget(npc: NpcRuntime): Vec2 | null {
  for (let i = 0; i < 8; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1 + Math.random() * 4;
    const x = clamp(npc.homeX! + Math.cos(angle) * radius, 1.5, floorCols(npc.floor) - 1.5);
    const y = clamp(npc.homeY! + Math.sin(angle) * radius, 1.5, floorRows(npc.floor) - 1.5);
    if (canStand(npc.floor, x, y)) return { x, y };
  }
  return null;
}

function updateResourceRespawns(now: number): void {
  while (resourceRespawns.size > 0 && (resourceRespawns.peek()?.at ?? Infinity) <= now) {
    const respawn = resourceRespawns.pop();
    if (!respawn) break;
    if (respawn.kind === "tree") {
      const tree = treeNodes.get(respawn.id);
      if (tree && !tree.active && tree.respawnAt <= now) {
        tree.active = true;
        tree.respawnAt = 0;
        if (!materializedTreeCells.has(spatialKey(tree.floor, tree.x, tree.y))) treeNodes.delete(tree.id);
      }
      continue;
    }
    const node = herbNodes.get(respawn.id);
    if (node && !node.active && node.respawnAt <= now) {
      node.active = true;
      node.respawnAt = 0;
      if (!materializedStaticResourceCells.has(spatialKey(node.floor, node.x, node.y))) herbNodes.delete(node.id);
    }
  }
}

function scheduleResourceRespawn(kind: ResourceRespawnKind, id: string, at: number): void {
  resourceRespawns.push({ kind, id, at });
}

function scheduleFireExpiration(fire: Fire): void {
  fireExpirations.push({ id: fire.id, at: fire.expiresAt });
}

function updateFires(now: number): void {
  while (fireExpirations.size > 0 && (fireExpirations.peek()?.at ?? Infinity) <= now) {
    const expiry = fireExpirations.pop();
    if (!expiry) break;
    const fire = fires.get(expiry.id);
    if (!fire) continue;
    if (fire.expiresAt > now) {
      scheduleFireExpiration(fire);
      continue;
    }
    expireFire(fire);
  }
}

function expireFire(fire: Fire): void {
  fires.delete(fire.id);
  removeFromCellIndex(firesByCell, fire);
  removeFromSpatial(spatial.fires, fire);
}

function scheduleCorpseExpiration(corpse: Corpse, at: number): void {
  corpseExpirations.push({ id: corpse.id, at });
}

function updateCorpseExpirations(now: number): void {
  while (corpseExpirations.size > 0 && (corpseExpirations.peek()?.at ?? Infinity) <= now) {
    const expiry = corpseExpirations.pop();
    if (!expiry) break;
    const corpse = corpses.get(expiry.id);
    if (corpse) removeCorpse(corpse);
  }
}

function removeCorpse(corpse: Corpse): void {
  corpses.delete(corpse.id);
  removeFromCellIndex(corpsesByCell, corpse);
  removeFromSpatial(spatial.corpses, corpse);
}

function spawnMonster(spawn: MonsterSpawn): void {
  const catalog = MONSTERS[spawn.type];
  if (!catalog) return;
  const monster: ServerMonster = {
    id: `m${nextMonsterId++}`,
    spawn,
    type: spawn.type,
    floor: spawn.floor,
    x: spawn.x + 0.5,
    y: spawn.y + 0.5,
    hp: catalog.maxHp,
    maxHp: catalog.maxHp,
    dir: "down",
    moving: false,
    lastAttack: 0,
    deadUntil: 0,
    homeX: spawn.x + 0.5,
    homeY: spawn.y + 0.5,
    zone: spawn.zone ?? zoneAt(spawn.floor, spawn.x + 0.5, spawn.y + 0.5),
    wanderTarget: null,
    wanderNextAt: performance.now() + roll([800, 2800]),
    hidden: catalog.burrow === true
  };
  monsters.set(monster.id, monster);
  addMonsterToFloor(monster);
  addMonsterToCell(monster);
  addToSpatial(spatial.monsters, monster);
}

function respawnMonster(monster: ServerMonster): void {
  const catalog = MONSTERS[monster.type];
  if (!catalog) return;
  const oldFloor = monster.floor;
  const oldX = monster.x;
  const oldY = monster.y;
  monster.floor = monster.spawn.floor;
  monster.x = monster.spawn.x + 0.5;
  monster.y = monster.spawn.y + 0.5;
  monster.hp = catalog.maxHp;
  monster.maxHp = catalog.maxHp;
  monster.deadUntil = 0;
  monster.wanderTarget = null;
  monster.wanderNextAt = performance.now() + roll([1000, 3500]);
  monster.tauntUntil = 0;
  monster.tauntBy = undefined;
  monster.snareUntil = 0;
  monster.freezeUntil = 0;
  monster.burnUntil = 0;
  monster.inaccurateUntil = 0;
  monster.alertUntil = 0;
  monster.alertTarget = undefined;
  monster.hidden = catalog.burrow === true; // re-bury ambushers
  if (monster.floor !== oldFloor) {
    removeMonsterFromFloor(monster, oldFloor);
    addMonsterToFloor(monster);
  }
  updateMonsterCell(monster, oldFloor, oldX, oldY);
}

function addMonsterToFloor(monster: ServerMonster): void {
  const floorSet = monstersByFloor.get(monster.floor) ?? new Set<ServerMonster>();
  floorSet.add(monster);
  monstersByFloor.set(monster.floor, floorSet);
}

function removeMonsterFromFloor(monster: ServerMonster, floor = monster.floor): void {
  const floorSet = monstersByFloor.get(floor);
  if (!floorSet) return;
  floorSet.delete(monster);
  if (!floorSet.size) monstersByFloor.delete(floor);
}

function addMonsterToCell(monster: ServerMonster): void {
  const key = spatialKey(monster.floor, monster.x, monster.y);
  const cellSet = monstersByCell.get(key) ?? new Set<ServerMonster>();
  cellSet.add(monster);
  monstersByCell.set(key, cellSet);
}

function removeMonsterFromCell(monster: ServerMonster, floor = monster.floor, x = monster.x, y = monster.y): void {
  const key = spatialKey(floor, x, y);
  const cellSet = monstersByCell.get(key);
  if (!cellSet) return;
  cellSet.delete(monster);
  if (!cellSet.size) monstersByCell.delete(key);
}

function updateMonsterCell(monster: ServerMonster, oldFloor: number, oldX: number, oldY: number): void {
  if (spatialKey(oldFloor, oldX, oldY) !== spatialKey(monster.floor, monster.x, monster.y)) {
    removeMonsterFromCell(monster, oldFloor, oldX, oldY);
    addMonsterToCell(monster);
  }
  updateSpatialCell(spatial.monsters, monster, oldFloor, oldX, oldY);
}

function addToCellIndex<T extends Positioned>(index: Map<string, Set<T>>, entity: T): void {
  const key = spatialKey(entity.floor, entity.x, entity.y);
  const cellSet = index.get(key) ?? new Set<T>();
  cellSet.add(entity);
  index.set(key, cellSet);
}

function removeFromCellIndex<T extends Positioned>(index: Map<string, Set<T>>, entity: T, floor = entity.floor, x = entity.x, y = entity.y): void {
  const key = spatialKey(floor, x, y);
  const cellSet = index.get(key);
  if (!cellSet) return;
  cellSet.delete(entity);
  if (!cellSet.size) index.delete(key);
}

function updateCellIndex<T extends Positioned>(index: Map<string, Set<T>>, entity: T, oldFloor: number, oldX: number, oldY: number): void {
  if (spatialKey(oldFloor, oldX, oldY) === spatialKey(entity.floor, entity.x, entity.y)) return;
  removeFromCellIndex(index, entity, oldFloor, oldX, oldY);
  addToCellIndex(index, entity);
}

function forEachCellIndex<T extends Positioned>(index: Map<string, Set<T>>, floor: number, x: number, y: number, radius: number, visit: (item: T) => void): void {
  for (const cell of spatialQueryCells(floor, x, y, radius)) {
    const cellSet = index.get(cell.key);
    if (!cellSet) continue;
    for (const item of cellSet) visit(item);
  }
}

function wanderMonster(monster: ServerMonster, catalog: { speed: number }, dt: number, now: number): void {
  if (now >= monster.wanderNextAt && !monster.wanderTarget) {
    monster.wanderTarget = pickWanderTarget(monster);
    monster.wanderNextAt = now + roll([2200, 5200]);
  }

  if (!monster.wanderTarget) return;
  const dist = distance(monster, monster.wanderTarget);
  if (dist < 0.25) {
    monster.wanderTarget = null;
    return;
  }

  const dx = (monster.wanderTarget.x - monster.x) / dist;
  const dy = (monster.wanderTarget.y - monster.y) / dist;
  const oldFloor = monster.floor;
  const oldX = monster.x;
  const oldY = monster.y;
  moveEntity(monster, dx * catalog.speed * 0.34 * dt, dy * catalog.speed * 0.34 * dt);
  updateMonsterCell(monster, oldFloor, oldX, oldY);
}

function pickWanderTarget(monster: ServerMonster): Vec2 | null {
  for (let i = 0; i < 8; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.2 + Math.random() * 4.5;
    const x = clamp(monster.homeX + Math.cos(angle) * radius, 1.5, floorCols(monster.floor) - 1.5);
    const y = clamp(monster.homeY + Math.sin(angle) * radius, 1.5, floorRows(monster.floor) - 1.5);
    if (zoneAt(monster.floor, x, y) !== monster.zone) continue;
    if (canStand(monster.floor, x, y)) return { x, y };
  }
  return null;
}

// Which way an attacker should face to point at its target.
function facing(from: { x: number; y: number }, to: { x: number; y: number }): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

function moveEntity(entity: { floor: number; x: number; y: number; dir: Direction; moving: boolean }, dx: number, dy: number): void {
  const oldX = entity.x;
  const oldY = entity.y;
  if (dx || dy) {
    entity.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  }
  const nextX = clamp(entity.x + dx, 0.5, floorCols(entity.floor) - 0.5);
  if (canStand(entity.floor, nextX, entity.y)) entity.x = nextX;
  const nextY = clamp(entity.y + dy, 0.5, floorRows(entity.floor) - 0.5);
  if (canStand(entity.floor, entity.x, nextY)) entity.y = nextY;
  const movedX = entity.x - oldX;
  const movedY = entity.y - oldY;
  entity.moving = movedX * movedX + movedY * movedY > 0.000001;
}

function canStand(floor: number, x: number, y: number): boolean {
  const left = Math.floor(x - 0.28);
  const right = Math.floor(x + 0.28);
  const top = Math.floor(y - 0.28);
  const bottom = Math.floor(y + 0.28);
  return (
    !isBlockedTile(tileAt(floor, left, top)) &&
    !isBlockedTile(tileAt(floor, right, top)) &&
    !isBlockedTile(tileAt(floor, left, bottom)) &&
    !isBlockedTile(tileAt(floor, right, bottom))
  );
}

function nearestPlayer(monster: ServerMonster, maxDistance: number): ServerPlayer | null {
  let best: ServerPlayer | null = null;
  let bestDistSq = maxDistance * maxDistance;
  forEachSpatial(spatial.players, monster.floor, monster.x, monster.y, maxDistance, (player) => {
    if (player.dead || player.floor !== monster.floor) return;
    const distSq = distanceSq(monster, player);
    if (distSq < bestDistSq) {
      best = player;
      bestDistSq = distSq;
    }
  });
  return best;
}

function awardLevels(player: ServerPlayer): void {
  while (player.xp >= xpForLevel(player.level + 1)) {
    player.level += 1;
    recalculateVitals(player);
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    systemToPlayer(player, `${player.name} reached level ${player.level}.`);
  }
}

function armorReduction(player: ServerPlayer): number {
  return Math.floor(skillLevel(player, "defense") / 3) + player.armorTier * (SHOP["armor"]!.armorBonus ?? 0) + wellFedPower(player);
}

function broadcastState(): void {
  const now = performance.now();
  updateByteMetric();
  snapshotSequence += 1;
  const forceDynamicFull = snapshotSequence % SNAPSHOT_FULL_EVERY === 0;
  const includeTrees = snapshotSequence % TREE_SNAPSHOT_EVERY === 0;
  const includeNpcs = forceDynamicFull || snapshotSequence % NPC_SNAPSHOT_EVERY === 0;
  const includeResources = snapshotSequence % RESOURCE_SNAPSHOT_EVERY === 0;
  let metricFrame: SnapshotMetricFrame | null = null;
  for (const session of clients.values()) {
    const { socket } = session;
    if (socket.readyState !== socket.OPEN) continue;
    if (socket.bufferedAmount > SOCKET_BACKPRESSURE_BYTES) {
      metrics.snapshotsSkippedBackpressureThisSecond += 1;
      continue;
    }

    const includeMetrics = shouldIncludeMetrics(session, now);
    if (includeMetrics && !metricFrame) metricFrame = snapshotMetricFrame();
    const snapshot = buildSnapshotFor(
      session,
      includeTrees,
      includeNpcs,
      includeResources,
      forceDynamicFull,
      includeMetrics ? metricFrame : null,
      now
    );
    if (!shouldSendSnapshot(session, snapshot, now)) continue;
    const raw = JSON.stringify(compactSnapshotForWire(snapshot));
    metrics.bytesOutThisSecond += Buffer.byteLength(raw);
    metrics.snapshotsSentThisSecond += 1;
    lastSnapshotSentAt.set(session, now);
    if (snapshot.metrics) lastMetricsSentAt.set(session, now);
    socket.send(raw);
  }
  pruneDistantStaticCells(now);
}

function shouldSendSnapshot(session: Session, snapshot: StateSnapshot, now: number): boolean {
  if (!snapshotIsEmptyDelta(snapshot)) return true;
  return now - (lastSnapshotSentAt.get(session) ?? 0) >= SNAPSHOT_HEARTBEAT_MS;
}

function shouldIncludeMetrics(session: Session, now: number): boolean {
  const lastSentAt = lastMetricsSentAt.get(session);
  return lastSentAt === undefined || now - lastSentAt >= SNAPSHOT_METRICS_MS;
}

function acceptClientMessage(socket: ExtWebSocket, now: number): boolean {
  const bucket = clientMessageBuckets.get(socket);
  if (!bucket) {
    clientMessageBuckets.set(socket, { updatedAt: now, tokens: CLIENT_MESSAGE_BURST - 1 });
    return true;
  }
  const elapsed = Math.max(0, now - bucket.updatedAt);
  bucket.tokens = Math.min(CLIENT_MESSAGE_BURST, bucket.tokens + (elapsed * CLIENT_MESSAGE_LIMIT_PER_SECOND) / 1000);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

function rawByteLength(raw: RawData): number {
  if (typeof raw === "string") return Buffer.byteLength(raw);
  if (Array.isArray(raw)) return raw.reduce((sum, item) => sum + item.byteLength, 0);
  return raw.byteLength;
}

function snapshotIsEmptyDelta(snapshot: StateSnapshot): boolean {
  return (
    !snapshot.playersFull &&
    !snapshot.monstersFull &&
    !snapshot.corpsesFull &&
    !snapshot.npcsFull &&
    !snapshot.treesFull &&
    !snapshot.fishingNodesFull &&
    !snapshot.miningNodesFull &&
    !snapshot.herbNodesFull &&
    !snapshot.firesFull &&
    snapshot.players.length === 0 &&
    snapshot.monsters.length === 0 &&
    snapshot.corpses.length === 0 &&
    snapshot.npcs.length === 0 &&
    snapshot.trees.length === 0 &&
    snapshot.fishingNodes.length === 0 &&
    snapshot.miningNodes.length === 0 &&
    snapshot.herbNodes.length === 0 &&
    snapshot.fires.length === 0 &&
    snapshot.removedPlayerIds.length === 0 &&
    snapshot.removedMonsterIds.length === 0 &&
    snapshot.removedCorpseIds.length === 0 &&
    snapshot.removedNpcIds.length === 0 &&
    snapshot.removedTreeIds.length === 0 &&
    snapshot.removedFishingNodeIds.length === 0 &&
    snapshot.removedMiningNodeIds.length === 0 &&
    snapshot.removedHerbNodeIds.length === 0 &&
    snapshot.removedFireIds.length === 0 &&
    snapshot.events.length === 0 &&
    !snapshot.metrics
  );
}

function compactSnapshotForWire(snapshot: StateSnapshot): WireStateSnapshot {
  return compactStateSnapshot(snapshot);
}

function snapshotMetricFrame(): SnapshotMetricFrame {
  const memory = process.memoryUsage();
  const cacheEntries = snapshotCacheEntryCounts();
  return {
    clients: clients.size,
    monsters: monsters.size,
    spatialCells: spatial.cellCount + staticSpatial.cellCount,
    residentStaticResources: residentStaticResourceCount(),
    dynamicEntities: dynamicEntityCount(),
    snapshotCacheEntries: cacheEntries.total,
    snapshotCacheEntriesPeak: cacheEntries.peak,
    heapUsedMb: round(memory.heapUsed / 1024 / 1024),
    rssMb: round(memory.rss / 1024 / 1024),
    tickMs: round(metricAverage(metrics.tickWindow)),
    snapshotMs: round(metricAverage(metrics.snapshotWindow)),
    eventLoopDelayMs: metrics.eventLoopDelayMs,
    eventLoopDelayP95Ms: metrics.eventLoopDelayP95Ms,
    eventLoopDelayMaxMs: metrics.eventLoopDelayMaxMs,
    bytesOutPerSecond: metrics.bytesOutPerSecond,
    wireBytesOutPerSecond: metrics.wireBytesOutPerSecond,
    snapshotsSentPerSecond: metrics.snapshotsSentPerSecond,
    snapshotsSkippedBackpressurePerSecond: metrics.snapshotsSkippedBackpressurePerSecond,
    eventsDroppedPerSecond: metrics.eventsDroppedPerSecond,
    clientMessagesDroppedPerSecond: metrics.clientMessagesDroppedPerSecond,
    clientMessageMaxBytes: CLIENT_MESSAGE_MAX_BYTES,
    socketBackpressureBytes: SOCKET_BACKPRESSURE_BYTES,
    saveQueueDepth: metrics.saveQueueDepth,
    saveFlushMs: metrics.saveFlushMs,
    saveFlushPlayers: metrics.saveFlushPlayers,
    saveInFlight: metrics.saveInFlight
  };
}

function buildSnapshotFor(
  session: Session,
  includeTrees: boolean,
  includeNpcs: boolean,
  includeResources: boolean,
  forceDynamicFull: boolean,
  metricFrame: SnapshotMetricFrame | null,
  now: number
): StateSnapshot {
  const viewer = session.player;
  const cache = snapshotCacheFor(session);
  const includeTreesForSession = includeTrees || !cache.trees.initialized;
  const includeFishingNodesForSession = includeResources || !cache.fishingNodes.initialized;
  const includeMiningNodesForSession = includeResources || !cache.miningNodes.initialized;
  const includeHerbNodesForSession = includeResources || !cache.herbNodes.initialized;
  const includeStaticResourcesForSession =
    includeFishingNodesForSession || includeMiningNodesForSession || includeHerbNodesForSession;
  let playerCandidates: PlayerSnapshotCandidate[] = [];
  let playerCandidateHeap: MinHeap<PlayerSnapshotCandidate> | null = null;
  const keepPlayerCandidate = (player: ServerPlayer, distSq: number): void => {
    if (!playerCandidateHeap && playerCandidates.length < MAX_VISIBLE_PLAYERS) {
      playerCandidates.push({ player, distSq });
      return;
    }
    if (!playerCandidateHeap) {
      playerCandidateHeap = playerCandidateMaxHeap(playerCandidates);
      playerCandidates = EMPTY_PLAYER_SNAPSHOT_CANDIDATES;
    }
    keepNearestPlayerCandidate(playerCandidateHeap, player, distSq, MAX_VISIBLE_PLAYERS);
  };
  let includedViewer = false;
  forEachSpatial(spatial.players, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS, (player) => {
    if (player.id !== viewer.id && !inInterestRange(viewer, player)) return;
    if (player.id === viewer.id) includedViewer = true;
    keepPlayerCandidate(player, player.id === viewer.id ? -1 : distanceSq(viewer, player));
  });
  if (!includedViewer) keepPlayerCandidate(viewer, -1);
  if (playerCandidateHeap) playerCandidates = drainSortedPlayerCandidateHeap(playerCandidateHeap);
  const players = serializeVisiblePlayers(viewer, playerCandidates, now);

  const visibleMonsters: MonsterView[] = [];
  forEachSpatial(spatial.monsters, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS, (monster) => {
    if (monster.deadUntil || monster.hidden || !inInterestRange(viewer, monster)) return;
    visibleMonsters.push(serializeMonster(monster, now));
  });

  const visibleCorpses: CorpseView[] = corpses.size === 0 ? EMPTY_CORPSE_VIEWS : [];
  if (corpses.size !== 0) {
    forEachSpatial(spatial.corpses, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS, (corpse) => {
      if (!inInterestRange(viewer, corpse)) return;
      visibleCorpses.push(corpse);
    });
  }

  const visibleNpcs: NpcView[] = includeNpcs ? [] : EMPTY_NPC_VIEWS;
  if (includeNpcs) {
    forEachSpatial(spatial.npcs, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS, (npc) => {
      if (!inInterestRange(viewer, npc)) return;
      visibleNpcs.push(serializeNpc(npc));
    });
  }

  const visibleTrees: TreeView[] = includeTreesForSession ? [] : EMPTY_TREE_VIEWS;
  if (includeTreesForSession) {
    materializeTreeCellsNear(viewer.floor, viewer.x, viewer.y, TREE_SNAPSHOT_RADIUS);
    forEachSpatial(staticSpatial.trees, viewer.floor, viewer.x, viewer.y, TREE_SNAPSHOT_RADIUS, (tree) => {
      if (!inTreeInterestRange(viewer, tree)) return;
      visibleTrees.push(serializeTree(tree));
    });
  }

  if (includeStaticResourcesForSession) materializeStaticResourceCellsNear(viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS);
  const visibleFishingNodes: FishingNodeView[] = includeFishingNodesForSession ? [] : EMPTY_FISHING_NODE_VIEWS;
  if (includeFishingNodesForSession) {
    forEachSpatial(staticSpatial.fishingNodes, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS, (node) => {
      if (inInterestRange(viewer, node)) visibleFishingNodes.push(serializeFishingNode(node));
    });
  }
  const visibleMiningNodes: MiningNodeView[] = includeMiningNodesForSession ? [] : EMPTY_MINING_NODE_VIEWS;
  if (includeMiningNodesForSession) {
    forEachSpatial(staticSpatial.miningNodes, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS, (node) => {
      if (inInterestRange(viewer, node)) visibleMiningNodes.push(serializeMiningNode(node));
    });
  }
  const visibleHerbNodes: HerbNodeView[] = includeHerbNodesForSession ? [] : EMPTY_HERB_NODE_VIEWS;
  if (includeHerbNodesForSession) {
    forEachSpatial(staticSpatial.herbNodes, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS, (node) => {
      if (inInterestRange(viewer, node)) visibleHerbNodes.push(serializeHerbNode(node));
    });
  }
  const visibleFires: FireView[] = fires.size === 0 ? EMPTY_FIRE_VIEWS : [];
  if (fires.size !== 0) {
    forEachSpatial(spatial.fires, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS, (fire) => {
      if (inInterestRange(viewer, fire)) visibleFires.push(serializeFire(fire, now));
    });
  }
  const playersDelta = snapshotDelta(cache.players, players, playerViewSignature, forceDynamicFull);
  const monstersDelta = snapshotDelta(cache.monsters, visibleMonsters, monsterViewSignature, forceDynamicFull);
  const corpsesDelta = snapshotDelta(cache.corpses, visibleCorpses, corpseViewSignature, forceDynamicFull);
  const npcsDelta = snapshotDelta(cache.npcs, visibleNpcs, npcViewSignature, forceDynamicFull, !includeNpcs);
  const treesDelta = snapshotDelta(cache.trees, visibleTrees, treeViewSignature, false, !includeTreesForSession);
  const fishingDelta = snapshotDelta(
    cache.fishingNodes,
    visibleFishingNodes,
    fishingNodeViewSignature,
    false,
    !includeFishingNodesForSession
  );
  const miningDelta = snapshotDelta(
    cache.miningNodes,
    visibleMiningNodes,
    miningNodeViewSignature,
    false,
    !includeMiningNodesForSession
  );
  const herbDelta = snapshotDelta(
    cache.herbNodes,
    visibleHerbNodes,
    herbNodeViewSignature,
    false,
    !includeHerbNodesForSession
  );
  const firesDelta = snapshotDelta(cache.fires, visibleFires, fireViewSignature, forceDynamicFull);

  const snapshot: StateSnapshot = {
    type: "state",
    players: playersDelta.items,
    playersFull: playersDelta.full,
    removedPlayerIds: playersDelta.removedIds,
    monsters: monstersDelta.items,
    monstersFull: monstersDelta.full,
    removedMonsterIds: monstersDelta.removedIds,
    corpses: corpsesDelta.items,
    corpsesFull: corpsesDelta.full,
    removedCorpseIds: corpsesDelta.removedIds,
    npcs: npcsDelta.items,
    npcsFull: npcsDelta.full,
    removedNpcIds: npcsDelta.removedIds,
    trees: treesDelta.items,
    treesFull: treesDelta.full,
    removedTreeIds: treesDelta.removedIds,
    fishingNodes: fishingDelta.items,
    fishingNodesFull: fishingDelta.full,
    removedFishingNodeIds: fishingDelta.removedIds,
    miningNodes: miningDelta.items,
    miningNodesFull: miningDelta.full,
    removedMiningNodeIds: miningDelta.removedIds,
    herbNodes: herbDelta.items,
    herbNodesFull: herbDelta.full,
    removedHerbNodeIds: herbDelta.removedIds,
    fires: firesDelta.items,
    firesFull: firesDelta.full,
    removedFireIds: firesDelta.removedIds,
    events: visibleEventsFor(viewer)
  };
  if (metricFrame) {
    snapshot.metrics = {
      clients: metricFrame.clients,
      monsters: metricFrame.monsters,
      zone: zoneAt(viewer.floor, viewer.x, viewer.y),
      visiblePlayers: playersDelta.visibleCount,
      visibleMonsters: monstersDelta.visibleCount,
      visibleCorpses: corpsesDelta.visibleCount,
      visibleTrees: treesDelta.visibleCount,
      visibleFishingNodes: fishingDelta.visibleCount,
      visibleMiningNodes: miningDelta.visibleCount,
      visibleFires: firesDelta.visibleCount,
      spatialCells: metricFrame.spatialCells,
      residentStaticResources: metricFrame.residentStaticResources,
      dynamicEntities: metricFrame.dynamicEntities,
      snapshotCacheEntries: metricFrame.snapshotCacheEntries,
      snapshotCacheEntriesPeak: metricFrame.snapshotCacheEntriesPeak,
      heapUsedMb: metricFrame.heapUsedMb,
      rssMb: metricFrame.rssMb,
      tickMs: metricFrame.tickMs,
      snapshotMs: metricFrame.snapshotMs,
      eventLoopDelayMs: metricFrame.eventLoopDelayMs,
      eventLoopDelayP95Ms: metricFrame.eventLoopDelayP95Ms,
      eventLoopDelayMaxMs: metricFrame.eventLoopDelayMaxMs,
      bytesOutPerSecond: metricFrame.bytesOutPerSecond,
      wireBytesOutPerSecond: metricFrame.wireBytesOutPerSecond,
      snapshotsSentPerSecond: metricFrame.snapshotsSentPerSecond,
      snapshotsSkippedBackpressurePerSecond: metricFrame.snapshotsSkippedBackpressurePerSecond,
      eventsDroppedPerSecond: metricFrame.eventsDroppedPerSecond,
      clientMessagesDroppedPerSecond: metricFrame.clientMessagesDroppedPerSecond,
      clientMessageMaxBytes: metricFrame.clientMessageMaxBytes,
      socketBackpressureBytes: metricFrame.socketBackpressureBytes,
      saveQueueDepth: metricFrame.saveQueueDepth,
      saveFlushMs: metricFrame.saveFlushMs,
      saveFlushPlayers: metricFrame.saveFlushPlayers,
      saveInFlight: metricFrame.saveInFlight
    };
  }
  return snapshot;
}

function residentStaticResourceCount(): number {
  return treeNodes.size + fishingNodesById.size + miningNodesById.size + herbNodes.size;
}

function dynamicEntityCount(): number {
  return clients.size + monsters.size + corpses.size + npcs.size + fires.size;
}

function snapshotCacheEntryCounts(): { total: number; peak: number } {
  let total = 0;
  let peak = 0;
  for (const session of clients.values()) {
    const cache = snapshotCaches.get(session);
    if (!cache) continue;
    const entries = snapshotCacheEntryCount(cache);
    total += entries;
    if (entries > peak) peak = entries;
  }
  return { total, peak };
}

function snapshotCacheEntryCount(cache: SnapshotCache): number {
  let total = 0;
  for (const category of SNAPSHOT_CATEGORIES) total += cache[category].signatures.size;
  return total;
}

const EMPTY_PLAYER_SNAPSHOT_CANDIDATES: PlayerSnapshotCandidate[] = [];

function serializeVisiblePlayers(viewer: ServerPlayer, candidates: PlayerSnapshotCandidate[], now: number): PlayerView[] {
  return candidates.map(({ player }) => (player.id === viewer.id ? serializePlayer(player, now) : serializePlayerPublicCached(player)));
}

function playerCandidateMaxHeap(candidates: PlayerSnapshotCandidate[]): MinHeap<PlayerSnapshotCandidate> {
  const heap = new MinHeap<PlayerSnapshotCandidate>(comparePlayerSnapshotCandidatesWorstFirst);
  for (const candidate of candidates) heap.push(candidate);
  return heap;
}

function keepNearestPlayerCandidate(heap: MinHeap<PlayerSnapshotCandidate>, player: ServerPlayer, distSq: number, limit: number): void {
  if (heap.size < limit) {
    heap.push({ player, distSq });
    return;
  }
  const worst = heap.peek();
  if (!worst || comparePlayerSnapshotCandidateValues(player, distSq, worst) >= 0) return;
  heap.pop();
  heap.push({ player, distSq });
}

function drainSortedPlayerCandidateHeap(heap: MinHeap<PlayerSnapshotCandidate>): PlayerSnapshotCandidate[] {
  const selected: PlayerSnapshotCandidate[] = [];
  while (heap.size > 0) {
    const candidate = heap.pop();
    if (candidate) selected.push(candidate);
  }
  selected.sort(comparePlayerSnapshotCandidates);
  return selected;
}

function comparePlayerSnapshotCandidates(a: PlayerSnapshotCandidate, b: PlayerSnapshotCandidate): number {
  return comparePlayerSnapshotCandidateValues(a.player, a.distSq, b);
}

function comparePlayerSnapshotCandidateValues(player: ServerPlayer, distSq: number, b: PlayerSnapshotCandidate): number {
  return distSq - b.distSq || player.id.localeCompare(b.player.id);
}

function comparePlayerSnapshotCandidatesWorstFirst(a: PlayerSnapshotCandidate, b: PlayerSnapshotCandidate): number {
  return comparePlayerSnapshotCandidates(b, a);
}

function snapshotCacheFor(session: Session): SnapshotCache {
  let cache = snapshotCaches.get(session);
  if (cache) return cache;
  cache = {
    players: snapshotCategoryCache(),
    monsters: snapshotCategoryCache(),
    corpses: snapshotCategoryCache(),
    npcs: snapshotCategoryCache(),
    trees: snapshotCategoryCache(),
    fishingNodes: snapshotCategoryCache(),
    miningNodes: snapshotCategoryCache(),
    herbNodes: snapshotCategoryCache(),
    fires: snapshotCategoryCache()
  };
  snapshotCaches.set(session, cache);
  return cache;
}

function snapshotCategoryCache(): SnapshotCategoryCache {
  return { initialized: false, signatures: new Map(), nextSignatures: new Map() };
}

function snapshotDelta<T extends SnapshotEntity>(
  cache: SnapshotCategoryCache,
  visible: T[],
  signatureFor: (item: T) => number,
  forceFull: boolean,
  preserve = false
): SnapshotDelta<T> {
  if (preserve) return { items: visible, removedIds: EMPTY_IDS, full: false, visibleCount: cache.signatures.size };
  if (visible.length === 0 && cache.signatures.size === 0) {
    const full = forceFull || !cache.initialized;
    cache.initialized = true;
    return { items: visible, removedIds: EMPTY_IDS, full, visibleCount: 0 };
  }
  const next = cache.nextSignatures;
  next.clear();
  const changed: T[] = [];
  const full = forceFull || !cache.initialized;
  for (const item of visible) {
    const signature = signatureFor(item);
    next.set(item.id, signature);
    if (full || cache.signatures.get(item.id) !== signature) changed.push(item);
  }
  const removedIds: string[] = [];
  if (!full) {
    for (const id of cache.signatures.keys()) {
      if (!next.has(id)) removedIds.push(id);
    }
  }
  cache.initialized = true;
  cache.nextSignatures = cache.signatures;
  cache.signatures = next;
  return { items: full ? visible : changed, removedIds: removedIds.length > 0 ? removedIds : EMPTY_IDS, full, visibleCount: visible.length };
}

function playerViewSignature(player: PlayerView): number {
  const cached = playerViewSignatureCache.get(player);
  if (cached !== undefined) return cached;
  let hash = HASH_INIT;
  hash = hashString(hash, player.id);
  hash = hashString(hash, player.name);
  hash = hashString(hash, player.classKey);
  hash = hashNumber(hash, player.floor);
  hash = hashNumber(hash, player.x);
  hash = hashNumber(hash, player.y);
  hash = hashString(hash, player.dir);
  hash = hashBool(hash, player.moving);
  hash = hashNumber(hash, player.hp);
  hash = hashNumber(hash, player.maxHp);
  hash = hashNumber(hash, player.mana ?? 0);
  hash = hashNumber(hash, player.maxMana ?? 0);
  hash = hashNumber(hash, player.level ?? 0);
  hash = hashNumber(hash, player.xp ?? 0);
  hash = hashNumber(hash, player.gold ?? 0);
  hash = hashNumber(hash, player.weaponTier ?? 0);
  hash = hashNumber(hash, player.armorTier ?? 0);
  hash = hashString(hash, player.targetId ?? "");
  hash = hashBool(hash, player.dead);
  hash = hashAction(hash, player.action);
  hash = hashBuffs(hash, player.buffs);
  for (const item of player.inventory ?? []) {
    hash = hashString(hash, item?.id ?? "");
    hash = hashNumber(hash, item?.qty ?? 0);
  }
  for (const quest of player.quests ?? []) {
    hash = hashString(hash, quest.id);
    hash = hashBool(hash, quest.accepted);
    hash = hashNumber(hash, quest.progress);
    hash = hashBool(hash, quest.complete);
    hash = hashBool(hash, quest.claimed);
  }
  for (const skill of player.skills ?? []) {
    hash = hashString(hash, skill.id);
    hash = hashNumber(hash, skill.xp);
    hash = hashNumber(hash, skill.level);
  }
  for (const ability of player.abilities ?? []) {
    hash = hashString(hash, ability.id);
    hash = hashNumber(hash, Math.ceil(ability.cooldownRemainingMs / 100));
    hash = hashNumber(hash, Math.ceil(ability.activeRemainingMs / 100));
  }
  for (const classKey of player.unlockedClasses ?? []) hash = hashString(hash, classKey);
  hash = hashNumber(hash, player.weight ?? 0);
  return hash;
}

function buildPlayerSignature(player: ServerPlayer, privateView: PlayerPrivateViewCache | null, action: ActionView | null, buffs: BuffsView): number {
  let hash = HASH_INIT;
  hash = hashString(hash, player.id);
  hash = hashString(hash, player.name);
  hash = hashString(hash, player.classKey);
  hash = hashNumber(hash, player.floor);
  hash = hashNumber(hash, round(player.x));
  hash = hashNumber(hash, round(player.y));
  hash = hashString(hash, player.dir);
  hash = hashBool(hash, player.moving);
  hash = hashNumber(hash, Math.round(player.hp));
  hash = hashNumber(hash, player.maxHp);
  hash = hashNumber(hash, Math.round(player.mana));
  hash = hashNumber(hash, player.maxMana);
  hash = hashNumber(hash, player.level);
  hash = hashNumber(hash, player.xp);
  hash = hashNumber(hash, player.gold);
  hash = hashNumber(hash, player.weaponTier);
  hash = hashNumber(hash, player.armorTier);
  hash = hashString(hash, player.targetId ?? "");
  hash = hashBool(hash, player.dead);
  hash = hashAction(hash, action);
  hash = hashBuffs(hash, buffs);
  if (privateView) {
    hash = hashString(hash, privateView.inventorySignature);
    hash = hashString(hash, privateView.questsSignature);
    hash = hashString(hash, privateView.skillsSignature);
    hash = hashString(hash, privateView.abilitiesSignature);
    hash = hashString(hash, privateView.classesSignature);
    hash = hashNumber(hash, privateView.weight);
    hash = hashNumber(hash, WEIGHT_SOFT_CAP);
  }
  return hash;
}

function buildPlayerPublicSignature(player: ServerPlayer, action: ActionView | null): number {
  let hash = HASH_INIT;
  hash = hashString(hash, player.id);
  hash = hashString(hash, player.name);
  hash = hashString(hash, player.classKey);
  hash = hashNumber(hash, player.floor);
  hash = hashNumber(hash, round(player.x));
  hash = hashNumber(hash, round(player.y));
  hash = hashString(hash, player.dir);
  hash = hashBool(hash, player.moving);
  hash = hashNumber(hash, Math.round(player.hp));
  hash = hashNumber(hash, player.maxHp);
  hash = hashBool(hash, player.dead);
  hash = hashAction(hash, action);
  return hash;
}

function buildMonsterSignature(monster: ServerMonster, attacking: boolean): number {
  let hash = HASH_INIT;
  hash = hashNumber(hash, monster.floor);
  hash = hashNumber(hash, round(monster.x));
  hash = hashNumber(hash, round(monster.y));
  hash = hashString(hash, monster.dir);
  hash = hashBool(hash, monster.moving);
  hash = hashBool(hash, attacking);
  hash = hashNumber(hash, Math.round(monster.hp));
  hash = hashNumber(hash, monster.maxHp);
  return hash;
}

function buildNpcSignature(npc: NpcRuntime): number {
  let hash = HASH_INIT;
  hash = hashNumber(hash, npc.floor);
  hash = hashNumber(hash, round(npc.x));
  hash = hashNumber(hash, round(npc.y));
  hash = hashString(hash, npc.dir);
  hash = hashBool(hash, npc.moving);
  hash = hashString(hash, npc.dialogue);
  return hash;
}

function monsterViewSignature(monster: MonsterView): number {
  const cached = resourceViewSignatureCache.get(monster);
  if (cached !== undefined) return cached;
  let hash = HASH_INIT;
  hash = hashNumber(hash, monster.floor);
  hash = hashNumber(hash, monster.x);
  hash = hashNumber(hash, monster.y);
  hash = hashString(hash, monster.dir);
  hash = hashBool(hash, monster.moving);
  hash = hashBool(hash, monster.attacking ?? false);
  hash = hashNumber(hash, monster.hp);
  hash = hashNumber(hash, monster.maxHp);
  return hash;
}

function corpseViewSignature(corpse: CorpseView): number {
  const cached = resourceViewSignatureCache.get(corpse);
  if (cached !== undefined) return cached;
  let hash = HASH_INIT;
  hash = hashNumber(hash, corpse.floor);
  hash = hashNumber(hash, corpse.x);
  hash = hashNumber(hash, corpse.y);
  hash = hashNumber(hash, corpse.gold);
  hash = hashString(hash, corpse.kind);
  for (const item of corpse.items) {
    hash = hashString(hash, item.id);
    hash = hashNumber(hash, item.qty);
  }
  resourceViewSignatureCache.set(corpse, hash);
  return hash;
}

function npcViewSignature(npc: NpcView): number {
  const cached = resourceViewSignatureCache.get(npc);
  if (cached !== undefined) return cached;
  let hash = HASH_INIT;
  hash = hashNumber(hash, npc.floor);
  hash = hashNumber(hash, npc.x);
  hash = hashNumber(hash, npc.y);
  hash = hashString(hash, npc.dir);
  hash = hashBool(hash, npc.moving);
  hash = hashString(hash, npc.dialogue);
  return hash;
}

function treeViewSignature(tree: TreeView): number {
  const cached = resourceViewSignatureCache.get(tree);
  if (cached !== undefined) return cached;
  let hash = HASH_INIT;
  hash = hashNumber(hash, tree.floor);
  hash = hashNumber(hash, tree.x);
  hash = hashNumber(hash, tree.y);
  hash = hashString(hash, tree.type);
  hash = hashBool(hash, tree.active);
  return hash;
}

function fishingNodeViewSignature(node: FishingNodeView): number {
  const cached = resourceViewSignatureCache.get(node);
  if (cached !== undefined) return cached;
  let hash = HASH_INIT;
  hash = hashNumber(hash, node.floor);
  hash = hashNumber(hash, node.x);
  hash = hashNumber(hash, node.y);
  hash = hashNumber(hash, node.approachX);
  hash = hashNumber(hash, node.approachY);
  return hash;
}

function miningNodeViewSignature(node: MiningNodeView): number {
  const cached = resourceViewSignatureCache.get(node);
  if (cached !== undefined) return cached;
  let hash = fishingNodeViewSignature(node);
  hash = hashString(hash, node.kind);
  return hash;
}

function herbNodeViewSignature(node: HerbNodeView): number {
  const cached = resourceViewSignatureCache.get(node);
  if (cached !== undefined) return cached;
  let hash = HASH_INIT;
  hash = hashNumber(hash, node.floor);
  hash = hashNumber(hash, node.x);
  hash = hashNumber(hash, node.y);
  hash = hashNumber(hash, node.approachX);
  hash = hashNumber(hash, node.approachY);
  hash = hashBool(hash, node.active);
  hash = hashNumber(hash, node.requiredLevel);
  return hash;
}

function fireViewSignature(fire: FireView): number {
  let hash = HASH_INIT;
  hash = hashNumber(hash, fire.floor);
  hash = hashNumber(hash, fire.x);
  hash = hashNumber(hash, fire.y);
  hash = hashNumber(hash, Math.ceil(fire.remainingMs / 1000));
  return hash;
}

const HASH_INIT = 2166136261;

function hashNumber(hash: number, value: number): number {
  return hashMix(hash, Math.round(value * 1000));
}

function hashBool(hash: number, value: boolean): number {
  return hashMix(hash, value ? 1 : 0);
}

function hashString(hash: number, value: string): number {
  for (let i = 0; i < value.length; i += 1) {
    hash = hashMix(hash, value.charCodeAt(i));
  }
  return hashMix(hash, 0);
}

function hashAction(hash: number, action: ActionView | null): number {
  if (!action) return hashMix(hash, 0);
  hash = hashString(hash, action.type);
  hash = hashString(hash, action.treeId ?? action.nodeId ?? action.fireId ?? "");
  return hash;
}

function hashBuffs(hash: number, buffs: BuffsView | undefined): number {
  if (!buffs) return hashMix(hash, 0);
  hash = hashNumber(hash, Math.ceil(buffs.wellFed / 100));
  hash = hashNumber(hash, Math.ceil(buffs.foodRegen / 100));
  hash = hashNumber(hash, Math.ceil(buffs.sprint / 100));
  hash = hashNumber(hash, Math.ceil(buffs.secondWind / 100));
  hash = hashNumber(hash, Math.ceil(buffs.ironClad / 100));
  hash = hashNumber(hash, Math.ceil(buffs.fleetFoot / 100));
  hash = hashNumber(hash, Math.ceil(buffs.slowed / 100));
  hash = hashNumber(hash, Math.ceil(buffs.stunned / 100));
  hash = hashNumber(hash, Math.ceil(buffs.weakened / 100));
  return hash;
}

function hashMix(hash: number, value: number): number {
  return Math.imul(hash ^ value, 16777619) >>> 0;
}

function actionView(a: PlayerAction): ActionView {
  if (a.type === "woodcutting") return { type: a.type, treeId: a.treeId };
  if (a.type === "fishing") return { type: a.type, nodeId: a.nodeId };
  if (a.type === "mining") return { type: a.type, nodeId: a.nodeId };
  if (a.type === "herbing") return { type: a.type, nodeId: a.nodeId };
  return { type: a.type, fireId: a.fireId };
}

function serializePlayer(player: ServerPlayer, now: number): PlayerView {
  const cached = selfPlayerViewCache.get(player);
  if (cached?.checkedSequence === snapshotSequence) return cached.view;
  const privateView = serializePlayerPrivate(player, now);
  const action = player.action ? actionView(player.action) : null;
  const buffs = serializeBuffs(player, now);
  const signature = buildPlayerSignature(player, privateView, action, buffs);
  if (cached?.signature === signature) {
    cached.checkedSequence = snapshotSequence;
    return cached.view;
  }
  const view: PlayerView = {
    id: player.id,
    name: player.name,
    classKey: player.classKey,
    floor: player.floor,
    x: round(player.x),
    y: round(player.y),
    dir: player.dir,
    moving: player.moving,
    hp: Math.round(player.hp),
    maxHp: player.maxHp,
    mana: Math.round(player.mana),
    maxMana: player.maxMana,
    level: player.level,
    xp: player.xp,
    gold: player.gold,
    weaponTier: player.weaponTier,
    armorTier: player.armorTier,
    targetId: player.targetId,
    dead: player.dead,
    action,
    buffs,
    inventory: privateView.inventory,
    quests: privateView.quests,
    skills: privateView.skills,
    abilities: privateView.abilities,
    unlockedClasses: privateView.unlockedClasses,
    weight: privateView.weight,
    maxWeight: WEIGHT_SOFT_CAP
  };
  playerViewSignatureCache.set(view, signature);
  selfPlayerViewCache.set(player, { checkedSequence: snapshotSequence, signature, view });
  return view;
}

function serializePlayerPrivate(player: ServerPlayer, now: number): PlayerPrivateViewCache {
  const inventorySignature = inventoryCacheSignature(player);
  const questsSignature = `${questCacheSignature(player)}|inv:${inventorySignature}`;
  const skillsSignature = skillCacheSignature(player);
  const abilitiesSignature = abilityCacheSignature(player, now);
  const classesSignature = String(player.classesRevision);
  const cached = privatePlayerViewCache.get(player);
  if (
    cached &&
    cached.inventorySignature === inventorySignature &&
    cached.questsSignature === questsSignature &&
    cached.skillsSignature === skillsSignature &&
    cached.abilitiesSignature === abilitiesSignature &&
    cached.classesSignature === classesSignature
  ) {
    return cached;
  }
  const next: PlayerPrivateViewCache = {
    inventorySignature,
    inventory: cached?.inventorySignature === inventorySignature ? cached.inventory : serializeInventory(player.inventory),
    questsSignature,
    quests: cached?.questsSignature === questsSignature ? cached.quests : serializeQuests(player),
    skillsSignature,
    skills: cached?.skillsSignature === skillsSignature ? cached.skills : serializeSkills(player),
    abilitiesSignature,
    abilities: cached?.abilitiesSignature === abilitiesSignature ? cached.abilities : serializeAbilities(player, now),
    classesSignature,
    unlockedClasses: cached?.classesSignature === classesSignature ? cached.unlockedClasses : [...player.unlockedClasses],
    weight: cached?.inventorySignature === inventorySignature ? cached.weight : Math.round(player.carriedWeight)
  };
  privatePlayerViewCache.set(player, next);
  return next;
}

function serializePlayerPublicCached(player: ServerPlayer): PlayerView {
  const cached = publicPlayerViewCache.get(player.id);
  if (cached?.checkedSequence === snapshotSequence) return cached.view;
  const action = player.action ? actionView(player.action) : null;
  const signature = buildPlayerPublicSignature(player, action);
  if (cached?.signature === signature) {
    cached.checkedSequence = snapshotSequence;
    return cached.view;
  }
  const view = serializePlayerPublic(player, action, signature);
  publicPlayerViewCache.set(player.id, { checkedSequence: snapshotSequence, signature, view });
  return view;
}

function serializePlayerPublic(player: ServerPlayer, action: ActionView | null, signature: number): PlayerView {
  const view = {
    id: player.id,
    name: player.name,
    classKey: player.classKey,
    floor: player.floor,
    x: round(player.x),
    y: round(player.y),
    dir: player.dir,
    moving: player.moving,
    hp: Math.round(player.hp),
    maxHp: player.maxHp,
    dead: player.dead,
    action
  } as PlayerView;
  playerViewSignatureCache.set(view, signature);
  return view;
}

function abilityCacheSignature(player: ServerPlayer, now: number): string {
  const classSpec = CLASSES[player.classKey ?? "adventurer"] ?? CLASSES["adventurer"]!;
  return (classSpec.abilities ?? [])
    .map((id) => {
      const buff = player.abilityBuffs?.[id as keyof typeof player.abilityBuffs];
      const cooldown = Math.ceil(Math.max(0, (player.abilityCooldowns?.[id] ?? 0) - now) / 100);
      const active = Math.ceil(Math.max(0, (buff?.until ?? 0) - now) / 100);
      return `${id}:${cooldown}:${active}`;
    })
    .join("|");
}

function serializeAbilities(player: ServerPlayer, now: number): AbilityView[] {
  const classSpec = CLASSES[player.classKey ?? "adventurer"] ?? CLASSES["adventurer"]!;
  const ids = classSpec.abilities ?? [];
  return ids.map((id): AbilityView | null => {
    const spec = ABILITIES[id];
    if (!spec) return null;
    const buff = player.abilityBuffs?.[id as keyof typeof player.abilityBuffs];
    return {
      id,
      label: spec.label,
      description: spec.description,
      cooldownMs: spec.cooldownMs,
      durationMs: spec.durationMs,
      cooldownRemainingMs: Math.max(0, Math.round((player.abilityCooldowns?.[id] ?? 0) - now)),
      activeRemainingMs: Math.max(0, Math.round((buff?.until ?? 0) - now))
    };
  }).filter((a): a is AbilityView => a !== null);
}

function serializeMonster(monster: ServerMonster, now: number): MonsterView {
  const cached = monsterViewCache.get(monster);
  if (cached?.checkedSequence === snapshotSequence) return cached.view;
  const attacking = (monster.attackUntil ?? 0) > now;
  const signature = buildMonsterSignature(monster, attacking);
  if (cached?.signature === signature) {
    cached.checkedSequence = snapshotSequence;
    return cached.view;
  }
  const view = {
    id: monster.id,
    type: monster.type,
    name: MONSTERS[monster.type]?.name ?? monster.type,
    floor: monster.floor,
    x: round(monster.x),
    y: round(monster.y),
    dir: monster.dir,
    moving: monster.moving,
    attacking,
    hp: Math.round(monster.hp),
    maxHp: monster.maxHp,
    zone: monster.zone
  };
  resourceViewSignatureCache.set(view, signature);
  monsterViewCache.set(monster, { checkedSequence: snapshotSequence, signature, view });
  return view;
}

function serializeNpc(npc: NpcRuntime): NpcView {
  const cached = npcViewCache.get(npc);
  if (cached?.checkedSequence === snapshotSequence) return cached.view;
  const signature = buildNpcSignature(npc);
  if (cached?.signature === signature) {
    cached.checkedSequence = snapshotSequence;
    return cached.view;
  }
  const view = {
    id: npc.id,
    name: npc.name,
    role: npc.role as NpcView["role"],
    floor: npc.floor,
    x: round(npc.x),
    y: round(npc.y),
    dir: npc.dir,
    moving: npc.moving,
    dialogue: npc.dialogue
  };
  resourceViewSignatureCache.set(view, signature);
  npcViewCache.set(npc, { checkedSequence: snapshotSequence, signature, view });
  return view;
}

function serializeTree(tree: TreeNodeRuntime): TreeView {
  const stateKey = tree.active ? "1" : "0";
  const cached = treeViewCache.get(tree);
  if (cached?.stateKey === stateKey) return cached.view;
  const view = {
    id: tree.id,
    type: tree.type,
    floor: tree.floor,
    x: tree.x,
    y: tree.y,
    active: tree.active
  } as TreeView;
  const signature = treeViewSignature(view);
  resourceViewSignatureCache.set(view, signature);
  treeViewCache.set(tree, { signature, stateKey, view });
  return view;
}

function serializeFishingNode(node: FishingNodeRuntime): FishingNodeView {
  const cached = fishingNodeViewCache.get(node);
  if (cached) return cached.view;
  const view = {
    id: node.id,
    floor: node.floor,
    x: node.x,
    y: node.y,
    approachX: node.approachX,
    approachY: node.approachY,
    label: "Fishing spot"
  };
  const signature = fishingNodeViewSignature(view);
  resourceViewSignatureCache.set(view, signature);
  fishingNodeViewCache.set(node, { signature, stateKey: "static", view });
  return view;
}

const ORE_LABELS: Record<string, string> = {
  copper: "Copper vein",
  tin: "Tin vein",
  iron: "Iron vein"
};

function serializeMiningNode(node: MiningNodeRuntime): MiningNodeView {
  const cached = miningNodeViewCache.get(node);
  if (cached) return cached.view;
  const view = {
    id: node.id,
    floor: node.floor,
    x: node.x,
    y: node.y,
    approachX: node.approachX,
    approachY: node.approachY,
    kind: node.kind,
    label: ORE_LABELS[node.kind] ?? "Ore vein"
  };
  const signature = miningNodeViewSignature(view);
  resourceViewSignatureCache.set(view, signature);
  miningNodeViewCache.set(node, { signature, stateKey: "static", view });
  return view;
}

function serializeHerbNode(node: HerbNodeRuntime): HerbNodeView {
  const stateKey = node.active ? "1" : "0";
  const cached = herbNodeViewCache.get(node);
  if (cached?.stateKey === stateKey) return cached.view;
  const view = {
    id: node.id,
    floor: node.floor,
    x: node.x,
    y: node.y,
    approachX: node.approachX,
    approachY: node.approachY,
    label: node.label,
    active: node.active,
    requiredLevel: node.requiredLevel
  };
  const signature = herbNodeViewSignature(view);
  resourceViewSignatureCache.set(view, signature);
  herbNodeViewCache.set(node, { signature, stateKey, view });
  return view;
}

function serializeFire(fire: Fire, now: number): FireView {
  return {
    id: fire.id,
    floor: fire.floor,
    x: fire.x,
    y: fire.y,
    remainingMs: Math.max(0, Math.round(fire.expiresAt - now))
  };
}

function serializeBuffs(player: ServerPlayer, now: number): BuffsView {
  return {
    wellFed: Math.max(0, Math.round((player.wellFedUntil ?? 0) - now)),
    foodRegen: Math.max(0, Math.round((player.foodRegenUntil ?? 0) - now)),
    sprint: Math.max(0, Math.round((player.abilityBuffs?.sprint?.until ?? 0) - now)),
    secondWind: Math.max(0, Math.round((player.abilityBuffs?.second_wind?.until ?? 0) - now)),
    ironClad: Math.max(0, Math.round((player.abilityBuffs?.ironClad?.until ?? 0) - now)),
    fleetFoot: Math.max(0, Math.round((player.abilityBuffs?.fleetFoot?.until ?? 0) - now)),
    slowed: Math.max(0, Math.round((player.slowUntil ?? 0) - now)),
    stunned: Math.max(0, Math.round((player.stunUntil ?? 0) - now)),
    weakened: Math.max(0, Math.round((player.weakUntil ?? 0) - now))
  };
}

function inInterestRange(viewer: ServerPlayer, entity: Positioned): boolean {
  if (viewer.floor !== entity.floor) return false;
  return distanceSq(viewer, entity) <= SNAPSHOT_RADIUS_SQ;
}

function inTreeInterestRange(viewer: ServerPlayer, entity: Positioned): boolean {
  if (viewer.floor !== entity.floor) return false;
  return distanceSq(viewer, entity) <= TREE_SNAPSHOT_RADIUS_SQ;
}

function eventVisibleTo(viewer: ServerPlayer, item: GameEvent): boolean {
  if (item.to && item.to !== viewer.id) return false;
  if (item.type === "chat" || item.type === "system") return true;
  if (item.type === "dialogue") return true;
  if (item.floor === null || item.x === null || item.y === null) return true;
  return inInterestRange(viewer, { floor: item.floor, x: item.x, y: item.y });
}

function visibleEventsFor(viewer: ServerPlayer): GameEvent[] {
  const targeted = targetedEventsByPlayer.get(viewer.id);
  if (globalEvents.length === 0 && !targeted && eventsByCell.size === 0) return EMPTY_EVENTS;
  if (eventsByCell.size === 0) {
    if (globalEvents.length === 0) return boundedEventList(targeted ?? EMPTY_EVENTS);
    if (!targeted) return boundedEventList(globalEvents);
    if (globalEvents.length + targeted.length <= VISIBLE_EVENT_LIMIT) {
      const visible = [...globalEvents, ...targeted];
      visible.sort(compareEventsByOrder);
      return visible;
    }
  }
  const visible: GameEvent[] = [];
  appendEventsUntilLimit(visible, targeted);
  appendEventsUntilLimit(visible, globalEvents);
  forEachEventCell(viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS, (item) => {
    if (visible.length >= VISIBLE_EVENT_LIMIT || !eventVisibleTo(viewer, item)) return;
    visible.push(item);
  });
  if (visible.length > 1) visible.sort(compareEventsByOrder);
  return visible;
}

function boundedEventList(events: GameEvent[]): GameEvent[] {
  if (events.length <= VISIBLE_EVENT_LIMIT) return events;
  return events.slice(0, VISIBLE_EVENT_LIMIT);
}

function appendEventsUntilLimit(visible: GameEvent[], events: GameEvent[] | undefined): void {
  if (!events) return;
  for (const item of events) {
    if (visible.length >= VISIBLE_EVENT_LIMIT) return;
    visible.push(item);
  }
}

function compareEventsByOrder(a: GameEvent, b: GameEvent): number {
  return (eventOrder.get(a) ?? 0) - (eventOrder.get(b) ?? 0);
}

function persistPlayerToDb(player: ServerPlayer): string {
  const key = player.name.toLowerCase();
  db.players[key] = {
    name: player.name,
    classKey: player.classKey,
    floor: player.floor,
    x: player.x,
    y: player.y,
    level: player.level,
    xp: player.xp,
    hp: player.hp,
    mana: player.mana,
    gold: player.gold,
    weaponTier: player.weaponTier,
    armorTier: player.armorTier,
    wellFedUntil: player.wellFedUntil ?? 0,
    foodRegenUntil: player.foodRegenUntil ?? 0,
    inventory: serializeInventory(player.inventory),
    quests: normalizeQuestState(player.quests),
    skills: normalizeSkillState(player.skills),
    unlockedClasses: [...player.unlockedClasses],
    updatedAt: new Date().toISOString()
  };
  return key;
}

function persistPlayer(player: ServerPlayer): void {
  dirtyPlayerKeys.add(persistPlayerToDb(player));
  refreshSaveMetrics();
  queueSave();
}

function persistOnlinePlayers(): void {
  for (const session of clients.values()) {
    if (!session.transient) dirtyPlayerKeys.add(persistPlayerToDb(session.player));
  }
  refreshSaveMetrics();
  queueSave();
}

function loadDb(): Database {
  const players: Record<string, SavedPlayer> = {};
  loadLegacyDb(players);
  loadPlayerFiles(players);
  return { players };
}

function loadLegacyDb(players: Record<string, SavedPlayer>): void {
  if (existsSync(LEGACY_MIGRATION_MARKER) || !existsSync(SAVE_FILE)) return;
  try {
    const legacy = JSON.parse(readFileSync(SAVE_FILE, "utf8")) as Partial<Database>;
    Object.assign(players, legacy.players ?? {});
    migrateLegacyPlayers(players);
  } catch (error) {
    console.error("Failed to load legacy player database:", error);
  }
}

function loadPlayerFiles(players: Record<string, SavedPlayer>): void {
  for (const file of readdirSync(PLAYER_DIR)) {
    if (!file.endsWith(".json")) continue;
    const key = decodeURIComponent(file.slice(0, -".json".length));
    try {
      players[key] = JSON.parse(readFileSync(join(PLAYER_DIR, file), "utf8")) as SavedPlayer;
    } catch (error) {
      console.error(`Failed to load player save ${file}:`, error);
    }
  }
}

function migrateLegacyPlayers(players: Record<string, SavedPlayer>): void {
  try {
    for (const [key, player] of Object.entries(players)) {
      writeFileSync(playerFilePath(key), JSON.stringify(player, null, 2));
    }
    writeFileSync(LEGACY_MIGRATION_MARKER, `migratedAt=${new Date().toISOString()}\n`);
  } catch (error) {
    console.error("Failed to migrate legacy player database:", error);
  }
}

function playerFilePath(key: string): string {
  return join(PLAYER_DIR, `${encodeURIComponent(key)}.json`);
}

function queueSave(): void {
  saveQueued = true;
  void flushSaveQueue();
}

async function flushSaveQueue(): Promise<void> {
  if (saveInFlight || !saveQueued) return;
  if (dirtyPlayerKeys.size === 0) {
    saveQueued = false;
    refreshSaveMetrics();
    return;
  }
  saveQueued = false;
  saveInFlight = true;
  const keys = [...dirtyPlayerKeys];
  dirtyPlayerKeys.clear();
  refreshSaveMetrics();
  const started = performance.now();
  let written = 0;
  try {
    for (let i = 0; i < keys.length; i += SAVE_CONCURRENCY) {
      const batch = keys.slice(i, i + SAVE_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (key) => {
          const player = db.players[key];
          if (!player) return false;
          await writeFile(playerFilePath(key), JSON.stringify(player, null, 2));
          return true;
        })
      );
      written += results.filter(Boolean).length;
      metrics.saveFlushPlayers = written;
      metrics.saveFlushMs = round(performance.now() - started);
      refreshSaveMetrics();
    }
  } catch (error) {
    console.error("Failed to save player data:", error);
    for (const key of keys) dirtyPlayerKeys.add(key);
    refreshSaveMetrics();
  } finally {
    saveInFlight = false;
    metrics.saveFlushPlayers = written;
    metrics.saveFlushMs = round(performance.now() - started);
    refreshSaveMetrics();
    if (saveQueued) void flushSaveQueue();
  }
}

function refreshSaveMetrics(): void {
  metrics.saveQueueDepth = dirtyPlayerKeys.size;
  metrics.saveInFlight = saveInFlight ? 1 : 0;
}

function sanitizeInput(input: Partial<InputPayload> = {}): InputPayload {
  const moveX = clamp(Number(input?.moveX ?? 0), -1, 1);
  const moveY = clamp(Number(input?.moveY ?? 0), -1, 1);
  const hasMoveVector = Number.isFinite(moveX) && Number.isFinite(moveY) && moveX * moveX + moveY * moveY > 0.0001;
  return {
    up: Boolean(input?.up),
    down: Boolean(input?.down),
    left: Boolean(input?.left),
    right: Boolean(input?.right),
    moveX: hasMoveVector ? moveX : 0,
    moveY: hasMoveVector ? moveY : 0
  };
}

function cleanName(name: unknown): string {
  return String(name ?? "wanderer").trim().replace(/[^\w -]/g, "").slice(0, 18) || "wanderer";
}

function createQuestState(): Record<string, QuestState> {
  return Object.fromEntries(
    QUEST_LIST.map((quest) => [quest.id, { accepted: false, progress: 0, complete: false, claimed: false }])
  );
}

function normalizeQuestState(saved: unknown): Record<string, QuestState> {
  const quests = createQuestState();
  const src = (saved ?? {}) as Record<string, Partial<QuestState> | undefined>;
  for (const [id, state] of Object.entries(src)) {
    if (!quests[id] || !state) continue;
    quests[id] = {
      accepted: Boolean(state.accepted) || Boolean(state.progress) || Boolean(state.complete) || Boolean(state.claimed),
      progress: clamp(Number(state.progress ?? 0), 0, QUESTS[id]?.targetCount ?? 0),
      complete: Boolean(state.complete),
      claimed: Boolean(state.claimed)
    };
  }
  return quests;
}

function updateQuestProgress(player: ServerPlayer, monster: ServerMonster): void {
  const quests = KILL_QUESTS_BY_ZONE_AND_TARGET.get(killQuestKey(monster.zone, monster.type));
  if (!quests) return;
  let changed = false;
  for (const quest of quests) {
    const state = player.quests[quest.id];
    if (!state || !state.accepted || state.claimed || state.complete) continue;
    state.progress = clamp(state.progress + 1, 0, quest.targetCount);
    changed = true;
    if (state.progress >= quest.targetCount) {
      state.complete = true;
      event("float", `${quest.title} ready to turn in`, player.x, player.y, player.floor, "#f7d486");
    }
  }
  if (changed) markQuestChanged(player);
}

function killQuestKey(zone: string, monsterType: string): string {
  return `${zone}:${monsterType}`;
}

function serializeQuests(player: ServerPlayer): QuestView[] {
  return QUEST_LIST.map((quest) => {
    const state = player.quests[quest.id] ?? { accepted: false, progress: 0, complete: false, claimed: false };
    const progress = state.claimed
      ? quest.targetCount
      : (quest.kind === "gather" || quest.kind === "fetch")
        ? clamp(inventoryCount(player, quest.itemId ?? ""), 0, quest.targetCount)
        : clamp(state.progress, 0, quest.targetCount);
    return {
      id: quest.id,
      title: quest.title,
      kind: quest.kind,
      giverId: quest.giverId,
      accepted: state.accepted,
      progress,
      target: quest.targetCount,
      complete: state.claimed || progress >= quest.targetCount,
      claimed: state.claimed,
      rewardGold: quest.rewardGold,
      rewardXp: quest.rewardXp
    };
  });
}

function createSkillState(): Record<string, SkillStateEntry> {
  return Object.fromEntries(Object.keys(SKILLS).map((id) => [id, { xp: 0 }]));
}

function createInventory(): InventorySlot[] {
  return Array.from({ length: INVENTORY_SIZE }, () => null);
}

function normalizeInventory(saved: unknown): InventorySlot[] {
  const inventory = createInventory();
  if (!Array.isArray(saved)) return inventory;
  saved.slice(0, INVENTORY_SIZE).forEach((item: { id?: unknown; qty?: unknown } | null, index: number) => {
    const id = String(item?.id ?? "");
    if (!ITEMS[id]) return;
    inventory[index] = { id, qty: Math.max(1, Math.floor(Number(item?.qty ?? 1))) };
  });
  return inventory;
}

function inventoryCacheSignature(player: ServerPlayer): string {
  return String(player.inventoryRevision);
}

function questCacheSignature(player: ServerPlayer): string {
  return String(player.questRevision);
}

function skillCacheSignature(player: ServerPlayer): string {
  return String(player.skillRevision);
}

function markInventoryChanged(player: ServerPlayer): void {
  player.inventoryRevision += 1;
}

function markQuestChanged(player: ServerPlayer): void {
  player.questRevision += 1;
}

function markSkillChanged(player: ServerPlayer): void {
  player.skillRevision += 1;
}

function markClassesChanged(player: ServerPlayer): void {
  player.classesRevision += 1;
}

function serializeInventory(inventory: InventorySlot[] = []): Array<InventoryItemView | null> {
  return normalizeInventory(inventory).map((item) => {
    if (!item) return null;
    const spec = ITEMS[item.id];
    if (!spec) return null;
    return { id: item.id, label: spec.label, icon: spec.icon, iconUrl: spec.iconUrl, qty: item.qty };
  });
}

function hasInventoryItem(player: ServerPlayer, id: string): boolean {
  return player.inventory.some((item) => item?.id === id && item.qty > 0);
}

function playerHasCapability(player: ServerPlayer, capability: "chop_tree" | "fish" | "mine" | "ranged"): boolean {
  for (const slot of player.inventory) {
    if (!slot || slot.qty <= 0) continue;
    const spec = ITEMS[slot.id];
    if (spec?.capabilities?.includes(capability)) return true;
  }
  return false;
}

function addInventoryItem(player: ServerPlayer, id: string, qty = 1): boolean {
  const spec = ITEMS[id];
  if (!spec) return false;
  let remaining = Math.max(1, Math.floor(qty));
  const stackable = spec.stackable !== false;
  if (stackable) {
    const existing = player.inventory.find((item) => item?.id === id);
    if (existing) {
      existing.qty += remaining;
      refreshCarriedWeight(player);
      markInventoryChanged(player);
      return true;
    }
  }
  let mutated = false;
  for (let i = 0; i < player.inventory.length && remaining > 0; i += 1) {
    if (player.inventory[i]) continue;
    player.inventory[i] = { id, qty: stackable ? remaining : 1 };
    mutated = true;
    remaining -= stackable ? remaining : 1;
  }
  const added = remaining === 0;
  if (mutated) {
    refreshCarriedWeight(player);
    markInventoryChanged(player);
  }
  return added;
}

function removeInventoryItem(player: ServerPlayer, id: string, qty = 1): boolean {
  let remaining = Math.max(1, Math.floor(qty));
  const available = player.inventory.reduce((sum, item) => sum + (item?.id === id ? item.qty : 0), 0);
  if (available < remaining) return false;
  for (const item of player.inventory) {
    if (!item || item.id !== id) continue;
    const taken = Math.min(item.qty, remaining);
    item.qty -= taken;
    remaining -= taken;
    if (remaining <= 0) break;
  }
  if (remaining > 0) return false;
  for (let i = 0; i < player.inventory.length; i += 1) {
    const slot = player.inventory[i];
    if (slot && slot.qty <= 0) player.inventory[i] = null;
  }
  refreshCarriedWeight(player);
  markInventoryChanged(player);
  return true;
}

function normalizeSkillState(saved: unknown): Record<string, SkillStateEntry> {
  const skills = createSkillState();
  const src = (saved ?? {}) as Record<string, { xp?: number } | undefined>;
  for (const id of Object.keys(skills)) {
    skills[id]!.xp = Math.max(0, Number(src[id]?.xp ?? 0));
  }
  return skills;
}

function serializeSkills(player: ServerPlayer): SkillView[] {
  return Object.entries(player.skills).map(([id, state]) => ({
    id,
    label: SKILLS[id]?.label ?? id,
    iconUrl: SKILLS[id]?.iconUrl ?? null,
    xp: Math.floor(state.xp),
    level: skillLevel(player, id),
    nextXp: xpForLevel(skillLevel(player, id) + 1)
  }));
}

function skillLevel(player: ServerPlayer, id: string): number {
  return Math.max(1, levelForXp(player.skills[id]?.xp ?? 0));
}

function addSkillXp(player: ServerPlayer, id: string, amount: number): void {
  const entry = player.skills[id] ?? (player.skills[id] = { xp: 0 });
  const before = skillLevel(player, id);
  entry.xp += amount;
  markSkillChanged(player);
  const after = skillLevel(player, id);
  if (after > before) systemToPlayer(player, `${player.name} reached ${SKILLS[id]?.label ?? id} ${after}.`);
  if (id === "defense" || id === "magic") recalculateVitals(player);
}

function fishingCatchMs(level: number): number {
  return clamp(3600 - (level - 1) * 80, 1600, 3600);
}

function miningSwingMs(level: number): number {
  if (E2E_TEST) return 150;
  return clamp(3800 - (level - 1) * 85, 1700, 3800);
}

function cookingMs(level: number): number {
  if (E2E_TEST) return 150;
  return clamp(2800 - (level - 1) * 55, 1300, 2800);
}

function firePlacementAtPlayer(player: ServerPlayer): Vec2 | null {
  if (!canStand(player.floor, player.x, player.y) || fireTooClose(player.floor, player.x, player.y)) return null;
  return { x: player.x, y: player.y };
}

function fireTooClose(floor: number, x: number, y: number): boolean {
  let tooClose = false;
  forEachCellIndex(firesByCell, floor, x, y, 1.2, (fire) => {
    if (!tooClose && fire.floor === floor) {
      const dx = fire.x - x;
      const dy = fire.y - y;
      if (dx * dx + dy * dy < 1.2 * 1.2) tooClose = true;
    }
  });
  return tooClose;
}

function isWellFed(player: ServerPlayer, now = performance.now()): boolean {
  return now < (player.wellFedUntil ?? 0);
}

function wellFedPower(player: ServerPlayer): number {
  return isWellFed(player) ? 2 : 0;
}

function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

function recalculateVitals(player: ServerPlayer): void {
  const spec = ADVENTURER;
  player.maxHp = spec.maxHp + (skillLevel(player, "defense") - 1) * spec.hpPerDefense;
  player.maxMana = spec.maxMana + (skillLevel(player, "magic") - 1) * spec.manaPerMagic;
}

function classOf(player: ServerPlayer): ClassSpec {
  return CLASSES[player.classKey ?? "adventurer"] ?? ADVENTURER;
}

function applyPlayerSlow(player: ServerPlayer, pct: number, ms: number): void {
  player.slowUntil = performance.now() + ms;
  player.slowMult = Math.max(0.2, 1 - pct / 100);
  event("float", "Slowed!", player.x, player.y - 0.55, player.floor, "#9ad36b");
}

function applyPlayerStun(player: ServerPlayer, ms: number): void {
  player.stunUntil = performance.now() + ms;
  event("float", "Stunned!", player.x, player.y - 0.55, player.floor, "#f0c84a");
}

function isStunned(player: ServerPlayer): boolean {
  return Boolean(player.stunUntil && performance.now() < player.stunUntil);
}

function applyPlayerWeaken(player: ServerPlayer, pct: number, ms: number): void {
  player.weakUntil = performance.now() + ms;
  player.weakMult = Math.max(0.2, 1 - pct / 100);
  event("float", "Weakened!", player.x, player.y - 0.55, player.floor, "#e6c27a");
}

// Multiplier applied to PHYSICAL (melee/ranged) damage while weakened.
function physicalMult(player: ServerPlayer): number {
  return player.weakUntil && performance.now() < player.weakUntil ? player.weakMult ?? 1 : 1;
}

function refreshCarriedWeight(player: ServerPlayer): number {
  let total = 0;
  for (const slot of player.inventory) {
    if (!slot) continue;
    total += (ITEMS[slot.id]?.weight ?? 0) * slot.qty;
  }
  player.carriedWeight = total;
  return total;
}

// Linear speed falloff from full at WEIGHT_SOFT_CAP down to MIN_ENCUMBRANCE_MULT
// at WEIGHT_HARD_CAP.
function encumbranceMultiplier(weight: number): number {
  if (weight <= WEIGHT_SOFT_CAP) return 1;
  if (weight >= WEIGHT_HARD_CAP) return MIN_ENCUMBRANCE_MULT;
  const t = (weight - WEIGHT_SOFT_CAP) / (WEIGHT_HARD_CAP - WEIGHT_SOFT_CAP);
  return 1 - t * (1 - MIN_ENCUMBRANCE_MULT);
}

// True line of sight between two points: no blocked tile along the segment.
function hasLineOfSight(floor: number, ax: number, ay: number, bx: number, by: number): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(dist * 4));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    // Sight-blocking only (walls/boulders/buildings) — projectiles skim over water.
    if (isSightBlocked(tileAt(floor, Math.floor(x), Math.floor(y)))) return false;
  }
  return true;
}

function fireProjectile(player: ServerPlayer, monster: ServerMonster, damage: number, kind: string): void {
  event("projectile", kind, monster.x, monster.y, monster.floor, null, player.id, monster.id, {
    fromX: player.x,
    fromY: player.y
  });
  damageMonster(player, monster, damage, "hit");
}

function createSpatialIndex(): SpatialIndex {
  return { players: new Map(), monsters: new Map(), corpses: new Map(), npcs: new Map(), trees: new Map(), fires: new Map(), cellCount: 0 };
}

function createStaticSpatialIndex(): StaticSpatialIndex {
  return { trees: new Map(), fishingNodes: new Map(), miningNodes: new Map(), herbNodes: new Map(), cellCount: 0 };
}

function buildStaticBaseCellIndex<T extends Positioned>(nodes: readonly T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const node of nodes) {
    const key = spatialKey(node.floor, node.x, node.y);
    const bucket = index.get(key) ?? [];
    bucket.push(node);
    index.set(key, bucket);
  }
  return index;
}

function rebuildStaticSpatialIndex(): void {
  staticSpatial = createStaticSpatialIndex();
  materializedTreeCells.clear();
  materializedStaticResourceCells.clear();
  fishingNodesById.clear();
  miningNodesById.clear();
  for (const [id, node] of Array.from(herbNodes)) {
    if (node.active && node.respawnAt <= 0) herbNodes.delete(id);
  }
  refreshStaticSpatialCellMetric();
}

function refreshSpatialCellMetric(): void {
  spatial.cellCount =
    spatial.players.size +
    spatial.monsters.size +
    spatial.corpses.size +
    spatial.npcs.size +
    spatial.fires.size;
}

function refreshStaticSpatialCellMetric(): void {
  staticSpatial.cellCount =
    staticSpatial.trees.size +
    staticSpatial.fishingNodes.size +
    staticSpatial.miningNodes.size +
    staticSpatial.herbNodes.size;
}

function addToSpatial<T extends Positioned>(index: Map<string, T[]>, entity: T): void {
  const key = spatialKey(entity.floor, entity.x, entity.y);
  const bucket = index.get(key) ?? [];
  if (bucket.includes(entity)) return;
  bucket.push(entity);
  index.set(key, bucket);
}

function removeFromSpatial<T extends Positioned>(index: Map<string, T[]>, entity: T): void {
  removeFromSpatialAt(index, entity, entity.floor, entity.x, entity.y);
}

function removeFromSpatialAt<T extends Positioned>(index: Map<string, T[]>, entity: T, floor: number, x: number, y: number): void {
  const key = spatialKey(floor, x, y);
  removeFromSpatialAtKey(index, entity, key);
}

function removeFromSpatialAtKey<T extends Positioned>(index: Map<string, T[]>, entity: T, key: string): void {
  const bucket = index.get(key);
  if (!bucket) return;
  const indexInBucket = bucket.indexOf(entity);
  if (indexInBucket < 0) return;
  bucket.splice(indexInBucket, 1);
  if (!bucket.length) index.delete(key);
}

function updateSpatialCell<T extends Positioned>(index: Map<string, T[]>, entity: T, oldFloor: number, oldX: number, oldY: number): void {
  const oldKey = spatialKey(oldFloor, oldX, oldY);
  const nextKey = spatialKey(entity.floor, entity.x, entity.y);
  if (oldKey === nextKey) return;
  removeFromSpatialAtKey(index, entity, oldKey);
  addToSpatial(index, entity);
}

function spatialQueryCells(floor: number, x: number, y: number, radius: number): SpatialCellRef[] {
  const minCx = Math.floor((x - radius) / SPATIAL_CELL_SIZE);
  const maxCx = Math.floor((x + radius) / SPATIAL_CELL_SIZE);
  const minCy = Math.floor((y - radius) / SPATIAL_CELL_SIZE);
  const maxCy = Math.floor((y + radius) / SPATIAL_CELL_SIZE);
  const cacheKey = `${floor}:${minCx}:${maxCx}:${minCy}:${maxCy}`;
  const cached = spatialQueryCellCache.get(cacheKey);
  if (cached) return cached;
  const cells: SpatialCellRef[] = [];
  for (let cy = minCy; cy <= maxCy; cy += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      cells.push({ key: `${floor}:${cx}:${cy}`, floor, cx, cy });
    }
  }
  spatialQueryCellCache.set(cacheKey, cells);
  if (spatialQueryCellCache.size > SPATIAL_QUERY_CACHE_ENTRIES) {
    const oldest = spatialQueryCellCache.keys().next().value;
    if (oldest) spatialQueryCellCache.delete(oldest);
  }
  return cells;
}

function forEachSpatial<T>(index: Map<string, T[]>, floor: number, x: number, y: number, radius: number, visit: (item: T) => void): void {
  for (const cell of spatialQueryCells(floor, x, y, radius)) {
    const bucket = index.get(cell.key);
    if (!bucket) continue;
    for (const item of bucket) visit(item);
  }
}

function spatialKey(floor: number, x: number, y: number): string {
  return `${floor}:${Math.floor(x / SPATIAL_CELL_SIZE)}:${Math.floor(y / SPATIAL_CELL_SIZE)}`;
}

function event(
  type: string,
  text: string | number,
  x: number | null = null,
  y: number | null = null,
  floor: number | null = null,
  color: string | null = null,
  from: string | null = null,
  target: string | null = null,
  extra: Partial<GameEvent> = {}
): void {
  const item: GameEvent = { type, text, x, y, floor, color, from, target, t: Date.now(), ...extra };
  eventOrder.set(item, nextEventOrder++);
  if (item.to) {
    const bucket = targetedEventsByPlayer.get(item.to) ?? [];
    if (bucket.length >= TARGETED_EVENT_QUEUE_LIMIT) {
      metrics.eventsDroppedThisSecond += 1;
      return;
    }
    bucket.push(item);
    targetedEventsByPlayer.set(item.to, bucket);
    return;
  }
  if (eventIsBroadcastGlobal(item)) {
    if (globalEvents.length >= GLOBAL_EVENT_QUEUE_LIMIT) {
      metrics.eventsDroppedThisSecond += 1;
      return;
    }
    globalEvents.push(item);
    return;
  }
  const key = spatialKey(item.floor!, item.x!, item.y!);
  const bucket = eventsByCell.get(key) ?? [];
  if (bucket.length >= CELL_EVENT_QUEUE_LIMIT) {
    metrics.eventsDroppedThisSecond += 1;
    return;
  }
  bucket.push(item);
  eventsByCell.set(key, bucket);
}

function eventIsBroadcastGlobal(item: GameEvent): boolean {
  return item.type === "chat" || item.type === "system" || item.type === "dialogue" || item.floor === null || item.x === null || item.y === null;
}

function forEachEventCell(floor: number, x: number, y: number, radius: number, visit: (event: GameEvent) => void): void {
  for (const cell of spatialQueryCells(floor, x, y, radius)) {
    const bucket = eventsByCell.get(cell.key);
    if (!bucket) continue;
    for (const item of bucket) visit(item);
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceSq(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function createMetricWindow(): MetricWindow {
  return { values: new Array<number>(METRIC_WINDOW), index: 0, count: 0, sum: 0 };
}

function recordSample(window: MetricWindow, value: number): void {
  if (window.count < METRIC_WINDOW) {
    window.count += 1;
  } else {
    window.sum -= window.values[window.index] ?? 0;
  }
  window.values[window.index] = value;
  window.sum += value;
  window.index = (window.index + 1) % METRIC_WINDOW;
}

function metricAverage(window: MetricWindow): number {
  return window.count ? window.sum / window.count : 0;
}

function updateByteMetric(): void {
  const now = performance.now();
  if (now - metrics.lastBytesAt < 1000) return;
  metrics.bytesOutPerSecond = metrics.bytesOutThisSecond;
  metrics.wireBytesOutPerSecond = sampleWireBytesOut();
  metrics.snapshotsSentPerSecond = metrics.snapshotsSentThisSecond;
  metrics.snapshotsSkippedBackpressurePerSecond = metrics.snapshotsSkippedBackpressureThisSecond;
  metrics.eventsDroppedPerSecond = metrics.eventsDroppedThisSecond;
  metrics.clientMessagesDroppedPerSecond = metrics.clientMessagesDroppedThisSecond;
  metrics.eventLoopDelayMs = nsToMs(eventLoopDelay.mean);
  metrics.eventLoopDelayP95Ms = nsToMs(eventLoopDelay.percentile(95));
  metrics.eventLoopDelayMaxMs = nsToMs(eventLoopDelay.max);
  eventLoopDelay.reset();
  metrics.bytesOutThisSecond = 0;
  metrics.snapshotsSentThisSecond = 0;
  metrics.snapshotsSkippedBackpressureThisSecond = 0;
  metrics.eventsDroppedThisSecond = 0;
  metrics.clientMessagesDroppedThisSecond = 0;
  metrics.lastBytesAt = now;
}

function sampleWireBytesOut(): number {
  let total = 0;
  for (const { socket } of clients.values()) {
    const current = socketBytesWritten(socket);
    const previous = socketWireBytes.get(socket) ?? current;
    if (current > previous) total += current - previous;
    socketWireBytes.set(socket, current);
  }
  return total;
}

function socketBytesWritten(socket: ExtWebSocket): number {
  const rawSocket = (socket as unknown as { _socket?: { bytesWritten?: number } })._socket;
  return Math.max(0, Math.floor(Number(rawSocket?.bytesWritten ?? 0)));
}

function nsToMs(value: number): number {
  return Number.isFinite(value) ? round(value / 1_000_000) : 0;
}

function roll([min, max]: Range): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positiveIntEnv(name: string, fallback: number): number {
  const value = Math.floor(Number(process.env[name] ?? fallback));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function optionalPositiveIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (raw == null || raw === "") return null;
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
