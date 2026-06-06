import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

// Dev-only HTTP API backing the Northwood tile editor (/editor.html). Reads the
// asset-forge stage source, applies hand-painted cell patches + any newly minted
// roster tiles, then re-runs ONLY the import step so the live game hot-reloads.
// The bridge (build-northwood-from-authored) is deliberately NOT run — the editor
// is the authoritative hand-tuning layer on top of the auto-generated layout.
const STAGE = "assetsources/asset-forge/exports/northwood/northwood.stage.json";
const VOCAB = "assetsources/asset-forge/northwood.vocab.json";
const ROOT = process.cwd();

function readJson(rel: string): any {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
}
function writeJson(rel: string, value: unknown): void {
  writeFileSync(path.join(ROOT, rel), JSON.stringify(value, null, 2) + "\n");
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

function regenerate(): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "assets:stage:northwood"], { cwd: ROOT });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("close", (code) => resolve({ ok: code === 0, log }));
    child.on("error", (e) => resolve({ ok: false, log: String(e) }));
  });
}

function editorApi(): Plugin {
  return {
    name: "tib-northwood-editor-api",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/editor/api/state", (_req, res) => {
        try {
          const stage = readJson(STAGE);
          const vocab = readJson(VOCAB);
          const base = stage.layers.find((l: any) => l.name === "base");
          const fringe = stage.layers.find((l: any) => l.name === "fringe");
          send(res, 200, {
            cols: stage.cols,
            rows: stage.rows,
            tileSize: stage.tileSize,
            atlasCols: 24,
            atlasUrl: "/tilesets/northwood/forest.png",
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
        body(req)
          .then(async (payload) => {
            const stage = readJson(STAGE);
            const vocab = readJson(VOCAB);
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

            writeJson(STAGE, stage);
            writeJson(VOCAB, vocab);
            const result = await regenerate();
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
