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
    if (message.type === "state") stats.states += 1;
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

function reportAndExit() {
  console.log(JSON.stringify({ url, clients, durationMs, ...stats }, null, 2));
  process.exit(stats.errors ? 1 : 0);
}
