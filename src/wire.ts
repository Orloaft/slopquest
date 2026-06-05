import type {
  ActionView,
  BuffsView,
  CorpseView,
  FireView,
  FishingNodeView,
  GameEvent,
  HerbNodeView,
  MiningNodeView,
  MonsterView,
  NpcView,
  PlayerView,
  ServerMessage,
  StateMetrics,
  StateSnapshot,
  TreeView
} from "./types.ts";

interface CompactPlayerView {
  i: string;
  n: string;
  c: string;
  f: number;
  x: number;
  y: number;
  d: PlayerView["dir"];
  mo?: 1;
  h: number;
  mh: number;
  ma?: number;
  mma?: number;
  fa?: number;
  mfa?: number;
  l?: number;
  xp?: number;
  g?: number;
  w?: number;
  ar?: number;
  tg?: string | null;
  de?: 1;
  ac?: ActionView | null;
  b?: BuffsView;
  inv?: PlayerView["inventory"];
  bb?: PlayerView["buyback"];
  q?: PlayerView["quests"];
  sk?: PlayerView["skills"];
  ab?: PlayerView["abilities"];
  uc?: string[];
  wt?: number;
  mw?: number;
}

interface CompactMonsterView {
  i: string;
  t: string;
  n: string;
  l?: number;
  r?: number | MonsterView["role"];
  f: number;
  x: number;
  y: number;
  d: MonsterView["dir"];
  mo?: 1;
  at?: 1;
  tg?: string;
  st?: number | MonsterView["statuses"];
  h: number;
  mh: number;
  z: string;
}

interface CompactNpcView {
  i: string;
  n: string;
  r: NpcView["role"];
  f: number;
  x: number;
  y: number;
  d: NpcView["dir"];
  mo?: 1;
  dl: string;
}

interface CompactTreeView {
  i: string;
  t: string;
  l: string;
  rl: number;
  f: number;
  x: number;
  y: number;
  a?: 1;
}

interface CompactFishingNodeView {
  i: string;
  f: number;
  x: number;
  y: number;
  ax: number;
  ay: number;
  l: string;
}

interface CompactMiningNodeView extends CompactFishingNodeView {
  k: string;
}

interface CompactHerbNodeView extends CompactFishingNodeView {
  a?: 1;
  rl: number;
}

interface CompactFireView {
  i: string;
  f: number;
  x: number;
  y: number;
  r: number;
}

interface CompactCorpseView {
  i: string;
  f: number;
  x: number;
  y: number;
  g: number;
  l: string;
  k: CorpseView["kind"];
  it: CorpseView["items"];
}

interface CompactGameEvent {
  k: string;
  v: GameEvent["text"];
  tm: number;
  x?: number;
  y?: number;
  f?: number;
  c?: string;
  fr?: string;
  tg?: string;
  fx?: number;
  fy?: number;
  an?: number;
  s?: number;
  du?: number;
  dt?: string;
  to?: string;
  ln?: GameEvent["lines"];
  os?: 1;
  oa?: 1;
  sm?: 1;
}

interface CompactStateMetrics {
  c: number;
  mo: number;
  z: string;
  vp: number;
  vm: number;
  vc: number;
  vt: number;
  vfn: number;
  vmn: number;
  vf: number;
  sc: number;
  rs: number;
  de: number;
  sce: number;
  scp: number;
  hu: number;
  rss: number;
  tm: number;
  sm: number;
  eld: number;
  elp: number;
  elm: number;
  bo: number;
  wbo: number;
  ss: number;
  sb: number;
  st: number;
  ed: number;
  cmd: number;
  cmb: number;
  sbb: number;
  sqd: number;
  sfm: number;
  sfp: number;
  sif: number;
}

