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
const artifactDir = path.join(prototypeRoot, "artifacts/functional-test-sweep-v1");
const screenshotPath = path.join(artifactDir, "functional-sweep-after-end-turn.png");
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
    const commitDisabled = document.querySelector("[data-action='commit']")?.hasAttribute("disabled") ?? true;
    const endTurnDisabled = document.querySelector("[data-action='end-turn']")?.hasAttribute("disabled") ?? true;
    return { log, unitLabels, objective, forecast, turn, commitDisabled, endTurnDisabled };
  });
}

function requireMatch(values, pattern, message) {
  if (!values.some((value) => pattern.test(value))) {
    throw new Error(`${message}: ${values.join(" | ")}`);
  }
}

async function openFreshPage(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
  return page;
}

async function verifyIdentity(page, checks) {
  await page.getByText("Ruined Crossing", { exact: false }).first().waitFor({ state: "visible", timeout: 5000 });
  await page.getByText("Tactics Battle Stage V4", { exact: false }).first().waitFor({ state: "visible", timeout: 5000 });
  await page.getByRole("button", { name: /Iron Guard HP 9\/10/i }).waitFor({ state: "visible", timeout: 5000 });
  checks.push("PASS runtime shows Ruined Crossing / Tactics Battle Stage content with TIB Gathering combatants.");
}

async function verifyNextTurnControls(page, checks) {
  const afterEndTurn = await readCombatState(page);
  if (!/Player Turn 4/i.test(afterEndTurn.turn)) {
    throw new Error(`Expected next player turn, got ${afterEndTurn.turn}`);
  }
  if (afterEndTurn.endTurnDisabled) {
    throw new Error("Expected End Turn control to be available on the next player turn.");
  }
  await page.getByRole("button", { name: /Iron Guard HP/i }).click();
  await page.getByRole("button", { name: /Shield Bash/i }).click();
  await page.getByRole("button", { name: /Stone Brute HP/i }).click();
  const controls = await readCombatState(page);
  if (controls.commitDisabled) {
    throw new Error("Expected Commit Action to be available after selecting a next-turn action.");
  }
  await page.locator(".forecast").getByText(/Shield Bash -> Stone Brute/i).waitFor({ state: "visible", timeout: 5000 });
  checks.push("PASS next-turn state is reachable and action controls still work.");
}

async function runShieldBash(browser, baseUrl, checks) {
  const page = await openFreshPage(browser, baseUrl);
  await verifyIdentity(page, checks);
  await page.getByRole("button", { name: /Iron Guard HP 9\/10/i }).click();
  checks.push("PASS selected Iron Guard.");
  await page.getByRole("button", { name: /Shield Bash/i }).click();
  checks.push("PASS chose Shield Bash.");
  await page.getByRole("button", { name: /Stone Brute HP 12\/12/i }).click();
  await page.getByText(/Deals 3 damage and pushes 1 tile/i).waitFor({ state: "visible", timeout: 5000 });
  await page.locator(".forecast").getByText(/miss the shrine line/i).waitFor({ state: "visible", timeout: 5000 });
  checks.push("PASS Shield Bash preview mentions damage, push, and intent effect.");

  const beforeCommit = await readCombatState(page);
  await page.getByRole("button", { name: /Commit Action/i }).click();
  await page.getByText(/Stone Brute took 3 and was pushed off the shrine line/i).waitFor({
    state: "visible",
    timeout: 5000
  });
  const afterCommit = await readCombatState(page);
  requireMatch(afterCommit.unitLabels, /Stone Brute HP 9\/12 at 7,2/i, "Expected Stone Brute HP/position to change");
  if (JSON.stringify(beforeCommit.log) === JSON.stringify(afterCommit.log)) {
    throw new Error("Combat log did not change after committing Shield Bash.");
  }
  checks.push("PASS Shield Bash commit changed Brute HP, position, and combat log.");

  await page.getByRole("button", { name: /End Turn/i }).click();
  await page.getByText(/Enemy resolution starts/i).waitFor({ state: "visible", timeout: 5000 });
  await page.locator(".log-panel").getByText(/Stone Brute missed the shrine line/i).waitFor({ state: "visible", timeout: 5000 });
  const afterEndTurn = await readCombatState(page);
  if (!/Shrine objective HP 6\/8/i.test(afterEndTurn.objective)) {
    throw new Error(`Expected shrine HP to remain 6/8 after pushed brute misses, got ${afterEndTurn.objective}`);
  }
  checks.push("PASS Shield Bash end turn resolved coherently with shrine HP preserved.");
  await page.close();
}

