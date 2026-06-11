import { expect, test } from "@playwright/test";

test("stage atlas lab previews a stage and applies live tile overrides", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/stage-atlas-lab.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).__atlasLab?.stage()), null, { timeout: 10000 });

  const initial = await page.evaluate(() => ({
    stage: (window as any).__atlasLab.stage(),
    sample: (window as any).__atlasLab.sample(),
    slots: (window as any).__atlasLab.slots(),
    overrides: (window as any).__atlasLab.overrides(),
    report: (window as any).__atlasLab.report()
  }));
  expect(initial.stage).toBe("bow-11-floor-0");
  expect(initial.sample).toMatchObject({ seed: 11, floorId: 0, worldSeed: 11 });
  expect(initial.slots).toBeGreaterThan(3);
  expect(initial.overrides).toBe(0);
  expect(initial.report).toContain("geometry: Bow Online CollisionMap.Generate");
  expect(initial.report).toContain("overrides: none");

  const changed = await page.evaluate(() => (window as any).__atlasLab.assignFirstDifferent());
  expect(changed).toBe(true);
  await expect(page.locator("#sampleInfo")).toContainText("1 override");
  await expect(page.locator("#slotList")).toContainText("->");

  const relevant = errors.filter((e) => !/favicon|net::ERR|WebGL warning/i.test(e));
  expect(relevant, relevant.join("\n")).toEqual([]);
});
