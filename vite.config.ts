import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import yaml from "js-yaml";

// Dev-only HTTP API backing the tile editor (/editor.html). Reads an asset-forge
// stage source, applies hand-painted cell patches + any newly minted roster tiles,
// then re-runs ONLY that stage's import step so the live game hot-reloads. The
// bridge (build-*-from-authored) is deliberately NOT run — the editor is the
// authoritative hand-tuning layer on top of the auto-generated layout.
//
// The editor is stage-agnostic: every stage with an `assets:stage:<name>` script
// in package.json is editable. Each stage's atlas, columns, dimensions and paths
// are read from its own stage.json + tileset manifest, so nothing here is wired
// to a single region.
const ROOT = process.cwd();

function readJson(rel: string): any {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
}
function writeJson(rel: string, value: unknown): void {
  writeFileSync(path.join(ROOT, rel), JSON.stringify(value, null, 2) + "\n");
}
function readYaml(rel: string): any {
  return yaml.load(readFileSync(path.join(ROOT, rel), "utf8"));
}

// --- Decoration sprite catalogue --------------------------------------------
// Object/prop sprites are individual PNGs under public/, referenced by the stage
// objects' `key` and loaded client-side by main.ts. The editor's Decorations
// layer wants (a) a thumbnail URL per key and (b) the full set of placeable
// sprites for a stage, so it can show a picker and place props the stage doesn't
// yet use. Northwood props are obj_<NNN>.png under /sprites/nw (key spriteNw<NNN>);
// extend the table as other stages gain prop catalogues. Bespoke one-off keys
// (e.g. waystone structures) have no generic mapping — they degrade to no
// thumbnail + in-stage-only (still placeable).
interface SpriteDir { test: RegExp; dir: string; file: (digits: string) => string; key: (digits: string) => string; scan: RegExp }
const SPRITE_DIRS: SpriteDir[] = [
  { test: /^spriteNw(\d+)$/, dir: "public/sprites/nw", file: (d) => `obj_${d}.png`, key: (d) => `spriteNw${d}`, scan: /^obj_(\d+)\.png$/ }
];
function spriteUrlForKey(key: string): string | null {
  for (const s of SPRITE_DIRS) {
    const m = s.test.exec(key);
    if (m) {
      const rel = `${s.dir}/${s.file(m[1]!)}`;
      return existsSync(path.join(ROOT, rel)) ? "/" + rel.replace(/^public\//, "") : null;
    }
  }
  return null;
}
// Intrinsic PNG pixel size, straight from the IHDR header (no decode).
function pngSize(absPath: string): { w: number; h: number } | null {
  try {
    const b = readFileSync(absPath);
    if (b.length < 24) return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch {
    return null;
  }
}
const median = (xs: number[]): number => {
  if (!xs.length) return 0.23; // sensible default game/source scale for nw props
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
function buildDecoCatalog(stage: any): Array<{ value: string; label: string; url: string | null; fields: any }> {
  // In-stage non-resource props record their ACTUAL game-render w/h + blocking.
  const inStage = new Map<string, { w: number; h: number; blocking: boolean }>();
  for (const o of stage.objects ?? []) {
    if (o.resource || inStage.has(o.key)) continue;
    inStage.set(o.key, { w: o.w, h: o.h, blocking: !!o.blocking });
  }
  const pngOf = (key: string) => {
    const url = spriteUrlForKey(key);
    return url ? pngSize(path.join(ROOT, "public", url.slice(1))) : null;
  };
  // The game downscales source art; learn the factor from in-stage instances so
  // catalogue-only sprites get plausibly-sized (not giant) defaults.
  const rW: number[] = [], rH: number[] = [];
  for (const [k, v] of inStage) {
    const sz = pngOf(k);
    if (sz) { rW.push(v.w / sz.w); rH.push(v.h / sz.h); }
  }
  const ratioW = median(rW), ratioH = median(rH);
  // Full catalogue = in-stage keys ∪ every sprite in a matching sprite dir.
  const keys = new Set(inStage.keys());
  for (const s of SPRITE_DIRS) {
    if (![...keys].some((k) => s.test.test(k))) continue; // only scan dirs this stage actually uses
    try {
      for (const f of readdirSync(path.join(ROOT, s.dir))) {
        const m = s.scan.exec(f);
        if (m) keys.add(s.key(m[1]!));
      }
    } catch { /* dir absent — skip */ }
  }
  const out: Array<{ value: string; label: string; url: string | null; fields: any }> = [];
  for (const key of [...keys].sort()) {
    const inst = inStage.get(key);
    let w: number, h: number, blocking: boolean;
    if (inst) {
      ({ w, h, blocking } = inst);
    } else {
      const sz = pngOf(key);
      w = sz ? Math.max(8, Math.round(sz.w * ratioW)) : 32;
      h = sz ? Math.max(8, Math.round(sz.h * ratioH)) : 32;
      blocking = false;
    }
    out.push({
      value: key,
      label: `${key} (${w}×${h}${blocking ? " ⛔" : ""}${inst ? "" : " ·new"})`,
      url: spriteUrlForKey(key),
      fields: { key, w, h, blocking }
    });
  }
  return out;
}

// --- Monster & tree sprite icons (editor markers) ---------------------------
// The Spawns and Trees layers used to draw a plain ring. To show the real sprite
// instead, the editor needs — per type — the spritesheet URL plus the source
// crop of one representative frame (we use the "down"-facing walk frame 0). That
// frame geometry is the SINGLE SOURCE OF TRUTH in src/main.ts (createActorFrames
// / monsterActorSpec, and the tree makeSpriteTexture calls). This table MIRRORS
// it for the editor only and must be kept in sync if those frames move. The
// sheets are magenta-keyed; the editor strips the chroma key client-side
// (mirrors chromaKeyMagenta() in main.ts) so the markers read as clean sprites.
// sx/sy/sw/sh omitted ⇒ use the whole image (standalone prop PNGs). `tint` is a
// hex colour multiplied over the art (deeper-ore veins). `chroma:false` skips the
// magenta key for art that is already transparent (the herb PNGs).
interface SpriteIcon { url: string; sx?: number; sy?: number; sw?: number; sh?: number; tint?: string; chroma?: boolean }

// Families whose walk sheets share one layout. Mirrors WOODLAND_BESPOKE_FAMILIES
// + the new-enemies montage in src/main.ts createActorFrames.
const WOODLAND_BESPOKE_FAMILIES = [
  "dire_wolf", "orc", "ghoul", "wild_boar", "thorn_hedgehog", "forest_spider",
  "forest_slime", "mushroom_brute", "sapling_deer", "ancient_treant", "bone_druid",
  "forest_pixie", "bog_wraith", "grave_revenant", "crypt_sentinel", "pale_banshee",
  "restless_husk", "bound_wight"
];
const NEW_ENEMY_FAMILIES = [
  "canyon_scavenger", "dust_burrower", "dune_skitterer", "sun_wraith",
  "reef_prowler", "venomous_stalker", "totem_wraith"
];
// family -> down/frame-0 crop. The padded/explicit families are transcribed from
// createActorFrames (the goblin/skeleton rects include the +8 paddedSpriteFrames pad).
const MONSTER_ICON_BY_FAMILY: Record<string, SpriteIcon> = {
  goblin:       { url: "/goblin.png",             sx: 295, sy: 338, sw: 115, sh: 124 },
  skeleton:     { url: "/skeleton.png",           sx: 288, sy: 344, sw: 108, sh: 127 },
  rat:          { url: "/rat-sheet.png",          sx: 0,   sy: 192, sw: 96, sh: 96 },
  spider:       { url: "/spider-sheet.png",       sx: 0,   sy: 192, sw: 96, sh: 96 },
  goblinScout:  { url: "/goblin-scout-sheet.png", sx: 0,   sy: 586, sw: 281, sh: 293 },
  goblinShaman: { url: "/goblin-shaman-sheet.png",sx: 0,   sy: 626, sw: 313, sh: 313 },
  goblinRaider: { url: "/goblin-raider-sheet.png",sx: 0,   sy: 640, sw: 320, sh: 320 },
  greyWolf:     { url: "/grey-wolf-sheet.png",    sx: 0,   sy: 640, sw: 320, sh: 320 },
  wisp:         { url: "/wisp-sheet.png",         sx: 0,   sy: 0,   sw: 221, sh: 443 },
  skitterer:    { url: "/skitterer-spitter.png",  sx: 257, sy: 274, sw: 88,  sh: 96  },
  mire_spitter: { url: "/skitterer-spitter.png",  sx: 683, sy: 274, sw: 100, sh: 96  },
};
// Woodland bespoke: /<family-with-dashes>-sheet.png, down row = (0+2)*96, 96×96.
for (const f of WOODLAND_BESPOKE_FAMILIES) {
  MONSTER_ICON_BY_FAMILY[f] = { url: `/${f.replaceAll("_", "-")}-sheet.png`, sx: 0, sy: 192, sw: 96, sh: 96 };
}
// New-area montage families in /new-enemies.png: rows 2..8, frame0 x=0 (64×56).
NEW_ENEMY_FAMILIES.forEach((f, r) => {
  MONSTER_ICON_BY_FAMILY[f] = { url: "/new-enemies.png", sx: 0, sy: (r + 2) * 56, sw: 64, sh: 56 };
});
// monster type -> family. Mirrors monsterActorSpec() in src/main.ts; unlisted
// types fall back there to the default "goblin" family, so we do the same.
const MONSTER_FAMILY: Record<string, string> = {
  rat: "rat", spider: "spider", skeleton: "skeleton", ghoul: "ghoul", boss: "skeleton",
  orc: "orc", goblin_scout: "goblinScout", goblin_shaman: "goblinShaman", wolf: "greyWolf",
  wisp: "wisp", dire_wolf: "dire_wolf", wild_boar: "wild_boar", thorn_hedgehog: "thorn_hedgehog",
  forest_spider: "forest_spider", forest_slime: "forest_slime", mushroom_brute: "mushroom_brute",
  sapling_deer: "sapling_deer", ancient_treant: "ancient_treant", bone_druid: "bone_druid",
  forest_pixie: "forest_pixie", bog_wraith: "bog_wraith", grave_revenant: "grave_revenant",
  crypt_sentinel: "crypt_sentinel", pale_banshee: "pale_banshee",
  skitterer: "skitterer", mire_spitter: "mire_spitter", canyon_scavenger: "canyon_scavenger",
  dust_burrower: "dust_burrower", dune_skitterer: "dune_skitterer", sun_wraith: "sun_wraith",
  reef_prowler: "reef_prowler", venomous_stalker: "venomous_stalker", totem_wraith: "totem_wraith",
  reach_hen: "rat", meadow_hopper: "rat", reach_vole: "rat",
  restless_husk: "restless_husk", grave_shambler: "skeleton", bound_wight: "bound_wight",
};
function monsterIcon(type: string): SpriteIcon | null {
  return MONSTER_ICON_BY_FAMILY[MONSTER_FAMILY[type] ?? "goblin"] ?? null;
}
// Tree textureKey -> crop, off /northwood-trees-v1.png. Mirrors the spriteTree/
// spritePine makeSpriteTexture() calls in src/main.ts. Species reuse these keys.
const TREE_ICON_BY_TEXTURE: Record<string, SpriteIcon> = {
  spriteTree: { url: "/northwood-trees-v1.png", sx: 35,  sy: 55, sw: 355, sh: 385 },
  spritePine: { url: "/northwood-trees-v1.png", sx: 455, sy: 50, sw: 220, sh: 390 },
};

// Ore-vein icons off /ore-rock-gathering-nodes.png. copper/tin/iron have bespoke
// crops; deeper ores reuse the copper crop with a multiply tint — mirrors
// ORE_VEIN_TEXTURES / ORE_VEIN_TINTS + createMiningNodeView in src/main.ts.
const ORE_SHEET = "/ore-rock-gathering-nodes.png";
const ORE_VEIN_CROP: Record<string, { sx: number; sy: number }> = {
  copper: { sx: 193, sy: 107 }, tin: { sx: 193, sy: 190 }, iron: { sx: 193, sy: 273 },
};
const ORE_VEIN_TINT: Record<string, string> = {
  coal: "#4a4a52", silver: "#c8cdd4", gold: "#d4af37", mithril: "#4a6fa5", adamant: "#3f7d5a",
};
function oreIcon(kind: string): SpriteIcon {
  const crop = ORE_VEIN_CROP[kind] ?? ORE_VEIN_CROP.copper!;
  const icon: SpriteIcon = { url: ORE_SHEET, sx: crop.sx, sy: crop.sy, sw: 123, sh: 66 };
  const tint = ORE_VEIN_TINT[kind];
  if (tint) icon.tint = tint;
  return icon;
}

// Herb-node icons mirror createHerbNodeView in src/main.ts: mushroom-labelled and
// quartz (mineral) nodes are procedural with no sprite (the editor keeps a ring);
// any leveled herb shows the mire-lotus crop; "tidal" → herb-tidal; the rest →
// herb-bloom. The bloom/field per-node hash variety collapses to bloom here.
function herbIcon(label: string, requiredLevel: number): SpriteIcon | null {
  const l = (label ?? "").toLowerCase();
  if (l.includes("mushroom")) return null;
  if (requiredLevel > 0) return { url: "/swamp-tiles.png", sx: 820, sy: 388, sw: 38, sh: 36 };
  if (l.includes("tidal")) return { url: "/herb-tidal.png", chroma: false };
  if (l.includes("quartz")) return null;
  return { url: "/herb-bloom.png", chroma: false };
}

// --- Editor "Layers" feature -------------------------------------------------
// Each editable region maps to a runtime FLOOR number + a spawn ZONE id. The
// editor canvas works in tile coords (1:1 with spawns.yaml `at:` coords — all
// floors are authored at their target size, see SCALE_AUTHORED_AT_TARGET in
// build-content.ts), so a clicked cell IS the spawn tile. stage.json carries
// neither floor nor zone, so this small table is the source of truth — it
// mirrors ZONES in src/shared.ts. A stage absent here simply gets no layers.
const STAGE_META: Record<string, { floor: number; zone: string }> = {
  waystone: { floor: 0, zone: "southTown" },
  cemetery: { floor: 1, zone: "cemetery" },
  crypt: { floor: 2, zone: "crypt" },
  northwood: { floor: 3, zone: "woods" },
  northwatch: { floor: 4, zone: "northTown" },
  swamp: { floor: 5, zone: "marsh" },
  "searing-canyon": { floor: 6, zone: "badlands" },
  desert: { floor: 7, zone: "desert" },
  beach: { floor: 8, zone: "beach" },
  jungle: { floor: 9, zone: "jungle" },
  deepmine: { floor: 10, zone: "deepMine" },
  route: { floor: 11, zone: "route" }
};

const SPAWN_OVERLAY_FILE = "content/spawns.editor.yaml";
interface SpawnOverlay {
  monsters: Array<{ type: string; at: { floor: number; x: number; y: number }; zone: string }>;
  removed: Array<{ floor: number; x: number; y: number }>;
}
function readSpawnOverlay(): SpawnOverlay {
  if (!existsSync(path.join(ROOT, SPAWN_OVERLAY_FILE))) return { monsters: [], removed: [] };
  const doc = (readYaml(SPAWN_OVERLAY_FILE) as Partial<SpawnOverlay>) ?? {};
  return { monsters: doc.monsters ?? [], removed: doc.removed ?? [] };
}
// Hand-emit compact, schema-free YAML so the file stays diff-friendly and clearly
// machine-owned. Hand-authored spawns are in spawns.yaml; this file is rewritten
// wholesale by the editor on every spawn save, so it must never be hand-edited.
function writeSpawnOverlay(doc: SpawnOverlay): void {
  const lines = [
    "# AUTO-GENERATED by the stage editor's Spawns layer — DO NOT hand-edit.",
    "# Hand-authored spawns live in spawns.yaml and are never touched here.",
    "# `monsters` are editor placements; `removed` suppresses a spawns.yaml spawn",
    "# at that exact tile (a moved base spawn = one removal + one placement).",
    "# Merged with spawns.yaml at build time by scripts/build-content.ts.",
    ""
  ];
  if (doc.monsters.length) {
    lines.push("monsters:");
    for (const m of doc.monsters) {
      lines.push(`  - { type: ${m.type}, at: { floor: ${m.at.floor}, x: ${m.at.x}, y: ${m.at.y} }, zone: ${m.zone} }`);
    }
  } else {
    lines.push("monsters: []");
  }
  if (doc.removed.length) {
    lines.push("removed:");
    for (const r of doc.removed) lines.push(`  - { floor: ${r.floor}, x: ${r.x}, y: ${r.y} }`);
  } else {
    lines.push("removed: []");
  }
  writeFileSync(path.join(ROOT, SPAWN_OVERLAY_FILE), lines.join("\n") + "\n");
}

// Gathering-node layers (ore, later herbs/fishing). Unlike spawns these are flat
// arrays of nodes with a unique `id`, an `at` tile + an `approach` standing tile,
// and one discriminating field (ore→kind, herb→label). The editor writes ONLY its
// own placements + id-keyed suppressions to a `<base>.editor.yaml`; the merge lives
// in build-content.ts. One config row per node layer keeps the endpoint generic.
// `fields` are the per-node attribute keys (besides id/at/approach) the layer
// carries through the overlay — ore has just `kind`; herbs carry a label plus
// loosely-coupled level/xp/item knobs (which the editor sets from a preset).
interface NodeLayerCfg { base: string; overlay: string; fields: string[] }
const NODE_LAYERS: Record<string, NodeLayerCfg> = {
  ore: { base: "content/mining-nodes.yaml", overlay: "content/mining-nodes.editor.yaml", fields: ["kind"] },
  herbs: { base: "content/herb-nodes.yaml", overlay: "content/herb-nodes.editor.yaml", fields: ["label", "item", "requiredLevel", "xp"] }
};
interface NodeOverlay {
  nodes: Array<{ id: string; at: { floor: number; x: number; y: number }; approach: { x: number; y: number }; [k: string]: any }>;
  removed: Array<{ floor: number; id: string }>;
}
function readNodeOverlay(rel: string): NodeOverlay {
  if (!existsSync(path.join(ROOT, rel))) return { nodes: [], removed: [] };
  const doc = (yaml.load(readFileSync(path.join(ROOT, rel), "utf8")) as Partial<NodeOverlay>) ?? {};
  return { nodes: doc.nodes ?? [], removed: doc.removed ?? [] };
}
// quote a YAML scalar only when it isn't a bare token (e.g. a herb label with spaces)
const yamlScalar = (v: unknown): string =>
  typeof v === "string" && /^[A-Za-z0-9_-]+$/.test(v) ? v : JSON.stringify(v);
function writeNodeOverlay(rel: string, fields: string[], doc: NodeOverlay): void {
  const lines = [
    `# AUTO-GENERATED by the stage editor's node layer — DO NOT hand-edit.`,
    `# Hand-authored nodes live in ${path.basename(NODE_LAYERS_BY_OVERLAY[rel]?.base ?? "the base file")} and are never touched here.`,
    `# \`nodes\` are editor placements; \`removed\` suppresses a base node by id.`,
    `# Merged with the base file at build time by scripts/build-content.ts.`,
    ""
  ];
  if (doc.nodes.length) {
    lines.push("nodes:");
    for (const n of doc.nodes) {
      const parts = [`id: ${n.id}`];
      for (const f of fields) if (n[f] != null) parts.push(`${f}: ${yamlScalar(n[f])}`);
      parts.push(`at: { floor: ${n.at.floor}, x: ${n.at.x}, y: ${n.at.y} }`);
      parts.push(`approach: { x: ${n.approach.x}, y: ${n.approach.y} }`);
      lines.push(`  - { ${parts.join(", ")} }`);
    }
  } else {
    lines.push("nodes: []");
  }
  if (doc.removed.length) {
    lines.push("removed:");
    for (const r of doc.removed) lines.push(`  - { floor: ${r.floor}, id: ${r.id} }`);
  } else {
    lines.push("removed: []");
  }
  writeFileSync(path.join(ROOT, rel), lines.join("\n") + "\n");
}
const NODE_LAYERS_BY_OVERLAY: Record<string, NodeLayerCfg> = Object.fromEntries(
  Object.values(NODE_LAYERS).map((c) => [c.overlay, c])
);

// Trees layer. Woodcutting trees are authored inline in spawns.yaml `trees:`
// (type + sub-tile position, no id/approach), so — unlike the id-keyed node
// layers — the editor suppresses base trees by floor+position, mirroring the
// Spawns overlay. Its own placements + suppressions live in trees.editor.yaml.
const TREE_OVERLAY_FILE = "content/trees.editor.yaml";
interface TreeOverlay {
  trees: Array<{ type: string; at: { floor: number; x: number; y: number } }>;
  removed: Array<{ floor: number; x: number; y: number }>;
}
function readTreeOverlay(): TreeOverlay {
  if (!existsSync(path.join(ROOT, TREE_OVERLAY_FILE))) return { trees: [], removed: [] };
  const doc = (readYaml(TREE_OVERLAY_FILE) as Partial<TreeOverlay>) ?? {};
  return { trees: doc.trees ?? [], removed: doc.removed ?? [] };
}
function writeTreeOverlay(doc: TreeOverlay): void {
  const lines = [
    "# AUTO-GENERATED by the stage editor's Trees layer — DO NOT hand-edit.",
    "# Hand-authored trees live in spawns.yaml (`trees:`) and are never touched here.",
    "# `trees` are editor placements; `removed` suppresses a spawns.yaml tree at that",
    "# exact floor+position (a moved base tree = one removal + one placement).",
    "# Merged with spawns.yaml at build time by scripts/build-content.ts.",
    ""
  ];
  if (doc.trees.length) {
    lines.push("trees:");
    for (const t of doc.trees) {
      lines.push(`  - { type: ${t.type}, at: { floor: ${t.at.floor}, x: ${t.at.x}, y: ${t.at.y} } }`);
    }
  } else {
    lines.push("trees: []");
  }
  if (doc.removed.length) {
    lines.push("removed:");
    for (const r of doc.removed) lines.push(`  - { floor: ${r.floor}, x: ${r.x}, y: ${r.y} }`);
  } else {
    lines.push("removed: []");
  }
  writeFileSync(path.join(ROOT, TREE_OVERLAY_FILE), lines.join("\n") + "\n");
}

// Teleport pads (content/portals.editor.yaml). Purely editor-owned (no hand-
// authored base — legacy char-based portals live in shared.ts). Each pad: step on
// (floor,x,y) → travel to (toFloor,toX,toY). Per-floor wholesale rewrite on save.
const PORTAL_OVERLAY_FILE = "content/portals.editor.yaml";
interface PortalOverlay {
  portals: Array<{ floor: number; x: number; y: number; toFloor: number; toX: number; toY: number }>;
}
function readPortalOverlay(): PortalOverlay {
  if (!existsSync(path.join(ROOT, PORTAL_OVERLAY_FILE))) return { portals: [] };
  const doc = (readYaml(PORTAL_OVERLAY_FILE) as Partial<PortalOverlay>) ?? {};
  return { portals: doc.portals ?? [] };
}
function writePortalOverlay(doc: PortalOverlay): void {
  const lines = [
    "# AUTO-GENERATED by the stage editor's Portals layer — DO NOT hand-edit.",
    "# Each pad teleports a player who steps on (floor,x,y) to (toFloor,toX,toY).",
    "# Coords are runtime tile coords (1:1 with the editor grid). Consulted by",
    "# portalFor() in src/shared.ts, ahead of the legacy char-based portals.",
    ""
  ];
  if (doc.portals.length) {
    lines.push("portals:");
    for (const p of doc.portals) {
      lines.push(`  - { floor: ${p.floor}, x: ${p.x}, y: ${p.y}, toFloor: ${p.toFloor}, toX: ${p.toX}, toY: ${p.toY} }`);
    }
  } else {
    lines.push("portals: []");
  }
  writeFileSync(path.join(ROOT, PORTAL_OVERLAY_FILE), lines.join("\n") + "\n");
}

// A stage is editable iff it has a (non-`:check`) `assets:stage:<name>` script.
// We parse the script's own --stage/--vocab args so the source-of-truth stays in
// package.json rather than being duplicated here.
type StageDef = { name: string; stagePath: string; vocabPath: string; script: string };
function discoverStages(): Map<string, StageDef> {
  const pkg = readJson("package.json");
  const out = new Map<string, StageDef>();
  for (const [key, cmd] of Object.entries<string>(pkg.scripts ?? {})) {
    const m = /^assets:stage:([a-z0-9-]+)$/.exec(key);
    const name = m?.[1];
    if (!name) continue; // skips `assets:stage:<name>:check` and unrelated scripts
    const stagePath = /--stage\s+(\S+)/.exec(cmd)?.[1];
    const vocabPath = /--vocab\s+(\S+)/.exec(cmd)?.[1];
    if (!stagePath || !vocabPath) continue;
    out.set(name, { name, stagePath, vocabPath, script: key });
  }
  return out;
}

// Resolve the stage requested via ?stage=, defaulting to northwood for back-compat
// with the old single-stage editor URL. Throws on an unknown stage so callers can
// 404 instead of silently editing the wrong region.
function resolveStage(req: any): StageDef {
  const stages = discoverStages();
  const url = new URL(req.url ?? "", "http://x");
  const want = url.searchParams.get("stage") || "northwood";
  const def = stages.get(want);
  if (!def) throw new Error(`unknown stage '${want}' (have: ${[...stages.keys()].join(", ")})`);
  return def;
}

function body(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
function send(res: any, code: number, value: unknown): void {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value));
}

function regenerate(script: string): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", script], { cwd: ROOT });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("close", (code) => resolve({ ok: code === 0, log }));
    child.on("error", (e) => resolve({ ok: false, log: String(e) }));
  });
}

