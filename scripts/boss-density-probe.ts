import { WebSocket, type RawData } from "ws";
import { isCompactStateSnapshot, normalizeServerMessage, type WireServerMessage } from "../src/wire.ts";

// Boss-density probe: spawn one boss + N telegraphing adds at a single point,
// funnel `clients` bots onto it, optionally flood cosmetic events per tick to
// stress the event-channel cell cap, and tally events received by type. The
// server's [tgmetric] stdout line gives authoritative telegraph emitted/dropped.
//
// Pair with TIB_EVENT_PRIORITY={0,1} on the server for an A/B on whether
// telegraphs survive truncation when cosmetics saturate the channel.

interface Args {
  [k: string]: string | true;
}
function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    const val: string | true = next && !next.startsWith("--") ? next : true;
    out[key] = val;
    if (val !== true) i += 1;
  }
  return out;
}
const opts = parseArgs(process.argv.slice(2));
const num = (k: string, d: number): number => {
  const v = opts[k];
  return typeof v === "string" && Number.isFinite(Number(v)) ? Number(v) : d;
};

const port = num("port", 8793);
const url = `ws://127.0.0.1:${port}`;
const clients = num("clients", 50);
const durationMs = num("duration", 15000);
const cosmeticPerTick = num("cosmetic", 0); // extra cosmetic events each bot emits per input tick
const turrets = num("turrets", 12); // ranged telegraphing adds
// woods (floor 3) — a non-safe combat zone (floors 0/4 are safe; monsters won't
// retaliate there). Bots teleport here on welcome so they co-locate with the spawn.
const FLOOR = num("floor", 3);
const X = num("x", 16.5);
const Y = num("y", 20.5);

const eventsByType = new Map<string, number>();
const telegraphsPerBot: number[] = [];
const serverMetric = {
  eventsDroppedMax: 0,
  snapshotMsMax: 0,
  tickMsMax: 0,
  stateEventsMax: 0,
  bytesOutMaxPerSec: 0
};
const sockets = new Set<WebSocket>();
const botTelegraphs = new WeakMap<WebSocket, number>();
let selfIds = 0;
let states = 0;
let errors = 0;
let maxVisibleMonsters = 0;
let sampleSelfPos = "";
const selfIdBySocket = new WeakMap<WebSocket, string>();

function tally(type: string): void {
  eventsByType.set(type, (eventsByType.get(type) ?? 0) + 1);
}

for (let i = 0; i < clients; i += 1) setTimeout(() => open(i), i * 20);

function open(index: number): void {
  const socket = new WebSocket(url);
  sockets.add(socket);
  botTelegraphs.set(socket, 0);
  socket.on("open", () => {
    socket.send(JSON.stringify({ type: "join", name: `probe_${index}`, class: index % 3 === 0 ? "caster" : "knight", fresh: true, transient: true }));
  });
  socket.on("message", (raw: RawData) => {
    let msg: any;
    try {
      const parsed = JSON.parse(raw.toString()) as WireServerMessage;
      if (isCompactStateSnapshot(parsed)) {
        /* compact */
      }
      msg = normalizeServerMessage(parsed);
    } catch {
      return;
    }
    if (msg.type === "welcome") {
      selfIds += 1;
      if (typeof msg.id === "string") selfIdBySocket.set(socket, msg.id);
      // Bot 0 spawns the boss + telegraphing adds once.
      if (index === 0) {
        setTimeout(() => {
          send(socket, { type: "e2eSpawnMonster", monster: "verdant_faultwarden", floor: FLOOR, x: X, y: Y });
          for (let t = 0; t < turrets; t += 1) {
            const ang = t * 2.39996;
            send(socket, {
              type: "e2eSpawnMonster",
              monster: "totem_wraith",
              floor: FLOOR,
              x: X + Math.cos(ang) * 2,
              y: Y + Math.sin(ang) * 2
            });
          }
        }, 150);
      }
      // Everyone teleports onto the point.
      setTimeout(() => send(socket, { type: "e2eGrantItems", items: [], floor: FLOOR, x: X, y: Y }), 300);
    }
    if (msg.type === "state") {
      states += 1;
      const evs = (msg.events ?? []) as Array<{ type: string }>;
      for (const e of evs) {
        tally(e.type);
        if (e.type === "telegraph") botTelegraphs.set(socket, (botTelegraphs.get(socket) ?? 0) + 1);
      }
      const m = msg.metrics;
      if (m) {
        if (typeof m.eventsDroppedPerSecond === "number") serverMetric.eventsDroppedMax = Math.max(serverMetric.eventsDroppedMax, m.eventsDroppedPerSecond);
        if (typeof m.snapshotMs === "number") serverMetric.snapshotMsMax = Math.max(serverMetric.snapshotMsMax, m.snapshotMs);
        if (typeof m.tickMs === "number") serverMetric.tickMsMax = Math.max(serverMetric.tickMsMax, m.tickMs);
        if (typeof m.bytesOutPerSecond === "number") serverMetric.bytesOutMaxPerSec = Math.max(serverMetric.bytesOutMaxPerSec, m.bytesOutPerSecond);
      }
      serverMetric.stateEventsMax = Math.max(serverMetric.stateEventsMax, evs.length);
      // Re-target nearest monster + emit cosmetic flood.
      const mons = (msg.monsters ?? []).filter((mm: any) => mm.hp > 0);
      if (mons.length > maxVisibleMonsters) maxVisibleMonsters = mons.length;
      if (index === 0 && !sampleSelfPos) {
        const me = (msg.players ?? []).find((p: any) => p.id === selfIdBySocket.get(socket));
        if (me) sampleSelfPos = `floor=${me.floor} x=${me.x?.toFixed?.(1)} y=${me.y?.toFixed?.(1)}`;
      }
      if (mons.length) send(socket, { type: "target", id: mons[0].id });
      if (cosmeticPerTick > 0) send(socket, { type: "e2eEmitEvents", count: cosmeticPerTick, spread: 0, floor: FLOOR, x: X, y: Y });
    }
  });
  socket.on("error", () => {
    errors += 1;
  });
}

function send(socket: WebSocket, obj: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
}

setTimeout(() => {
  for (const s of sockets) {
    telegraphsPerBot.push(botTelegraphs.get(s) ?? 0);
    s.close();
  }
  const sorted = [...telegraphsPerBot].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  console.log(
    JSON.stringify(
      {
        config: { clients, durationMs, cosmeticPerTick, turrets, point: { floor: FLOOR, x: X, y: Y } },
        connected: selfIds,
        states,
        errors,
        maxVisibleMonsters,
        sampleSelfPos,
        eventsByType: Object.fromEntries([...eventsByType.entries()].sort((a, b) => b[1] - a[1])),
        telegraphsReceivedPerBot: {
          min: sorted[0] ?? 0,
          max: sorted[sorted.length - 1] ?? 0,
          avg: sorted.length ? Math.round((sum / sorted.length) * 10) / 10 : 0
        },
        serverMetric
      },
      null,
      2
    )
  );
  setTimeout(() => process.exit(errors ? 1 : 0), 250);
}, durationMs);
