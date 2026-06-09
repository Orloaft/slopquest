import { readdirSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, resolve, join, relative } from "node:path";

interface FileEntry {
  path: string;
  bytes: number;
}

interface ParsedArgs {
  [key: string]: string | true;
}

interface PreloadGroup {
  label: string;
  paths: string[];
  files: FileEntry[];
  missing: string[];
  totalBytes: number;
}

interface PreloadBudget {
  files: FileEntry[];
  literalFiles: FileEntry[];
  dynamicFiles: FileEntry[];
  dynamic: PreloadGroup[];
  lazy: PreloadGroup[];
  missing: string[];
  totalBytes: number;
}

const options = parseArgs(process.argv.slice(2));
const root = String(options.root ?? "public");
const maxTotalBytes = optionNumber("max-total-bytes", 100 * 1024 * 1024);
const maxFileBytes = optionNumber("max-file-bytes", 5 * 1024 * 1024);
const maxFiles = optionNumber("max-files", 500);
const preloadEntry = stringOption("preload-entry");
const maxPreloadBytes = optionNumber("max-preload-bytes", 55 * 1024 * 1024);
const maxPreloadFiles = optionNumber("max-preload-files", 60);

const files = listFiles(root).sort((a, b) => b.bytes - a.bytes);
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const oversized = files.filter((file) => file.bytes > maxFileBytes);
const preload = preloadEntry ? preloadBudget(preloadEntry, root) : null;
const failures: string[] = [];

if (totalBytes > maxTotalBytes) failures.push(`total runtime assets ${totalBytes} > ${maxTotalBytes}`);
if (files.length > maxFiles) failures.push(`runtime asset file count ${files.length} > ${maxFiles}`);
for (const file of oversized) failures.push(`${file.path} ${file.bytes} > ${maxFileBytes}`);
if (preload) {
  if (preload.totalBytes > maxPreloadBytes) failures.push(`preloaded assets ${preload.totalBytes} > ${maxPreloadBytes}`);
  if (preload.files.length > maxPreloadFiles) failures.push(`preloaded asset file count ${preload.files.length} > ${maxPreloadFiles}`);
  for (const path of preload.missing) failures.push(`preloaded asset missing: ${path}`);
  for (const group of preload.lazy) {
    for (const path of group.missing) failures.push(`lazy asset missing: ${path} (${group.label})`);
  }
}

console.log(
  JSON.stringify(
    {
      root,
      files: files.length,
      totalBytes,
      totalMiB: roundMiB(totalBytes),
      maxTotalMiB: roundMiB(maxTotalBytes),
      maxFileMiB: roundMiB(maxFileBytes),
      maxFiles,
      largest: files.slice(0, 12).map((file) => ({ ...file, mib: roundMiB(file.bytes) })),
      preload: preload
        ? {
            entry: preloadEntry,
            files: preload.files.length,
            totalBytes: preload.totalBytes,
            totalMiB: roundMiB(preload.totalBytes),
            maxTotalMiB: roundMiB(maxPreloadBytes),
            maxFiles: maxPreloadFiles,
            literal: {
              files: preload.literalFiles.length,
              totalBytes: sumBytes(preload.literalFiles),
              totalMiB: roundMiB(sumBytes(preload.literalFiles))
            },
            dynamic: {
              files: preload.dynamicFiles.length,
              totalBytes: sumBytes(preload.dynamicFiles),
              totalMiB: roundMiB(sumBytes(preload.dynamicFiles)),
              groups: preload.dynamic.map((group) => ({
                label: group.label,
                files: group.files.length,
                totalBytes: group.totalBytes,
                totalMiB: roundMiB(group.totalBytes),
                largest: group.files.slice(0, 8).map((file) => ({ ...file, mib: roundMiB(file.bytes) })),
                missing: group.missing
              }))
            },
            lazy: {
              files: preload.lazy.reduce((sum, group) => sum + group.files.length, 0),
              totalBytes: preload.lazy.reduce((sum, group) => sum + group.totalBytes, 0),
              totalMiB: roundMiB(preload.lazy.reduce((sum, group) => sum + group.totalBytes, 0)),
              groups: preload.lazy.map((group) => ({
                label: group.label,
                files: group.files.length,
                totalBytes: group.totalBytes,
                totalMiB: roundMiB(group.totalBytes),
                largest: group.files.slice(0, 8).map((file) => ({ ...file, mib: roundMiB(file.bytes) })),
                missing: group.missing
              }))
            },
            missing: preload.missing,
            headroomMiB: roundMiB(maxPreloadBytes - preload.totalBytes),
            overByMiB: roundMiB(Math.max(0, preload.totalBytes - maxPreloadBytes)),
            fileHeadroom: maxPreloadFiles - preload.files.length,
            largest: preload.files.slice(0, 12).map((file) => ({ ...file, mib: roundMiB(file.bytes) })),
            preloadCandidates: preloadCandidates(preload)
              .slice(0, 12)
              .map((file) => ({ path: file.path, group: file.group, bytes: file.bytes, mib: roundMiB(file.bytes) }))
          }
        : undefined
    },
    null,
    2
  )
);

