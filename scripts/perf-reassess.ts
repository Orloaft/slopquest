import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

type JsonValue = JsonObject | JsonValue[] | string | number | boolean | null;
type JsonObject = { [key: string]: JsonValue };
type Status = "PASS" | "WARN" | "FAIL";
type GradeStatus = Status | "MISSING";
type Category =
  | "asset-budgets"
  | "streaming"
  | "browser-visual-perf"
  | "server-gates"
  | "soak-stress"
  | "memory"
  | "stack-pivot";

interface Artifact {
  path: string;
  data: JsonValue;
}

interface Finding {
  category: Category;
  status: Status;
  label: string;
  detail: string;
  artifact: string;
}

interface CategorySummary {
  category: Category;
  label: string;
  status: GradeStatus;
  detail: string;
}

const DEFAULT_ROOTS = ["docs/performance/artifacts", "artifacts/performance", "artifacts/render-performance"];
const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: "asset-budgets", label: "asset-budgets" },
  { id: "streaming", label: "streaming" },
  { id: "browser-visual-perf", label: "browser-visual" },
  { id: "server-gates", label: "server-gates" },
  { id: "soak-stress", label: "soak-stress" },
  { id: "memory", label: "memory" },
  { id: "stack-pivot", label: "stack-pivot" }
];
const STATUS_WEIGHT: Record<GradeStatus, number> = {
  MISSING: 0,
  PASS: 1,
  WARN: 2,
  FAIL: 3
};
const MANUAL_SECTIONS: Record<string, Category> = {
  assetBudgets: "asset-budgets",
  "asset-budgets": "asset-budgets",
  streaming: "streaming",
  browserVisualPerf: "browser-visual-perf",
  "browser-visual-perf": "browser-visual-perf",
  serverGates: "server-gates",
  "server-gates": "server-gates",
  soakStress: "soak-stress",
  "soak-stress": "soak-stress",
  memory: "memory",
  stackPivot: "stack-pivot",
  "stack-pivot": "stack-pivot",
  pivotCriteria: "stack-pivot"
};

const cli = parseCli(process.argv.slice(2));
if (cli.help) {
  printHelp();
  process.exit(0);
}

const files = await collectInputFiles(cli.roots);
const artifacts = await loadArtifacts(files);
const findings = analyzeArtifacts(artifacts);
const summaries = CATEGORIES.map((category) => summarizeCategory(category, findings));
const overall = overallStatus(summaries);

printReport(summaries, artifacts, files.length, overall);
if (cli.strict && overall !== "PASS") process.exitCode = 1;

function parseCli(args: string[]): { roots: string[]; strict: boolean; help: boolean } {
  const roots: string[] = [];
  let strict = false;
  let help = false;
  for (const arg of args) {
    if (arg === "--strict") {
      strict = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else {
      roots.push(arg);
    }
  }
  return { roots: roots.length > 0 ? roots : DEFAULT_ROOTS, strict, help };
}

function printHelp(): void {
  console.log(`Usage: node scripts/perf-reassess.ts [--strict] [json-file-or-dir ...]

Reads saved perf artifact JSON and prints a compact MMO readiness grade.
Default roots: ${DEFAULT_ROOTS.join(", ")}

Examples:
  node scripts/perf-reassess.ts docs/performance/artifacts/2026-06-09
  node scripts/perf-reassess.ts --strict artifacts/performance`);
}

async function collectInputFiles(roots: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const root of roots) files.push(...(await collectJsonFiles(root)));
  return [...new Set(files)].sort();
}

async function collectJsonFiles(path: string): Promise<string[]> {
  let info;
  try {
    info = await stat(path);
  } catch {
    return [];
  }
  if (info.isFile()) return extname(path) === ".json" ? [path] : [];
  if (!info.isDirectory()) return [];

  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const childPath = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(childPath)));
    } else if (entry.isFile() && extname(entry.name) === ".json") {
      files.push(childPath);
    }
  }
  return files;
}

async function loadArtifacts(files: string[]): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];
  for (const file of files) {
    try {
      const text = await readFile(file, "utf8");
      artifacts.push({ path: file, data: JSON.parse(text) as JsonValue });
    } catch (error) {
      console.warn(`Skipping ${shortPath(file)}: ${String(error)}`);
    }
  }
  return artifacts;
}

