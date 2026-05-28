import { WebSocket } from "ws";

const options = parseArgs(process.argv.slice(2));
const url = options.url ?? `ws://127.0.0.1:${options.port ?? process.env.PORT ?? 8787}`;
const clients = Number(options.clients ?? 12);
const durationMs = Number(options.duration ?? 10000);
const sockets = new Set();
const stats = {
  opened: 0,
  welcomed: 0,
  states: 0,
  errors: 0,
  closed: 0
};
const observed = {
  tickMs: [],
  snapshotMs: [],
  bytesOutPerSecond: [],
  visiblePlayers: [],
  visibleMonsters: [],
  visibleTrees: [],
  visibleFires: [],
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

function openClient(index) {
  const socket = new WebSocket(url);
  sockets.add(socket);

  socket.on("open", () => {
    stats.opened += 1;
    socket.send(JSON.stringify({ type: "join", name: `load_${index}`, class: index % 3 === 0 ? "caster" : "knight" }));
  });

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.type === "welcome") stats.welcomed += 1;
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

function randomInput() {
  const roll = Math.floor(Math.random() * 5);
  return {
    up: roll === 0,
    down: roll === 1,
    left: roll === 2,
    right: roll === 3
  };
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i += 1) {
    const item = args[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = args[i + 1]?.startsWith("--") ? true : args[i + 1] ?? true;
    parsed[key] = value;
    if (value !== true) i += 1;
  }
  return parsed;
}

function recordMetrics(m) {
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

function summarize(values) {
  if (values.length === 0) return null;
  let min = values[0];
  let max = values[0];
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

function reportAndExit() {
  const report = {
    url,
    clients,
    durationMs,
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
