import { readdirSync, statSync } from "node:fs";
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

const files = listFiles(root).sort((a, b) => b.bytes - a.bytes);
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const oversized = files.filter((file) => file.bytes > maxFileBytes);
const failures: string[] = [];

if (totalBytes > maxTotalBytes) failures.push(`total runtime assets ${totalBytes} > ${maxTotalBytes}`);
if (files.length > maxFiles) failures.push(`runtime asset file count ${files.length} > ${maxFiles}`);
for (const file of oversized) failures.push(`${file.path} ${file.bytes} > ${maxFileBytes}`);

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
      largest: files.slice(0, 12).map((file) => ({ ...file, mib: roundMiB(file.bytes) }))
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

function roundMiB(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}
