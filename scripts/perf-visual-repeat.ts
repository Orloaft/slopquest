import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

interface FrameStats {
  avgFps?: number;
  p95Ms?: number;
  p99Ms?: number;
  maxMs?: number;
  droppedFrameEstimate?: number;
  longTaskCount?: number;
  longTaskTotalMs?: number;
}

interface RunResult {
  index: number;
  status: "pass" | "fail";
  exitCode: number | null;
  frameStats: FrameStats | null;
  outputTail: string;
}

const DEFAULT_RUNS = 3;
const DEFAULT_OUT = "artifacts/performance/browser-visual-repeat.json";
const runs = positiveInt(option("runs") ?? option("n")) ?? DEFAULT_RUNS;
const outPath = option("out") ?? DEFAULT_OUT;
const results: RunResult[] = [];

for (let index = 1; index <= runs; index += 1) {
  console.error(`browser visual perf repeat ${index}/${runs}`);
  const child = spawnSync(
    "npx",
    ["playwright", "test", "tests/e2e/render-performance.spec.ts", "--project=chromium"],
    {
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
  results.push({
    index,
    status: child.status === 0 ? "pass" : "fail",
    exitCode: child.status,
    frameStats: parseFrameStats(output),
    outputTail: output.slice(-4000)
  });
}

const validStats = results.map((run) => run.frameStats).filter((stats): stats is FrameStats => stats !== null);
const failedRuns = results.filter((run) => run.status !== "pass").length;
const summary = summarize(validStats);
const report = {
  schemaVersion: 1,
  command: "npx playwright test tests/e2e/render-performance.spec.ts --project=chromium",
  runs: results,
  browserVisualPerf: {
    status: failedRuns === 0 ? "pass" : "fail",
    summary:
      validStats.length === 0
        ? `${failedRuns}/${runs} visual perf runs failed; no frame stats were parsed`
        : `${runs - failedRuns}/${runs} visual perf runs passed; avg FPS min ${summary.avgFpsMin}, p95 max ${summary.p95MsMax}ms, dropped-frame max ${summary.droppedFrameEstimateMax}`
  },
  summary
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (failedRuns > 0) process.exitCode = 1;

function parseFrameStats(output: string): FrameStats | null {
  const matches = [...output.matchAll(/render-performance\s+(\{.*\})/g)];
  const raw = matches.at(-1)?.[1];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { frameStats?: FrameStats };
    return parsed.frameStats ?? null;
  } catch {
    return null;
  }
}

function summarize(stats: FrameStats[]) {
  return {
    samples: stats.length,
    avgFpsMin: min(stats.map((entry) => entry.avgFps)),
    avgFpsAvg: avg(stats.map((entry) => entry.avgFps)),
    p95MsMax: max(stats.map((entry) => entry.p95Ms)),
    p99MsMax: max(stats.map((entry) => entry.p99Ms)),
    maxMsMax: max(stats.map((entry) => entry.maxMs)),
    droppedFrameEstimateMax: max(stats.map((entry) => entry.droppedFrameEstimate)),
    longTaskCountMax: max(stats.map((entry) => entry.longTaskCount)),
    longTaskTotalMsMax: max(stats.map((entry) => entry.longTaskTotalMs))
  };
}

function option(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] ?? null;
  return null;
}

function positiveInt(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function min(values: Array<number | undefined>): number | null {
  const valid = values.filter((value): value is number => Number.isFinite(value));
  return valid.length === 0 ? null : round(Math.min(...valid));
}

function max(values: Array<number | undefined>): number | null {
  const valid = values.filter((value): value is number => Number.isFinite(value));
  return valid.length === 0 ? null : round(Math.max(...valid));
}

function avg(values: Array<number | undefined>): number | null {
  const valid = values.filter((value): value is number => Number.isFinite(value));
  return valid.length === 0 ? null : round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