export interface CompactStateSnapshot {
  type: "state";
  p?: CompactPlayerView[] | StateSnapshot["players"];
  pF?: 1 | true;
  pR?: StateSnapshot["removedPlayerIds"];
  m?: CompactMonsterView[] | StateSnapshot["monsters"];
  mF?: 1 | true;
  mR?: StateSnapshot["removedMonsterIds"];
  c?: CompactCorpseView[] | StateSnapshot["corpses"];
  cF?: 1 | true;
  cR?: StateSnapshot["removedCorpseIds"];
  n?: CompactNpcView[] | StateSnapshot["npcs"];
  nF?: 1 | true;
  nR?: StateSnapshot["removedNpcIds"];
  t?: CompactTreeView[] | StateSnapshot["trees"];
  tF?: 1 | true;
  tR?: StateSnapshot["removedTreeIds"];
  fn?: CompactFishingNodeView[] | StateSnapshot["fishingNodes"];
  fnF?: 1 | true;
  fnR?: StateSnapshot["removedFishingNodeIds"];
  mn?: CompactMiningNodeView[] | StateSnapshot["miningNodes"];
  mnF?: 1 | true;
  mnR?: StateSnapshot["removedMiningNodeIds"];
  hn?: CompactHerbNodeView[] | StateSnapshot["herbNodes"];
  hnF?: 1 | true;
  hnR?: StateSnapshot["removedHerbNodeIds"];
  f?: CompactFireView[] | StateSnapshot["fires"];
  fF?: 1 | true;
  fR?: StateSnapshot["removedFireIds"];
  e?: CompactGameEvent[] | StateSnapshot["events"];
  x?: CompactStateMetrics | StateMetrics;
}

export type WireServerMessage = ServerMessage | CompactStateSnapshot;

const compactPlayerViewCache = new WeakMap<PlayerView, CompactPlayerView>();
const compactMonsterViewCache = new WeakMap<MonsterView, CompactMonsterView>();
const compactNpcViewCache = new WeakMap<NpcView, CompactNpcView>();
const compactCorpseViewCache = new WeakMap<CorpseView, CompactCorpseView>();
const compactTreeViewCache = new WeakMap<TreeView, CompactTreeView>();
const compactFishingNodeViewCache = new WeakMap<FishingNodeView, CompactFishingNodeView>();
const compactMiningNodeViewCache = new WeakMap<MiningNodeView, CompactMiningNodeView>();
const compactHerbNodeViewCache = new WeakMap<HerbNodeView, CompactHerbNodeView>();
const compactGameEventCache = new WeakMap<GameEvent, CompactGameEvent>();

const MONSTER_ROLE_CODES = ["pack", "ambush", "turret", "elite", "boss"] as const satisfies readonly MonsterView["role"][];
const MONSTER_STATUS_BITS = ["taunt", "snare", "freeze", "burn", "slow", "inaccurate", "aiming"] as const satisfies readonly NonNullable<MonsterView["statuses"]>[number][];

