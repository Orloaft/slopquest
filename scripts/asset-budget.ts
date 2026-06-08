import { readdirSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

interface FileEntry {
  path: string;
  bytes: number;
}

interface ParsedArgs {
  [key: string]: string | true;
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
            missing: preload.missing,
            largest: preload.files.slice(0, 12).map((file) => ({ ...file, mib: roundMiB(file.bytes) }))
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
  process.exit(1);
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

function preloadBudget(entry: string, rootDir: string): { files: FileEntry[]; missing: string[]; totalBytes: number } {
  const source = readFileSync(entry, "utf8");
  const assetPaths = new Set<string>();
  // Only count loads whose key AND path are plain string literals — the
  // statically-known preload set. Requiring a quoted-literal key (rather than a
  // permissive `[^,]+`) skips data-driven/template-literal loops like the
  // nw-sprite and generated-stage loaders, which would otherwise capture a comma
  // inside the key expression (e.g. padStart(3, "0")) as a bogus asset path.
  for (const match of source.matchAll(/\bthis\.load\.(?:image|spritesheet|audio)\(\s*["'][^"']*["']\s*,\s*["']([^"']+)["']/g)) {
    const path = match[1];
    if (path) assetPaths.add(path);
  }
  const found: FileEntry[] = [];
  const missing: string[] = [];
  for (const assetPath of [...assetPaths].sort()) {
    const path = join(rootDir, assetPath.replace(/^\//, ""));
    try {
      const stat = statSync(path);
      if (!stat.isFile()) {
        missing.push(assetPath);
        continue;
      }
      found.push({ path: relative(process.cwd(), path), bytes: stat.size });
    } catch {
      missing.push(assetPath);
    }
  }
  found.sort((a, b) => b.bytes - a.bytes);
  return { files: found, missing, totalBytes: found.reduce((sum, file) => sum + file.bytes, 0) };
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
