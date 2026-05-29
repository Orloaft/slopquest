import { WebSocket, type RawData } from "ws";
import type { StateMetrics } from "../src/types.ts";

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
  metrics?: Partial<StateMetrics>;
}

interface Summary {
  samples: number;
  min: number;
  max: number;
  avg: number;
}

const options = parseArgs(process.argv.slice(2));
const url = stringOption(options.url) ?? `ws://127.0.0.1:${stringOption(options.port) ?? process.env.PORT ?? 8787}`;
const clients = Number(options.clients ?? 12);
const durationMs = Number(options.duration ?? 10000);
const combatRatio = clampUnit(Number(options.combat ?? 0));
const combatZones = String(options.zones ?? "cemetery,crypt,woods")
  .split(",")
  .map((z) => z.trim())
  .filter(Boolean);
const COMBAT_ZONE_TARGETS: Record<string, CombatTarget> = {
  cemetery: { floor: 1, x: 18.5, y: 12.5 },
  crypt: { floor: 2, x: 22.5, y: 23.5 },
  woods: { floor: 3, x: 16.5, y: 20.5 }
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
  bytesOutPerSecond: [] as number[],
  visiblePlayers: [] as number[],
  visibleMonsters: [] as number[],
  visibleTrees: [] as number[],
  visibleFires: [] as number[],
  serverClientsPeak: 0,
  serverMonsters: 0,
  spatialCells: 0
};

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

  socket.on("open", () => {
    stats.opened += 1;
    socket.send(JSON.stringify({ type: "join", name: `load_${index}`, class: index % 3 === 0 ? "caster" : "knight" }));
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
    }
    if (message.type === "state") {
      stats.states += 1;
      if (message.metrics) recordMetrics(message.metrics);
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

function randomInput(): { up: boolean; down: boolean; left: boolean; right: boolean } {
  const roll = Math.floor(Math.random() * 5);
  return {
    up: roll === 0,
    down: roll === 1,
    left: roll === 2,
    right: roll === 3
  };
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
  if (typeof m.visiblePlayers === "number") observed.visiblePlayers.push(m.visiblePlayers);
  if (typeof m.visibleMonsters === "number") observed.visibleMonsters.push(m.visibleMonsters);
  if (typeof m.visibleTrees === "number") observed.visibleTrees.push(m.visibleTrees);
  if (typeof m.visibleFires === "number") observed.visibleFires.push(m.visibleFires);
  if (typeof m.clients === "number" && m.clients > observed.serverClientsPeak) observed.serverClientsPeak = m.clients;
  if (typeof m.monsters === "number") observed.serverMonsters = m.monsters;
  if (typeof m.spatialCells === "number") observed.spatialCells = m.spatialCells;
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
  const report = {
    url,
    clients,
    durationMs,
    combat: {
      ratio: combatRatio,
      assigned: combatAssignments.size,
      zones: combatZoneCounts
    },
    ...stats,
    server: {
      clientsPeak: observed.serverClientsPeak,
      monsters: observed.serverMonsters,
      spatialCells: observed.spatialCells
    },
    perTick: {
      tickMs: summarize(observed.tickMs),
      snapshotMs: summarize(observed.snapshotMs),
      bytesOutPerSecond: summarize(observed.bytesOutPerSecond)
    },
    perClient: {
      visiblePlayers: summarize(observed.visiblePlayers),
      visibleMonsters: summarize(observed.visibleMonsters),
      visibleTrees: summarize(observed.visibleTrees),
      visibleFires: summarize(observed.visibleFires)
    }
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(stats.errors ? 1 : 0);
}
