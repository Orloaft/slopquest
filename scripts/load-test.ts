import { WebSocket, type RawData } from "ws";
import type { MonsterView, PlayerView, StateMetrics } from "../src/types.ts";

interface ParsedArgs {
  [key: string]: string | true;
}

interface CombatTarget {
  floor: number;
  x: number;
  y: number;
}

interface CombatAssignment extends CombatTarget {
  zone: string;
}

interface LoadMessage {
  type?: string;
  id?: string;
  metrics?: Partial<StateMetrics>;
  players?: PlayerView[];
  monsters?: MonsterView[];
  treesFull?: boolean;
  fishingNodesFull?: boolean;
  miningNodesFull?: boolean;
  herbNodesFull?: boolean;
}

interface Summary {
  samples: number;
  min: number;
  max: number;
  avg: number;
}

type SummaryMetric =
  | "tickMs"
  | "snapshotMs"
  | "bytesOutPerSecond"
  | "wireBytesOutPerSecond"
  | "snapshotsSentPerSecond"
  | "snapshotsSkippedBackpressurePerSecond"
  | "eventsDroppedPerSecond"
  | "saveFlushMs";
type GaugeMetric =
  | "heapUsedMb"
  | "rssMb"
  | "residentStaticResources"
  | "dynamicEntities"
  | "spatialCells"
  | "saveQueueDepth"
  | "saveFlushPlayers"
  | "saveInFlight";
type ClientMetric = "visiblePlayers" | "visibleMonsters" | "visibleTrees" | "visibleFires";
type SummaryField = "min" | "max" | "avg";

const options = parseArgs(process.argv.slice(2));
const url = stringOption(options.url) ?? `ws://127.0.0.1:${stringOption(options.port) ?? process.env.PORT ?? 8787}`;
const clients = Number(options.clients ?? 12);
const durationMs = Number(options.duration ?? 10000);
const slowClients = Math.max(0, Math.floor(Number(options["slow-clients"] ?? 0)));
const slowAfterMs = Math.max(0, Math.floor(Number(options["slow-after"] ?? 1500)));
const combatRatio = clampUnit(Number(options.combat ?? 0));
const attackTargets = Boolean(options["attack-targets"]);
const targetIntervalMs = Math.max(100, Math.floor(Number(options["target-interval"] ?? 500)));
const persistent = Boolean(options.persistent);
const combatZones = String(options.zones ?? "cemetery,crypt,woods")
  .split(",")
  .map((z) => z.trim())
  .filter(Boolean);
const COMBAT_ZONE_TARGETS: Record<string, CombatTarget> = {
  cemetery: { floor: 1, x: 18.5, y: 12.5 },
  crypt: { floor: 2, x: 22.5, y: 23.5 },
  cryptBoss: { floor: 2, x: 75.5, y: 29.5 },
  woods: { floor: 3, x: 16.5, y: 20.5 },
  woodsNorth: { floor: 3, x: 56.5, y: 12.5 }
};
const combatCount = Math.floor(clients * combatRatio);
const combatAssignments = new Map<number, CombatAssignment>();
for (let i = 0; i < combatCount; i += 1) {
  const zone = combatZones[i % combatZones.length];
  if (!zone) continue;
  const target = COMBAT_ZONE_TARGETS[zone];
  if (target) combatAssignments.set(i, { zone, ...target });
}
const sockets = new Set<WebSocket>();
const stats = {
  opened: 0,
  welcomed: 0,
  states: 0,
  errors: 0,
  closed: 0
};
const observed = {
  tickMs: [] as number[],
  snapshotMs: [] as number[],
  stateMessageBytes: [] as number[],
  bytesOutPerSecond: [] as number[],
  wireBytesOutPerSecond: [] as number[],
  snapshotsSentPerSecond: [] as number[],
  snapshotsSkippedBackpressurePerSecond: [] as number[],
  eventsDroppedPerSecond: [] as number[],
  visiblePlayers: [] as number[],
  visibleMonsters: [] as number[],
  visibleTrees: [] as number[],
  visibleFires: [] as number[],
  heapUsedMb: [] as number[],
  rssMb: [] as number[],
  residentStaticResources: [] as number[],
  dynamicEntities: [] as number[],
  spatialCellsSamples: [] as number[],
  saveQueueDepth: [] as number[],
  saveFlushMs: [] as number[],
  saveFlushPlayers: [] as number[],
  saveInFlight: [] as number[],
  serverClientsPeak: 0,
  serverMonsters: 0,
  spatialCells: 0,
  socketBackpressureBytes: 0,
  staticFullSnapshots: 0,
  slowClientsPaused: 0
};
const clientState = new WeakMap<WebSocket, { selfId: string | null; targetId: string | null; lastTargetAt: number }>();

