import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface StageTilesetRef {
  name: string;
  image: string;
  manifest: string;
}

interface StageObject {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  blocking: boolean;
  tile?: string;
  resource?: { kind: string; tx: number; ty: number };
}

interface AssetForgeStage {
  schema: "asset-forge/stage@1";
  name: string;
  tileSize: number;
  cols: number;
  rows: number;
  tilesets: StageTilesetRef[];
  layers: Array<{ name: string; type: "tile"; data: Array<Array<string | null>> }>;
  collision: number[][];
  objects: StageObject[];
  ascii?: { legend?: Record<string, string>; rows?: string[] };
}

interface VocabTile {
  role: string;
  blocked: boolean;
  sightBlocked: boolean;
  road?: boolean;
  textureKey?: string;
  minimapColor?: string;
}

interface Vocab {
  zone: string;
  floor: number;
  stageName?: string;
  requiredPortals?: Record<string, { x: number; y: number; to?: string }>;
  requiredWalkable?: Array<{ x: number; y: number; label?: string }>;
  chars: Record<string, VocabTile>;
}

interface Args {
  stage: string;
  vocab: string;
  out: string;
  publicDir?: string;
  check: boolean;
}

function usage(): never {
  throw new Error(
    "Usage: node tools/import-asset-forge-stage.ts --stage <stage.json> --vocab <zone.vocab.json> --out <src/generated/stages/zone.ts> [--public-dir <public/tilesets/zone>]"
  );
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--check") {
      args.check = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || !flag.startsWith("--")) usage();
    i += 1;
    if (flag === "--stage") args.stage = value;
    else if (flag === "--vocab") args.vocab = value;
    else if (flag === "--out") args.out = value;
    else if (flag === "--public-dir") args.publicDir = value;
    else usage();
  }
  if (!args.stage || !args.vocab || !args.out) usage();
  return args as Args;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateStage(stage: AssetForgeStage, vocab: Vocab): void {
  assert(stage.schema === "asset-forge/stage@1", `Unsupported stage schema: ${stage.schema}`);
  assert(!vocab.stageName || stage.name === vocab.stageName, `Expected stage '${vocab.stageName}', got '${stage.name}'`);
  assert(stage.ascii?.rows?.length === stage.rows, `Stage ascii rows must have ${stage.rows} rows`);
  assert(stage.collision.length === stage.rows, `Collision grid must have ${stage.rows} rows`);
  assert(stage.layers.length > 0, "Stage must include at least one tile layer");
  for (const layer of stage.layers) {
    assert(layer.type === "tile", `Layer '${layer.name}' must be a tile layer`);
    assert(layer.data.length === stage.rows, `Layer '${layer.name}' must have ${stage.rows} rows`);
  }

  for (let y = 0; y < stage.rows; y += 1) {
    const row = stage.ascii?.rows?.[y] ?? "";
    assert(row.length === stage.cols, `ASCII row ${y} must be ${stage.cols} chars, got ${row.length}`);
    assert(stage.collision[y]?.length === stage.cols, `Collision row ${y} must be ${stage.cols} cells`);
    for (const layer of stage.layers) {
      assert(layer.data[y]?.length === stage.cols, `Layer '${layer.name}' row ${y} must be ${stage.cols} cells`);
    }
    for (let x = 0; x < row.length; x += 1) {
      const char = row[x] ?? "";
      const tile = vocab.chars[char];
      assert(tile, `Missing vocab entry for char '${char}'`);
      assert(stage.collision[y]?.[x] === (tile.blocked ? 1 : 0), `Collision at ${x},${y} for '${char}' must match vocab blocked=${tile.blocked}`);
      const ref = stage.ascii?.legend?.[char];
      assert(ref, `Missing ASCII legend ref for char '${char}'`);
      const renderedRefs = stage.layers.map((layer) => layer.data[y]?.[x]).filter((cell): cell is string => Boolean(cell));
      assert(renderedRefs.length > 0, `No layer ref at ${x},${y} for '${char}'`);
      assert(renderedRefs.includes(ref) || char === "f", `Layer refs at ${x},${y} for '${char}' must include '${ref}', got '${renderedRefs.join(",")}'`);
    }
  }

  for (const [char, portal] of Object.entries(vocab.requiredPortals ?? {})) {
    const actual = stage.ascii?.rows?.[portal.y]?.[portal.x];
    assert(actual === char, `Portal '${char}' expected at ${portal.x},${portal.y}, got '${actual ?? "missing"}'`);
    assert(stage.collision[portal.y]?.[portal.x] === 0, `Portal '${char}' at ${portal.x},${portal.y} is blocked`);
  }

  for (const point of vocab.requiredWalkable ?? []) {
    assert(stage.collision[point.y]?.[point.x] === 0, `Required walkable tile '${point.label ?? `${point.x},${point.y}`}' is blocked`);
  }

  const tilesetsByName = new Map(stage.tilesets.map((tileset) => [tileset.name, tileset]));
  for (const [char, ref] of Object.entries(stage.ascii?.legend ?? {})) {
    assert(vocab.chars[char], `Legend contains char '${char}' that is not in vocab`);
    const [tilesetName, index] = ref.split(":");
    assert(tilesetName && index !== undefined, `Legend ref '${ref}' for '${char}' must be '<tileset>:<index>'`);
    assert(tilesetsByName.has(tilesetName), `Legend ref '${ref}' for '${char}' points at an unknown tileset`);
    assert(Number.isInteger(Number(index)), `Legend ref '${ref}' for '${char}' must use a numeric tile index`);
  }
}