export function compactStateSnapshot(snapshot: StateSnapshot): CompactStateSnapshot {
  const wire: CompactStateSnapshot = { type: "state" };
  if (snapshot.players.length > 0) wire.p = snapshot.players.map(compactPlayerView);
  if (snapshot.playersFull) wire.pF = 1;
  if (snapshot.removedPlayerIds.length > 0) wire.pR = snapshot.removedPlayerIds;
  if (snapshot.monsters.length > 0) wire.m = snapshot.monsters.map(compactMonsterView);
  if (snapshot.monstersFull) wire.mF = 1;
  if (snapshot.removedMonsterIds.length > 0) wire.mR = snapshot.removedMonsterIds;
  if (snapshot.corpses.length > 0) wire.c = snapshot.corpses.map(compactCorpseView);
  if (snapshot.corpsesFull) wire.cF = 1;
  if (snapshot.removedCorpseIds.length > 0) wire.cR = snapshot.removedCorpseIds;
  if (snapshot.npcs.length > 0) wire.n = snapshot.npcs.map(compactNpcView);
  if (snapshot.npcsFull) wire.nF = 1;
  if (snapshot.removedNpcIds.length > 0) wire.nR = snapshot.removedNpcIds;
  if (snapshot.trees.length > 0) wire.t = snapshot.trees.map(compactTreeView);
  if (snapshot.treesFull) wire.tF = 1;
  if (snapshot.removedTreeIds.length > 0) wire.tR = snapshot.removedTreeIds;
  if (snapshot.fishingNodes.length > 0) wire.fn = snapshot.fishingNodes.map(compactFishingNodeView);
  if (snapshot.fishingNodesFull) wire.fnF = 1;
  if (snapshot.removedFishingNodeIds.length > 0) wire.fnR = snapshot.removedFishingNodeIds;
  if (snapshot.miningNodes.length > 0) wire.mn = snapshot.miningNodes.map(compactMiningNodeView);
  if (snapshot.miningNodesFull) wire.mnF = 1;
  if (snapshot.removedMiningNodeIds.length > 0) wire.mnR = snapshot.removedMiningNodeIds;
  if (snapshot.herbNodes.length > 0) wire.hn = snapshot.herbNodes.map(compactHerbNodeView);
  if (snapshot.herbNodesFull) wire.hnF = 1;
  if (snapshot.removedHerbNodeIds.length > 0) wire.hnR = snapshot.removedHerbNodeIds;
  if (snapshot.fires.length > 0) wire.f = snapshot.fires.map(compactFireView);
  if (snapshot.firesFull) wire.fF = 1;
  if (snapshot.removedFireIds.length > 0) wire.fR = snapshot.removedFireIds;
  if (snapshot.events.length > 0) wire.e = snapshot.events.map(compactGameEvent);
  if (snapshot.metrics) wire.x = compactStateMetrics(snapshot.metrics);
  return wire;
}

export function normalizeServerMessage(message: WireServerMessage): ServerMessage {
  if (!isCompactStateSnapshot(message)) return message as ServerMessage;
  const compact = message as CompactStateSnapshot;
  return {
    type: "state",
    players: (compact.p ?? []).map(expandPlayerView),
    playersFull: Boolean(compact.pF),
    removedPlayerIds: compact.pR ?? [],
    monsters: (compact.m ?? []).map(expandMonsterView),
    monstersFull: Boolean(compact.mF),
    removedMonsterIds: compact.mR ?? [],
    corpses: (compact.c ?? []).map(expandCorpseView),
    corpsesFull: Boolean(compact.cF),
    removedCorpseIds: compact.cR ?? [],
    npcs: (compact.n ?? []).map(expandNpcView),
    npcsFull: Boolean(compact.nF),
    removedNpcIds: compact.nR ?? [],
    trees: (compact.t ?? []).map(expandTreeView),
    treesFull: Boolean(compact.tF),
    removedTreeIds: compact.tR ?? [],
    fishingNodes: (compact.fn ?? []).map(expandFishingNodeView),
    fishingNodesFull: Boolean(compact.fnF),
    removedFishingNodeIds: compact.fnR ?? [],
    miningNodes: (compact.mn ?? []).map(expandMiningNodeView),
    miningNodesFull: Boolean(compact.mnF),
    removedMiningNodeIds: compact.mnR ?? [],
    herbNodes: (compact.hn ?? []).map(expandHerbNodeView),
    herbNodesFull: Boolean(compact.hnF),
    removedHerbNodeIds: compact.hnR ?? [],
    fires: (compact.f ?? []).map(expandFireView),
    firesFull: Boolean(compact.fF),
    removedFireIds: compact.fR ?? [],
    events: (compact.e ?? []).map(expandGameEvent),
    metrics: compact.x ? expandStateMetrics(compact.x) : undefined
  };
}

