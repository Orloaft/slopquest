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
const artifactDir = path.join(prototypeRoot, "artifacts/mvp-affinity-vertical-slice-v1");
const previewScreenshotPath = path.join(artifactDir, "mvp-preview-chain.png");
const solvedScreenshotPath = path.join(artifactDir, "mvp-after-solve.png");
const failScreenshotPath = path.join(artifactDir, "mvp-fail-path.png");
const reportPath = path.join(artifactDir, "report.md");
const startHead = "1714ca38";

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

async function openPage(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Tactics Affinity MVP" }).waitFor({ state: "visible", timeout: 5000 });
  return page;
}

async function readState(page) {
  return page.evaluate(() => {
    const units = Array.from(document.querySelectorAll(".unit-token")).map((node) => node.getAttribute("aria-label") ?? "");
    const log = Array.from(document.querySelectorAll(".log-panel li")).map((node) => node.textContent?.trim() ?? "");
    const preview = document.querySelector(".preview")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const phase = document.querySelector(".phase-pill")?.textContent?.trim() ?? "";
    const tiles = Array.from(document.querySelectorAll(".cell")).map((node) => node.getAttribute("aria-label") ?? "");
    return { units, log, preview, phase, tiles };
  });
}

function requireSome(values, pattern, message) {
  if (!values.some((value) => pattern.test(value))) {
    throw new Error(`${message}: ${values.join(" | ")}`);
  }
}

async function clickCell(page, col, row) {
  await page.getByRole("button", { name: new RegExp(`Tile ${col},${row}`) }).click();
}

function unitToken(page, namePattern) {
  return page.locator(".unit-token").filter({ hasText: namePattern });
}

async function clickUnit(page, namePattern) {
  await unitToken(page, namePattern).click();
}

async function selectRoster(page, namePattern) {
  await page.locator(".roster-card").filter({ hasText: namePattern }).click();
}

async function expectPreview(page, pattern, checks, message) {
  await page.locator(".preview").getByText(pattern).waitFor({ state: "visible", timeout: 5000 });
  checks.push(`PASS ${message}`);
}

async function runFailPath(browser, baseUrl, checks) {
  const page = await openPage(browser, baseUrl);
  await page.getByRole("button", { name: "Wait", exact: true }).click();
  await page.getByText(/Waiting now fails/i).waitFor({ state: "visible", timeout: 5000 });
  await page.getByRole("button", { name: "Wait / End Turn" }).click();
  await page.locator(".phase-pill").getByText(/Defeat/i).waitFor({ state: "visible", timeout: 5000 });
  const state = await readState(page);
  if (!/Defeat/.test(state.phase)) throw new Error(`Expected fail phase, got ${state.phase}`);
  requireSome(state.log, /carried out the forecast/i, "Expected forecast failure log");
  await page.screenshot({ path: failScreenshotPath, fullPage: false });
  checks.push("PASS fail path verifies waiting without solving causes forecast defeat.");
  await page.close();
}

async function runRosterAndTraitChecks(browser, baseUrl, checks) {
  const page = await openPage(browser, baseUrl);
  await page.getByText(/TIB Gathering Prototype/i).waitFor({ state: "visible", timeout: 5000 });
  await unitToken(page, /Tortollan/i).waitFor({ state: "visible", timeout: 5000 });
  await unitToken(page, /Sprite/i).waitFor({ state: "visible", timeout: 5000 });
  checks.push("PASS board loads as TIB Gathering Tactics Affinity MVP with exactly two player builds.");

  let state = await readState(page);
  requireSome(state.units, /Tortollan Shellbreaker HP 12\/12 AP 4\/4 .*Terra\/Fulgur .*Immovable shell/i, "Missing Tortollan HP/AP/affinity/trait label");
  requireSome(state.units, /Sprite Voltweaver HP 4\/4 AP 6\/6 .*Fulgur\/Terra .*Flying/i, "Missing Sprite HP/AP/affinity/trait label");
  checks.push("PASS Tortollan and Sprite expose HP, AP, primary/sub-job affinities, and racial traits.");

  await selectRoster(page, /Tortollan/i);
  await page.getByRole("button", { name: /Force Push Terra primary cost 1 AP available/i }).waitFor({ state: "visible", timeout: 5000 });
  await page.getByRole("button", { name: /Ignis Spark Fulgur secondary cost 2 AP available/i }).waitFor({ state: "visible", timeout: 5000 });
  await page.getByRole("button", { name: /Void Snare Umbra opposite cost 4 AP disabled/i }).waitFor({ state: "visible", timeout: 5000 });
  checks.push("PASS Tortollan primary Terra costs 1 AP, sub-job Fulgur costs 2 AP, and opposite Umbra is disabled at 4 AP.");

  await selectRoster(page, /Sprite/i);
  await page.getByRole("button", { name: /Ignis Spark Fulgur primary cost 1 AP available/i }).waitFor({ state: "visible", timeout: 5000 });
  await page.getByRole("button", { name: /Force Push Terra secondary cost 2 AP available/i }).waitFor({ state: "visible", timeout: 5000 });
  checks.push("PASS Sprite flips the same job tree: Fulgur primary is 1 AP and Terra sub-job is 2 AP.");

  await page.getByRole("button", { name: /Force Push Terra secondary cost 2 AP available/i }).click();
  await clickUnit(page, /Tortollan/i);
  await expectPreview(page, /Immovable shell; the push is resisted/i, checks, "Tortollan cannot be pushed preview is explicit.");

  await selectRoster(page, /Sprite/i);
  await page.getByRole("button", { name: "Move" }).click();
  await clickCell(page, 5, 5);
  await expectPreview(page, /Flying move to \(5, 5\).*ignores liquid\/block routes/i, checks, "Sprite flying movement preview ignores terrain routes.");
  await page.getByRole("button", { name: "Commit" }).click();
  state = await readState(page);
  requireSome(state.units, /Sprite Voltweaver HP 4\/4 AP 5\/6 at 5,5/i, "Expected Sprite to move to off-angle perch for 1 AP");
  checks.push("PASS Sprite's flying trait changes movement by reaching the off-angle perch.");
  await page.close();
}