if (failures.length > 0) {
  console.error("Asset budget failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  if (preload) {
    console.error(
      `Preload budget: ${roundMiB(preload.totalBytes)} MiB across ${preload.files.length} files ` +
        `(cap ${roundMiB(maxPreloadBytes)} MiB / ${maxPreloadFiles} files).`
    );
    const candidates = preloadCandidates(preload).slice(0, 8);
    if (candidates.length > 0) {
      console.error("Largest preload candidates to lazy-load or split:");
      for (const file of candidates) console.error(`  - ${file.path} ${roundMiB(file.bytes)} MiB (${file.group})`);
    }
  }
  process.exit(1);
}

function preloadCandidates(preload: PreloadBudget): Array<FileEntry & { group: string }> {
  const dynamicGroups = new Map<string, string>();
  for (const group of preload.dynamic) {
    for (const file of group.files) dynamicGroups.set(file.path, group.label);
  }
  return preload.files
    .map((file) => ({ ...file, group: dynamicGroups.get(file.path) ?? "literal preload" }))
    .sort((a, b) => b.bytes - a.bytes);
}

function listFiles(dir: string): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      entries.push(...listFiles(path));
      continue;
    }
    if (!stat.isFile()) continue;
    entries.push({ path: relative(process.cwd(), path), bytes: stat.size });
  }
  return entries;
}