export function isCompactStateSnapshot(message: unknown): message is CompactStateSnapshot {
  return isRecord(message) && message.type === "state" && !("players" in message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compactPlayerView(player: PlayerView): CompactPlayerView {
  const cached = compactPlayerViewCache.get(player);
  if (cached) return cached;
  const compact: CompactPlayerView = {
    i: player.id,
    n: player.name,
    c: player.classKey,
    f: player.floor,
    x: player.x,
    y: player.y,
    d: player.dir,
    h: player.hp,
    mh: player.maxHp
  };
  if (player.moving) compact.mo = 1;
  if (player.mana !== undefined) compact.ma = player.mana;
  if (player.maxMana !== undefined) compact.mma = player.maxMana;
  if (player.favor !== undefined) compact.fa = player.favor;
  if (player.maxFavor !== undefined) compact.mfa = player.maxFavor;
  if (player.level !== undefined) compact.l = player.level;
  if (player.xp !== undefined) compact.xp = player.xp;
  if (player.gold !== undefined) compact.g = player.gold;
  if (player.weaponTier !== undefined) compact.w = player.weaponTier;
  if (player.armorTier !== undefined) compact.ar = player.armorTier;
  if (player.targetId !== undefined) compact.tg = player.targetId;
  if (player.dead) compact.de = 1;
  if (player.action !== undefined) compact.ac = player.action;
  if (player.buffs !== undefined) compact.b = player.buffs;
  if (player.inventory !== undefined) compact.inv = player.inventory;
  if (player.buyback !== undefined) compact.bb = player.buyback;
  if (player.quests !== undefined) compact.q = player.quests;
  if (player.skills !== undefined) compact.sk = player.skills;
  if (player.abilities !== undefined) compact.ab = player.abilities;
  if (player.unlockedClasses !== undefined) compact.uc = player.unlockedClasses;
  if (player.weight !== undefined) compact.wt = player.weight;
  if (player.maxWeight !== undefined) compact.mw = player.maxWeight;
  compactPlayerViewCache.set(player, compact);
  return compact;
}

function expandPlayerView(player: CompactPlayerView | PlayerView): PlayerView {
  if ("id" in player) return player;
  return {
    id: player.i,
    name: player.n,
    classKey: player.c,
    floor: player.f,
    x: player.x,
    y: player.y,
    dir: player.d,
    moving: Boolean(player.mo),
    hp: player.h,
    maxHp: player.mh,
    mana: player.ma,
    maxMana: player.mma,
    favor: player.fa,
    maxFavor: player.mfa,
    level: player.l,
    xp: player.xp,
    gold: player.g,
    weaponTier: player.w,
    armorTier: player.ar,
    targetId: player.tg,
    dead: Boolean(player.de),
    action: player.ac,
    buffs: player.b,
    inventory: player.inv,
    buyback: player.bb,
    quests: player.q,
    skills: player.sk,
    abilities: player.ab,
    unlockedClasses: player.uc,
    weight: player.wt,
    maxWeight: player.mw
  } as PlayerView;
}

function compactMonsterView(monster: MonsterView): CompactMonsterView {
  const cached = compactMonsterViewCache.get(monster);
  if (cached) return cached;
  const compact: CompactMonsterView = {
    i: monster.id,
    t: monster.type,
    n: monster.name,
    f: monster.floor,
    x: monster.x,
    y: monster.y,
    d: monster.dir,
    h: monster.hp,
    mh: monster.maxHp,
    z: monster.zone
  };
  if (monster.level !== 1) compact.l = monster.level;
  if (monster.role !== "trash") compact.r = compactMonsterRole(monster.role);
  if (monster.moving) compact.mo = 1;
  if (monster.attacking) compact.at = 1;
  if (monster.targetId) compact.tg = monster.targetId;
  if (monster.statuses?.length) compact.st = compactMonsterStatuses(monster.statuses);
  compactMonsterViewCache.set(monster, compact);
  return compact;
}

function expandMonsterView(monster: CompactMonsterView | MonsterView): MonsterView {
  if ("id" in monster) return monster;
  return {
    id: monster.i,
    type: monster.t,
    name: monster.n,
    level: monster.l ?? 1,
    role: expandMonsterRole(monster.r),
    floor: monster.f,
    x: monster.x,
    y: monster.y,
    dir: monster.d,
    moving: Boolean(monster.mo),
    attacking: Boolean(monster.at),
    targetId: monster.tg,
    statuses: expandMonsterStatuses(monster.st),
    hp: monster.h,
    maxHp: monster.mh,
    zone: monster.z
  };
}

function compactMonsterRole(role: MonsterView["role"]): number | undefined {
  const index = MONSTER_ROLE_CODES.indexOf(role as (typeof MONSTER_ROLE_CODES)[number]);
  return index >= 0 ? index + 1 : undefined;
}

function expandMonsterRole(code: number | MonsterView["role"] | undefined): MonsterView["role"] {
  if (typeof code === "string") return code;
  return code ? (MONSTER_ROLE_CODES[code - 1] ?? "trash") : "trash";
}

function compactMonsterStatuses(statuses: NonNullable<MonsterView["statuses"]>): number {
  let mask = 0;
  for (const status of statuses) {
    const index = MONSTER_STATUS_BITS.indexOf(status);
    if (index >= 0) mask |= 1 << index;
  }
  return mask;
}

function expandMonsterStatuses(mask: number | MonsterView["statuses"] | undefined): MonsterView["statuses"] {
  if (Array.isArray(mask)) return mask;
  if (!mask) return [];
  return MONSTER_STATUS_BITS.filter((_, index) => Boolean(mask & (1 << index)));
}

function compactNpcView(npc: NpcView): CompactNpcView {
  const cached = compactNpcViewCache.get(npc);
  if (cached) return cached;
  const compact: CompactNpcView = {
    i: npc.id,
    n: npc.name,
    r: npc.role,
    f: npc.floor,
    x: npc.x,
    y: npc.y,
    d: npc.dir,
    dl: npc.dialogue
  };
  if (npc.moving) compact.mo = 1;
  compactNpcViewCache.set(npc, compact);
  return compact;
}

function expandNpcView(npc: CompactNpcView | NpcView): NpcView {
  if ("id" in npc) return npc;
  return {
    id: npc.i,
    name: npc.n,
    role: npc.r,
    floor: npc.f,
    x: npc.x,
    y: npc.y,
    dir: npc.d,
    moving: Boolean(npc.mo),
    dialogue: npc.dl
  };
}

function compactTreeView(tree: TreeView): CompactTreeView {
  const cached = compactTreeViewCache.get(tree);
  if (cached) return cached;
  const compact: CompactTreeView = {
    i: tree.id,
    t: tree.type,
    l: tree.label,
    rl: tree.requiredLevel,
    f: tree.floor,
    x: tree.x,
    y: tree.y
  };
  if (tree.active) compact.a = 1;
  compactTreeViewCache.set(tree, compact);
  return compact;
}

function expandTreeView(tree: CompactTreeView | TreeView): TreeView {
  if ("id" in tree) return tree;
  return {
    id: tree.i,
    type: tree.t,
    label: tree.l,
    requiredLevel: tree.rl,
    floor: tree.f,
    x: tree.x,
    y: tree.y,
    active: Boolean(tree.a)
  };
}

function compactFishingNodeView(node: FishingNodeView): CompactFishingNodeView {
  const cached = compactFishingNodeViewCache.get(node);
  if (cached) return cached;
  const compact = { i: node.id, f: node.floor, x: node.x, y: node.y, ax: node.approachX, ay: node.approachY, l: node.label };
  compactFishingNodeViewCache.set(node, compact);
  return compact;
}

function expandFishingNodeView(node: CompactFishingNodeView | FishingNodeView): FishingNodeView {
  if ("id" in node) return node;
  return { id: node.i, floor: node.f, x: node.x, y: node.y, approachX: node.ax, approachY: node.ay, label: node.l };
}

function compactMiningNodeView(node: MiningNodeView): CompactMiningNodeView {
  const cached = compactMiningNodeViewCache.get(node);
  if (cached) return cached;
  const compact = { ...compactFishingNodeView(node), k: node.kind };
  compactMiningNodeViewCache.set(node, compact);
  return compact;
}

function expandMiningNodeView(node: CompactMiningNodeView | MiningNodeView): MiningNodeView {
  if ("id" in node) return node;
  return { ...expandFishingNodeView(node), kind: node.k };
}

function compactHerbNodeView(node: HerbNodeView): CompactHerbNodeView {
  const cached = compactHerbNodeViewCache.get(node);
  if (cached) return cached;
  const compact: CompactHerbNodeView = { ...compactFishingNodeView(node), rl: node.requiredLevel };
  if (node.active) compact.a = 1;
  compactHerbNodeViewCache.set(node, compact);
  return compact;
}

function expandHerbNodeView(node: CompactHerbNodeView | HerbNodeView): HerbNodeView {
  if ("id" in node) return node;
  return { ...expandFishingNodeView(node), active: Boolean(node.a), requiredLevel: node.rl };
}

function compactFireView(fire: FireView): CompactFireView {
  return { i: fire.id, f: fire.floor, x: fire.x, y: fire.y, r: fire.remainingMs };
}

function expandFireView(fire: CompactFireView | FireView): FireView {
  if ("id" in fire) return fire;
  return { id: fire.i, floor: fire.f, x: fire.x, y: fire.y, remainingMs: fire.r };
}

function compactCorpseView(corpse: CorpseView): CompactCorpseView {
  const cached = compactCorpseViewCache.get(corpse);
  if (cached) return cached;
  const compact = {
    i: corpse.id,
    f: corpse.floor,
    x: corpse.x,
    y: corpse.y,
    g: corpse.gold,
    l: corpse.label,
    k: corpse.kind,
    it: corpse.items
  };
  compactCorpseViewCache.set(corpse, compact);
  return compact;
}

function expandCorpseView(corpse: CompactCorpseView | CorpseView): CorpseView {
  if ("id" in corpse) return corpse;
  return {
    id: corpse.i,
    floor: corpse.f,
    x: corpse.x,
    y: corpse.y,
    gold: corpse.g,
    label: corpse.l,
    kind: corpse.k,
    items: corpse.it
  };
}

function compactGameEvent(event: GameEvent): CompactGameEvent {
  const cached = compactGameEventCache.get(event);
  if (cached) return cached;
  const compact: CompactGameEvent = {
    k: event.type,
    v: event.text,
    tm: event.t
  };
  if (event.x !== null) compact.x = event.x;
  if (event.y !== null) compact.y = event.y;
  if (event.floor !== null) compact.f = event.floor;
  if (event.color !== null) compact.c = event.color;
  if (event.from !== null) compact.fr = event.from;
  if (event.target !== null) compact.tg = event.target;
  if (event.fromX !== undefined) compact.fx = event.fromX;
  if (event.fromY !== undefined) compact.fy = event.fromY;
  if (event.angle !== undefined) compact.an = event.angle;
  if (event.scale !== undefined) compact.s = event.scale;
  if (event.durationMs !== undefined) compact.du = event.durationMs;
  if (event.deedType !== undefined) compact.dt = event.deedType;
  if (event.to !== undefined) compact.to = event.to;
  if (event.lines !== undefined) compact.ln = event.lines;
  if (event.opensShop) compact.os = 1;
  if (event.opensAlchemist) compact.oa = 1;
  if (event.opensSmith) compact.sm = 1;
  compactGameEventCache.set(event, compact);
  return compact;
}

function expandGameEvent(event: CompactGameEvent | GameEvent): GameEvent {
  if ("type" in event) return event;
  const expanded: GameEvent = {
    type: event.k,
    text: event.v,
    x: event.x ?? null,
    y: event.y ?? null,
    floor: event.f ?? null,
    color: event.c ?? null,
    from: event.fr ?? null,
    target: event.tg ?? null,
    t: event.tm
  };
  if (event.fx !== undefined) expanded.fromX = event.fx;
  if (event.fy !== undefined) expanded.fromY = event.fy;
  if (event.an !== undefined) expanded.angle = event.an;
  if (event.s !== undefined) expanded.scale = event.s;
  if (event.du !== undefined) expanded.durationMs = event.du;
  if (event.dt !== undefined) expanded.deedType = event.dt;
  if (event.to !== undefined) expanded.to = event.to;
  if (event.ln !== undefined) expanded.lines = event.ln;
  if (event.os) expanded.opensShop = true;
  if (event.oa) expanded.opensAlchemist = true;
  if (event.sm) expanded.opensSmith = true;
  return expanded;
}

function compactStateMetrics(metrics: StateMetrics): CompactStateMetrics {
  return {
    c: metrics.clients,
    mo: metrics.monsters,
    z: metrics.zone,
    vp: metrics.visiblePlayers,
    vm: metrics.visibleMonsters,
    vc: metrics.visibleCorpses,
    vt: metrics.visibleTrees,
    vfn: metrics.visibleFishingNodes,
    vmn: metrics.visibleMiningNodes,
    vf: metrics.visibleFires,
    sc: metrics.spatialCells,
    rs: metrics.residentStaticResources,
    de: metrics.dynamicEntities,
    sce: metrics.snapshotCacheEntries,
    scp: metrics.snapshotCacheEntriesPeak,
    hu: metrics.heapUsedMb,
    rss: metrics.rssMb,
    tm: metrics.tickMs,
    sm: metrics.snapshotMs,
    eld: metrics.eventLoopDelayMs,
    elp: metrics.eventLoopDelayP95Ms,
    elm: metrics.eventLoopDelayMaxMs,
    bo: metrics.bytesOutPerSecond,
    wbo: metrics.wireBytesOutPerSecond,
    ss: metrics.snapshotsSentPerSecond,
    sb: metrics.snapshotsSkippedBackpressurePerSecond,
    st: metrics.socketsTerminatedBackpressurePerSecond,
    ed: metrics.eventsDroppedPerSecond,
    cmd: metrics.clientMessagesDroppedPerSecond,
    cmb: metrics.clientMessageMaxBytes,
    sbb: metrics.socketBackpressureBytes,
    sqd: metrics.saveQueueDepth,
    sfm: metrics.saveFlushMs,
    sfp: metrics.saveFlushPlayers,
    sif: metrics.saveInFlight
  };
}

function expandStateMetrics(metrics: CompactStateMetrics | StateMetrics): StateMetrics {
  if ("clients" in metrics) return metrics;
  return {
    clients: metrics.c,
    monsters: metrics.mo,
    zone: metrics.z,
    visiblePlayers: metrics.vp,
    visibleMonsters: metrics.vm,
    visibleCorpses: metrics.vc,
    visibleTrees: metrics.vt,
    visibleFishingNodes: metrics.vfn,
    visibleMiningNodes: metrics.vmn,
    visibleFires: metrics.vf,
    spatialCells: metrics.sc,
    residentStaticResources: metrics.rs,
    dynamicEntities: metrics.de,
    snapshotCacheEntries: metrics.sce,
    snapshotCacheEntriesPeak: metrics.scp,
    heapUsedMb: metrics.hu,
    rssMb: metrics.rss,
    tickMs: metrics.tm,
    snapshotMs: metrics.sm,
    eventLoopDelayMs: metrics.eld,
    eventLoopDelayP95Ms: metrics.elp,
    eventLoopDelayMaxMs: metrics.elm,
    bytesOutPerSecond: metrics.bo,
    wireBytesOutPerSecond: metrics.wbo,
    snapshotsSentPerSecond: metrics.ss,
    snapshotsSkippedBackpressurePerSecond: metrics.sb,
    socketsTerminatedBackpressurePerSecond: metrics.st ?? 0,
    eventsDroppedPerSecond: metrics.ed,
    clientMessagesDroppedPerSecond: metrics.cmd,
    clientMessageMaxBytes: metrics.cmb,
    socketBackpressureBytes: metrics.sbb,
    saveQueueDepth: metrics.sqd,
    saveFlushMs: metrics.sfm,
    saveFlushPlayers: metrics.sfp,
    saveInFlight: metrics.sif
  };
}
