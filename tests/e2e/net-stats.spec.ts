import { expect, test, type Page } from "@playwright/test";

// Server sends `metrics` only ~once/second but state snapshots arrive every
// frame; mergeStateSnapshot must carry the last-known metrics forward, else the
// #netStats readout flickers to "net -" between updates. This samples it across
// several metrics intervals and asserts it never blanks once populated.
test("net-stats readout does not flicker to 'net -' between metrics updates", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Wait for the first real metrics readout to land.
  await page.waitForFunction(() => {
    const t = document.getElementById("netStats")?.textContent ?? "";
    return t.length > 0 && t !== "net -";
  });

  // Sample for ~3.5s (spans several 1s metrics intervals); it must never blank.
  const samples: string[] = [];
  for (let i = 0; i < 35; i += 1) {
    samples.push(await page.evaluate(() => document.getElementById("netStats")?.textContent ?? ""));
    await page.waitForTimeout(100);
  }
  const blanks = samples.filter((s) => s === "net -" || s.trim() === "");
  expect(blanks, `readout blanked ${blanks.length}/${samples.length} samples (flicker)`).toEqual([]);
  // And it stayed a real metrics line the whole time (full readout starts "zone ...").
  expect(samples.every((s) => s.startsWith("zone "))).toBe(true);
});

function logErrors(page: Page): void {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
}

async function join(page: Page): Promise<void> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
}
