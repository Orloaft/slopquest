import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

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

// A stage is editable iff it has a (non-`:check`) `assets:stage:<name>` script.
// We parse the script's own --stage/--vocab args so the source-of-truth stays in
// package.json rather than being duplicated here.
type StageDef = { name: string; stagePath: string; vocabPath: string; script: string };
function discoverStages(): Map<string, StageDef> {
  const pkg = readJson("package.json");
  const out = new Map<string, StageDef>();
  for (const [key, cmd] of Object.entries<string>(pkg.scripts ?? {})) {
    const m = /^assets:stage:([a-z0-9-]+)$/.exec(key);
    if (!m) continue; // skips `assets:stage:<name>:check` and unrelated scripts
    const stagePath = /--stage\s+(\S+)/.exec(cmd)?.[1];
    const vocabPath = /--vocab\s+(\S+)/.exec(cmd)?.[1];
    if (!stagePath || !vocabPath) continue;
    out.set(m[1], { name: m[1], stagePath, vocabPath, script: key });
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
          send(res, 200, {
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
            rotations: stage.rotations ?? {},
            objects: stage.objects.map((o: any) => ({ x: o.x, y: o.y, w: o.w, h: o.h }))
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
    }
  };
}

export default defineConfig({
  plugins: [editorApi()]
});
