import { expect, test } from "@playwright/test";

// The stage editor's Trees layer. Woodcutting trees are authored inline in
// spawns.yaml `trees:` (a species `type` + a sub-tile position, no id/approach),
// so the layer uses the tile-suppress model (like Spawns) rather than the
// id-keyed node model (ore/herbs), and places at tile centres (x.5/y.5) so new
// trees read like the hand-authored floats. The editor writes ONLY its own
// placements + position-suppressions to content/trees.editor.yaml (merged at
// build). Driven via the ?__test seam; asserts the working set + save PAYLOAD
// only, without POSTing, so committed content is never mutated.

async function loadNorthwood(page: import("@playwright/test").Page) {
  await page.goto("/editor.html?__test=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as any).__ed?.stage(), null, { timeout: 10000 });
  await page.evaluate(() => (window as any).__ed.loadStage("northwood"));   // floor 3 — has trees
  await page.waitForFunction(
    () => (window as any).__ed.stage() === "northwood" && (window as any).__ed.floor() === 3,
    null, { timeout: 10000 });
  await page.evaluate(() => (window as any).__ed.setLayer("trees"));
}

test.describe("editor trees layer", () => {
  test("placing a species emits it at tile-centre coords in the save payload", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwood(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      const opt = ed.palette()[0];          // a tree species from tree-types.yaml
      ed.setPalette(opt.value);
      ed.place(46, 36);                      // an empty cell
      return { opt, placed: ed.entAt(46, 36), payload: ed.payload() };
    });

    expect(r.opt).toBeTruthy();
    expect(r.placed).toMatchObject({ x: 46.5, y: 36.5, source: "overlay", type: r.opt.value });
    expect(r.payload.overlay).toContainEqual({ type: r.opt.value, x: 46.5, y: 36.5 });
    expect(r.payload.removed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("moving a base tree suppresses its origin and re-emits it", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwood(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      const base = ed.entities().find((e: any) => e.source === "base");
      const from = { x: base.x, y: base.y, type: base.type };
      const cx = Math.floor(base.x), cy = Math.floor(base.y);
      ed.move(ed.entAt(cx, cy), cx + 2, cy + 2);
      return { from, moved: ed.entAt(cx + 2, cy + 2), payload: ed.payload() };
    });

    // The base origin (its exact authored float position) is suppressed, and the
    // tree reappears as an overlay placement at the new tile centre.
    expect(r.moved).toMatchObject({ source: "overlay", type: r.from.type });
    expect(r.payload.removed).toContainEqual({ x: r.from.x, y: r.from.y });
    expect(r.payload.overlay.some((o: any) => o.type === r.from.type)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("deleting a base tree suppresses it; deleting an overlay tree just drops it", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwood(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      const base = ed.entities().find((e: any) => e.source === "base");
      const baseAt = { x: base.x, y: base.y };
      const cx = Math.floor(base.x), cy = Math.floor(base.y);
      ed.del(ed.entAt(cx, cy));
      ed.setPalette(ed.palette()[0].value);
      ed.place(48, 38);
      ed.del(ed.entAt(48, 38));
      return { baseAt, gone: ed.entAt(cx, cy), overlayGone: ed.entAt(48, 38), payload: ed.payload() };
    });

    expect(r.gone).toBeNull();
    expect(r.overlayGone).toBeNull();
    expect(r.payload.removed).toContainEqual(r.baseAt);
    expect(r.payload.overlay).not.toContainEqual(expect.objectContaining({ x: 48.5, y: 38.5 }));
    expect(errors).toEqual([]);
  });
});