function analyzeArtifacts(artifacts: Artifact[]): Finding[] {
  const findings: Finding[] = [];
  for (const artifact of artifacts) {
    findings.push(...analyzeManualArtifact(artifact));
    findings.push(...analyzeAssetBudgetArtifact(artifact));
    findings.push(...analyzeLoadTestArtifact(artifact));
    findings.push(...analyzeBossDensityArtifact(artifact));
    findings.push(...analyzePlaywrightArtifact(artifact));
    findings.push(...analyzeBrowserMetricArtifact(artifact));
  }
  return findings;
}

function analyzeManualArtifact(artifact: Artifact): Finding[] {
  if (!isObject(artifact.data)) return [];
  const findings: Finding[] = [];
  for (const [key, category] of Object.entries(MANUAL_SECTIONS)) {
    const section = artifact.data[key];
    if (!isObject(section)) continue;
    const status = parseStatus(section.status ?? section.grade ?? section.result);
    if (!status) continue;
    findings.push({
      category,
      status,
      label: "manual",
      detail: stringByKey(section, ["summary", "decision", "notes"]) ?? `${key} marked ${status.toLowerCase()}`,
      artifact: artifact.path
    });
  }
  return findings;
}

function analyzeAssetBudgetArtifact(artifact: Artifact): Finding[] {
  const pathSignal = artifact.path.toLowerCase().includes("asset") && artifact.path.toLowerCase().includes("budget");
  const keySignal = hasAnyKey(artifact.data, ["preloadBytes", "preloadTotalBytes", "maxPreloadBytes", "preloadFiles", "maxPreloadFiles"]);
  if (!pathSignal && !keySignal) return [];

  const policyReport = analyzePolicyAssetBudgetArtifact(artifact);
  if (policyReport) return [policyReport];

  const preloadBytes = firstNumberByKey(artifact.data, ["preloadBytes", "preloadTotalBytes", "totalPreloadBytes", "preloadSizeBytes"]);
  const maxPreloadBytes = firstNumberByKey(artifact.data, ["maxPreloadBytes", "maxPreloadSizeBytes", "preloadBytesBudget"]);
  const preloadFiles = firstNumberByKey(artifact.data, ["preloadFiles", "preloadFileCount", "totalPreloadFiles"]);
  const maxPreloadFiles = firstNumberByKey(artifact.data, ["maxPreloadFiles", "preloadFileBudget"]);
  const ok = firstBooleanByKey(artifact.data, ["ok", "pass", "passed", "withinBudget"]);
  const violationCount = firstCountByKey(artifact.data, ["violations", "failures", "overBudget"]);
  const problems: string[] = [];

  if (ok === false) problems.push("reported not ok");
  if (violationCount != null && violationCount > 0) problems.push(`${violationCount} violation(s)`);
  if (preloadBytes != null && maxPreloadBytes != null && preloadBytes > maxPreloadBytes) {
    problems.push(`preload ${formatBytes(preloadBytes)} > ${formatBytes(maxPreloadBytes)}`);
  }
  if (preloadFiles != null && maxPreloadFiles != null && preloadFiles > maxPreloadFiles) {
    problems.push(`files ${preloadFiles} > ${maxPreloadFiles}`);
  }

  const hasConcreteBudget = ok != null || violationCount != null || preloadBytes != null || preloadFiles != null;
  const status: Status = problems.length > 0 ? "FAIL" : hasConcreteBudget ? "PASS" : "WARN";
  const detailParts = [
    preloadBytes != null ? `preload=${formatBytes(preloadBytes)}` : null,
    maxPreloadBytes != null ? `max=${formatBytes(maxPreloadBytes)}` : null,
    preloadFiles != null ? `files=${preloadFiles}` : null,
    maxPreloadFiles != null ? `maxFiles=${maxPreloadFiles}` : null,
    problems.length > 0 ? problems.join("; ") : null
  ].filter(isString);

  return [
    {
      category: "asset-budgets",
      status,
      label: "asset budget",
      detail: detailParts.join(", ") || "asset budget artifact present but shape was not recognized",
      artifact: artifact.path
    }
  ];
}

