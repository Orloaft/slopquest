import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

interface Scenario {
  name: string;
  args: string[];
  serverEnv?: Record<string, string>;
}

const PORT = Number(process.env.TIB_PERF_PORT ?? 8790);
const HOST = "127.0.0.1";
const SERVER_READY_MS = 10000;
const mode = process.argv.includes("--soak") ? "soak" : "gate";
const gateScenarios: Scenario[] = [
  {
    name: "50 clustered town clients",
    args: [
      "--clients",
      "50",
      "--duration",
      "15000",
      "--combat",
      "0",
      "--max-errors",
      "0",
      "--min-opened",
      "50",
      "--min-welcomed",
      "50",
      "--min-closed",
      "50",
      "--max-tick-ms-max",
      "8",
      "--max-snapshot-ms-max",
      "18",
      "--max-bytes-out-per-second-avg",
      "14000000",
      "--max-snapshots-skipped-backpressure-per-second-max",
      "0"
    ]
  },
  {
    name: "50 mixed town/combat clients",
    args: [
      "--clients",
      "50",
      "--duration",
      "15000",
      "--combat",
      "0.4",
      "--max-errors",
      "0",
      "--min-opened",
      "50",
      "--min-welcomed",
      "50",
      "--min-closed",
      "50",
      "--max-tick-ms-max",
      "8",
      "--max-snapshot-ms-max",
      "18",
      "--max-bytes-out-per-second-avg",
      "10000000",
      "--max-snapshots-skipped-backpressure-per-second-max",
      "0"
    ]
  },
  {
    name: "50 co-located crypt combat clients",
    args: [
      "--clients",
      "50",
      "--duration",
      "15000",
      "--combat",
      "1",
      "--zones",
      "cryptBoss",
      "--attack-targets",
      "--max-errors",
      "0",
      "--min-opened",
      "50",
      "--min-welcomed",
      "50",
      "--min-closed",
      "50",
      "--max-tick-ms-max",
      "10",
      "--max-snapshot-ms-max",
      "20",
      "--max-bytes-out-per-second-avg",
      "12000000",
      "--max-snapshots-skipped-backpressure-per-second-max",
      "0"
    ]
  },
  {
    name: "50 mixed clients with slow readers",
    serverEnv: {
      TIB_SOCKET_BACKPRESSURE_BYTES: "32768"
    },
    args: [
      "--clients",
      "50",
      "--duration",
      "15000",
      "--combat",
      "0.4",
      "--slow-clients",
      "5",
      "--slow-after",
      "1000",
      "--max-errors",
      "0",
      "--min-opened",
      "50",
      "--min-welcomed",
      "50",
      "--min-states",
      "7000",
      "--min-slow-paused",
      "5",
      "--max-tick-ms-max",
      "8",
      "--max-snapshot-ms-max",
      "18",
      "--max-bytes-out-per-second-avg",
      "10000000"
    ]
  }
];
const soakScenarios: Scenario[] = [
  {
    name: "50-client mixed combat soak",
    args: [
      "--clients",
      "50",
      "--duration",
      "60000",
      "--combat",
      "0.5",
      "--zones",
      "cemetery,crypt,woods,woodsNorth",
      "--attack-targets",
      "--max-errors",
      "0",
      "--min-opened",
      "50",
      "--min-welcomed",
      "50",
      "--min-closed",
      "50",
      "--min-states",
      "25000",
      "--max-tick-ms-max",
      "12",
      "--max-snapshot-ms-max",
      "24",
      "--max-bytes-out-per-second-avg",
      "12000000",
      "--max-snapshots-skipped-backpressure-per-second-max",
      "0"
    ]
  }
];
const scenarios = mode === "soak" ? soakScenarios : gateScenarios;

await assertPortFree(PORT);

try {
  for (const scenario of scenarios) {
    console.log(`\n[perf-gate] ${scenario.name}`);
    await runWithServer(scenario);
  }
  console.log(`\n[perf-${mode}] all thresholds passed`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

async function runWithServer(scenario: Scenario): Promise<void> {
  const server = spawn(process.execPath, ["server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      E2E_TEST: "1",
      TIB_ALLOW_TRANSIENT_PLAYERS: "1",
      TIB_WS_COMPRESSION: "0",
      ...scenario.serverEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverReady = false;
  server.stdout.setEncoding("utf8");
  server.stderr.setEncoding("utf8");
  server.stdout.on("data", (chunk: string) => {
    process.stdout.write(`[server] ${chunk}`);
    if (chunk.includes(`:${PORT}`)) serverReady = true;
  });
  server.stderr.on("data", (chunk: string) => process.stderr.write(`[server] ${chunk}`));

  try {
    await waitForServer(server, () => serverReady);
    await runScenario(scenario);
  } finally {
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => undefined);
  }
}

async function waitForServer(server: ReturnType<typeof spawn>, isReady: () => boolean): Promise<void> {
  const started = Date.now();
  while (!isReady() && Date.now() - started < SERVER_READY_MS) {
    if (server.exitCode != null) throw new Error(`server exited early with code ${server.exitCode}`);
    await delay(100);
  }
  if (!isReady()) throw new Error(`server did not report readiness within ${SERVER_READY_MS}ms`);
}

async function runScenario(scenario: Scenario): Promise<void> {
  const child = spawn(process.execPath, ["scripts/load-test.ts", "--port", String(PORT), ...scenario.args], {
    cwd: process.cwd(),
    stdio: "inherit"
  });
  const [code] = (await once(child, "exit")) as [number | null];
  if (code !== 0) throw new Error(`${scenario.name} failed with exit code ${code}`);
}

async function assertPortFree(port: number): Promise<void> {
  const probe = createServer();
  probe.unref();
  try {
    await new Promise<void>((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, HOST, () => resolve());
    });
  } catch (error) {
    throw new Error(`port ${port} is already in use; set TIB_PERF_PORT to a free port (${String(error)})`);
  } finally {
    if (probe.listening) await new Promise<void>((resolve) => probe.close(() => resolve()));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