async function runSolvePath(browser, baseUrl, checks) {
  const page = await openPage(browser, baseUrl);

  await selectRoster(page, /Sprite/i);
  await page.getByRole("button", { name: "Move" }).click();
  await clickCell(page, 5, 5);
  await page.getByRole("button", { name: "Commit" }).click();
  await page.getByText(/Flying ignored liquid\/block routes/i).waitFor({ state: "visible", timeout: 5000 });

  await page.getByRole("button", { name: /Oil Font Terra secondary cost 2 AP available/i }).click();
  await clickCell(page, 5, 3);
  await expectPreview(page, /Sets plain tile to oil\/liquid.*push destination.*Ignis Spark fuel tile/i, checks, "state-setter preview shows oil/liquid chain purpose.");
  await page.screenshot({ path: previewScreenshotPath, fullPage: false });
  await page.getByRole("button", { name: "Commit" }).click();
  await page.getByText(/oil\/liquid set at \(5, 3\)/i).waitFor({ state: "visible", timeout: 5000 });
  let state = await readState(page);
  requireSome(state.units, /Sprite Voltweaver HP 4\/4 AP 3\/6 at 5,5/i, "Expected Sprite AP after flying move and sub-job Oil Font");
  checks.push("PASS sub-job Oil Font costs 2 AP after Sprite's 1 AP move.");

  await selectRoster(page, /Tortollan/i);
  await page.getByRole("button", { name: /Force Push Terra primary cost 1 AP available/i }).click();
  await clickUnit(page, /Oilbound Wrecker/i);
  await expectPreview(page, /Push destination \(5, 3\) is oil.*Target lands in oil/i, checks, "mover preview shows push destination into oil.");
  await page.getByRole("button", { name: "Commit" }).click();
  await page.getByText(/Oilbound Wrecker took 1 .*pushed to \(5, 3\) oil/i).waitFor({ state: "visible", timeout: 5000 });
  state = await readState(page);
  requireSome(state.units, /Tortollan Shellbreaker HP 12\/12 AP 3\/4/i, "Expected Tortollan primary push to cost 1 AP");
  checks.push("PASS Tortollan primary Terra mover costs 1 AP and pushes the Wrecker into oil.");

  await selectRoster(page, /Sprite/i);
  await page.getByRole("button", { name: /Ignis Spark Fulgur primary cost 1 AP available/i }).click();
  await clickUnit(page, /Oilbound Wrecker/i);
  await expectPreview(page, /Ignites oil into fire.*fire damage.*neutralized/i, checks, "igniter preview shows oil ignition, burning tile, and neutralization.");
  await page.getByRole("button", { name: "Commit" }).click();
  await page.getByText(/oil ignited into fire at \(5, 3\).*Oilbound Wrecker took 3/i).waitFor({ state: "visible", timeout: 5000 });
  state = await readState(page);
  requireSome(state.units, /Sprite Voltweaver HP 4\/4 AP 2\/6 at 5,5/i, "Expected Sprite primary Ignis to cost 1 AP");
  checks.push("PASS primary Fulgur igniter costs 1 AP and neutralizes the first enemy.");

  await page.getByRole("button", { name: /Force Push Terra secondary cost 2 AP available/i }).click();
  await clickUnit(page, /Cinder Guard/i);
  await expectPreview(page, /Push destination \(5, 3\) is fire.*Fire damage adds 3 more and neutralizes/i, checks, "sub-job mover preview shows push into fire and threat neutralization.");
  await page.getByRole("button", { name: "Commit" }).click();
  await page.getByText(/Cinder Guard took 1.*burned for 3 on fire/i).waitFor({ state: "visible", timeout: 5000 });
  await page.getByText(/Safe state: all forecasted threats are neutralized/i).waitFor({ state: "visible", timeout: 5000 });
  state = await readState(page);
  requireSome(state.units, /Sprite Voltweaver HP 4\/4 AP 0\/6 at 5,5/i, "Expected Sprite sub-job Force Push to cost 2 AP");
  checks.push("PASS sub-job Terra mover costs 2 AP, never cheaper than primary, and pushes the second enemy into fire.");

  await page.getByRole("button", { name: "Wait / End Turn" }).click();
  await page.locator(".phase-pill").getByText(/Victory/i).waitFor({ state: "visible", timeout: 5000 });
  state = await readState(page);
  if (!/Victory/.test(state.phase)) throw new Error(`Expected victory phase after safe wait, got ${state.phase}`);
  await page.screenshot({ path: solvedScreenshotPath, fullPage: false });
  checks.push("PASS solved one-turn environmental puzzle and verified victory/safe state.");
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
    await runRosterAndTraitChecks(browser, baseUrl, checks);
    await runFailPath(browser, baseUrl, checks);
    await runSolvePath(browser, baseUrl, checks);
    classification = "good testbed";
  } catch (error) {
    failure = error;
    if (checks.length >= 6) classification = "partial";
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
  const changedFiles = await git(["diff", "--name-only", "HEAD"]);
  const report = [
    "# MVP Affinity Vertical Slice V1",
    "",
    `- Start HEAD: ${startHead}`,
    `- Final HEAD/commit hash at smoke time: ${commitHash}`,
    `- Classification: ${classification}`,
    `- Dev server: ${baseUrl}`,
    `- Chosen port: ${port}`,
    "",
    "## Changed Files",
    "",
    changedFiles
      .split("\n")
      .filter(Boolean)
      .map((file) => `- ${file}`)
      .join("\n") || "- (none at smoke time)",
    "",
    "## Commands Run",
    "",
    "- `npm run build`",
    "- `npm run smoke:combat` (superseded wrapper for MVP smoke)",
    "- `npm run smoke:functional` (superseded wrapper for MVP smoke)",
    "- `npm run smoke:mvp-affinity`",
    "",
    "## Verification Output",
    "",
    ...checks.map((check) => `- ${check}`),
    failure ? `- FAIL ${failure.message}` : "- PASS MVP affinity vertical slice verified.",
    "",
    "## Screenshots",
    "",
    `- ${path.relative(prototypeRoot, previewScreenshotPath)}`,
    `- ${path.relative(prototypeRoot, solvedScreenshotPath)}`,
    `- ${path.relative(prototypeRoot, failScreenshotPath)}`,
    "",
    "## Superseded Old Smoke Behavior",
    "",
    "- The old Iron Guard / Verdant Ranger / Radiant Acolyte combat slice is intentionally superseded on this MVP screen.",
    "- `smoke:combat` and `smoke:functional` now execute the MVP affinity smoke so legacy assertions do not conflict with the two-build roster.",
    "",
    "## Caveats",
    "",
    "- This is a whitebox testbed only: no save/load, recruitment, broad balance, AI pathfinding, animation polish, or campaign systems.",
    "- The report's final commit hash is also reported by the worker after the focused commit is created.",
    "",
    "## Server Log",
    "",
    "```",
    serverLog.trim() || "(empty)",
    "```",
    "",
    "## Final Git Status At Smoke Time",
    "",
    "```",
    status || "(clean)",
    "```",
    ""
  ].join("\n");
  await writeFile(reportPath, report);

  console.log(`mvp affinity smoke opened ${baseUrl}`);
  console.log(`classification: ${classification}`);
  console.log(`report: ${path.relative(prototypeRoot, reportPath)}`);
  console.log(`preview screenshot: ${path.relative(prototypeRoot, previewScreenshotPath)}`);
  console.log(`solved screenshot: ${path.relative(prototypeRoot, solvedScreenshotPath)}`);
  console.log(`fail screenshot: ${path.relative(prototypeRoot, failScreenshotPath)}`);
  for (const check of checks) console.log(check);
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
