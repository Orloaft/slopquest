import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

interface PaletteFile {
  palettes: Record<string, { colors: string[] }>;
}

interface AllowlistEntry {
  id: string;
  type?: "tileset" | "actor";
  stage?: string;
  stageFile?: string;
  tilesetName?: string;
  source: string;
  runtime: string;
  publicRuntime: string;
  manifest?: string;
  palette: string;
  sourceTileSize: number;
  runtimeTileSize: number;
  sourceFrameWidth?: number;
  sourceFrameHeight?: number;
  runtimeFrameWidth?: number;
  runtimeFrameHeight?: number;
  rows?: string[];
  framesPerRow?: number;
  scale: number;
  maxColorsPerSource8x8Cell: number;
  transitionExceptions?: Array<{ check: string; reason: string }>;
}

interface Spec {
  artifactsDir: string;
  reportMirrorDirs?: string[];
  allowlist: AllowlistEntry[];
}

interface Finding {
  id: string;
  level: "error" | "warning";
  message: string;
}

const repoRoot = process.cwd();
const specPath = path.join(repoRoot, "assetsources/gbc/gbc-asset-spec.json");
const palettePath = path.join(repoRoot, "assetsources/gbc/palettes.json");

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function hexAt(png: PNG, x: number, y: number): string {
  const i = (y * png.width + x) * 4;
  const a = png.data[i + 3];
  if (a === 0) return "transparent";
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(png.data[i])}${h(png.data[i + 1])}${h(png.data[i + 2])}`;
}

function loadPng(file: string, findings: Finding[], id: string): PNG | null {
  if (!existsSync(file)) {
    findings.push({ id, level: "error", message: `Missing PNG: ${path.relative(repoRoot, file)}` });
    return null;
  }
  return PNG.sync.read(readFileSync(file));
}

function hasException(entry: AllowlistEntry, check: string): boolean {
  return Boolean(entry.transitionExceptions?.some((item) => item.check === check && item.reason.trim().length > 0));
}

function validateEntry(entry: AllowlistEntry, palettes: PaletteFile, findings: Finding[]): Record<string, unknown> {
  const sourcePath = path.join(repoRoot, entry.source);
  const runtimePath = path.join(repoRoot, entry.runtime);
  const publicRuntimePath = path.join(repoRoot, entry.publicRuntime);
  const manifestPath = entry.manifest ? path.join(repoRoot, entry.manifest) : null;
  const stagePath = entry.stageFile ? path.join(repoRoot, entry.stageFile) : null;
  const source = loadPng(sourcePath, findings, entry.id);
  const runtime = loadPng(runtimePath, findings, entry.id);
  const allowed = new Set((palettes.palettes[entry.palette]?.colors ?? []).map((color) => color.toLowerCase()));
  const kind = entry.type ?? "tileset";
  const stats: Record<string, unknown> = { id: entry.id, type: kind };

  if (!palettes.palettes[entry.palette]) {
    findings.push({ id: entry.id, level: "error", message: `Unknown palette '${entry.palette}'` });
  }
  if (kind === "tileset") {
    if (!manifestPath || !entry.manifest || !existsSync(manifestPath)) findings.push({ id: entry.id, level: "error", message: `Missing manifest: ${entry.manifest ?? "(unset)"}` });
    if (!stagePath || !entry.stageFile || !existsSync(stagePath)) findings.push({ id: entry.id, level: "error", message: `Missing stage file: ${entry.stageFile ?? "(unset)"}` });
    if (!entry.stage || !entry.tilesetName) findings.push({ id: entry.id, level: "error", message: "Tileset entries require stage and tilesetName" });
  }
  if (existsSync(runtimePath) && existsSync(publicRuntimePath) && !readFileSync(runtimePath).equals(readFileSync(publicRuntimePath))) {
    findings.push({ id: entry.id, level: "error", message: `${entry.publicRuntime} is stale; run npm run assets:stage:route` });
  }

  if (kind === "tileset" && stagePath && manifestPath && entry.tilesetName && entry.manifest && existsSync(stagePath)) {
    const stage = readJson<{ tilesets: Array<{ name: string; image: string; manifest: string }> }>(stagePath);
    const referenced = stage.tilesets.find((tileset) => tileset.name === entry.tilesetName);
    if (!referenced) {
      findings.push({ id: entry.id, level: "error", message: `Stage '${entry.stage}' does not reference tileset '${entry.tilesetName}'` });
    } else {
      const runtimeName = path.basename(entry.runtime);
      const manifestName = path.basename(entry.manifest);
      if (referenced.image !== runtimeName || referenced.manifest !== manifestName) {
        findings.push({ id: entry.id, level: "error", message: `Stage tileset '${entry.tilesetName}' is not covered by the GBC manifest entry` });
      }
    }
  }

  if (!source || !runtime) return stats;

  stats.sourceSize = [source.width, source.height];
  stats.runtimeSize = [runtime.width, runtime.height];
  const expectedRuntime = [source.width * entry.scale, source.height * entry.scale];
  if (runtime.width !== expectedRuntime[0] || runtime.height !== expectedRuntime[1]) {
    findings.push({ id: entry.id, level: "error", message: `Runtime sheet must be ${entry.scale}x source (${expectedRuntime.join("x")}), got ${runtime.width}x${runtime.height}` });
  }
  if (kind === "tileset" && (source.width % entry.sourceTileSize !== 0 || source.height % entry.sourceTileSize !== 0)) {
    findings.push({ id: entry.id, level: "error", message: `Source sheet is not aligned to ${entry.sourceTileSize}px tiles` });
  }
  if (kind === "tileset" && (runtime.width % entry.runtimeTileSize !== 0 || runtime.height % entry.runtimeTileSize !== 0)) {
    findings.push({ id: entry.id, level: "error", message: `Runtime sheet is not aligned to ${entry.runtimeTileSize}px tiles` });
  }
  if (kind === "actor") {
    const sourceFrameWidth = entry.sourceFrameWidth ?? entry.sourceTileSize;
    const sourceFrameHeight = entry.sourceFrameHeight ?? entry.sourceTileSize;
    const runtimeFrameWidth = entry.runtimeFrameWidth ?? entry.runtimeTileSize;
    const runtimeFrameHeight = entry.runtimeFrameHeight ?? entry.runtimeTileSize;
    const expectedRows = entry.rows?.length ?? 0;
    const expectedFrames = entry.framesPerRow ?? 0;
    if (source.width % sourceFrameWidth !== 0 || source.height % sourceFrameHeight !== 0) {
      findings.push({ id: entry.id, level: "error", message: `Actor source is not aligned to ${sourceFrameWidth}x${sourceFrameHeight}px frames` });
    }
    if (runtime.width % runtimeFrameWidth !== 0 || runtime.height % runtimeFrameHeight !== 0) {
      findings.push({ id: entry.id, level: "error", message: `Actor runtime is not aligned to ${runtimeFrameWidth}x${runtimeFrameHeight}px frames` });
    }
    if (expectedRows && source.height !== expectedRows * sourceFrameHeight) {
      findings.push({ id: entry.id, level: "error", message: `Actor source row count must match rows (${expectedRows}), got ${source.height / sourceFrameHeight}` });
    }
    if (expectedFrames && source.width !== expectedFrames * sourceFrameWidth) {
      findings.push({ id: entry.id, level: "error", message: `Actor source frame count must be ${expectedFrames} per row, got ${source.width / sourceFrameWidth}` });
    }
    stats.actorContract = {
      sourceFrame: [sourceFrameWidth, sourceFrameHeight],
      runtimeFrame: [runtimeFrameWidth, runtimeFrameHeight],
      rows: entry.rows,
      framesPerRow: entry.framesPerRow
    };
  }

  const usedColors = new Set<string>();
  const badColors = new Set<string>();
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    const hex = hexAt(source, x, y);
    usedColors.add(hex);
    if (hex !== "transparent" && !allowed.has(hex)) badColors.add(hex);
  }
  stats.usedColors = [...usedColors].sort();
  if (badColors.size && !hasException(entry, "palette")) {
    findings.push({ id: entry.id, level: "error", message: `Source uses undeclared colors: ${[...badColors].sort().join(", ")}` });
  }

  let nearestMismatch = 0;
  const checkW = Math.min(runtime.width, source.width * entry.scale);
  const checkH = Math.min(runtime.height, source.height * entry.scale);
  for (let y = 0; y < checkH; y += 1) for (let x = 0; x < checkW; x += 1) {
    const s = hexAt(source, Math.floor(x / entry.scale), Math.floor(y / entry.scale));
    const r = hexAt(runtime, x, y);
    if (s !== r) nearestMismatch += 1;
  }
  stats.nearestMismatchPixels = nearestMismatch;
  if (nearestMismatch && !hasException(entry, "nearest-scale")) {
    findings.push({ id: entry.id, level: "error", message: `Runtime is not exact ${entry.scale}x nearest-neighbor scale (${nearestMismatch} mismatched pixels)` });
  }

  const overBudgetCells: Array<{ tileX: number; tileY: number; cellX: number; cellY: number; colors: number }> = [];
  const sourceCellWidth = entry.sourceFrameWidth ?? entry.sourceTileSize;
  const sourceCellHeight = entry.sourceFrameHeight ?? entry.sourceTileSize;
  for (let ty = 0; ty < source.height; ty += sourceCellHeight) for (let tx = 0; tx < source.width; tx += sourceCellWidth) {
    for (let cy = 0; cy < sourceCellHeight; cy += 8) for (let cx = 0; cx < sourceCellWidth; cx += 8) {
      const colors = new Set<string>();
      const cellW = Math.min(8, source.width - tx - cx, sourceCellWidth - cx);
      const cellH = Math.min(8, source.height - ty - cy, sourceCellHeight - cy);
      for (let y = 0; y < cellH; y += 1) for (let x = 0; x < cellW; x += 1) colors.add(hexAt(source, tx + cx + x, ty + cy + y));
      if (colors.size > entry.maxColorsPerSource8x8Cell) {
        overBudgetCells.push({ tileX: tx / sourceCellWidth, tileY: ty / sourceCellHeight, cellX: cx / 8, cellY: cy / 8, colors: colors.size });
      }
    }
  }
  stats.overBudget8x8Cells = overBudgetCells.length;
  if (overBudgetCells.length && !hasException(entry, "8x8-color-budget")) {
    const sample = overBudgetCells.slice(0, 8).map((cell) => `tile ${cell.tileX},${cell.tileY} cell ${cell.cellX},${cell.cellY}=${cell.colors}`).join("; ");
    findings.push({ id: entry.id, level: "error", message: `8x8 source color budget exceeded in ${overBudgetCells.length} cells (${sample})` });
  }

  return stats;
}

const spec = readJson<Spec>(specPath);
const palettes = readJson<PaletteFile>(palettePath);
const findings: Finding[] = [];
const summaries = spec.allowlist.map((entry) => validateEntry(entry, palettes, findings));
const ok = findings.every((finding) => finding.level !== "error");
const report = { ok, generatedAt: new Date().toISOString(), allowlist: spec.allowlist.map((entry) => entry.id), summaries, findings };
const reportDirs = [spec.artifactsDir, ...(spec.reportMirrorDirs ?? [])];
for (const reportDir of reportDirs) {
  const outDir = path.join(repoRoot, reportDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "gbc-validator-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    path.join(outDir, "gbc-validator-report.md"),
    [
      "# GBC Asset Validator Report",
      "",
      `Status: ${ok ? "PASS" : "FAIL"}`,
      "",
      "## Allowlist",
      ...spec.allowlist.map((entry) => `- ${entry.id}: ${entry.source} -> ${entry.runtime}`),
      "",
      "## Findings",
      ...(findings.length ? findings.map((finding) => `- ${finding.level.toUpperCase()} ${finding.id}: ${finding.message}`) : ["- None."])
    ].join("\n")
  );
}

console.log(`${ok ? "PASS" : "FAIL"} GBC asset validator: ${findings.length} findings`);
if (!ok) process.exit(1);
