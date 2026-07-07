import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prototypeRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(prototypeRoot, "../..");
const viteBin = path.join(repoRoot, "node_modules/vite/bin/vite.js");
const artifactDir = path.join(prototypeRoot, "artifacts/e2e-combat-smoke");
const screenshotPath = path.join(artifactDir, "combat-smoke-board.png");
const reportPath = path.join(artifactDir, "report.md");

const expectedText = [
  "Ruined Crossing",
  "Tactics Battle Stage V4",
  "Player Turn 3",
  "Selected",
  "Iron Guard",
  "Action preview",
  "Shield Bash -> Stone Brute",
  "Objective",
  "Hold the shrine",
  "Adventurers",
  "Enemy intent",
  "Combat forecast",
  "Grave Archer intent"
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

async function readCombatState(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const selected = document.querySelector(".unit.selected")?.getAttribute("aria-label") ?? "";
    const forecast = document.querySelector(".forecast")?.innerText ?? "";
    const log = Array.from(document.querySelectorAll(".log-panel li")).map((node) => node.textContent?.trim() ?? "");
    const unitLabels = Array.from(document.querySelectorAll(".unit")).map((node) => node.getAttribute("aria-label") ?? "");
    return { text, selected, forecast, log, unitLabels };
  });
}

async function main() {
  await mkdir(artifactDir, { recursive: true });

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
  const checks = [];
  let classification = "nonfunctional";
  let exitCode = 1;

  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));

    for (const text of expectedText) {
      await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 5000 });
      checks.push(`PASS visible text: ${text}`);
    }

    const unitCount = await page.locator(".unit").count();
    const enemyIntentCount = await page.locator(".intent").count();
    if (unitCount !== 6) throw new Error(`Expected 6 board units, found ${unitCount}`);
    if (enemyIntentCount < 4) throw new Error(`Expected at least 4 intent markers, found ${enemyIntentCount}`);
    checks.push(`PASS board units: ${unitCount}`);
    checks.push(`PASS intent markers: ${enemyIntentCount}`);

    const before = await readCombatState(page);
    await page.locator(".unit.selected").click();
    await page.locator(".unit.brute").click();
    const after = await readCombatState(page);

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      classification = "partial";
      exitCode = 0;
      checks.push("PARTIAL board state changed after selecting the active unit and target.");
    } else {
      checks.push("FAIL no combat state changed after clicking the selected Iron Guard and Stone Brute target.");
    }

    const actionControls = await page
      .getByRole("button", { name: /shield bash|attack|end turn|confirm|commit|ability/i })
      .count();
    if (actionControls > 0) {
      checks.push(`PARTIAL action-like controls found: ${actionControls}`);
      if (classification === "nonfunctional") classification = "partial";
    } else {
      checks.push("FAIL no ability, commit, attack, or end-turn controls are exposed as buttons.");
    }

    await page.screenshot({ path: screenshotPath, fullPage: false });

    const report = [
      "# E2E Combat Smoke",
      "",
      `- Dev server: ${baseUrl}`,
      `- Port: ${port}`,
      `- Screenshot: ${path.relative(prototypeRoot, screenshotPath)}`,
      `- Classification: ${classification}`,
      "",
      "## Checks",
      "",
      ...checks.map((check) => `- ${check}`),
      "",
      "## Result",
      "",
      classification === "nonfunctional"
        ? "The Ruined Crossing proof loads, but the combat loop is not wired for E2E interaction. Clicking the selected adventurer and Stone Brute target leaves selected unit, forecast text, combat log, and board unit labels unchanged, and there are no ability/commit/end-turn controls to drive."
        : "The proof exposes some interaction affordance, but this smoke did not verify full deterministic turn resolution.",
      ""
    ].join("\n");
    await writeFile(reportPath, report);

    console.log(`combat smoke opened ${baseUrl}`);
    console.log(`classification: ${classification}`);
    console.log(`report: ${path.relative(prototypeRoot, reportPath)}`);
    for (const check of checks) console.log(check);
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

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
