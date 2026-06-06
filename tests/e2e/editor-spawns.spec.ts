import { expect, test } from "@playwright/test";

// The stage editor's Spawns layer: place/move/delete enemy spawn points on the
// grid. Base spawns come from spawns.yaml; the editor writes ONLY its own
// placements + suppressions to content/spawns.editor.yaml (merged at build time),
// so the hand-authored file is never rewritten. We drive the layer through the
// ?__test seam and assert the in-memory working set + the save PAYLOAD — without
// POSTing, so committed content is never mutated by the test.

async function loadNorthwood(page: import("@playwright/test").Page) {
  await page.goto("/editor.html?__test=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as any).__ed?.stage(), null, { timeout: 10000 });
  await page.evaluate(() => (window as any).__ed.loadStage("northwood"));
  await page.waitForFunction(
    () => (window as any).__ed.stage() === "northwood" && (window as any).__ed.floor() === 3,
    null, { timeout: 10000 });
}

test.describe("editor spawns layer", () => {
  test("places an overlay spawn and emits it in the save payload", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwood(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      ed.setLayer("spawns");
      // a tile with no existing base spawn
      ed.placeSpawn(45, 35);
      const placed = ed.spawnAt(45, 35);
      return { placed, payload: ed.spawnPayload() };
    });

    expect(r.placed).toMatchObject({ x: 45, y: 35, source: "overlay" });
    expect(r.payload.overlay).toContainEqual({ type: r.placed.type, x: 45, y: 35 });
    expect(r.payload.removed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("moving a base spawn suppresses its origin and re-emits it as an overlay placement", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwood(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      ed.setLayer("spawns");
      // pick any base spawn the server sent for this floor
      const base = ed.spawns().find((s: any) => s.source === "base");
      const from = { x: base.x, y: base.y, type: base.type };
      ed.moveSpawnTo(ed.spawnAt(base.x, base.y), base.x + 3, base.y + 3);
      return { from, moved: ed.spawnAt(from.x + 3, from.y + 3), payload: ed.spawnPayload() };
    });

    // The base origin is suppressed, and the spawn reappears as an overlay placement.
    expect(r.moved).toMatchObject({ x: r.from.x + 3, y: r.from.y + 3, source: "overlay" });
    expect(r.payload.removed).toContainEqual({ x: r.from.x, y: r.from.y });
    expect(r.payload.overlay).toContainEqual({ type: r.from.type, x: r.from.x + 3, y: r.from.y + 3 });
    expect(errors).toEqual([]);
  });

  test("deleting a base spawn suppresses it; deleting an overlay spawn just drops it", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwood(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      ed.setLayer("spawns");
      const base = ed.spawns().find((s: any) => s.source === "base");
      const baseAt = { x: base.x, y: base.y };
      ed.deleteSpawn(ed.spawnAt(base.x, base.y));
      ed.placeSpawn(48, 38);
      ed.deleteSpawn(ed.spawnAt(48, 38));
      return { baseAt, gone: ed.spawnAt(base.x, base.y), overlayGone: ed.spawnAt(48, 38), payload: ed.spawnPayload() };
    });

    expect(r.gone).toBeNull();
    expect(r.overlayGone).toBeNull();
    // deleted base → suppressed; deleted overlay → not in overlay, no suppression
    expect(r.payload.removed).toContainEqual(r.baseAt);
    expect(r.payload.overlay).not.toContainEqual(expect.objectContaining({ x: 48, y: 38 }));
    expect(errors).toEqual([]);
  });
});