function analyzePolicyAssetBudgetArtifact(artifact: Artifact): Finding | null {
  if (!isObject(artifact.data)) return null;
  const report = artifact.data;
  const preload = report.preload;
  if (!isObject(preload)) return null;
  const lazy = isObject(preload.lazy) ? preload.lazy : null;
  const status = parseStatus(report.status) ?? "WARN";
  const failures = stringArray(report.failures);
  const problems: string[] = [...failures];

  const runtimeBytes = asNumber(report.totalBytes);
  const runtimeMaxBytes = bytesFromMiB(report.maxTotalMiB);
  const runtimeFiles = asNumber(report.files);
  const runtimeMaxFiles = asNumber(report.maxFiles);
  const preloadBytes = asNumber(preload.totalBytes);
  const preloadMaxBytes = numberAt(preload, ["budget", "maxTotalBytes"]);
  const preloadFiles = asNumber(preload.files);
  const preloadMaxFiles = numberAt(preload, ["budget", "maxFiles"]);
  const lazyBytes = lazy ? asNumber(lazy.totalBytes) : null;
  const lazyMaxBytes = lazy ? numberAt(lazy, ["budget", "maxTotalBytes"]) : null;
  const lazyFiles = lazy ? asNumber(lazy.files) : null;
  const lazyMaxFiles = lazy ? numberAt(lazy, ["budget", "maxFiles"]) : null;

  if (runtimeBytes != null && runtimeMaxBytes != null && runtimeBytes > runtimeMaxBytes) problems.push(`runtime ${formatBytes(runtimeBytes)} > ${formatBytes(runtimeMaxBytes)}`);
  if (runtimeFiles != null && runtimeMaxFiles != null && runtimeFiles > runtimeMaxFiles) problems.push(`runtime files ${runtimeFiles} > ${runtimeMaxFiles}`);
  if (preloadBytes != null && preloadMaxBytes != null && preloadBytes > preloadMaxBytes) problems.push(`preload ${formatBytes(preloadBytes)} > ${formatBytes(preloadMaxBytes)}`);
  if (preloadFiles != null && preloadMaxFiles != null && preloadFiles > preloadMaxFiles) problems.push(`preload files ${preloadFiles} > ${preloadMaxFiles}`);
  if (lazyBytes != null && lazyMaxBytes != null && lazyBytes > lazyMaxBytes) problems.push(`lazy ${formatBytes(lazyBytes)} > ${formatBytes(lazyMaxBytes)}`);
  if (lazyFiles != null && lazyMaxFiles != null && lazyFiles > lazyMaxFiles) problems.push(`lazy files ${lazyFiles} > ${lazyMaxFiles}`);

  const detailParts = [
    runtimeBytes != null && runtimeMaxBytes != null ? `runtime=${formatBytes(runtimeBytes)}/${formatBytes(runtimeMaxBytes)}` : null,
    runtimeFiles != null && runtimeMaxFiles != null ? `runtimeFiles=${runtimeFiles}/${runtimeMaxFiles}` : null,
    preloadBytes != null && preloadMaxBytes != null ? `preload=${formatBytes(preloadBytes)}/${formatBytes(preloadMaxBytes)}` : null,
    preloadFiles != null && preloadMaxFiles != null ? `preloadFiles=${preloadFiles}/${preloadMaxFiles}` : null,
    lazyBytes != null && lazyMaxBytes != null ? `lazy=${formatBytes(lazyBytes)}/${formatBytes(lazyMaxBytes)}` : null,
    lazyFiles != null && lazyMaxFiles != null ? `lazyFiles=${lazyFiles}/${lazyMaxFiles}` : null,
    problems.length > 0 ? problems.join("; ") : null
  ].filter(isString);

  return {
    category: "asset-budgets",
    status: problems.length > 0 ? "FAIL" : status,
    label: "asset policy",
    detail: detailParts.join(", ") || "policy asset budget report present",
    artifact: artifact.path
  };
}

