import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.TIB_E2E_PORT ?? "5173";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  // Block tests until the game server on :8787 is actually accepting connections
  // (webServer below only waits on vite :5173, which comes up first).
  globalSetup: "./tests/e2e/global-setup.ts",
  // One shared authoritative dev server backs every test, so parallel browser
  // workers race on world state and starve timing-sensitive specs. Run serially.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: process.env.TIB_E2E_PORT
      ? `E2E_TEST=1 concurrently "vite --host 127.0.0.1 --port ${e2ePort}" "node server/index.ts"`
      : "npm run dev:e2e",
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: false,
    timeout: 60000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } }
    }
  ]
});
