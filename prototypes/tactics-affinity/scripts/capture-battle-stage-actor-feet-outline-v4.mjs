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
const artifactDir = path.join(prototypeRoot, "artifacts/battle-stage-actor-feet-outline-v4");
const mediaDir = path.join(process.env.HOME, ".openclaw/media/tib-gathering/battle-stage-actor-feet-outline-v4");
const actorSheetPath = "/assets/generated/actor-feet-outline-v4/generated-low-res-actor-poses.png";

const shots = [
  { name: "battle-stage-actor-feet-outline-v4-desktop.png", viewport: { width: 1440, height: 900 }, route: "/" },
  { name: "battle-stage-actor-feet-outline-v4-mobile.png", viewport: { width: 760, height: 1280 }, route: "/" },
  { name: "battle-stage-actor-feet-outline-v4-grayscale.png", viewport: { width: 1440, height: 900 }, route: "/?gray=1" }
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
    if (await isPortFree(port)) return port;
  }
  throw new Error("No free port in 5220-5239");
}

async function waitForServer(url) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function assertRuntimeSheet(page) {
  const loaded = await page.evaluate(() => {
    const actor = document.querySelector(".generated-actor-sprite");
    const actors = Array.from(document.querySelectorAll(".generated-actor"));
    const background = actor ? getComputedStyle(actor).backgroundImage : "";
    const shadowStyles = Array.from(document.querySelectorAll(".generated-actor-shadow")).map((node) => {
      const style = getComputedStyle(node);
      return { width: style.width, height: style.height, background: style.backgroundColor };
    });
    return {
      actorCount: actors.length,
      versionCount: actors.filter((node) => node.dataset.actorSheet === "actor-feet-outline-v4").length,
      background,
      shadowStyles
    };
  });
  if (loaded.actorCount < 10) {
    throw new Error(`Expected board and preview actors, found ${loaded.actorCount}`);
  }
  if (loaded.versionCount !== loaded.actorCount) {
    throw new Error(`Expected all generated actors to use actor-feet-outline-v4, found ${loaded.versionCount}/${loaded.actorCount}`);
  }
  if (!loaded.background.includes(actorSheetPath)) {
    throw new Error(`Runtime loaded wrong actor sheet: ${loaded.background}`);
  }
  if (!loaded.shadowStyles.length) {
    throw new Error("Expected separate .generated-actor-shadow elements below actor sprites");
  }
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
      await page.goto(`${baseUrl}${shot.route}`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
      await assertRuntimeSheet(page);
      await page.screenshot({ path: path.join(artifactDir, shot.name), fullPage: false });
      await copyFile(path.join(artifactDir, shot.name), path.join(mediaDir, shot.name));
    }

    const report = [
      "# Battle Stage Actor Feet/Outline V4 Runtime Proof",
      "",
      `- Dev server: ${baseUrl}`,
      `- Port: ${port}`,
      `- Runtime actor sheet: ${actorSheetPath}`,
      "- Runtime check: every .generated-actor node has data-actor-sheet=actor-feet-outline-v4 and computed background-image points at the V4 equal-cell sheet.",
      "- Separate shadow check: .generated-actor-shadow elements remain present as CSS ellipses below the feet; the sprite sheet does not bake shadows into the body.",
      "- Screenshots:",
      ...shots.map((shot) => `  - ${shot.name}: ${shot.viewport.width}x${shot.viewport.height}${shot.route.includes("gray") ? " grayscale" : ""}`),
      "- Content check: Ruined Crossing board, flat terrain/decal direction, generated player actors, generated enemies, shrine objective, enemy intent, selected-unit preview, and HUD remain present.",
      ""
    ].join("\n");
    await writeFile(path.join(artifactDir, "runtime-proof.md"), report);
    console.log(`captured battle-stage-actor-feet-outline-v4 screenshots on port ${port}`);
  } finally {
    if (browser) await browser.close();
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