function copyTilesets(stageFile: string, stage: AssetForgeStage, publicDir?: string, check = false): Array<StageTilesetRef & { publicPath?: string }> {
  if (!publicDir) return stage.tilesets;
  if (!check) mkdirSync(publicDir, { recursive: true });
  const stageDir = path.dirname(stageFile);
  return stage.tilesets.map((tileset) => {
    const from = path.join(stageDir, tileset.image);
    const to = path.join(publicDir, path.basename(tileset.image));
    if (check) {
      assert(existsSync(to), `${to} is missing. Run npm run assets:stage:northwood.`);
      assert(readFileSync(from).equals(readFileSync(to)), `${to} is stale. Run npm run assets:stage:northwood.`);
    } else {
      copyFileSync(from, to);
    }
    return { ...tileset, publicPath: `/${path.posix.join(path.basename(path.dirname(publicDir)), path.basename(publicDir), path.basename(tileset.image))}` };
  });
}

function generatedModuleSource(stage: AssetForgeStage, vocab: Vocab, tilesets: Array<StageTilesetRef & { publicPath?: string }>): string {
  const rows = stage.ascii?.rows ?? [];
  const legend = stage.ascii?.legend ?? {};
  const tiles = Object.fromEntries(
    Object.entries(vocab.chars).map(([char, tile]) => [
      char,
      {
        char,
        ref: legend[char] ?? "empty",
        role: tile.role,
        blocked: tile.blocked,
        sightBlocked: tile.sightBlocked,
        road: Boolean(tile.road),
        textureKey: tile.textureKey,
        minimapColor: tile.minimapColor
      }
    ])
  );
  // strip any non-schema (preview-only) object fields so `satisfies GeneratedStage` holds
  const objects = stage.objects.map((o) => ({
    key: o.key, x: o.x, y: o.y, w: o.w, h: o.h, blocking: o.blocking,
    ...(o.tile !== undefined ? { tile: o.tile } : {}),
    ...(o.resource !== undefined ? { resource: o.resource } : {}),
  }));
  const exportName = `${vocab.zone.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_STAGE`;
  return `// Generated by tools/import-asset-forge-stage.ts. Do not edit by hand.
import type { GeneratedStage } from "./types.ts";

export const ${exportName} = ${JSON.stringify(
    {
      schema: "tib/generated-stage@1",
      sourceSchema: stage.schema,
      zone: vocab.zone,
      floor: vocab.floor,
      cols: stage.cols,
      rows,
      tileSize: stage.tileSize,
      tilesets,
      layers: stage.layers,
      legend,
      tiles,
      collision: stage.collision,
      objects
    },
    null,
    2
  )} as const satisfies GeneratedStage;
`;
}

function writeGeneratedModule(stage: AssetForgeStage, vocab: Vocab, tilesets: Array<StageTilesetRef & { publicPath?: string }>, outFile: string, check: boolean): void {
  const module = generatedModuleSource(stage, vocab, tilesets);
  if (check) {
    const existing = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
    assert(existing === module, `${outFile} is stale. Run npm run assets:stage:northwood.`);
    return;
  }
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, module);
}

const args = parseArgs(process.argv.slice(2));
const stage = readJson<AssetForgeStage>(args.stage);
const vocab = readJson<Vocab>(args.vocab);
validateStage(stage, vocab);
const tilesets = copyTilesets(args.stage, stage, args.publicDir, args.check);
writeGeneratedModule(stage, vocab, tilesets, args.out, args.check);
console.log(`${args.check ? "Checked" : "Imported"} ${vocab.zone} floor ${vocab.floor}: ${stage.cols}x${stage.rows} -> ${args.out}`);