function analyzeLoadTestArtifact(artifact: Artifact): Finding[] {
  if (!isObject(artifact.data) || !isObject(artifact.data.perTick)) return [];
  const clients = asNumber(artifact.data.clients) ?? numberAt(artifact.data, ["server", "clientsPeak"]);
  const durationMs = asNumber(artifact.data.durationMs);
  if (clients == null || durationMs == null) return [];

  const findings: Finding[] = [];
  const serverAssessment = assessServerLoad(artifact.data, clients, durationMs);
  findings.push({
    category: "server-gates",
    status: serverAssessment.status,
    label: "load-test",
    detail: serverAssessment.detail,
    artifact: artifact.path
  });

  const streamingAssessment = assessRuntimeStreaming(artifact.data, clients);
  if (streamingAssessment) {
    findings.push({
      category: "streaming",
      status: streamingAssessment.status,
      label: "runtime residency",
      detail: streamingAssessment.detail,
      artifact: artifact.path
    });
  }

  const memoryAssessment = assessMemory(artifact.data, durationMs);
  if (memoryAssessment) {
    findings.push({
      category: "memory",
      status: memoryAssessment.status,
      label: "heap/rss",
      detail: memoryAssessment.detail,
      artifact: artifact.path
    });
  }

  if (isSoakOrStressArtifact(artifact.path, clients, durationMs)) {
    findings.push({
      category: "soak-stress",
      status: serverAssessment.status,
      label: "soak/stress load",
      detail: serverAssessment.detail,
      artifact: artifact.path
    });
  }

  return findings;
}

function analyzeBossDensityArtifact(artifact: Artifact): Finding[] {
  if (!isObject(artifact.data) || !isObject(artifact.data.telegraphsReceivedPerBot) || !isObject(artifact.data.serverMetric)) return [];
  const connected = asNumber(artifact.data.connected);
  const errors = asNumber(artifact.data.errors) ?? 0;
  const telegraphMin = numberAt(artifact.data, ["telegraphsReceivedPerBot", "min"]) ?? 0;
  const telegraphAvg = numberAt(artifact.data, ["telegraphsReceivedPerBot", "avg"]) ?? 0;
  const tickMax = numberAt(artifact.data, ["serverMetric", "tickMsMax"]);
  const snapshotMax = numberAt(artifact.data, ["serverMetric", "snapshotMsMax"]);
  const eventsDroppedMax = numberAt(artifact.data, ["serverMetric", "eventsDroppedMax"]) ?? 0;
  const failures: string[] = [];
  const warnings: string[] = [];

  if (errors > 0) failures.push(`${errors} error(s)`);
  if (eventsDroppedMax > 0) failures.push(`${eventsDroppedMax} dropped event(s)`);
  if (telegraphMin < 1 || telegraphAvg < 4) failures.push(`telegraphs min=${telegraphMin} avg=${telegraphAvg}`);
  if (tickMax != null && tickMax > 50) failures.push(`tick max ${formatMs(tickMax)}`);
  if (snapshotMax != null && snapshotMax > 75) failures.push(`snapshot max ${formatMs(snapshotMax)}`);
  if (connected != null && connected < 24) warnings.push(`only ${connected} connected`);

  return [
    {
      category: "server-gates",
      status: statusFromProblems(failures, warnings),
      label: "boss-density",
      detail: [connected != null ? `${connected} clients` : null, `telegraphs min=${telegraphMin} avg=${telegraphAvg}`, ...failures, ...warnings]
        .filter(isString)
        .join(", "),
      artifact: artifact.path
    }
  ];
}

function analyzePlaywrightArtifact(artifact: Artifact): Finding[] {
  if (!isObject(artifact.data) || !isObject(artifact.data.stats) || !Array.isArray(artifact.data.suites)) return [];
  const unexpected = numberAt(artifact.data, ["stats", "unexpected"]) ?? 0;
  const failed = numberAt(artifact.data, ["stats", "failed"]) ?? 0;
  const skipped = numberAt(artifact.data, ["stats", "skipped"]) ?? 0;
  const expected = numberAt(artifact.data, ["stats", "expected"]) ?? 0;
  const status: Status = unexpected > 0 || failed > 0 ? "FAIL" : skipped > 0 ? "WARN" : "PASS";
  return [
    {
      category: "browser-visual-perf",
      status,
      label: "playwright",
      detail: `expected=${expected}, failed=${failed}, unexpected=${unexpected}, skipped=${skipped}`,
      artifact: artifact.path
    }
  ];
}

