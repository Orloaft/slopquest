import { defineConfig, devices } from "@playwright/test";

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
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "npm run dev:e2e",
    url: "http://127.0.0.1:5173",
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