function preloadBudget(entry: string, rootDir: string): PreloadBudget {
  const source = readFileSync(entry, "utf8");
  const literalAssetPaths = new Set<string>();
  // Only count loads whose key AND path are plain string literals — the
  // statically-known preload set. Dynamic preload loops are handled explicitly
  // below so they show up in the budget instead of being silently undercounted.
  for (const match of source.matchAll(/\bthis\.load\.(?:image|spritesheet|audio)\(\s*["'][^"']*["']\s*,\s*["']([^"']+)["']/g)) {
    const path = match[1];
    if (path) literalAssetPaths.add(path);
  }
  const dynamic = dynamicPreloadGroups(entry, source, rootDir);
  const lazy = lazyAssetGroups(entry, source, rootDir);
  const dynamicAssetPaths = new Set(dynamic.flatMap((group) => group.paths));
  const assetPaths = new Set([...literalAssetPaths, ...dynamicAssetPaths]);
  const resolved = resolveAssetPaths([...assetPaths], rootDir);
  const literalFiles = resolveAssetPaths([...literalAssetPaths], rootDir).files;
  const dynamicFiles = resolveAssetPaths([...dynamicAssetPaths], rootDir).files;
  return {
    files: resolved.files,
    literalFiles,
    dynamicFiles,
    dynamic,
    lazy,
    missing: resolved.missing,
    totalBytes: sumBytes(resolved.files)
  };
}

function resolveAssetPaths(assetPaths: string[], rootDir: string): { files: FileEntry[]; missing: string[] } {
  const found = new Map<string, FileEntry>();
  const missing = new Set<string>();
  for (const assetPath of [...new Set(assetPaths)].sort()) {
    const path = join(rootDir, assetPath.replace(/^\//, ""));
    try {
      const stat = statSync(path);
      if (!stat.isFile()) {
        missing.add(assetPath);
        continue;
      }
      found.set(assetPath, { path: relative(process.cwd(), path), bytes: stat.size });
    } catch {
      missing.add(assetPath);
    }
  }
  return { files: [...found.values()].sort((a, b) => b.bytes - a.bytes), missing: [...missing].sort() };
}

function dynamicPreloadGroups(entry: string, source: string, rootDir: string): PreloadGroup[] {
  const groups: PreloadGroup[] = [];
  const northwoodSpritePaths = northwoodSpritePreloadPaths(source);
  if (northwoodSpritePaths.length > 0) groups.push(preloadGroup("NORTHWOOD_SPRITE_IDS sprite loop", northwoodSpritePaths, rootDir));

  const generatedStagePaths = hasGeneratedStagePreloadLoop(source) ? generatedStagePublicPaths(entry, source) : [];
  if (generatedStagePaths.length > 0) groups.push(preloadGroup("GENERATED_STAGES tileset.publicPath loop", generatedStagePaths, rootDir));

  return groups;
}

function lazyAssetGroups(entry: string, source: string, rootDir: string): PreloadGroup[] {
  const groups: PreloadGroup[] = [];
  const generatedStagePaths = hasGeneratedStageLazyLoader(source) ? generatedStagePublicPaths(entry, source) : [];
  if (generatedStagePaths.length > 0) groups.push(preloadGroup("lazy generated stage tilesets", generatedStagePaths, rootDir));
  return groups;
}

function preloadGroup(label: string, paths: string[], rootDir: string): PreloadGroup {
  const resolved = resolveAssetPaths(paths, rootDir);
  return { label, paths: [...new Set(paths)].sort(), files: resolved.files, missing: resolved.missing, totalBytes: sumBytes(resolved.files) };
}

function northwoodSpritePreloadPaths(source: string): string[] {
  const idsSource = source.match(/\bconst\s+NORTHWOOD_SPRITE_IDS\s*=\s*\[([^\]]*)\]\s*as\s+const\b/s)?.[1];
  if (!idsSource) return [];
  const ids = [...idsSource.matchAll(/\b\d+\b/g)].map((match) => Number(match[0]));
  return ids.map((id) => `/sprites/nw/obj_${String(id).padStart(3, "0")}.png`);
}

function hasGeneratedStagePreloadLoop(source: string): boolean {
  return /\bthis\.load\.image\(\s*generatedTilesetTextureKey\(\s*stage\s*,\s*tileset\.name\s*\)\s*,\s*tileset\.publicPath\s*\)/.test(source);
}

function hasGeneratedStageLazyLoader(source: string): boolean {
  return /\bfunction\s+ensureGeneratedStageAssetsLoaded\b/.test(source);
}

function generatedStagePublicPaths(entry: string, source: string): string[] {
  const stageListSource = source.match(/\bconst\s+GENERATED_STAGES\s*:\s*GeneratedStage\[\]\s*=\s*\[([^\]]*)\]/s)?.[1];
  if (!stageListSource) return [];

  const stageNames = stageListSource
    .split(",")
    .map((name) => name.trim())
    .filter((name) => /^[A-Z][A-Z0-9_]*_STAGE$/.test(name));
  if (stageNames.length === 0) return [];

  const indexPath = generatedStageIndexPath(entry, source);
  if (!indexPath) return [];

  const indexSource = readFileSync(indexPath, "utf8");
  const stageModules = new Map<string, string>();
  for (const match of indexSource.matchAll(/\bexport\s+\{\s*([A-Z][A-Z0-9_]*_STAGE)\s*\}\s+from\s+["']([^"']+)["']/g)) {
    const stageName = match[1];
    const modulePath = match[2];
    if (stageName && modulePath) stageModules.set(stageName, modulePath);
  }

  const paths = new Set<string>();
  for (const stageName of stageNames) {
    const modulePath = stageModules.get(stageName);
    if (!modulePath) continue;
    const stagePath = resolve(dirname(indexPath), modulePath);
    const stageSource = readFileSync(stagePath, "utf8");
    for (const match of stageSource.matchAll(/"publicPath"\s*:\s*"([^"]+)"/g)) {
      const publicPath = match[1];
      if (publicPath) paths.add(publicPath);
    }
  }
  return [...paths].sort();
}

function generatedStageIndexPath(entry: string, source: string): string | null {
  for (const match of source.matchAll(/\bimport\s+\{[^}]*_STAGE[^}]*\}\s+from\s+["']([^"']*generated\/stages\/index\.ts)["']/g)) {
    const indexPath = match[1];
    if (indexPath) return resolve(dirname(entry), indexPath);
  }
  return null;
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

function optionNumber(name: string, fallback: number): number {
  const raw = options[name];
  if (typeof raw !== "string") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function stringOption(name: string): string | null {
  const raw = options[name];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function roundMiB(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function sumBytes(files: FileEntry[]): number {
  return files.reduce((sum, file) => sum + file.bytes, 0);
}