function editorApi(): Plugin {
  return {
    name: "tib-stage-editor-api",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      // List the editable stages so the editor can offer a switcher.
      server.middlewares.use("/editor/api/stages", (_req, res) => {
        try {
          send(res, 200, { stages: [...discoverStages().keys()].sort() });
        } catch (e) {
          send(res, 500, { error: String(e) });
        }
      });

      server.middlewares.use("/editor/api/state", (req, res) => {
        try {
          const def = resolveStage(req);
          const stage = readJson(def.stagePath);
          const vocab = readJson(def.vocabPath);
          const base = stage.layers.find((l: any) => l.name === "base");
          const fringe = stage.layers.find((l: any) => l.name === "fringe");
          // Atlas + column count come from the stage's own tileset declaration and
          // its manifest, so every region renders against the right sheet.
          const ts = stage.tilesets?.[0] ?? {};
          const atlasName = ts.name ?? stage.name;
          const stageDir = path.dirname(def.stagePath);
          let atlasCols = 24;
          try {
            if (ts.manifest) atlasCols = readJson(path.join(stageDir, ts.manifest)).columns ?? 24;
          } catch { /* manifest optional — fall back to 24 */ }
          // Optional per-stage blob autotile sets (road/water): bitmask→atlas-index
          // tables proposed by tools/classify-*-blobset.py and hand-tuned in place.
          // Absent for stages without one — the editor just omits those auto-tools.
          let blobsets: any[] = [];
          try {
            blobsets = readJson(path.join(stageDir, `${def.name}.blobset.json`)).sets ?? [];
          } catch { /* no blobset for this stage — fine */ }
          // Editor "Layers": for stages mapped to a floor/zone, send the floor's
          // current spawns (base from spawns.yaml minus suppressions, plus editor
          // overlay placements — each tagged with its source) and the monster
          // palette. Stages without a mapping get floor:null → layers disabled.
          const meta = STAGE_META[def.name];
          let floor: number | null = null;
          let zone: string | null = null;
          let editorSpawns: any[] = [];
          let monsterTypes: any[] = [];
          let editorOre: any[] = [];
          let oreKinds: string[] = [];
          let editorHerb: any[] = [];
          let herbTypes: any[] = [];
          let editorTrees: any[] = [];
          let treeTypes: any[] = [];
          let editorPortals: any[] = [];
          let floorList: any[] = [];
          if (meta) {
            floor = meta.floor;
            zone = meta.zone;
            const overlay = readSpawnOverlay();
            const removed = new Set(overlay.removed.map((r) => `${r.floor},${r.x},${r.y}`));
            const baseSpawns = (readYaml("content/spawns.yaml")?.monsters ?? []) as any[];
            const base = baseSpawns
              .filter((s) => s.at?.floor === floor && !removed.has(`${s.at.floor},${s.at.x},${s.at.y}`))
              .map((s) => ({ type: s.type, x: s.at.x, y: s.at.y, source: "base" }));
            const over = overlay.monsters
              .filter((s) => s.at?.floor === floor)
              .map((s) => ({ type: s.type, x: s.at.x, y: s.at.y, source: "overlay" }));
            editorSpawns = [...base, ...over];
            monsterTypes = ((readYaml("content/monsters.yaml") as any[]) ?? [])
              .filter((m) => m && m.id)
              .map((m) => ({ id: m.id, name: m.name ?? m.id, icon: monsterIcon(m.id) }));
            // Ore nodes for this floor (base mining-nodes.yaml minus suppressions +
            // editor overlay). Each node ships its at-tile (x/y) and approach (ax/ay).
            const oreCfg = NODE_LAYERS.ore!;
            const oreOv = readNodeOverlay(oreCfg.overlay);
            const removedOre = new Set(oreOv.removed.map((r) => r.id));
            const toOre = (n: any, source: string) => ({
              id: n.id, kind: n.kind ?? "copper", source,
              x: n.at?.x, y: n.at?.y, ax: n.approach?.x, ay: n.approach?.y
            });
            const baseOre = ((readYaml(oreCfg.base) as any[]) ?? [])
              .filter((n) => n.at?.floor === floor && !removedOre.has(n.id))
              .map((n) => toOre(n, "base"));
            const overOre = oreOv.nodes.filter((n) => n.at?.floor === floor).map((n) => toOre(n, "overlay"));
            editorOre = [...baseOre, ...overOre];
            oreKinds = ["copper", "tin", "iron", "coal", "silver", "gold", "mithril", "adamant"];

            // Herb nodes for this floor + the palette of herb "types" — each
            // distinct label in herb-nodes.yaml, carrying its level/xp/item, so
            // placing copies a known preset (new types are still YAML-authored).
            const herbCfg = NODE_LAYERS.herbs!;
            const herbOv = readNodeOverlay(herbCfg.overlay);
            const removedHerb = new Set(herbOv.removed.map((r) => r.id));
            const allHerbBase = (readYaml(herbCfg.base) as any[]) ?? [];
            const toHerb = (n: any, source: string) => ({
              id: n.id, label: n.label ?? "Wild Herbs", item: n.item, requiredLevel: n.requiredLevel, xp: n.xp,
              source, x: n.at?.x, y: n.at?.y, ax: n.approach?.x, ay: n.approach?.y
            });
            const baseHerb = allHerbBase
              .filter((n) => n.at?.floor === floor && !removedHerb.has(n.id))
              .map((n) => toHerb(n, "base"));
            const overHerb = herbOv.nodes.filter((n) => n.at?.floor === floor).map((n) => toHerb(n, "overlay"));
            editorHerb = [...baseHerb, ...overHerb];
            const seenHerb = new Map<string, any>();
            for (const n of [...allHerbBase, ...herbOv.nodes]) {
              const lbl = n.label ?? "Wild Herbs";
              if (!seenHerb.has(lbl)) {
                const fields: any = { label: lbl };
                if (n.item != null) fields.item = n.item;
                if (n.requiredLevel != null) fields.requiredLevel = n.requiredLevel;
                if (n.xp != null) fields.xp = n.xp;
                const tag = [n.requiredLevel != null ? `L${n.requiredLevel}` : null, n.xp != null ? `${n.xp}xp` : null].filter(Boolean).join(" · ");
                seenHerb.set(lbl, { value: lbl, label: tag ? `${lbl} (${tag})` : lbl, fields, icon: herbIcon(lbl, n.requiredLevel ?? 0) });
              }
            }
            herbTypes = [...seenHerb.values()];

            // Trees for this floor: base woodcutting trees from spawns.yaml `trees:`
            // (minus position-suppressions) + editor overlay placements, each tagged
            // with source. Palette = tree species from tree-types.yaml.
            const treeOv = readTreeOverlay();
            const removedTrees = new Set(treeOv.removed.map((r) => `${r.floor},${r.x},${r.y}`));
            const baseTreesYaml = ((readYaml("content/spawns.yaml")?.trees ?? []) as any[]);
            const baseTrees = baseTreesYaml
              .filter((t) => t.at?.floor === floor && !removedTrees.has(`${t.at.floor},${t.at.x},${t.at.y}`))
              .map((t) => ({ type: t.type, x: t.at.x, y: t.at.y, source: "base" }));
            const overTrees = treeOv.trees
              .filter((t) => t.at?.floor === floor)
              .map((t) => ({ type: t.type, x: t.at.x, y: t.at.y, source: "overlay" }));
            editorTrees = [...baseTrees, ...overTrees];
            treeTypes = (((readYaml("content/tree-types.yaml") as any[]) ?? []))
              .filter((t) => t && t.id)
              .map((t) => ({ value: t.id, label: `${t.label ?? t.id} (L${t.requiredLevel ?? 1})`, fields: { type: t.id }, icon: TREE_ICON_BY_TEXTURE[t.textureKey] ?? null }));

            // Teleport pads for this floor + the list of destination floors (every
            // floor/zone mapped in STAGE_META) for the palette + per-pad inspector.
            editorPortals = readPortalOverlay().portals
              .filter((p) => p.floor === floor)
              .map((p) => ({ x: p.x, y: p.y, toFloor: p.toFloor, toX: p.toX, toY: p.toY, source: "overlay" }));
            floorList = Object.entries(STAGE_META)
              .map(([name, m]) => ({ floor: m.floor, zone: m.zone, name }))
              .sort((a, b) => a.floor - b.floor);
          }
          // Decorations are stage-local visual props (stage.json `objects` with no
          // `resource`). The catalogue = sprites this stage already uses PLUS every
          // sprite in its sprite dir (so you can place new props too), each with a
          // thumbnail URL + plausible size. Independent of the floor/zone mapping,
          // so it works on every stage.
          const decoCatalog = buildDecoCatalog(stage);
          send(res, 200, {
            floor,
            zone,
            decoCatalog,
            spawns: editorSpawns,
            monsterTypes,
            ore: editorOre,
            oreKinds,
            oreIcons: Object.fromEntries(oreKinds.map((k) => [k, oreIcon(k)])),
            herb: editorHerb,
            herbTypes,
            tree: editorTrees,
            treeTypes,
            portals: editorPortals,
            floors: floorList,
            name: stage.name,
            cols: stage.cols,
            rows: stage.rows,
            tileSize: stage.tileSize,
            atlasName,
            atlasCols,
            atlasUrl: `/tilesets/${def.name}/${ts.image ?? `${atlasName}.png`}`,
            legend: stage.ascii.legend,
            vocab: vocab.chars,
            ascii: stage.ascii.rows,
            base: base?.data ?? [],
            fringe: fringe?.data ?? null,
            blobsets,
            rotations: stage.rotations ?? {},
            objects: stage.objects.map((o: any) => ({
              x: o.x, y: o.y, w: o.w, h: o.h, key: o.key, blocking: !!o.blocking, resource: o.resource ?? null
            }))
          });
        } catch (e) {
          send(res, 500, { error: String(e) });
        }
      });

      server.middlewares.use("/editor/api/save", (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        let def: StageDef;
        try {
          def = resolveStage(req);
        } catch (e) {
          return send(res, 404, { error: String(e) });
        }
        body(req)
          .then(async (payload) => {
            const stage = readJson(def.stagePath);
            const vocab = readJson(def.vocabPath);
            const base = stage.layers.find((l: any) => l.name === "base");
            const fringe = stage.layers.find((l: any) => l.name === "fringe");

            // Mint any new roster tiles into both legend + vocab.
            for (const [char, ref] of Object.entries(payload.legendAdds ?? {})) {
              stage.ascii.legend[char] = ref;
            }
            for (const [char, entry] of Object.entries(payload.vocabAdds ?? {})) {
              vocab.chars[char] = entry;
            }

            // Apply painted cells: ascii char, base ref, clear overlay, collision,
            // and sparse visual rotation (deleted when back to 0).
            if (!stage.rotations) stage.rotations = {};
            for (const c of payload.cells ?? []) {
              const row = stage.ascii.rows[c.y];
              stage.ascii.rows[c.y] = row.slice(0, c.x) + c.char + row.slice(c.x + 1);
              if (base?.data?.[c.y]) base.data[c.y][c.x] = c.ref;
              if (fringe?.data?.[c.y]) fringe.data[c.y][c.x] = null;
              stage.collision[c.y][c.x] = c.blocked ? 1 : 0;
              const rk = `${c.x},${c.y}`;
              if (c.rot) stage.rotations[rk] = c.rot;
              else delete stage.rotations[rk];
            }

            writeJson(def.stagePath, stage);
            writeJson(def.vocabPath, vocab);
            const result = await regenerate(def.script);
            send(res, result.ok ? 200 : 500, result);
          })
          .catch((e) => send(res, 400, { error: String(e) }));
      });

      // Spawns layer save: replace ONLY this floor's editor placements +
      // suppressions in the overlay file (other floors' editor data is left
      // intact), then rerun content:build so the running game hot-reloads. The
      // payload is the FULL desired editor state for the floor — placements in
      // `overlay` (tile coords), base spawns to suppress in `removed`.
      server.middlewares.use("/editor/api/spawns/save", (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        let def: StageDef;
        try {
          def = resolveStage(req);
        } catch (e) {
          return send(res, 404, { error: String(e) });
        }
        const meta = STAGE_META[def.name];
        if (!meta) return send(res, 400, { error: `stage '${def.name}' has no floor/zone mapping — no layers` });
        body(req)
          .then(async (payload) => {
            const { floor, zone } = meta;
            const overlay = readSpawnOverlay();
            // Drop this floor's old entries; keep every other floor's untouched.
            const monsters = overlay.monsters.filter((m) => m.at?.floor !== floor);
            const removed = overlay.removed.filter((r) => r.floor !== floor);
            for (const s of payload.overlay ?? []) {
              monsters.push({ type: s.type, at: { floor, x: s.x, y: s.y }, zone });
            }
            for (const r of payload.removed ?? []) {
              removed.push({ floor, x: r.x, y: r.y });
            }
            writeSpawnOverlay({ monsters, removed });
            const result = await regenerate("content:build");
            send(res, result.ok ? 200 : 500, result);
          })
          .catch((e) => send(res, 400, { error: String(e) }));
      });

      // Generic gathering-node save (?layer=ore, later herbs). Replaces ONLY this
      // floor's overlay nodes + id-suppressions; other floors stay intact. Payload:
      // { nodes:[{id, <field>, x, y, ax, ay}], removed:[<id>] }. Coords are tile
      // centres (x.5/y.5); the server stamps floor + wraps at/approach.
      server.middlewares.use("/editor/api/nodes/save", (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        let def: StageDef;
        try {
          def = resolveStage(req);
        } catch (e) {
          return send(res, 404, { error: String(e) });
        }
        const meta = STAGE_META[def.name];
        if (!meta) return send(res, 400, { error: `stage '${def.name}' has no floor/zone mapping — no layers` });
        const layerId = new URL(req.url ?? "", "http://x").searchParams.get("layer") ?? "";
        const cfg = NODE_LAYERS[layerId];
        if (!cfg) return send(res, 400, { error: `unknown node layer '${layerId}' (have: ${Object.keys(NODE_LAYERS).join(", ")})` });
        body(req)
          .then(async (payload) => {
            const { floor } = meta;
            const overlay = readNodeOverlay(cfg.overlay);
            const nodes = overlay.nodes.filter((n) => n.at?.floor !== floor);
            const removed = overlay.removed.filter((r) => r.floor !== floor);
            for (const n of payload.nodes ?? []) {
              const entry: any = { id: n.id, at: { floor, x: n.x, y: n.y }, approach: { x: n.ax, y: n.ay } };
              for (const f of cfg.fields) if (n[f] != null) entry[f] = n[f];
              nodes.push(entry);
            }
            for (const id of payload.removed ?? []) removed.push({ floor, id });
            writeNodeOverlay(cfg.overlay, cfg.fields, { nodes, removed });
            const result = await regenerate("content:build");
            send(res, result.ok ? 200 : 500, result);
          })
          .catch((e) => send(res, 400, { error: String(e) }));
      });

      // Trees layer save: replace ONLY this floor's editor tree placements +
      // position-suppressions in trees.editor.yaml; other floors stay intact.
      // Payload: { overlay:[{type, x, y}], removed:[{x, y}] } — positions are tile
      // centres. The server stamps the floor and wraps each into spawns-style `at`.
      server.middlewares.use("/editor/api/trees/save", (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        let def: StageDef;
        try {
          def = resolveStage(req);
        } catch (e) {
          return send(res, 404, { error: String(e) });
        }
        const meta = STAGE_META[def.name];
        if (!meta) return send(res, 400, { error: `stage '${def.name}' has no floor/zone mapping — no layers` });
        body(req)
          .then(async (payload) => {
            const { floor } = meta;
            const overlay = readTreeOverlay();
            const trees = overlay.trees.filter((t) => t.at?.floor !== floor);
            const removed = overlay.removed.filter((r) => r.floor !== floor);
            for (const t of payload.overlay ?? []) {
              trees.push({ type: t.type, at: { floor, x: t.x, y: t.y } });
            }
            for (const r of payload.removed ?? []) {
              removed.push({ floor, x: r.x, y: r.y });
            }
            writeTreeOverlay({ trees, removed });
            const result = await regenerate("content:build");
            send(res, result.ok ? 200 : 500, result);
          })
          .catch((e) => send(res, 400, { error: String(e) }));
      });

      // Portals (teleport pads) save: replace ONLY this floor's pads in
      // portals.editor.yaml (other floors untouched), then rebuild content so the
      // running game hot-reloads. Payload: { overlay:[{x,y,toFloor,toX,toY}] } =
      // the FULL desired pad set for this floor.
      server.middlewares.use("/editor/api/portals/save", (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        let def: StageDef;
        try {
          def = resolveStage(req);
        } catch (e) {
          return send(res, 404, { error: String(e) });
        }
        const meta = STAGE_META[def.name];
        if (!meta) return send(res, 400, { error: `stage '${def.name}' has no floor/zone mapping — no layers` });
        body(req)
          .then(async (payload) => {
            const { floor } = meta;
            const portals = readPortalOverlay().portals.filter((p) => p.floor !== floor);
            for (const p of payload.overlay ?? []) {
              portals.push({ floor, x: p.x, y: p.y, toFloor: p.toFloor, toX: p.toX, toY: p.toY });
            }
            writePortalOverlay({ portals });
            const result = await regenerate("content:build");
            send(res, result.ok ? 200 : 500, result);
          })
          .catch((e) => send(res, 400, { error: String(e) }));
      });

      // Decorations save: rewrite the stage's non-resource `objects` (visual props)
      // straight into stage.json, then re-run that stage's import so the game hot-
      // reloads. Resource objects (choppable trees etc.) are owned by asset-forge
      // and left untouched. Stage-local — needs no floor/zone mapping, unlike the
      // gathering layers. Payload: { objects:[{key,x,y,w,h,blocking}] } = the FULL
      // desired prop set for the stage.
      server.middlewares.use("/editor/api/objects/save", (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        let def: StageDef;
        try {
          def = resolveStage(req);
        } catch (e) {
          return send(res, 404, { error: String(e) });
        }
        body(req)
          .then(async (payload) => {
            const stage = readJson(def.stagePath);
            const kept = (stage.objects ?? []).filter((o: any) => o.resource);
            const deco = (payload.objects ?? []).map((o: any) => ({
              key: o.key, x: o.x, y: o.y, w: o.w, h: o.h, blocking: !!o.blocking
            }));
            stage.objects = [...kept, ...deco];
            writeJson(def.stagePath, stage);
            const result = await regenerate(def.script);
            send(res, result.ok ? 200 : 500, result);
          })
          .catch((e) => send(res, 400, { error: String(e) }));
      });
    }
  };
}

export default defineConfig({
  plugins: [editorApi()]
});