async function runRootShot(browser, baseUrl, checks) {
  const page = await openFreshPage(browser, baseUrl);
  await page.getByRole("button", { name: /Verdant Ranger HP 7\/7/i }).click();
  checks.push("PASS selected Verdant Ranger.");
  await page.getByRole("button", { name: /Root Shot/i }).click();
  checks.push("PASS chose Root Shot.");
  await page.getByRole("button", { name: /Grave Skitter HP 4\/4/i }).click();
  await page.locator(".forecast").getByText(/Deals 2 damage and roots Grave Skitter/i).waitFor({
    state: "visible",
    timeout: 5000
  });
  checks.push("PASS Root Shot preview mentions damage and root.");

  const beforeCommit = await readCombatState(page);
  await page.getByRole("button", { name: /Commit Action/i }).click();
  await page.getByText(/Grave Skitter took 2 and is rooted/i).waitFor({ state: "visible", timeout: 5000 });
  const afterCommit = await readCombatState(page);
  requireMatch(afterCommit.unitLabels, /Grave Skitter HP 2\/4 at 4,2 rooted/i, "Expected Skitter HP/status to change");
  if (JSON.stringify(beforeCommit.log) === JSON.stringify(afterCommit.log)) {
    throw new Error("Combat log did not change after committing Root Shot.");
  }
  checks.push("PASS Root Shot commit changed Skitter HP/status and combat log.");

  await page.getByRole("button", { name: /End Turn/i }).click();
  await page.locator(".log-panel").getByText(/Grave Skitter's leap was prevented by Root Shot/i).waitFor({
    state: "visible",
    timeout: 5000
  });
  const afterEndTurn = await readCombatState(page);
  requireMatch(afterEndTurn.unitLabels, /Verdant Ranger HP 7\/7/i, "Expected rooted Skitter not to damage Ranger");
  if (!/Shrine objective HP 3\/8/i.test(afterEndTurn.objective)) {
    throw new Error(`Expected unhandled Brute to damage shrine to 3/8, got ${afterEndTurn.objective}`);
  }
  checks.push("PASS Root Shot end turn prevented Skitter leap while other enemy intents resolved.");
  await page.close();
}

async function runWard(browser, baseUrl, checks) {
  const page = await openFreshPage(browser, baseUrl);
  await page.getByRole("button", { name: /Radiant Acolyte HP 6\/6/i }).click();
  checks.push("PASS selected Radiant Acolyte.");
  await page.getByRole("button", { name: /Ward/i }).click();
  checks.push("PASS chose Ward.");
  await page.getByRole("button", { name: /Shrine objective HP 6\/8/i }).click();
  await page.locator(".forecast").getByText(/absorb the next objective hit/i).waitFor({ state: "visible", timeout: 5000 });
  checks.push("PASS Ward preview mentions objective absorption.");

  const beforeCommit = await readCombatState(page);
  await page.getByRole("button", { name: /Commit Action/i }).click();
  await page.getByText(/the shrine will absorb the next objective hit/i).waitFor({ state: "visible", timeout: 5000 });
  const afterCommit = await readCombatState(page);
  if (!/Shrine objective HP 6\/8 warded/i.test(afterCommit.objective)) {
    throw new Error(`Expected objective to become warded, got ${afterCommit.objective}`);
  }
  if (JSON.stringify(beforeCommit.log) === JSON.stringify(afterCommit.log)) {
    throw new Error("Combat log did not change after committing Ward.");
  }
  checks.push("PASS Ward commit changed objective ward state and combat log.");

  await page.getByRole("button", { name: /End Turn/i }).click();
  await page.locator(".log-panel").getByText(/Ward absorbed the objective damage/i).waitFor({
    state: "visible",
    timeout: 5000
  });
  const afterEndTurn = await readCombatState(page);
  if (!/Shrine objective HP 6\/8/i.test(afterEndTurn.objective) || /warded/i.test(afterEndTurn.objective)) {
    throw new Error(`Expected Ward to absorb Brute damage and clear, got ${afterEndTurn.objective}`);
  }
  requireMatch(afterEndTurn.unitLabels, /Verdant Ranger HP 5\/7/i, "Expected unrooted Skitter intent to resolve against Ranger");
  checks.push("PASS Ward end turn absorbed objective hit and left other enemy intents coherent.");

  await verifyNextTurnControls(page, checks);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  checks.push(`PASS screenshot captured: ${path.relative(prototypeRoot, screenshotPath)}`);
  await page.close();
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
  let classification = "failing";
  let failure = null;

  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch();
    await runShieldBash(browser, baseUrl, checks);
    await runRootShot(browser, baseUrl, checks);
    await runWard(browser, baseUrl, checks);
    classification = "fully functional for tested v1";
  } catch (error) {
    failure = error;
    if (checks.length > 4) classification = "partial";
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
    "# Functional Test Sweep V1",
    "",
    `- Dev server: ${baseUrl}`,
    `- Port: ${port}`,
    `- Classification: ${classification}`,
    `- Commit at run time: ${commitHash}`,
    `- Screenshot: ${path.relative(prototypeRoot, screenshotPath)}`,
    "",
    "## Commands",
    "",
    "- `npm run build`",
    "- `npm run smoke:combat`",
    "- `npm run smoke:functional`",
    "",
    "## Checks",
    "",
    ...checks.map((check) => `- ${check}`),
    failure ? `- FAIL ${failure.message}` : "- PASS full functional matrix verified.",
    "",
    "## Caveats",
    "",
    "- The sweep validates the scripted v1 combat slice only; it does not claim broad balance, AI, pathfinding, or save/load coverage.",
    "",
    "## Server Log",
    "",
    "```",
    serverLog.trim() || "(empty)",
    "```",
    "",
    "## Final Git Status At Sweep Time",
    "",
    "```",
    status || "(clean)",
    "```",
    ""
  ].join("\n");
  await writeFile(reportPath, report);

  console.log(`functional sweep opened ${baseUrl}`);
  console.log(`classification: ${classification}`);
  console.log(`report: ${path.relative(prototypeRoot, reportPath)}`);
  for (const check of checks) console.log(check);
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
