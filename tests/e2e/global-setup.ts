import net from "node:net";

// Playwright's webServer readiness check only waits on the vite dev server
// (:5173). The authoritative game server (ws://…:8787) is launched by the same
// `dev:e2e` concurrently call but finishes booting a beat later. Without this
// gate, tests can start before 8787 is accepting connections — the client
// socket never connects, `self()` returns a local default, and every e2e warp
// (e2eGrantItems) silently no-ops. Block until 8787 accepts a TCP connection.
const GAME_PORT = 8787;
const HOST = "127.0.0.1";

function tryConnect(port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ port, host });
    socket.once("connect", () => {
      socket.end();
      resolve();
    });
    socket.once("error", reject);
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(new Error("connect timeout"));
    });
  });
}

export default async function globalSetup(): Promise<void> {
  const timeoutMs = 45000;
  const start = performance.now();
  for (;;) {
    try {
      await tryConnect(GAME_PORT, HOST);
      return;
    } catch {
      if (performance.now() - start > timeoutMs) {
        throw new Error(`game server ${HOST}:${GAME_PORT} did not accept connections within ${timeoutMs}ms`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}