for (let i = 0; i < clients; i += 1) {
  setTimeout(() => openClient(i), i * 25);
}

const inputTimer = setInterval(() => {
  for (const socket of sockets) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    socket.send(JSON.stringify({ type: "input", input: randomInput() }));
  }
}, 90);

setTimeout(() => {
  clearInterval(inputTimer);
  for (const socket of sockets) socket.close();
  setTimeout(reportAndExit, 250);
}, durationMs);

function openClient(index: number): void {
  const socket = new WebSocket(url);
  sockets.add(socket);
  clientState.set(socket, { selfId: null, targetId: null, lastTargetAt: 0 });

  socket.on("open", () => {
    stats.opened += 1;
    socket.send(
      JSON.stringify({
        type: "join",
        name: `load_${index}`,
        class: index % 3 === 0 ? "caster" : "knight",
        fresh: true,
        transient: !persistent
      })
    );
  });

  socket.on("message", (raw: RawData) => {
    let message: LoadMessage;
    try {
      message = JSON.parse(raw.toString()) as LoadMessage;
    } catch {
      return;
    }
    if (message.type === "welcome") {
      stats.welcomed += 1;
      const state = clientState.get(socket);
      if (state && typeof message.id === "string") state.selfId = message.id;
      const target = combatAssignments.get(index);
      if (target) {
        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(
            JSON.stringify({
              type: "e2eGrantItems",
              items: [],
              floor: target.floor,
              x: target.x,
              y: target.y
            })
          );
        }, 100);
      }
      if (index < slowClients) {
        setTimeout(() => pauseClientSocket(socket), slowAfterMs);
      }
    }
    if (message.type === "state") {
      stats.states += 1;
      observed.stateMessageBytes.push(rawByteLength(raw));
      if (message.metrics) recordMetrics(message.metrics);
      recordSnapshotFlags(message);
      if (attackTargets) maybeTargetMonster(socket, message);
    }
  });

  socket.on("error", () => {
    stats.errors += 1;
  });

  socket.on("close", () => {
    stats.closed += 1;
    sockets.delete(socket);
  });
}

function maybeTargetMonster(socket: WebSocket, message: LoadMessage): void {
  const state = clientState.get(socket);
  if (!state) return;
  const now = Date.now();
  if (now - state.lastTargetAt < targetIntervalMs) return;
  const monsters = (message.monsters ?? []).filter((monster) => monster.hp > 0);
  if (monsters.length === 0) return;
  const self = state.selfId ? message.players?.find((player) => player.id === state.selfId) : undefined;
  const target = self ? nearestMonster(self, monsters) : monsters[0];
  if (!target || target.id === state.targetId) return;
  state.targetId = target.id;
  state.lastTargetAt = now;
  socket.send(JSON.stringify({ type: "target", id: target.id }));
}

function nearestMonster(player: PlayerView, monsters: MonsterView[]): MonsterView | undefined {
  let best: MonsterView | undefined;
  let bestDist = Infinity;
  for (const monster of monsters) {
    if (monster.floor !== player.floor) continue;
    const dx = monster.x - player.x;
    const dy = monster.y - player.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      best = monster;
      bestDist = dist;
    }
  }
  return best ?? monsters[0];
}