function analyzeBrowserMetricArtifact(artifact: Artifact): Finding[] {
  const fps = firstNumberByKey(artifact.data, ["fps", "averageFps", "avgFps"]);
  const minFps = firstNumberByKey(artifact.data, ["minFps", "fpsMin"]);
  const frameP95 = firstNumberByKey(artifact.data, ["frameP95Ms", "p95FrameMs", "frameMsP95"]);
  const longTasks = firstNumberByKey(artifact.data, ["longTasks", "longTaskCount"]);
  const blankCanvas = firstBooleanByKey(artifact.data, ["blankCanvas", "canvasBlank", "isCanvasBlank"]);
  if (fps == null && minFps == null && frameP95 == null && longTasks == null && blankCanvas == null) return [];

  const failures: string[] = [];
  const warnings: string[] = [];
  if (blankCanvas) failures.push("blank canvas");
  if (minFps != null && minFps < 45) failures.push(`min FPS ${minFps}`);
  if (frameP95 != null && frameP95 > 33) failures.push(`frame p95 ${formatMs(frameP95)}`);
  if (fps != null && fps < 55) warnings.push(`avg FPS ${fps}`);
  if (minFps != null && minFps < 55 && minFps >= 45) warnings.push(`min FPS ${minFps}`);
  if (frameP95 != null && frameP95 > 16.7 && frameP95 <= 33) warnings.push(`frame p95 ${formatMs(frameP95)}`);
  if (longTasks != null && longTasks > 0) warnings.push(`${longTasks} long task(s)`);

  return [
    {
      category: "browser-visual-perf",
      status: statusFromProblems(failures, warnings),
      label: "browser metrics",
      detail: [
        fps != null ? `avg FPS=${fps}` : null,
        minFps != null ? `min FPS=${minFps}` : null,
        frameP95 != null ? `frame p95=${formatMs(frameP95)}` : null,
        longTasks != null ? `longTasks=${longTasks}` : null,
        ...failures,
        ...warnings
      ]
        .filter(isString)
        .join(", "),
      artifact: artifact.path
    }
  ];
}

function assessServerLoad(report: JsonObject, clients: number, durationMs: number): { status: Status; detail: string } {
  const errors = asNumber(report.errors) ?? 0;
  const closed = asNumber(report.closed);
  const tickMax = metricField(report, "perTick", "tickMs", "max");
  const tickP95 = metricField(report, "perTick", "tickMs", "p95");
  const snapshotMax = metricField(report, "perTick", "snapshotMs", "max");
  const snapshotP95 = metricField(report, "perTick", "snapshotMs", "p95");
  const eventLoopP95 = metricField(report, "perTick", "eventLoopDelayP95Ms", "max") ?? metricField(report, "perTick", "eventLoopDelayMs", "p95");
  const dropped = sumMetricMax(report, [
    "snapshotsSkippedBackpressurePerSecond",
    "socketsTerminatedBackpressurePerSecond",
    "eventsDroppedPerSecond",
    "clientMessagesDroppedPerSecond"
  ]);
  const failures: string[] = [];
  const warnings: string[] = [];

  if (errors > 0) failures.push(`${errors} error(s)`);
  if (closed != null && closed < clients) failures.push(`closed ${closed}/${clients}`);
  if (dropped > 0) failures.push(`drop/backpressure max ${dropped}`);
  if (tickMax != null && tickMax > 50) failures.push(`tick max ${formatMs(tickMax)}`);
  if (snapshotMax != null && snapshotMax > 75) failures.push(`snapshot max ${formatMs(snapshotMax)}`);
  if (eventLoopP95 != null && eventLoopP95 > 40) failures.push(`event loop p95 ${formatMs(eventLoopP95)}`);
  if (clients < 50) warnings.push(`only ${clients} clients`);
  if (tickMax == null) warnings.push("missing tick max");
  if (snapshotMax == null) warnings.push("missing snapshot max");
  if (tickP95 != null && tickP95 > 16) warnings.push(`tick p95 ${formatMs(tickP95)}`);
  if (snapshotP95 != null && snapshotP95 > 32) warnings.push(`snapshot p95 ${formatMs(snapshotP95)}`);

  return {
    status: statusFromProblems(failures, warnings),
    detail: [
      `${clients} clients/${formatDuration(durationMs)}`,
      tickMax != null ? `tick max=${formatMs(tickMax)}` : null,
      snapshotMax != null ? `snapshot max=${formatMs(snapshotMax)}` : null,
      eventLoopP95 != null ? `event loop p95=${formatMs(eventLoopP95)}` : null,
      ...failures,
      ...warnings
    ]
      .filter(isString)
      .join(", ")
  };
}

