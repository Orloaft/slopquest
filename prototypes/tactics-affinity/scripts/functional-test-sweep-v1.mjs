import { chromium } from "@playwright/test";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prototypeRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(prototypeRoot, "../..");
const viteBin = path.join(repoRoot, "node_modules/vite/bin/vite.js");

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

async function clickCell(page, col, row) {
  await page.getByRole("button", { name: new RegExp(`Tile ${col},${row}`) }).click();
}

async function selectRoster(page, namePattern) {
  await page.locator(".roster-card").filter({ hasText: namePattern }).click();
}

async function main() {
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await page.getByText(/TIB Gathering Prototype/i).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("heading", { name: "Tactics Affinity MVP" }).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: /Arc Pull Fulgur primary cost 1 AP available/i }).waitFor({ state: "visible", timeout: 5000 });
    checks.push("PASS functional load exposes TIB Gathering HUD, MVP title, and the playable Arc Pull action.");

    await page.locator(".unit-token").filter({ hasText: /Cinder Guard/i }).click();
    await page.getByText(/Cannot set oil under a standing unit/i).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Commit" }).click();
    await page.getByText(/Oil Font blocked: occupied tiles cannot receive liquid/i).waitFor({ state: "visible", timeout: 5000 });
    checks.push("PASS cell-target actions still reject occupied cells after adding pull.");

    await page.getByRole("button", { name: "Reset" }).click();
    await selectRoster(page, /Tortollan/i);
    await page.getByRole("button", { name: "Move" }).click();
    await clickCell(page, 3, 1);
    await page.getByText(/grounded and cannot enter block terrain/i).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Commit" }).click();
    await page.getByText(/Move blocked: Tortollan is grounded and cannot enter block terrain/i).waitFor({ state: "visible", timeout: 5000 });
    checks.push("PASS grounded movement continues to use blocker terrain vocabulary.");

    await selectRoster(page, /Sprite/i);
    await page.getByRole("button", { name: "Move" }).click();
    await clickCell(page, 3, 1);
    await page.getByText(/Flying move to \(3, 1\).*ignores liquid\/block routes/i).waitFor({ state: "visible", timeout: 5000 });
    checks.push("PASS flying movement preview still distinguishes route-blocking terrain from forced movement blockers.");
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

  console.log(`functional smoke opened ${baseUrl}`);
  for (const check of checks) console.log(check);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
