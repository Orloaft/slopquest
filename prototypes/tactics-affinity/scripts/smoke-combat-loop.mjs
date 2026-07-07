import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prototypeRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(prototypeRoot, "../..");
const viteBin = path.join(repoRoot, "node_modules/vite/bin/vite.js");
const artifactDir = path.join(prototypeRoot, "artifacts/pull-forced-movement-v1");
const pullScreenshotPath = path.join(artifactDir, "combat-pull-after.png");
const blockedScreenshotPath = path.join(artifactDir, "combat-blocked-forced-move.png");

async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
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

async function openPage(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Tactics Affinity MVP" }).waitFor({ state: "visible", timeout: 5000 });
  return page;
}

async function readState(page) {
  return page.evaluate(() => ({
    units: Array.from(document.querySelectorAll(".unit-token")).map((node) => node.getAttribute("aria-label") ?? ""),
    log: Array.from(document.querySelectorAll(".log-panel li")).map((node) => node.textContent?.trim() ?? ""),
    preview: document.querySelector(".preview")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
  }));
}

function requireSome(values, pattern, message) {
  if (!values.some((value) => pattern.test(value))) {
    throw new Error(`${message}: ${values.join(" | ")}`);
  }
}

async function clickCell(page, col, row) {
  await page.getByRole("button", { name: new RegExp(`Tile ${col},${row}`) }).click();
}

async function clickUnit(page, namePattern) {
  await page.locator(".unit-token").filter({ hasText: namePattern }).click();
}

async function selectRoster(page, namePattern) {
  await page.locator(".roster-card").filter({ hasText: namePattern }).click();
}

async function reset(page) {
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByText(/TIB Gathering tactics affinity MVP loaded/i).waitFor({ state: "visible", timeout: 5000 });
}

async function moveSelected(page, col, row) {
  await page.getByRole("button", { name: "Move" }).click();
  await clickCell(page, col, row);
  await page.getByRole("button", { name: "Commit" }).click();
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  const port = await pickPort();
  const server = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: prototypeRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let browser;
  const checks = [];
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch();
    const page = await openPage(browser, baseUrl);

    await selectRoster(page, /Tortollan/i);
    await page.getByRole("button", { name: /Arc Pull Fulgur secondary cost 2 AP available/i }).click();
    await clickUnit(page, /Oilbound Wrecker/i);
    await page.getByText(/Pull destination \(3, 3\) is plain; pull damage 1/i).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Commit" }).click();
    await page.getByText(/Oilbound Wrecker took 1 .*pulled to \(3, 3\) plain/i).waitFor({ state: "visible", timeout: 5000 });
    let state = await readState(page);
    requireSome(state.units, /Oilbound Wrecker HP 2\/3 AP 0\/0 at 3,3/i, "Arc Pull should move Wrecker one tile toward Tortollan");
    checks.push("PASS Arc Pull deals 1 and pulls an enemy toward the caster onto open terrain.");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: pullScreenshotPath, fullPage: false });

    await reset(page);
    await selectRoster(page, /Sprite/i);
    await moveSelected(page, 5, 5);
    await page.getByRole("button", { name: /Arc Pull Fulgur primary cost 1 AP available/i }).click();
    await clickUnit(page, /Cinder Guard/i);
    await page.getByText(/no legal pull destination is open: Destination is occupied/i).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Commit" }).click();
    await page.getByText(/Cinder Guard took 1 .*displacement blocked: Destination is occupied/i).waitFor({ state: "visible", timeout: 5000 });
    state = await readState(page);
    requireSome(state.units, /Cinder Guard HP 3\/4 AP 0\/0 at 5,4/i, "Blocked pull should not displace Cinder Guard");
    checks.push("PASS Pull rejects an occupied destination while still applying the action's 1 damage.");

    await reset(page);
    await selectRoster(page, /Sprite/i);
    await moveSelected(page, 4, 5);
    await page.getByRole("button", { name: /Force Push Terra secondary cost 2 AP available/i }).click();
    await clickUnit(page, /Cinder Guard/i);
    await page.getByText(/no legal push destination is open: The beacon blocks the destination/i).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Commit" }).click();
    await page.getByText(/Cinder Guard took 1 .*displacement blocked: The beacon blocks the destination/i).waitFor({ state: "visible", timeout: 5000 });
    state = await readState(page);
    requireSome(state.units, /Cinder Guard HP 3\/4 AP 0\/0 at 5,4/i, "Blocked push should not move through the beacon");
    checks.push("PASS Push rejects the objective as blocker terrain vocabulary in the browser combat path.");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: blockedScreenshotPath, fullPage: false });

    await page.getByText(/TIB Gathering Prototype/i).waitFor({ state: "visible", timeout: 5000 });
    await page.close();
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

  console.log(`combat smoke opened ${baseUrl}`);
  console.log(`pull screenshot: ${path.relative(prototypeRoot, pullScreenshotPath)}`);
  console.log(`blocked screenshot: ${path.relative(prototypeRoot, blockedScreenshotPath)}`);
  for (const check of checks) console.log(check);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