function assessRuntimeStreaming(report: JsonObject, clients: number): { status: Status; detail: string } | null {
  const resident = metricField(report, "perTick", "residentStaticResources", "max");
  const cacheEntries = metricField(report, "perTick", "snapshotCacheEntries", "max");
  const cachePeak = metricField(report, "perTick", "snapshotCacheEntriesPeak", "max");
  const staticFull = numberAt(report, ["snapshotFlags", "staticFull"]);
  if (resident == null && cacheEntries == null && cachePeak == null && staticFull == null) return null;

  const expectedInitialStaticFull = clients * 4;
  const failures: string[] = [];
  const warnings: string[] = [];
  if (resident != null && resident > 5000) failures.push(`resident static ${resident}`);
  if (cacheEntries != null && cacheEntries > 70000) failures.push(`snapshot cache ${cacheEntries}`);
  if (cachePeak != null && cachePeak > 1000) failures.push(`cache peak ${cachePeak}`);
  if (staticFull != null && staticFull > expectedInitialStaticFull + 4) warnings.push(`staticFull ${staticFull} > expected ${expectedInitialStaticFull}`);

  return {
    status: statusFromProblems(failures, warnings),
    detail: [
      resident != null ? `residentStatic max=${resident}` : null,
      cacheEntries != null ? `cache max=${cacheEntries}` : null,
      cachePeak != null ? `cachePeak max=${cachePeak}` : null,
      staticFull != null ? `staticFull=${staticFull}` : null,
      ...failures,
      ...warnings
    ]
      .filter(isString)
      .join(", ")
  };
}

function assessMemory(report: JsonObject, durationMs: number): { status: Status; detail: string } | null {
  const heapMax = metricField(report, "perTick", "heapUsedMb", "max");
  const rssMax = metricField(report, "perTick", "rssMb", "max");
  if (heapMax == null && rssMax == null) return null;

  const failures: string[] = [];
  const warnings: string[] = [];
  if (heapMax != null && heapMax > 1024) failures.push(`heap ${heapMax} MB`);
  if (rssMax != null && rssMax > 2048) failures.push(`rss ${rssMax} MB`);
  if (heapMax != null && heapMax > 512 && heapMax <= 1024) warnings.push(`heap ${heapMax} MB`);
  if (rssMax != null && rssMax > 1024 && rssMax <= 2048) warnings.push(`rss ${rssMax} MB`);
  if (durationMs < 60000) warnings.push("short run; no leak slope");

  return {
    status: statusFromProblems(failures, warnings),
    detail: [
      heapMax != null ? `heap max=${heapMax} MB` : null,
      rssMax != null ? `rss max=${rssMax} MB` : null,
      ...failures,
      ...warnings
    ]
      .filter(isString)
      .join(", ")
  };
}

function summarizeCategory(category: { id: Category; label: string }, findings: Finding[]): CategorySummary {
  const relevant = findings.filter((finding) => finding.category === category.id);
  if (relevant.length === 0) {
    return { category: category.id, label: category.label, status: "MISSING", detail: "no recognized JSON evidence" };
  }
  const worst = relevant.reduce((current, next) => (STATUS_WEIGHT[next.status] > STATUS_WEIGHT[current.status] ? next : current));
  const statusCounts = relevant.reduce<Record<Status, number>>(
    (counts, finding) => {
      counts[finding.status] += 1;
      return counts;
    },
    { PASS: 0, WARN: 0, FAIL: 0 }
  );
  const countSummary = (["FAIL", "WARN", "PASS"] as Status[])
    .filter((status) => statusCounts[status] > 0)
    .map((status) => `${status.toLowerCase()}=${statusCounts[status]}`)
    .join(", ");
  return {
    category: category.id,
    label: category.label,
    status: worst.status,
    detail: `${countSummary}; ${worst.label}: ${worst.detail} (${shortPath(worst.artifact)})`
  };
}

function overallStatus(summaries: CategorySummary[]): GradeStatus {
  if (summaries.some((summary) => summary.status === "FAIL")) return "FAIL";
  if (summaries.every((summary) => summary.status === "MISSING")) return "MISSING";
  if (summaries.some((summary) => summary.status === "WARN" || summary.status === "MISSING")) return "WARN";
  return "PASS";
}

