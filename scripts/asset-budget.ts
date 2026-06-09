import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

interface FileEntry {
  path: string;
  bytes: number;
}

interface ParsedArgs {
  [key: string]: string | true;
}

interface BudgetLimit {
  maxTotalBytes?: number;
  maxFileBytes?: number;
  maxFiles?: number;
}

interface AssetPolicy {
  schemaVersion?: number;
  policyVersion?: string;
  root?: string;
  preloadEntry?: string;
  budgets?: {
    runtime?: BudgetLimit;
    startupPreload?: BudgetLimit;
    lazyBundles?: BudgetLimit;
  };
  groups?: RuntimePolicyGroup[];
  preloadGroups?: Record<string, BudgetLimit>;
  lazyGroups?: Record<string, BudgetLimit>;
  preloadClassification?: PreloadClassificationPolicy;
  startupGroups?: AssetClassGroup[];
  lazyClassifications?: AssetClassGroup[];
}

interface RuntimePolicyGroup extends BudgetLimit {
  name: string;
  include: string[];
}

interface AssetClassGroup extends BudgetLimit {
  name: string;
  include: string[];
  description?: string;
}

interface PreloadClassificationPolicy {
  requireStartupGroupMatch?: boolean;
  requireLazyGroupMatch?: boolean;
  requireDynamicPreloadGroupBudgets?: boolean;
  requireDynamicLazyGroupBudgets?: boolean;
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

interface RuntimeGroupReport {
  name: string;
  include: string[];
  files: FileEntry[];
  totalBytes: number;
  budget: BudgetLimit;
}

interface ClassifiedGroupReport extends RuntimeGroupReport {
  description?: string;
}

interface ClassifiedFiles {
  groups: ClassifiedGroupReport[];
  unclassified: FileEntry[];
  assignments: Map<string, string>;
}

const MIB = 1024 * 1024;
const DEFAULT_POLICY_PATH = "config/asset-policy.json";
const DEFAULT_REPORT_PATH = "artifacts/asset-budget-report.json";
const DEFAULT_RUNTIME_BUDGET: BudgetLimit = {
  maxTotalBytes: 100 * MIB,
  maxFileBytes: 5 * MIB,
  maxFiles: 500
};
const DEFAULT_PRELOAD_BUDGET: BudgetLimit = {
  maxTotalBytes: 55 * MIB,
  maxFiles: 60
};
const DEFAULT_LAZY_BUDGET: BudgetLimit = {
  maxTotalBytes: 8 * MIB,
  maxFileBytes: 2 * MIB,
  maxFiles: 16
};

const options = parseArgs(process.argv.slice(2));
const policyPath = policyPathOption();
const policy = policyPath ? readAssetPolicy(policyPath) : {};
const root = stringOption("root") ?? policy.root ?? "public";
const preloadEntry = stringOption("preload-entry") ?? policy.preloadEntry ?? null;
const runtimeBudget = budgetWithOverrides(policy.budgets?.runtime, DEFAULT_RUNTIME_BUDGET, {
  maxTotalBytes: "max-total-bytes",
  maxFileBytes: "max-file-bytes",
  maxFiles: "max-files"
});
const startupPreloadBudget = budgetWithOverrides(policy.budgets?.startupPreload, DEFAULT_PRELOAD_BUDGET, {
  maxTotalBytes: "max-preload-bytes",
  maxFileBytes: "max-preload-file-bytes",
  maxFiles: "max-preload-files"
});
const lazyBundleBudget = budgetWithOverrides(policy.budgets?.lazyBundles, DEFAULT_LAZY_BUDGET, {
  maxTotalBytes: "max-lazy-bytes",
  maxFileBytes: "max-lazy-file-bytes",
  maxFiles: "max-lazy-files"
});
const reportPath = reportPathOption();

const files = listFiles(root).sort((a, b) => b.bytes - a.bytes);
const totalBytes = sumBytes(files);
const preload = preloadEntry ? preloadBudget(preloadEntry, root) : null;
const lazyFiles = preload ? uniqueFiles(preload.lazy.flatMap((group) => group.files)) : [];
const lazyTotalBytes = sumBytes(lazyFiles);
const runtimeGroups = runtimePolicyGroups(policy).map((group) => runtimeGroupReport(group, files));
const startupClassGroups = assetClassGroups(policy.startupGroups);
const lazyClassGroups = assetClassGroups(policy.lazyClassifications);
const startupClassification = preload ? classifyFiles(preload.files, startupClassGroups) : null;
const lazyClassification = preload ? classifyFiles(lazyFiles, lazyClassGroups) : null;
const failures: string[] = [];

enforceBudget("runtime assets", files, runtimeBudget, failures);
for (const group of runtimeGroups) enforceBudget(`runtime group "${group.name}"`, group.files, group.budget, failures);

if (preload) {
  enforceBudget("startup preload assets", preload.files, startupPreloadBudget, failures);
  enforceBudget("lazy bundle assets", lazyFiles, lazyBundleBudget, failures);
  if (startupClassification) {
    for (const group of startupClassification.groups) enforceBudget(`startup preload class "${group.name}"`, group.files, group.budget, failures);
    if (shouldRequireStartupClassification(policy, startupClassGroups)) {
      for (const file of startupClassification.unclassified) failures.push(`unclassified startup preload asset: ${file.path}`);
    }
  }
  if (lazyClassification) {
    for (const group of lazyClassification.groups) enforceBudget(`lazy asset class "${group.name}"`, group.files, group.budget, failures);
    if (shouldRequireLazyClassification(policy, lazyClassGroups)) {
      for (const file of lazyClassification.unclassified) failures.push(`unclassified lazy asset: ${file.path}`);
    }
  }
  for (const path of preload.missing) failures.push(`startup preload asset missing: ${path}`);
  for (const group of preload.dynamic) {
    if (policy.preloadClassification?.requireDynamicPreloadGroupBudgets === true && !budgetForLabel(group.label, policy.preloadGroups)) {
      failures.push(`startup preload dynamic group missing policy budget: ${group.label}`);
    }
    enforcePreloadGroupBudget("startup preload group", group, policy.preloadGroups, failures);
  }
  for (const group of preload.lazy) {
    for (const path of group.missing) failures.push(`lazy asset missing: ${path} (${group.label})`);
    if (policy.preloadClassification?.requireDynamicLazyGroupBudgets === true && !budgetForLabel(group.label, policy.lazyGroups)) {
      failures.push(`lazy dynamic group missing policy budget: ${group.label}`);
    }
    enforcePreloadGroupBudget("lazy bundle group", group, policy.lazyGroups, failures);
  }
}

const report = {
  policy: policyPath
    ? {
        path: policyPath,
        schemaVersion: policy.schemaVersion ?? null,
        policyVersion: policy.policyVersion ?? null
      }
    : null,
  status: failures.length > 0 ? "fail" : "pass",
  failures,
  root,
  files: files.length,
  totalBytes,
  totalMiB: roundMiB(totalBytes),
  maxTotalMiB: roundOptionalMiB(runtimeBudget.maxTotalBytes),
  maxFileMiB: roundOptionalMiB(runtimeBudget.maxFileBytes),
  maxFiles: runtimeBudget.maxFiles,
  largest: files.slice(0, 12).map(fileReport),
  groups: runtimeGroups.map((group) => ({
    name: group.name,
    include: group.include,
    files: group.files.length,
    totalBytes: group.totalBytes,
    totalMiB: roundMiB(group.totalBytes),
    budget: budgetReport(group.budget),
    largest: group.files.slice(0, 8).map(fileReport)
  })),
  preload: preload
    ? {
        entry: preloadEntry,
        files: preload.files.length,
        totalBytes: preload.totalBytes,
        totalMiB: roundMiB(preload.totalBytes),
        budget: budgetReport(startupPreloadBudget),
        maxTotalMiB: roundOptionalMiB(startupPreloadBudget.maxTotalBytes),
        maxFiles: startupPreloadBudget.maxFiles,
        literal: {
          files: preload.literalFiles.length,
          totalBytes: sumBytes(preload.literalFiles),
          totalMiB: roundMiB(sumBytes(preload.literalFiles))
        },
        dynamic: {
          files: preload.dynamicFiles.length,
          totalBytes: sumBytes(preload.dynamicFiles),
          totalMiB: roundMiB(sumBytes(preload.dynamicFiles)),
          groups: preload.dynamic.map((group) => preloadGroupReport(group, policy.preloadGroups))
        },
        startupGroups: startupClassification
          ? startupClassification.groups.map((group) => classifiedGroupReport(group))
          : [],
        unclassifiedStartup: startupClassification ? startupClassification.unclassified.map(fileReport) : [],
        lazy: {
          files: lazyFiles.length,
          totalBytes: lazyTotalBytes,
          totalMiB: roundMiB(lazyTotalBytes),
          budget: budgetReport(lazyBundleBudget),
          headroomMiB:
            lazyBundleBudget.maxTotalBytes === undefined ? null : roundMiB(lazyBundleBudget.maxTotalBytes - lazyTotalBytes),
          overByMiB:
            lazyBundleBudget.maxTotalBytes === undefined
              ? null
              : roundMiB(Math.max(0, lazyTotalBytes - lazyBundleBudget.maxTotalBytes)),
          fileHeadroom: lazyBundleBudget.maxFiles === undefined ? null : lazyBundleBudget.maxFiles - lazyFiles.length,
          groups: preload.lazy.map((group) => preloadGroupReport(group, policy.lazyGroups)),
          classificationGroups: lazyClassification ? lazyClassification.groups.map((group) => classifiedGroupReport(group)) : [],
          unclassified: lazyClassification ? lazyClassification.unclassified.map(fileReport) : []
        },
        missing: preload.missing,
        headroomMiB:
          startupPreloadBudget.maxTotalBytes === undefined ? null : roundMiB(startupPreloadBudget.maxTotalBytes - preload.totalBytes),
        overByMiB:
          startupPreloadBudget.maxTotalBytes === undefined
            ? null
            : roundMiB(Math.max(0, preload.totalBytes - startupPreloadBudget.maxTotalBytes)),
        fileHeadroom: startupPreloadBudget.maxFiles === undefined ? null : startupPreloadBudget.maxFiles - preload.files.length,
        largest: preload.files.slice(0, 12).map(fileReport),
        preloadCandidates: preloadCandidates(preload, startupClassification)
          .slice(0, 12)
          .map((file) => ({ path: file.path, group: file.group, bytes: file.bytes, mib: roundMiB(file.bytes) }))
      }
    : undefined
};
const reportJson = JSON.stringify(report, null, 2);
console.log(reportJson);

if (reportPath) {
  writeJsonReport(reportPath, reportJson);
  console.error(`Wrote asset budget report: ${reportPath}`);
}

if (failures.length > 0) {
  console.error("Asset budget failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  if (preload) {
    console.error(
      `Preload budget: ${roundMiB(preload.totalBytes)} MiB across ${preload.files.length} files ` +
        `(cap ${roundOptionalMiB(startupPreloadBudget.maxTotalBytes)} MiB / ${startupPreloadBudget.maxFiles ?? "unlimited"} files).`
    );
    const candidates = preloadCandidates(preload, startupClassification).slice(0, 8);
    if (candidates.length > 0) {
      console.error("Largest preload candidates to lazy-load or split:");
      for (const file of candidates) console.error(`  - ${file.path} ${roundMiB(file.bytes)} MiB (${file.group})`);
    }
  }
  process.exit(1);
}

function preloadCandidates(preload: PreloadBudget, classification: ClassifiedFiles | null): Array<FileEntry & { group: string }> {
  const dynamicGroups = new Map<string, string>();
  for (const group of preload.dynamic) {
    for (const file of group.files) dynamicGroups.set(file.path, group.label);
  }
  return preload.files
    .map((file) => ({ ...file, group: classification?.assignments.get(file.path) ?? dynamicGroups.get(file.path) ?? "literal preload" }))
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
  // Only count loads whose key AND path are plain string literals: the
  // statically-known preload set. Dynamic preload loops are handled explicitly.
  for (const match of source.matchAll(/\bthis\.load\.(?:image|spritesheet|audio)\(\s*["'][^"']*["']\s*,\s*["']([^"']+)["']/g)) {
    const path = match[1];
    if (path) literalAssetPaths.add(path);
  }
  for (const path of runtimeImageAssetPaths(source, ["startup"])) literalAssetPaths.add(path);
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
  const northwoodSpritePaths = hasNorthwoodSpritePreloadLoop(source) ? northwoodSpritePreloadPaths(source) : [];
  if (northwoodSpritePaths.length > 0) groups.push(preloadGroup("NORTHWOOD_SPRITE_IDS sprite loop", northwoodSpritePaths, rootDir));

  const generatedStagePaths = hasGeneratedStagePreloadLoop(source) ? generatedStagePublicPaths(entry, source) : [];
  if (generatedStagePaths.length > 0) groups.push(preloadGroup("GENERATED_STAGES tileset.publicPath loop", generatedStagePaths, rootDir));

  return groups;
}

function lazyAssetGroups(entry: string, source: string, rootDir: string): PreloadGroup[] {
  const groups: PreloadGroup[] = [];
  const generatedStagePaths = hasGeneratedStageLazyLoader(source) ? generatedStagePublicPaths(entry, source) : [];
  if (generatedStagePaths.length > 0) groups.push(preloadGroup("lazy generated stage tilesets", generatedStagePaths, rootDir));
  const woodlandActorPaths = hasWoodlandBespokeLazyLoop(source) ? woodlandBespokeLazyPaths(source) : [];
  if (woodlandActorPaths.length > 0) groups.push(preloadGroup("WOODLAND_BESPOKE_FAMILIES actor sheet loop", woodlandActorPaths, rootDir));
  const runtimeLazyImagePaths = uniqueStrings([...runtimeImageAssetPaths(source, ["play-context", "background"]), ...northwoodSpriteLazyPaths(source)]);
  if (runtimeLazyImagePaths.length > 0) groups.push(preloadGroup("runtime image play-context/background assets", runtimeLazyImagePaths, rootDir));
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

function hasNorthwoodSpritePreloadLoop(source: string): boolean {
  return /\bthis\.load\.image\(\s*`spriteNw\$\{String\(id\)\.padStart\(3,\s*["']0["']\)\}`/.test(source);
}

function northwoodSpriteLazyPaths(source: string): string[] {
  if (!/\bGENERATED_STAGE_DIRECT_IMAGE_ASSETS_BY_FLOOR\b/.test(source)) return [];
  if (!/\bNORTHWOOD_SPRITE_IDS\.map\b/.test(source)) return [];
  return northwoodSpritePreloadPaths(source);
}

function hasWoodlandBespokeLazyLoop(source: string): boolean {
  return /\bWOODLAND_BESPOKE_FAMILIES\b/.test(source) && /\bwoodlandBespokeRuntimeAsset\b/.test(source);
}

function woodlandBespokeLazyPaths(source: string): string[] {
  const familiesSource = source.match(/\bconst\s+WOODLAND_BESPOKE_FAMILIES\s*=\s*\[([^\]]*)\]\s*as\s+const\b/s)?.[1];
  if (!familiesSource) return [];
  return [...familiesSource.matchAll(/["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((family): family is string => Boolean(family))
    .map((family) => `/${family.replace(/_/g, "-")}-sheet.png`);
}

function hasGeneratedStagePreloadLoop(source: string): boolean {
  return /\bthis\.load\.image\(\s*generatedTilesetTextureKey\(\s*stage\s*,\s*tileset\.name\s*\)\s*,\s*tileset\.publicPath\s*\)/.test(source);
}

function hasGeneratedStageLazyLoader(source: string): boolean {
  return /\bfunction\s+ensureGeneratedStageAssetsLoaded\b/.test(source);
}

function runtimeImageAssetPaths(source: string, tiers: string[]): string[] {
  const tierSet = new Set(tiers);
  const paths = new Set<string>();
  for (const match of source.matchAll(/\bruntimeImageAsset\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g)) {
    const path = match[1];
    const tier = match[2];
    if (path && tier && tierSet.has(tier)) paths.add(path);
  }
  return [...paths].sort();
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

function enforceBudget(label: string, budgetedFiles: FileEntry[], budget: BudgetLimit, failures: string[]): void {
  const total = sumBytes(budgetedFiles);
  if (budget.maxTotalBytes !== undefined && total > budget.maxTotalBytes) {
    failures.push(`${label} total ${total} > ${budget.maxTotalBytes}`);
  }
  if (budget.maxFiles !== undefined && budgetedFiles.length > budget.maxFiles) {
    failures.push(`${label} file count ${budgetedFiles.length} > ${budget.maxFiles}`);
  }
  if (budget.maxFileBytes === undefined) return;
  for (const file of budgetedFiles) {
    if (file.bytes > budget.maxFileBytes) failures.push(`${label} file ${file.path} ${file.bytes} > ${budget.maxFileBytes}`);
  }
}

function enforcePreloadGroupBudget(
  labelPrefix: string,
  group: PreloadGroup,
  budgets: Record<string, BudgetLimit> | undefined,
  failures: string[]
): void {
  const budget = budgetForLabel(group.label, budgets);
  if (!budget) return;
  enforceBudget(`${labelPrefix} "${group.label}"`, group.files, budget, failures);
}

function budgetForLabel(label: string, budgets: Record<string, BudgetLimit> | undefined): BudgetLimit | null {
  const budget = budgets?.[label] ?? budgets?.["*"];
  return budget ? normalizeBudget(budget) : null;
}

function runtimePolicyGroups(activePolicy: AssetPolicy): RuntimePolicyGroup[] {
  return (activePolicy.groups ?? []).filter((group) => group.name.length > 0 && Array.isArray(group.include) && group.include.length > 0);
}

function assetClassGroups(groups: AssetClassGroup[] | undefined): AssetClassGroup[] {
  return (groups ?? []).filter((group) => group.name.length > 0 && Array.isArray(group.include) && group.include.length > 0);
}

function runtimeGroupReport(group: RuntimePolicyGroup, allFiles: FileEntry[]): RuntimeGroupReport {
  const groupFiles = allFiles.filter((file) => group.include.some((pattern) => matchesPattern(file.path, pattern)));
  return {
    name: group.name,
    include: group.include,
    files: groupFiles,
    totalBytes: sumBytes(groupFiles),
    budget: normalizeBudget(group)
  };
}

function classifyFiles(assetFiles: FileEntry[], groups: AssetClassGroup[]): ClassifiedFiles {
  const groupFiles = new Map<string, FileEntry[]>();
  const assignments = new Map<string, string>();
  const unclassified: FileEntry[] = [];

  for (const group of groups) groupFiles.set(group.name, []);

  for (const file of assetFiles) {
    const group = groups.find((candidate) => candidate.include.some((pattern) => matchesPattern(file.path, pattern)));
    if (!group) {
      unclassified.push(file);
      continue;
    }
    groupFiles.get(group.name)?.push(file);
    assignments.set(file.path, group.name);
  }

  return {
    groups: groups.map((group) => {
      const filesForGroup = (groupFiles.get(group.name) ?? []).sort((a, b) => b.bytes - a.bytes);
      return {
        name: group.name,
        description: group.description,
        include: group.include,
        files: filesForGroup,
        totalBytes: sumBytes(filesForGroup),
        budget: normalizeBudget(group)
      };
    }),
    unclassified: unclassified.sort((a, b) => b.bytes - a.bytes),
    assignments
  };
}

function shouldRequireStartupClassification(activePolicy: AssetPolicy, groups: AssetClassGroup[]): boolean {
  return activePolicy.preloadClassification?.requireStartupGroupMatch === true || groups.length > 0;
}

function shouldRequireLazyClassification(activePolicy: AssetPolicy, groups: AssetClassGroup[]): boolean {
  return activePolicy.preloadClassification?.requireLazyGroupMatch === true || groups.length > 0;
}

function matchesPattern(path: string, pattern: string): boolean {
  if (!pattern.includes("*")) return path === pattern || path.startsWith(pattern.endsWith("/") ? pattern : `${pattern}/`);
  const doubleStarToken = "__DOUBLE_STAR__";
  const singleStarToken = "__SINGLE_STAR__";
  const tokenized = pattern.replace(/\*\*/g, doubleStarToken).replace(/\*/g, singleStarToken);
  const escaped = tokenized.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regex = `^${escaped.replaceAll(doubleStarToken, ".*").replaceAll(singleStarToken, "[^/]*")}$`;
  return new RegExp(regex).test(path);
}

function budgetWithOverrides(policyBudget: BudgetLimit | undefined, fallback: BudgetLimit, flags: Record<keyof BudgetLimit, string>): BudgetLimit {
  const budget = { ...fallback, ...normalizeBudget(policyBudget) };
  const maxTotalBytes = optionNumber(flags.maxTotalBytes);
  const maxFileBytes = optionNumber(flags.maxFileBytes);
  const maxFiles = optionNumber(flags.maxFiles);
  if (maxTotalBytes !== null) budget.maxTotalBytes = maxTotalBytes;
  if (maxFileBytes !== null) budget.maxFileBytes = maxFileBytes;
  if (maxFiles !== null) budget.maxFiles = maxFiles;
  return budget;
}

function normalizeBudget(budget: BudgetLimit | undefined): BudgetLimit {
  const normalized: BudgetLimit = {};
  const maxTotalBytes = positiveNumber(budget?.maxTotalBytes);
  const maxFileBytes = positiveNumber(budget?.maxFileBytes);
  const maxFiles = positiveNumber(budget?.maxFiles);
  if (maxTotalBytes !== null) normalized.maxTotalBytes = maxTotalBytes;
  if (maxFileBytes !== null) normalized.maxFileBytes = maxFileBytes;
  if (maxFiles !== null) normalized.maxFiles = maxFiles;
  return normalized;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function readAssetPolicy(path: string): AssetPolicy {
  return JSON.parse(readFileSync(path, "utf8")) as AssetPolicy;
}

function policyPathOption(): string | null {
  const explicit = stringOption("policy");
  if (explicit) return explicit;
  if (options["no-policy"] === true) return null;
  return existsSync(DEFAULT_POLICY_PATH) ? DEFAULT_POLICY_PATH : null;
}

function reportPathOption(): string | null {
  const explicit = stringOption("report-path");
  if (explicit) return explicit;
  const report = options.report;
  if (typeof report === "string") return report;
  return report === true ? DEFAULT_REPORT_PATH : null;
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

function optionNumber(name: string): number | null {
  const raw = options[name];
  if (typeof raw !== "string") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function stringOption(name: string): string | null {
  const raw = options[name];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function fileReport(file: FileEntry): FileEntry & { mib: number } {
  return { ...file, mib: roundMiB(file.bytes) };
}

function preloadGroupReport(group: PreloadGroup, budgets: Record<string, BudgetLimit> | undefined) {
  const budget = budgetForLabel(group.label, budgets) ?? {};
  return {
    label: group.label,
    files: group.files.length,
    totalBytes: group.totalBytes,
    totalMiB: roundMiB(group.totalBytes),
    budget: budgetReport(budget),
    headroomMiB: budget.maxTotalBytes === undefined ? null : roundMiB(budget.maxTotalBytes - group.totalBytes),
    overByMiB: budget.maxTotalBytes === undefined ? null : roundMiB(Math.max(0, group.totalBytes - budget.maxTotalBytes)),
    fileHeadroom: budget.maxFiles === undefined ? null : budget.maxFiles - group.files.length,
    largest: group.files.slice(0, 8).map(fileReport),
    missing: group.missing
  };
}

function classifiedGroupReport(group: ClassifiedGroupReport) {
  return {
    name: group.name,
    description: group.description,
    include: group.include,
    files: group.files.length,
    totalBytes: group.totalBytes,
    totalMiB: roundMiB(group.totalBytes),
    budget: budgetReport(group.budget),
    largest: group.files.slice(0, 8).map(fileReport)
  };
}

function budgetReport(budget: BudgetLimit) {
  return {
    maxTotalBytes: budget.maxTotalBytes,
    maxTotalMiB: roundOptionalMiB(budget.maxTotalBytes),
    maxFileBytes: budget.maxFileBytes,
    maxFileMiB: roundOptionalMiB(budget.maxFileBytes),
    maxFiles: budget.maxFiles
  };
}

function writeJsonReport(path: string, json: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${json}\n`);
}

function uniqueFiles(assetFiles: FileEntry[]): FileEntry[] {
  const byPath = new Map<string, FileEntry>();
  for (const file of assetFiles) byPath.set(file.path, file);
  return [...byPath.values()].sort((a, b) => b.bytes - a.bytes);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function roundMiB(bytes: number): number {
  return Math.round((bytes / MIB) * 100) / 100;
}

function roundOptionalMiB(bytes: number | undefined): number | null {
  return bytes === undefined ? null : roundMiB(bytes);
}

function sumBytes(assetFiles: FileEntry[]): number {
  return assetFiles.reduce((sum, file) => sum + file.bytes, 0);
}
