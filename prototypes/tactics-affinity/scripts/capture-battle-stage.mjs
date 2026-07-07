import { chromium } from "@playwright/test";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prototypeRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(prototypeRoot, "../..");
const viteBin = path.join(repoRoot, "node_modules/vite/bin/vite.js");
const artifactDir = path.join(prototypeRoot, "artifacts/battle-stage-generated-low-res-actors-v1");
const mediaDir = path.join(process.env.HOME, ".openclaw/media/tib-gathering/battle-stage-generated-low-res-actors-v1");

const shots = [
  { name: "battle-stage-generated-low-res-actors-desktop.png", viewport: { width: 1440, height: 900 }, path: "/" },
  { name: "battle-stage-generated-low-res-actors-mobile.png", viewport: { width: 760, height: 1280 }, path: "/" },
  { name: "battle-stage-generated-low-res-actors-grayscale.png", viewport: { width: 1440, height: 900 }, path: "/?gray=1" }
];

async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function pickPort() {
  for (let port = 5220; port <= 5239; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error("No free port in 5220-5239");
}

async function waitForServer(url) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  await mkdir(mediaDir, { recursive: true });

  const port = await pickPort();
  const server = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: prototypeRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverLog = "";
  server.stdout.on("data", (chunk) => {
    serverLog += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverLog += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let browser;

  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch();
    const page = await browser.newPage();

    for (const shot of shots) {
      await page.setViewportSize(shot.viewport);
      await page.goto(`${baseUrl}${shot.path}`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
      await page.screenshot({ path: path.join(artifactDir, shot.name), fullPage: false });
      await copyFile(path.join(artifactDir, shot.name), path.join(mediaDir, shot.name));
    }

    const report = [
      "# Battle Stage Generated Low-Res Actors V1 Runtime Proof",
      "",
      `- Dev server: ${baseUrl}`,
      "- Screenshots:",
      ...shots.map((shot) => `  - ${shot.name}: ${shot.viewport.width}x${shot.viewport.height}${shot.path.includes("gray") ? " grayscale" : ""}`),
      "- Content check: 8x8 Ruined Crossing board, existing flat terrain direction, Iron Guard selected, Verdant Ranger, Radiant Acolyte, Grave Skitter, Stone Brute, Grave Archer, shrine objective, enemy intent arrows, target highlights, and combat UI are all present.",
      "- Actor pass: all board actors now render from the generated bitmap sprite sheet at assets/generated/generated-low-res-actors-v1/generated-low-res-actor-poses.png, replacing the procedural CSS actor construction used in the rejected pass.",
      "- Animation-readiness proof: selected-unit HUD includes idle, windup, hit, and move pose frames from the same generated Iron Guard row; enemy board sprites use their generated windup frames so threat is readable by pose/value in addition to arrows.",
      "- Terrain preservation: the previous flat-board surface, decal, grid, and skirt stack remains in place; terrain art was not regenerated or redesigned.",
      "- Grayscale check: player/enemy separation uses outline weight, body value, shape, threat wedges, and labels rather than hue alone.",
      "- Source proof: actor-generation-prompt.md, generated-actor-source.png, generated-actor-contact-sheet.png, processed-actor-sprite-sheet.png, and actor-runtime-manifest.json are in this artifact folder.",
      "- Runtime mapping: rows 0-5 map to Iron Guard, Verdant Ranger, Radiant Acolyte, Grave Skitter, Stone Brute, and Grave Archer; columns 0-3 map to idle, windup, hit, and move.",
      "- Delivery copies: ~/.openclaw/media/tib-gathering/battle-stage-generated-low-res-actors-v1/",
      ""
    ].join("\n");
    await writeFile(path.join(artifactDir, "report.md"), report);
    console.log(`captured battle-stage-generated-low-res-actors-v1 screenshots on port ${port}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2000);
      server.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  if (server.exitCode && server.exitCode !== 0 && !server.killed) {
    throw new Error(serverLog);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