function printReport(summaries: CategorySummary[], artifacts: Artifact[], discoveredFiles: number, overall: GradeStatus): void {
  console.log("TIB MMO perf reassessment");
  console.log(`Artifacts read: ${artifacts.length}/${discoveredFiles}`);
  console.log(`Overall: ${overall}`);
  for (const summary of summaries) {
    console.log(`${summary.label.padEnd(20)} ${summary.status.padEnd(7)} ${summary.detail}`);
  }
  console.log("Use --strict to fail unless every category is PASS.");
}

function isSoakOrStressArtifact(path: string, clients: number, durationMs: number): boolean {
  const lowerPath = path.toLowerCase();
  return lowerPath.includes("soak") || lowerPath.includes("stress") || lowerPath.includes("prod") || clients >= 150 || durationMs >= 60000;
}

function metricField(root: JsonObject, group: string, metric: string, field: string): number | null {
  return numberAt(root, [group, metric, field]);
}

function sumMetricMax(root: JsonObject, metricNames: string[]): number {
  let total = 0;
  for (const metric of metricNames) total += metricField(root, "perTick", metric, "max") ?? 0;
  return total;
}

function statusFromProblems(failures: string[], warnings: string[]): Status {
  if (failures.length > 0) return "FAIL";
  if (warnings.length > 0) return "WARN";
  return "PASS";
}

function parseStatus(value: JsonValue | undefined): Status | null {
  if (typeof value === "boolean") return value ? "PASS" : "FAIL";
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["pass", "passed", "ok", "green"].includes(normalized)) return "PASS";
  if (["warn", "warning", "review", "yellow", "needs-review"].includes(normalized)) return "WARN";
  if (["fail", "failed", "block", "blocked", "red"].includes(normalized)) return "FAIL";
  return null;
}

function numberAt(value: JsonValue | undefined, path: string[]): number | null {
  let current: JsonValue | undefined = value;
  for (const segment of path) {
    if (!isObject(current)) return null;
    current = current[segment];
  }
  return asNumber(current);
}

function stringByKey(value: JsonValue, keys: string[]): string | null {
  for (const found of valuesForKeys(value, new Set(keys))) {
    if (typeof found === "string" && found.trim()) return found.trim();
  }
  return null;
}

function firstNumberByKey(value: JsonValue, keys: string[]): number | null {
  for (const found of valuesForKeys(value, new Set(keys))) {
    const numberValue = asNumber(found);
    if (numberValue != null) return numberValue;
  }
  return null;
}

function firstBooleanByKey(value: JsonValue, keys: string[]): boolean | null {
  for (const found of valuesForKeys(value, new Set(keys))) {
    if (typeof found === "boolean") return found;
  }
  return null;
}

function firstCountByKey(value: JsonValue, keys: string[]): number | null {
  for (const found of valuesForKeys(value, new Set(keys))) {
    if (typeof found === "number") return found;
    if (Array.isArray(found)) return found.length;
    if (typeof found === "boolean") return found ? 1 : 0;
  }
  return null;
}

function stringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function hasAnyKey(value: JsonValue, keys: string[]): boolean {
  return valuesForKeys(value, new Set(keys)).length > 0;
}

function valuesForKeys(value: JsonValue | undefined, keys: Set<string>, found: JsonValue[] = []): JsonValue[] {
  if (value == null) return found;
  if (Array.isArray(value)) {
    for (const item of value) valuesForKeys(item, keys, found);
    return found;
  }
  if (!isObject(value)) return found;
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key)) found.push(child);
    valuesForKeys(child, keys, found);
  }
  return found;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isString(value: string | null): value is string {
  return typeof value === "string";
}

function shortPath(path: string): string {
  const shortened = relative(process.cwd(), path);
  return shortened && !shortened.startsWith("..") ? shortened : path;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mib = bytes / (1024 * 1024);
  return `${Math.round(mib * 10) / 10} MiB`;
}

function bytesFromMiB(value: JsonValue | undefined): number | null {
  const mib = asNumber(value);
  return mib == null ? null : mib * 1024 * 1024;
}

function formatMs(ms: number): string {
  return `${Math.round(ms * 100) / 100} ms`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${Math.round((ms / 1000) * 10) / 10} s`;
}