function randomInput(): { up: boolean; down: boolean; left: boolean; right: boolean } {
  const roll = Math.floor(Math.random() * 5);
  return {
    up: roll === 0,
    down: roll === 1,
    left: roll === 2,
    right: roll === 3
  };
}

function pauseClientSocket(socket: WebSocket): void {
  const rawSocket = (socket as unknown as { _socket?: { pause?: () => void } })._socket;
  if (socket.readyState !== WebSocket.OPEN || !rawSocket?.pause) return;
  rawSocket.pause();
  observed.slowClientsPaused += 1;
}

function rawByteLength(raw: RawData): number {
  if (typeof raw === "string") return Buffer.byteLength(raw);
  if (Array.isArray(raw)) return raw.reduce((sum, item) => sum + item.byteLength, 0);
  return raw.byteLength;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function stringOption(value: string | true | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};
  for (let i = 0; i < args.length; i += 1) {
    const item = args[i];
    if (!item || !item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = args[i + 1];
    const value: string | true = next?.startsWith("--") ? true : next ?? true;
    parsed[key] = value;
    if (value !== true) i += 1;
  }
  return parsed;
}

function recordMetrics(m: Partial<StateMetrics>): void {
  if (typeof m.tickMs === "number") observed.tickMs.push(m.tickMs);
  if (typeof m.snapshotMs === "number") observed.snapshotMs.push(m.snapshotMs);
  if (typeof m.bytesOutPerSecond === "number") observed.bytesOutPerSecond.push(m.bytesOutPerSecond);
  if (typeof m.wireBytesOutPerSecond === "number") observed.wireBytesOutPerSecond.push(m.wireBytesOutPerSecond);
  if (typeof m.snapshotsSentPerSecond === "number") observed.snapshotsSentPerSecond.push(m.snapshotsSentPerSecond);
  if (typeof m.snapshotsSkippedBackpressurePerSecond === "number") {
    observed.snapshotsSkippedBackpressurePerSecond.push(m.snapshotsSkippedBackpressurePerSecond);
  }
  if (typeof m.eventsDroppedPerSecond === "number") observed.eventsDroppedPerSecond.push(m.eventsDroppedPerSecond);
  if (typeof m.saveQueueDepth === "number") observed.saveQueueDepth.push(m.saveQueueDepth);
  if (typeof m.saveFlushMs === "number") observed.saveFlushMs.push(m.saveFlushMs);
  if (typeof m.saveFlushPlayers === "number") observed.saveFlushPlayers.push(m.saveFlushPlayers);
  if (typeof m.saveInFlight === "number") observed.saveInFlight.push(m.saveInFlight);
  if (typeof m.visiblePlayers === "number") observed.visiblePlayers.push(m.visiblePlayers);
  if (typeof m.visibleMonsters === "number") observed.visibleMonsters.push(m.visibleMonsters);
  if (typeof m.visibleTrees === "number") observed.visibleTrees.push(m.visibleTrees);
  if (typeof m.visibleFires === "number") observed.visibleFires.push(m.visibleFires);
  if (typeof m.heapUsedMb === "number") observed.heapUsedMb.push(m.heapUsedMb);
  if (typeof m.rssMb === "number") observed.rssMb.push(m.rssMb);
  if (typeof m.residentStaticResources === "number") observed.residentStaticResources.push(m.residentStaticResources);
  if (typeof m.dynamicEntities === "number") observed.dynamicEntities.push(m.dynamicEntities);
  if (typeof m.spatialCells === "number") observed.spatialCellsSamples.push(m.spatialCells);
  if (typeof m.clients === "number" && m.clients > observed.serverClientsPeak) observed.serverClientsPeak = m.clients;
  if (typeof m.monsters === "number") observed.serverMonsters = m.monsters;
  if (typeof m.spatialCells === "number") observed.spatialCells = m.spatialCells;
  if (typeof m.socketBackpressureBytes === "number") observed.socketBackpressureBytes = m.socketBackpressureBytes;
}

function recordSnapshotFlags(message: LoadMessage): void {
  if (message.treesFull) observed.staticFullSnapshots += 1;
  if (message.fishingNodesFull) observed.staticFullSnapshots += 1;
  if (message.miningNodesFull) observed.staticFullSnapshots += 1;
  if (message.herbNodesFull) observed.staticFullSnapshots += 1;
}

function summarize(values: number[]): Summary | null {
  const first = values[0];
  if (first === undefined) return null;
  let min = first;
  let max = first;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const avg = sum / values.length;
  return {
    samples: values.length,
    min,
    max,
    avg: Math.round(avg * 100) / 100
  };
}

function reportAndExit(): void {
  const combatZoneCounts: Record<string, number> = {};
  for (const target of combatAssignments.values()) {
    combatZoneCounts[target.zone] = (combatZoneCounts[target.zone] ?? 0) + 1;
  }
  const report = buildReportShape(combatZoneCounts);
  const thresholdFailures = thresholdFailuresFor(report);
  console.log(JSON.stringify(report, null, 2));
  if (thresholdFailures.length > 0) {
    console.error("Load-test thresholds failed:");
    for (const failure of thresholdFailures) console.error(`  - ${failure}`);
  }
  process.exit(stats.errors || thresholdFailures.length > 0 ? 1 : 0);
}

function thresholdFailuresFor(report: ReturnType<typeof buildReportShape>): string[] {
  const failures: string[] = [];
  const checks: Array<[string, number, number | null]> = [
    ["opened", report.opened, optionNumber("min-opened")],
    ["welcomed", report.welcomed, optionNumber("min-welcomed")],
    ["states", report.states, optionNumber("min-states")],
    ["closed", report.closed, optionNumber("min-closed")],
    ["slowClients.paused", report.slowClients.paused, optionNumber("min-slow-paused")]
  ];
  for (const [label, actual, minimum] of checks) {
    if (minimum != null && actual < minimum) failures.push(`${label} ${actual} < ${minimum}`);
  }

  const maximums: Array<[string, number, number | null]> = [
    ["errors", report.errors, optionNumber("max-errors")],
    ["slowClients.paused", report.slowClients.paused, optionNumber("max-slow-paused")],
    ["snapshotFlags.staticFull", report.snapshotFlags.staticFull, optionNumber("max-static-full-snapshots")]
  ];
  for (const [label, actual, maximum] of maximums) {
    if (maximum != null && actual > maximum) failures.push(`${label} ${actual} > ${maximum}`);
  }

  const metricNames: SummaryMetric[] = [
    "tickMs",
    "snapshotMs",
    "bytesOutPerSecond",
    "wireBytesOutPerSecond",
    "snapshotsSentPerSecond",
    "snapshotsSkippedBackpressurePerSecond",
    "eventsDroppedPerSecond",
    "saveFlushMs"
  ];
  const gaugeNames: GaugeMetric[] = [
    "heapUsedMb",
    "rssMb",
    "residentStaticResources",
    "dynamicEntities",
    "spatialCells",
    "saveQueueDepth",
    "saveFlushPlayers",
    "saveInFlight"
  ];
  const fields: SummaryField[] = ["min", "max", "avg"];
  for (const metric of metricNames) {
    const summary = report.perTick[metric];
    if (!summary) continue;
    for (const field of fields) {
      const maximum = optionNumber(`max-${kebab(metric)}-${field}`);
      if (maximum != null && summary[field] > maximum) failures.push(`${metric}.${field} ${summary[field]} > ${maximum}`);
      const minimum = optionNumber(`min-${kebab(metric)}-${field}`);
      if (minimum != null && summary[field] < minimum) failures.push(`${metric}.${field} ${summary[field]} < ${minimum}`);
    }
  }
  for (const metric of gaugeNames) {
    const summary = report.perTick[metric];
    if (!summary) continue;
    for (const field of fields) {
      const maximum = optionNumber(`max-${kebab(metric)}-${field}`);
      if (maximum != null && summary[field] > maximum) failures.push(`${metric}.${field} ${summary[field]} > ${maximum}`);
      const minimum = optionNumber(`min-${kebab(metric)}-${field}`);
      if (minimum != null && summary[field] < minimum) failures.push(`${metric}.${field} ${summary[field]} < ${minimum}`);
    }
  }
  const clientMetricNames: ClientMetric[] = ["visiblePlayers", "visibleMonsters", "visibleTrees", "visibleFires"];
  for (const metric of clientMetricNames) {
    const summary = report.perClient[metric];
    if (!summary) continue;
    for (const field of fields) {
      const maximum = optionNumber(`max-${kebab(metric)}-${field}`);
      if (maximum != null && summary[field] > maximum) failures.push(`${metric}.${field} ${summary[field]} > ${maximum}`);
      const minimum = optionNumber(`min-${kebab(metric)}-${field}`);
      if (minimum != null && summary[field] < minimum) failures.push(`${metric}.${field} ${summary[field]} < ${minimum}`);
    }
  }
  const stateMessageBytes = report.perMessage.stateBytes;
  if (stateMessageBytes) {
    for (const field of fields) {
      const maximum = optionNumber(`max-state-message-bytes-${field}`);
      if (maximum != null && stateMessageBytes[field] > maximum) {
        failures.push(`stateMessageBytes.${field} ${stateMessageBytes[field]} > ${maximum}`);
      }
      const minimum = optionNumber(`min-state-message-bytes-${field}`);
      if (minimum != null && stateMessageBytes[field] < minimum) {
        failures.push(`stateMessageBytes.${field} ${stateMessageBytes[field]} < ${minimum}`);
      }
    }
  }
  return failures;
}

function buildReportShape(combatZoneCounts: Record<string, number>) {
  return {
    url,
    clients,
    durationMs,
    slowClients: {
      requested: slowClients,
      paused: observed.slowClientsPaused,
      slowAfterMs
    },
    combat: {
      ratio: combatRatio,
      assigned: combatAssignments.size,
      zones: combatZoneCounts,
      attackTargets
    },
    transientClients: !persistent,
    ...stats,
    server: {
      clientsPeak: observed.serverClientsPeak,
      monsters: observed.serverMonsters,
      spatialCells: observed.spatialCells,
      socketBackpressureBytes: observed.socketBackpressureBytes
    },
    snapshotFlags: {
      staticFull: observed.staticFullSnapshots
    },
    perTick: {
      tickMs: summarize(observed.tickMs),
      snapshotMs: summarize(observed.snapshotMs),
      bytesOutPerSecond: summarize(observed.bytesOutPerSecond),
      wireBytesOutPerSecond: summarize(observed.wireBytesOutPerSecond),
      snapshotsSentPerSecond: summarize(observed.snapshotsSentPerSecond),
      snapshotsSkippedBackpressurePerSecond: summarize(observed.snapshotsSkippedBackpressurePerSecond),
      eventsDroppedPerSecond: summarize(observed.eventsDroppedPerSecond),
      saveFlushMs: summarize(observed.saveFlushMs),
      heapUsedMb: summarize(observed.heapUsedMb),
      rssMb: summarize(observed.rssMb),
      residentStaticResources: summarize(observed.residentStaticResources),
      dynamicEntities: summarize(observed.dynamicEntities),
      spatialCells: summarize(observed.spatialCellsSamples),
      saveQueueDepth: summarize(observed.saveQueueDepth),
      saveFlushPlayers: summarize(observed.saveFlushPlayers),
      saveInFlight: summarize(observed.saveInFlight)
    },
    perMessage: {
      stateBytes: summarize(observed.stateMessageBytes)
    },
    perClient: {
      visiblePlayers: summarize(observed.visiblePlayers),
      visibleMonsters: summarize(observed.visibleMonsters),
      visibleTrees: summarize(observed.visibleTrees),
      visibleFires: summarize(observed.visibleFires)
    }
  };
}

function optionNumber(name: string): number | null {
  const raw = options[name];
  if (raw == null || raw === true) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
