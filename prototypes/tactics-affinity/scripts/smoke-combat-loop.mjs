import { chromium } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prototypeRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(prototypeRoot, "../..");
const viteBin = path.join(repoRoot, "node_modules/vite/bin/vite.js");
const artifactDir = path.join(prototypeRoot, "artifacts/playable-combat-v1");
const screenshotPath = path.join(artifactDir, "playable-combat-after-end-turn.png");
const reportPath = path.join(artifactDir, "report.md");

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

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
  return stdout.trim();
}

async function readCombatState(page) {
  return page.evaluate(() => {
    const log = Array.from(document.querySelectorAll(".log-panel li")).map((node) => node.textContent?.trim() ?? "");
    const unitLabels = Array.from(document.querySelectorAll(".unit")).map((node) => node.getAttribute("aria-label") ?? "");
    const objective = document.querySelector(".objective")?.getAttribute("aria-label") ?? "";
    const forecast = document.querySelector(".forecast")?.innerText ?? "";
    const turn = document.querySelector(".turn-pill")?.textContent?.trim() ?? "";
    return { log, unitLabels, objective, forecast, turn };
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
  const checks = [];
  let browser;
  let classification = "nonfunctional";
  let failure = null;

  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));

    await page.getByText("Ruined Crossing", { exact: false }).first().waitFor({ state: "visible", timeout: 5000 });
    await page.getByText("Tactics Battle Stage V4", { exact: false }).first().waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: /Iron Guard HP 9\/10/i }).click();
    checks.push("PASS selected Iron Guard by accessible button.");

    await page.getByRole("button", { name: /Shield Bash/i }).click();
    checks.push("PASS chose Shield Bash.");

    await page.getByRole("button", { name: /Stone Brute HP 12\/12/i }).click();
    await page.getByText(/Deals 3 damage and pushes 1 tile/i).waitFor({ state: "visible", timeout: 5000 });
    await page.locator(".forecast").getByText(/miss the shrine line/i).waitFor({ state: "visible", timeout: 5000 });
    checks.push("PASS preview mentions damage, push, and shrine-line intent miss.");

    const beforeCommit = await readCombatState(page);
    await page.getByRole("button", { name: /Commit Action/i }).click();
    await page.getByText(/Stone Brute took 3 and was pushed off the shrine line/i).waitFor({
      state: "visible",
      timeout: 5000
    });
    const afterCommit = await readCombatState(page);
    if (!afterCommit.unitLabels.some((label) => /Stone Brute HP 9\/12 at 7,2/i.test(label))) {
      throw new Error(`Expected Stone Brute HP 9/12 at 7,2, got ${afterCommit.unitLabels.join(" | ")}`);
    }
    if (JSON.stringify(beforeCommit.log) === JSON.stringify(afterCommit.log)) {
      throw new Error("Combat log did not change after committing Shield Bash.");
    }
    checks.push("PASS commit changed Stone Brute HP, position, and combat log.");

    await page.getByRole("button", { name: /End Turn/i }).click();
    await page.getByText(/Enemy resolution starts/i).waitFor({ state: "visible", timeout: 5000 });
    await page.locator(".log-panel").getByText(/Stone Brute missed the shrine line/i).waitFor({
      state: "visible",
      timeout: 5000
    });
    const afterEndTurn = await readCombatState(page);
    if (!/Shrine objective HP 6\/8/i.test(afterEndTurn.objective)) {
      throw new Error(`Expected shrine HP to remain 6/8 after pushed brute misses, got ${afterEndTurn.objective}`);
    }
    if (!/Player Turn 4/i.test(afterEndTurn.turn)) {
      throw new Error(`Expected next player turn, got ${afterEndTurn.turn}`);
    }
    checks.push("PASS end turn resolved enemy intents and preserved shrine HP after push.");

    await page.screenshot({ path: screenshotPath, fullPage: false });
    checks.push(`PASS screenshot captured: ${path.relative(prototypeRoot, screenshotPath)}`);
    classification = "working";
  } catch (error) {
    failure = error;
    if (checks.length > 2) classification = "partial";
    if (browser) {
      try {
        const pages = browser.contexts().flatMap((context) => context.pages());
        if (pages[0]) await pages[0].screenshot({ path: screenshotPath, fullPage: false });
      } catch {
        // Keep the original failure.
      }
    }
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

  const commitHash = await git(["rev-parse", "--short", "HEAD"]);
  const status = await git(["status", "--short"]);
  const report = [
    "# Playable Combat V1 Smoke",
    "",
    `- Dev server: ${baseUrl}`,
    `- Port: ${port}`,
    `- Classification: ${classification}`,
    `- Commit at run time: ${commitHash}`,
    `- Screenshot: ${path.relative(prototypeRoot, screenshotPath)}`,
    "",
    "## Commands",
    "",
    "- `npm run smoke:combat`",
    "",
    "## Checks",
    "",
    ...checks.map((check) => `- ${check}`),
    failure ? `- FAIL ${failure.message}` : "- PASS playable combat loop verified.",
    "",
    "## Final Git Status At Smoke Time",
    "",
    "```",
    status || "(clean)",
    "```",
    ""
  ].join("\n");
  await writeFile(reportPath, report);

  console.log(`combat smoke opened ${baseUrl}`);
  console.log(`classification: ${classification}`);
  console.log(`report: ${path.relative(prototypeRoot, reportPath)}`);
  for (const check of checks) console.log(check);
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
